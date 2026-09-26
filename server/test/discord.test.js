import assert from 'node:assert/strict'
import test from 'node:test'
import { once } from 'node:events'
import { WebSocket } from 'ws'
import { createGameServer } from '../app.js'
import { createDiscordAuth } from '../discord.js'

const clientId = '1553470711308353626'
const users = {
  alice: { id: '111', username: 'alice', global_name: 'Alice' },
  bob: { id: '222', username: 'bob', global_name: null },
}

function discordAuth(overrides = {}) {
  return createDiscordAuth({
    clientId,
    clientSecret: 'test-secret',
    fetchDiscord: async (url, options) => {
      if (url.endsWith('/oauth2/token')) {
        assert.equal(options.body.get('client_id'), clientId)
        assert.equal(options.body.get('client_secret'), 'test-secret')
        assert.equal(options.body.get('grant_type'), 'authorization_code')
        return Response.json({ access_token: options.body.get('code'), refresh_token: 'not-for-the-client' })
      }
      assert.ok(url.endsWith('/oauth2/@me'))
      const user = users[options.headers.Authorization.replace('Bearer ', '')]
      return user
        ? Response.json({ application: { id: clientId }, scopes: ['identify'], user })
        : Response.json({ message: 'invalid token' }, { status: 401 })
    },
    ...overrides,
  })
}

async function fixture(t, discord = discordAuth()) {
  const { server, wss } = createGameServer({ discord })
  const sockets = []
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const origin = `http://127.0.0.1:${server.address().port}`
  t.after(async () => {
    for (const ws of sockets) ws.terminate()
    for (const ws of wss.clients) ws.terminate()
    await new Promise((resolve) => server.close(resolve))
  })
  return {
    origin,
    async connect(path = '/api/ws') {
      const ws = new WebSocket(`${origin.replace('http:', 'ws:')}${path}`)
      sockets.push(ws)
      await once(ws, 'open')
      return ws
    },
  }
}

function nextMessage(ws, predicate = () => true) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off('message', onMessage)
      reject(new Error('Timed out waiting for server state'))
    }, 2000)
    function onMessage(raw) {
      const message = JSON.parse(raw)
      if (!predicate(message)) return
      clearTimeout(timer)
      ws.off('message', onMessage)
      resolve(message)
    }
    ws.on('message', onMessage)
  })
}

async function send(ws, message, predicate) {
  const response = nextMessage(ws, predicate)
  ws.send(JSON.stringify(message))
  return response
}

const hello = (accessToken, instanceId = 'activity-one') => ({ type: 'hello', discord: { accessToken, instanceId } })

test('token endpoint supports both paths, validates requests, and exposes only the access token', async (t) => {
  const { origin } = await fixture(t)
  for (const path of ['/api/token', '/.proxy/api/token']) {
    const response = await fetch(`${origin}${path}`, { method: 'POST', body: JSON.stringify({ code: 'alice' }) })
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.deepEqual(await response.json(), { access_token: 'alice' })
  }
  assert.equal((await fetch(`${origin}/api/token`)).status, 405)
  for (const body of ['{broken', '{}', 'null']) {
    assert.equal((await fetch(`${origin}/api/token`, { method: 'POST', body })).status, 400)
  }
  assert.equal((await fetch(`${origin}/api/token`, { method: 'POST', body: 'x'.repeat(9000) })).status, 413)
})

test('missing credentials and rejected/wrong-application tokens fail safely', async () => {
  await assert.rejects(discordAuth({ clientSecret: '' }).exchangeCode('code'), { status: 503 })
  await assert.rejects(discordAuth().identify('invalid'), { status: 401 })
  await assert.rejects(discordAuth({
    fetchDiscord: async () => Response.json({ application: { id: 'other-app' }, scopes: ['identify'], user: users.alice }),
  }).identify('alice'), { status: 401 })
  await assert.rejects(discordAuth({ fetchDiscord: async () => { throw new Error('network failure') } }).identify('alice'), { status: 502 })
})

test('Activity players share a game, receive verified identities, and recover their seat', async (t) => {
  const { connect } = await fixture(t)
  const alice = await connect('/.proxy/api/ws')
  const first = await send(alice, { ...hello('alice'), id: 'forged', name: 'forged' })
  assert.equal(first.state.me, 'discord:111')
  assert.equal(first.state.players[0].name, 'Alice')

  const bob = await connect()
  const second = await send(bob, hello('bob'))
  assert.equal(second.state.players.length, 2)
  assert.equal(second.state.players[1].name, 'bob')
  const started = await send(alice, { type: 'start' }, (msg) => msg.state?.phase === 'play')
  assert.equal(started.state.play.task.kind, 'prompt')
  await send(alice, { type: 'submit', text: 'a dancing cat' }, (msg) => msg.state?.play?.submitted === 'a dancing cat')

  const replaced = once(alice, 'close')
  const rejoined = await connect('/.proxy/api/ws')
  const recovered = await send(rejoined, hello('alice'))
  assert.equal(recovered.state.players.length, 2)
  assert.equal(recovered.state.play.submitted, 'a dancing cat')
  assert.equal(recovered.state.hostId, 'discord:111')
  assert.equal((await replaced)[0], 4000)

  await send(bob, { type: 'submit', text: 'a sleepy dog' }, (msg) => msg.state?.play?.turn === 2)
  await send(rejoined, { type: 'submit', text: 'guess one' }, (msg) => msg.state?.play?.submitted === 'guess one')
  const finished = await send(bob, { type: 'submit', text: 'guess two' }, (msg) => msg.state?.phase === 'reveal')
  assert.equal(finished.state.reveal.steps[0].text, 'a dancing cat')
})

test('different Activity instances and website rooms stay separate', async (t) => {
  const { connect } = await fixture(t)
  const alice = await connect()
  await send(alice, hello('alice'))
  const bob = await connect()
  const separate = await send(bob, hello('bob', 'activity-two'))
  assert.equal(separate.state.players.length, 1)
  const guest = await connect()
  const browser = await send(guest, { type: 'hello', room: 'discord:activity-one', id: 'discord:111', name: 'Guest' })
  assert.equal(browser.state.code, 'default')
  assert.equal(browser.state.players.length, 1)
  const anotherGuest = await connect()
  const shared = await send(anotherGuest, { type: 'hello', room: 'default', id: 'guest-two', name: 'Guest Two' })
  assert.equal(shared.state.players.length, 2)
})

test('rejected Discord joins close with an error instead of becoming anonymous players', async (t) => {
  const { connect } = await fixture(t)
  for (const message of [hello('invalid'), hello('alice', ''), { type: 'hello', discord: null }]) {
    const ws = await connect()
    const closed = once(ws, 'close')
    const result = await send(ws, message)
    assert.equal(result.type, 'error')
    assert.equal((await closed)[0], 4002)
  }
})

test('duplicate hello during async authentication cannot join another room', async (t) => {
  const auth = discordAuth()
  let finishAuth
  const pending = new Promise((resolve) => { finishAuth = resolve })
  const { connect } = await fixture(t, { ...auth, identify: async (token) => { await pending; return auth.identify(token) } })
  const ws = await connect()
  const response = nextMessage(ws)
  ws.send(JSON.stringify(hello('alice')))
  ws.send(JSON.stringify({ type: 'hello', room: 'default', id: 'fake' }))
  finishAuth()
  const result = await response
  assert.equal(result.state.code, 'discord:activity-one')
  assert.equal(result.state.me, 'discord:111')
})
