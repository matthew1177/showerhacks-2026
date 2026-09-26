// Room + game state for one lobby. All game logic is server-authoritative;
// clients only receive a per-player view (see `view`) so nobody can peek at other chains.

import { randomUUID } from 'node:crypto'
import { deleteImage, embedImage, generateImage, imagesEnabled, similarityPoints } from './images.js'

const COLORS = ['mauve', 'pink', 'green', 'yellow', 'red', 'blue', 'peach', 'teal', 'lavender', 'rosewater']
const ART_STYLES = ['Any', 'Photo', 'Cartoon', 'Pixel art', 'Oil painting', 'Claymation']
const ROUND_OPTIONS = [3, 4, 5, 6, 8, 10]
const TIME_OPTIONS = [30, 45, 60, 90]

export const MAX_PLAYERS = 12
const MAX_TEXT = 120
const MAX_NAME = 32
const GRACE_MS = 1000 // extra time for last-second drafts to arrive
const TIMED_OUT = '(ran out of time)'

const clean = (s, max) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, max) : '')
const cleanName = (name) => typeof name === 'string' ? [...name.replace(/\s+/g, ' ').trim()].slice(0, MAX_NAME).join('') : ''

export class Room {
  constructor(code) {
    this.code = code
    // Discord room codes are reserved by the server after identity verification.
    this.canEditName = !code.startsWith('discord:')
    this.players = [] // { id, name, avatarUrl, color, connected }
    this.sockets = new Map() // playerId -> ws
    this.hostId = null
    this.settings = { rounds: 6, promptSeconds: 60, guessSeconds: 45, artStyle: 'Any', creativity: 50 }
    this.phase = 'lobby' // lobby | play | reveal
    this.game = null
    this.reveal = null
    this.imageIds = []
    this.disposed = false
  }

  get empty() {
    return this.sockets.size === 0
  }

  // ---------- connections ----------

  join(ws, id, name, avatarUrl = null) {
    let player = this.players.find((p) => p.id === id)
    const displayName = cleanName(name)
    if (!player) {
      if (this.players.length >= MAX_PLAYERS) return null
      const used = new Set(this.players.map((p) => p.color))
      player = {
        id: typeof id === 'string' && id.length <= 64 ? id : randomUUID(),
        name: displayName || `Player ${this.players.length + 1}`,
        color: COLORS.find((c) => !used.has(c)) ?? COLORS[this.players.length % COLORS.length],
        connected: true,
      }
      this.players.push(player)
    }
    // Refresh the verified Discord profile when recovering an existing seat.
    if (displayName) player.name = displayName
    player.avatarUrl = avatarUrl
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
    this.disposed = true
    clearTimeout(this.game?.timer)
    this.clearImages()
  }

  clearImages() {
    this.imageIds.forEach(deleteImage)
    this.imageIds = []
  }

  connected(id) {
    return this.sockets.has(id)
  }

  // ---------- messages ----------

  handle(id, msg) {
    const isHost = id === this.hostId
    switch (`${this.phase}:${msg.type}`) {
      case 'lobby:name': {
        if (!this.canEditName) return
        const player = this.players.find((p) => p.id === id)
        const name = cleanName(msg.name)
        if (!player || !name) return
        player.name = name
        break
      }
      case 'lobby:settings':
        if (isHost) this.updateSettings(msg.settings ?? {})
        break
      case 'lobby:start':
        if (isHost && this.players.length >= 2) this.startGame()
        break
      case 'play:draft':
        if (this.game.generating) return
        this.game.drafts.set(id, clean(msg.text, MAX_TEXT))
        return // drafts are silent; no broadcast
      case 'play:submit': {
        const text = clean(msg.text, MAX_TEXT)
        if (!text || this.game.generating || !this.game.order.includes(id)) return
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
      creativity: Number.isFinite(Number(s.creativity))
        ? Math.min(100, Math.max(0, Math.round(Number(s.creativity))))
        : this.settings.creativity,
    }
  }

  // ---------- game flow ----------

  startGame() {
    const order = this.players.map((p) => p.id)
    this.phase = 'play'
    this.game = {
      order,
      // Chains keep rotating when the chosen round count exceeds the player count.
      turns: this.settings.rounds,
      turn: 0,
      // `reference` is the DINOv2 embedding of the chain's first image; guesses score against it.
      chains: order.map((ownerId) => ({ ownerId, steps: [], reference: null })),
      submissions: new Map(),
      drafts: new Map(),
      endsAt: 0,
      timer: null,
      generating: false, // between turns while the image model works; the timer hasn't started
      finishing: false, // after the last turn while its images are made and scored
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
    if (g.generating) return
    const waiting = g.order.some((id) => this.connected(id) && !g.submissions.has(id))
    if (!waiting) this.endTurn()
  }

  endTurn() {
    const g = this.game
    const last = g.turn + 1 >= g.turns
    const jobs = []
    for (const id of g.order) {
      const text = g.submissions.get(id) || g.drafts.get(id) || TIMED_OUT
      const chain = this.chainFor(id)
      const step = { kind: g.turn === 0 ? 'prompt' : 'guess', playerId: id, text }
      chain.steps.push(step)
      // With the image model, final guesses get an image too so they can be scored.
      if (last && !imagesEnabled()) continue
      if (step.kind === 'guess' && chain.reference && text === TIMED_OUT) step.score = 0
      // `seed` drives the placeholder gradient if there's no image model or it fails.
      const image = { kind: 'image', seed: randomUUID(), url: null, pending: imagesEnabled() }
      chain.steps.push(image)
      if (imagesEnabled() && text !== TIMED_OUT) jobs.push(this.renderImage(image, text, chain, step))
      else image.pending = false
    }
    clearTimeout(g.timer)
    g.submissions.clear()
    g.drafts.clear()
    if (last && !jobs.length) return this.startReveal()
    if (!last) g.turn++
    if (!jobs.length) return this.startTurn()
    // Hold the next turn's timer until every image is ready, so nobody guesses at a spinner.
    g.generating = true
    g.finishing = last
    Promise.all(jobs).then(() => {
      if (this.disposed || this.game !== g) return // game ended or room closed meanwhile
      g.generating = false
      if (last) this.startReveal()
      else this.startTurn()
      this.broadcast()
    })
  }

  // Draws `text`'s image into `image`, then scores `step` (a guess) by how close that image is
  // to the chain's reference; a prompt's image becomes the reference.
  async renderImage(image, text, chain, step) {
    try {
      const id = await generateImage(text, this.settings.artStyle, this.settings.creativity)
      if (this.disposed) return deleteImage(id)
      this.imageIds.push(id)
      image.url = `/images/${id}.png`
      image.pending = false
      const embedding = await embedImage(id)
      if (step.kind === 'prompt') chain.reference = embedding
      else if (chain.reference) step.score = similarityPoints(embedding, chain.reference)
    } catch (err) {
      console.error('image generation or scoring failed:', err.message)
    } finally {
      image.pending = false
    }
  }

  startReveal() {
    this.phase = 'reveal'
    this.reveal = { chain: 0, shown: 1, leaderboard: false }
  }

  // Total guess points per player, best first; null when nothing was scored.
  leaderboard() {
    const totals = new Map(this.game.order.map((id) => [id, { playerId: id, points: 0, guesses: 0 }]))
    let scored = false
    for (const chain of this.game.chains) {
      for (const step of chain.steps) {
        if (step.score === undefined) continue
        scored = true
        const entry = totals.get(step.playerId)
        entry.points += step.score
        entry.guesses++
      }
    }
    return scored ? [...totals.values()].sort((a, b) => b.points - a.points) : null
  }

  revealNext() {
    const r = this.reveal
    const chains = this.game.chains
    if (r.shown < chains[r.chain].steps.length) r.shown++
    else if (r.chain + 1 < chains.length) Object.assign(r, { chain: r.chain + 1, shown: 1 })
    else if (this.leaderboard()) r.leaderboard = true
  }

  backToLobby() {
    this.phase = 'lobby'
    this.game = null
    this.reveal = null
    this.clearImages()
    this.players = this.players.filter((p) => this.connected(p.id))
  }

  // ---------- output ----------

  view(id) {
    const g = this.game
    const base = {
      code: this.code,
      me: id,
      canEditName: this.canEditName,
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
        msLeft: g.generating ? null : Math.max(0, g.endsAt - Date.now()),
        seconds: g.turn === 0 ? this.settings.promptSeconds : this.settings.guessSeconds,
        finishing: g.finishing,
        // null = joined mid-game, just watching
        task: !chain || g.finishing ? null : g.turn === 0 ? { kind: 'prompt' } : { kind: 'guess', image: chain.steps.at(-1) },
        submitted: g.submissions.get(id) ?? null,
      }
    }

    if (this.phase === 'reveal') {
      const { chain, shown, leaderboard } = this.reveal
      const c = g.chains[chain]
      base.reveal = {
        leaderboard: leaderboard ? this.leaderboard() : null,
        scored: Boolean(this.leaderboard()),
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
