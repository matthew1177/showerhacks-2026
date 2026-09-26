import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

// Vite transforms the frontend inside the game server; it opens no second port.
export function createDevServer(server) {
  return createServer({
    root: fileURLToPath(new URL('.', import.meta.url)),
    // The config is plain JS; avoid temporary config bundles triggering node --watch.
    configLoader: 'native',
    server: {
      middlewareMode: true,
      ws: { server, path: '/.proxy/__vite_hmr' },
    },
  })
}
