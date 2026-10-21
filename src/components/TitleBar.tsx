import { useEffect, useState, type ReactNode } from 'react'
import { CoreMark } from './CoreMark'

export type TitleTab = {
  id: string
  label: string
  closable?: boolean
}

type Props = {
  actions?: ReactNode
  /** Home (house icon) */
  onHomeClick?: () => void
  homeActive?: boolean
  tabs?: TitleTab[]
  activeTabId?: string | null
  onTabSelect?: (id: string) => void
  onTabClose?: (id: string) => void
  onTabRename?: (id: string, label: string) => void
  onNewTab?: () => void
}

const LOGO_SIZE = 24

function HouseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M3 7.25 8 3.25l5 4V12.5a.75.75 0 0 1-.75.75H9.25v-3.1H6.75v3.1H3.75A.75.75 0 0 1 3 12.5V7.25Z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function TitleBar({
  actions,
  onHomeClick,
  homeActive = false,
  tabs = [],
  activeTabId,
  onTabSelect,
  onTabClose,
  onTabRename,
  onNewTab,
}: Props) {
  const [maximized, setMaximized] = useState(false)
  const isElectron = Boolean(window.core?.isElectron)

  useEffect(() => {
    if (!window.core) return
    void window.core.isMaximized().then(setMaximized)
    return window.core.onMaximized(setMaximized)
  }, [])

  return (
    <header className="titlebar">
      <div className="titlebar-leading no-drag">
        <div className="titlebar-brand static" aria-hidden>
          <CoreMark size={LOGO_SIZE} />
        </div>

        {onHomeClick && (
          <button
            type="button"
            className={`titlebar-home no-drag${homeActive ? ' active' : ''}`}
            onClick={onHomeClick}
            onMouseDown={(e) => e.preventDefault()}
            aria-label="Home"
            title="Home"
          >
            <HouseIcon />
          </button>
        )}

        {(tabs.length > 0 || onNewTab) && (
          <div className="titlebar-tabs no-drag" role="tablist">
            {tabs.map((tab) => {
              const active = tab.id === activeTabId
              return (
                <div
                  key={tab.id}
                  className={`title-tab no-drag${active ? ' active' : ''}`}
                  role="tab"
                  aria-selected={active}
                >
                  {active && onTabRename ? (
                    <input
                      className="title-tab-input no-drag"
                      value={tab.label}
                      onChange={(e) => onTabRename(tab.id, e.target.value)}
                      onMouseDown={(e) => e.stopPropagation()}
                      aria-label="Board title"
                      spellCheck={false}
                    />
                  ) : (
                    <button
                      type="button"
                      className="title-tab-label no-drag"
                      title={tab.label}
                      onMouseDown={(e) => {
                        // Electron drag regions eat click; select on mousedown
                        e.preventDefault()
                        onTabSelect?.(tab.id)
                      }}
                      onClick={(e) => {
                        e.preventDefault()
                        onTabSelect?.(tab.id)
                      }}
                    >
                      {tab.label}
                    </button>
                  )}
                  {tab.closable && (
                    <button
                      type="button"
                      className="title-tab-close no-drag"
                      aria-label={`Close ${tab.label}`}
                      title="Close"
                      onMouseDown={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        onTabClose?.(tab.id)
                      }}
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        onTabClose?.(tab.id)
                      }}
                    >
                      <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden>
                        <path
                          d="M1.5 1.5l5 5M6.5 1.5l-5 5"
                          stroke="currentColor"
                          strokeWidth="1.2"
                        />
                      </svg>
                    </button>
                  )}
                </div>
              )
            })}
            {onNewTab && (
              <button
                type="button"
                className="title-tab-add no-drag"
                title="New board"
                aria-label="New board"
                onMouseDown={(e) => {
                  e.preventDefault()
                  onNewTab()
                }}
                onClick={(e) => {
                  e.preventDefault()
                  onNewTab()
                }}
              >
                <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
                  <path
                    d="M5 1.5v7M1.5 5h7"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>

      <div className="titlebar-grip" aria-hidden />

      {actions ? <div className="titlebar-actions no-drag">{actions}</div> : null}

      {isElectron && (
        <div className="titlebar-controls no-drag">
          <button
            type="button"
            className="win-btn"
            aria-label="Minimize"
            onClick={() => void window.core?.minimize()}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
              <path d="M1 5h8" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </button>
          <button
            type="button"
            className="win-btn"
            aria-label={maximized ? 'Restore' : 'Maximize'}
            onClick={() => void window.core?.maximizeToggle()}
          >
            {maximized ? (
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
                <path
                  d="M2.5 3.5h5v5h-5zM3.5 2.5h5v5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.1"
                />
              </svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
                <rect
                  x="1.5"
                  y="1.5"
                  width="7"
                  height="7"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.2"
                />
              </svg>
            )}
          </button>
          <button
            type="button"
            className="win-btn win-close"
            aria-label="Close"
            onClick={() => void window.core?.closeWindow()}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
              <path d="M2 2l6 6M8 2L2 8" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </button>
        </div>
      )}
    </header>
  )
}
