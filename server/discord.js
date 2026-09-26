const API = 'https://discord.com/api/v10'

function avatarUrl(user, guildId, memberAvatar) {
  if (memberAvatar) return `/api/avatars/guilds/${guildId}/users/${user.id}/avatars/${memberAvatar}.png`
  if (user.avatar) return `/api/avatars/avatars/${user.id}/${user.avatar}.png`
  const index = user.discriminator && user.discriminator !== '0'
    ? Number(user.discriminator) % 5
    : Number((BigInt(user.id) >> 22n) % 6n)
  return `/api/avatars/embed/avatars/${index}.png`
}

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

    async identify(accessToken, guildId) {
      if (typeof accessToken !== 'string' || !accessToken || accessToken.length > 4096) {
        throw new DiscordError('Discord sign-in is required. Close and reopen the Activity.')
      }
      if (guildId != null && (typeof guildId !== 'string' || !/^\d{1,20}$/.test(guildId))) {
        throw new DiscordError('Invalid Discord server. Close and reopen the Activity.')
      }
      const headers = { Authorization: `Bearer ${accessToken}` }
      const auth = await request('/oauth2/@me', { headers })
      if (auth.application?.id !== clientId || !auth.scopes?.includes('identify') || !/^\d{1,20}$/.test(auth.user?.id)) {
        throw new DiscordError('Discord sign-in could not be verified. Close and reopen the Activity.')
      }
      let name = auth.user.global_name || auth.user.username
      let memberAvatar
      if (guildId != null) {
        if (!auth.scopes.includes('guilds.members.read')) {
          throw new DiscordError('Discord nickname access is required. Close and reopen the Activity to authorize it.')
        }
        // Read the nickname from Discord, never from the joining client's name fields.
        const member = await request(`/users/@me/guilds/${guildId}/member`, { headers })
        if (typeof member.nick === 'string' && member.nick.trim()) name = member.nick
        memberAvatar = member.avatar
      }
      return { id: `discord:${auth.user.id}`, name, avatarUrl: avatarUrl(auth.user, guildId, memberAvatar) }
    },
  }
}
