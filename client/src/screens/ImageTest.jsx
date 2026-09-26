import { useEffect, useState } from 'react'
import { ART_STYLES } from '../mock'
import IMAGE_MODELS from '../../../shared/image-models.json'

const EXAMPLES = [
  'A tiny astronaut watering a garden on the moon',
  'A duck wearing a crown, riding a bicycle through Paris',
  'A cozy bookstore inside a giant forest mushroom',
]
const creativityLabel = (n) => n < 35 ? 'Literal' : n < 63 ? 'Balanced' : n < 88 ? 'Creative' : 'Wild'
const duration = (seconds) => seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`

export default function ImageTest() {
  const [prompt, setPrompt] = useState('')
  const [style, setStyle] = useState('Any')
  const [creativity, setCreativity] = useState(50)
  const [model, setModel] = useState('chroma-flash')
  const [service, setService] = useState({ ready: false, message: 'Checking the image service…' })
  const [busy, setBusy] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  useEffect(() => {
    let stopped = false
    let timer
    const controller = new AbortController()
    async function check() {
      try {
        const response = await fetch('/api/image-test', { signal: controller.signal })
        const data = await response.json()
        if (!stopped) setService(response.ok ? data : { ready: false, message: data.error })
        if (response.status === 403) return
      } catch {
        if (!stopped) setService({ ready: false, message: 'Cannot reach the game server. Checking again automatically.' })
      }
      if (!stopped) timer = setTimeout(check, 5000)
    }
    check()
    return () => { stopped = true; clearTimeout(timer); controller.abort() }
  }, [])

  useEffect(() => {
    if (!busy) return
    const started = Date.now()
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [busy])

  useEffect(() => () => { if (result) URL.revokeObjectURL(result.url) }, [result])

  async function generate(event) {
    event.preventDefault()
    if (busy || !prompt.trim() || !service.ready) return
    setBusy(true)
    setElapsed(0)
    setError('')
    try {
      const response = await fetch('/api/image-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim(), style, creativity, model }),
      })
      if (!response.ok) throw new Error((await response.json()).error || 'Could not generate the image.')
      if (!response.headers.get('content-type')?.startsWith('image/png')) throw new Error('The image service returned an unexpected response.')
      const blob = await response.blob()
      setResult({
        url: URL.createObjectURL(blob), prompt: prompt.trim(), style, creativity, model,
        seconds: Math.round(Number(response.headers.get('X-Generation-Time-Ms')) / 1000),
      })
    } catch (err) {
      setError(err.message || 'Could not generate the image. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app">
      <main className="screen lobby image-test">
        <header className="image-test__header">
          <a className="image-test__brand" href="/">Prompt<span>Phone</span></a>
          <a className="image-test__back" href="/">← Back to game</a>
        </header>
        <div className="image-test__intro">
          <div>
            <p className="image-test__eyebrow">IMAGE PLAYGROUND</p>
            <h1>Give your ideas a picture.</h1>
            <p className="muted">Try either image model with the same styles and creativity settings as the game.</p>
          </div>
          <div className={`image-test__status ${service.ready ? 'is-ready' : ''}`} role="status">
            <span />{service.ready ? 'Image service ready' : 'Waiting for image service'}
          </div>
        </div>

        <div className="image-test__grid">
          <form className="card image-test__form" onSubmit={generate}>
            <fieldset disabled={busy}>
              <label className="field">
                <span>Image model</span>
                <select value={model} onChange={(event) => setModel(event.target.value)}>
                  {IMAGE_MODELS.map((choice) => <option key={choice.id} value={choice.id}>{choice.label}</option>)}
                </select>
              </label>
              <label className="field">
                <span className="image-test__label">Your prompt <small>{prompt.length}/200</small></span>
                <textarea
                  value={prompt} onChange={(event) => setPrompt(event.target.value)}
                  placeholder="A tiny astronaut watering a garden on the moon…"
                  maxLength={200} rows={5} required
                />
              </label>
              <div className="image-test__examples">
                <span className="muted small">Need an idea?</span>
                {EXAMPLES.map((example) => <button type="button" key={example} onClick={() => setPrompt(example)}>{example} <span>↗</span></button>)}
              </div>
              <label className="field">
                <span>Art style</span>
                <select value={style} onChange={(event) => setStyle(event.target.value)}>
                  {ART_STYLES.map((value) => <option key={value}>{value}</option>)}
                </select>
              </label>
              <label className="field">
                <span className="image-test__label">Creativity <strong>{creativityLabel(creativity)} · {creativity}</strong></span>
                <input className="slider" type="range" min="0" max="100" value={creativity} onChange={(event) => setCreativity(Number(event.target.value))} />
                <span className="image-test__range"><small>Follow the prompt</small><small>Add a twist</small></span>
              </label>
            </fieldset>
            {!service.ready && <p className="image-test__notice" role="status">{service.message}</p>}
            {error && <p className="image-test__error" role="alert">{error}</p>}
            <button className="btn btn--primary btn--lg" disabled={busy || !service.ready || !prompt.trim()}>
              {busy ? `Generating… ${duration(elapsed)}` : result ? 'Generate again' : 'Generate image'}
            </button>
            <p className="muted small image-test__footnote">Runs locally on your Mac. Speed depends on image settings and queued requests.</p>
          </form>

          <section className="card image-test__output" aria-label="Image preview" aria-busy={busy}>
            <div className="image-test__output-heading">
              <h2 className="card__title">Preview</h2>
              <span className="pill">{IMAGE_MODELS.find((choice) => choice.id === (result?.model ?? model))?.label}</span>
            </div>
            <div className={`image-test__canvas ${busy ? 'is-busy' : ''}`}>
              {result && <img src={result.url} alt={result.prompt} />}
              {busy ? (
                <div className="image-test__placeholder image-test__working" role="status">
                  <div className="spinner" /><strong>Drawing your idea…</strong>
                  <span>{duration(elapsed)} elapsed · Waiting for the local model</span>
                </div>
              ) : !result && (
                <div className="image-test__placeholder">
                  <svg width="52" height="52" viewBox="0 0 48 48" fill="none" aria-hidden="true"><rect x="5" y="5" width="38" height="38" rx="9" stroke="currentColor" strokeWidth="1.5" /><circle cx="17" cy="17" r="4" stroke="currentColor" strokeWidth="1.5" /><path d="m6 35 11-10 7 6 8-13 10 17" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg>
                  <strong>Your image will appear here</strong>
                  <span>Write a prompt or try one of the ideas.</span>
                </div>
              )}
            </div>
            {result && <div className="image-test__result">
              <div><p>{result.prompt}</p><span className="muted small">{result.style} · Creativity {result.creativity} · {duration(result.seconds)}</span></div>
              <a className="btn btn--secondary" href={result.url} download={`${result.model}-image.png`}>Save PNG ↓</a>
            </div>}
          </section>
        </div>
      </main>
    </div>
  )
}
