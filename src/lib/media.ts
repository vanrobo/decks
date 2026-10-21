import type { MediaKind } from '../types'
import { IMAGE_EXTS, VIDEO_EXTS } from '../types'

export function extOf(name: string): string {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i).toLowerCase() : ''
}

export function kindFromExt(ext: string): MediaKind | null {
  const e = ext.toLowerCase()
  if (VIDEO_EXTS.includes(e)) return 'video'
  if (IMAGE_EXTS.includes(e)) return 'image'
  return null
}

export function isMediaFile(file: File): boolean {
  return kindFromExt(extOf(file.name)) !== null
}

export async function preloadImage(url: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve()
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`))
    img.src = url
  })
  try {
    const res = await fetch(url)
    const blob = await res.blob()
    const bmp = await createImageBitmap(blob)
    bmp.close()
  } catch {
    // decode best-effort
  }
}

export async function preloadVideo(url: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const video = document.createElement('video')
    video.preload = 'auto'
    video.muted = true
    video.playsInline = true
    const done = () => {
      cleanup()
      resolve()
    }
    const fail = () => {
      cleanup()
      reject(new Error(`Failed to load video: ${url}`))
    }
    const cleanup = () => {
      video.removeEventListener('canplaythrough', done)
      video.removeEventListener('error', fail)
      video.src = ''
      video.load()
    }
    video.addEventListener('canplaythrough', done, { once: true })
    video.addEventListener('error', fail, { once: true })
    video.src = url
    video.load()
  })
}

export async function preloadMedia(
  items: { url: string; kind: MediaKind }[],
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const total = items.length
  let done = 0
  onProgress?.(0, total)
  for (const item of items) {
    try {
      if (item.kind === 'video') await preloadVideo(item.url)
      else await preloadImage(item.url)
    } catch {
      // continue warming remaining assets
    }
    done += 1
    onProgress?.(done, total)
  }
}
