import { useEffect, useState } from 'react'
import { useRoom } from './net'
import Guess from './screens/Guess'
import Lobby from './screens/Lobby'
import Prompt from './screens/Prompt'
import Reveal from './screens/Reveal'
import Waiting from './screens/Waiting'

export default function App() {
  const { state, status, error, send } = useRoom()
  // What you're typing this turn; keyed by turn so it clears when the next one starts.
  const [draft, setDraft] = useState({ turn: 0, text: '' })
  const turn = state?.play?.turn
  const text = draft.turn === turn ? draft.text : ''

  // Stream the draft to the server so whatever you've typed counts if the timer runs out.
  useEffect(() => {
    if (!turn) return
    const id = setTimeout(() => send('draft', { text }), 300)
    return () => clearTimeout(id)
  }, [send, turn, text])

  if (!state) {
    return (
      <div className="app">
        <div className="screen play">
          <main className="play__main">
            {status === 'error'
              ? <h2 className="play__heading">{error ?? "Couldn't join the game"}</h2>
              : <><div className="dots"><span /><span /><span /></div><p className="muted">Connecting…</p></>}
          </main>
        </div>
      </div>
    )
  }

  const playersById = Object.fromEntries(state.players.map((p) => [p.id, p]))
  const me = playersById[state.me]
  const isHost = state.hostId === state.me
  const { play } = state
  const typing = { play, players: state.players, text, onChange: (t) => setDraft({ turn, text: t }), onSubmit: (t) => send('submit', { text: t }) }

  return (
    <div className="app">
      {state.phase === 'lobby' && (
        <Lobby
          players={state.players}
          me={me}
          isHost={isHost}
          hostId={state.hostId}
          settings={state.settings}
          onSettings={(settings) => send('settings', { settings })}
          onStart={() => send('start')}
        />
      )}
      {state.phase === 'play' && (
        !play.task || play.submitted
          ? <Waiting play={play} players={state.players} submitted={play.submitted} onEdit={() => send('unsubmit')} />
          : play.task.kind === 'prompt' ? <Prompt {...typing} /> : <Guess {...typing} />
      )}
      {state.phase === 'reveal' && (
        <Reveal
          reveal={state.reveal}
          playersById={playersById}
          isHost={isHost}
          onNext={() => send('next')}
          onLobby={() => send('lobby')}
        />
      )}

      {status !== 'open' && <div className="banner">{status === 'error' ? error : 'Reconnecting…'}</div>}
    </div>
  )
}
