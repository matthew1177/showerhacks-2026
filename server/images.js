// Client for the Python image API (../imagegen). Only this server talks to it, using a shared
// secret, so images can only be made by playing the game. Generated PNGs are kept in memory and
// served same-origin at /images/<id>.png (Discord's CSP blocks outside image URLs).

import { randomUUID } from 'node:crypto'

// Read lazily: index.js loads server/.env after the imports have run.
// IMAGE_API_URL is e.g. http://127.0.0.1:8000; unset = placeholder gradients.
export const imagesEnabled = () => Boolean(process.env.IMAGE_API_URL && process.env.IMAGE_API_SECRET)

const images = new Map() // id -> PNG Buffer

export async function generateImage(prompt, style, creativity) {
  const res = await fetch(`${process.env.IMAGE_API_URL}/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.IMAGE_API_SECRET}` },
    body: JSON.stringify({ prompt, style, creativity }),
    signal: AbortSignal.timeout(Number(process.env.IMAGE_TIMEOUT_MS) || 60_000),
  })
  if (!res.ok) throw new Error(`image API responded ${res.status}`)
  const id = randomUUID()
  images.set(id, Buffer.from(await res.arrayBuffer()))
  return id
}

export const getImage = (id) => images.get(id)
export const deleteImage = (id) => images.delete(id)
