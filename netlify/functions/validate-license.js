// Netlify Function - Validate License
// Ported from Vercel API

export default async function handler(req, context) {
    if (req.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 });
    }

    try {
        const body = await req.json();
        const { licenseKey, deviceId } = body;
        const userAgent = req.headers.get('user-agent') || 'Unknown Device';

        if (!licenseKey || !deviceId) {
            return new Response(JSON.stringify({
                valid: false,
                error: 'Missing license key or device ID'
            }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }

        const API_KEY = Netlify.env.get("JSONBIN_API_KEY") || process.env.JSONBIN_API_KEY;
        const BIN_ID = Netlify.env.get("JSONBIN_BIN_ID") || process.env.JSONBIN_BIN_ID;

        if (!API_KEY || !BIN_ID) {
            return new Response(JSON.stringify({
                valid: false,
                error: 'Server configuration error'
            }), { status: 500, headers: { 'Content-Type': 'application/json' } });
        }

        const response = await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}/latest`, {
            headers: {
                'X-Master-Key': API_KEY,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) throw new Error('Failed to fetch licenses');

        const data = await response.json();

        // --- Logic Shared with Vercel (Simplified) ---
        let licenses = [];
        // [Same parsing logic as Vercel]
        if (Array.isArray(data.record)) licenses = data.record;
        else if (data.record && Array.isArray(data.record.licenses)) licenses = data.record.licenses;
        else if (Array.isArray(data.record?.licenses)) licenses = data.record.licenses;
        else if (Array.isArray(data)) licenses = data;
        else if (data && typeof data === 'object' && data.record) {
            if (Array.isArray(Object.values(data.record)[0])) licenses = Object.values(data.record)[0];
            else licenses = [data.record];
        }

        const normalize = k => k ? k.trim().toUpperCase() : '';
        const inputKey = normalize(licenseKey);
        const licenseIndex = licenses.findIndex(l => normalize(l.key) === inputKey);
        const license = licenses[licenseIndex];

        if (!license) {
            return new Response(JSON.stringify({
                valid: false, error: 'invalidLicense', message: 'لايوجد اشتراك'
            }), { headers: { 'Content-Type': 'application/json' } });
        }

        const now = new Date();
        // Activate if new
        if (!license.activated_on) {
            license.activated_on = now.toISOString();
            license.device_hash = deviceId;
            license.device_name = simplifyUserAgent(userAgent);
            license.processed_videos = 0;
            if (license.duration_days) {
                const expiryDate = new Date();
                expiryDate.setDate(now.getDate() + license.duration_days);
                license.expires_at = expiryDate.toISOString();
            }
        }

        // Checks
        if (license.device_hash && license.device_hash !== deviceId) {
            return new Response(JSON.stringify({
                valid: false, error: 'deviceMismatch', message: '⛔️مفتـاح التفعيل مرتبط بجهاز اخر⛔️'
            }), { headers: { 'Content-Type': 'application/json' } });
        }

        if (license.expires_at && new Date(license.expires_at) < now) {
            return new Response(JSON.stringify({
                valid: false, error: 'expired', message: '⛔️مفتاح الاشتراك منتهي الصلاحية ⛔️'
            }), { headers: { 'Content-Type': 'application/json' } });
        }

        // Update Usage
        license.processed_videos = (license.processed_videos || 0) + 1;
        licenses[licenseIndex] = license;

        // Save back
        await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}`, {
            method: 'PUT',
            headers: { 'X-Master-Key': API_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ licenses })
        });

        // Generate Token
        const token = btoa(`${license.key}:${deviceId}:${Date.now()}`);

        // Return
        const resObj = {
            valid: true,
            license: {
                key: license.key,
                plan: license.plan || 'Premium',
                expiresAt: license.expires_at,
                activatedAt: license.activated_on,
                processed_videos: license.processed_videos,
                device_name: license.device_name
            }
        };

        const headers = new Headers();
        headers.set('Content-Type', 'application/json');
        headers.set('Set-Cookie', `flowtik_token=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`);

        return new Response(JSON.stringify(resObj), { status: 200, headers });

    } catch (error) {
        console.error(error);
        return new Response(JSON.stringify({ valid: false, error: 'network' }), { status: 500 });
    }
}

function simplifyUserAgent(ua) {
    if (/iPhone|iPad|iPod/.test(ua)) return 'Apple Device';
    if (/Android/.test(ua)) return 'Android Device';
    if (/Windows/.test(ua)) return 'Windows PC';
    if (/Mac/.test(ua)) return 'Mac Computer';
    return 'Unknown Device';
}
