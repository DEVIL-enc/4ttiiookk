const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(cookieParser());
app.use(cors());

// ===================================
// 🌍 SHARED ARRAY BUFFER HEADERS (Required for FFmpeg.wasm)
// ===================================
app.use((req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    next();
});

// ===================================
// 🛡️ SECURITY MIDDLEWARE (Engine) - MUST BE BEFORE STATIC
// ===================================
app.use('/lib', (req, res, next) => {
    // Only protect FFmpeg core files
    if (req.path.includes('ffmpeg-core.wasm') || req.path.includes('ffmpeg-core.worker.js')) {
        const token = req.cookies.flowtik_token;
        if (!token) {
            console.log(`[Server] Blocked access to ${req.originalUrl}`);
            return res.status(403).json({ error: "Unauthorized access to engine" });
        }
    }
    next();
});

// Explicitly serve lib files after check
app.use('/lib', express.static(path.join(__dirname, 'lib'), {
    maxAge: '1y', // Cache control for performance
    immutable: true
}));

// Serve other Static Files (Public) - AFTER /lib protection
app.use(express.static(__dirname));

// ===================================
// 🔍 DEBUGGING: Check files on startup
// ===================================
// Helper to debug file existence
const fs = require('fs');
try {
    const libPath = path.join(__dirname, 'lib');
    if (fs.existsSync(libPath)) {
        console.log("📂 Lib Directory Contents:", fs.readdirSync(libPath));
    } else {
        console.error("❌ 'lib' directory DOES NOT EXIST. Build script might have failed.");
    }
} catch (e) {
    console.error("Debug Error:", e);
}

// ===================================
// 🔑 API ROUTES (Shared Logic)
// ===================================

const JSONBIN_API_KEY = process.env.JSONBIN_API_KEY;
const JSONBIN_BIN_ID = process.env.JSONBIN_BIN_ID;

// Helper: Fetch Licenses
async function fetchLicenses() {
    if (!JSONBIN_API_KEY || !JSONBIN_BIN_ID) throw new Error("Missing Env Config");

    // Dynamic import for fetch in CommonJS if needed, or use native fetch in Node 18+
    // Assuming Node 18+ (common in Render/Vercel)
    const response = await fetch(`https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}/latest`, {
        headers: { 'X-Master-Key': JSONBIN_API_KEY }
    });

    if (!response.ok) throw new Error("JSONBin Fetch Failed");

    const data = await response.json();
    let licenses = [];

    // Normalize Structure
    if (Array.isArray(data.record)) licenses = data.record;
    else if (data.record && Array.isArray(data.record.licenses)) licenses = data.record.licenses;
    else if (Array.isArray(data.record?.licenses)) licenses = data.record.licenses;
    else if (Array.isArray(data)) licenses = data;
    else if (data && typeof data === 'object' && data.record) {
        if (Array.isArray(Object.values(data.record)[0])) licenses = Object.values(data.record)[0];
        else licenses = [data.record];
    }
    return { licenses, data }; // Return entire data to preserve structure if needed
}

// 1. Validate License
app.post('/api/validate-license', async (req, res) => {
    try {
        const { licenseKey, deviceId } = req.body;
        const userAgent = req.headers['user-agent'] || 'Server';

        if (!licenseKey || !deviceId) return res.status(400).json({ valid: false, error: 'Missing Data' });

        const { licenses } = await fetchLicenses();
        const normalize = k => k ? k.trim().toUpperCase() : '';
        const index = licenses.findIndex(l => normalize(l.key) === normalize(licenseKey));

        if (index === -1) return res.json({ valid: false, error: 'invalidLicense', message: 'لايوجد اشتراك' });

        const license = licenses[index];
        const now = new Date();

        // Activate
        if (!license.activated_on) {
            license.activated_on = now.toISOString();
            license.device_hash = deviceId;
            license.device_name = simplifyUserAgent(userAgent);
            license.processed_videos = 0;
            if (license.duration_days) {
                const exp = new Date();
                exp.setDate(now.getDate() + license.duration_days);
                license.expires_at = exp.toISOString();
            }
        }

        // Checks
        if (license.device_hash && license.device_hash !== deviceId) {
            return res.json({ valid: false, error: 'deviceMismatch', message: '⛔️ جهاز مختلف ⛔️' });
        }
        if (license.expires_at && new Date(license.expires_at) < now) {
            return res.json({ valid: false, error: 'expired', message: '⛔️ انتهى الاشتراك ⛔️' });
        }

        // Update Usage
        license.processed_videos = (license.processed_videos || 0) + 1;
        licenses[index] = license;

        // Save
        await fetch(`https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}`, {
            method: 'PUT',
            headers: { 'X-Master-Key': JSONBIN_API_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ licenses })
        });

        // Token
        const token = Buffer.from(`${license.key}:${deviceId}:${Date.now()}`).toString('base64');
        res.cookie('flowtik_token', token, { httpOnly: true, sameSite: 'strict', maxAge: 24 * 60 * 60 * 1000 });

        res.json({
            valid: true,
            license: {
                key: license.key,
                plan: license.plan,
                expiresAt: license.expires_at,
                activatedAt: license.activated_on,
                processed_videos: license.processed_videos,
                device_name: license.device_name
            }
        });

    } catch (e) {
        console.error(e);
        res.status(500).json({ valid: false, error: 'server_error' });
    }
});

// 2. Check Session
app.post('/api/check-session', async (req, res) => {
    try {
        const { licenseKey, deviceId } = req.body;
        if (!licenseKey || !deviceId) return res.status(400).json({ valid: false });

        const { licenses } = await fetchLicenses();
        const normalize = k => k ? k.trim().toUpperCase() : '';
        const license = licenses.find(l => normalize(l.key) === normalize(licenseKey));

        if (!license) return res.json({ valid: false, error: 'deleted' });
        if (license.device_hash !== deviceId) return res.json({ valid: false, error: 'deviceMismatch' });
        if (new Date(license.expires_at) < new Date()) return res.json({ valid: false, error: 'expired' });

        // Renew Token
        const token = Buffer.from(`${license.key}:${deviceId}:${Date.now()}`).toString('base64');
        res.cookie('flowtik_token', token, { httpOnly: true, sameSite: 'strict', maxAge: 24 * 60 * 60 * 1000 });

        res.json({
            valid: true,
            license: {
                key: license.key,
                plan: license.plan,
                expiresAt: license.expires_at,
                remainingDays: Math.ceil((new Date(license.expires_at) - new Date()) / (1000 * 60 * 60 * 24)),
                processed_videos: license.processed_videos,
                device_name: license.device_name,
                activated_on: license.activated_on
            }
        });

    } catch (e) {
        console.error(e);
        res.status(500).json({ valid: false, error: 'server_error' });
    }
});


// Helper
function simplifyUserAgent(ua) {
    if (/iPhone|iPad|iPod/.test(ua)) return 'Apple Device';
    if (/Android/.test(ua)) return 'Android Device';
    if (/Windows/.test(ua)) return 'Windows PC';
    if (/Mac/.test(ua)) return 'Mac Computer';
    return 'Unknown Device';
}

// Start Server
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📂 Serving static files from ${__dirname}`);
});
