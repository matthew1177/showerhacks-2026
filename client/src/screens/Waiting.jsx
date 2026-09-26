import { PlayerStrip, TopBar } from '../components/ui'
import { PLAYERS, SETTINGS } from '../mock'

export default function Waiting() {
  return (
    <div className="screen play">
      <TopBar round={1} rounds={SETTINGS.rounds} label="Waiting for others" />
      <main className="play__main">
        <div className="dots"><span /><span /><span /></div>
        <h2 className="play__heading">Nice! Waiting on everyone else</h2>
        <p className="muted">The AI is painting your prompt in the meantime.</p>
      </main>
      <PlayerStrip players={PLAYERS} />
    </div>
  )
}
