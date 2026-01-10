export default async (request, context) => {
    const url = new URL(request.url);

    // Only protect high-value targets
    if (url.pathname.includes('ffmpeg-core.wasm') || url.pathname.includes('ffmpeg-core.worker.js')) {

        const token = context.cookies.get("flowtik_token");

        if (!token) {
            console.log(`[Edge] Blocked access to ${url.pathname} - No Token`);
            return new Response(JSON.stringify({ error: "Unauthorized" }), {
                status: 403,
                headers: { "Content-Type": "application/json" }
            });
        }
    }

    // Continue to next edge function or static asset
    return context.next();
};
