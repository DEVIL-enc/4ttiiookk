// ====================================
// FLOW MOTION - Device Fingerprinting
// ====================================

class DeviceFingerprint {
    constructor() {
        this.components = {};
    }

    // Generate a hash from string
    async hashString(str) {
        const encoder = new TextEncoder();
        const data = encoder.encode(str);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    // Get browser information (stable properties)
    getBrowserInfo() {
        return {
            userAgent: navigator.userAgent,
            platform: navigator.platform,
            vendor: navigator.vendor,
            hardwareConcurrency: navigator.hardwareConcurrency || 0,
            deviceMemory: navigator.deviceMemory || 0,
            maxTouchPoints: navigator.maxTouchPoints || 0,
            productSub: navigator.productSub,
            buildID: navigator.buildID || 'unknown',
            oscpu: navigator.oscpu || 'unknown'
        };
    }

    // Get timezone info (but use a stable representation)
    getTimezoneInfo() {
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        // Use a hash of the timezone name instead of the offset which changes
        return {
            timezone: timezone
        };
    }

    // Canvas fingerprinting - more stable version
    getCanvasFingerprint() {
        try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            canvas.width = 280;
            canvas.height = 60;

            // Draw consistent pattern that's less likely to vary between sessions
            ctx.textBaseline = 'alphabetic';
            ctx.fillStyle = '#f60';
            ctx.fillRect(125, 1, 62, 20);
            ctx.fillStyle = '#069';
            ctx.font = '14px Arial';
            ctx.fillText('FlowMotion 🎬', 2, 15);
            ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
            ctx.fillText('FlowMotion 🎬', 4, 17);

            // Add gradient - consistent rendering
            const gradient = ctx.createLinearGradient(0, 0, 280, 0);
            gradient.addColorStop(0, 'magenta');
            gradient.addColorStop(0.5, 'blue');
            gradient.addColorStop(1.0, 'red');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 25, 280, 35);

            // Instead of data URL, use a hash of the image data for more stability
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = Array.from(imageData.data);
            return this.hashString(data.join('')).substring(0, 16);
        } catch (e) {
            return 'canvas_error';
        }
    }

    // WebGL fingerprinting - more stable version
    getWebGLFingerprint() {
        try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');

            if (!gl) return 'webgl_not_supported';

            const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');

            // Get only the most stable properties
            return {
                vendor: gl.getParameter(debugInfo?.UNMASKED_VENDOR_WEBGL || gl.VENDOR),
                renderer: gl.getParameter(debugInfo?.UNMASKED_RENDERER_WEBGL || gl.RENDERER),
                version: gl.getParameter(gl.VERSION),
                shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION)
            };
        } catch (e) {
            return 'webgl_error';
        }
    }

    // Audio context fingerprinting - more stable version
    getAudioFingerprint() {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return 'audio_not_supported';

            const context = new AudioContext({ sampleRate: 44100 }); // Force consistent sample rate
            const oscillator = context.createOscillator();
            const analyser = context.createAnalyser();
            const gainNode = context.createGain();
            const scriptProcessor = context.createScriptProcessor(4096, 1, 1);

            gainNode.gain.value = 0; // Mute
            oscillator.type = 'triangle';
            oscillator.connect(analyser);
            analyser.connect(scriptProcessor);
            scriptProcessor.connect(gainNode);
            gainNode.connect(context.destination);

            oscillator.start(0);

            // Use consistent measurements
            const fingerprint = analyser.frequencyBinCount + '_' + context.sampleRate;

            oscillator.stop();
            context.close();

            return fingerprint;
        } catch (e) {
            return 'audio_error';
        }
    }

    // Get screen info with stable values only
    getStableScreenInfo() {
        return {
            width: screen.width,
            height: screen.height,
            colorDepth: screen.colorDepth,
            pixelDepth: screen.pixelDepth,
            availWidth: screen.availWidth,
            availHeight: screen.availHeight
            // Removed orientation as it can change
        };
    }

    // Get stable plugins info
    getPluginsInfo() {
        if (!navigator.plugins) return 'no_plugins';

        const plugins = [];
        for (let i = 0; i < navigator.plugins.length; i++) {
            plugins.push(navigator.plugins[i].name);
        }
        return plugins.sort().join(',');
    }

    // Generate complete fingerprint with only stable components
    async generate() {
        // Collect only stable components that won't change between sessions
        this.components = {
            browser: this.getBrowserInfo(),
            timezone: this.getTimezoneInfo(),
            canvas: this.getCanvasFingerprint(),
            webgl: this.getWebGLFingerprint(),
            audio: this.getAudioFingerprint(),
            screen: this.getStableScreenInfo(),
            plugins: this.getPluginsInfo(),
            language: navigator.language,
            languages: navigator.languages?.join(',') || '',
            cookieEnabled: navigator.cookieEnabled,
            onLine: navigator.onLine,
            hardwareConcurrency: navigator.hardwareConcurrency || 0,
            deviceMemory: navigator.deviceMemory || 0
        };

        // Create fingerprint string with sorted keys for consistency
        const sortedComponents = {};
        Object.keys(this.components).sort().forEach(key => {
            sortedComponents[key] = this.components[key];
        });

        const fingerprintString = JSON.stringify(sortedComponents);

        // Hash the fingerprint
        const hash = await this.hashString(fingerprintString);

        // Return shortened version (first 32 chars for better stability)
        return hash.substring(0, 32);
    }

    // Get or create device fingerprint - enhanced version to ensure consistency
    async getDeviceId() {
        // First, check if we already have a stored device ID
        let deviceId = localStorage.getItem(CONFIG.STORAGE.DEVICE_ID);

        if (deviceId) {
            // Verify that the stored device ID is still valid by comparing with a new generation
            const newFingerprint = await this.generate();
            
            // If they match, return the stored one; otherwise, update with the new one
            if (deviceId === newFingerprint) {
                return deviceId;
            } else {
                // Store the new fingerprint if it's different (this could happen if browser changed)
                localStorage.setItem(CONFIG.STORAGE.DEVICE_ID, newFingerprint);
                return newFingerprint;
            }
        } else {
            // Generate new fingerprint if none exists
            deviceId = await this.generate();
            localStorage.setItem(CONFIG.STORAGE.DEVICE_ID, deviceId);
        }

        return deviceId;
    }

    // Get readable device info for display
    getReadableInfo() {
        const browser = this.getBrowserInfo();
        const screen = this.getStableScreenInfo();

        return {
            browser: this.detectBrowser(browser.userAgent),
            os: this.detectOS(browser.userAgent),
            screen: `${screen.width}x${screen.height}`,
            language: browser.language
        };
    }

    // Detect browser name
    detectBrowser(userAgent) {
        if (userAgent.includes('Firefox')) return 'Firefox';
        if (userAgent.includes('Chrome')) return 'Chrome';
        if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) return 'Safari';
        if (userAgent.includes('Edge')) return 'Edge';
        if (userAgent.includes('Opera')) return 'Opera';
        return 'Unknown';
    }

    // Detect OS
    detectOS(userAgent) {
        if (userAgent.includes('Windows')) return 'Windows';
        if (userAgent.includes('Mac')) return 'macOS';
        if (userAgent.includes('Linux')) return 'Linux';
        if (userAgent.includes('Android')) return 'Android';
        if (userAgent.includes('iPhone') || userAgent.includes('iPad') || userAgent.includes('iPod')) return 'iOS';
        return 'Unknown';
    }
}

// Create global instance
const fingerprint = new DeviceFingerprint();
