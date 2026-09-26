import { useCallback, useEffect, useRef, useState } from 'react'

// Per-tab identity so reloading keeps your seat, but separate tabs are separate players (handy for testing).
function playerId() {
  let id = sessionStorage.getItem('playerId')
  if (!id) sessionStorage.setItem('playerId', (id = crypto.randomUUID()))
  return id
}

export function savedName() {
  try { return localStorage.getItem('name') ?? '' } catch { return '' }
}

export function saveName(name) {
  try { localStorage.setItem('name', name) } catch { /* private mode */ }
}

// ?room=abc picks a room; everyone without one shares "default".
// TODO: use the Discord Activity instance id once the Embedded App SDK is wired up.
const ROOM = new URLSearchParams(location.search).get('room') ?? 'default'

// Keeps a WebSocket to the game server open and exposes the latest room state.
export function useRoom() {
  const [state, setState] = useState(null)
  const [status, setStatus] = useState('connecting') // connecting | open | closed | error
  const [error, setError] = useState(null)
  const wsRef = useRef(null)

  useEffect(() => {
    let retry = 0
    let timer
    let stopped = false

    const connect = () => {
      const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`)
      wsRef.current = ws
      setStatus('connecting')

      ws.onopen = () => {
        retry = 0
        setStatus('open')
        ws.send(JSON.stringify({ type: 'hello', room: ROOM, id: playerId(), name: savedName() }))
      }
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data)
        if (msg.type === 'state') {
          // msLeft -> local deadline, so the timer doesn't depend on client/server clocks agreeing.
          if (msg.state.play) msg.state.play.endsAt = Date.now() + msg.state.play.msLeft
          msg.state.players = msg.state.players.map((p) => ({ ...p, color: `var(--ctp-${p.color})` }))
          setState(msg.state)
        } else if (msg.type === 'error') {
          setError(msg.message)
        }
      }
      ws.onclose = (e) => {
        if (stopped) return
        if (e.code === 4000) setError('You opened the game in another tab.')
        if (e.code === 4000 || e.code === 4001) return setStatus('error')
        setStatus('closed')
        timer = setTimeout(connect, Math.min(1000 * 2 ** retry++, 10_000))
      }
    }

    connect()
    return () => {
      stopped = true
      clearTimeout(timer)
      wsRef.current?.close()
    }
  }, [])

  const send = useCallback((type, data) => {
    const ws = wsRef.current
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type, ...data }))
  }, [])

  return { state, status, error, send }
}
