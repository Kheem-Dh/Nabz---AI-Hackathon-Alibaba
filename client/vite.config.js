import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The backend runs on :8000. We proxy /api so the frontend can call the
// backend without hardcoding the host, and CORS stays simple.
export default defineConfig({
  plugins: [react()],
  build: {
    // The APK runs inside Android System WebView, which on a phone that never
    // updated it is as old as the OS: Chrome 74 on stock Android 10. Vite's
    // default (Chrome 87) emits `??` and `?.` unchanged, and an engine that
    // can't parse them fails the whole module — a blank white screen with no
    // error. Chrome 64 is the real floor: lazy routes need native dynamic
    // import() (63) and Vite's preload helper needs import.meta (64), and
    // neither can be lowered. That covers stock Android 9+ and any older
    // phone whose WebView has updated itself through the Play Store.
    // esbuild lowers everything else; runtime APIs newer than 64 are shimmed
    // in legacy-polyfills.js or avoided in source.
    target: 'chrome64',
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
