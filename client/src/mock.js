// Mock data so the UI can be built before the backend / Discord SDK exist.

export const PLAYERS = [
  { id: '1', name: 'jaden', color: 'var(--ctp-mauve)', host: true, done: true },
  { id: '2', name: 'matthew', color: 'var(--ctp-pink)', done: true },
  { id: '3', name: 'priya', color: 'var(--ctp-green)', done: false },
  { id: '4', name: 'leo', color: 'var(--ctp-yellow)', done: true },
  { id: '5', name: 'sam', color: 'var(--ctp-red)', done: false },
  { id: '6', name: 'kai', color: 'var(--ctp-blue)', done: true },
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

// Stand-in for a generated image: a seeded Catppuccin gradient so each step looks different.
const IMAGE_COLORS = ['mauve', 'pink', 'peach', 'yellow', 'green', 'teal', 'blue', 'lavender']

export function placeholderImage(seed) {
  let h = 0
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) % 360
  const color = (offset) => `var(--ctp-${IMAGE_COLORS[(h + offset) % IMAGE_COLORS.length]})`
  return `radial-gradient(circle at 30% 30%, ${color(0)}, transparent 55%),
    radial-gradient(circle at 75% 70%, ${color(3)}, transparent 50%),
    linear-gradient(135deg, var(--ctp-surface0), var(--ctp-crust))`
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
