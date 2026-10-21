export type TextVariant = 'heading' | 'body'
export type TextAlign = 'left' | 'center' | 'right'
/** Relative type scale for text / link blocks. */
export type BlockSize = 'sm' | 'md' | 'lg' | 'xl'
/** Media column width as a fraction of the board. */
export type MediaWidth = 'full' | 'wide' | 'half' | 'narrow'
export type MediaRadius = 'none' | 'soft' | 'round'
export type MediaFit = 'natural' | 'contain' | 'cover'
export type MediaKind = 'image' | 'video'

/** Present-mode snap cue as a fraction of image height (0 = top, 1 = bottom). */
export type ImageSnapPoint = {
  id: string
  y: number
  label?: string
}

export type ImageBlock = {
  id: string
  type: 'image'
  src: string
  kind: MediaKind
  /** Original filename from Figma export / disk (for sidebar labels) */
  name?: string
  /** Degrees: 0 | 90 | 180 | 270 */
  rotate?: number
  /** Optional present snap cues within a tall export */
  snapPoints?: ImageSnapPoint[]
  /** Width relative to board. Default `full`. */
  width?: MediaWidth
  /** Corner rounding. Default `none`. */
  radius?: MediaRadius
  /** How media fills its frame. Default `natural` (intrinsic). */
  fit?: MediaFit
  /**
   * Video only: muted + loop + autoplay, no controls (like a GIF).
   * Undefined = follow app “Play like GIFs” setting.
   */
  asGif?: boolean
  /** Video only: loop playback (default true). */
  loop?: boolean
  /** Video only: playback rate (default 1). */
  playbackRate?: number
  /** Video only: force mute. Undefined = GIF/app default. */
  muted?: boolean
  /** Video only: show native controls while presenting. Default on. Ignored when asGif. */
  showControls?: boolean
  gapAfter?: number
}

export type TextBlock = {
  id: string
  type: 'text'
  variant: TextVariant
  content: string
  align: TextAlign
  /** Type scale. Default: heading → `lg`, body → `md`. */
  size?: BlockSize
  gapAfter?: number
}

export type LinkBlock = {
  id: string
  type: 'link'
  label: string
  url: string
  align?: TextAlign
  /** Type / card scale. Default `md`. */
  size?: BlockSize
  gapAfter?: number
}

export type SpacerBlock = {
  id: string
  type: 'spacer'
  height: number
}

/** Standalone present snap cue between blocks (edit-only visible). */
export type MarkerBlock = {
  id: string
  type: 'marker'
  label?: string
}

export type Block =
  | ImageBlock
  | TextBlock
  | LinkBlock
  | SpacerBlock
  | MarkerBlock

export type BackdropPattern = 'dots' | 'grid' | 'fineGrid' | 'noise'

export type BoardBackdrop = {
  kind: 'solid' | 'pattern' | 'image'
  pattern?: BackdropPattern
  imageSrc?: string
  imageMode?: 'tile' | 'cover'
}

/** How frames relate to board gutters: flush, edge-pixel expand, or ambient glow. */
export type FrameFillMode = 'contained' | 'bleed' | 'expand' | 'ambient'

export type DeckManifest = {
  format: 'core-deck'
  version: 1
  title: string
  width: number
  background: string
  gap: number
  blocks: Block[]
  backdrop?: BoardBackdrop
  /** Default `contained`. Bleed = edge-to-edge; expand = stretch edge pixels; ambient = soft glow. */
  frameFill?: FrameFillMode
}

export type RecentEntry = {
  id: string
  title: string
  path: string
  corePath?: string
  kind: 'project' | 'core'
  openedAt?: number
}

export type ProjectPeek = {
  path: string
  title: string
  background: string
  previewUrl: string | null
  previewKind: MediaKind | null
  previewName?: string | null
  rotate: number
  blockCount: number
}

export type ImportedMedia = {
  src: string
  kind: MediaKind
  url: string
  name?: string
}

export type ProjectPayload = {
  dir: string
  manifest: DeckManifest
  assetBase: string
  sourcePath?: string
}

export type CoreAPI = {
  isElectron: true
  newProject: (title?: string) => Promise<ProjectPayload>
  getState: () => Promise<ProjectPayload | null>
  activateProject: (dir: string) => Promise<ProjectPayload>
  saveManifest: (manifest: DeckManifest, dir?: string) => Promise<boolean>
  importMedia: () => Promise<ImportedMedia[]>
  importDropped: (
    files: { name: string; buffer: ArrayBuffer; ext: string }[],
  ) => Promise<ImportedMedia[]>
  openCore: () => Promise<ProjectPayload | null>
  openCorePath: (path: string) => Promise<ProjectPayload | null>
  exportCore: (suggestedName?: string) => Promise<string | null>
  exportCorePick: (suggestedName?: string) => Promise<string | null>
  exportCoreWrite: (destPath: string) => Promise<string>
  /** Pick a folder path for numbered Behance media export */
  exportBehancePick: (suggestedName?: string) => Promise<string | null>
  /** Write 1.ext, 2.ext, … media into dest folder (board order) */
  exportBehanceWrite: (destDir: string) => Promise<string>
  listRecents: () => Promise<RecentEntry[]>
  listProjects: () => Promise<RecentEntry[]>
  peekProject: (dir: string) => Promise<ProjectPeek | null>
  renameProject: (dir: string, title: string) => Promise<RecentEntry>
  deleteProject: (dir: string) => Promise<boolean>
  removeRecent: (dir: string) => Promise<boolean>
  openRecent: (dir: string) => Promise<ProjectPayload | null>
  assetUrl: (rel: string) => Promise<string>
  openExternal: (url: string) => Promise<void>
  setFullscreen: (flag: boolean) => Promise<boolean>
  isFullscreen: () => Promise<boolean>
  minimize: () => Promise<void>
  maximizeToggle: () => Promise<boolean>
  closeWindow: () => Promise<void>
  isMaximized: () => Promise<boolean>
  showError: (title: string, message: string) => Promise<void>
  onExportProgress: (
    handler: (payload: { percent: number; phase: string }) => void,
  ) => () => void
  onMenu: (
    channel: 'new' | 'open' | 'save' | 'export' | 'present',
    handler: () => void,
  ) => () => void
  onOpenFile: (handler: (path: string) => void) => () => void
  onMaximized: (handler: (maximized: boolean) => void) => () => void
}

export type EmptyManifestDefaults = {
  width?: number
  gap?: number
  frameFill?: FrameFillMode
}

export function createEmptyManifest(
  title = 'New Board',
  defaults: EmptyManifestDefaults = {},
): DeckManifest {
  return {
    format: 'core-deck',
    version: 1,
    title,
    width: defaults.width ?? 1200,
    background: '#111111',
    gap: defaults.gap ?? 24,
    blocks: [],
    backdrop: { kind: 'solid' },
    frameFill: defaults.frameFill ?? 'contained',
  }
}

export const VIDEO_EXTS = ['.mp4', '.webm', '.mov']
export const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.webp']
