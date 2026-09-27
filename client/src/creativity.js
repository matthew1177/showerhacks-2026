export function creativityLabel(value) {
  if (value < 35) return 'Literal'
  if (value < 63) return 'Balanced'
  if (value < 88) return 'Playful'
  return 'Expressive'
}
