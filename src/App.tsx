import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DeckManifest, ProjectPayload } from './types'
import { createEmptyManifest } from './types'
import { preloadMedia } from './lib/media'
import { isOpenableUrl } from './lib/backdrops'
import { randomBoardName } from './lib/boardNames'
import { Home } from './components/Home'
import { Editor, EditorActions } from './components/Editor'
import { Presenter } from './components/Presenter'
import { CoreMark } from './components/CoreMark'
import { BusyOverlay } from './components/BusyOverlay'
import { ExportOverlay } from './components/ExportOverlay'
import { TitleBar, type TitleTab } from './components/TitleBar'
import { SettingsMenu, SettingsScreen } from './components/SettingsMenu'
import { usePrefs } from './lib/prefs'

type Mode = 'home' | 'edit' | 'present' | 'settings'
type SaveStatus = 'saved' | 'saving' | 'error'

type OpenBoard = {
  id: string
  dir: string
  manifest: DeckManifest
  assetBase: string
}

const EXPORT_PHASE_LABEL: Record<string, string> = {
  collect: 'Gathering files…',
  present: 'Building Present.html…',
  compress: 'Compressing board…',
  write: 'Writing .core…',
  copy: 'Numbering frames…',
  done: 'Done',
}

function normalizeManifest(m: DeckManifest): DeckManifest {
  const fill = m.frameFill
  const frameFill =
    fill === 'bleed' || fill === 'expand' || fill === 'ambient' || fill === 'contained'
      ? fill
      : ('contained' as const)
  return {
    ...m,
    backdrop: m.backdrop ?? { kind: 'solid' as const },
    frameFill,
    // Drop legacy isoCube blocks if present in older decks
    blocks: m.blocks.filter((b) => (b as { type: string }).type !== 'isoCube'),
  }
}

export default function App() {
  const [booting, setBooting] = useState(true)
  const [mode, setMode] = useState<Mode>('home')
  const [boards, setBoards] = useState<OpenBoard[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')
  const [preloadReady, setPreloadReady] = useState(false)
  const [preloadLabel, setPreloadLabel] = useState('Idle')
  const [exporting, setExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState<number | null>(null)
  const [exportStatus, setExportStatus] = useState('Packing your board…')
  const [exportTitle, setExportTitle] = useState('Exporting')
  const [error, setError] = useState<string | null>(null)

  const boardsRef = useRef(boards)
  boardsRef.current = boards
  const activeIdRef = useRef(activeId)
  activeIdRef.current = activeId
  const saveTimer = useRef(0)
  const skipAutosave = useRef(false)
  const switching = useRef(false)

  const isElectron = Boolean(window.core?.isElectron)
  const {
    presentFullscreen,
    defaultBoardWidth,
    defaultFrameFill,
    defaultGap,
  } = usePrefs()

  const activeBoard = useMemo(
    () => boards.find((b) => b.id === activeId) ?? null,
    [boards, activeId],
  )
  const manifest = activeBoard?.manifest ?? null
  const assetBase = activeBoard?.assetBase ?? 'core-asset://local/'

  useEffect(() => {
    const t = window.setTimeout(() => setBooting(false), 900)
    return () => window.clearTimeout(t)
  }, [])

  const upsertBoard = useCallback((payload: ProjectPayload, activate = true) => {
    const board: OpenBoard = {
      id: payload.dir,
      dir: payload.dir,
      manifest: normalizeManifest(payload.manifest),
      assetBase: payload.assetBase || 'core-asset://local/',
    }
    skipAutosave.current = true
    setBoards((prev) => {
      const i = prev.findIndex((b) => b.id === board.id)
      if (i >= 0) {
        const next = [...prev]
        next[i] = board
        return next
      }
      return [...prev, board]
    })
    if (activate) {
      setActiveId(board.id)
      setMode('edit')
    }
    setSaveStatus('saved')
    setError(null)
    queueMicrotask(() => {
      skipAutosave.current = false
    })
  }, [])

  const assetUrl = useCallback(
    (src: string) => `${assetBase}${src.replace(/^\/+/, '')}`,
    [assetBase],
  )

  const flushSave = useCallback(async (boardId?: string | null) => {
    const id = boardId === undefined ? activeIdRef.current : boardId
    if (!id || !window.core) return
    const board = boardsRef.current.find((b) => b.id === id)
    if (!board) return
    window.clearTimeout(saveTimer.current)
    setSaveStatus('saving')
    try {
      // Second arg needs a restarted Electron preload; older builds ignore it.
      await window.core.saveManifest(board.manifest, board.dir)
      setSaveStatus('saved')
    } catch {
      setSaveStatus('error')
    }
  }, [])

  /** Point main-process projectDir at this board (imports / export) + refresh assetBase. */
  const activateDir = useCallback(async (dir: string) => {
    if (!window.core) return
    let payload: ProjectPayload | null = null
    if (typeof window.core.activateProject === 'function') {
      payload = await window.core.activateProject(dir)
    } else if (typeof window.core.openRecent === 'function') {
      // Preload not restarted yet — openRecent also sets projectDir.
      payload = await window.core.openRecent(dir)
    }
    if (payload?.assetBase) {
      setBoards((prev) =>
        prev.map((b) =>
          b.id === dir ? { ...b, assetBase: payload!.assetBase } : b,
        ),
      )
    }
  }, [])

  useEffect(() => {
    if (!manifest || !activeId || mode !== 'edit' || !window.core) return
    if (skipAutosave.current || switching.current) return
    setSaveStatus('saving')
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      void flushSave(activeId)
    }, 500)
    return () => window.clearTimeout(saveTimer.current)
  }, [manifest, activeId, mode, flushSave])

  useEffect(() => {
    if (!manifest || mode === 'home' || mode === 'settings') {
      setPreloadReady(false)
      setPreloadLabel('Idle')
      return
    }
    const media: { url: string; kind: 'image' | 'video' }[] = []
    for (const b of manifest.blocks) {
      if (b.type === 'image') {
        media.push({ url: assetUrl(b.src), kind: b.kind })
      }
    }

    if (manifest.backdrop?.kind === 'image' && manifest.backdrop.imageSrc) {
      media.push({ url: assetUrl(manifest.backdrop.imageSrc), kind: 'image' })
    }

    if (media.length === 0) {
      setPreloadReady(true)
      setPreloadLabel('Ready')
      return
    }

    let cancelled = false
    setPreloadReady(false)
    setPreloadLabel(`Warming up… 0/${media.length}`)

    void preloadMedia(media, (done, total) => {
      if (cancelled) return
      setPreloadLabel(done >= total ? 'Ready' : `Warming up… ${done}/${total}`)
      if (done >= total) setPreloadReady(true)
    }).then(() => {
      if (!cancelled) {
        setPreloadReady(true)
        setPreloadLabel('Ready')
      }
    })

    return () => {
      cancelled = true
    }
  }, [manifest, assetUrl, mode, activeId])

  const onChange = (next: DeckManifest) => {
    const id = activeIdRef.current
    if (!id) return
    setBoards((prev) =>
      prev.map((b) => (b.id === id ? { ...b, manifest: next } : b)),
    )
  }

  const selectBoard = useCallback(
    async (id: string) => {
      if (!id) return
      // Already viewing this board
      if (id === activeIdRef.current && mode === 'edit') return
      switching.current = true
      try {
        if (activeIdRef.current && activeIdRef.current !== id) {
          await flushSave(activeIdRef.current)
        }
        await activateDir(id)
        setActiveId(id)
        setMode('edit')
        setSaveStatus('saved')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not open board')
      } finally {
        switching.current = false
      }
    },
    [flushSave, mode, activateDir],
  )

  const goHome = useCallback(() => {
    void flushSave().then(() => setMode('home'))
  }, [flushSave])

  const goSettings = useCallback(() => {
    void flushSave().then(() => setMode('settings'))
  }, [flushSave])

  const closeBoard = useCallback(
    async (id: string) => {
      await flushSave(id)
      const remaining = boardsRef.current.filter((b) => b.id !== id)
      setBoards(remaining)
      if (activeIdRef.current === id) {
        if (remaining.length > 0) {
          const next = remaining[remaining.length - 1]!
          try {
            await activateDir(next.id)
          } catch {
            /* ignore */
          }
          setActiveId(next.id)
          setMode('edit')
        } else {
          setActiveId(null)
          setMode('home')
        }
      }
    },
    [flushSave, activateDir],
  )

  const newBoard = useCallback(async () => {
    const title = randomBoardName()
    const defaults = {
      width: defaultBoardWidth,
      gap: defaultGap,
      frameFill: defaultFrameFill,
    }
    if (!window.core) {
      const id = `local-${crypto.randomUUID()}`
      upsertBoard({
        dir: id,
        manifest: createEmptyManifest(title, defaults),
        assetBase: 'core-asset://local/',
      })
      return
    }
    await flushSave()
    const payload = await window.core.newProject(title)
    const manifest = {
      ...payload.manifest,
      width: defaults.width,
      gap: defaults.gap,
      frameFill: defaults.frameFill,
    }
    upsertBoard({ ...payload, manifest })
    void window.core.saveManifest(manifest, payload.dir)
  }, [
    upsertBoard,
    flushSave,
    defaultBoardWidth,
    defaultGap,
    defaultFrameFill,
  ])

  const openCore = useCallback(async () => {
    if (!window.core) return
    await flushSave()
    const payload = await window.core.openCore()
    if (payload) upsertBoard(payload)
  }, [flushSave, upsertBoard])

  const openRecent = useCallback(
    async (dir: string) => {
      if (!window.core) return
      const existing = boardsRef.current.find((b) => b.id === dir)
      if (existing) {
        await selectBoard(existing.id)
        return
      }
      await flushSave()
      const payload = await window.core.openRecent(dir)
      if (payload) upsertBoard(payload)
    },
    [flushSave, upsertBoard, selectBoard],
  )

  const onBoardRenamed = useCallback((dir: string, title: string) => {
    setBoards((prev) =>
      prev.map((b) =>
        b.dir === dir || b.id === dir
          ? { ...b, manifest: { ...b.manifest, title } }
          : b,
      ),
    )
  }, [])

  const onBoardDeleted = useCallback((dir: string) => {
    const open = boardsRef.current.find((b) => b.dir === dir || b.id === dir)
    if (!open) return
    window.clearTimeout(saveTimer.current)
    const remaining = boardsRef.current.filter((b) => b.id !== open.id)
    setBoards(remaining)
    if (activeIdRef.current === open.id) {
      if (remaining.length > 0) {
        const next = remaining[remaining.length - 1]!
        setActiveId(next.id)
        void activateDir(next.id).catch(() => {})
        setMode('edit')
      } else {
        setActiveId(null)
        setMode('home')
      }
    }
  }, [activateDir])

  const doExport = useCallback(async () => {
    if (!manifest || !activeBoard || !window.core || exporting) return
    try {
      await flushSave(activeBoard.id)
      await activateDir(activeBoard.id)
      const dest = await window.core.exportCorePick(manifest.title || 'deck')
      if (!dest) return

      setExportProgress(0)
      setExportTitle('Exporting .core')
      setExportStatus('Packing your board…')
      setExporting(true)
      const stopProgress = window.core.onExportProgress?.(({ percent, phase }) => {
        setExportProgress(percent)
        if (phase && EXPORT_PHASE_LABEL[phase]) {
          setExportStatus(EXPORT_PHASE_LABEL[phase])
        }
      })
      try {
        await window.core.exportCoreWrite(dest)
      } finally {
        stopProgress?.()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setExporting(false)
      setExportProgress(null)
      setExportStatus('Packing your board…')
      setExportTitle('Exporting')
    }
  }, [manifest, activeBoard, flushSave, exporting, activateDir])

  const doExportBehance = useCallback(async () => {
    if (!manifest || !activeBoard || !window.core || exporting) return
    try {
      await flushSave(activeBoard.id)
      await activateDir(activeBoard.id)
      const dest = await window.core.exportBehancePick(manifest.title || 'deck')
      if (!dest) return

      setExportProgress(0)
      setExportTitle('Exporting for Behance')
      setExportStatus('Numbering frames…')
      setExporting(true)
      const stopProgress = window.core.onExportProgress?.(({ percent, phase }) => {
        setExportProgress(percent)
        if (phase && EXPORT_PHASE_LABEL[phase]) {
          setExportStatus(EXPORT_PHASE_LABEL[phase])
        }
      })
      try {
        await window.core.exportBehanceWrite(dest)
      } finally {
        stopProgress?.()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Behance export failed')
    } finally {
      setExporting(false)
      setExportProgress(null)
      setExportStatus('Packing your board…')
      setExportTitle('Exporting')
    }
  }, [manifest, activeBoard, flushSave, exporting, activateDir])

  const startPresent = useCallback(() => {
    if (!preloadReady || !manifest || exporting) return
    setMode('present')
    if (presentFullscreen) void window.core?.setFullscreen(true)
  }, [preloadReady, manifest, exporting, presentFullscreen])

  const exitPresent = useCallback(() => {
    setMode('edit')
    if (presentFullscreen) void window.core?.setFullscreen(false)
  }, [presentFullscreen])

  const openLink = useCallback((url: string) => {
    if (!isOpenableUrl(url)) return
    void window.core?.openExternal(url)
  }, [])

  useEffect(() => {
    if (!window.core) return
    const offs = [
      window.core.onMenu('new', () => void newBoard()),
      window.core.onMenu('open', () => void openCore()),
      window.core.onMenu('save', () => void flushSave()),
      window.core.onMenu('export', () => void doExport()),
      window.core.onMenu('present', () => startPresent()),
      window.core.onOpenFile((filePath) => {
        void window.core?.openCorePath(filePath).then((p) => {
          if (p) upsertBoard(p)
        })
      }),
    ]
    return () => offs.forEach((off) => off())
  }, [newBoard, openCore, flushSave, doExport, startPresent, upsertBoard])

  useEffect(() => {
    if (mode !== 'edit') return
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void flushSave()
      }
      if (e.key === 'F5') {
        e.preventDefault()
        startPresent()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode, flushSave, startPresent])

  const tabs: TitleTab[] = useMemo(
    () =>
      boards.map((b) => ({
        id: b.id,
        label: b.manifest.title?.trim() || 'Board',
        closable: true,
      })),
    [boards],
  )

  const activeTabId = mode === 'edit' ? activeId : null

  const browserFallback = useMemo(
    () => !isElectron && mode === 'home' && !booting,
    [isElectron, mode, booting],
  )

  if (booting) {
    return (
      <div className="app-shell boot-shell">
        <TitleBar />
        <BusyOverlay label="Decks" belowTitlebar />
      </div>
    )
  }

  if (browserFallback) {
    return (
      <div className="home app-shell">
        <TitleBar />
        <div className="home-body">
          <header className="home-hero">
            <CoreMark size={64} />
            <h1 className="home-brand">Decks</h1>
            <p className="home-tag">Pitch boards for designathons & hackathons</p>
            <p className="home-lede">
              Run <code>npm run dev</code> to launch the desktop app.
            </p>
          </header>
        </div>
      </div>
    )
  }

  if (mode === 'present' && manifest) {
    return (
      <Presenter
        manifest={manifest}
        assetUrl={assetUrl}
        onExit={exitPresent}
        onOpenLink={openLink}
      />
    )
  }

  const chrome = (
    <TitleBar
      onHomeClick={goHome}
      homeActive={mode === 'home'}
      tabs={tabs}
      activeTabId={activeTabId}
      onNewTab={() => void newBoard()}
      onTabSelect={(id) => {
        void selectBoard(id)
      }}
      onTabClose={(id) => {
        void closeBoard(id)
      }}
      onTabRename={(id, label) => {
        setBoards((prev) =>
          prev.map((b) =>
            b.id === id ? { ...b, manifest: { ...b.manifest, title: label } } : b,
          ),
        )
      }}
      actions={
        mode === 'edit' && manifest ? (
          <EditorActions
            preloadReady={preloadReady}
            preloadLabel={preloadLabel}
            saveStatus={saveStatus}
            exporting={exporting}
            onExport={() => void doExport()}
            onExportBehance={() => void doExportBehance()}
            onPresent={startPresent}
            onOpenSettings={goSettings}
          />
        ) : (
          <SettingsMenu active={mode === 'settings'} onOpen={goSettings} />
        )
      }
    />
  )

  if (mode === 'edit' && manifest) {
    return (
      <div className="editor app-shell">
        {error && <div className="toast error">{error}</div>}
        {exporting && (
          <ExportOverlay
            belowTitlebar
            title={exportTitle}
            progress={exportProgress}
            status={exportStatus}
          />
        )}
        {chrome}
        <Editor
          manifest={manifest}
          assetBase={assetBase}
          onChange={onChange}
          onImportMedia={async () => (await window.core?.importMedia()) ?? []}
          onImportDropped={async (files) =>
            (await window.core?.importDropped(files)) ?? []
          }
          onOpenLink={openLink}
        />
      </div>
    )
  }

  if (mode === 'settings') {
    return (
      <div className="settings app-shell">
        {chrome}
        <SettingsScreen />
      </div>
    )
  }

  return (
    <div className="home app-shell">
      {chrome}
      <Home
        onNew={() => void newBoard()}
        onOpen={() => void openCore()}
        onOpenRecent={(p) => void openRecent(p)}
        onBoardRenamed={onBoardRenamed}
        onBoardDeleted={onBoardDeleted}
      />
    </div>
  )
}
