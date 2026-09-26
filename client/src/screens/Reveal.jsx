import { useEffect, useRef, useState } from 'react'
import { Avatar, GeneratedImage } from '../components/ui'
import { CHAIN } from '../mock'

export default function Reveal({ onLobby }) {
  const [shown, setShown] = useState(1)
  const endRef = useRef(null)
  const total = CHAIN.steps.length
  const original = CHAIN.steps[0].text
  const final = CHAIN.steps[total - 1].text

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [shown])

  return (
    <div className="screen reveal">
      <header className="topbar">
        <div className="topbar__round">Chain 1/6</div>
        <div className="topbar__label">
          <Avatar player={CHAIN.owner} size={22} /> {CHAIN.owner.name}'s chain
        </div>
        <div />
      </header>

      <main className="feed">
        {CHAIN.steps.slice(0, shown).map((step, i) =>
          step.kind === 'image' ? (
            <div key={i} className="msg msg--image">
              <div className="msg__bot">AI</div>
              <div className="msg__body">
                <div className="msg__name">Image model <span className="pill pill--bot">BOT</span></div>
                <GeneratedImage seed={step.text} />
              </div>
            </div>
          ) : (
            <div key={i} className="msg">
              <Avatar player={step.player} size={40} />
              <div className="msg__body">
                <div className="msg__name" style={{ color: step.player.color }}>
                  {step.player.name}
                  <span className="muted small">{step.kind === 'prompt' ? 'wrote' : 'guessed'}</span>
                </div>
                <div className={`bubble ${step.kind === 'prompt' ? 'bubble--prompt' : ''}`}>{step.text}</div>
              </div>
            </div>
          )
        )}

        {shown === total && (
          <div className="summary">
            <div><span className="muted small">Started as</span><p>“{original}”</p></div>
            <div className="summary__arrow">→</div>
            <div><span className="muted small">Ended as</span><p>“{final}”</p></div>
          </div>
        )}
        <div ref={endRef} />
      </main>

      <footer className="reveal__controls">
        <div className="reactions">
          {['😂', '🔥', '💀', '🤯'].map((e) => <button key={e} className="reaction">{e}</button>)}
        </div>
        {shown < total
          ? <button className="btn btn--primary" onClick={() => setShown(shown + 1)}>Next ▸</button>
          : <button className="btn btn--primary" onClick={onLobby}>Back to lobby</button>}
      </footer>
    </div>
  )
}
