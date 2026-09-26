import { useEffect, useState } from 'react'
import { placeholderImage } from '../mock'

export function Avatar({ player, size = 32 }) {
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, background: player.color, fontSize: size * 0.42 }}
      title={player.name}
    >
      {player.name[0].toUpperCase()}
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

export function GeneratedImage({ seed, loading }) {
  return (
    <div className={`genimg ${loading ? 'genimg--loading' : ''}`}>
      {loading ? (
        <div className="genimg__loading">
          <div className="spinner" />
          <span>Generating image…</span>
        </div>
      ) : (
        <div className="genimg__img" style={{ background: placeholderImage(seed) }} />
      )}
    </div>
  )
}
