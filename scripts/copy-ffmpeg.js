const fs = require('fs');
const path = require('path');

const libDir = path.join(__dirname, '../lib');
const nodeModules = path.join(__dirname, '../node_modules');

// Create lib directory
if (!fs.existsSync(libDir)) {
    fs.mkdirSync(libDir, { recursive: true });
}

const filesToCopy = [
    { src: path.join(nodeModules, '@ffmpeg/core/dist/ffmpeg-core.js'), dest: path.join(libDir, 'ffmpeg-core.js') },
    { src: path.join(nodeModules, '@ffmpeg/core/dist/ffmpeg-core.wasm'), dest: path.join(libDir, 'ffmpeg-core.wasm') },
    { src: path.join(nodeModules, '@ffmpeg/core/dist/ffmpeg-core.worker.js'), dest: path.join(libDir, 'ffmpeg-core.worker.js') },
    { src: path.join(nodeModules, '@ffmpeg/ffmpeg/dist/ffmpeg.min.js'), dest: path.join(libDir, 'ffmpeg.min.js') }
];

console.log('Copying FFmpeg assets to lib/...');

filesToCopy.forEach(file => {
    try {
        if (fs.existsSync(file.src)) {
            fs.copyFileSync(file.src, file.dest);
            console.log(`✅ Copied: ${path.basename(file.dest)} (Size: ${fs.statSync(file.dest).size} bytes)`);
        } else {
            console.error(`❌ Missing source: ${file.src}`);
            process.exit(1); // Fail the build if files are missing
        }
    } catch (err) {
        console.error(`❌ Error copying ${file.src}:`, err);
        process.exit(1);
    }
});
console.log('Build script completed successfully.');
