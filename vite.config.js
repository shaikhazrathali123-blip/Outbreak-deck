import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root: 'client',
  // Relative paths so the build also works inside Capacitor (Phase 6).
  base: './',
  server: {
    host: true, // reachable from a phone on the same Wi-Fi
    port: 5173,
    // allow importing ../shared from the client
    fs: { allow: [projectRoot] },
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
});
