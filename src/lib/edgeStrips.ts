export type EdgeStripPair = {
  left: string
  right: string
}

const cache = new Map<string, EdgeStripPair>()

function columnCanvasToDataUrl(canvas: HTMLCanvasElement): string {
  try {
    return canvas.toDataURL('image/png')
  } catch {
    return ''
  }
}

/** Draw only the leftmost / rightmost source columns into 1×H canvases. */
function stripsFromSource(
  source: CanvasImageSource,
  width: number,
  height: number,
): EdgeStripPair | null {
  if (width < 1 || height < 1) return null

  const leftC = document.createElement('canvas')
  leftC.width = 1
  leftC.height = height
  const lctx = leftC.getContext('2d', { willReadFrequently: true })
  if (!lctx) return null

  const rightC = document.createElement('canvas')
  rightC.width = 1
  rightC.height = height
  const rctx = rightC.getContext('2d', { willReadFrequently: true })
  if (!rctx) return null

  try {
    lctx.drawImage(source, 0, 0, 1, height, 0, 0, 1, height)
    rctx.drawImage(source, width - 1, 0, 1, height, 0, 0, 1, height)
    const left = columnCanvasToDataUrl(leftC)
    const right = columnCanvasToDataUrl(rightC)
    if (!left || !right) return null
    return { left, right }
  } catch {
    return null
  }
}

/**
 * Sample leftmost/rightmost pixel columns.
 * Prefer fetch → ImageBitmap so `core-asset://` does not taint the canvas
 * (direct drawImage from a cross-scheme <img> throws on getImageData/toDataURL).
 */
export async function sampleEdgeStrips(url: string): Promise<EdgeStripPair | null> {
  const hit = cache.get(url)
  if (hit) return hit

  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`fetch ${res.status}`)
    const blob = await res.blob()
    const bitmap = await createImageBitmap(blob)
    try {
      const pair = stripsFromSource(bitmap, bitmap.width, bitmap.height)
      if (pair) {
        cache.set(url, pair)
        return pair
      }
    } finally {
      bitmap.close()
    }
  } catch {
    /* fall through */
  }

  // Fallback: already-decoded DOM image (may still taint on some schemes)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('img load failed'))
      el.src = url
    })
    const pair = stripsFromSource(img, img.naturalWidth, img.naturalHeight)
    if (pair) {
      cache.set(url, pair)
      return pair
    }
  } catch {
    /* ignore */
  }

  return null
}

/** Sample from a live HTMLImageElement that is already on screen. */
export function sampleEdgeStripsFromElement(
  img: HTMLImageElement,
): EdgeStripPair | null {
  const w = img.naturalWidth
  const h = img.naturalHeight
  if (w < 1 || h < 1) return null
  return stripsFromSource(img, w, h)
}

/** Sample edge columns from a video’s current frame (not cached). */
export function sampleEdgeStripsFromVideo(
  video: HTMLVideoElement,
): EdgeStripPair | null {
  const w = video.videoWidth
  const h = video.videoHeight
  if (w < 1 || h < 1) return null
  return stripsFromSource(video, w, h)
}

export function clearEdgeStripCache(url?: string) {
  if (url) cache.delete(url)
  else cache.clear()
}
