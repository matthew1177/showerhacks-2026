import { useState } from 'react'
import { PlayerStrip, TopBar } from '../components/ui'
import { PLAYERS, PROMPT_IDEAS, SETTINGS } from '../mock'

const MAX = 120

export default function Prompt({ onSubmit }) {
  const [text, setText] = useState('')
  const [locked, setLocked] = useState(false)
  const placeholder = PROMPT_IDEAS[0]

  const submit = () => {
    if (!text.trim()) return
    setLocked(true)
    onSubmit?.(text.trim())
  }

  return (
    <div className="screen play">
      <TopBar round={1} rounds={SETTINGS.rounds} label="Write a prompt" seconds={SETTINGS.promptSeconds} />
      <main className="play__main">
        <div className="bigicon">✍️</div>
        <h2 className="play__heading">Describe something for the AI to draw</h2>
        <p className="muted">Weirder is better. The next player only sees the picture.</p>
        <div className="composer">
          <textarea
            value={text}
            maxLength={MAX}
            disabled={locked}
            placeholder={placeholder}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), submit())}
            autoFocus
          />
          <div className="composer__row">
            <button className="btn btn--ghost btn--sm" disabled={locked}
              onClick={() => setText(PROMPT_IDEAS[Math.floor(Math.random() * PROMPT_IDEAS.length)])}>
              🎲 Random idea
            </button>
            <span className="muted small">{text.length}/{MAX}</span>
            {locked
              ? <button className="btn btn--secondary" onClick={() => setLocked(false)}>Edit</button>
              : <button className="btn btn--primary" onClick={submit} disabled={!text.trim()}>Done</button>}
          </div>
        </div>
      </main>
      <PlayerStrip players={PLAYERS} />
    </div>
  )
}
