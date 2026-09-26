import assert from 'node:assert/strict'
import test from 'node:test'
import { backendUrl, initializeSession, savedName, saveName, websocketUrl } from '../src/session.js'

const embedded = new URL('https://1553470711308353626.discordsays.com/?frame_id=frame&room=ignored')

test('Discord uses secure proxied endpoints; browser previews use normal endpoints', () => {
  assert.equal(backendUrl('/api/token', embedded).href, `${embedded.origin}/.proxy/api/token`)
  assert.equal(backendUrl('/api/avatars/embed/avatars/0.png', embedded).href, `${embedded.origin}/.proxy/api/avatars/embed/avatars/0.png`)
  assert.equal(websocketUrl(embedded), 'wss://1553470711308353626.discordsays.com/.proxy/api/ws')
  assert.equal(websocketUrl(new URL('http://localhost:5173/?room=friends')), 'ws://localhost:5173/api/ws')
  assert.equal(websocketUrl(new URL('https://example.com/')), 'wss://example.com/api/ws')
})

test('browser sessions retain a guest seat without invoking Discord or requiring storage', async () => {
  const options = {
    location: new URL('http://localhost:5173/?room=friends'),
    createDiscord: () => assert.fail('Browser previews must not initialize Discord'),
    fetchToken: () => assert.fail('Browser previews must not request OAuth'),
  }
  const first = await initializeSession(options)
  const second = await initializeSession(options)
  assert.equal(first.type, 'hello')
  assert.equal(first.room, 'friends')
  assert.ok(first.id)
  assert.equal(first.id, second.id)
  assert.equal(first.discord, undefined)
  assert.equal(first.name, undefined)
})

for (const guildId of ['999', null]) {
  test(`Activity handshake uses its instance and requests nickname access only in a server (${guildId})`, async () => {
    const calls = []
    let makeReady
    const ready = new Promise((resolve) => { makeReady = resolve })
    const result = initializeSession({
      location: embedded,
      createDiscord: () => ({
        instanceId: 'activity-one',
        guildId,
        ready: () => ready,
        commands: {
          authorize: async (args) => {
            assert.deepEqual(args.scope, guildId ? ['identify', 'guilds.members.read'] : ['identify'])
            calls.push('authorize')
            return { code: 'test-code' }
          },
          authenticate: async (args) => {
            assert.deepEqual(args, { access_token: 'test-access' })
            calls.push('authenticate')
            return { user: { id: '123' } }
          },
        },
      }),
      fetchToken: async (url, options) => {
        assert.equal(url.pathname, '/.proxy/api/token')
        assert.deepEqual(JSON.parse(options.body), { code: 'test-code' })
        calls.push('exchange')
        return Response.json({ access_token: 'test-access' })
      },
    })
    assert.deepEqual(calls, [])
    makeReady()
    assert.deepEqual(await result, { type: 'hello', discord: { instanceId: 'activity-one', guildId, accessToken: 'test-access' } })
    assert.deepEqual(calls, ['authorize', 'exchange', 'authenticate'])
  })
}

test('browser names are saved per tab with a fallback when storage is blocked', (t) => {
  const stored = new Map()
  const original = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'sessionStorage', original)
    else delete globalThis.sessionStorage
  })
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: {
    getItem: (key) => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, value),
  } })
  saveName('Web player')
  assert.equal(stored.get('playerName'), 'Web player')
  assert.equal(savedName(), 'Web player')
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, get() { throw new Error('Storage blocked') } })
  saveName('Offline name')
  assert.equal(savedName(), 'Offline name')
})

test('OAuth failures surface the server error instead of joining a guest room', async () => {
  await assert.rejects(initializeSession({
    location: embedded,
    createDiscord: () => ({
      instanceId: 'activity-one',
      ready: async () => {},
      commands: {
        authorize: async () => ({ code: 'test-code' }),
        authenticate: () => assert.fail('Do not authenticate after a failed exchange'),
      },
    }),
    fetchToken: async () => Response.json({ error: 'Sign-in is not configured' }, { status: 503 }),
  }), /Sign-in is not configured/)
})

test('missing Activity instance cannot silently enter the default browser room', async () => {
  await assert.rejects(initializeSession({
    location: embedded,
    createDiscord: () => ({ ready: async () => {} }),
  }), /did not provide an Activity room/)
})
