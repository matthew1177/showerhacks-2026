// Client for the Python image API (../imagegen). Only this server talks to it, using a shared
// secret. Game turns and the local test page can generate images. PNGs are kept in memory and
// served same-origin at /images/<id>.png (Discord's CSP blocks outside image URLs).

import { randomUUID } from 'node:crypto'

// Read lazily: index.js loads server/.env after the imports have run.
// IMAGE_API_URL is e.g. http://127.0.0.1:8000; unset = placeholder gradients.
export const imagesEnabled = () => Boolean(process.env.IMAGE_API_URL && process.env.IMAGE_API_SECRET)

export async function imageServiceStatus() {
  if (!imagesEnabled()) return { ready: false, message: 'The image service is not configured.' }
  try {
    const response = await fetch(`${process.env.IMAGE_API_URL}/health`, {
      headers: { authorization: `Bearer ${process.env.IMAGE_API_SECRET}` },
      signal: AbortSignal.timeout(3000),
    })
    if (response.status === 401) return { ready: false, message: 'The image service secret does not match the game server.' }
    if (!response.ok) throw new Error('Image service unavailable')
    return await response.json()
  } catch {
    return { ready: false, message: 'The image model is loading or the service is offline. Checking again automatically.' }
  }
}

const images = new Map() // id -> PNG Buffer
let generationQueue = Promise.resolve()

function enqueue(operation) {
  // The local GPU serves one image at a time. Start each timeout only when its
  // request is sent, so later players don't time out while waiting in the queue.
  const result = generationQueue.then(operation)
  generationQueue = result.catch(() => {})
  return result
}

export function generateImage(prompt, style, creativity, model) {
  return enqueue(() => requestImage(prompt, style, creativity, model))
}

export function prepareImageModel(model) {
  return enqueue(async () => {
    const res = await fetch(`${process.env.IMAGE_API_URL}/prepare`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.IMAGE_API_SECRET}` },
      body: JSON.stringify({ model }),
      signal: AbortSignal.timeout(Number(process.env.IMAGE_TIMEOUT_MS) || 300_000),
    })
    if (!res.ok) throw new Error(`image API responded ${res.status}`)
  })
}

async function requestImage(prompt, style, creativity, model) {
  const res = await fetch(`${process.env.IMAGE_API_URL}/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.IMAGE_API_SECRET}` },
    body: JSON.stringify({ prompt, style, creativity, model }),
    signal: AbortSignal.timeout(Number(process.env.IMAGE_TIMEOUT_MS) || 300_000),
  })
  if (!res.ok) throw new Error(`image API responded ${res.status}`)
  const id = randomUUID()
  images.set(id, Buffer.from(await res.arrayBuffer()))
  return id
}

// Unit-length DINOv2 ViT-B/14 embedding of a generated image, so guesses can be scored by how
// close their image stays to the chain's reference image.
export async function embedImage(id) {
  const res = await fetch(`${process.env.IMAGE_API_URL}/embed`, {
    method: 'POST',
    headers: { 'content-type': 'image/png', authorization: `Bearer ${process.env.IMAGE_API_SECRET}` },
    body: images.get(id),
    signal: AbortSignal.timeout(Number(process.env.IMAGE_TIMEOUT_MS) || 60_000),
  })
  if (!res.ok) throw new Error(`embed API responded ${res.status}`)
  return (await res.json()).embedding
}

// Cosine similarity of unit vectors as 0-100 points (unrelated images land near 0).
export const similarityPoints = (a, b) => Math.round(Math.max(0, a.reduce((sum, x, i) => sum + x * b[i], 0)) * 100)

export const getImage = (id) => images.get(id)
export const deleteImage = (id) => images.delete(id)
