import { useEffect, useState } from 'react'
import { GeneratedImage, PlayerStrip, TopBar } from '../components/ui'
import { PLAYERS, SETTINGS } from '../mock'

const MAX = 120

export default function Guess({ seed = 'a haunted vending machine at 3am' }) {
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [locked, setLocked] = useState(false)

  // Simulate the image model finishing.
  useEffect(() => {
    const id = setTimeout(() => setLoading(false), 1800)
    return () => clearTimeout(id)
  }, [])

  return (
    <div className="screen play">
      <TopBar round={2} rounds={SETTINGS.rounds} label="Guess the prompt"
        seconds={loading ? null : SETTINGS.guessSeconds} />
      <main className="play__main play__main--guess">
        <GeneratedImage seed={seed} loading={loading} />
        <div className="composer">
          <label className="muted small">What prompt made this image?</label>
          <textarea
            value={text}
            maxLength={MAX}
            disabled={locked || loading}
            placeholder={loading ? 'Hang tight…' : 'Type your guess'}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), text.trim() && setLocked(true))}
          />
          <div className="composer__row">
            <span className="muted small">{text.length}/{MAX}</span>
            {locked
              ? <button className="btn btn--secondary" onClick={() => setLocked(false)}>Edit</button>
              : <button className="btn btn--primary" onClick={() => setLocked(true)} disabled={!text.trim() || loading}>Done</button>}
          </div>
        </div>
      </main>
      <PlayerStrip players={PLAYERS} />
    </div>
  )
}
