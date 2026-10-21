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

    const stepBySnapOrPage = (dir: 1 | -1) => {
      const el = scroller.current
      if (!el) return
      const snaps = collectSnapStops(el, PRESENT_INSET)
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

    const el = scroller.current
    el?.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('keydown', onKey)
    return () => {
      window.clearTimeout(syncTimer)
      el?.removeEventListener('scroll', onScroll)
      window.removeEventListener('keydown', onKey)
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
      <div className="presenter-pad">
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
          Esc to exit · Arrows snap · Ctrl+↑↓ fine
        </div>
      )}
    </div>
  )
}
