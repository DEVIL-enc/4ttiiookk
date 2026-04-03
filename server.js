const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const cors = require('cors');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cookieParser());
app.use(cors());

/* ===================================
   SHARED ARRAY BUFFER HEADERS
=================================== */
app.use((req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    next();
});

/* ===================================
   TOKEN VERIFY FUNCTION
=================================== */
function verifyToken(token) {
    try {
        if (!token) return null;

        const parts = token.split(".");
        if (parts.length !== 2) return null;

        const [payload, signature] = parts;

        const expected = crypto
            .createHmac("sha256", process.env.SESSION_SECRET)
            .update(payload)
            .digest("hex");

        if (signature !== expected) return null;

        return JSON.parse(
            Buffer.from(payload, "base64").toString()
        );

    } catch {
        return null;
    }
}

/* ===================================
   GLOBAL SECURITY MIDDLEWARE
=================================== */
app.use((req, res, next) => {

    const publicPaths = [
        "/",
        "/index.html",
        "/login.html",
        "/api/validate-license",
        "/api/check-session",
        "/js/auth.js",
        "/js/api.js",
        "/js/config.js",
        "/js/utils.js",
        "/js/fingerprint.js"
    ];

    if (publicPaths.includes(req.path)) {
        return next();
    }

    if (req.path.startsWith("/lib/")) {

        const token = req.cookies.flowtik_token;
        const decoded = verifyToken(token);

        if (!decoded) {
            console.log("Blocked:", req.originalUrl);
            return res.status(403).json({
                error: "Unauthorized access to engine"
            });
        }
    }

    next();
});

/* ===================================
   BLOCK /LIB DIRECT ACCESS FIRST
=================================== */
app.use("/lib", (req, res, next) => {

    const token = req.cookies.flowtik_token;
    const decoded = verifyToken(token);

    if (!decoded) {
        return res.status(403).json({
            error: "Unauthorized access to engine"
        });
    }

    next();
});

/* ===================================
   SERVE LIB FILES (AFTER CHECK)
=================================== */
app.use("/lib", express.static(path.join(__dirname, "lib")));

/* ===================================
   STATIC FILES
=================================== */
app.use(express.static(__dirname));

/* ===================================
   LICENSE SYSTEM
=================================== */

const JSONBIN_API_KEY = process.env.JSONBIN_API_KEY;
const JSONBIN_BIN_ID = process.env.JSONBIN_BIN_ID;

async function fetchLicenses() {

    const response = await fetch(
        `https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}/latest`,
        { headers: { "X-Master-Key": JSONBIN_API_KEY } }
    );

    const data = await response.json();
    return data.record;
}

/* ===================================
   VALIDATE LICENSE
=================================== */

app.post("/api/validate-license", async (req, res) => {

    try {

        const { licenseKey, deviceId } = req.body;

        const licenses = await fetchLicenses();

        const license = licenses.find(
            l => l.key.trim().toUpperCase() === licenseKey.trim().toUpperCase()
        );

        if (!license)
            return res.json({ valid: false });

        if (license.device_hash && license.device_hash !== deviceId)
            return res.json({ valid: false });

        const payload = Buffer.from(JSON.stringify({
            key: license.key,
            deviceId,
            expiresAt: Date.now() + 86400000
        })).toString("base64");

        const signature = crypto
            .createHmac("sha256", process.env.SESSION_SECRET)
            .update(payload)
            .digest("hex");

        const token = `${payload}.${signature}`;

        res.cookie("flowtik_token", token, {
            httpOnly: true,
            sameSite: "strict",
            maxAge: 86400000
        });

        res.json({ valid: true });

    } catch (err) {

        console.log(err);

        res.status(500).json({
            valid: false,
            error: "server_error"
        });

    }
});

/* ===================================
   CHECK SESSION
=================================== */

app.post("/api/check-session", async (req, res) => {

    try {

        const { licenseKey, deviceId } = req.body;

        const licenses = await fetchLicenses();

        const license = licenses.find(
            l => l.key.trim().toUpperCase() === licenseKey.trim().toUpperCase()
        );

        if (!license)
            return res.json({ valid: false });

        if (license.device_hash !== deviceId)
            return res.json({ valid: false });

        const payload = Buffer.from(JSON.stringify({
            key: license.key,
            deviceId,
            expiresAt: Date.now() + 86400000
        })).toString("base64");

        const signature = crypto
            .createHmac("sha256", process.env.SESSION_SECRET)
            .update(payload)
            .digest("hex");

        const token = `${payload}.${signature}`;

        res.cookie("flowtik_token", token, {
            httpOnly: true,
            sameSite: "strict",
            maxAge: 86400000
        });

        res.json({ valid: true });

    } catch (err) {

        res.status(500).json({
            valid: false
        });

    }
});

/* ===================================
   START SERVER
=================================== */

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
