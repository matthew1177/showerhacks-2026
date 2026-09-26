import { useEffect, useRef } from 'react'
import { Avatar, GeneratedImage } from '../components/ui'

export default function Reveal({ reveal, playersById, isHost, onNext, onLobby }) {
  if (reveal.leaderboard) {
    return <Leaderboard entries={reveal.leaderboard} playersById={playersById} isHost={isHost} onLobby={onLobby} />
  }
  return <Chain reveal={reveal} playersById={playersById} isHost={isHost} onNext={onNext} onLobby={onLobby} />
}

function Chain({ reveal, playersById, isHost, onNext, onLobby }) {
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
                <div className="msg__name">
                  {player.name}
                  <span className="muted small">{step.kind === 'prompt' ? 'wrote' : 'guessed'}</span>
                  {step.score !== undefined && (
                    <span className="pill pill--score" title="How close this guess's image is to the first image (DINOv2)">
                      +{step.score}
                    </span>
                  )}
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
            <div><span className="muted small">Ended as</span><p>“{steps.findLast((s) => s.kind !== 'image').text}”</p></div>
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
              : reveal.scored
                ? <button className="btn btn--primary" onClick={onNext}>Scores ▸</button>
                : <button className="btn btn--primary" onClick={onLobby}>Back to lobby</button>}
      </footer>
    </div>
  )
}

// Everyone's total guess points: each guess earns 0-100 for how close its image stayed to the
// chain's first image.
function Leaderboard({ entries, playersById, isHost, onLobby }) {
  return (
    <div className="screen reveal">
      <header className="topbar">
        <div />
        <div className="topbar__label">Leaderboard</div>
        <div />
      </header>
      <main className="feed">
        <ol className="leaderboard">
          {entries.map((entry, i) => {
            const player = playersById[entry.playerId]
            const rank = entries.findIndex((e) => e.points === entry.points) + 1 // ties share a rank
            return (
              <li key={entry.playerId} className={rank === 1 ? 'is-winner' : ''} style={{ animationDelay: `${i * 80}ms` }}>
                <span className="leaderboard__rank">{rank === 1 ? '👑' : rank}</span>
                <Avatar player={player} size={36} />
                <span className="leaderboard__name">{player.name}</span>
                <span className="muted small">{entry.guesses} {entry.guesses === 1 ? 'guess' : 'guesses'}</span>
                <strong className="leaderboard__points">{entry.points}</strong>
              </li>
            )
          })}
        </ol>
        <p className="muted small leaderboard__note">
          Each guess scores up to 100 for how close its image stayed to the chain's first image.
        </p>
      </main>
      <footer className="reveal__controls">
        <div />
        {isHost
          ? <button className="btn btn--primary" onClick={onLobby}>Back to lobby</button>
          : <span className="muted small">Waiting for the host…</span>}
      </footer>
    </div>
  )
}
