import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Discord Activities are served through a tunnel (e.g. cloudflared) during development.
    allowedHosts: true,
    // Game server (../server). Same-origin keeps it inside Discord's CSP.
    proxy: { '/ws': { target: 'ws://localhost:3001', ws: true } },
  },
})
