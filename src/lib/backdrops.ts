import type { CSSProperties } from 'react'
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

/** Inline styles for an image backdrop layer (cover / tile). */
export function backdropImageStyle(
  backdrop: BoardBackdrop,
  assetUrl: (src: string) => string,
): CSSProperties | undefined {
  if (backdrop.kind !== 'image' || !backdrop.imageSrc) return undefined
  const url = assetUrl(backdrop.imageSrc)
  if (backdrop.imageMode === 'tile') {
    return {
      backgroundImage: `url("${url}")`,
      backgroundRepeat: 'repeat',
      backgroundSize: 'auto',
    }
  }
  return {
    backgroundImage: `url("${url}")`,
    backgroundRepeat: 'no-repeat',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  }
}

/**
 * Present-mode parallax: how much of scroll the stage backdrop absorbs.
 * 0 = locked to viewport (pure stage), 1 = scrolls with content (no parallax).
 */
export const PRESENT_PARALLAX = 0.38

export function isOpenableUrl(url: string): boolean {
  const u = url.trim()
  if (!u || u === 'https://' || u === 'http://') return false
  return /^https?:\/\/.+/i.test(u)
}
