// HTTP + WebSocket server. In dev, Vite serves the client and proxies /ws here;
// in production this also serves the built client from ../client/dist.

import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocketServer } from 'ws'
import { Room } from './game.js'

const PORT = Number(process.env.PORT) || 3001
const DIST = fileURLToPath(new URL('../client/dist/', import.meta.url))
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' }

const rooms = new Map()

const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '')
  for (const file of [join(DIST, path), join(DIST, 'index.html')]) {
    try {
      const body = await readFile(file)
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
      return res.end(body)
    } catch { /* try next */ }
  }
  res.writeHead(404).end('Not found (run `npm run build` in client/ to serve the app from here)')
})

const wss = new WebSocketServer({ server, path: '/ws' })

wss.on('connection', (ws) => {
  let room = null
  let playerId = null
  ws.isAlive = true
  ws.on('pong', () => (ws.isAlive = true))

  ws.on('message', (raw) => {
    let msg
    try { msg = JSON.parse(raw) } catch { return }

    if (!room) {
      if (msg.type !== 'hello') return
      const code = /^[\w-]{1,64}$/.test(msg.room) ? msg.room : 'default'
      const target = rooms.get(code) ?? new Room(code)
      rooms.set(code, target)
      playerId = target.join(ws, msg.id, msg.name)
      if (!playerId) {
        if (target.empty) rooms.delete(code)
        ws.send(JSON.stringify({ type: 'error', message: 'This room is full.' }))
        return ws.close(4001, 'full')
      }
      room = target
      return
    }
    room.handle(playerId, msg)
  })

  ws.on('close', () => {
    if (!room) return
    room.leave(playerId, ws)
    if (room.empty) {
      room.dispose()
      rooms.delete(room.code)
    }
  })
})

// Drop connections that silently died (closed laptop, lost Wi-Fi) so they show as disconnected.
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) ws.terminate()
    ws.isAlive = false
    ws.ping()
  }
}, 15_000)

server.listen(PORT, () => console.log(`server listening on http://localhost:${PORT}`))
