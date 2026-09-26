import { PlayerStrip, TopBar } from '../components/ui'

export default function Waiting({ play, players, submitted, onEdit }) {
  return (
    <div className="screen play">
      <TopBar round={play.turn} rounds={play.turns} label="Waiting for others" endsAt={play.endsAt} seconds={play.seconds} />
      <main className="play__main">
        <div className="dots"><span /><span /><span /></div>
        {submitted ? (
          <>
            <h2 className="play__heading">Nice! Waiting on everyone else</h2>
            <p className="muted">You wrote “{submitted}”</p>
            <button className="btn btn--secondary" onClick={onEdit}>Edit</button>
          </>
        ) : (
          <>
            <h2 className="play__heading">A game is in progress</h2>
            <p className="muted">You'll be able to join once it's back in the lobby.</p>
          </>
        )}
      </main>
      <PlayerStrip players={players} />
    </div>
  )
}
