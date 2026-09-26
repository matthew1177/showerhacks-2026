import { useState } from 'react'
import { Avatar } from '../components/ui'
import { ART_STYLES, ME, PLAYERS, SETTINGS } from '../mock'

export default function Lobby({ onStart }) {
  const [settings, setSettings] = useState(SETTINGS)
  const set = (k) => (e) => setSettings({ ...settings, [k]: e.target.value })

  return (
    <div className="screen lobby">
      <div className="lobby__hero">
        <h1 className="logo">Prompt<span>Phone</span></h1>
        <p className="muted">Write a prompt. The AI draws it. Your friends guess what you wrote.</p>
      </div>

      <div className="lobby__grid">
        <section className="card">
          <h2 className="card__title">Players <span className="pill">{PLAYERS.length}/12</span></h2>
          <ul className="players">
            {PLAYERS.map((p) => (
              <li key={p.id}>
                <Avatar player={p} />
                <span className="players__name">{p.name}</span>
                {p.host && <span className="pill pill--host">HOST</span>}
                {p.id === ME.id && <span className="muted small">(you)</span>}
              </li>
            ))}
          </ul>
          <button className="btn btn--ghost">Invite to Activity</button>
        </section>

        <section className="card">
          <h2 className="card__title">Settings</h2>
          <label className="field">
            <span>Rounds</span>
            <select value={settings.rounds} onChange={set('rounds')} disabled={!ME.host}>
              {[3, 4, 5, 6, 8, 10].map((n) => <option key={n}>{n}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Time to write</span>
            <select value={settings.promptSeconds} onChange={set('promptSeconds')} disabled={!ME.host}>
              {[30, 45, 60, 90].map((n) => <option key={n} value={n}>{n}s</option>)}
            </select>
          </label>
          <label className="field">
            <span>Time to guess</span>
            <select value={settings.guessSeconds} onChange={set('guessSeconds')} disabled={!ME.host}>
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
                  onClick={() => ME.host && setSettings({ ...settings, artStyle: s })}
                >{s}</button>
              ))}
            </div>
          </div>
        </section>
      </div>

      <div className="lobby__cta">
        {ME.host
          ? <button className="btn btn--primary btn--lg" onClick={onStart}>Start game</button>
          : <p className="muted">Waiting for the host to start…</p>}
      </div>
    </div>
  )
}
