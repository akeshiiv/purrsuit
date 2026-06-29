import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Proxy API + auth through the dev origin so the browser treats the auth
    // cookie as first-party (mirrors the same-origin rewrites in vercel.json).
    proxy: {
      '/api': 'https://purrsuit-backend.vercel.app/',
      '/auth': 'https://purrsuit-backend.vercel.app/'
    }
  }
})