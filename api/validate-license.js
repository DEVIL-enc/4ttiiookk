export default async function handler(req, res) {
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { licenseKey, deviceId } = req.body;
        const userAgent = req.headers['user-agent'] || 'Unknown Device';

        // Validate input
        if (!licenseKey || !deviceId) {
            return res.status(400).json({
                valid: false,
                error: 'Missing license key or device ID'
            });
        }

        // Get API credentials from environment variables (SAFE!)
        const API_KEY = process.env.JSONBIN_API_KEY;
        const BIN_ID = process.env.JSONBIN_BIN_ID;

        if (!API_KEY || !BIN_ID) {
            console.error('Missing environment variables');
            return res.status(500).json({
                valid: false,
                error: 'Server configuration error'
            });
        }

        // Fetch licenses from JSONBin
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

        // Log for debugging (only in development)
        console.log(`Searching for key: "${inputKey}", in ${licenses.length} licenses`);

        const licenseIndex = licenses.findIndex(l => normalize(l.key) === inputKey);
        const license = licenses[licenseIndex];

        if (!license) {
            // Log available keys for debugging (only first few characters to protect privacy)
            const availableKeys = licenses.map(l => normalize(l.key).substring(0, 10) + '...');
            console.log(`Key not found. Available keys (first 10 chars):`, availableKeys);
            return res.json({
                valid: false,
                error: 'invalidLicense',
                message: 'لايوجد اشتراك'
            });
        }

        const now = new Date();
        const isActivated = license.activated_on && license.activated_on !== null;

        // SMART ACTIVATION LOGIC
        if (!isActivated) {
            // First time use!
            license.activated_on = now.toISOString();
            license.device_hash = deviceId;  // Store the device fingerprint
            license.device_name = simplifyUserAgent(userAgent);
            license.processed_videos = 0;

            // Calculate Expiry if duration_days is provided
            if (license.duration_days) {
                const expiryDate = new Date();
                expiryDate.setDate(now.getDate() + license.duration_days);
                license.expires_at = expiryDate.toISOString();
            }
        }

        // 1. Device Lock
        if (license.device_hash && license.device_hash !== deviceId) {
            return res.json({
                valid: false,
                error: 'deviceMismatch',
                message: '⛔️مفتـاح التفعيل مرتبط بجهاز اخر⛔️'
            });
        }

        // 2. Expiration Check
        if (license.expires_at) {
            const expiresAt = new Date(license.expires_at);
            if (expiresAt < now) {
                return res.json({
                    valid: false,
                    error: 'expired',
                    message: '⛔️مفتاح الاشتراك منتهي الصلاحية ⛔️'
                });
            }
        }

        // USAGE TRACKING
        license.processed_videos = (license.processed_videos || 0) + 1;

        // SAVE UPDATES
        // We update the specific license in the array
        licenses[licenseIndex] = license;

        const updateResponse = await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}`, {
            method: 'PUT',
            headers: {
                'X-Master-Key': API_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ licenses })
        });

        if (!updateResponse.ok) {
            throw new Error('Failed to update license usage');
        }

        // GENERATE SECURE TOKEN
        // In a production app, sign this with a JWT secret.
        // For now, we create a simple token.
        const token = Buffer.from(`${license.key}:${deviceId}:${Date.now()}`).toString('base64');

        // Set Cookie Header
        res.setHeader('Set-Cookie', `flowtik_token=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`);

        // Return success with ONLY necessary info
        return res.json({
            valid: true,
            license: {
                key: license.key,
                plan: license.plan || 'Premium', // Default to Premium if undefined
                expiresAt: license.expires_at,
                activatedAt: license.activated_on,
                processed_videos: license.processed_videos || 0, // Include processed_videos in response
                device_name: license.device_name || 'Device not specified' // Include device_name in response
            }
        });

    } catch (error) {
        console.error('License validation error:', error);
        return res.status(500).json({
            valid: false,
            error: 'network',
            message: 'Network error. Please try again.'
        });
    }
}

// Helper to make User-Agent readable
function simplifyUserAgent(ua) {
    if (/iPhone|iPad|iPod/.test(ua)) return 'Apple Device';
    if (/Android/.test(ua)) return 'Android Device';
    if (/Windows/.test(ua)) return 'Windows PC';
    if (/Mac/.test(ua)) return 'Mac Computer';
    return 'Unknown Device';
}
