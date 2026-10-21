import { CoreMark } from './CoreMark'

type Props = {
  label: string
  /** Leave custom title bar clickable (minimize/close during long export) */
  belowTitlebar?: boolean
}

/** Full-screen busy state with white COЯE spinner on dark glass */
export function BusyOverlay({ label, belowTitlebar = false }: Props) {
  return (
    <div
      className={`busy-overlay${belowTitlebar ? ' below-titlebar' : ''}`}
      role="status"
      aria-live="polite"
    >
      <CoreMark size={88} spin surface="onDark" />
      <p className="busy-label">{label}</p>
    </div>
  )
}
