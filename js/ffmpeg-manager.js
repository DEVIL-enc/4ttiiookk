// ====================================
// FLOW MOTION - FFmpeg Manager v3 (Stable)
// Buffered Storage + Silent Loading
// ====================================

class FFmpegManager {
    constructor() {
        this.ffmpegInstance = null;
        this.isReady = false;
        this.version = 'v0.11.0.c'; // New version to force refresh
        this.dbName = 'FlowTikCache';
        this.storeName = 'ffmpeg_files';

        // Define files with precise paths
        this.files = [
            { name: 'ffmpeg-core.js', url: 'lib/ffmpeg-core.js', type: 'text' },
            { name: 'ffmpeg-core.wasm', url: 'lib/ffmpeg-core.wasm', type: 'binary' },
            { name: 'ffmpeg-core.worker.js', url: 'lib/ffmpeg-core.worker.js', type: 'text' }
        ];
    }

    // --- IndexedDB Helpers ---
    async initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName);
                }
            };
        });
    }

    async dbGet(key) {
        const db = await this.initDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(this.storeName, 'readonly');
            const store = tx.objectStore(this.storeName);
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async dbPut(key, value) {
        const db = await this.initDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(this.storeName, 'readwrite');
            const store = tx.objectStore(this.storeName);
            const request = store.put(value, key);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async dbClear() {
        const db = await this.initDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(this.storeName, 'readwrite');
            const store = tx.objectStore(this.storeName);
            const request = store.clear();
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // --- Main Logic ---

    async initialize() {
        try {
            // Check version
            const storedVersion = await this.dbGet('version');
            if (storedVersion !== this.version) {
                console.log('🔄 Version update: Clearing old cache...');
                await this.dbClear();
            }

            // Check if ALL files exist in IDB
            const allCached = await this.checkAllFilesExist();

            if (allCached) {
                // SILENT LOAD
                console.log('⚡ Loading from local cache...');
                // No notification here, user wants it silent
                return await this.loadFromCache();
            } else {
                // DOWNLOAD REQUIRED
                console.log('📥 Downloading from server...');
                // Notification only for first time download
                if (typeof showNotification === 'function') {
                    showNotification("جاري تحميل ملفات المحرك (لأول مرة فقط)...", "info", 8000);
                }
                return await this.downloadAndCache();
            }

        } catch (error) {
            console.error("FFmpeg Init Error:", error);
            // Fallback to direct download if anything fails
            return await this.loadDirect();
        }
    }

    async checkAllFilesExist() {
        for (const file of this.files) {
            const item = await this.dbGet(file.name);
            if (!item) return false;
        }
        return true;
    }

    async downloadAndCache() {
        // Download all in parallel
        const downloads = this.files.map(async (file) => {
            const res = await fetch(file.url);
            if (!res.ok) throw new Error(`Failed to fetch ${file.name}`);

            let content;
            if (file.type === 'binary') {
                content = await res.arrayBuffer();
            } else {
                content = await res.text();
            }
            return { name: file.name, content };
        });

        const results = await Promise.all(downloads);

        // Save to DB (Fire and forget, but handle errors)
        try {
            for (const item of results) {
                await this.dbPut(item.name, item);
            }
            await this.dbPut('version', this.version);
            console.log("✅ Cache saved successfully");
        } catch (e) {
            console.error("❌ Failed to save cache (Quota?):", e);
            if (typeof showNotification === 'function') {
                showNotification("تنبيه: ذاكرة المتصفح ممتلئة", "warning", 4000);
            }
        }

        // Load from the fresh memory buffers
        return this.loadFromBuffers(results);
    }

    async loadFromCache() {
        const coreJsItem = await this.dbGet('ffmpeg-core.js');
        const wasmItem = await this.dbGet('ffmpeg-core.wasm');
        const workerItem = await this.dbGet('ffmpeg-core.worker.js');

        if (!coreJsItem || !wasmItem || !workerItem) throw new Error("Cache incomplete");

        // Convert to array format compatible with `loadFromBuffers`
        const results = [
            { name: 'ffmpeg-core.js', content: coreJsItem.content },
            { name: 'ffmpeg-core.wasm', content: wasmItem.content },
            { name: 'ffmpeg-core.worker.js', content: workerItem.content }
        ];

        return this.loadFromBuffers(results);
    }

    async loadFromBuffers(items) {
        const coreJs = items.find(i => i.name === 'ffmpeg-core.js').content;
        const wasm = items.find(i => i.name === 'ffmpeg-core.wasm').content;
        const worker = items.find(i => i.name === 'ffmpeg-core.worker.js').content;

        // Create Blobs
        const wasmBlob = new Blob([wasm], { type: 'application/wasm' });
        const workerBlob = new Blob([worker], { type: 'text/javascript' });

        const wasmUrl = URL.createObjectURL(wasmBlob);
        const workerUrl = URL.createObjectURL(workerBlob);

        // Patch Core JS
        let patchedCore = coreJs;

        // Robust replacements for v0.11.0 format
        // 1. Replace worker script path (it might be in createFFmpeg config, but core loads it too)
        patchedCore = patchedCore.replace(/e\.workerPath\|\|.*?\.worker\.js"/, `"${workerUrl}"`);
        // Fallback simple replacement if the above regex misses (minification varies):
        if (patchedCore === coreJs) {
            // Try standard string replacement
            patchedCore = patchedCore.split('ffmpeg-core.worker.js').join(workerUrl);
        }

        // 2. Replace WASM path
        // The core looks for wasmPath or default filename
        patchedCore = patchedCore.split('ffmpeg-core.wasm').join(wasmUrl);

        const coreBlob = new Blob([patchedCore], { type: 'text/javascript' });
        const coreUrl = URL.createObjectURL(coreBlob);

        // Verify Lib
        if (typeof FFmpeg === 'undefined') throw new Error("FFmpeg library not loaded in window");

        const { createFFmpeg } = FFmpeg;

        this.ffmpegInstance = createFFmpeg({
            log: true,
            corePath: coreUrl,
            // Force worker URL in config too for safety
            workerPath: workerUrl
        });

        await this.ffmpegInstance.load();

        this.isReady = true;
        return this.ffmpegInstance;
    }

    async loadDirect() {
        // Fallback method
        console.log("⚠️ Using Direct Load (Fallback)");
        const { createFFmpeg } = FFmpeg;
        const coreUrl = new URL('lib/ffmpeg-core.js', window.location.href).href;

        this.ffmpegInstance = createFFmpeg({
            log: true,
            corePath: coreUrl
        });

        await this.ffmpegInstance.load();
        this.isReady = true;
        return this.ffmpegInstance;
    }

    isFFmpegReady() {
        return this.isReady;
    }
}

const ffmpegManager = new FFmpegManager();
