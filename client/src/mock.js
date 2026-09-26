// Static content, plus the placeholder that stands in for AI images until the image model is hooked up.

export const ART_STYLES = ['Any', 'Photo', 'Cartoon', 'Pixel art', 'Oil painting', 'Claymation']

export const PROMPT_IDEAS = [
  'a raccoon running a lemonade stand in the rain',
  'medieval knights stuck in a traffic jam',
  'a cat piloting a hot air balloon over Tokyo',
  'the moon getting a haircut',
  'a haunted vending machine at 3am',
]

// Stand-in for a generated image: a seeded gradient in the player colours so each step looks different.
const IMAGE_COLORS = ['mauve', 'pink', 'peach', 'yellow', 'green', 'teal', 'blue', 'lavender']

export function placeholderImage(seed) {
  let h = 0
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) % 360
  const color = (offset) => `var(--player-${IMAGE_COLORS[(h + offset) % IMAGE_COLORS.length]})`
  return `radial-gradient(circle at 30% 30%, ${color(0)}, transparent 55%),
    radial-gradient(circle at 75% 70%, ${color(3)}, transparent 50%),
    linear-gradient(135deg, var(--u-paper), var(--u-tomato-soft))`
}
