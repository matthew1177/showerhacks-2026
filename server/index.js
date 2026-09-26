// One HTTP server serves the frontend and /api in both development and production.
import { loadEnvFile } from 'node:process'
import { fileURLToPath } from 'node:url'
import { createGameServer } from './app.js'

try {
  loadEnvFile(fileURLToPath(new URL('.env', import.meta.url)))
} catch (error) {
  if (error.code !== 'ENOENT') throw error
}

const PORT = Number(process.env.PORT) || 5173
const development = process.argv.includes('--dev')
let vite
const { server } = createGameServer({
  frontend: development ? (req, res) => vite.middlewares(req, res) : undefined,
})
if (development) {
  const { createDevServer } = await import('../client/dev-server.js')
  vite = await createDevServer(server)
  server.on('close', () => { void vite.close() })
}
server.listen(PORT, () => console.log(`server listening on http://localhost:${PORT}`))
