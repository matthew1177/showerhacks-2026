import { GeneratedImage, PlayerStrip, TopBar } from '../components/ui'

const MAX = 120

export default function Guess({ play, players, text, onChange, onSubmit }) {
  const submit = () => text.trim() && onSubmit(text.trim())

  return (
    <div className="screen play">
      <TopBar round={play.turn} rounds={play.turns} label="Guess the prompt" endsAt={play.endsAt} seconds={play.seconds} />
      <main className="play__main play__main--guess">
        <GeneratedImage seed={play.task.seed} />
        <div className="composer">
          <label className="muted small">What prompt made this image?</label>
          <textarea
            value={text}
            maxLength={MAX}
            placeholder="Type your guess"
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), submit())}
            autoFocus
          />
          <div className="composer__row">
            <span className="muted small">{text.length}/{MAX}</span>
            <button className="btn btn--primary" onClick={submit} disabled={!text.trim()}>Done</button>
          </div>
        </div>
      </main>
      <PlayerStrip players={players} />
    </div>
  )
}
