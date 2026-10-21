import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import type { ProjectPeek, RecentEntry } from '../types'
import { usePrefs } from '../lib/prefs'
import { CoreMark } from './CoreMark'

type Props = {
  onNew: () => void
  onOpen: () => void
  onOpenRecent: (path: string) => void
  onBoardRenamed?: (path: string, title: string) => void
  onBoardDeleted?: (path: string) => void
}

type HomeView = 'home' | 'library'

type BoardMenu = {
  x: number
  y: number
  entry: RecentEntry
  fromRecent: boolean
}

type DeleteConfirm = {
  entries: RecentEntry[]
}

function ConfirmDialog({
  title,
  body,
  confirmLabel = 'Delete',
  onConfirm,
  onCancel,
}: {
  title: string
  body: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
}) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    cancelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div className="confirm-overlay" role="presentation" onMouseDown={onCancel}>
      <div
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-body"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-title" className="confirm-title">
          {title}
        </h2>
        <p id="confirm-body" className="confirm-body">
          {body}
        </p>
        <div className="confirm-actions">
          <button ref={cancelRef} type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn btn-danger" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

function BoardContextMenu({
  menu,
  deleteCount,
  onClose,
  onRename,
  onRemoveRecent,
  onDelete,
}: {
  menu: BoardMenu
  deleteCount: number
  onClose: () => void
  onRename: () => void
  onRemoveRecent: () => void
  onDelete: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const t = window.setTimeout(() => {
      document.addEventListener('mousedown', onDoc)
      document.addEventListener('contextmenu', onDoc)
    }, 0)
    window.addEventListener('keydown', onKey)
    return () => {
      window.clearTimeout(t)
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('contextmenu', onDoc)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const pad = 8
  const w = 200
  const h = menu.fromRecent ? 140 : 100
  const left = Math.min(menu.x, window.innerWidth - w - pad)
  const top = Math.min(menu.y, window.innerHeight - h - pad)
  const multi = deleteCount > 1

  return (
    <div
      ref={ref}
      className="ctx-menu"
      style={{ left, top }}
      role="menu"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {!multi && (
        <button type="button" role="menuitem" className="ctx-item" onClick={onRename}>
          Rename
        </button>
      )}
      {menu.fromRecent && !multi && (
        <button type="button" role="menuitem" className="ctx-item" onClick={onRemoveRecent}>
          Remove from Recent
        </button>
      )}
      {!multi && <div className="ctx-sep" />}
      <button type="button" role="menuitem" className="ctx-item danger" onClick={onDelete}>
        {multi ? `Delete ${deleteCount} boards` : 'Delete'}
      </button>
    </div>
  )
}

function BoardRow({
  entry,
  fromRecent,
  renaming,
  renameValue,
  selected,
  onOpen,
  onSelectClick,
  onContextMenu,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
}: {
  entry: RecentEntry
  fromRecent: boolean
  renaming: boolean
  renameValue: string
  selected: boolean
  onOpen: () => void
  onSelectClick: (e: ReactMouseEvent) => void
  onContextMenu: (e: ReactMouseEvent) => void
  onRenameChange: (value: string) => void
  onRenameCommit: () => void
  onRenameCancel: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!renaming) return
    const el = inputRef.current
    if (!el) return
    el.focus()
    el.select()
  }, [renaming])

  return (
    <li>
      {renaming ? (
        <form
          className="home-board-rename"
          onSubmit={(e) => {
            e.preventDefault()
            onRenameCommit()
          }}
        >
          <input
            ref={inputRef}
            className="home-board-rename-input"
            value={renameValue}
            onChange={(e) => onRenameChange(e.target.value)}
            onBlur={() => onRenameCommit()}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                onRenameCancel()
              }
            }}
            aria-label="Board name"
          />
        </form>
      ) : (
        <button
          type="button"
          className={selected ? 'selected' : undefined}
          aria-selected={selected}
          onClick={(e) => {
            if (e.shiftKey) {
              e.preventDefault()
              onSelectClick(e)
              return
            }
            onOpen()
          }}
          onContextMenu={onContextMenu}
        >
          <span className="recent-title">{entry.title}</span>
          <span className="recent-meta">
            {fromRecent ? (entry.kind === 'core' ? '.core' : 'project') : 'board'}
          </span>
        </button>
      )}
    </li>
  )
}

function PeekMedia({
  peek,
  loading,
  markSize = 32,
}: {
  peek: ProjectPeek | null
  loading?: boolean
  markSize?: number
}) {
  const rot = peek?.rotate ? `rotate(${peek.rotate}deg)` : undefined

  if (loading && !peek) {
    return <p className="library-preview-empty">Loading…</p>
  }

  if (peek?.previewUrl) {
    return peek.previewKind === 'video' ? (
      <video
        key={peek.previewUrl}
        className="library-preview-media"
        src={peek.previewUrl}
        muted
        playsInline
        autoPlay
        loop
        style={rot ? { transform: rot } : undefined}
      />
    ) : (
      <img
        key={peek.previewUrl}
        className="library-preview-media"
        src={peek.previewUrl}
        alt=""
        style={rot ? { transform: rot } : undefined}
      />
    )
  }

  return (
    <div className="library-preview-fallback">
      <CoreMark size={markSize} />
      <p>{peek?.title || 'No preview'}</p>
      {peek && (
        <span className="library-preview-meta">
          {peek.blockCount === 0
            ? 'Empty board'
            : `${peek.blockCount} block${peek.blockCount === 1 ? '' : 's'}`}
        </span>
      )}
    </div>
  )
}

function BoardGridCard({
  entry,
  peek,
  loading,
  renaming,
  renameValue,
  selected,
  onOpen,
  onSelectClick,
  onContextMenu,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
}: {
  entry: RecentEntry
  peek: ProjectPeek | null
  loading: boolean
  renaming: boolean
  renameValue: string
  selected: boolean
  onOpen: () => void
  onSelectClick: (e: ReactMouseEvent) => void
  onContextMenu: (e: ReactMouseEvent) => void
  onRenameChange: (value: string) => void
  onRenameCommit: () => void
  onRenameCancel: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!renaming) return
    const el = inputRef.current
    if (!el) return
    el.focus()
    el.select()
  }, [renaming])

  return (
    <li>
      {renaming ? (
        <form
          className="library-grid-card library-grid-rename"
          onSubmit={(e) => {
            e.preventDefault()
            onRenameCommit()
          }}
        >
          <div
            className="library-grid-preview"
            style={{ background: peek?.background || 'var(--panel)' }}
          >
            <PeekMedia peek={peek} loading={loading} markSize={28} />
          </div>
          <input
            ref={inputRef}
            className="home-board-rename-input"
            value={renameValue}
            onChange={(e) => onRenameChange(e.target.value)}
            onBlur={() => onRenameCommit()}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                onRenameCancel()
              }
            }}
            aria-label="Board name"
          />
        </form>
      ) : (
        <button
          type="button"
          className={`library-grid-card${selected ? ' selected' : ''}`}
          aria-selected={selected}
          onClick={(e) => {
            if (e.shiftKey) {
              e.preventDefault()
              onSelectClick(e)
              return
            }
            onOpen()
          }}
          onContextMenu={onContextMenu}
        >
          <div
            className="library-grid-preview"
            style={{ background: peek?.background || 'var(--panel)' }}
          >
            <PeekMedia peek={peek} loading={loading} markSize={28} />
          </div>
          <div className="library-grid-meta">
            <span className="recent-title">{entry.title}</span>
            <span className="recent-meta">board</span>
          </div>
        </button>
      )}
    </li>
  )
}

function rangePaths(items: RecentEntry[], fromPath: string, toPath: string): string[] {
  const a = items.findIndex((e) => e.path === fromPath)
  const b = items.findIndex((e) => e.path === toPath)
  if (a < 0 || b < 0) return [toPath]
  const lo = Math.min(a, b)
  const hi = Math.max(a, b)
  return items.slice(lo, hi + 1).map((e) => e.path)
}

export function Home({
  onNew,
  onOpen,
  onOpenRecent,
  onBoardRenamed,
  onBoardDeleted,
}: Props) {
  const { libraryLayout, setLibraryLayout } = usePrefs()
  const [view, setView] = useState<HomeView>('home')
  const [recents, setRecents] = useState<RecentEntry[]>([])
  const [boards, setBoards] = useState<RecentEntry[]>([])
  const [menu, setMenu] = useState<BoardMenu | null>(null)
  const [renamingPath, setRenamingPath] = useState<string | null>(null)
  const [renamingFromRecent, setRenamingFromRecent] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [anchor, setAnchor] = useState<{ path: string; fromRecent: boolean } | null>(
    null,
  )
  const [confirm, setConfirm] = useState<DeleteConfirm | null>(null)
  const [peekCache, setPeekCache] = useState<Map<string, ProjectPeek | null>>(() => new Map())
  const [peekLoadingPaths, setPeekLoadingPaths] = useState<Set<string>>(() => new Set())
  const peekCacheRef = useRef(peekCache)
  const peekGen = useRef(0)
  peekCacheRef.current = peekCache

  const refresh = useCallback(async () => {
    if (!window.core) {
      setRecents([])
      setBoards([])
      return
    }
    try {
      const [r, b] = await Promise.all([
        window.core.listRecents(),
        window.core.listProjects?.() ?? Promise.resolve([]),
      ])
      setRecents(r)
      setBoards(b)
    } catch {
      setRecents([])
      setBoards([])
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (view !== 'library' || libraryLayout !== 'grid' || !window.core?.peekProject) {
      return
    }
    const gen = ++peekGen.current
    const missing = boards.filter((b) => !peekCacheRef.current.has(b.path))
    if (missing.length === 0) return

    let cancelled = false
    const concurrency = 3
    let i = 0

    setPeekLoadingPaths((prev) => {
      const next = new Set(prev)
      for (const b of missing) next.add(b.path)
      return next
    })

    const run = async () => {
      const workers = Array.from({ length: Math.min(concurrency, missing.length) }, async () => {
        while (!cancelled && peekGen.current === gen) {
          const idx = i++
          if (idx >= missing.length) return
          const board = missing[idx]!
          try {
            const result = await window.core!.peekProject(board.path)
            if (cancelled || peekGen.current !== gen) return
            setPeekCache((prev) => {
              if (prev.has(board.path)) return prev
              const next = new Map(prev)
              next.set(board.path, result)
              return next
            })
          } catch {
            if (cancelled || peekGen.current !== gen) return
            setPeekCache((prev) => {
              if (prev.has(board.path)) return prev
              const next = new Map(prev)
              next.set(board.path, null)
              return next
            })
          } finally {
            setPeekLoadingPaths((prev) => {
              if (!prev.has(board.path)) return prev
              const next = new Set(prev)
              next.delete(board.path)
              return next
            })
          }
        }
      })
      await Promise.all(workers)
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [view, libraryLayout, boards])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selected.size > 0 && !confirm && !menu) {
        setSelected(new Set())
        setAnchor(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected.size, confirm, menu])

  const openMenu = (e: ReactMouseEvent, entry: RecentEntry, fromRecent: boolean) => {
    e.preventDefault()
    e.stopPropagation()
    if (!selected.has(entry.path)) {
      setSelected(new Set([entry.path]))
      setAnchor({ path: entry.path, fromRecent })
    }
    setMenu({ x: e.clientX, y: e.clientY, entry, fromRecent })
  }

  const selectClick = (entry: RecentEntry, fromRecent: boolean) => {
    const list = fromRecent ? recents : boards
    setSelected((prev) => {
      if (anchor && anchor.fromRecent === fromRecent && prev.size > 0) {
        return new Set(rangePaths(list, anchor.path, entry.path))
      }
      const next = new Set(prev)
      if (next.has(entry.path)) next.delete(entry.path)
      else next.add(entry.path)
      return next
    })
    setAnchor({ path: entry.path, fromRecent })
    setMenu(null)
  }

  const clearSelection = () => {
    setSelected(new Set())
    setAnchor(null)
  }

  const startRename = (entry: RecentEntry, fromRecent: boolean) => {
    setMenu(null)
    setRenamingPath(entry.path)
    setRenamingFromRecent(fromRecent)
    setRenameValue(entry.title)
  }

  const commitRename = async () => {
    if (!renamingPath || !window.core?.renameProject) {
      setRenamingPath(null)
      return
    }
    const next = renameValue.trim() || 'Untitled'
    const prev =
      recents.find((r) => r.path === renamingPath) ||
      boards.find((b) => b.path === renamingPath)
    if (prev && prev.title === next) {
      setRenamingPath(null)
      return
    }
    try {
      const updated = await window.core.renameProject(renamingPath, next)
      onBoardRenamed?.(renamingPath, updated.title)
      setPeekCache((prev) => {
        const existing = prev.get(renamingPath)
        if (!existing) return prev
        const nextMap = new Map(prev)
        nextMap.set(renamingPath, { ...existing, title: updated.title })
        return nextMap
      })
      setRenamingPath(null)
      await refresh()
    } catch {
      setRenamingPath(null)
    }
  }

  const cancelRename = () => {
    setRenamingPath(null)
    setRenameValue('')
  }

  const removeFromRecent = async (entry: RecentEntry) => {
    setMenu(null)
    if (!window.core?.removeRecent) return
    try {
      await window.core.removeRecent(entry.path)
      await refresh()
    } catch {
      /* ignore */
    }
  }

  const entriesForPaths = (paths: string[]): RecentEntry[] => {
    const byPath = new Map<string, RecentEntry>()
    for (const e of [...boards, ...recents]) {
      if (paths.includes(e.path)) byPath.set(e.path, e)
    }
    return paths.map((p) => byPath.get(p)).filter(Boolean) as RecentEntry[]
  }

  const requestDelete = (entries: RecentEntry[]) => {
    setMenu(null)
    if (!entries.length) return
    setConfirm({ entries })
  }

  const confirmDelete = async () => {
    if (!confirm || !window.core?.deleteProject) {
      setConfirm(null)
      return
    }
    const entries = confirm.entries
    setConfirm(null)
    try {
      for (const entry of entries) {
        await window.core.deleteProject(entry.path)
        onBoardDeleted?.(entry.path)
      }
      setPeekCache((prev) => {
        const nextMap = new Map(prev)
        for (const entry of entries) nextMap.delete(entry.path)
        return nextMap
      })
      clearSelection()
      await refresh()
    } catch {
      await refresh()
    }
  }

  const deleteLabel =
    confirm && confirm.entries.length === 1
      ? `Delete “${confirm.entries[0]!.title}”?`
      : confirm
        ? `Delete ${confirm.entries.length} boards?`
        : ''

  const deleteBody =
    confirm && confirm.entries.length === 1
      ? 'This permanently removes the board and cannot be undone.'
      : 'This permanently removes these boards and cannot be undone.'

  const openLibrary = () => {
    clearSelection()
    setMenu(null)
    setView('library')
  }

  const backHome = () => {
    clearSelection()
    setMenu(null)
    setView('home')
  }

  const renderList = (items: RecentEntry[], fromRecent: boolean) => (
    <ul>
      {items.map((entry) => (
        <BoardRow
          key={`${fromRecent ? 'r' : 'a'}-${entry.path}`}
          entry={entry}
          fromRecent={fromRecent}
          renaming={renamingPath === entry.path && renamingFromRecent === fromRecent}
          renameValue={renameValue}
          selected={selected.has(entry.path)}
          onOpen={() => {
            clearSelection()
            onOpenRecent(entry.path)
          }}
          onSelectClick={() => selectClick(entry, fromRecent)}
          onContextMenu={(e) => openMenu(e, entry, fromRecent)}
          onRenameChange={setRenameValue}
          onRenameCommit={() => void commitRename()}
          onRenameCancel={cancelRename}
        />
      ))}
    </ul>
  )

  const renderGrid = (items: RecentEntry[]) => (
    <ul className="library-grid">
      {items.map((entry) => (
        <BoardGridCard
          key={`g-${entry.path}`}
          entry={entry}
          peek={peekCache.get(entry.path) ?? null}
          loading={peekLoadingPaths.has(entry.path)}
          renaming={renamingPath === entry.path && !renamingFromRecent}
          renameValue={renameValue}
          selected={selected.has(entry.path)}
          onOpen={() => {
            clearSelection()
            onOpenRecent(entry.path)
          }}
          onSelectClick={() => selectClick(entry, false)}
          onContextMenu={(e) => openMenu(e, entry, false)}
          onRenameChange={setRenameValue}
          onRenameCommit={() => void commitRename()}
          onRenameCancel={cancelRename}
        />
      ))}
    </ul>
  )

  const menuDeleteEntries =
    menu && selected.has(menu.entry.path) && selected.size > 1
      ? entriesForPaths([...selected])
      : menu
        ? [menu.entry]
        : []

  return (
    <div className={`home-body${view === 'library' ? ' is-library' : ''}`}>
      {view === 'home' ? (
        <>
          <header className="home-hero">
            <div className="home-logo-row">
              <CoreMark size={64} title="COЯE" />
            </div>
            <h1 className="home-brand">Decks</h1>
            <p className="home-tag">Pitch boards for designathons & hackathons</p>
            <div className="home-actions">
              <button type="button" className="btn btn-primary" onClick={onNew}>
                New board
              </button>
              <button type="button" className="btn btn-ghost" onClick={onOpen}>
                Open .core
              </button>
              <button type="button" className="btn btn-ghost" onClick={openLibrary}>
                All boards
              </button>
            </div>
          </header>

          {recents.length > 0 && (
            <section className="home-recents">
              <div className="home-section-head">
                <h2>Recent</h2>
                <button type="button" className="home-section-link" onClick={openLibrary}>
                  View all
                </button>
              </div>
              {renderList(recents, true)}
            </section>
          )}

          {recents.length === 0 && boards.length > 0 && (
            <section className="home-recents">
              <p className="home-empty-hint">
                No recent boards.{' '}
                <button type="button" className="home-inline-link" onClick={openLibrary}>
                  Browse all boards
                </button>
              </p>
            </section>
          )}
        </>
      ) : (
        <div className={`library is-${libraryLayout}`}>
          <header className="library-top">
            <button type="button" className="btn btn-ghost library-back" onClick={backHome}>
              ← Home
            </button>
            <div className="library-heading">
              <h1>All boards</h1>
              <p>
                {boards.length === 0
                  ? 'None yet'
                  : `${boards.length} board${boards.length === 1 ? '' : 's'}`}
              </p>
            </div>
            <div className="library-top-actions">
              <div className="library-layout-toggle" role="group" aria-label="Library layout">
                <button
                  type="button"
                  className={`btn btn-ghost library-layout-btn${libraryLayout === 'list' ? ' is-active' : ''}`}
                  aria-pressed={libraryLayout === 'list'}
                  onClick={() => setLibraryLayout('list')}
                >
                  List
                </button>
                <button
                  type="button"
                  className={`btn btn-ghost library-layout-btn${libraryLayout === 'grid' ? ' is-active' : ''}`}
                  aria-pressed={libraryLayout === 'grid'}
                  onClick={() => setLibraryLayout('grid')}
                >
                  Grid
                </button>
              </div>
              <button type="button" className="btn btn-primary" onClick={onNew}>
                New board
              </button>
            </div>
          </header>

          <section className="library-list">
            {boards.length > 0 ? (
              libraryLayout === 'grid' ? renderGrid(boards) : renderList(boards, false)
            ) : (
              <p className="home-empty-hint">Create a board to fill your library.</p>
            )}
          </section>
        </div>
      )}

      {selected.size > 0 && (
        <div className="home-select-bar" role="status">
          <span>
            {selected.size} selected
            <span className="home-select-hint"> · Shift+click to add</span>
          </span>
          <div className="home-select-actions">
            <button type="button" className="btn btn-ghost" onClick={clearSelection}>
              Clear
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => requestDelete(entriesForPaths([...selected]))}
            >
              Delete
            </button>
          </div>
        </div>
      )}

      {menu && (
        <BoardContextMenu
          menu={menu}
          deleteCount={menuDeleteEntries.length}
          onClose={() => setMenu(null)}
          onRename={() => startRename(menu.entry, menu.fromRecent)}
          onRemoveRecent={() => void removeFromRecent(menu.entry)}
          onDelete={() => requestDelete(menuDeleteEntries)}
        />
      )}

      {confirm && (
        <ConfirmDialog
          title={deleteLabel}
          body={deleteBody}
          confirmLabel={confirm.entries.length > 1 ? `Delete ${confirm.entries.length}` : 'Delete'}
          onCancel={() => setConfirm(null)}
          onConfirm={() => void confirmDelete()}
        />
      )}
    </div>
  )
}
