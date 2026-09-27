import { useEffect, useState } from 'react'
import { placeholderImage } from '../mock'
import { backendUrl } from '../session'

// Size it with the --wordmark-size CSS variable; everything inside scales in em.
export function Wordmark() {
  return (
    <h1 className="wordmark" aria-label="unprompted">
      <span className="wordmark__un" aria-hidden="true">un</span>
      <svg className="wordmark__caret" viewBox="0 0 30 34" aria-hidden="true">
        <path d="M4 30 L15 5 L26 30" fill="none" stroke="#FF5B2E" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="wordmark__word" aria-hidden="true">prompted</span>
    </h1>
  )
}

export function Avatar({ player, size = 32 }) {
  const [failedUrl, setFailedUrl] = useState(null)
  const src = player.avatarUrl ? backendUrl(player.avatarUrl).href : null
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, background: player.color, fontSize: size * 0.42 }}
      title={player.name}
    >
      {src && src !== failedUrl
        ? <img src={src} alt="" width={size} height={size} onError={() => setFailedUrl(src)} />
        : [...player.name][0]?.toUpperCase()}
    </span>
  )
}

// Counts down to a local deadline (ms timestamp) set when the server's state arrived.
export function Timer({ endsAt, seconds }) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [])
  const left = Math.max(0, Math.ceil((endsAt - now) / 1000))
  const pct = Math.min(100, (left / seconds) * 100)
  return (
    <div className={`timer ${left <= 10 ? 'timer--low' : ''}`}>
      <span className="timer__num">{left}s</span>
      <div className="timer__bar"><div style={{ width: `${pct}%` }} /></div>
    </div>
  )
}

export function TopBar({ round, rounds, label, endsAt, seconds }) {
  return (
    <header className="topbar">
      <div className="topbar__round">
        Round <strong>{round}</strong>/{rounds}
      </div>
      <div className="topbar__label">{label}</div>
      {endsAt ? <Timer endsAt={endsAt} seconds={seconds} /> : <div />}
    </header>
  )
}

export function PlayerStrip({ players }) {
  const done = players.filter((p) => p.done).length
  return (
    <footer className="strip">
      <span className="strip__count">{done}/{players.length} ready</span>
      <div className="strip__avatars">
        {players.map((p) => (
          <span key={p.id} className={`strip__p ${p.done ? 'is-done' : ''} ${p.connected ? '' : 'is-away'}`}>
            <Avatar player={p} size={28} />
          </span>
        ))}
      </div>
    </footer>
  )
}

// `image` is an image step from the server: { seed, url, pending }. No url = placeholder gradient.
export function GeneratedImage({ image }) {
  const loading = image.pending
  return (
    <div className={`genimg ${loading ? 'genimg--loading' : ''}`}>
      {loading ? (
        <div className="genimg__loading">
          <div className="spinner" />
          <span>Generating image…</span>
        </div>
      ) : image.url ? (
        <img className="genimg__img" src={backendUrl(image.url).href} alt="AI-generated image" />
      ) : (
        <div className="genimg__img" style={{ background: placeholderImage(image.seed) }} />
      )}
    </div>
  )
}

export function ModifierNote({ modifiers }) {
  if (!modifiers?.length) return null
  return (
    <div className="modifier-note">
      <strong><span aria-hidden="true">🎲 </span>The AI was told…</strong>
      <ul>{modifiers.map((modifier) => <li key={modifier}>{modifier}</li>)}</ul>
    </div>
  )
}
