type Props = {
  size?: number
  /** When true, outer ring uses the official CORE spinner motion */
  spin?: boolean
  /**
   * `auto` — follow app theme (black on light, white on dark).
   * `onDark` — always white ink (splash).
   * `onLight` — always black ink.
   */
  surface?: 'auto' | 'onDark' | 'onLight'
  className?: string
  title?: string
}

/** Official COЯE mark — black/white ink + orange arc (from corelogospinner.svg). */
export function CoreMark({
  size = 28,
  spin = false,
  surface = 'auto',
  className = '',
  title,
}: Props) {
  const surfaceClass =
    surface === 'onDark' ? ' on-dark-surface' : surface === 'onLight' ? ' on-light-surface' : ''

  return (
    <svg
      className={`core-logo${spin ? ' is-spinning' : ''}${surfaceClass}${className ? ` ${className}` : ''}`}
      width={size}
      height={size}
      viewBox="0 0 400 400"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      aria-label={title}
    >
      <g className="core-orbit" fill="none" strokeWidth="24" strokeLinecap="butt">
        <circle
          className="core-logo-ink"
          cx="200"
          cy="200"
          r="186"
          strokeDasharray="876.5 292.2"
          transform="rotate(45 200 200)"
        />
        <circle
          cx="200"
          cy="200"
          r="186"
          stroke="#F06423"
          strokeDasharray="292.2 876.5"
          transform="rotate(-45 200 200)"
        />
      </g>
      <circle
        className="core-logo-ink"
        cx="200"
        cy="200"
        r="150"
        fill="none"
        strokeWidth="24"
      />
      <g
        className="core-logo-ink"
        fill="none"
        strokeWidth="22"
        strokeLinecap="butt"
        strokeLinejoin="miter"
      >
        <path d="M 193 285 L 193 126 L 152 126 A 39 39 0 0 0 152 204 L 193 204" />
        <path d="M 154 204 L 108 280" />
        <path d="M 301 126 L 219 126 L 219 274 L 301 274" />
        <path d="M 219 200 L 282 200" />
      </g>
    </svg>
  )
}
