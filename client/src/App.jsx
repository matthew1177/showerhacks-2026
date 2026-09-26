import { useState } from 'react'
import Guess from './screens/Guess'
import Lobby from './screens/Lobby'
import Prompt from './screens/Prompt'
import Reveal from './screens/Reveal'
import Waiting from './screens/Waiting'

const SCREENS = ['lobby', 'prompt', 'waiting', 'guess', 'reveal']

export default function App() {
  const [screen, setScreen] = useState(
    () => new URLSearchParams(location.search).get('screen') ?? 'lobby', // ?screen=guess for dev
  )

  return (
    <div className="app">
      {screen === 'lobby' && <Lobby onStart={() => setScreen('prompt')} />}
      {screen === 'prompt' && <Prompt onSubmit={() => setTimeout(() => setScreen('waiting'), 600)} />}
      {screen === 'waiting' && <Waiting />}
      {screen === 'guess' && <Guess />}
      {screen === 'reveal' && <Reveal onLobby={() => setScreen('lobby')} />}

      {import.meta.env.DEV && (
        <nav className="devnav">
          {SCREENS.map((s) => (
            <button key={s} className={s === screen ? 'is-on' : ''} onClick={() => setScreen(s)}>{s}</button>
          ))}
        </nav>
      )}
    </div>
  )
}
