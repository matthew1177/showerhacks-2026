import { DiscordSDK } from '@discord/embedded-app-sdk'

const CLIENT_ID = import.meta.env?.VITE_DISCORD_CLIENT_ID || '1553470711308353626'
let sessionPromise
let guestId
let guestName = ''

export function savedName() {
  try { return sessionStorage.getItem('playerName') || guestName } catch { return guestName }
}

export function saveName(name) {
  guestName = name
  try { sessionStorage.setItem('playerName', name) } catch { /* Keep the name in memory if storage is blocked. */ }
}

function playerId() {
  if (guestId) return guestId
  try {
    guestId = sessionStorage.getItem('playerId') || crypto.randomUUID()
    sessionStorage.setItem('playerId', guestId)
  } catch {
    guestId = crypto.randomUUID()
  }
  return guestId
}

export function backendUrl(path, location = window.location) {
  const embedded = new URLSearchParams(location.search).has('frame_id')
  return new URL(`${embedded ? '/.proxy' : ''}${path}`, location.origin)
}

export function websocketUrl(location = window.location) {
  const url = backendUrl('/api/ws', location)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.href
}

export async function initializeSession({
  location = window.location,
  createDiscord = () => new DiscordSDK(CLIENT_ID),
  fetchToken = fetch,
} = {}) {
  const params = new URLSearchParams(location.search)
  if (!params.has('frame_id')) {
    return { type: 'hello', room: params.get('room') ?? 'default', id: playerId() }
  }

  const discord = createDiscord()
  let readyTimer
  try {
    await Promise.race([
      discord.ready(),
      new Promise((_, reject) => {
        readyTimer = setTimeout(() => reject(new Error('Discord did not connect. Close and reopen the Activity.')), 15_000)
      }),
    ])
  } finally {
    clearTimeout(readyTimer)
  }
  if (typeof discord.instanceId !== 'string' || !/^[\w-]{1,128}$/.test(discord.instanceId)) {
    throw new Error('Discord did not provide an Activity room. Close and reopen the Activity.')
  }
  let code
  try {
    const authorization = await discord.commands.authorize({
      client_id: CLIENT_ID,
      response_type: 'code',
      state: '',
      prompt: 'none',
      scope: discord.guildId ? ['identify', 'guilds.members.read'] : ['identify'],
    })
    code = authorization.code
  } catch (error) {
    if (error?.message?.includes('redirect_uri')) {
      throw new Error('Discord OAuth setup needs a redirect URL. In the Discord Developer Portal, open this app → OAuth2 → Redirects, add https://127.0.0.1, save changes, then reopen the Activity.')
    }
    throw error
  }
  let response
  try {
    response = await fetchToken(backendUrl('/api/token', location), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    throw new Error('Could not reach the game server for Discord sign-in. Check that the shared server and its tunnel are running, then reopen the Activity.')
  }
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    if (typeof data?.error === 'string' && data.error) throw new Error(data.error)
    if (response.status === 404) {
      throw new Error('Discord sign-in endpoint not found (HTTP 404). Run npm run dev from the project root and point the tunnel at the same server (port 5173 by default).')
    }
    throw new Error(`The game server could not complete Discord sign-in (HTTP ${response.status}). Check the server and tunnel, then reopen the Activity.`)
  }
  if (typeof data?.access_token !== 'string' || !data.access_token) {
    throw new Error('The sign-in URL did not return a Discord access token. Run npm run dev from the project root and point the tunnel at the same server (port 5173 by default).')
  }
  const auth = await discord.commands.authenticate({ access_token: data.access_token })
  if (!auth?.user?.id) throw new Error('Discord sign-in failed. Close and reopen the Activity.')

  // The server verifies this token and supplies the player ID/name itself.
  // Keep credentials in memory; never put them in a URL or browser storage.
  return {
    type: 'hello',
    discord: { instanceId: discord.instanceId, guildId: discord.guildId ?? null, accessToken: data.access_token },
  }
}

export function getSession() {
  // React StrictMode and reconnects must share one SDK/OAuth handshake.
  return sessionPromise ??= initializeSession()
}
