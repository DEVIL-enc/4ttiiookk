// ====================================
// FLOW MOTION - API Integration (SECURE VERSION)
// ====================================
// Now uses Vercel Serverless Functions
// API Keys are NEVER exposed to browser!

class API {
    constructor() {
        // No API keys here! They're on Vercel server
        this.apiEndpoint = '/api/validate-license';
        this.checkEndpoint = '/api/check-session';
    }

    // Validate license key (calls our secure API)
    async validateLicense(licenseKey, deviceId) {
        try {
            const response = await fetch(this.apiEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    licenseKey,
                    deviceId
                })
            });

            if (!response.ok) {
                // If 4xx or 5xx, try to read error message
                const errorData = await response.json().catch(() => ({}));
                return {
                    valid: false,
                    error: errorData.error || 'api_error',
                    message: errorData.message || `API Error: ${response.status}`
                };
            }

            return await response.json();

        } catch (error) {
            console.error('License validation error:', error);
            return {
                valid: false,
                error: 'network',
                message: 'Network error. Please try again.'
            };
        }
    }

    /**
     * STRICT VERIFICATION - Forces a server check
     * Used before critical operations (like processing video)
     */
    async verifyActiveSession(licenseKey, deviceId) {
        try {
            // Force server check (bypass local cache logic)
            const response = await fetch('/api/check-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ licenseKey, deviceId })
            });

            const data = await response.json();

            if (!data.valid) {
                return {
                    valid: false,
                    reason: 'INVALID_SESSION',
                    message: 'جلسة غير صالحة'
                };
            }

            // Check expiry directly from server data
            const expiry = new Date(data.license.expiresAt);
            if (expiry < new Date()) {
                return {
                    valid: false,
                    reason: 'EXPIRED',
                    message: 'الاشتراك منتهي'
                };
            }

            return {
                valid: true,
                license: data.license
            };

        } catch (error) {
            console.error("Strict verification failed:", error);
            // If network fails, we might want to allow if local session is recently validated
            // But for high security, we default to fail or check last sync time
            return {
                valid: false,
                reason: 'NETWORK_ERROR',
                message: 'فشل الاتصال بالخادم'
            };
        }
    }

    // Check session - HYBRID implementation
    // Returns valid if local session exists and isn't expired
    async checkSession() {
        const session = localStorage.getItem(CONFIG.STORAGE.SESSION);

        if (!session) {
            return { valid: false, error: 'no_session' };
        }

        try {
            const sessionData = JSON.parse(session);

            // Ensure session data has the expected structure
            if (!sessionData.license || !sessionData.license.expiresAt) {
                console.warn("Invalid session structure detected, clearing session");
                this.destroySession();
                return { valid: false, error: 'invalid_session_structure' };
            }

            const now = Date.now();

            // Check session expiration
            if (sessionData.expiresAt < now) {
                return { valid: false, error: 'session_expired' };
            }

            // Check license expiration
            const licenseExpiry = new Date(sessionData.license.expiresAt);
            if (licenseExpiry < new Date()) {
                return { valid: false, error: 'subscription_expired' };
            }

            // Ensure processedVideos field is available in both formats
            if (sessionData.license) {
                // Normalize field names to ensure both processedVideos and processed_videos exist
                if (sessionData.license.processed_videos !== undefined && sessionData.license.processedVideos === undefined) {
                    sessionData.license.processedVideos = sessionData.license.processed_videos;
                } else if (sessionData.license.processedVideos !== undefined && sessionData.license.processed_videos === undefined) {
                    sessionData.license.processed_videos = sessionData.license.processedVideos;
                }
            }

            return {
                valid: true,
                session: sessionData
            };
        } catch (e) {
            console.error("Session parsing error:", e);
            // Clear corrupted session data
            this.destroySession();
            return { valid: false, error: 'invalid_data' };
        }
    }

    // Create session (Hybrid: Memory + LocalStorage)
    createSession(licenseData, deviceId = null) {
        // If deviceId is provided, store it in localStorage
        if (deviceId) {
            localStorage.setItem(CONFIG.STORAGE.DEVICE_ID, deviceId);
        }

        // Normalize field names to ensure both processedVideos and processed_videos exist
        if (licenseData) {
            if (licenseData.processed_videos !== undefined && licenseData.processedVideos === undefined) {
                licenseData.processedVideos = licenseData.processed_videos;
            } else if (licenseData.processedVideos !== undefined && licenseData.processed_videos === undefined) {
                licenseData.processed_videos = licenseData.processedVideos;
            }
        }

        const session = {
            license: licenseData,
            deviceId: deviceId || localStorage.getItem(CONFIG.STORAGE.DEVICE_ID), // Use provided device ID or stored one
            createdAt: Date.now(),
            expiresAt: Date.now() + CONFIG.APP.SESSION_DURATION
        };

        // PERSISTENCE: Save to localStorage for UX
        localStorage.setItem(CONFIG.STORAGE.SESSION, JSON.stringify(session));
        localStorage.setItem(CONFIG.STORAGE.LICENSE_KEY, licenseData.key);

        return session;
    }

    // Destroy session (Logout)
    destroySession() {
        localStorage.removeItem(CONFIG.STORAGE.SESSION);
        localStorage.removeItem(CONFIG.STORAGE.LICENSE_KEY);
        localStorage.removeItem(CONFIG.STORAGE.DEVICE_ID);
    }

    // Get remaining days
    getRemainingDays(expiresAt) {
        const expiry = new Date(expiresAt);
        const now = new Date();
        const diffTime = expiry - now;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays > 0 ? diffDays : 0;
    }

    // Format date for display
    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }
}

// Create global API instance
const api = new API();
