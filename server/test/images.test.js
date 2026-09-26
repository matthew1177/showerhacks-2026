import assert from 'node:assert/strict'
import { setImmediate } from 'node:timers/promises'
import test from 'node:test'
import { deleteImage, generateImage, getImage } from '../images.js'

function configure(t) {
  const saved = { ...process.env }
  process.env.IMAGE_API_URL = 'http://127.0.0.1:8000'
  process.env.IMAGE_API_SECRET = 'test-image-api-secret'
  delete process.env.IMAGE_TIMEOUT_MS
  t.after(() => {
    for (const key of ['IMAGE_API_URL', 'IMAGE_API_SECRET', 'IMAGE_TIMEOUT_MS']) {
      if (saved[key] === undefined) delete process.env[key]
      else process.env[key] = saved[key]
    }
  })
}

test('players wait for the GPU without consuming their image timeout', async (t) => {
  configure(t)
  const requests = []
  const timeouts = []
  t.mock.method(AbortSignal, 'timeout', (ms) => {
    timeouts.push(ms)
    return new AbortController().signal
  })
  t.mock.method(globalThis, 'fetch', (url, options) => new Promise((resolve) => {
    requests.push({ url, options, resolve })
  }))

  const first = generateImage('duck', 'Cartoon', 80)
  const second = generateImage('panda', 'Photo', 20)
  await setImmediate()
  assert.equal(requests.length, 1)
  assert.deepEqual(timeouts, [300_000])
  assert.equal(requests[0].url, 'http://127.0.0.1:8000/generate')
  assert.equal(requests[0].options.headers.authorization, 'Bearer test-image-api-secret')
  assert.deepEqual(JSON.parse(requests[0].options.body), { prompt: 'duck', style: 'Cartoon', creativity: 80 })

  requests[0].resolve(new Response(Buffer.from('first PNG')))
  const firstId = await first
  await setImmediate()
  assert.equal(requests.length, 2)
  assert.deepEqual(timeouts, [300_000, 300_000])
  assert.deepEqual(JSON.parse(requests[1].options.body), { prompt: 'panda', style: 'Photo', creativity: 20 })
  requests[1].resolve(new Response(Buffer.from('second PNG')))
  const secondId = await second
  assert.equal(getImage(firstId).toString(), 'first PNG')
  assert.equal(getImage(secondId).toString(), 'second PNG')
  deleteImage(firstId)
  deleteImage(secondId)
})

test('a failed image does not block the next player', async (t) => {
  configure(t)
  let calls = 0
  t.mock.method(globalThis, 'fetch', async () => {
    if (calls++ === 0) return new Response(null, { status: 500 })
    return new Response(Buffer.from('PNG'))
  })
  const failed = generateImage('duck', 'Any', 50)
  const next = generateImage('panda', 'Any', 50)
  await assert.rejects(failed, /image API responded 500/)
  const id = await next
  assert.equal(getImage(id).toString(), 'PNG')
  deleteImage(id)
})
