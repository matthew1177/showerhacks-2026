const API = 'https://discord.com/api/v10'

export class DiscordError extends Error {
  constructor(message, status = 401) {
    super(message)
    this.status = status
  }
}

export function createDiscordAuth({
  clientId = process.env.DISCORD_CLIENT_ID || '1553470711308353626',
  clientSecret = process.env.DISCORD_CLIENT_SECRET,
  fetchDiscord = fetch,
} = {}) {
  async function request(path, options) {
    let response
    try {
      response = await fetchDiscord(`${API}${path}`, { ...options, signal: AbortSignal.timeout(10_000) })
    } catch {
      throw new DiscordError('Discord is unavailable. Please try reopening the Activity.', 502)
    }
    if (!response.ok) {
      throw new DiscordError(
        response.status >= 500 || response.status === 429
          ? 'Discord is unavailable. Please try reopening the Activity.'
          : 'Discord sign-in expired or was denied. Close and reopen the Activity.',
        response.status >= 500 || response.status === 429 ? 502 : 401,
      )
    }
    try { return await response.json() } catch {
      throw new DiscordError('Discord returned an invalid response. Please try again.', 502)
    }
  }

  return {
    async exchangeCode(code) {
      if (typeof code !== 'string' || !code.trim() || code.length > 4096) {
        throw new DiscordError('A Discord authorization code is required.', 400)
      }
      if (!clientSecret) {
        throw new DiscordError('Discord sign-in is not configured on the game server. Set DISCORD_CLIENT_SECRET and restart it.', 503)
      }
      const token = await request('/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'authorization_code',
          code,
        }),
      })
      if (typeof token.access_token !== 'string' || !token.access_token) {
        throw new DiscordError('Discord did not return an access token. Please try again.', 502)
      }
      // Do not send refresh tokens or other OAuth response fields to the browser.
      return { access_token: token.access_token }
    },

    async identify(accessToken) {
      if (typeof accessToken !== 'string' || !accessToken || accessToken.length > 4096) {
        throw new DiscordError('Discord sign-in is required. Close and reopen the Activity.')
      }
      const auth = await request('/oauth2/@me', { headers: { Authorization: `Bearer ${accessToken}` } })
      if (auth.application?.id !== clientId || !auth.scopes?.includes('identify') || !/^\d{1,20}$/.test(auth.user?.id)) {
        throw new DiscordError('Discord sign-in could not be verified. Close and reopen the Activity.')
      }
      return { id: `discord:${auth.user.id}`, name: auth.user.global_name || auth.user.username }
    },
  }
}
