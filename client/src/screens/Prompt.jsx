import { PlayerStrip, TopBar } from '../components/ui'
import { PROMPT_IDEAS } from '../mock'

const MAX = 120

export default function Prompt({ play, players, text, onChange, onSubmit }) {
  const placeholder = PROMPT_IDEAS[0]
  const submit = () => text.trim() && onSubmit(text.trim())

  return (
    <div className="screen play">
      <TopBar round={play.turn} rounds={play.turns} label="Write a prompt" endsAt={play.endsAt} seconds={play.seconds} />
      <main className="play__main">
        <div className="bigicon">✍️</div>
        <h2 className="play__heading">Describe something for the AI to draw</h2>
        <p className="muted">Weirder is better. The next player only sees the picture.</p>
        <div className="composer">
          <textarea
            value={text}
            maxLength={MAX}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), submit())}
            autoFocus
          />
          <div className="composer__row">
            <button className="btn btn--ghost btn--sm"
              onClick={() => onChange(PROMPT_IDEAS[Math.floor(Math.random() * PROMPT_IDEAS.length)])}>
              🎲 Random idea
            </button>
            <span className="muted small">{text.length}/{MAX}</span>
            <button className="btn btn--primary" onClick={submit} disabled={!text.trim()}>Done</button>
          </div>
        </div>
      </main>
      <PlayerStrip players={players} />
    </div>
  )
}
