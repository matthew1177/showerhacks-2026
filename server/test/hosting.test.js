import assert from 'node:assert/strict'
import test from 'node:test'
import { once } from 'node:events'
import { WebSocket } from 'ws'
import { createGameServer } from '../app.js'
import { createDevServer } from '../../client/dev-server.js'

test('one development server serves React, relative API requests, and multiplayer', async (t) => {
  let vite
  const { server, wss } = createGameServer({ frontend: (req, res) => vite.middlewares(req, res) })
  vite = await createDevServer(server)
  const sockets = []
  t.after(async () => {
    for (const ws of sockets) ws.terminate()
    for (const ws of wss.clients) ws.terminate()
    await vite.close()
    await new Promise((resolve) => server.close(resolve))
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const origin = `http://127.0.0.1:${server.address().port}`
  assert.equal(vite.httpServer, null, 'Vite must not open another HTTP port')
  for (const prefix of ['', '/.proxy']) {
    const page = await fetch(`${origin}${prefix}/`)
    assert.equal(page.status, 200)
    assert.match(await page.text(), /src="\/@vite\/client"/)
    const source = await fetch(`${origin}${prefix}/src/main.jsx`)
    assert.equal(source.status, 200)
    assert.match(source.headers.get('content-type'), /javascript/)
    assert.deepEqual(await (await fetch(`${origin}${prefix}/api`)).json(), { status: 'ok' })
    const badCode = await fetch(`${origin}${prefix}/api/token`, { method: 'POST', body: '{}' })
    assert.equal(badCode.status, 400)
    assert.match((await badCode.json()).error, /authorization code/)
    const missing = await fetch(`${origin}${prefix}/api/missing`)
    assert.equal(missing.status, 404)
    assert.match(missing.headers.get('content-type'), /json/)

    const ws = new WebSocket(`${origin.replace('http:', 'ws:')}${prefix}/api/ws`)
    sockets.push(ws)
    await once(ws, 'open')
    const reply = once(ws, 'message')
    ws.send(JSON.stringify({ type: 'hello', room: 'shared-server', id: prefix || 'browser' }))
    const state = JSON.parse((await reply)[0]).state
    assert.equal(state.code, 'shared-server')
    assert.equal(state.players.length, prefix ? 2 : 1)
  }
})
