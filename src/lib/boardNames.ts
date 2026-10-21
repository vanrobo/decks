const ADJECTIVES = [
  'Amber',
  'Bright',
  'Calm',
  'Clear',
  'Coral',
  'Cosmic',
  'Crisp',
  'Dawn',
  'Ember',
  'Gentle',
  'Golden',
  'Hidden',
  'Ivory',
  'Lunar',
  'Maple',
  'Neon',
  'North',
  'Olive',
  'Quiet',
  'Rapid',
  'Silver',
  'Soft',
  'Solar',
  'Swift',
  'Velvet',
  'Vivid',
  'Warm',
  'Wild',
]

const NOUNS = [
  'Arcade',
  'Atlas',
  'Bloom',
  'Board',
  'Canvas',
  'Circuit',
  'Deck',
  'Draft',
  'Forum',
  'Gallery',
  'Harbor',
  'Hive',
  'Lattice',
  'Lotus',
  'Orbit',
  'Pitch',
  'Plaza',
  'Pulse',
  'Relay',
  'Sketch',
  'Studio',
  'Summit',
  'Trail',
  'Vault',
]

function pick<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)]!
}

/** Friendly random board title — e.g. "Quiet Pitch", "Amber Studio" */
export function randomBoardName(): string {
  const adj = pick(ADJECTIVES).trim()
  const noun = pick(NOUNS)
  return `${adj} ${noun}`
}
