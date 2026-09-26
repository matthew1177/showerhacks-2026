// Same-origin HTTP and WebSocket endpoints for both the website and Discord Activity.
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocket, WebSocketServer } from 'ws'
import { Room } from './game.js'
import { createDiscordAuth, DiscordError } from './discord.js'
import { getImage } from './images.js'

const DIST = fileURLToPath(new URL('../client/dist/', import.meta.url))
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' }

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(data))
}

async function readJson(req) {
  let size = 0
  const chunks = []
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    size += chunk.length
    if (size > 8192) {
      req.resume()
      throw new DiscordError('Request is too large.', 413)
    }
    chunks.push(chunk)
  }
  try { return JSON.parse(Buffer.concat(chunks).toString()) } catch {
    throw new DiscordError('Expected a JSON request body.', 400)
  }
}

function requestPath(url) {
  // Discord normally strips /.proxy before forwarding; accept either form.
  return new URL(url, 'http://localhost').pathname.replace(/^\/\.proxy(?=\/)/, '')
}

export function createGameServer({ discord = createDiscordAuth(), frontend } = {}) {
  const rooms = new Map()
  const server = createServer(async (req, res) => {
    try {
      const pathname = requestPath(req.url)
      // Generated images. Ids are random UUIDs only handed to players in that game.
      const image = pathname.match(/^\/images\/([0-9a-f-]{36})\.png$/)
      if (image) {
        const png = getImage(image[1])
        if (!png) return res.writeHead(404).end()
        res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'private, max-age=3600' })
        return res.end(png)
      }
      if (pathname === '/api' && req.method === 'GET') return json(res, 200, { status: 'ok' })
      if (pathname === '/api/token') {
        if (req.method !== 'POST') {
          res.setHeader('Allow', 'POST')
          return json(res, 405, { error: 'Use POST to sign in.' })
        }
        const body = await readJson(req)
        return json(res, 200, await discord.exchangeCode(body?.code))
      }
      if (pathname === '/api' || pathname.startsWith('/api/')) return json(res, 404, { error: 'Unknown endpoint.' })
      if (frontend) {
        req.url = req.url.replace(/^\/\.proxy(?=\/)/, '')
        return frontend(req, res)
      }

      const path = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '')
      for (const file of [join(DIST, path), join(DIST, 'index.html')]) {
        try {
          const body = await readFile(file)
          res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
          return res.end(body)
        } catch { /* try next */ }
      }
      res.writeHead(404).end('Not found (run `npm run build` in client/ to serve the app from here)')
    } catch (error) {
      json(res, error instanceof DiscordError ? error.status : 400, {
        error: error instanceof DiscordError ? error.message : 'Could not process this request.',
      })
    }
  })

  const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 })
  server.on('upgrade', (req, socket, head) => {
    const path = requestPath(req.url)
    // Leave Vite's development-only refresh socket for its own upgrade listener.
    if (frontend && path === '/__vite_hmr') {
      if (!req.url.startsWith('/.proxy/')) req.url = `/.proxy${req.url}`
      return
    }
    if (path !== '/api/ws' && path !== '/ws') return socket.destroy()
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws))
  })

  wss.on('connection', (ws) => {
    let room = null
    let playerId = null
    let joining = false
    ws.isAlive = true
    ws.on('pong', () => (ws.isAlive = true))
    ws.on('error', () => ws.terminate())

    ws.on('message', async (raw) => {
      let msg
      try { msg = JSON.parse(raw) } catch { return }
      if (!msg || typeof msg !== 'object' || joining || ws.readyState !== WebSocket.OPEN) return

      if (!room) {
        if (msg.type !== 'hello') return
        joining = true
        try {
          let code = typeof msg.room === 'string' && /^[\w-]{1,64}$/.test(msg.room) ? msg.room : 'default'
          let identity = { id: msg.id, name: msg.name }
          if ('discord' in msg) {
            const instanceId = msg.discord?.instanceId
            if (typeof instanceId !== 'string' || !/^[\w-]{1,128}$/.test(instanceId)) {
              throw new DiscordError('Invalid Activity room. Close and reopen the Activity.')
            }
            identity = await discord.identify(msg.discord?.accessToken)
            // Browser room codes cannot enter this namespace or claim a Discord seat.
            code = `discord:${instanceId}`
          }
          if (ws.readyState !== WebSocket.OPEN) return
          const target = rooms.get(code) ?? new Room(code)
          rooms.set(code, target)
          playerId = target.join(ws, identity.id, identity.name)
          if (!playerId) {
            if (target.empty) rooms.delete(code)
            ws.send(JSON.stringify({ type: 'error', message: 'This room is full.' }))
            return ws.close(4001, 'full')
          }
          room = target
        } catch (error) {
          if (ws.readyState !== WebSocket.OPEN) return
          ws.send(JSON.stringify({ type: 'error', message: error instanceof DiscordError ? error.message : 'Could not sign in with Discord. Please reopen the Activity.' }))
          ws.close(4002, 'authentication failed')
        } finally {
          joining = false
        }
        return
      }
      if (room.sockets.get(playerId) === ws) room.handle(playerId, msg)
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

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) {
        ws.terminate()
        continue
      }
      ws.isAlive = false
      ws.ping()
    }
  }, 15_000)
  heartbeat.unref()
  server.on('close', () => {
    clearInterval(heartbeat)
    for (const room of rooms.values()) room.dispose()
    wss.close()
  })

  return { server, wss }
}
