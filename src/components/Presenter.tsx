import { useEffect, useRef, useState } from 'react'
import type { DeckManifest } from '../types'
import { isOpenableUrl } from '../lib/backdrops'
import { usePrefs } from '../lib/prefs'
import { Board } from './Board'

type Props = {
  manifest: DeckManifest
  assetUrl: (src: string) => string
  onExit: () => void
  onOpenLink: (url: string) => void
}

/** Fixed step when the board has no snap markers / image snap points. */
const PAGE_FRAC = 0.85
/** Ctrl/Cmd + ↑↓: free scroll (no snaps), ~¼ viewport. */
const FINE_FRAC = 0.25
const SNAP_EPS = 12
/** Breathing room above the board while presenting (matches CSS --present-inset). */
const PRESENT_INSET = 96
const HINT_AUTO_MS = 2800
const MIN_ZOOM = 0.5
const MAX_ZOOM = 2
/** Ctrl/Cmd+wheel and trackpad pinch (Chromium sets ctrlKey on pinch). */
const ZOOM_INTENSITY = 0.01
const ZOOM_STEP = 1.08

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n))
}

type SnapStop = {
  top: number
}

function collectSnapStops(scroller: HTMLElement, inset: number): SnapStop[] {
  const sRect = scroller.getBoundingClientRect()
  const nodes = scroller.querySelectorAll<HTMLElement>('[data-present-snap]')
  const stops: SnapStop[] = []
  for (const node of nodes) {
    const rect = node.getBoundingClientRect()
    const top = scroller.scrollTop + (rect.top - sRect.top) - inset
    stops.push({ top: Math.max(0, top) })
  }
  stops.sort((a, b) => a.top - b.top)
  const unique: SnapStop[] = []
  for (const s of stops) {
    const last = unique[unique.length - 1]
    if (!last || Math.abs(last.top - s.top) > 4) {
      unique.push(s)
    }
  }
  return unique
}

export function Presenter({
  manifest,
  assetUrl,
  onExit,
  onOpenLink,
}: Props) {
  const scroller = useRef<HTMLDivElement>(null)
  const pad = useRef<HTMLDivElement>(null)
  const { presentHintMode, hidePresentCursor } = usePrefs()
  const [hintVisible, setHintVisible] = useState(presentHintMode !== 'off')

  useEffect(() => {
    if (presentHintMode === 'off') {
      setHintVisible(false)
      return
    }
    if (presentHintMode === 'always') {
      setHintVisible(true)
      return
    }
    setHintVisible(true)
    const t = window.setTimeout(() => setHintVisible(false), HINT_AUTO_MS)
    return () => window.clearTimeout(t)
  }, [presentHintMode])

  useEffect(() => {
    const root = document.documentElement
    const prevBg = root.style.backgroundColor
    const prevBody = document.body.style.backgroundColor
    root.style.backgroundColor = manifest.background
    document.body.style.backgroundColor = manifest.background

    let targetTop = scroller.current?.scrollTop ?? 0
    let ignoringScroll = false
    let syncTimer = 0
    let zoom = 1

    const maxTop = (el: HTMLDivElement) =>
      Math.max(0, el.scrollHeight - el.clientHeight)

    const pageStep = () => Math.round(window.innerHeight * PAGE_FRAC)
    const fineStep = () => Math.round(window.innerHeight * FINE_FRAC)

    const goTo = (top: number, behavior: ScrollBehavior = 'smooth') => {
      const el = scroller.current
      if (!el) return
      targetTop = Math.max(0, Math.min(maxTop(el), top))
      ignoringScroll = true
      el.scrollTo({ top: targetTop, behavior })
      window.clearTimeout(syncTimer)
      syncTimer = window.setTimeout(() => {
        ignoringScroll = false
      }, behavior === 'smooth' ? 400 : 0)
    }

    const onScroll = () => {
      if (ignoringScroll) return
      const el = scroller.current
      if (el) targetTop = el.scrollTop
    }

    /** Keep the point under the cursor (or viewport center) stable while zooming. */
    const zoomTo = (nextZoom: number, clientY?: number) => {
      const el = scroller.current
      const padEl = pad.current
      if (!el || !padEl) return
      const z0 = zoom
      const z1 = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM)
      if (Math.abs(z1 - z0) < 0.0001) return

      const rect = el.getBoundingClientRect()
      const y =
        clientY !== undefined ? clientY - rect.top : rect.height / 2
      const contentY = (el.scrollTop + y) / z0

      zoom = z1
      padEl.style.zoom = String(z1)

      const nextTop = Math.max(0, Math.min(maxTop(el), contentY * z1 - y))
      ignoringScroll = true
      el.scrollTop = nextTop
      targetTop = nextTop
      window.clearTimeout(syncTimer)
      syncTimer = window.setTimeout(() => {
        ignoringScroll = false
      }, 0)
    }

    const stepBySnapOrPage = (dir: 1 | -1) => {
      const el = scroller.current
      if (!el) return
      const snaps = collectSnapStops(el, PRESENT_INSET * zoom)
      if (snaps.length === 0) {
        goTo(targetTop + dir * pageStep())
        return
      }
      if (dir > 0) {
        const next = snaps.find((s) => s.top > targetTop + SNAP_EPS)
        goTo(next?.top ?? maxTop(el))
      } else {
        let prev: SnapStop | undefined
        for (const s of snaps) {
          if (s.top < targetTop - SNAP_EPS) prev = s
          else break
        }
        goTo(prev?.top ?? 0)
      }
    }

    /** Free scroll — ignores snap points (Ctrl/Cmd + ↑↓). */
    const stepFine = (dir: 1 | -1) => {
      goTo(targetTop + dir * fineStep())
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onExit()
        return
      }
      const el = scroller.current
      if (!el) return
      const fine = e.ctrlKey || e.metaKey

      if (fine && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault()
        stepFine(e.key === 'ArrowDown' ? 1 : -1)
        return
      }

      if (fine && (e.key === '=' || e.key === '+')) {
        e.preventDefault()
        zoomTo(zoom * ZOOM_STEP)
        return
      }
      if (fine && e.key === '-') {
        e.preventDefault()
        zoomTo(zoom / ZOOM_STEP)
        return
      }
      if (fine && e.key === '0') {
        e.preventDefault()
        zoomTo(1)
        return
      }

      if (
        e.key === ' ' ||
        e.key === 'ArrowDown' ||
        e.key === 'ArrowRight' ||
        e.key === 'PageDown'
      ) {
        e.preventDefault()
        stepBySnapOrPage(1)
      } else if (
        e.key === 'ArrowUp' ||
        e.key === 'ArrowLeft' ||
        e.key === 'PageUp'
      ) {
        e.preventDefault()
        stepBySnapOrPage(-1)
      } else if (e.key === 'Home') {
        e.preventDefault()
        goTo(0)
      } else if (e.key === 'End') {
        e.preventDefault()
        goTo(maxTop(el))
      }
    }

    // Ctrl/Cmd+wheel and trackpad pinch (pinch fires wheel with ctrlKey in Chromium)
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      zoomTo(zoom * Math.exp(-e.deltaY * ZOOM_INTENSITY), e.clientY)
    }

    const el = scroller.current
    el?.addEventListener('scroll', onScroll, { passive: true })
    el?.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('keydown', onKey)
    return () => {
      window.clearTimeout(syncTimer)
      el?.removeEventListener('scroll', onScroll)
      el?.removeEventListener('wheel', onWheel)
      window.removeEventListener('keydown', onKey)
      if (pad.current) pad.current.style.zoom = ''
      root.style.backgroundColor = prevBg
      document.body.style.backgroundColor = prevBody
    }
  }, [onExit, manifest.background, manifest.blocks])

  return (
    <div
      className={`presenter hide-scrollbar${hidePresentCursor ? ' hide-cursor' : ''}`}
      ref={scroller}
      style={{ backgroundColor: manifest.background }}
    >
      <div className="presenter-pad" ref={pad}>
        <Board
          manifest={manifest}
          assetUrl={assetUrl}
          editable={false}
          onOpenLink={(url) => {
            if (isOpenableUrl(url)) onOpenLink(url)
          }}
        />
      </div>
      {hintVisible && (
        <div
          className={`presenter-hint${presentHintMode === 'auto' ? ' is-auto' : ''}`}
        >
          Esc to exit · Arrows snap · Ctrl+↑↓ fine · Ctrl+scroll zoom
        </div>
      )}
    </div>
  )
}
