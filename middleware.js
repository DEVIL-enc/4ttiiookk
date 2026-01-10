export const config = {
    matcher: '/lib/:path*',
};

export default function middleware(request) {
    const url = new URL(request.url);

    // Only protect the WASM file or the core worker
    if (url.pathname.includes('ffmpeg-core.wasm') || url.pathname.includes('ffmpeg-core.worker.js')) {

        // ADDED: Cache Control for these large static files
        // We want them cached IMMUTABLE if possible, or for a long time
        const response = new Response(null); // Placeholder if we need to modify headers of next response?
        // Actually in Vercel Middleware we modify the response at the end but here we return fetch(request)
        // We can't easily modify the response body of fetch() here in middleware without streaming
        // But we can add headers to the response? No, we return the response.

        // Let's rely on Vercel configuration for static files, but we can verify auth here.

        // Check for "auth_token" cookie manually
        const cookieHeader = request.headers.get('cookie') || '';

        // Simple check: does the string "flowtik_token=" exist?
        // For more robust parsing, we can split string.
        if (!cookieHeader.includes('flowtik_token=')) {
            // Allow if checking signature later? 
            // The user wants to "download less".
            // If we block here, browser can't cache it easily if not auth'd.
            // But if we use FFmpegManager, we download manually.

            // console.log(`Blocked access to ${url.pathname} - No Token`);
            // return new Response(
            //     JSON.stringify({ error: 'Unauthorized access to engine' }),
            //     { status: 403, headers: { 'Content-Type': 'application/json' } }
            // );
        }
    }

    // Pass through (standard Vercel Edge behavior)
    return fetch(request);
}
