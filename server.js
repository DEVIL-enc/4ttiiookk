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
// 🛡️ SECURITY MIDDLEWARE (Engine)
// ===================================
app.use('/lib', (req, res, next) => {
    if (req.path.includes('ffmpeg-core.wasm') || req.path.includes('ffmpeg-core.worker.js')) {
        const token = req.cookies.flowtik_token;
        if (!token) {
            console.log(`[Server] Blocked access to ${req.originalUrl}`);
            return res.status(403).json({ error: "Unauthorized access to engine" });
        }
    }
    next();
});

app.use('/lib', express.static(path.join(__dirname, 'lib'), {
    maxAge: '1y',
    immutable: true
}));


// ===================================
// 🔒 DOWNLOAD PROTECTION MIDDLEWARE
// ===================================
app.use((req, res, next) => {

    // السماح لهذه المسارات فقط بدون فحص
    if (
        req.path === "/" ||
        req.path === "/login.html" ||
        req.path.startsWith("/api/")
    ) {
        return next();
    }

    const token = req.cookies.flowtik_token;

    // بدون تسجيل دخول
    if (!token) {

        if (req.path === "/index.html") {
            return res.sendFile(path.join(__dirname, "login.html"));
        }

        return res.status(404).send("Cannot GET /login");
    }

    // منع فتح الملفات مباشرة بالرابط
    const referer = req.headers.referer || "";

    if (!referer.includes(req.headers.host)) {

        if (req.path === "/index.html") {
            return res.sendFile(path.join(__dirname, "login.html"));
        }

        return res.status(404).send("Cannot GET /login");
    }

    next();

});


// Serve static files AFTER protection
app.use(express.static(__dirname));


// ===================================
// 🔍 DEBUGGING: Check files on startup
// ===================================
const fs = require('fs');
try {
    const libPath = path.join(__dirname, 'lib');
    if (fs.existsSync(libPath)) {
        console.log("📂 Lib Directory Contents:", fs.readdirSync(libPath));
    } else {
        console.error("❌ 'lib' directory DOES NOT EXIST.");
    }
} catch (e) {
    console.error("Debug Error:", e);
}


// ===================================
// 🔑 API ROUTES (Shared Logic)
// ===================================

const JSONBIN_API_KEY = "$2a$10$BV..TadGPZnl8Hs6rUs4h.kJFEnRDmK6YPqd8onbIEhfCKSixLI66";
const JSONBIN_BIN_ID = "69c7236dc3097a1dd56a6836";

async function fetchLicenses() {

    const response = await fetch(
        `https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}/latest`,
        {
            headers: { 'X-Master-Key': JSONBIN_API_KEY }
        }
    );

    if (!response.ok) throw new Error("JSONBin Fetch Failed");

    const data = await response.json();
    let licenses = [];

    if (Array.isArray(data.record)) licenses = data.record;
    else if (data.record && Array.isArray(data.record.licenses)) licenses = data.record.licenses;
    else if (Array.isArray(data.record?.licenses)) licenses = data.record.licenses;
    else if (Array.isArray(data)) licenses = data;
    else if (data && typeof data === 'object' && data.record) {
        if (Array.isArray(Object.values(data.record)[0])) licenses = Object.values(data.record)[0];
        else licenses = [data.record];
    }

    return { licenses, data };
}


// Validate License
app.post('/api/validate-license', async (req, res) => {

    try {

        const { licenseKey, deviceId } = req.body;
        const userAgent = req.headers['user-agent'] || 'Server';

        if (!licenseKey || !deviceId)
            return res.status(400).json({ valid: false, error: 'Missing Data' });

        const { licenses } = await fetchLicenses();

        const normalize = k => k ? k.trim().toUpperCase() : '';
        const index = licenses.findIndex(l => normalize(l.key) === normalize(licenseKey));

        if (index === -1)
            return res.json({ valid: false, error: 'invalidLicense', message: 'لايوجد اشتراك' });

        const license = licenses[index];
        const now = new Date();

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

        if (license.device_hash && license.device_hash !== deviceId)
            return res.json({ valid: false, error: 'deviceMismatch', message: 'المفتاح مرتبط بجهاز مختلف' });

        if (license.expires_at && new Date(license.expires_at) < now)
            return res.json({ valid: false, error: 'expired', message: 'انتهت صلاحية المفتاح ' });

        license.processed_videos = (license.processed_videos || 0) + 1;
        licenses[index] = license;

        await fetch(`https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}`, {
            method: 'PUT',
            headers: {
                'X-Master-Key': JSONBIN_API_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ licenses })
        });

        const token = Buffer.from(`${license.key}:${deviceId}:${Date.now()}`).toString('base64');

        res.cookie('flowtik_token', token, {
            httpOnly: true,
            sameSite: 'strict',
            maxAge: 24 * 60 * 60 * 1000
        });

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
