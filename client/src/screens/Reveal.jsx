import { useEffect, useRef } from 'react'
import { Avatar, GeneratedImage } from '../components/ui'

export default function Reveal({ reveal, playersById, isHost, onNext, onLobby }) {
  const endRef = useRef(null)
  const { steps, total } = reveal
  const owner = playersById[reveal.ownerId]
  const done = steps.length === total
  const lastChain = reveal.chain + 1 === reveal.chains

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [steps.length])

  return (
    <div className="screen reveal">
      <header className="topbar">
        <div className="topbar__round">Chain {reveal.chain + 1}/{reveal.chains}</div>
        <div className="topbar__label">
          <Avatar player={owner} size={22} /> {owner.name}'s chain
        </div>
        <div />
      </header>

      <main className="feed" key={reveal.chain}>
        {steps.map((step, i) => {
          if (step.kind === 'image') {
            return (
              <div key={i} className="msg msg--image">
                <div className="msg__bot">AI</div>
                <div className="msg__body">
                  <div className="msg__name">Image model <span className="pill pill--bot">BOT</span></div>
                  <GeneratedImage image={step} />
                </div>
              </div>
            )
          }
          const player = playersById[step.playerId]
          return (
            <div key={i} className="msg">
              <Avatar player={player} size={40} />
              <div className="msg__body">
                <div className="msg__name" style={{ color: player.color }}>
                  {player.name}
                  <span className="muted small">{step.kind === 'prompt' ? 'wrote' : 'guessed'}</span>
                </div>
                <div className={`bubble ${step.kind === 'prompt' ? 'bubble--prompt' : ''}`}>{step.text}</div>
              </div>
            </div>
          )
        })}

        {done && (
          <div className="summary">
            <div><span className="muted small">Started as</span><p>“{steps[0].text}”</p></div>
            <div className="summary__arrow">→</div>
            <div><span className="muted small">Ended as</span><p>“{steps[total - 1].text}”</p></div>
          </div>
        )}
        <div ref={endRef} />
      </main>

      <footer className="reveal__controls">
        <div className="reactions">
          {['😂', '🔥', '💀', '🤯'].map((e) => <button key={e} className="reaction">{e}</button>)}
        </div>
        {!isHost
          ? <span className="muted small">The host is revealing…</span>
          : !done
            ? <button className="btn btn--primary" onClick={onNext}>Next ▸</button>
            : !lastChain
              ? <button className="btn btn--primary" onClick={onNext}>Next chain ▸</button>
              : <button className="btn btn--primary" onClick={onLobby}>Back to lobby</button>}
      </footer>
    </div>
  )
}
