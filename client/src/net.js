import { useCallback, useEffect, useRef, useState } from 'react'
import { getSession, savedName, saveName, websocketUrl } from './session.js'

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

    const connect = async () => {
      let hello
      try {
        hello = await getSession()
      } catch (err) {
        if (stopped) return
        setError(err.message || 'Could not connect to Discord. Close and reopen the Activity.')
        setStatus('error')
        return
      }
      if (stopped) return
      const ws = new WebSocket(websocketUrl())
      wsRef.current = ws
      setStatus('connecting')

      ws.onopen = () => {
        if (stopped) return ws.close()
        retry = 0
        ws.send(JSON.stringify(hello.discord ? hello : { ...hello, name: savedName() }))
      }
      ws.onmessage = (e) => {
        if (stopped) return
        const msg = JSON.parse(e.data)
        if (msg.type === 'state') {
          setStatus('open')
          setError(null)
          // msLeft -> local deadline, so the timer doesn't depend on client/server clocks agreeing.
          // msLeft is null while images are generating (timer not started yet).
          if (msg.state.play) msg.state.play.endsAt = msg.state.play.msLeft == null ? null : Date.now() + msg.state.play.msLeft
          msg.state.players = msg.state.players.map((p) => ({ ...p, color: `var(--player-${p.color})` }))
          const me = msg.state.players.find((p) => p.id === msg.state.me)
          if (msg.state.canEditName && me) saveName(me.name)
          setState(msg.state)
        } else if (msg.type === 'error') {
          setError(msg.message)
        }
      }
      ws.onclose = (e) => {
        if (stopped) return
        if (e.code === 4000) setError('You opened the game in another tab.')
        if (e.code === 4000 || e.code === 4001 || e.code === 4002) return setStatus('error')
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
