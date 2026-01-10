// Vercel Serverless Function - Check Session Validity
// Validates license in real-time before processing

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { licenseKey, deviceId } = req.body;

        if (!licenseKey || !deviceId) {
            return res.status(400).json({
                valid: false,
                error: 'Missing license key or device ID'
            });
        }

        // Get credentials from environment
        const API_KEY = process.env.JSONBIN_API_KEY;
        const BIN_ID = process.env.JSONBIN_BIN_ID;

        if (!API_KEY || !BIN_ID) {
            return res.status(500).json({
                valid: false,
                error: 'Server configuration error'
            });
        }

        // Fetch current licenses from JSONBin
        const response = await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}/latest`, {
            headers: {
                'X-Master-Key': API_KEY,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error('Failed to fetch licenses');
        }

        const data = await response.json();

        // Handle various possible data structures from JSONBin
        let licenses = [];

        // Try different possible structures
        if (Array.isArray(data.record)) {
            // Direct array structure: [{"key": "...", ...}]
            licenses = data.record;
        } else if (data.record && Array.isArray(data.record.licenses)) {
            // Nested array structure: {"licenses": [{"key": "...", ...}]}
            licenses = data.record.licenses;
        } else if (Array.isArray(data.record?.licenses)) {
            // Alternative nested structure
            licenses = data.record.licenses;
        } else if (Array.isArray(data)) {
            // Direct array at root level
            licenses = data;
        } else if (data && typeof data === 'object' && data.record) {
            // Object with record property that might be an array when stringified
            if (Array.isArray(Object.values(data.record)[0])) {
                // If the first value in record object is an array, use it
                licenses = Object.values(data.record)[0];
            } else {
                // If record itself is a single license object, wrap in array
                licenses = [data.record];
            }
        } else {
            console.error("Invalid JSON structure from JSONBin", data);
            return res.status(500).json({
                valid: false,
                error: 'server_error',
                message: 'Invalid data structure in database'
            });
        }

        // Find the license (Case Insensitive)
        const normalize = k => k ? k.trim().toUpperCase() : '';
        const inputKey = normalize(licenseKey);

        // Log for debugging
        console.log(`Session check - Searching for key: "${inputKey}", in ${licenses.length} licenses`);

        const licenseIndex = licenses.findIndex(l => normalize(l.key) === inputKey);
        const license = licenses[licenseIndex];

        // License deleted from JSONBin
        if (!license) {
            // Log available keys for debugging
            const availableKeys = licenses.map(l => normalize(l.key).substring(0, 10) + '...');
            console.log(`Session check - Key not found. Available keys (first 10 chars):`, availableKeys);
            return res.json({
                valid: false,
                error: 'deleted',
                message: 'License has been revoked'
            });
        }

        // Device mismatch
        if (license.device_hash !== deviceId) {
            console.log(`Session check - Device mismatch. Expected: ${license.device_hash}, Got: ${deviceId}`);
            return res.json({
                valid: false,
                error: 'deviceMismatch',
                message: 'Device mismatch'
            });
        }

        // Check expiration
        const expiresAt = new Date(license.expires_at);
        const now = new Date();

        if (expiresAt < now) {
            return res.json({
                valid: false,
                error: 'expired',
                message: 'Subscription has expired'
            });
        }

        // GENERATE SECURE TOKEN (Renew)
        // In a production app, sign this with a JWT secret.
        const token = Buffer.from(`${license.key}:${deviceId}:${Date.now()}`).toString('base64');

        // Set Cookie Header
        res.setHeader('Set-Cookie', `flowtik_token=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`);

        // All checks passed
        return res.json({
            valid: true,
            license: {
                key: license.key,
                plan: license.plan || 'Premium',
                expiresAt: license.expires_at,
                remainingDays: Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24)),
                processed_videos: license.processed_videos || license.processedVideos || 0, // Support both field names
                device_name: license.device_name || license.deviceName || 'Device not specified', // Ensure device_name is returned
                activated_on: license.activated_on // Include activation date
            }
        });

    } catch (error) {
        console.error('Session check error:', error);
        return res.status(500).json({
            valid: false,
            error: 'network',
            message: 'Network error'
        });
    }
}
