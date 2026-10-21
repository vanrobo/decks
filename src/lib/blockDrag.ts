/** Shared drag state — Electron often blanks custom dataTransfer MIME types on drop */

let draggingIndex: number | null = null

type DragLike = {
  dataTransfer: DataTransfer
}

export function beginBlockDrag(index: number, e: DragLike) {
  draggingIndex = index
  e.dataTransfer.effectAllowed = 'move'
  // text/plain is the only type Chromium reliably exposes on drop
  e.dataTransfer.setData('text/plain', `decks-block:${index}`)
  try {
    e.dataTransfer.setData('application/x-decks-block', String(index))
  } catch {
    /* ignore */
  }
}

export function readBlockDragIndex(e: DragLike): number | null {
  if (draggingIndex !== null) return draggingIndex
  const raw =
    e.dataTransfer.getData('application/x-decks-block') ||
    e.dataTransfer.getData('text/plain')
  if (!raw) return null
  const m = /^decks-block:(\d+)$/.exec(raw)
  if (m) return Number(m[1])
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

export function endBlockDrag() {
  draggingIndex = null
}

export function isFileDrag(e: DragLike): boolean {
  return Array.from(e.dataTransfer.types || []).includes('Files')
}
