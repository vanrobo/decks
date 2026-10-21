import type { BoardBackdrop, DeckManifest } from '../types'

export type BackdropPreset = {
  id: string
  label: string
  background: string
  backdrop: BoardBackdrop
}

export const BACKDROP_PRESETS: BackdropPreset[] = [
  {
    id: 'pitch-dark',
    label: 'Pitch Dark',
    background: '#111111',
    backdrop: { kind: 'solid' },
  },
  {
    id: 'soft-black',
    label: 'Soft Black',
    background: '#1a1a1a',
    backdrop: { kind: 'pattern', pattern: 'dots' },
  },
  {
    id: 'grid-night',
    label: 'Grid Night',
    background: '#0d0d0d',
    backdrop: { kind: 'pattern', pattern: 'grid' },
  },
  {
    id: 'grain',
    label: 'Grain',
    background: '#121212',
    backdrop: { kind: 'pattern', pattern: 'noise' },
  },
  {
    id: 'clean-white',
    label: 'Clean White',
    background: '#ffffff',
    backdrop: { kind: 'solid' },
  },
  {
    id: 'paper',
    label: 'Paper',
    background: '#f5f5f5',
    backdrop: { kind: 'pattern', pattern: 'fineGrid' },
  },
]

export function applyPreset(manifest: DeckManifest, preset: BackdropPreset): DeckManifest {
  return {
    ...manifest,
    background: preset.background,
    backdrop: { ...preset.backdrop },
  }
}

export function patternClass(pattern?: BoardBackdrop['pattern']): string {
  switch (pattern) {
    case 'dots':
      return 'pattern-dots'
    case 'grid':
      return 'pattern-grid'
    case 'fineGrid':
      return 'pattern-fine-grid'
    case 'noise':
      return 'pattern-noise'
    default:
      return ''
  }
}

export function isOpenableUrl(url: string): boolean {
  const u = url.trim()
  if (!u || u === 'https://' || u === 'http://') return false
  return /^https?:\/\/.+/i.test(u)
}
