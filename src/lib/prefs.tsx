import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { FrameFillMode } from '../types'

export type ThemeMode = 'light' | 'dark'
export type LibraryLayout = 'list' | 'grid'
export type PresentHintMode = 'off' | 'auto' | 'always'
export type BoardWidthPreset = 1080 | 1200 | 1440
export type BoardGapPreset = 16 | 24 | 40

type PrefsCtx = {
  theme: ThemeMode
  setTheme: (t: ThemeMode) => void
  presentFullscreen: boolean
  setPresentFullscreen: (v: boolean) => void
  presentHintMode: PresentHintMode
  setPresentHintMode: (v: PresentHintMode) => void
  hidePresentCursor: boolean
  setHidePresentCursor: (v: boolean) => void
  videosAsGif: boolean
  setVideosAsGif: (v: boolean) => void
  mutePresentVideos: boolean
  setMutePresentVideos: (v: boolean) => void
  defaultBoardWidth: BoardWidthPreset
  setDefaultBoardWidth: (v: BoardWidthPreset) => void
  defaultFrameFill: FrameFillMode
  setDefaultFrameFill: (v: FrameFillMode) => void
  defaultGap: BoardGapPreset
  setDefaultGap: (v: BoardGapPreset) => void
  reduceMotion: boolean
  setReduceMotion: (v: boolean) => void
  libraryLayout: LibraryLayout
  setLibraryLayout: (v: LibraryLayout) => void
}

const PrefsContext = createContext<PrefsCtx | null>(null)

const THEME_KEY = 'decks-theme'
const PRESENT_FS_KEY = 'decks-present-fullscreen'
const PRESENT_HINT_KEY = 'decks-present-hint'
const PRESENT_HINT_MODE_KEY = 'decks-present-hint-mode'
const HIDE_CURSOR_KEY = 'decks-hide-present-cursor'
const VIDEOS_GIF_KEY = 'decks-videos-as-gif'
const MUTE_VIDEO_KEY = 'decks-mute-present-videos'
const DEFAULT_WIDTH_KEY = 'decks-default-width'
const DEFAULT_FILL_KEY = 'decks-default-frame-fill'
const DEFAULT_GAP_KEY = 'decks-default-gap'
const REDUCE_MOTION_KEY = 'decks-reduce-motion'
const LIBRARY_LAYOUT_KEY = 'decks-library-layout'

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStored(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* ignore */
  }
}

function readTheme(): ThemeMode {
  const v = readStored(THEME_KEY)
  if (v === 'dark' || v === 'light') return v
  return 'light'
}

function readBool(key: string, fallback: boolean): boolean {
  const v = readStored(key)
  if (v === '1' || v === 'true') return true
  if (v === '0' || v === 'false') return false
  return fallback
}

function readLibraryLayout(): LibraryLayout {
  const v = readStored(LIBRARY_LAYOUT_KEY)
  if (v === 'list' || v === 'grid') return v
  return 'list'
}

function readPresentHintMode(): PresentHintMode {
  const v = readStored(PRESENT_HINT_MODE_KEY)
  if (v === 'off' || v === 'auto' || v === 'always') return v
  const legacy = readStored(PRESENT_HINT_KEY)
  if (legacy === '0' || legacy === 'false') return 'off'
  if (legacy === '1' || legacy === 'true') return 'always'
  return 'auto'
}

function readWidth(): BoardWidthPreset {
  const n = Number(readStored(DEFAULT_WIDTH_KEY))
  if (n === 1080 || n === 1200 || n === 1440) return n
  return 1200
}

function readFrameFill(): FrameFillMode {
  const v = readStored(DEFAULT_FILL_KEY)
  if (v === 'contained' || v === 'bleed' || v === 'expand' || v === 'ambient') return v
  return 'contained'
}

function readGap(): BoardGapPreset {
  const n = Number(readStored(DEFAULT_GAP_KEY))
  if (n === 16 || n === 24 || n === 40) return n
  return 24
}

function applyDomTheme(t: ThemeMode) {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = t
}

function applyReduceMotion(on: boolean) {
  if (typeof document === 'undefined') return
  if (on) document.documentElement.dataset.reduceMotion = '1'
  else delete document.documentElement.dataset.reduceMotion
}

function readReduceMotionInitial(): boolean {
  const stored = readStored(REDUCE_MOTION_KEY)
  if (stored === '1' || stored === 'true') return true
  if (stored === '0' || stored === 'false') return false
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    const t = typeof window !== 'undefined' ? readTheme() : 'light'
    applyDomTheme(t)
    return t
  })
  const [presentFullscreen, setPresentFullscreenState] = useState(() =>
    typeof window !== 'undefined' ? readBool(PRESENT_FS_KEY, true) : true,
  )
  const [presentHintMode, setPresentHintModeState] = useState<PresentHintMode>(() =>
    typeof window !== 'undefined' ? readPresentHintMode() : 'auto',
  )
  const [hidePresentCursor, setHidePresentCursorState] = useState(() =>
    typeof window !== 'undefined' ? readBool(HIDE_CURSOR_KEY, false) : false,
  )
  const [videosAsGif, setVideosAsGifState] = useState(() =>
    typeof window !== 'undefined' ? readBool(VIDEOS_GIF_KEY, true) : true,
  )
  const [mutePresentVideos, setMutePresentVideosState] = useState(() =>
    typeof window !== 'undefined' ? readBool(MUTE_VIDEO_KEY, true) : true,
  )
  const [defaultBoardWidth, setDefaultBoardWidthState] = useState<BoardWidthPreset>(() =>
    typeof window !== 'undefined' ? readWidth() : 1200,
  )
  const [defaultFrameFill, setDefaultFrameFillState] = useState<FrameFillMode>(() =>
    typeof window !== 'undefined' ? readFrameFill() : 'contained',
  )
  const [defaultGap, setDefaultGapState] = useState<BoardGapPreset>(() =>
    typeof window !== 'undefined' ? readGap() : 24,
  )
  const [reduceMotion, setReduceMotionState] = useState(() => {
    if (typeof window === 'undefined') return false
    const v = readReduceMotionInitial()
    applyReduceMotion(v)
    return v
  })
  const [libraryLayout, setLibraryLayoutState] = useState<LibraryLayout>(() =>
    typeof window !== 'undefined' ? readLibraryLayout() : 'list',
  )

  const setTheme = useCallback((t: ThemeMode) => {
    setThemeState(t)
    applyDomTheme(t)
    writeStored(THEME_KEY, t)
  }, [])

  const setPresentFullscreen = useCallback((v: boolean) => {
    setPresentFullscreenState(v)
    writeStored(PRESENT_FS_KEY, v ? '1' : '0')
  }, [])

  const setPresentHintMode = useCallback((v: PresentHintMode) => {
    setPresentHintModeState(v)
    writeStored(PRESENT_HINT_MODE_KEY, v)
  }, [])

  const setHidePresentCursor = useCallback((v: boolean) => {
    setHidePresentCursorState(v)
    writeStored(HIDE_CURSOR_KEY, v ? '1' : '0')
  }, [])

  const setVideosAsGif = useCallback((v: boolean) => {
    setVideosAsGifState(v)
    writeStored(VIDEOS_GIF_KEY, v ? '1' : '0')
  }, [])

  const setMutePresentVideos = useCallback((v: boolean) => {
    setMutePresentVideosState(v)
    writeStored(MUTE_VIDEO_KEY, v ? '1' : '0')
  }, [])

  const setDefaultBoardWidth = useCallback((v: BoardWidthPreset) => {
    setDefaultBoardWidthState(v)
    writeStored(DEFAULT_WIDTH_KEY, String(v))
  }, [])

  const setDefaultFrameFill = useCallback((v: FrameFillMode) => {
    setDefaultFrameFillState(v)
    writeStored(DEFAULT_FILL_KEY, v)
  }, [])

  const setDefaultGap = useCallback((v: BoardGapPreset) => {
    setDefaultGapState(v)
    writeStored(DEFAULT_GAP_KEY, String(v))
  }, [])

  const setReduceMotion = useCallback((v: boolean) => {
    setReduceMotionState(v)
    applyReduceMotion(v)
    writeStored(REDUCE_MOTION_KEY, v ? '1' : '0')
  }, [])

  const setLibraryLayout = useCallback((v: LibraryLayout) => {
    setLibraryLayoutState(v)
    writeStored(LIBRARY_LAYOUT_KEY, v)
  }, [])

  useEffect(() => {
    applyDomTheme(theme)
  }, [theme])

  useEffect(() => {
    applyReduceMotion(reduceMotion)
  }, [reduceMotion])

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      presentFullscreen,
      setPresentFullscreen,
      presentHintMode,
      setPresentHintMode,
      hidePresentCursor,
      setHidePresentCursor,
      videosAsGif,
      setVideosAsGif,
      mutePresentVideos,
      setMutePresentVideos,
      defaultBoardWidth,
      setDefaultBoardWidth,
      defaultFrameFill,
      setDefaultFrameFill,
      defaultGap,
      setDefaultGap,
      reduceMotion,
      setReduceMotion,
      libraryLayout,
      setLibraryLayout,
    }),
    [
      theme,
      setTheme,
      presentFullscreen,
      setPresentFullscreen,
      presentHintMode,
      setPresentHintMode,
      hidePresentCursor,
      setHidePresentCursor,
      videosAsGif,
      setVideosAsGif,
      mutePresentVideos,
      setMutePresentVideos,
      defaultBoardWidth,
      setDefaultBoardWidth,
      defaultFrameFill,
      setDefaultFrameFill,
      defaultGap,
      setDefaultGap,
      reduceMotion,
      setReduceMotion,
      libraryLayout,
      setLibraryLayout,
    ],
  )
  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>
}

export function usePrefs() {
  const ctx = useContext(PrefsContext)
  if (!ctx) throw new Error('usePrefs outside PrefsProvider')
  return ctx
}

/** @deprecated use usePrefs — kept so older imports keep working briefly */
export function useTheme() {
  const { theme, setTheme } = usePrefs()
  return {
    theme,
    setTheme,
    toggle: () => setTheme(theme === 'light' ? 'dark' : 'light'),
  }
}
