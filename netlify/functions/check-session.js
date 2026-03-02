// Netlify Function - Check Session
// Ported from Vercel API

export default async function handler(req) {
    if (req.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 });
    }

    try {
        const body = await req.json();
        const { licenseKey, deviceId } = body;

        if (!licenseKey || !deviceId) {
            return new Response(JSON.stringify({ valid: false, error: 'Missing data' }), { status: 400 });
        }

        const API_KEY = Netlify.env.get("JSONBIN_API_KEY") || process.env.JSONBIN_API_KEY;
        const BIN_ID = Netlify.env.get("JSONBIN_BIN_ID") || process.env.JSONBIN_BIN_ID;

        const response = await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}/latest`, {
            headers: { 'X-Master-Key': API_KEY }
        });

        if (!response.ok) throw new Error('Failed to fetch');
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

        const normalize = k => k ? k.trim().toUpperCase() : '';
        const license = licenses.find(l => normalize(l.key) === normalize(licenseKey));

        if (!license) return new Response(JSON.stringify({ valid: false, error: 'deleted' }), { headers: { 'Content-Type': 'application/json' } });

        if (license.device_hash !== deviceId) {
            return new Response(JSON.stringify({ valid: false, error: 'deviceMismatch' }), { headers: { 'Content-Type': 'application/json' } });
        }

        const now = new Date();
        if (new Date(license.expires_at) < now) {
            return new Response(JSON.stringify({ valid: false, error: 'expired' }), { headers: { 'Content-Type': 'application/json' } });
        }

        // Renew Token
        const token = btoa(`${license.key}:${deviceId}:${Date.now()}`);
        const headers = new Headers();
        headers.set('Content-Type', 'application/json');
        headers.set('Set-Cookie', `flowtik_token=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`);

        return new Response(JSON.stringify({
            valid: true,
            license: {
                key: license.key,
                plan: license.plan || 'Premium',
                expiresAt: license.expires_at,
                remainingDays: Math.ceil((new Date(license.expires_at) - now) / (1000 * 60 * 60 * 24)),
                processed_videos: license.processed_videos,
                device_name: license.device_name,
                activated_on: license.activated_on
            }
        }), { status: 200, headers });

    } catch (e) {
        console.error(e);
        return new Response(JSON.stringify({ valid: false, error: 'network' }), { status: 500 });
    }
}
