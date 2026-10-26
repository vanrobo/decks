import { useEffect, useRef, useState } from 'react'
import type { DeckManifest } from '../types'
import {
  PRESENT_PARALLAX,
  backdropImageStyle,
  isOpenableUrl,
  patternClass,
} from '../lib/backdrops'
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
const MIN_ZOOM = 0.35
const MAX_ZOOM = 2.5
/**
 * Ctrl/Cmd+wheel and trackpad pinch (Chromium sets ctrlKey on pinch).
 * Mouse notches send huge deltaY — keep intensity + per-event cap tiny
 * so Ctrl+scroll is many small steps, not one instant jump.
 */
const ZOOM_INTENSITY = 0.00012
/** Cap per wheel event (~0.8% max) so a mouse notch can't leap a level. */
const ZOOM_FACTOR_MIN = 0.992
const ZOOM_FACTOR_MAX = 1.008
/** Keyboard Ctrl+/− — small so you can walk zoom in many steps. */
const ZOOM_STEP = 1.015

/** Spatial camera: short hops snap, long hops glide — never fight user zoom. */
const FLY_MS_MIN = 320
const FLY_MS_MAX = 820
const FLY_MS_PER_PX = 0.42

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n))
}

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
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
  const parallax = useRef<HTMLDivElement>(null)
  const { presentHintMode, hidePresentCursor, reduceMotion } = usePrefs()
  const [hintVisible, setHintVisible] = useState(presentHintMode !== 'off')

  const backdrop = manifest.backdrop ?? { kind: 'solid' as const }
  const parallaxPattern =
    backdrop.kind === 'pattern' ? patternClass(backdrop.pattern) : ''
  const parallaxImage = backdropImageStyle(backdrop, assetUrl)
  /** Patterns / images drift; solid color is just the stage fill. */
  const canParallax =
    !reduceMotion &&
    (backdrop.kind === 'pattern' || backdrop.kind === 'image')

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
    let flyRaf = 0
    let parallaxRaf = 0

    const maxTop = (el: HTMLDivElement) =>
      Math.max(0, el.scrollHeight - el.clientHeight)

    const pageStep = () => Math.round(window.innerHeight * PAGE_FRAC)
    const fineStep = () => Math.round(window.innerHeight * FINE_FRAC)

    const syncParallax = (scrollTop: number) => {
      const layer = parallax.current
      if (!layer || !canParallax) return
      // Sticky layer stays in view; shift its pattern slower than content.
      // Dual-layer grids need an explicit position per image (not `center`).
      const drift = scrollTop * (1 - PRESENT_PARALLAX)
      const pos = `0 ${-drift}px`
      layer.style.backgroundPosition = `${pos}, ${pos}`
    }

    const scheduleParallax = () => {
      if (parallaxRaf) return
      parallaxRaf = requestAnimationFrame(() => {
        parallaxRaf = 0
        const el = scroller.current
        if (el) syncParallax(el.scrollTop)
      })
    }

    const cancelFly = () => {
      if (flyRaf) {
        cancelAnimationFrame(flyRaf)
        flyRaf = 0
      }
    }

    /**
     * Spatial present: ease the camera to a Y stop.
     * Zoom stays user-owned (Ctrl± / pinch) — auto zoom-to-fit is what
     * makes “spatial” decks feel broken on tall Figma exports.
     */
    const flyTo = (top: number) => {
      const el = scroller.current
      if (!el) return
      const dest = Math.max(0, Math.min(maxTop(el), top))
      const from = el.scrollTop
      targetTop = dest

      if (reduceMotion || Math.abs(dest - from) < 1) {
        cancelFly()
        ignoringScroll = true
        el.scrollTop = dest
        syncParallax(dest)
        window.clearTimeout(syncTimer)
        syncTimer = window.setTimeout(() => {
          ignoringScroll = false
        }, 0)
        return
      }

      cancelFly()
      const dist = Math.abs(dest - from)
      const ms = clamp(FLY_MS_MIN + dist * FLY_MS_PER_PX, FLY_MS_MIN, FLY_MS_MAX)
      const t0 = performance.now()
      ignoringScroll = true

      const step = (now: number) => {
        const t = clamp((now - t0) / ms, 0, 1)
        const y = from + (dest - from) * easeInOutCubic(t)
        el.scrollTop = y
        syncParallax(y)
        if (t < 1) {
          flyRaf = requestAnimationFrame(step)
        } else {
          flyRaf = 0
          targetTop = dest
          ignoringScroll = false
        }
      }
      flyRaf = requestAnimationFrame(step)
    }

    /** Instant or browser-smooth for fine/page when reduceMotion / non-snap. */
    const goTo = (top: number, behavior: ScrollBehavior = 'smooth') => {
      const el = scroller.current
      if (!el) return
      cancelFly()
      targetTop = Math.max(0, Math.min(maxTop(el), top))
      ignoringScroll = true
      if (reduceMotion) {
        el.scrollTop = targetTop
        syncParallax(targetTop)
        window.clearTimeout(syncTimer)
        syncTimer = window.setTimeout(() => {
          ignoringScroll = false
        }, 0)
        return
      }
      el.scrollTo({ top: targetTop, behavior })
      window.clearTimeout(syncTimer)
      syncTimer = window.setTimeout(() => {
        ignoringScroll = false
        syncParallax(el.scrollTop)
      }, behavior === 'smooth' ? 400 : 0)
    }

    const onScroll = () => {
      if (ignoringScroll) {
        scheduleParallax()
        return
      }
      const el = scroller.current
      if (el) {
        targetTop = el.scrollTop
        scheduleParallax()
      }
    }

    /**
     * Zoom about the viewport center on both axes so the board doesn't
     * drift (trackpad pinch especially — no stable "cursor" focal point).
     */
    const zoomTo = (nextZoom: number) => {
      const el = scroller.current
      const padEl = pad.current
      if (!el || !padEl) return
      cancelFly()
      const z0 = zoom
      const z1 = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM)
      if (Math.abs(z1 - z0) < 0.0001) return

      const cx = el.clientWidth / 2
      const cy = el.clientHeight / 2
      const contentX = (el.scrollLeft + cx) / z0
      const contentY = (el.scrollTop + cy) / z0

      zoom = z1
      padEl.style.zoom = String(z1)
      // Ensure layout/scrollWidth update before we re-anchor.
      void padEl.offsetHeight

      // CSS zoom grows from the top-left; when zoomed out the pad is narrower
      // than the viewport — center it with margin so it doesn't sit on the left.
      const gapX = el.clientWidth - padEl.offsetWidth
      if (gapX > 0) {
        padEl.style.marginLeft = `${gapX / 2}px`
        padEl.style.marginRight = `${gapX / 2}px`
      } else {
        padEl.style.marginLeft = ''
        padEl.style.marginRight = ''
      }
      void padEl.offsetHeight

      const maxLeft = Math.max(0, el.scrollWidth - el.clientWidth)
      const nextLeft = clamp(contentX * z1 - cx, 0, maxLeft)
      const nextTop = clamp(contentY * z1 - cy, 0, maxTop(el))

      ignoringScroll = true
      el.scrollLeft = nextLeft
      el.scrollTop = nextTop
      targetTop = nextTop
      syncParallax(nextTop)
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
        flyTo(next?.top ?? maxTop(el))
      } else {
        let prev: SnapStop | undefined
        for (const s of snaps) {
          if (s.top < targetTop - SNAP_EPS) prev = s
          else break
        }
        flyTo(prev?.top ?? 0)
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
        flyTo(0)
      } else if (e.key === 'End') {
        e.preventDefault()
        flyTo(maxTop(el))
      }
    }

    /**
     * Own wheel scrolling so mouse notches (deltaMode=line) always move
     * `.presenter` and update parallax. Native wheel + sticky backgrounds
     * often desync on Windows; trackpad/middle-drag were fine via scroll events.
     */
    const onWheel = (e: WheelEvent) => {
      const el = scroller.current
      if (!el) return

      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        let dy = e.deltaY
        // Normalize line/page deltas so mouse notches aren't huge vs pixel pinch.
        if (e.deltaMode === 1) dy *= 16
        else if (e.deltaMode === 2) dy *= window.innerHeight
        const factor = clamp(
          Math.exp(-dy * ZOOM_INTENSITY),
          ZOOM_FACTOR_MIN,
          ZOOM_FACTOR_MAX,
        )
        zoomTo(zoom * factor)
        return
      }

      e.preventDefault()
      cancelFly()
      let dy = e.deltaY
      if (e.deltaMode === 1) dy *= 40
      else if (e.deltaMode === 2) dy *= el.clientHeight
      // Shift/horizontal wheels
      if (e.shiftKey && e.deltaX === 0) {
        /* keep vertical */
      } else if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        el.scrollLeft = clamp(
          el.scrollLeft + e.deltaX,
          0,
          Math.max(0, el.scrollWidth - el.clientWidth),
        )
        return
      }
      const next = clamp(el.scrollTop + dy, 0, maxTop(el))
      ignoringScroll = true
      el.scrollTop = next
      targetTop = next
      syncParallax(next)
      window.clearTimeout(syncTimer)
      syncTimer = window.setTimeout(() => {
        ignoringScroll = false
      }, 0)
    }

    const el = scroller.current
    el?.addEventListener('scroll', onScroll, { passive: true })
    el?.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('keydown', onKey)
    // Mouse wheel targets the focused scroll container on some Windows setups.
    el?.setAttribute('tabindex', '-1')
    el?.focus({ preventScroll: true })
    syncParallax(el?.scrollTop ?? 0)

    return () => {
      window.clearTimeout(syncTimer)
      cancelFly()
      if (parallaxRaf) cancelAnimationFrame(parallaxRaf)
      el?.removeEventListener('scroll', onScroll)
      el?.removeEventListener('wheel', onWheel)
      window.removeEventListener('keydown', onKey)
      if (pad.current) {
        pad.current.style.zoom = ''
        pad.current.style.marginLeft = ''
        pad.current.style.marginRight = ''
      }
      if (parallax.current) {
        parallax.current.style.backgroundPosition = ''
      }
      root.style.backgroundColor = prevBg
      document.body.style.backgroundColor = prevBody
    }
  }, [
    onExit,
    manifest.background,
    manifest.blocks,
    canParallax,
    reduceMotion,
  ])

  return (
    <div
      className={`presenter hide-scrollbar${hidePresentCursor ? ' hide-cursor' : ''}`}
      ref={scroller}
      style={{ backgroundColor: manifest.background }}
    >
      <div
        ref={parallax}
        className={`presenter-parallax${parallaxPattern ? ` ${parallaxPattern}` : ''}${canParallax ? ' is-live' : ''}`}
        style={{
          backgroundColor: manifest.background,
          ...parallaxImage,
        }}
        aria-hidden
      />
      <div className="presenter-pad" ref={pad}>
        <Board
          manifest={manifest}
          assetUrl={assetUrl}
          editable={false}
          detachBackdrop
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
