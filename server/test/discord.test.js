import assert from 'node:assert/strict'
import test from 'node:test'
import { once } from 'node:events'
import { WebSocket } from 'ws'
import { createGameServer } from '../app.js'
import { createDiscordAuth } from '../discord.js'

const clientId = '1553470711308353626'
const userAvatar = 'a'.repeat(32)
const serverAvatar = 'b'.repeat(32)
const users = {
  alice: { id: '111', username: 'alice', global_name: 'Alice', avatar: userAvatar },
  bob: { id: '222', username: 'bob', global_name: null },
}
const aliceNickname = 'Alice from the voice channel 🐈'

function discordAuth({
  members = { alice: { nick: aliceNickname, avatar: serverAvatar }, bob: { nick: null } },
  scopes = ['identify', 'guilds.members.read'],
  ...overrides
} = {}) {
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
      const token = options.headers.Authorization.replace('Bearer ', '')
      if (url.endsWith('/users/@me/guilds/999/member')) {
        return Response.json(members[token])
      }
      assert.ok(url.endsWith('/oauth2/@me'))
      const user = users[token]
      return user
        ? Response.json({ application: { id: clientId }, scopes, user })
        : Response.json({ message: 'invalid token' }, { status: 401 })
    },
    ...overrides,
  })
}

async function fixture(t, discord = discordAuth(), options = {}) {
  const { server, wss } = createGameServer({ discord, ...options })
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

const hello = (accessToken, instanceId = 'activity-one', guildId = '999') => ({ type: 'hello', discord: { accessToken, instanceId, guildId } })

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

test('Discord names prefer server nicknames, then display names, then usernames', async () => {
  const auth = discordAuth()
  assert.deepEqual(await auth.identify('alice', '999'), { id: 'discord:111', name: aliceNickname, avatarUrl: `/api/avatars/guilds/999/users/111/avatars/${serverAvatar}.png` })
  assert.deepEqual(await auth.identify('alice', null), { id: 'discord:111', name: 'Alice', avatarUrl: `/api/avatars/avatars/111/${userAvatar}.png` })
  assert.deepEqual(await auth.identify('bob', '999'), { id: 'discord:222', name: 'bob', avatarUrl: '/api/avatars/embed/avatars/0.png' })
  assert.deepEqual(await auth.identify('bob'), { id: 'discord:222', name: 'bob', avatarUrl: '/api/avatars/embed/avatars/0.png' })
  for (const nick of [null, '', '   ']) {
    const noNickname = discordAuth({ members: { alice: { nick } } })
    assert.equal((await noNickname.identify('alice', '999')).name, 'Alice')
    assert.equal((await noNickname.identify('alice', '999')).avatarUrl, `/api/avatars/avatars/111/${userAvatar}.png`)
  }
})

test('default Discord pictures match both modern and legacy accounts', async () => {
  for (const [user, index] of [
    [{ id: '8388608', discriminator: '0' }, 2],
    [{ id: '111', discriminator: '1234' }, 4],
  ]) {
    const auth = discordAuth({
      fetchDiscord: async () => Response.json({ application: { id: clientId }, scopes: ['identify'], user: { ...user, username: 'test' } }),
    })
    assert.equal((await auth.identify('token')).avatarUrl, `/api/avatars/embed/avatars/${index}.png`)
  }
})

test('avatars load through browser and Discord proxy paths without forwarding credentials', async (t) => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=', 'base64')
  const paths = [`avatars/111/${userAvatar}.png`, `guilds/999/users/111/avatars/a_${serverAvatar}.png`, 'embed/avatars/2.png']
  const { origin } = await fixture(t, undefined, {
    fetchAvatar: async (url, options) => {
      assert.ok(paths.some((path) => url === `https://cdn.discordapp.com/${path}?size=128`))
      assert.equal(options.headers, undefined)
      assert.equal(options.redirect, 'error')
      return new Response(png, { headers: { 'Content-Type': 'image/png' } })
    },
  })
  for (const prefix of ['', '/.proxy']) {
    for (const path of paths) {
      const response = await fetch(`${origin}${prefix}/api/avatars/${path}`, { headers: { Authorization: 'must-not-forward', Cookie: 'must-not-forward' } })
      assert.equal(response.status, 200)
      assert.equal(response.headers.get('content-type'), 'image/png')
      assert.match(response.headers.get('cache-control'), /max-age=86400/)
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), png)
    }
  }
})

test('avatar proxy rejects arbitrary paths and reports failed image loads without caching them', async (t) => {
  let calls = 0
  const { origin } = await fixture(t, undefined, {
    fetchAvatar: async () => { calls++; return new Response('Missing', { status: 404 }) },
  })
  for (const path of ['https://example.com/avatar.png', 'embed/avatars/9.png', `avatars/111/${userAvatar}.svg`, 'avatars/111/%2fsecret.png']) {
    assert.equal((await fetch(`${origin}/api/avatars/${path}`)).status, 404)
  }
  assert.equal((await fetch(`${origin}/api/avatars/embed/avatars/0.png`, { method: 'POST' })).status, 405)
  assert.equal(calls, 0)
  const missing = await fetch(`${origin}/api/avatars/embed/avatars/0.png`)
  assert.equal(missing.status, 404)
  assert.equal(missing.headers.get('cache-control'), 'no-store')
  assert.equal(calls, 1)

  const unavailable = await fixture(t, undefined, { fetchAvatar: async () => { throw new Error('offline') } })
  assert.equal((await fetch(`${unavailable.origin}/api/avatars/embed/avatars/0.png`)).status, 502)
  const notAnImage = await fixture(t, undefined, { fetchAvatar: async () => new Response('<html>error</html>', { headers: { 'Content-Type': 'text/html' } }) })
  assert.equal((await fetch(`${notAnImage.origin}/api/avatars/embed/avatars/0.png`)).status, 502)
})

test('server nickname lookup requires a valid server and authorized member access', async () => {
  for (const guildId of ['', '../other', 999, {}, '1'.repeat(21)]) {
    await assert.rejects(discordAuth().identify('alice', guildId), /Invalid Discord server/)
  }
  await assert.rejects(discordAuth({ scopes: ['identify'] }).identify('alice', '999'), /nickname access is required/)
  const deniedMember = discordAuth({
    fetchDiscord: async (url) => url.endsWith('/oauth2/@me')
      ? Response.json({ application: { id: clientId }, scopes: ['identify', 'guilds.members.read'], user: users.alice })
      : Response.json({ message: 'Missing Access' }, { status: 403 }),
  })
  await assert.rejects(deniedMember.identify('alice', '999'), { status: 401 })
})

test('Activity players share a game, receive verified identities, and recover their seat', async (t) => {
  const members = { alice: { nick: aliceNickname, avatar: serverAvatar }, bob: { nick: null } }
  const { connect } = await fixture(t, discordAuth({ members }))
  const alice = await connect('/.proxy/api/ws')
  const first = await send(alice, { ...hello('alice'), id: 'forged', name: 'forged', nickname: 'forged', avatarUrl: 'https://example.com/forged.png' })
  assert.equal(first.state.me, 'discord:111')
  assert.equal(first.state.players[0].name, aliceNickname)
  assert.equal(first.state.players[0].avatarUrl, `/api/avatars/guilds/999/users/111/avatars/${serverAvatar}.png`)
  alice.send(JSON.stringify({ type: 'name', name: 'forged' }))
  const unchanged = await send(alice, { type: 'settings', settings: {} })
  assert.equal(unchanged.state.players[0].name, aliceNickname)

  const bob = await connect()
  const second = await send(bob, hello('bob'))
  assert.equal(second.state.players.length, 2)
  assert.equal(second.state.players[1].name, 'bob')
  assert.equal(second.state.players[0].avatarUrl, first.state.players[0].avatarUrl)
  const started = await send(alice, { type: 'start' }, (msg) => msg.state?.phase === 'play')
  assert.equal(started.state.play.task.kind, 'prompt')
  await send(alice, { type: 'submit', text: 'a dancing cat' }, (msg) => msg.state?.play?.submitted === 'a dancing cat')

  const replaced = once(alice, 'close')
  members.alice.nick = '🎨'.repeat(32)
  members.alice.avatar = null
  const rejoined = await connect('/.proxy/api/ws')
  const recovered = await send(rejoined, hello('alice'))
  assert.equal(recovered.state.players.length, 2)
  assert.equal(recovered.state.play.submitted, 'a dancing cat')
  assert.equal(recovered.state.hostId, 'discord:111')
  assert.equal(recovered.state.players[0].name, members.alice.nick)
  assert.equal(recovered.state.players[0].avatarUrl, `/api/avatars/avatars/111/${userAvatar}.png`)
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
  const browser = await send(guest, { type: 'hello', room: 'discord:activity-one', id: 'discord:111', name: 'Guest', avatarUrl: 'https://example.com/forged.png' })
  assert.equal(browser.state.code, 'default')
  assert.equal(browser.state.players.length, 1)
  assert.equal(browser.state.players[0].name, 'Player 1')
  assert.equal(browser.state.players[0].avatarUrl, null)
  guest.send(JSON.stringify({ type: 'name', name: 'Custom guest name' }))
  const anotherGuest = await connect()
  const shared = await send(anotherGuest, { type: 'hello', room: 'default', id: 'guest-two', name: 'Guest Two' })
  assert.equal(shared.state.players.length, 2)
  assert.deepEqual(shared.state.players.map((player) => player.name), ['Player 1', 'Player 2'])
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
  const { connect } = await fixture(t, { ...auth, identify: async (...args) => { await pending; return auth.identify(...args) } })
  const ws = await connect()
  const response = nextMessage(ws)
  ws.send(JSON.stringify(hello('alice')))
  ws.send(JSON.stringify({ type: 'hello', room: 'default', id: 'fake' }))
  finishAuth()
  const result = await response
  assert.equal(result.state.code, 'discord:activity-one')
  assert.equal(result.state.me, 'discord:111')
})
