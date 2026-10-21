import { useEffect, useRef } from 'react'
import type { Block } from '../types'

export type ContextMenuState = {
  x: number
  y: number
  blockId: string
}

type Props = {
  menu: ContextMenuState
  block: Block
  canMoveUp: boolean
  canMoveDown: boolean
  onClose: () => void
  onEdit?: () => void
  onDelete: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onDuplicate: () => void
  onRotate?: () => void
}

export function BlockContextMenu({
  menu,
  block,
  canMoveUp,
  canMoveDown,
  onClose,
  onEdit,
  onDelete,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onRotate,
}: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    // defer so the opening contextmenu event doesn't instantly close
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

  // Keep menu on-screen
  const pad = 8
  const w = 180
  const h = block.type === 'image' ? 220 : 180
  const left = Math.min(menu.x, window.innerWidth - w - pad)
  const top = Math.min(menu.y, window.innerHeight - h - pad)

  return (
    <div
      ref={ref}
      className="ctx-menu"
      style={{ left, top }}
      role="menu"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {onEdit && (
        <>
          <button
            type="button"
            role="menuitem"
            className="ctx-item"
            onClick={() => {
              onEdit()
              onClose()
            }}
          >
            Edit…
          </button>
          <div className="ctx-sep" />
        </>
      )}
      <button type="button" role="menuitem" className="ctx-item" onClick={onMoveUp} disabled={!canMoveUp}>
        Move up
      </button>
      <button
        type="button"
        role="menuitem"
        className="ctx-item"
        onClick={onMoveDown}
        disabled={!canMoveDown}
      >
        Move down
      </button>
      <button type="button" role="menuitem" className="ctx-item" onClick={onDuplicate}>
        Duplicate
      </button>
      {block.type === 'image' && onRotate && (
        <button type="button" role="menuitem" className="ctx-item" onClick={onRotate}>
          Rotate 90°
        </button>
      )}
      <div className="ctx-sep" />
      <button type="button" role="menuitem" className="ctx-item danger" onClick={onDelete}>
        Delete
      </button>
    </div>
  )
}
