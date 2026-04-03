const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

// حل مشكلة fetch على Render
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const app = express();
const PORT = process.env.PORT || 3000;


// =============================
// BASIC MIDDLEWARE
// =============================
app.use(express.json());
app.use(cookieParser());
app.use(cors());


// =============================
// SECURITY HEADERS
// =============================
app.use((req, res, next) => {

    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');

    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-Content-Type-Options", "nosniff");

    next();

});


// =============================
// GLOBAL ACCESS PROTECTION
// =============================
app.use((req, res, next) => {

    const pathAllowed =
        req.path === "/" ||
        req.path === "/index.html" ||
        req.path === "/login.html" ||
        req.path.startsWith("/api/validate-license") ||
        req.path.startsWith("/api/check-session");

    if (pathAllowed) {
        return next();
    }

    const token = req.cookies.flowtik_token;

    if (!token) {
        return res.status(404).send("Cannot GET /login");
    }

    if (req.method === "GET") {

        const referer = req.headers.referer || "";
        const host = req.headers.host || "";

        if (referer && !referer.includes(host)) {
            return res.status(404).send("Cannot GET /login");
        }

    }

    const userAgent = (req.headers["user-agent"] || "").toLowerCase();

    const blockedAgents = [
        "curl",
        "wget",
        "python",
        "node-fetch",
        "axios",
        "postman",
        "scrapy",
        "httpclient"
    ];

    if (blockedAgents.some(a => userAgent.includes(a))) {
        return res.status(404).send("Cannot GET /login");
    }

    next();

});


// =============================
// ENGINE PROTECTION (lib)
// =============================
app.use('/lib', (req, res, next) => {

    const token = req.cookies.flowtik_token;

    if (!token) {
        return res.status(403).json({
            error: "Unauthorized access to engine"
        });
    }

    next();

});

app.use('/lib', express.static(path.join(__dirname, 'lib'), {
    maxAge: '1y',
    immutable: true
}));


// =============================
// STATIC FILES (PROTECTED)
// =============================
app.use(express.static(__dirname));


// =============================
// DEBUG CHECK
// =============================
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


// =============================
// LICENSE API CONFIG
// =============================
const JSONBIN_API_KEY = "$2a$10$BV..TadGPZnl8Hs6rUs4h.kJFEnRDmK6YPqd8onbIEhfCKSixLI66";
const JSONBIN_BIN_ID = "69c7236dc3097a1dd56a6836";


// =============================
// FETCH LICENSES
// =============================
async function fetchLicenses() {

    const response = await fetch(
        `https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}/latest`,
        {
            headers: { 'X-Master-Key': JSONBIN_API_KEY }
        }
    );

    const data = await response.json();

    let licenses = [];

    if (Array.isArray(data.record)) licenses = data.record;
    else if (data.record?.licenses) licenses = data.record.licenses;
    else if (Array.isArray(data)) licenses = data;
    else if (data.record) licenses = [data.record];

    return { licenses };

}


// =============================
// VALIDATE LICENSE
// =============================
app.post('/api/validate-license', async (req, res) => {

    try {

        const { licenseKey, deviceId } = req.body;

        if (!licenseKey || !deviceId)
            return res.json({ valid: false });

        const { licenses } = await fetchLicenses();

        const license = licenses.find(
            l => l.key.trim().toUpperCase() === licenseKey.trim().toUpperCase()
        );

        if (!license)
            return res.json({
                valid: false,
                error: "invalidLicense"
            });

        if (license.device_hash && license.device_hash !== deviceId)
            return res.json({
                valid: false,
                error: "deviceMismatch"
            });

        if (license.expires_at && new Date(license.expires_at) < new Date())
            return res.json({
                valid: false,
                error: "expired"
            });

        const token = Buffer.from(
            `${license.key}:${deviceId}:${Date.now()}`
        ).toString("base64");

        res.cookie("flowtik_token", token, {
            httpOnly: true,
            sameSite: "strict",
            maxAge: 24 * 60 * 60 * 1000
        });

        res.json({ valid: true });

    } catch (e) {

        console.error(e);

        res.json({
            valid: false,
            error: "server_error"
        });

    }

});


// =============================
// SESSION CHECK
// =============================
app.post('/api/check-session', async (req, res) => {

    try {

        const { licenseKey, deviceId } = req.body;

        if (!licenseKey || !deviceId)
            return res.json({ valid: false });

        const { licenses } = await fetchLicenses();

        const license = licenses.find(
            l => l.key.trim().toUpperCase() === licenseKey.trim().toUpperCase()
        );

        if (!license)
            return res.json({ valid: false });

        if (license.device_hash !== deviceId)
            return res.json({ valid: false });

        if (new Date(license.expires_at) < new Date())
            return res.json({ valid: false });

        const token = Buffer.from(
            `${license.key}:${deviceId}:${Date.now()}`
        ).toString("base64");

        res.cookie("flowtik_token", token, {
            httpOnly: true,
            sameSite: "strict",
            maxAge: 24 * 60 * 60 * 1000
        });

        res.json({ valid: true });

    } catch (e) {

        console.error(e);

        res.json({ valid: false });

    }

});


// =============================
// FINAL BLOCKER
// =============================
app.use((req, res) => {
    res.status(404).send("Cannot GET /login");
});


// =============================
// START SERVER
// =============================
app.listen(PORT, () => {

    console.log(`🚀 Server running on port ${PORT}`);

});
