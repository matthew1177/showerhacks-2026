import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer, request } from 'node:http'
import test from 'node:test'
import { createGameServer } from '../app.js'

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64')

async function fixture(t, generate = (req, res) => res.writeHead(200, { 'Content-Type': 'image/png' }).end(png)) {
  const requests = []
  const upstream = createServer(async (req, res) => {
    let body = ''
    for await (const chunk of req) body += chunk
    requests.push({ path: req.url, authorization: req.headers.authorization, body: body ? JSON.parse(body) : null })
    if (req.url === '/health') return res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ready: true, model: 'lodestones/Chroma1-HD', size: 768, steps: 28 }))
    generate(req, res)
  })
  upstream.listen(0, '127.0.0.1')
  await once(upstream, 'listening')
  const saved = { url: process.env.IMAGE_API_URL, secret: process.env.IMAGE_API_SECRET }
  process.env.IMAGE_API_URL = `http://127.0.0.1:${upstream.address().port}`
  process.env.IMAGE_API_SECRET = 'local-test-secret-only'
  const { server } = createGameServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(async () => {
    await Promise.all([server, upstream].map((s) => new Promise((resolve) => s.close(resolve))))
    for (const [key, value] of [['IMAGE_API_URL', saved.url], ['IMAGE_API_SECRET', saved.secret]]) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })
  const origin = `http://127.0.0.1:${server.address().port}`
  const post = (body, headers = {}) => fetch(`${origin}/api/image-test`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, ...headers }, body: JSON.stringify(body),
  })
  return { origin, requests, post }
}

test('local playground checks readiness and returns an actual PNG without exposing the secret', async (t) => {
  const { origin, requests, post } = await fixture(t)
  const status = await (await fetch(`${origin}/api/image-test`)).json()
  assert.deepEqual(status, { ready: true, model: 'lodestones/Chroma1-HD', size: 768, steps: 28 })
  const response = await post({ prompt: '  duck on the moon  ', style: 'Claymation', creativity: 80 })
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('content-type'), 'image/png')
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.ok(Number(response.headers.get('x-generation-time-ms')) >= 0)
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), png)
  assert.deepEqual(requests[1].body, { prompt: 'duck on the moon', style: 'Claymation', creativity: 80 })
  assert.ok(requests.every((req) => req.authorization === 'Bearer local-test-secret-only'))
})

test('playground rejects tunnels, Discord proxies, and cross-site requests before reaching the model', async (t) => {
  const { origin, requests } = await fixture(t)
  for (const headers of [
    { Host: 'public.example.com' }, { Origin: 'https://external.example.com' },
    { 'X-Forwarded-For': '203.0.113.1' }, { 'CF-Connecting-IP': '203.0.113.1' },
    { 'Sec-Fetch-Site': 'cross-site' },
  ]) {
    // Use raw HTTP: fetch normalizes protected headers such as Host.
    const status = await new Promise((resolve, reject) => {
      const req = request(`${origin}/api/image-test`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers } }, (res) => {
        res.resume()
        resolve(res.statusCode)
      })
      req.on('error', reject)
      req.end(JSON.stringify({ prompt: 'duck' }))
    })
    assert.equal(status, 403, JSON.stringify(headers))
  }
  assert.equal((await fetch(`${origin}/.proxy/api/image-test`)).status, 403)
  assert.equal(requests.length, 0)
})

test('playground forwards each supported model and rejects unknown choices', async (t) => {
  const { requests, post } = await fixture(t)
  for (const model of ['chroma-flash', 'sdxl-turbo']) {
    const response = await post({ prompt: 'duck', model })
    assert.equal(response.status, 200)
    await response.arrayBuffer()
    assert.equal(requests.at(-1).body.model, model)
  }
  assert.equal((await post({ prompt: 'duck', model: 'unknown' })).status, 422)
  assert.equal(requests.length, 2)
})

test('playground validates input and reports unavailable generation without a placeholder', async (t) => {
  const { origin, requests, post } = await fixture(t, (req, res) => res.writeHead(500).end())
  for (const body of [null, {}, { prompt: ' ' }, { prompt: 'a'.repeat(201) }, { prompt: 'duck', style: 'invalid' }, { prompt: 'duck', creativity: 101 }, { prompt: 'duck', creativity: 1.5 }]) {
    assert.equal((await post(body)).status, 422)
  }
  assert.equal((await fetch(`${origin}/api/image-test`, { method: 'POST', body: '{}' })).status, 415)
  assert.equal(requests.length, 0)
  const failed = await post({ prompt: 'duck' })
  assert.equal(failed.status, 503)
  assert.match((await failed.json()).error, /could not finish/)
  assert.equal((await post({ prompt: 'panda' })).status, 503, 'failure must release the playground lock')
})

test('only one playground request can wait on the GPU at a time', async (t) => {
  let release
  const started = Promise.withResolvers()
  const { post } = await fixture(t, (req, res) => {
    release = () => res.writeHead(200, { 'Content-Type': 'image/png' }).end(png)
    started.resolve()
  })
  const first = post({ prompt: 'duck' })
  await started.promise
  const overlapping = await post({ prompt: 'panda' })
  assert.equal(overlapping.status, 409)
  release()
  assert.equal((await first).status, 200)
})
