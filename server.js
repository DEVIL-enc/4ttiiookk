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
// SHARED ARRAY BUFFER HEADERS (Required for FFmpeg.wasm)
// ===================================
app.use((req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    next();
});


// ===================================
// ENGINE PROTECTION
// ===================================
app.use('/lib', (req, res, next) => {

    if (
        req.path.includes('ffmpeg-core.wasm') ||
        req.path.includes('ffmpeg-core.worker.js')
    ) {

        const token = req.cookies.flowtik_token;

        if (!token) {
            return res.status(403).json({
                error: "Unauthorized access to engine"
            });
        }
    }

    next();

});

app.use('/lib', express.static(path.join(__dirname, 'lib'), {
    maxAge: '1y',
    immutable: true
}));


// ===================================
// BLOCK DIRECT FILE ACCESS
// ===================================
app.use((req, res, next) => {

    // السماح لصفحة الدخول
    if (
        req.path === "/" ||
        req.path === "/login.html"
    ) {
        return next();
    }

    // السماح لـ API
    if (req.path.startsWith("/api/")) {
        return next();
    }

    const token = req.cookies.flowtik_token;

    // إذا غير مسجل دخول
    if (!token) {

        if (req.path === "/index.html") {
            return res.sendFile(path.join(__dirname, "login.html"));
        }

        return res.status(404).send("Cannot GET /login");
    }

    // منع أدوات السحب
    const ua = (req.headers["user-agent"] || "").toLowerCase();

    const blockedAgents = [
        "curl",
        "wget",
        "python",
        "axios",
        "postman",
        "scrapy",
        "httpclient"
    ];

    if (blockedAgents.some(agent => ua.includes(agent))) {

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
// JSONBIN CONFIG
// ===================================
const JSONBIN_API_KEY = "$2a$10$BV..TadGPZnl8Hs6rUs4h.kJFEnRDmK6YPqd8onbIEhfCKSixLI66";
const JSONBIN_BIN_ID = "69c7236dc3097a1dd56a6836";


// Helper: Fetch Licenses
async function fetchLicenses() {

    const response = await fetch(
        `https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}/latest`,
        {
            headers: { 'X-Master-Key': JSONBIN_API_KEY }
        }
    );

    if (!response.ok)
        throw new Error("JSONBin Fetch Failed");

    const data = await response.json();

    let licenses = [];

    if (Array.isArray(data.record)) licenses = data.record;
    else if (data.record?.licenses) licenses = data.record.licenses;
    else if (Array.isArray(data)) licenses = data;
    else if (data.record) licenses = [data.record];

    return { licenses };

}


// Validate License
app.post('/api/validate-license', async (req, res) => {

    try {

        const { licenseKey, deviceId } = req.body;
        const userAgent = req.headers['user-agent'] || 'Server';

        if (!licenseKey || !deviceId)
            return res.status(400).json({
                valid: false,
                error: 'Missing Data'
            });

        const { licenses } = await fetchLicenses();

        const normalize = k =>
            k ? k.trim().toUpperCase() : '';

        const index = licenses.findIndex(
            l => normalize(l.key) === normalize(licenseKey)
        );

        if (index === -1)
            return res.json({
                valid: false,
                error: 'invalidLicense',
                message: 'لايوجد اشتراك'
            });

        const license = licenses[index];
        const now = new Date();

        if (
            license.device_hash &&
            license.device_hash !== deviceId
        ) {

            return res.json({
                valid: false,
                error: 'deviceMismatch',
                message: 'المفتاح مرتبط بجهاز مختلف'
            });

        }

        if (
            license.expires_at &&
            new Date(license.expires_at) < now
        ) {

            return res.json({
                valid: false,
                error: 'expired',
                message: 'انتهت صلاحية المفتاح '
            });

        }

        const token = Buffer.from(
            `${license.key}:${deviceId}:${Date.now()}`
        ).toString('base64');

        res.cookie(
            'flowtik_token',
            token,
            {
                httpOnly: true,
                sameSite: 'lax',
                maxAge: 24 * 60 * 60 * 1000
            }
        );

        res.json({ valid: true });

    }

    catch (e) {

        console.error(e);

        res.status(500).json({
            valid: false,
            error: 'server_error'
        });

    }

});


// Start Server
app.listen(PORT, () => {

    console.log(`🚀 Server running on http://localhost:${PORT}`);

});
