import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  Block,
  BlockSize,
  BoardBackdrop,
  DeckManifest,
  FrameFillMode,
  MediaFit,
  MediaRadius,
  MediaWidth,
  TextAlign,
  TextVariant,
  ImportedMedia,
} from '../types'
import { uid } from '../lib/ids'
import { extOf, isMediaFile } from '../lib/media'
import { naturalSortByName } from '../lib/naturalSort'
import { BACKDROP_PRESETS, applyPreset, isOpenableUrl } from '../lib/backdrops'
import {
  beginBlockDrag,
  endBlockDrag,
  isFileDrag,
  readBlockDragIndex,
} from '../lib/blockDrag'
import { Board, type BoardImporting } from './Board'
import { BlockContextMenu, type ContextMenuState } from './BlockContextMenu'
import { CanvasViewport, type CanvasViewportHandle } from './CanvasViewport'
import { FrameInspector } from './FrameInspector'
import { SettingsMenu } from './SettingsMenu'
import { usePrefs } from '../lib/prefs'
import { VIDEO_EXTS } from '../types'

type SaveStatus = 'saved' | 'saving' | 'error'

type Props = {
  manifest: DeckManifest
  assetBase: string
  onChange: (next: DeckManifest) => void
  onImportMedia: () => Promise<ImportedMedia[]>
  onImportDropped: (
    files: { name: string; buffer: ArrayBuffer; ext: string }[],
  ) => Promise<ImportedMedia[]>
  onOpenLink: (url: string) => void
}

/** Right-side titlebar actions while editing */
export function EditorActions({
  preloadReady,
  preloadLabel,
  saveStatus,
  exporting = false,
  onExport,
  onExportBehance,
  onPresent,
  onOpenSettings,
}: {
  preloadReady: boolean
  preloadLabel: string
  saveStatus: SaveStatus
  exporting?: boolean
  onExport: () => void
  onExportBehance: () => void
  onPresent: () => void
  onOpenSettings: () => void
}) {
  const warming = !preloadReady
  const saveLabel =
    saveStatus === 'saving' ? 'Saving…' : saveStatus === 'error' ? 'Save failed' : 'Saved'
  const busy = !preloadReady || exporting
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const exportCloseTimer = useRef(0)

  const openExportMenu = () => {
    window.clearTimeout(exportCloseTimer.current)
    setExportMenuOpen(true)
  }
  const scheduleCloseExportMenu = () => {
    window.clearTimeout(exportCloseTimer.current)
    exportCloseTimer.current = window.setTimeout(() => setExportMenuOpen(false), 120)
  }

  useEffect(() => {
    return () => window.clearTimeout(exportCloseTimer.current)
  }, [])

  return (
    <>
      <span className={`save-status chrome ${saveStatus}`} title={saveLabel}>
        {saveLabel}
      </span>
      {warming && (
        <span className="warm-badge warming" title={preloadLabel}>
          <span className="warm-text">{preloadLabel}</span>
        </span>
      )}
      <div className="titlebar-sep" aria-hidden />
      <SettingsMenu onOpen={onOpenSettings} />
      <div
        className={`export-split${exportMenuOpen ? ' open' : ''}`}
        onMouseEnter={openExportMenu}
        onMouseLeave={scheduleCloseExportMenu}
      >
        <button
          type="button"
          className="btn btn-ghost btn-toolbar export-split-main"
          onClick={onExport}
          disabled={exporting}
          title="Export .core"
        >
          Export
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-toolbar export-split-caret"
          disabled={exporting}
          aria-label="More export options"
          aria-haspopup="menu"
          aria-expanded={exportMenuOpen}
          title="More export options"
          onClick={() => setExportMenuOpen((v) => !v)}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
            <path
              d="M2.2 3.6 5 6.4l2.8-2.8"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        {exportMenuOpen && (
          <div
            className="export-menu"
            role="menu"
            onMouseEnter={openExportMenu}
            onMouseLeave={scheduleCloseExportMenu}
          >
            <button
              type="button"
              role="menuitem"
              className="export-menu-item"
              disabled={exporting}
              onClick={() => {
                setExportMenuOpen(false)
                onExport()
              }}
            >
              Export .core
            </button>
            <button
              type="button"
              role="menuitem"
              className="export-menu-item"
              disabled={exporting}
              onClick={() => {
                setExportMenuOpen(false)
                onExportBehance()
              }}
            >
              Export for Behance
            </button>
          </div>
        )}
      </div>
      <button
        type="button"
        className="btn btn-primary btn-toolbar"
        onClick={onPresent}
        disabled={busy}
        title={preloadReady ? 'Present (F5)' : 'Warming up media…'}
      >
        Present
      </button>
    </>
  )
}

function mediaToBlocks(items: ImportedMedia[], videosAsGif: boolean): Block[] {
  return items.map((m) => ({
    id: uid(),
    type: 'image' as const,
    src: m.src,
    kind: m.kind,
    name: m.name,
    ...(m.kind === 'video' ? { asGif: videosAsGif } : {}),
  }))
}

function blockLabel(b: Block): string {
  if (b.type === 'image') return b.name || b.kind
  if (b.type === 'text') return b.variant
  if (b.type === 'marker') return b.label?.trim() || 'snap'
  return b.type
}

export function Editor({
  manifest,
  assetBase,
  onChange,
  onImportMedia,
  onImportDropped,
  onOpenLink,
}: Props) {
  const { videosAsGif } = usePrefs()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [inspectorId, setInspectorId] = useState<string | null>(null)
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [importing, setImporting] = useState<BoardImporting | null>(null)
  const dropDepth = useRef(0)
  /** Prevents Board + CanvasViewport both ingesting the same drop (orphan duplicate assets). */
  const ingestBusy = useRef(false)
  const canvasRef = useRef<CanvasViewportHandle>(null)
  const toastTimer = useRef(0)

  const importLabelForNames = (names: string[]) => {
    const exts = names.map((n) => extOf(n))
    const videos = exts.filter((e) => VIDEO_EXTS.includes(e)).length
    const gifs = exts.filter((e) => e === '.gif').length
    if (videos && gifs) return 'Adding video & GIF…'
    if (videos > 1) return 'Adding videos…'
    if (videos === 1) return 'Adding video…'
    if (gifs > 1) return 'Adding GIFs…'
    if (gifs === 1) return 'Adding GIF…'
    return names.length > 1 ? 'Adding media…' : 'Adding media…'
  }

  const assetUrl = useCallback(
    (src: string) => {
      const clean = src.replace(/^\/+/, '')
      return `${assetBase}${clean}`
    },
    [assetBase],
  )

  const selected = manifest.blocks.find((b) => b.id === selectedId) ?? null

  const showToast = (msg: string) => {
    setToast(msg)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 2800)
  }

  const update = (patch: Partial<DeckManifest>) => {
    onChange({ ...manifest, ...patch })
  }

  const updateBackdrop = (patch: Partial<BoardBackdrop>) => {
    const current = manifest.backdrop ?? { kind: 'solid' as const }
    update({ backdrop: { ...current, ...patch } })
  }

  const updateBlock = (id: string, patch: Partial<Block>) => {
    onChange({
      ...manifest,
      blocks: manifest.blocks.map((b) => (b.id === id ? ({ ...b, ...patch } as Block) : b)),
    })
  }

  const scrollToEnd = () => {
    canvasRef.current?.scrollToEnd()
  }

  const addBlocks = (blocks: Block[], toastMsg?: string, at?: number) => {
    const insertAt =
      at === undefined ? manifest.blocks.length : Math.max(0, Math.min(at, manifest.blocks.length))
    const next = [...manifest.blocks]
    next.splice(insertAt, 0, ...blocks)
    onChange({ ...manifest, blocks: next })
    if (blocks[0]) setSelectedId(blocks[blocks.length - 1]!.id)
    if (insertAt >= manifest.blocks.length) scrollToEnd()
    if (toastMsg) showToast(toastMsg)
  }

  const addText = (variant: TextVariant) => {
    addBlocks([
      {
        id: uid(),
        type: 'text',
        variant,
        content: variant === 'heading' ? 'Heading' : 'Body text',
        align: 'left',
      },
    ])
  }

  const addLink = () => {
    addBlocks([{ id: uid(), type: 'link', label: 'Prototype', url: 'https://' }])
  }

  const addSpacer = () => {
    addBlocks([{ id: uid(), type: 'spacer', height: 64 }])
  }

  const addMarker = () => {
    addBlocks([{ id: uid(), type: 'marker', label: 'Section' }])
  }

  const removeBlock = useCallback(
    (id: string) => {
      onChange({
        ...manifest,
        blocks: manifest.blocks.filter((b) => b.id !== id),
      })
      if (selectedId === id) setSelectedId(null)
      if (inspectorId === id) setInspectorId(null)
      setCtxMenu(null)
    },
    [manifest, onChange, selectedId, inspectorId],
  )

  const removeSelected = useCallback(() => {
    if (!selectedId) return
    removeBlock(selectedId)
  }, [selectedId, removeBlock])

  const moveBlock = (id: string, dir: -1 | 1) => {
    const i = manifest.blocks.findIndex((b) => b.id === id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= manifest.blocks.length) return
    const blocks = [...manifest.blocks]
    const [item] = blocks.splice(i, 1)
    blocks.splice(j, 0, item!)
    onChange({ ...manifest, blocks })
    setCtxMenu(null)
  }

  const moveSelected = (dir: -1 | 1) => {
    if (!selectedId) return
    moveBlock(selectedId, dir)
  }

  const reorder = (from: number, to: number) => {
    const blocks = [...manifest.blocks]
    const [item] = blocks.splice(from, 1)
    blocks.splice(to, 0, item!)
    onChange({ ...manifest, blocks })
  }

  const duplicateBlock = (id: string) => {
    const i = manifest.blocks.findIndex((b) => b.id === id)
    const block = manifest.blocks[i]
    if (!block) return
    const copy = { ...block, id: uid() } as Block
    const blocks = [...manifest.blocks]
    blocks.splice(i + 1, 0, copy)
    onChange({ ...manifest, blocks })
    setSelectedId(copy.id)
    setCtxMenu(null)
  }

  const rotateBlock = (id: string) => {
    const block = manifest.blocks.find((b) => b.id === id)
    if (!block || block.type !== 'image') return
    const next = ((block.rotate ?? 0) + 90) % 360
    updateBlock(id, { rotate: next })
    setCtxMenu(null)
  }

  const openInspector = (blockId: string) => {
    setSelectedId(blockId)
    setInspectorId(blockId)
    setCtxMenu(null)
  }

  const openCtx = (blockId: string, x: number, y: number) => {
    setSelectedId(blockId)
    const block = manifest.blocks.find((b) => b.id === blockId)
    // Frames / media: open the right inspector directly (Figma-like)
    if (block?.type === 'image') {
      setInspectorId(blockId)
      setCtxMenu(null)
      return
    }
    setCtxMenu({ blockId, x, y })
  }

  const ctxBlock = ctxMenu
    ? manifest.blocks.find((b) => b.id === ctxMenu.blockId)
    : null
  const ctxIndex = ctxMenu
    ? manifest.blocks.findIndex((b) => b.id === ctxMenu.blockId)
    : -1
  const inspectBlock = inspectorId
    ? manifest.blocks.find((b) => b.id === inspectorId) ?? null
    : null
  const inspectIndex = inspectorId
    ? manifest.blocks.findIndex((b) => b.id === inspectorId)
    : -1

  const handleImport = async () => {
    setImporting({ label: 'Adding media…', count: 1 })
    scrollToEnd()
    try {
      const items = await onImportMedia()
      if (items.length) {
        setImporting({
          label: importLabelForNames(items.map((i) => i.name || i.src)),
          count: items.length,
        })
        addBlocks(
          mediaToBlocks(items, videosAsGif),
          `Added ${items.length} ${items.length === 1 ? 'file' : 'files'} (sorted by name)`,
        )
      }
    } finally {
      setImporting(null)
    }
  }

  const ingestFiles = async (fileList: FileList | File[], at?: number) => {
    const files = naturalSortByName(
      Array.from(fileList).filter(isMediaFile),
      (f) => f.name,
    )
    if (!files.length) return
    // Nested drop targets (board + canvas) can both fire for one gesture.
    if (ingestBusy.current) return
    ingestBusy.current = true

    const insertAt = at ?? manifest.blocks.length
    const heavy = files.some((f) => {
      const e = extOf(f.name)
      return e === '.gif' || VIDEO_EXTS.includes(e)
    })
    // Spinner where blocks land — always for video/GIF, also for bigger batches
    if (heavy || files.length > 1) {
      setImporting({
        label: importLabelForNames(files.map((f) => f.name)),
        count: files.length,
      })
      if (insertAt >= manifest.blocks.length) scrollToEnd()
    }

    try {
      const payloads = await Promise.all(
        files.map(async (f) => ({
          name: f.name,
          buffer: await f.arrayBuffer(),
          ext: extOf(f.name),
        })),
      )
      const items = await onImportDropped(payloads)
      if (items.length) {
        addBlocks(
          mediaToBlocks(items, videosAsGif),
          `Added ${items.length} ${items.length === 1 ? 'file' : 'files'} (sorted by name)`,
          insertAt,
        )
      }
    } finally {
      setImporting(null)
      ingestBusy.current = false
    }
  }

  const pickBackdropImage = async () => {
    const items = await onImportMedia()
    const first = items[0]
    if (!first) return
    updateBackdrop({
      kind: 'image',
      imageSrc: first.src,
      imageMode: manifest.backdrop?.imageMode ?? 'cover',
    })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      const typing =
        tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement)?.isContentEditable
      if (e.key === 'Escape') {
        setSelectedId(null)
        return
      }
      if (typing) return
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault()
        removeSelected()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedId, removeSelected])

  return (
    <div className="editor-fill">
      {toast && <div className="toast">{toast}</div>}

      <div className="editor-body">
        <aside className="editor-side hide-scrollbar">
          <section className="side-section">
            <h3>Add</h3>
            <div className="side-grid">
              <button type="button" className="btn btn-block" onClick={() => void handleImport()}>
                Media
              </button>
              <button type="button" className="btn btn-block" onClick={() => addText('heading')}>
                Heading
              </button>
              <button type="button" className="btn btn-block" onClick={() => addText('body')}>
                Text
              </button>
              <button type="button" className="btn btn-block" onClick={addLink}>
                Link
              </button>
              <button type="button" className="btn btn-block" onClick={addSpacer}>
                Spacer
              </button>
              <button type="button" className="btn btn-block" onClick={addMarker}>
                Snap
              </button>
            </div>
          </section>

          <section className="side-section">
            <h3>Board</h3>
            <p className="side-label">Presets</p>
            <div className="preset-grid">
              {BACKDROP_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="preset-chip"
                  title={p.label}
                  onClick={() => onChange(applyPreset(manifest, p))}
                >
                  <span
                    className={`preset-swatch ${p.backdrop.kind === 'pattern' ? patternClassName(p.backdrop.pattern) : ''}`}
                    style={{ backgroundColor: p.background }}
                  />
                  <span className="preset-name">{p.label}</span>
                </button>
              ))}
            </div>
            <label className="field">
              <span>Background color</span>
              <input
                type="color"
                value={manifest.background}
                onChange={(e) => {
                  update({
                    background: e.target.value,
                    backdrop: {
                      ...(manifest.backdrop ?? { kind: 'solid' }),
                      kind: manifest.backdrop?.kind === 'image' ? 'image' : 'solid',
                    },
                  })
                }}
              />
            </label>
            <label className="field">
              <span>Pattern</span>
              <select
                value={
                  manifest.backdrop?.kind === 'pattern'
                    ? manifest.backdrop.pattern ?? 'dots'
                    : 'none'
                }
                onChange={(e) => {
                  const v = e.target.value
                  if (v === 'none') {
                    updateBackdrop({ kind: 'solid', pattern: undefined })
                  } else {
                    updateBackdrop({
                      kind: 'pattern',
                      pattern: v as BoardBackdrop['pattern'],
                    })
                  }
                }}
              >
                <option value="none">None (solid)</option>
                <option value="dots">Dots</option>
                <option value="grid">Grid</option>
                <option value="fineGrid">Fine grid</option>
                <option value="noise">Noise</option>
              </select>
            </label>
            <div className="side-row">
              <button type="button" className="btn btn-ghost" onClick={() => void pickBackdropImage()}>
                Custom image
              </button>
              {manifest.backdrop?.kind === 'image' && (
                <select
                  value={manifest.backdrop.imageMode ?? 'cover'}
                  onChange={(e) =>
                    updateBackdrop({
                      imageMode: e.target.value as 'tile' | 'cover',
                    })
                  }
                >
                  <option value="cover">Cover</option>
                  <option value="tile">Tile</option>
                </select>
              )}
            </div>
            <label className="field">
              <span>Frame fill</span>
              <select
                value={manifest.frameFill ?? 'contained'}
                onChange={(e) =>
                  update({ frameFill: e.target.value as FrameFillMode })
                }
              >
                <option value="contained">Contained</option>
                <option value="bleed">Bleed</option>
                <option value="expand">Expand</option>
                <option value="ambient">Ambient</option>
              </select>
            </label>
            <span className="field-hint">
              {(manifest.frameFill ?? 'contained') === 'bleed'
                ? 'Frames flush to the screen edges.'
                : (manifest.frameFill ?? 'contained') === 'expand'
                  ? 'Edge pixels stretch into the gutters so cut-off lines continue.'
                  : (manifest.frameFill ?? 'contained') === 'ambient'
                    ? 'Soft glow from each frame’s colors (YouTube-style).'
                    : 'Padded column — board background shows in the gutters.'}
            </span>
            <label className="field">
              <span>Width ({manifest.width}px)</span>
              <input
                type="range"
                min={720}
                max={1600}
                step={20}
                value={manifest.width}
                disabled={(manifest.frameFill ?? 'contained') === 'bleed'}
                onChange={(e) => update({ width: Number(e.target.value) })}
              />
            </label>
            <label className="field">
              <span>Default gap ({manifest.gap}px)</span>
              <input
                type="range"
                min={0}
                max={120}
                step={4}
                value={manifest.gap}
                onChange={(e) => update({ gap: Number(e.target.value) })}
              />
            </label>
          </section>

          {selected && (
            <section className="side-section">
              <h3>Selected</h3>
              <div className="side-row">
                <button type="button" className="btn btn-ghost" onClick={() => moveSelected(-1)}>
                  Up
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => moveSelected(1)}>
                  Down
                </button>
                <button type="button" className="btn btn-danger" onClick={removeSelected}>
                  Delete
                </button>
              </div>

              {selected.type !== 'spacer' && selected.type !== 'marker' && (
                <label className="field">
                  <span>Gap after ({selected.gapAfter ?? manifest.gap}px)</span>
                  <input
                    type="range"
                    min={0}
                    max={160}
                    step={4}
                    value={selected.gapAfter ?? manifest.gap}
                    onChange={(e) =>
                      updateBlock(selected.id, { gapAfter: Number(e.target.value) })
                    }
                  />
                </label>
              )}

              {selected.type === 'text' && (
                <>
                  <label className="field">
                    <span>Content</span>
                    <textarea
                      rows={4}
                      value={selected.content}
                      onChange={(e) => updateBlock(selected.id, { content: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span>Variant</span>
                    <select
                      value={selected.variant}
                      onChange={(e) =>
                        updateBlock(selected.id, {
                          variant: e.target.value as TextVariant,
                        })
                      }
                    >
                      <option value="heading">Heading</option>
                      <option value="body">Body</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Size</span>
                    <select
                      value={
                        selected.size ??
                        (selected.variant === 'heading' ? 'lg' : 'md')
                      }
                      onChange={(e) =>
                        updateBlock(selected.id, {
                          size: e.target.value as BlockSize,
                        })
                      }
                    >
                      <option value="sm">S</option>
                      <option value="md">M</option>
                      <option value="lg">L</option>
                      <option value="xl">XL</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Align</span>
                    <select
                      value={selected.align}
                      onChange={(e) =>
                        updateBlock(selected.id, { align: e.target.value as TextAlign })
                      }
                    >
                      <option value="left">Left</option>
                      <option value="center">Center</option>
                      <option value="right">Right</option>
                    </select>
                  </label>
                </>
              )}

              {selected.type === 'link' && (
                <>
                  <label className="field">
                    <span>Label</span>
                    <input
                      type="text"
                      value={selected.label}
                      onChange={(e) => updateBlock(selected.id, { label: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span>URL</span>
                    <input
                      type="text"
                      inputMode="url"
                      placeholder="https://…"
                      value={selected.url}
                      onChange={(e) => updateBlock(selected.id, { url: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span>Size</span>
                    <select
                      value={selected.size ?? 'md'}
                      onChange={(e) =>
                        updateBlock(selected.id, {
                          size: e.target.value as BlockSize,
                        })
                      }
                    >
                      <option value="sm">S</option>
                      <option value="md">M</option>
                      <option value="lg">L</option>
                      <option value="xl">XL</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Align</span>
                    <select
                      value={selected.align ?? 'left'}
                      onChange={(e) =>
                        updateBlock(selected.id, {
                          align: e.target.value as TextAlign,
                        })
                      }
                    >
                      <option value="left">Left</option>
                      <option value="center">Center</option>
                      <option value="right">Right</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={!isOpenableUrl(selected.url)}
                    onClick={() => onOpenLink(selected.url)}
                  >
                    Open link
                  </button>
                </>
              )}

              {selected.type === 'spacer' && (
                <label className="field">
                  <span>Height ({selected.height}px)</span>
                  <input
                    type="range"
                    min={8}
                    max={320}
                    step={8}
                    value={selected.height}
                    onChange={(e) =>
                      updateBlock(selected.id, { height: Number(e.target.value) })
                    }
                  />
                </label>
              )}

              {selected.type === 'marker' && (
                <>
                  <label className="field">
                    <span>Label</span>
                    <input
                      type="text"
                      value={selected.label ?? ''}
                      placeholder="Section"
                      onChange={(e) => updateBlock(selected.id, { label: e.target.value })}
                    />
                  </label>
                  <p className="side-note">
                    Present arrows jump here. Invisible while presenting.
                  </p>
                </>
              )}

              {selected.type === 'image' && (
                <>
                  <p className="side-note">
                    {selected.name || (selected.kind === 'video' ? 'Video' : 'Image')}
                  </p>
                  <label className="field">
                    <span>Width</span>
                    <select
                      value={selected.width ?? 'full'}
                      onChange={(e) =>
                        updateBlock(selected.id, {
                          width: e.target.value as MediaWidth,
                        })
                      }
                    >
                      <option value="full">Full</option>
                      <option value="wide">¾</option>
                      <option value="half">½</option>
                      <option value="narrow">⅓</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Corners</span>
                    <select
                      value={selected.radius ?? 'none'}
                      onChange={(e) =>
                        updateBlock(selected.id, {
                          radius: e.target.value as MediaRadius,
                        })
                      }
                    >
                      <option value="none">None</option>
                      <option value="soft">Soft</option>
                      <option value="round">Round</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Fit</span>
                    <select
                      value={selected.fit ?? 'natural'}
                      onChange={(e) =>
                        updateBlock(selected.id, {
                          fit: e.target.value as MediaFit,
                        })
                      }
                    >
                      <option value="natural">Auto</option>
                      <option value="contain">Fit</option>
                      <option value="cover">Fill</option>
                    </select>
                  </label>
                  {selected.kind === 'video' && (
                    <label className="field field-check">
                      <span>Play like GIF</span>
                      <input
                        type="checkbox"
                        checked={selected.asGif ?? videosAsGif}
                        onChange={(e) =>
                          updateBlock(selected.id, { asGif: e.target.checked })
                        }
                      />
                      <span className="field-check-hint">
                        Muted, looping, no controls
                      </span>
                    </label>
                  )}
                  <div className="side-row">
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => {
                        const next = [
                          ...(selected.snapPoints ?? []),
                          { id: uid(), y: 0.5, label: 'Snap' },
                        ]
                        updateBlock(selected.id, { snapPoints: next })
                      }}
                    >
                      Add snap point
                    </button>
                  </div>
                  {(selected.snapPoints ?? []).length > 0 && (
                    <ul className="snap-point-list">
                      {(selected.snapPoints ?? []).map((sp, i) => (
                        <li key={sp.id} className="snap-point-row">
                          <input
                            type="text"
                            className="snap-point-label"
                            value={sp.label ?? ''}
                            placeholder={`Snap ${i + 1}`}
                            onChange={(e) => {
                              const snapPoints = (selected.snapPoints ?? []).map((s) =>
                                s.id === sp.id ? { ...s, label: e.target.value } : s,
                              )
                              updateBlock(selected.id, { snapPoints })
                            }}
                          />
                          <label className="snap-point-y">
                            <span>{Math.round(sp.y * 100)}%</span>
                            <input
                              type="range"
                              min={0}
                              max={100}
                              value={Math.round(sp.y * 100)}
                              onChange={(e) => {
                                const y = Number(e.target.value) / 100
                                const snapPoints = (selected.snapPoints ?? []).map((s) =>
                                  s.id === sp.id ? { ...s, y } : s,
                                )
                                updateBlock(selected.id, { snapPoints })
                              }}
                            />
                          </label>
                          <button
                            type="button"
                            className="btn btn-ghost snap-point-remove"
                            title="Remove snap point"
                            onClick={() => {
                              const snapPoints = (selected.snapPoints ?? []).filter(
                                (s) => s.id !== sp.id,
                              )
                              updateBlock(selected.id, { snapPoints })
                            }}
                          >
                            ×
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="side-note">
                    Drag cues on the image, or use the slider. Present snaps to these; if none
                    exist on the board, arrows use 85% page scroll.
                  </p>
                </>
              )}
            </section>
          )}

          <section className="side-section side-blocks">
            <h3>Blocks ({manifest.blocks.length})</h3>
            <p className="side-label">Drag handle to reorder</p>
            <ul className="block-list">
              {manifest.blocks.map((b, i) => (
                <li
                  key={b.id}
                  className={selectedId === b.id ? 'active' : ''}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    openCtx(b.id, e.clientX, e.clientY)
                  }}
                  onDragOver={(e) => {
                    if (isFileDrag(e)) return
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'move'
                  }}
                  onDrop={(e) => {
                    if (isFileDrag(e)) return
                    e.preventDefault()
                    const from = readBlockDragIndex(e)
                    endBlockDrag()
                    if (from !== null && from !== i) reorder(from, i)
                  }}
                >
                  <span
                    className="block-list-handle"
                    draggable
                    title="Drag to reorder"
                    onDragStart={(e) => {
                      e.stopPropagation()
                      beginBlockDrag(i, e)
                    }}
                    onDragEnd={() => endBlockDrag()}
                  >
                    ⋮⋮
                  </span>
                  <button
                    type="button"
                    className="block-list-btn"
                    title={blockLabel(b)}
                    onClick={() => setSelectedId(b.id)}
                  >
                    <span className="block-list-i">{i + 1}</span>
                    <span className="block-list-name">{blockLabel(b)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </aside>

        <CanvasViewport
          ref={canvasRef}
          dragOver={dragOver && manifest.blocks.length === 0}
          onDragEnter={(e) => {
            if (!isFileDrag(e)) return
            e.preventDefault()
            dropDepth.current += 1
            setDragOver(true)
          }}
          onDragLeave={(e) => {
            if (!isFileDrag(e)) return
            e.preventDefault()
            dropDepth.current -= 1
            if (dropDepth.current <= 0) {
              dropDepth.current = 0
              setDragOver(false)
            }
          }}
          onDragOver={(e) => {
            if (!isFileDrag(e)) return
            e.preventDefault()
            e.dataTransfer.dropEffect = 'copy'
          }}
          onDrop={(e) => {
            dropDepth.current = 0
            setDragOver(false)
            // Board handles drops on the stage (with insert index). Only ingest
            // here when the drop landed on empty canvas chrome around the board.
            if (!isFileDrag(e) || !e.dataTransfer.files?.length) return
            if (e.defaultPrevented) return
            e.preventDefault()
            void ingestFiles(e.dataTransfer.files)
          }}
        >
          <Board
            manifest={manifest}
            assetUrl={assetUrl}
            selectedId={selectedId}
            editable
            importing={importing}
            onSelect={(id) => {
              setSelectedId(id)
              if (!id) {
                setCtxMenu(null)
                setInspectorId(null)
              }
            }}
            onReorder={reorder}
            onDropFiles={(files, at) => void ingestFiles(files, at)}
            onContextMenu={openCtx}
            onUpdateBlock={updateBlock}
          />
        </CanvasViewport>

        {inspectBlock && (
          <FrameInspector
            block={inspectBlock}
            index={inspectIndex}
            total={manifest.blocks.length}
            onClose={() => setInspectorId(null)}
            onChange={(patch) => updateBlock(inspectBlock.id, patch)}
            onDelete={() => {
              removeBlock(inspectBlock.id)
              setInspectorId(null)
            }}
            onDuplicate={() => duplicateBlock(inspectBlock.id)}
            onMoveUp={() => moveBlock(inspectBlock.id, -1)}
            onMoveDown={() => moveBlock(inspectBlock.id, 1)}
            onRotate={
              inspectBlock.type === 'image'
                ? () => rotateBlock(inspectBlock.id)
                : undefined
            }
          />
        )}
      </div>

      {ctxMenu && ctxBlock && (
        <BlockContextMenu
          menu={ctxMenu}
          block={ctxBlock}
          canMoveUp={ctxIndex > 0}
          canMoveDown={ctxIndex >= 0 && ctxIndex < manifest.blocks.length - 1}
          onClose={() => setCtxMenu(null)}
          onEdit={() => openInspector(ctxBlock.id)}
          onDelete={() => removeBlock(ctxBlock.id)}
          onMoveUp={() => moveBlock(ctxBlock.id, -1)}
          onMoveDown={() => moveBlock(ctxBlock.id, 1)}
          onDuplicate={() => duplicateBlock(ctxBlock.id)}
          onRotate={
            ctxBlock.type === 'image' ? () => rotateBlock(ctxBlock.id) : undefined
          }
        />
      )}
    </div>
  )
}

function patternClassName(pattern?: string): string {
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
