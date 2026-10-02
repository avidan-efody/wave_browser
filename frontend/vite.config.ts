import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // For GitHub Pages - uses repo name as base path
  // Change 'wave_browser' to your actual repo name if different
  base: process.env.GITHUB_PAGES ? '/wave_browser/' : '/',
  server: {
    fs: {
      allow: ['..', '../example'],
    },
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',  // Use IPv4 explicitly to avoid ECONNREFUSED on IPv6
        changeOrigin: true,
      }
    }
  }
})
