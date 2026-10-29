import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

// The dev server is bound to 127.0.0.1 so the app (and the data in it) is never exposed on the local network by accident.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    host: '127.0.0.1',
    port: 5177,
    strictPort: false,
    open: false,
    proxy: { '/api': { target: `http://127.0.0.1:${process.env.SP_PORT || 5175}`, changeOrigin: false } },
  },
  preview: { host: '127.0.0.1', port: 4177 },
})
