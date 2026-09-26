import { useState } from 'react'
import { Avatar } from '../components/ui'
import { ART_STYLES } from '../mock'

export default function Lobby({ players, me, isHost, hostId, settings, onSettings, onName, onStart }) {
  const [name, setName] = useState(me.name)
  const set = (k) => (e) => onSettings({ ...settings, [k]: e.target.value })
  const commitName = () => name.trim() && name.trim() !== me.name ? onName(name.trim()) : setName(me.name)

  return (
    <div className="screen lobby">
      <div className="lobby__hero">
        <h1 className="logo">Prompt<span>Phone</span></h1>
        <p className="muted">Write a prompt. The AI draws it. Your friends guess what you wrote.</p>
      </div>

      <div className="lobby__grid">
        <section className="card">
          <h2 className="card__title">Players <span className="pill">{players.length}/12</span></h2>
          <ul className="players">
            {players.map((p) => (
              <li key={p.id}>
                <Avatar player={p} />
                <span className="players__name">{p.name}</span>
                {p.id === hostId && <span className="pill pill--host">HOST</span>}
                {p.id === me.id && <span className="muted small">(you)</span>}
              </li>
            ))}
          </ul>
          <label className="field">
            <span>Your name</span>
            <input
              className="name-input"
              value={name}
              maxLength={20}
              onChange={(e) => setName(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            />
          </label>
        </section>

        <section className="card">
          <h2 className="card__title">Settings</h2>
          <label className="field">
            <span>Rounds</span>
            <select value={settings.rounds} onChange={set('rounds')} disabled={!isHost}>
              {[3, 4, 5, 6, 8, 10].map((n) => <option key={n}>{n}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Time to write</span>
            <select value={settings.promptSeconds} onChange={set('promptSeconds')} disabled={!isHost}>
              {[30, 45, 60, 90].map((n) => <option key={n} value={n}>{n}s</option>)}
            </select>
          </label>
          <label className="field">
            <span>Time to guess</span>
            <select value={settings.guessSeconds} onChange={set('guessSeconds')} disabled={!isHost}>
              {[30, 45, 60, 90].map((n) => <option key={n} value={n}>{n}s</option>)}
            </select>
          </label>
          <div className="field">
            <span>Art style</span>
            <div className="chips">
              {ART_STYLES.map((s) => (
                <button
                  key={s}
                  className={`chip ${settings.artStyle === s ? 'is-on' : ''}`}
                  onClick={() => isHost && onSettings({ ...settings, artStyle: s })}
                >{s}</button>
              ))}
            </div>
          </div>
        </section>
      </div>

      <div className="lobby__cta">
        {!isHost
          ? <p className="muted">Waiting for the host to start…</p>
          : players.length < 2
            ? <p className="muted">Need at least 2 players to start.</p>
            : <button className="btn btn--primary btn--lg" onClick={onStart}>Start game</button>}
      </div>
    </div>
  )
}
