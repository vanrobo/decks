import { useEffect, useState } from 'react'

type Props = {
  /** 0–100; omit or null for indeterminate */
  progress?: number | null
  status?: string
  title?: string
  belowTitlebar?: boolean
}

/**
 * Calm export sheet — title, status line, progress track.
 * No giant spinning mark; feels like a system export, not a splash.
 */
export function ExportOverlay({
  progress = null,
  status = 'Packing your board…',
  title = 'Exporting',
  belowTitlebar = false,
}: Props) {
  const determinate = typeof progress === 'number' && Number.isFinite(progress)
  const pct = determinate ? Math.max(0, Math.min(100, Math.round(progress))) : null
  const [pulse, setPulse] = useState(0)

  useEffect(() => {
    if (determinate) return
    const id = window.setInterval(() => setPulse((n) => (n + 1) % 3), 700)
    return () => window.clearInterval(id)
  }, [determinate])

  const dots = determinate ? '' : '.'.repeat(pulse + 1)

  return (
    <div
      className={`export-overlay${belowTitlebar ? ' below-titlebar' : ''}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="export-sheet">
        <p className="export-title">{title}</p>
        <p className="export-status">
          {status}
          {!determinate && <span className="export-dots">{dots}</span>}
        </p>
        <div
          className={`export-track${determinate ? '' : ' is-indeterminate'}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct ?? undefined}
          role="progressbar"
        >
          <div
            className="export-bar"
            style={determinate ? { width: `${pct}%` } : undefined}
          />
        </div>
        {determinate && <p className="export-pct">{pct}%</p>}
      </div>
    </div>
  )
}
