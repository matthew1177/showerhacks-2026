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
  assert.deepEqual(JSON.parse(response.headers.get('x-image-modifiers')), [])
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), png)
  assert.deepEqual(requests[1].body, { prompt: 'duck on the moon', style: 'Claymation', creativity: 80 })
  assert.ok(requests.every((req) => req.authorization === 'Bearer local-test-secret-only'))
})

test('playground returns the exact modifiers alongside the PNG', async (t) => {
  const modifiers = ['everything is made of wobbly jelly', 'the scene is inside a snow globe']
  const { post } = await fixture(t, (req, res) => res.writeHead(200, {
    'Content-Type': 'image/png', 'X-Image-Modifiers': JSON.stringify(modifiers),
  }).end(png))
  const response = await post({ prompt: 'duck', creativity: 90 })
  assert.equal(response.status, 200)
  assert.deepEqual(JSON.parse(response.headers.get('x-image-modifiers')), modifiers)
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), png)
})

function playgroundRequest(origin, headers, { method = 'POST', path = '/api/image-test' } = {}) {
  // Use raw HTTP to model the Host and forwarding headers received from a tunnel.
  return new Promise((resolve, reject) => {
    const req = request(`${origin}${path}`, { method, headers: { 'Content-Type': 'application/json', ...headers } }, (res) => {
      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }))
      res.on('error', reject)
    })
    req.on('error', reject)
    req.end(method === 'POST' ? JSON.stringify({ prompt: 'duck', model: 'sdxl-turbo' }) : undefined)
  })
}

test('public tunnel playground checks readiness and generates PNGs through the game server', async (t) => {
  const { origin, requests } = await fixture(t)
  const headers = {
    Host: 'playground.example.com',
    'X-Forwarded-For': '203.0.113.1',
    'X-Forwarded-Proto': 'https',
    'CF-Connecting-IP': '203.0.113.1',
    'CF-Ray': 'test-ray',
    'Sec-Fetch-Site': 'same-origin',
  }
  const status = await playgroundRequest(origin, headers, { method: 'GET' })
  assert.equal(status.status, 200)
  assert.equal(JSON.parse(status.body).ready, true)
  const response = await playgroundRequest(origin, { ...headers, Origin: 'https://playground.example.com' })
  assert.equal(response.status, 200)
  assert.equal(response.headers['content-type'], 'image/png')
  assert.deepEqual(response.body, png)
  assert.deepEqual(requests[1].body, { prompt: 'duck', style: 'Any', creativity: 50, model: 'sdxl-turbo' })
  assert.ok(requests.every((req) => req.authorization === 'Bearer local-test-secret-only'))
  const proxy = await playgroundRequest(origin, headers, { method: 'GET', path: '/.proxy/api/image-test' })
  assert.equal(proxy.status, 200)
})

test('playground rejects cross-site requests before reaching the model', async (t) => {
  const { origin, requests } = await fixture(t)
  for (const headers of [
    { Origin: 'https://external.example.com' }, { Origin: 'null' },
    { Host: 'playground.example.com', Origin: 'https://external.example.com', 'X-Forwarded-Host': 'external.example.com' },
    { Host: 'playground.example.com', Origin: 'https://playground.example.com.evil.example' },
    { Host: 'playground.example.com', Origin: 'https://playground.example.com', 'Sec-Fetch-Site': 'cross-site' },
    { 'Sec-Fetch-Site': 'cross-site' },
  ]) {
    const response = await playgroundRequest(origin, headers)
    assert.equal(response.status, 403, JSON.stringify(headers))
  }
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
