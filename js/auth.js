// ====================================
// FLOW MOTION - Authentication Manager
// ====================================

class AuthManager {
    constructor() {
        this.isAuthenticated = false;
        this.currentSession = null;
        this.deviceId = null;
    }

    // Initialize auth manager
    async init() {
        try {
            // Get device fingerprint
            this.deviceId = await fingerprint.getDeviceId();
            console.log("Device ID:", this.deviceId);

            // HYBRID: Check for existing local session (Persistence)
            const sessionCheck = await api.checkSession();

            if (sessionCheck.valid) {
                // 1. Local Check Passed
                console.log("Local session valid. Syncing with server...");

                // 2. Server Check (Critical for Cookie & Security)
                try {
                    const response = await fetch('/api/check-session', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            licenseKey: sessionCheck.session.license.key,
                            deviceId: this.deviceId
                        })
                    });

                    const serverData = await response.json();

                    if (!serverData.valid) {
                        console.error("Server Rejected Session:", serverData);
                        // If server says invalid (e.g. Device Mismatch), we must logout
                        this.logout();
                        return false;
                    }

                    console.log("Server session confirmed & Cookie refreshed.");

                    // 3. Restore Session
                    this.isAuthenticated = true;
                    this.currentSession = sessionCheck.session;
                    // Ensure deviceId is set from the session if it exists
                    if (sessionCheck.session.deviceId) {
                        this.deviceId = sessionCheck.session.deviceId;
                    }
                    return true;

                } catch (serverErr) {
                    console.error("Server sync failed (Network?):", serverErr);
                    // Decide strategy: Block or Allow offline? 
                    // For security, we should probably BLOCK if we can't get the cookie.
                    // But if it's just network, maybe let them in? 
                    // NO. Without cookie, Engine won't load. So we assume failed.
                    return false;
                }
            }

            // Default: Unauthenticated
            this.isAuthenticated = false;
            this.currentSession = null;
            return false;

        } catch (error) {
            console.error("Auth init error:", error);
            // Clear any potentially corrupted session data
            api.destroySession();
            return false;
        }
    }

    // Login with license key
    async login(licenseKey) {
        try {
            // Validate format
            if (!this.validateLicenseFormat(licenseKey)) {
                return {
                    success: false,
                    error: 'Invalid license key format'
                };
            }

            // Get device ID
            const deviceId = await fingerprint.getDeviceId();
            this.deviceId = deviceId;

            console.log("Attempting to validate license:", licenseKey.substring(0, 10) + "...");

            // Validate with API
            const validation = await api.validateLicense(licenseKey, deviceId);

            console.log("License validation response:", validation);

            if (!validation.valid) {
                return {
                    success: false,
                    error: validation.message || 'Invalid license'
                };
            }

            // Create Session (Hybrid: Memory + Storage)
            const session = api.createSession(validation.license, deviceId);
            session.deviceId = deviceId;

            this.isAuthenticated = true;
            this.currentSession = session;
            this.deviceId = deviceId; // Ensure deviceId is updated

            console.log("Login successful.");
            return {
                success: true,
                session: session
            };

        } catch (error) {
            console.error('Login error:', error);
            return {
                success: false,
                error: 'Login failed. Please try again.'
            };
        }
    }

    // Logout
    logout() {
        api.destroySession();
        this.isAuthenticated = false;
        this.currentSession = null;
        this.deviceId = null;
    }

    /**
     * STRICT VERIFICATION - Call this before any critical action
     * Checks if the key is allowed to process video RIGHT NOW
     */
    async verifyBeforeProcessing() {
        if (!this.hasAccess()) {
            return { valid: false, message: 'غير مسجل الدخول' };
        }

        const key = this.currentSession.license.key;
        const deviceId = this.deviceId;

        console.log("🔒 performing strict verification before processing...");

        // Call the new strict API method
        const verification = await api.verifyActiveSession(key, deviceId);

        if (!verification.valid) {
            console.warn("❌ Verification failed:", verification.reason);
            return verification;
        }

        // Sync local session with fresh server data
        if (verification.license) {
            console.log("✅ Verification passed. Syncing session...");
            this.currentSession.license = verification.license;
            api.createSession(verification.license, this.deviceId);
        }

        return { valid: true };
    }

    async verifyLive() {
        return this.verifyBeforeProcessing();
    }

    // Validate license key format
    validateLicenseFormat(key) {
        // FLEXIBLE: Allow any non-empty string
        return key && key.length > 0;
    }

    // Format license key as user types
    formatLicenseKey(input) {
        // FLEXIBLE: Just trim whitespace and Uppercase
        return input.trim().toUpperCase();
    }

    // Check if user has access
    hasAccess() {
        return this.isAuthenticated && this.currentSession !== null;
    }

    // Get session info
    getSessionInfo() {
        if (!this.currentSession) return null;

        // Handle both processedVideos and processed_videos field names
        const license = this.currentSession.license;
        const processedVideos = license.processedVideos || license.processed_videos || 0;

        // Handle both device_name and deviceName field names
        const deviceName = license.device_name || license.deviceName || 'Device not specified';

        return {
            licenseKey: license.key,
            plan: license.plan,
            expiresAt: license.expiresAt,
            activatedAt: license.activatedAt,
            remainingDays: api.getRemainingDays(license.expiresAt),
            processedVideos: processedVideos,
            deviceName: deviceName,
            deviceId: this.deviceId
        };
    }

    // Redirect to login if not authenticated
    requireAuth() {
        if (!this.hasAccess()) {
            window.location.href = 'login.html';
            return false;
        }
        return true;
    }

    // Redirect to app if already authenticated
    redirectIfAuthenticated() {
        if (this.hasAccess()) {
            window.location.href = 'index.html';
            return true;
        }
        return false;
    }
}

// Create global auth instance
const auth = new AuthManager();
