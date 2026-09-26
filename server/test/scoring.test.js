import assert from 'node:assert/strict'
import test from 'node:test'
import { Room } from '../game.js'

// Fake image API: each "PNG" is its prompt's text, embedded by whether it mentions a cat or a car.
function mockImageApi(t) {
  const env = { IMAGE_API_URL: process.env.IMAGE_API_URL, IMAGE_API_SECRET: process.env.IMAGE_API_SECRET }
  Object.assign(process.env, { IMAGE_API_URL: 'http://image-api.test', IMAGE_API_SECRET: 'image-api-test-secret' })
  t.mock.method(globalThis, 'fetch', async (url, { body }) => {
    if (url.endsWith('/prepare')) return Response.json({ ready: true })
    if (url.endsWith('/generate')) return new Response(JSON.parse(body).prompt)
    const text = String(body)
    return Response.json({ embedding: text.includes('cat') ? [1, 0, 0] : text.includes('car') ? [0, 1, 0] : [0, 0, 1] })
  })
  t.after(() => {
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 10))

test('guesses score by their image’s similarity to the chain’s first image', async (t) => {
  mockImageApi(t)
  const room = new Room('scoring-test')
  t.after(() => room.dispose())
  const [a, b] = ['player-a', 'player-b']
  for (const id of [a, b]) room.join({ send() {} }, id)
  room.handle(a, { type: 'settings', settings: { rounds: 3 } })
  room.handle(a, { type: 'start' })

  // Turn 0 writes your own chain; later turns alternate chains.
  const say = { [a]: ['a cat', 'a dog', 'a cat napping'], [b]: ['a car', 'a cat', 'a red car'] }
  for (let turn = 0; turn < 3; turn++) {
    for (const id of [a, b]) room.handle(id, { type: 'submit', text: say[id][turn] })
    await settle()
  }

  // Final guesses are drawn and scored before the reveal starts.
  assert.equal(room.phase, 'reveal')
  const [chainA, chainB] = room.game.chains
  assert.deepEqual(chainA.steps.filter((s) => s.kind === 'guess').map((s) => s.score), [100, 100])
  assert.deepEqual(chainB.steps.filter((s) => s.kind === 'guess').map((s) => s.score), [0, 100])
  assert.equal(chainA.steps.at(-1).kind, 'image')

  const reveal = () => room.view(a).reveal
  assert.equal(reveal().leaderboard, null, 'scores stay hidden until every chain is revealed')
  while (!reveal().leaderboard) room.handle(a, { type: 'next' })
  assert.deepEqual(reveal().leaderboard, [
    { playerId: b, points: 200, guesses: 2 },
    { playerId: a, points: 100, guesses: 2 },
  ])
})
