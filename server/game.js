// Room + game state for one lobby. All game logic is server-authoritative;
// clients only receive a per-player view (see `view`) so nobody can peek at other chains.

import { randomUUID } from 'node:crypto'

const COLORS = ['mauve', 'pink', 'green', 'yellow', 'red', 'blue', 'peach', 'teal', 'lavender', 'rosewater']
const ART_STYLES = ['Any', 'Photo', 'Cartoon', 'Pixel art', 'Oil painting', 'Claymation']
const ROUND_OPTIONS = [3, 4, 5, 6, 8, 10]
const TIME_OPTIONS = [30, 45, 60, 90]

export const MAX_PLAYERS = 12
const MAX_TEXT = 120
const MAX_NAME = 20
const GRACE_MS = 1000 // extra time for last-second drafts to arrive
const TIMED_OUT = '(ran out of time)'

const clean = (s, max) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, max) : '')

export class Room {
  constructor(code) {
    this.code = code
    this.players = [] // { id, name, color, connected }
    this.sockets = new Map() // playerId -> ws
    this.hostId = null
    this.settings = { rounds: 6, promptSeconds: 60, guessSeconds: 45, artStyle: 'Any' }
    this.phase = 'lobby' // lobby | play | reveal
    this.game = null
    this.reveal = null
  }

  get empty() {
    return this.sockets.size === 0
  }

  // ---------- connections ----------

  join(ws, id, name) {
    let player = this.players.find((p) => p.id === id)
    if (!player) {
      if (this.players.length >= MAX_PLAYERS) return null
      const used = new Set(this.players.map((p) => p.color))
      player = {
        id: typeof id === 'string' && id.length <= 64 ? id : randomUUID(),
        name: clean(name, MAX_NAME) || `Player ${this.players.length + 1}`,
        color: COLORS.find((c) => !used.has(c)) ?? COLORS[this.players.length % COLORS.length],
        connected: true,
      }
      this.players.push(player)
    }
    // Same player opened a second tab: the new connection wins.
    this.sockets.get(player.id)?.close(4000, 'replaced')
    this.sockets.set(player.id, ws)
    player.connected = true
    if (!this.connected(this.hostId)) this.hostId = player.id
    this.broadcast()
    return player.id
  }

  leave(id, ws) {
    if (this.sockets.get(id) !== ws) return // already replaced by a newer connection
    this.sockets.delete(id)
    const player = this.players.find((p) => p.id === id)
    if (player) player.connected = false
    if (this.phase === 'lobby') this.players = this.players.filter((p) => p.id !== id)
    if (this.hostId === id) this.hostId = this.players.find((p) => p.connected)?.id ?? null
    if (this.phase === 'play') this.maybeEndTurn()
    this.broadcast()
  }

  dispose() {
    clearTimeout(this.game?.timer)
  }

  connected(id) {
    return this.sockets.has(id)
  }

  // ---------- messages ----------

  handle(id, msg) {
    const isHost = id === this.hostId
    switch (`${this.phase}:${msg.type}`) {
      case 'lobby:name': {
        const name = clean(msg.name, MAX_NAME)
        const player = this.players.find((p) => p.id === id)
        if (name && player) player.name = name
        break
      }
      case 'lobby:settings':
        if (isHost) this.updateSettings(msg.settings ?? {})
        break
      case 'lobby:start':
        if (isHost && this.players.length >= 2) this.startGame()
        break
      case 'play:draft':
        this.game.drafts.set(id, clean(msg.text, MAX_TEXT))
        return // drafts are silent; no broadcast
      case 'play:submit': {
        const text = clean(msg.text, MAX_TEXT)
        if (!text || !this.game.order.includes(id)) return
        this.game.submissions.set(id, text)
        this.maybeEndTurn()
        break
      }
      case 'play:unsubmit':
        this.game.submissions.delete(id)
        break
      case 'reveal:next':
        if (isHost) this.revealNext()
        break
      case 'reveal:lobby':
        if (isHost) this.backToLobby()
        break
      default:
        return
    }
    this.broadcast()
  }

  updateSettings(s) {
    const pick = (value, options, fallback) => (options.includes(Number(value)) ? Number(value) : fallback)
    this.settings = {
      rounds: pick(s.rounds, ROUND_OPTIONS, this.settings.rounds),
      promptSeconds: pick(s.promptSeconds, TIME_OPTIONS, this.settings.promptSeconds),
      guessSeconds: pick(s.guessSeconds, TIME_OPTIONS, this.settings.guessSeconds),
      artStyle: ART_STYLES.includes(s.artStyle) ? s.artStyle : this.settings.artStyle,
    }
  }

  // ---------- game flow ----------

  startGame() {
    const order = this.players.map((p) => p.id)
    this.phase = 'play'
    this.game = {
      order,
      // Each player works on each chain at most once, so the chain can't be longer than the player count.
      turns: Math.min(this.settings.rounds, order.length),
      turn: 0,
      chains: order.map((ownerId) => ({ ownerId, steps: [] })),
      submissions: new Map(),
      drafts: new Map(),
      endsAt: 0,
      timer: null,
    }
    this.startTurn()
  }

  startTurn() {
    const g = this.game
    g.submissions.clear()
    g.drafts.clear()
    const seconds = g.turn === 0 ? this.settings.promptSeconds : this.settings.guessSeconds
    g.endsAt = Date.now() + seconds * 1000
    clearTimeout(g.timer)
    g.timer = setTimeout(() => {
      this.endTurn()
      this.broadcast()
    }, seconds * 1000 + GRACE_MS)
  }

  // Player i works on chain (i + turn) % n, so turn 0 is their own chain.
  chainFor(id) {
    const g = this.game
    const i = g.order.indexOf(id)
    return i === -1 ? null : g.chains[(i + g.turn) % g.order.length]
  }

  maybeEndTurn() {
    const g = this.game
    const waiting = g.order.some((id) => this.connected(id) && !g.submissions.has(id))
    if (!waiting) this.endTurn()
  }

  endTurn() {
    const g = this.game
    const last = g.turn + 1 >= g.turns
    for (const id of g.order) {
      const text = g.submissions.get(id) || g.drafts.get(id) || TIMED_OUT
      const chain = this.chainFor(id)
      chain.steps.push({ kind: g.turn === 0 ? 'prompt' : 'guess', playerId: id, text })
      // Stand-in for the image model: an opaque seed so the guesser can't read the prompt from it.
      if (!last) chain.steps.push({ kind: 'image', seed: randomUUID() })
    }
    if (last) {
      clearTimeout(g.timer)
      this.phase = 'reveal'
      this.reveal = { chain: 0, shown: 1 }
    } else {
      g.turn++
      this.startTurn()
    }
  }

  revealNext() {
    const r = this.reveal
    const chains = this.game.chains
    if (r.shown < chains[r.chain].steps.length) r.shown++
    else if (r.chain + 1 < chains.length) Object.assign(r, { chain: r.chain + 1, shown: 1 })
  }

  backToLobby() {
    this.phase = 'lobby'
    this.game = null
    this.reveal = null
    this.players = this.players.filter((p) => this.connected(p.id))
  }

  // ---------- output ----------

  view(id) {
    const g = this.game
    const base = {
      code: this.code,
      me: id,
      hostId: this.hostId,
      phase: this.phase,
      settings: this.settings,
      players: this.players.map((p) => ({
        ...p,
        connected: this.connected(p.id),
        done: this.phase === 'play' && g.submissions.has(p.id),
      })),
    }

    if (this.phase === 'play') {
      const chain = this.chainFor(id)
      base.play = {
        turn: g.turn + 1,
        turns: g.turns,
        msLeft: Math.max(0, g.endsAt - Date.now()),
        seconds: g.turn === 0 ? this.settings.promptSeconds : this.settings.guessSeconds,
        // null = joined mid-game, just watching
        task: !chain ? null : g.turn === 0 ? { kind: 'prompt' } : { kind: 'guess', seed: chain.steps.at(-1).seed },
        submitted: g.submissions.get(id) ?? null,
      }
    }

    if (this.phase === 'reveal') {
      const { chain, shown } = this.reveal
      const c = g.chains[chain]
      base.reveal = {
        chain,
        chains: g.chains.length,
        ownerId: c.ownerId,
        total: c.steps.length,
        steps: c.steps.slice(0, shown), // later steps stay secret until the host advances
      }
    }
    return base
  }

  broadcast() {
    for (const [id, ws] of this.sockets) {
      ws.send(JSON.stringify({ type: 'state', state: this.view(id) }))
    }
  }
}
