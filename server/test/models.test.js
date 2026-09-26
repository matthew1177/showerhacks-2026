import assert from 'node:assert/strict'
import { setImmediate } from 'node:timers/promises'
import test from 'node:test'
import { Room } from '../game.js'

test('only the host can select a supported model before the game starts', (t) => {
  const room = new Room('model-settings')
  t.after(() => room.dispose())
  room.join({ send() {} }, 'host')
  room.join({ send() {} }, 'guest')
  assert.equal(room.settings.imageModel, 'chroma-flash')
  room.handle('guest', { type: 'settings', settings: { imageModel: 'sdxl-turbo' } })
  assert.equal(room.settings.imageModel, 'chroma-flash')
  room.handle('host', { type: 'settings', settings: { imageModel: 'sdxl-turbo' } })
  assert.equal(room.view('guest').settings.imageModel, 'sdxl-turbo')
  for (const settings of [{ rounds: 3 }, { imageModel: 'arbitrary/repository' }, { imageModel: null }]) {
    room.handle('host', { type: 'settings', settings })
    assert.equal(room.settings.imageModel, 'sdxl-turbo')
  }
  room.phase = 'play'
  room.handle('host', { type: 'settings', settings: { imageModel: 'chroma-flash' } })
  assert.equal(room.settings.imageModel, 'sdxl-turbo')
})

test('rooms prepare and keep their chosen model through final scoring and the next game', async (t) => {
  const saved = { IMAGE_API_URL: process.env.IMAGE_API_URL, IMAGE_API_SECRET: process.env.IMAGE_API_SECRET }
  Object.assign(process.env, { IMAGE_API_URL: 'http://image-api.test', IMAGE_API_SECRET: 'model-test-secret' })
  t.after(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })
  const requests = []
  t.mock.method(globalThis, 'fetch', async (url, { body }) => {
    if (url.endsWith('/embed')) return Response.json({ embedding: [1, 0] })
    const payload = JSON.parse(body)
    requests.push({ path: new URL(url).pathname, ...payload })
    return url.endsWith('/prepare') ? Response.json({ ready: true }) : new Response(payload.prompt)
  })
  const rooms = ['chroma-flash', 'sdxl-turbo'].map((imageModel) => {
    const room = new Room(imageModel)
    t.after(() => room.dispose())
    for (const id of ['host', 'guest']) room.join({ send() {} }, id)
    room.handle('host', { type: 'settings', settings: { rounds: 3, imageModel } })
    room.handle('host', { type: 'start' })
    return room
  })
  for (let turn = 0; turn < 3; turn++) {
    for (const room of rooms) {
      for (const id of ['host', 'guest']) room.handle(id, { type: 'submit', text: `${room.code} ${id} ${turn}` })
    }
    // A stalled queue should fail promptly rather than leaving the test hanging.
    for (let i = 0; i < 100 && rooms.some((room) => room.game.generating); i++) await setImmediate()
    assert.ok(rooms.every((room) => !room.game.generating))
  }
  assert.deepEqual(requests.slice(0, 2), [
    { path: '/prepare', model: 'chroma-flash' }, { path: '/prepare', model: 'sdxl-turbo' },
  ])
  const generations = requests.filter((request) => request.path === '/generate')
  assert.equal(generations.length, 12)
  for (const request of generations) assert.ok(request.prompt.startsWith(request.model))
  for (const room of rooms) {
    assert.equal(room.phase, 'reveal')
    assert.ok(room.leaderboard().every((entry) => entry.points === 200))
  }
  const room = rooms[0]
  room.handle('host', { type: 'lobby' })
  room.handle('host', { type: 'settings', settings: { imageModel: 'sdxl-turbo' } })
  room.handle('host', { type: 'start' })
  await setImmediate()
  assert.equal(room.game.imageModel, 'sdxl-turbo')
  assert.deepEqual(requests.at(-1), { path: '/prepare', model: 'sdxl-turbo' })
})
