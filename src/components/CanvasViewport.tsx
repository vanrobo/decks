import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  forwardRef,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from 'react'

export type CanvasViewportHandle = {
  /** Pan so the bottom of the board is in view (after adding blocks). */
  scrollToEnd: () => void
  fit: () => void
  reset: () => void
}

type Props = {
  children: ReactNode
  className?: string
  /** Extra class when empty-canvas drop affordance is active */
  dragOver?: boolean
  onDragEnter?: React.DragEventHandler
  onDragLeave?: React.DragEventHandler
  onDragOver?: React.DragEventHandler
  onDrop?: React.DragEventHandler
}

const MIN_ZOOM = 0.25
const MAX_ZOOM = 2
const ZOOM_STEP = 1.08
const FIT_PAD = 64
/** Soften trackpad / wheel pan (felt too jumpy). */
const WHEEL_PAN_SCALE = 0.55
/** Arrow Up/Down: fraction of viewport height. */
const ARROW_PAN_FRAC = 0.45
/** Ctrl+Arrow: finer step vs normal arrow pan. */
const CTRL_ARROW_SCALE = 0.35

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n))
}

function readZoom(): number {
  try {
    const n = Number(sessionStorage.getItem('decks-canvas-zoom'))
    if (Number.isFinite(n) && n >= MIN_ZOOM && n <= MAX_ZOOM) return n
  } catch {
    /* ignore */
  }
  return 1
}

export const CanvasViewport = forwardRef<CanvasViewportHandle, Props>(
  function CanvasViewport(
    {
      children,
      className = '',
      dragOver = false,
      onDragEnter,
      onDragLeave,
      onDragOver,
      onDrop,
    },
    ref,
  ) {
    const viewportRef = useRef<HTMLDivElement>(null)
    const worldRef = useRef<HTMLDivElement>(null)
    const zoomRef = useRef(readZoom())
    const panRef = useRef({ x: 0, y: 0 })
    const [zoomPct, setZoomPct] = useState(() => Math.round(zoomRef.current * 100))
    const [spaceDown, setSpaceDown] = useState(false)
    const [panning, setPanning] = useState(false)
    const panSession = useRef<{
      pointerId: number
      startX: number
      startY: number
      origX: number
      origY: number
    } | null>(null)
    const wheelRaf = useRef(0)
    const pendingWheel = useRef({ dx: 0, dy: 0 })

    const persistZoom = useCallback((z: number) => {
      try {
        sessionStorage.setItem('decks-canvas-zoom', String(z))
      } catch {
        /* ignore */
      }
    }, [])

    /** Imperative transform — avoids re-rendering the whole board while panning. */
    const applyTransform = useCallback(() => {
      const world = worldRef.current
      if (!world) return
      const { x, y } = panRef.current
      const z = zoomRef.current
      world.style.transform = `translate3d(${x}px, ${y}px, 0) scale3d(${z}, ${z}, 1)`
    }, [])

    const setPanBy = useCallback(
      (dx: number, dy: number) => {
        panRef.current = {
          x: panRef.current.x + dx,
          y: panRef.current.y + dy,
        }
        applyTransform()
      },
      [applyTransform],
    )

    const setPanTo = useCallback(
      (x: number, y: number) => {
        panRef.current = { x, y }
        applyTransform()
      },
      [applyTransform],
    )

    const zoomTo = useCallback(
      (nextZoom: number, clientX?: number, clientY?: number) => {
        const viewport = viewportRef.current
        const z0 = zoomRef.current
        const z1 = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM)
        if (Math.abs(z1 - z0) < 0.0001) return

        if (!viewport) {
          zoomRef.current = z1
          applyTransform()
          setZoomPct(Math.round(z1 * 100))
          persistZoom(z1)
          return
        }

        const rect = viewport.getBoundingClientRect()
        const mx = clientX !== undefined ? clientX - rect.left : rect.width / 2
        const my = clientY !== undefined ? clientY - rect.top : rect.height / 2
        const { x, y } = panRef.current
        const wx = (mx - x) / z0
        const wy = (my - y) / z0
        panRef.current = { x: mx - wx * z1, y: my - wy * z1 }
        zoomRef.current = z1
        applyTransform()
        setZoomPct(Math.round(z1 * 100))
        persistZoom(z1)
      },
      [applyTransform, persistZoom],
    )

    const fit = useCallback(() => {
      const viewport = viewportRef.current
      const world = worldRef.current
      if (!viewport || !world) return
      const stage = world.querySelector('.board-stage') as HTMLElement | null
      if (!stage) return
      const vw = viewport.clientWidth
      const vh = viewport.clientHeight
      const sw = stage.scrollWidth
      const sh = stage.scrollHeight
      if (sw <= 0 || sh <= 0) return
      const z = clamp(
        Math.min((vw - FIT_PAD * 2) / sw, (vh - FIT_PAD * 2) / sh),
        MIN_ZOOM,
        1,
      )
      zoomRef.current = z
      panRef.current = { x: (vw - sw * z) / 2, y: FIT_PAD }
      applyTransform()
      setZoomPct(Math.round(z * 100))
      persistZoom(z)
    }, [applyTransform, persistZoom])

    const reset = useCallback(() => {
      zoomRef.current = 1
      panRef.current = { x: 0, y: 0 }
      applyTransform()
      setZoomPct(100)
      persistZoom(1)
    }, [applyTransform, persistZoom])

    const scrollToEnd = useCallback(() => {
      requestAnimationFrame(() => {
        const viewport = viewportRef.current
        const world = worldRef.current
        if (!viewport || !world) return
        const stage = world.querySelector('.board-stage') as HTMLElement | null
        if (!stage) return
        const z = zoomRef.current
        const vh = viewport.clientHeight
        const sh = stage.scrollHeight
        const y = Math.min(FIT_PAD, vh - FIT_PAD - sh * z)
        panRef.current = { ...panRef.current, y }
        applyTransform()
      })
    }, [applyTransform])

    useImperativeHandle(ref, () => ({ scrollToEnd, fit, reset }), [
      scrollToEnd,
      fit,
      reset,
    ])

    // Initial paint
    useEffect(() => {
      applyTransform()
    }, [applyTransform])

    useEffect(() => {
      const isTypingTarget = (t: EventTarget | null) => {
        if (!(t instanceof HTMLElement)) return false
        const tag = t.tagName
        return (
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          tag === 'SELECT' ||
          t.isContentEditable
        )
      }

      const onKeyDown = (e: KeyboardEvent) => {
        if (isTypingTarget(e.target)) return

        if (e.code === 'Space') {
          e.preventDefault()
          setSpaceDown(true)
          return
        }

        const mod = e.metaKey || e.ctrlKey
        const viewport = viewportRef.current
        const stepBase = (viewport?.clientHeight || 600) * ARROW_PAN_FRAC

        // Ctrl/Cmd + ↑/↓ — finer vertical pan (~⅓ of arrow step)
        if (mod && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
          e.preventDefault()
          const dir = e.key === 'ArrowUp' ? 1 : -1
          setPanBy(0, dir * stepBase * CTRL_ARROW_SCALE)
          return
        }

        // Arrow ↑/↓ — page-ish pan (not in form fields)
        if (!mod && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
          e.preventDefault()
          const dir = e.key === 'ArrowUp' ? 1 : -1
          setPanBy(0, dir * stepBase)
          return
        }

        if (!mod) return
        if (e.key === '=' || e.key === '+') {
          e.preventDefault()
          zoomTo(zoomRef.current * ZOOM_STEP)
        } else if (e.key === '-') {
          e.preventDefault()
          zoomTo(zoomRef.current / ZOOM_STEP)
        } else if (e.key === '0') {
          e.preventDefault()
          reset()
        } else if (e.key === '1') {
          e.preventDefault()
          fit()
        }
      }
      const onKeyUp = (e: KeyboardEvent) => {
        if (e.code === 'Space') setSpaceDown(false)
      }
      const onBlur = () => setSpaceDown(false)
      window.addEventListener('keydown', onKeyDown, { capture: true })
      window.addEventListener('keyup', onKeyUp)
      window.addEventListener('blur', onBlur)
      return () => {
        window.removeEventListener('keydown', onKeyDown, { capture: true })
        window.removeEventListener('keyup', onKeyUp)
        window.removeEventListener('blur', onBlur)
      }
    }, [zoomTo, reset, fit, setPanBy])

    // Non-passive wheel: rAF-batched pan, pinch/ctrl zoom
    useEffect(() => {
      const el = viewportRef.current
      if (!el) return

      const flushWheelPan = () => {
        wheelRaf.current = 0
        const { dx, dy } = pendingWheel.current
        pendingWheel.current = { dx: 0, dy: 0 }
        if (dx === 0 && dy === 0) return
        setPanBy(-dx * WHEEL_PAN_SCALE, -dy * WHEEL_PAN_SCALE)
      }

      const onWheel = (e: WheelEvent) => {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault()
          const factor = e.deltaY > 0 ? 1 / ZOOM_STEP : ZOOM_STEP
          zoomTo(zoomRef.current * factor, e.clientX, e.clientY)
          return
        }
        e.preventDefault()
        // Shift+wheel → treat as horizontal when deltaX is tiny (mouse)
        let dx = e.deltaX
        let dy = e.deltaY
        if (e.shiftKey && Math.abs(dx) < 1) {
          dx = dy
          dy = 0
        }
        pendingWheel.current.dx += dx
        pendingWheel.current.dy += dy
        if (!wheelRaf.current) {
          wheelRaf.current = requestAnimationFrame(flushWheelPan)
        }
      }
      el.addEventListener('wheel', onWheel, { passive: false })
      return () => {
        el.removeEventListener('wheel', onWheel)
        if (wheelRaf.current) cancelAnimationFrame(wheelRaf.current)
      }
    }, [zoomTo, setPanBy])

    const beginPan = (e: ReactPointerEvent) => {
      const middle = e.button === 1
      const space = spaceDown && e.button === 0
      if (!middle && !space) return
      e.preventDefault()
      e.currentTarget.setPointerCapture(e.pointerId)
      panSession.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        origX: panRef.current.x,
        origY: panRef.current.y,
      }
      setPanning(true)
    }

    const onPointerMove = (e: ReactPointerEvent) => {
      const s = panSession.current
      if (!s || s.pointerId !== e.pointerId) return
      setPanTo(s.origX + (e.clientX - s.startX), s.origY + (e.clientY - s.startY))
    }

    const endPan = (e: ReactPointerEvent) => {
      const s = panSession.current
      if (!s || s.pointerId !== e.pointerId) return
      panSession.current = null
      setPanning(false)
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
    }

    return (
      <div
        className={`editor-canvas canvas-shell${dragOver ? ' drag-over' : ''}${className ? ` ${className}` : ''}`}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        <div
          ref={viewportRef}
          className={`canvas-viewport${spaceDown || panning ? ' is-pan' : ''}${panning ? ' is-panning' : ''}`}
          onPointerDown={beginPan}
          onPointerMove={onPointerMove}
          onPointerUp={endPan}
          onPointerCancel={endPan}
          onAuxClick={(e) => {
            if (e.button === 1) e.preventDefault()
          }}
        >
          <div ref={worldRef} className="canvas-world">
            {children}
          </div>
        </div>

        <div className="canvas-zoom-bar" role="toolbar" aria-label="Canvas zoom">
          <button
            type="button"
            className="canvas-zoom-btn"
            title="Zoom out (Ctrl+-)"
            aria-label="Zoom out"
            onClick={() => zoomTo(zoomRef.current / ZOOM_STEP)}
          >
            −
          </button>
          <button
            type="button"
            className="canvas-zoom-pct"
            title="Reset zoom (Ctrl+0)"
            aria-label={`Zoom ${zoomPct}%`}
            onClick={reset}
          >
            {zoomPct}%
          </button>
          <button
            type="button"
            className="canvas-zoom-btn"
            title="Zoom in (Ctrl+=)"
            aria-label="Zoom in"
            onClick={() => zoomTo(zoomRef.current * ZOOM_STEP)}
          >
            +
          </button>
          <button
            type="button"
            className="canvas-zoom-btn canvas-zoom-fit"
            title="Fit board (Ctrl+1)"
            aria-label="Fit board"
            onClick={fit}
          >
            Fit
          </button>
        </div>
      </div>
    )
  },
)
