import { defineConfig } from 'vite';
import swManifest from './vite.sw-manifest.js';
export default defineConfig({
  base: './',
  plugins: [swManifest()],
  optimizeDeps: { include: ['lz-string', 'qrcode-generator', 'jsqr'] },
  build: { target: 'es2022', chunkSizeWarningLimit: 4000 },
  server: { host: true },
});
