// Mock data so the UI can be built before the backend / Discord SDK exist.

export const PLAYERS = [
  { id: '1', name: 'jaden', color: '#5865F2', host: true, done: true },
  { id: '2', name: 'matthew', color: '#EB459E', done: true },
  { id: '3', name: 'priya', color: '#57F287', done: false },
  { id: '4', name: 'leo', color: '#FEE75C', done: true },
  { id: '5', name: 'sam', color: '#ED4245', done: false },
  { id: '6', name: 'kai', color: '#3BA5DC', done: true },
]

export const ME = PLAYERS[0]

export const SETTINGS = {
  rounds: 6,
  promptSeconds: 60,
  guessSeconds: 45,
  artStyle: 'Any',
}

export const ART_STYLES = ['Any', 'Photo', 'Cartoon', 'Pixel art', 'Oil painting', 'Claymation']

export const PROMPT_IDEAS = [
  'a raccoon running a lemonade stand in the rain',
  'medieval knights stuck in a traffic jam',
  'a cat piloting a hot air balloon over Tokyo',
  'the moon getting a haircut',
  'a haunted vending machine at 3am',
]

// Stand-in for a generated image: a seeded gradient so each step looks different.
export function placeholderImage(seed) {
  let h = 0
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) % 360
  return `radial-gradient(circle at 30% 30%, hsl(${h} 80% 65%), transparent 55%),
    radial-gradient(circle at 75% 70%, hsl(${(h + 120) % 360} 75% 55%), transparent 50%),
    linear-gradient(135deg, hsl(${(h + 220) % 360} 45% 25%), hsl(${(h + 260) % 360} 50% 15%))`
}

export const CHAIN = {
  owner: PLAYERS[1],
  steps: [
    { kind: 'prompt', player: PLAYERS[1], text: 'a raccoon running a lemonade stand in the rain' },
    { kind: 'image', text: 'a raccoon running a lemonade stand in the rain' },
    { kind: 'guess', player: PLAYERS[2], text: 'a sad trash panda selling juice during a storm' },
    { kind: 'image', text: 'a sad trash panda selling juice during a storm' },
    { kind: 'guess', player: PLAYERS[3], text: 'a crying bear at a farmers market' },
    { kind: 'image', text: 'a crying bear at a farmers market' },
    { kind: 'guess', player: PLAYERS[4], text: 'grizzly bear sobbing over vegetables' },
  ],
}
