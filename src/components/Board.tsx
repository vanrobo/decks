import { useRef, useState, type CSSProperties, type DragEvent, type MouseEvent } from 'react'
import type { Block, DeckManifest } from '../types'
import { patternClass } from '../lib/backdrops'
import {
  beginBlockDrag,
  endBlockDrag,
  isFileDrag,
  readBlockDragIndex,
} from '../lib/blockDrag'
import { BlockView } from './BlockView'
import { CoreMark } from './CoreMark'

export type BoardImporting = {
  label: string
  /** How many placeholder slots to show (capped) */
  count?: number
}

type Props = {
  manifest: DeckManifest
  assetUrl: (src: string) => string
  selectedId?: string | null
  editable?: boolean
  onSelect?: (id: string | null) => void
  onOpenLink?: (url: string) => void
  onReorder?: (from: number, to: number) => void
  /** Drop files at insert index (0 = before first, length = after last) */
  onDropFiles?: (files: FileList, at: number) => void
  onContextMenu?: (blockId: string, clientX: number, clientY: number) => void
  /** Placeholder at insert point while media is copying in */
  importing?: BoardImporting | null
  onUpdateBlock?: (id: string, patch: Partial<Block>) => void
}

/** Insert-before index from pointer Y relative to block midpoints */
function insertIndexFromY(column: HTMLElement, clientY: number): number {
  const wraps = column.querySelectorAll<HTMLElement>('[data-block-index]')
  for (let i = 0; i < wraps.length; i++) {
    const rect = wraps[i]!.getBoundingClientRect()
    if (clientY < rect.top + rect.height / 2) return i
  }
  return wraps.length
}

export function Board({
  manifest,
  assetUrl,
  selectedId,
  editable = false,
  onSelect,
  onOpenLink,
  onReorder,
  onDropFiles,
  onContextMenu,
  importing = null,
  onUpdateBlock,
}: Props) {
  const columnRef = useRef<HTMLDivElement>(null)
  const [dropAt, setDropAt] = useState<number | null>(null)
  const backdrop = manifest.backdrop ?? { kind: 'solid' as const }
  const pattern =
    backdrop.kind === 'pattern' ? patternClass(backdrop.pattern) : ''

  let imageStyle: CSSProperties | undefined
  if (backdrop.kind === 'image' && backdrop.imageSrc) {
    const url = assetUrl(backdrop.imageSrc)
    if (backdrop.imageMode === 'tile') {
      imageStyle = {
        backgroundImage: `url("${url}")`,
        backgroundRepeat: 'repeat',
        backgroundSize: 'auto',
      }
    } else {
      imageStyle = {
        backgroundImage: `url("${url}")`,
        backgroundRepeat: 'no-repeat',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }
    }
  }

  const clearDrop = () => setDropAt(null)

  const acceptDrag = (e: DragEvent) => {
    if (!editable) return false
    const files = isFileDrag(e)
    if (files && !onDropFiles) return false
    if (!files && !onReorder) return false
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = files ? 'copy' : 'move'
    return true
  }

  const updateDropAt = (e: DragEvent) => {
    const col = columnRef.current
    if (!col) return
    setDropAt(insertIndexFromY(col, e.clientY))
  }

  const onDragStart = (e: DragEvent, index: number) => {
    if (!editable) return
    e.stopPropagation()
    beginBlockDrag(index, e)
    const el = e.currentTarget as HTMLElement
    el.classList.add('is-dragging')
  }

  const onDragEnd = (e: DragEvent) => {
    ;(e.currentTarget as HTMLElement).classList.remove('is-dragging')
    endBlockDrag()
    clearDrop()
  }

  const onBoardDragOver = (e: DragEvent) => {
    if (!acceptDrag(e)) return
    updateDropAt(e)
  }

  const onBoardDragLeave = (e: DragEvent) => {
    if (!editable) return
    const related = e.relatedTarget as Node | null
    const current = e.currentTarget as HTMLElement
    if (related && current.contains(related)) return
    clearDrop()
  }

  const onBoardDrop = (e: DragEvent) => {
    if (!editable) return
    const col = columnRef.current
    const at = dropAt ?? (col ? insertIndexFromY(col, e.clientY) : manifest.blocks.length)
    const files = isFileDrag(e)
    if (files) {
      if (!onDropFiles || !e.dataTransfer.files?.length) return
      e.preventDefault()
      e.stopPropagation()
      clearDrop()
      onDropFiles(e.dataTransfer.files, at)
      return
    }
    if (!onReorder) return
    e.preventDefault()
    e.stopPropagation()
    const from = readBlockDragIndex(e)
    endBlockDrag()
    clearDrop()
    if (from === null || from === at || from === at - 1) return
    const insertAt = from < at ? at - 1 : at
    if (from !== insertAt) onReorder(from, insertAt)
  }

  const handleContext = (e: MouseEvent, blockId: string) => {
    if (!editable || !onContextMenu) return
    e.preventDefault()
    e.stopPropagation()
    onSelect?.(blockId)
    onContextMenu(blockId, e.clientX, e.clientY)
  }

  const showLine = editable && dropAt !== null
  const frameFill = manifest.frameFill ?? 'contained'
  const isBleed = frameFill === 'bleed'

  return (
    <div
      className={`board-stage frame-fill-${frameFill}${pattern ? ` ${pattern}` : ''}${dropAt !== null ? ' is-dropping' : ''}`}
      style={{
        backgroundColor: manifest.background,
        ['--board-width' as string]: `${manifest.width}px`,
        ...imageStyle,
      }}
      onClick={() => onSelect?.(null)}
      onContextMenu={(e) => {
        if (editable) e.preventDefault()
      }}
      onDragOver={editable ? onBoardDragOver : undefined}
      onDragLeave={editable ? onBoardDragLeave : undefined}
      onDrop={editable ? onBoardDrop : undefined}
    >
      <div
        className="board-column"
        ref={columnRef}
        style={
          isBleed
            ? { width: '100%', maxWidth: '100%' }
            : { width: manifest.width, maxWidth: '100%' }
        }
      >
        {manifest.blocks.length === 0 && editable && !importing && (
          <div className="board-empty">
            <p>Drop Figma exports here</p>
            <span>PNG, JPG, GIF, MP4 — width stays fixed, height grows</span>
            <span className="board-empty-tip">
              Name exports <code>1 …</code>, <code>2 …</code>, <code>9.5 …</code> for auto order
            </span>
          </div>
        )}
        {showLine && dropAt === 0 && (
          <div className="board-drop-line board-drop-line-edge" aria-hidden />
        )}
        {manifest.blocks.map((block: Block, index: number) => {
          const gap =
            block.type === 'spacer' || block.type === 'marker'
              ? 0
              : (block.gapAfter ?? manifest.gap)
          return (
            <div key={block.id} className="board-block-unit">
              <div
                data-block-index={index}
                className={`board-block-wrap${selectedId === block.id ? ' selected' : ''}${editable ? ' editable' : ''}${block.type === 'marker' ? ' is-marker' : ''}`}
                draggable={editable}
                onDragStart={(e) => onDragStart(e, index)}
                onDragEnd={onDragEnd}
                onClick={(e) => {
                  e.stopPropagation()
                  onSelect?.(block.id)
                }}
                onContextMenu={(e) => handleContext(e, block.id)}
              >
                <div className="block-drag-hint" aria-hidden title="Drag to reorder">
                  ⋮⋮
                </div>
                <BlockView
                  block={block}
                  assetUrl={assetUrl}
                  onOpenLink={onOpenLink}
                  openLinks={!editable}
                  playing={!editable}
                  editable={editable}
                  frameFill={frameFill}
                  onSnapPointsChange={
                    block.type === 'image' && onUpdateBlock
                      ? (snapPoints) => onUpdateBlock(block.id, { snapPoints })
                      : undefined
                  }
                />
              </div>
              {gap > 0 && (
                <div className="board-gap" style={{ height: gap }} aria-hidden>
                  {showLine && dropAt === index + 1 && (
                    <div className="board-drop-line" />
                  )}
                </div>
              )}
              {gap === 0 && showLine && dropAt === index + 1 && (
                <div className="board-drop-line board-drop-line-edge" aria-hidden />
              )}
            </div>
          )
        })}
        {importing &&
          Array.from({ length: Math.min(Math.max(importing.count ?? 1, 1), 4) }, (_, i) => (
            <div
              key={`importing-${i}`}
              className="board-block-wrap board-importing"
              style={{ marginBottom: manifest.gap }}
              aria-busy="true"
              aria-live="polite"
            >
              <div className="board-importing-inner">
                <CoreMark size={40} spin surface="onDark" />
                {i === 0 && (
                  <span className="board-importing-label">{importing.label}</span>
                )}
              </div>
            </div>
          ))}
      </div>
    </div>
  )
}
