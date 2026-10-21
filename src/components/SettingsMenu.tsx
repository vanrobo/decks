import type { ReactNode } from 'react'
import type { FrameFillMode } from '../types'
import { APP_AUTHOR, APP_DEVELOPED, APP_NAME, APP_VERSION } from '../lib/appMeta'
import {
  usePrefs,
  type BoardGapPreset,
  type BoardWidthPreset,
  type LibraryLayout,
  type PresentHintMode,
} from '../lib/prefs'

type ButtonProps = {
  className?: string
  active?: boolean
  onOpen: () => void
}

function GearIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M6.5 2.5h3l.4 1.4a4.5 4.5 0 0 1 1.2.7l1.4-.4 1.5 2.6-1 .9c.1.4.1.8 0 1.2l1 .9-1.5 2.6-1.4-.4a4.5 4.5 0 0 1-1.2.7L9.5 13.5h-3l-.4-1.4a4.5 4.5 0 0 1-1.2-.7l-1.4.4L2 9.2l1-.9a4.2 4.2 0 0 1 0-1.2l-1-.9L3.5 3.6l1.4.4a4.5 4.5 0 0 1 1.2-.7L6.5 2.5Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="8" r="1.8" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

function SunIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <circle cx="9" cy="9" r="3.25" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M9 2.25v1.5M9 14.25v1.5M2.25 9h1.5M14.25 9h1.5M4.2 4.2l1.05 1.05M12.75 12.75l1.05 1.05M13.8 4.2l-1.05 1.05M5.25 12.75l-1.05 1.05"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path
        d="M14.2 10.4A5.75 5.75 0 0 1 7.6 3.8 5.9 5.9 0 1 0 14.2 10.4Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Titlebar gear — opens the settings screen */
export function SettingsMenu({ className = '', active = false, onOpen }: ButtonProps) {
  return (
    <button
      type="button"
      className={`icon-btn settings-trigger${active ? ' active' : ''}${className ? ` ${className}` : ''}`}
      onClick={onOpen}
      title="Settings"
      aria-label="Settings"
      aria-current={active ? 'page' : undefined}
    >
      <GearIcon />
    </button>
  )
}

function SettingsToggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`settings-switch${checked ? ' on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="settings-switch-knob" />
    </button>
  )
}

function SettingsRow({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="settings-row-item">
      <div className="settings-row-copy">
        <span className="settings-row-label">{label}</span>
        {hint && <span className="settings-row-hint">{hint}</span>}
      </div>
      <div className="settings-row-control">{children}</div>
    </div>
  )
}

function Segment<T extends string | number>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  ariaLabel: string
}) {
  return (
    <div className="settings-segment" role="group" aria-label={ariaLabel}>
      {options.map((opt) => (
        <button
          key={String(opt.value)}
          type="button"
          className={`settings-segment-btn${value === opt.value ? ' active' : ''}`}
          onClick={() => onChange(opt.value)}
          aria-pressed={value === opt.value}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

/** Full settings screen */
export function SettingsScreen() {
  const {
    theme,
    setTheme,
    presentFullscreen,
    setPresentFullscreen,
    presentHintMode,
    setPresentHintMode,
    hidePresentCursor,
    setHidePresentCursor,
    videosAsGif,
    setVideosAsGif,
    mutePresentVideos,
    setMutePresentVideos,
    defaultBoardWidth,
    setDefaultBoardWidth,
    defaultFrameFill,
    setDefaultFrameFill,
    defaultGap,
    setDefaultGap,
    reduceMotion,
    setReduceMotion,
    libraryLayout,
    setLibraryLayout,
  } = usePrefs()

  return (
    <div className="settings-body">
      <header className="settings-hero">
        <h1 className="settings-title">Settings</h1>
      </header>

      <div className="settings-list">
        <section className="settings-group" aria-labelledby="settings-appearance">
          <h2 id="settings-appearance" className="settings-group-title">
            Appearance
          </h2>
          <SettingsRow label="Theme">
            <div className="settings-theme-toggle" role="group" aria-label="Theme">
              <button
                type="button"
                className={`settings-theme-btn${theme === 'light' ? ' active' : ''}`}
                onClick={() => setTheme('light')}
                title="Light"
                aria-label="Light"
                aria-pressed={theme === 'light'}
              >
                <SunIcon />
              </button>
              <button
                type="button"
                className={`settings-theme-btn${theme === 'dark' ? ' active' : ''}`}
                onClick={() => setTheme('dark')}
                title="Dark"
                aria-label="Dark"
                aria-pressed={theme === 'dark'}
              >
                <MoonIcon />
              </button>
            </div>
          </SettingsRow>
        </section>

        <section className="settings-group" aria-labelledby="settings-present">
          <h2 id="settings-present" className="settings-group-title">
            Present
          </h2>
          <SettingsRow label="Fullscreen" hint="Enter fullscreen when presenting">
            <SettingsToggle
              checked={presentFullscreen}
              onChange={setPresentFullscreen}
              label="Fullscreen when presenting"
            />
          </SettingsRow>
          <SettingsRow label="Shortcut hint" hint="Esc · Arrows overlay">
            <Segment<PresentHintMode>
              ariaLabel="Shortcut hint"
              value={presentHintMode}
              onChange={setPresentHintMode}
              options={[
                { value: 'off', label: 'Off' },
                { value: 'auto', label: 'Auto' },
                { value: 'always', label: 'On' },
              ]}
            />
          </SettingsRow>
          <SettingsRow label="Hide cursor" hint="Pointer disappears while pitching">
            <SettingsToggle
              checked={hidePresentCursor}
              onChange={setHidePresentCursor}
              label="Hide cursor while presenting"
            />
          </SettingsRow>
        </section>

        <section className="settings-group" aria-labelledby="settings-media">
          <h2 id="settings-media" className="settings-group-title">
            Media
          </h2>
          <SettingsRow
            label="Play like GIFs"
            hint="Muted, looping, no controls — default for new videos"
          >
            <SettingsToggle
              checked={videosAsGif}
              onChange={setVideosAsGif}
              label="Play videos like GIFs"
            />
          </SettingsRow>
          <SettingsRow label="Mute videos" hint="No audio while presenting">
            <SettingsToggle
              checked={mutePresentVideos}
              onChange={setMutePresentVideos}
              label="Mute videos in present"
            />
          </SettingsRow>
        </section>

        <section className="settings-group" aria-labelledby="settings-editor">
          <h2 id="settings-editor" className="settings-group-title">
            Editor defaults
          </h2>
          <SettingsRow label="Board width" hint="Used for new boards">
            <Segment<BoardWidthPreset>
              ariaLabel="Board width"
              value={defaultBoardWidth}
              onChange={setDefaultBoardWidth}
              options={[
                { value: 1080, label: '1080' },
                { value: 1200, label: '1200' },
                { value: 1440, label: '1440' },
              ]}
            />
          </SettingsRow>
          <SettingsRow label="Frame fill">
            <Segment<FrameFillMode>
              ariaLabel="Frame fill"
              value={defaultFrameFill}
              onChange={setDefaultFrameFill}
              options={[
                { value: 'contained', label: 'In' },
                { value: 'bleed', label: 'Bleed' },
                { value: 'expand', label: 'Expand' },
                { value: 'ambient', label: 'Glow' },
              ]}
            />
          </SettingsRow>
          <SettingsRow label="Block gap">
            <Segment<BoardGapPreset>
              ariaLabel="Block gap"
              value={defaultGap}
              onChange={setDefaultGap}
              options={[
                { value: 16, label: 'S' },
                { value: 24, label: 'M' },
                { value: 40, label: 'L' },
              ]}
            />
          </SettingsRow>
        </section>

        <section className="settings-group" aria-labelledby="settings-library">
          <h2 id="settings-library" className="settings-group-title">
            Library
          </h2>
          <SettingsRow label="Default layout">
            <Segment<LibraryLayout>
              ariaLabel="Library layout"
              value={libraryLayout}
              onChange={setLibraryLayout}
              options={[
                { value: 'list', label: 'List' },
                { value: 'grid', label: 'Grid' },
              ]}
            />
          </SettingsRow>
        </section>

        <section className="settings-group" aria-labelledby="settings-motion">
          <h2 id="settings-motion" className="settings-group-title">
            Motion
          </h2>
          <SettingsRow label="Reduce motion" hint="Cut animations and transitions">
            <SettingsToggle
              checked={reduceMotion}
              onChange={setReduceMotion}
              label="Reduce motion"
            />
          </SettingsRow>
        </section>

        <section className="settings-group" aria-labelledby="settings-about">
          <h2 id="settings-about" className="settings-group-title">
            About
          </h2>
          <SettingsRow label="App">
            <span className="settings-meta-value">{APP_NAME}</span>
          </SettingsRow>
          <SettingsRow label="Version">
            <span className="settings-meta-value">{APP_VERSION}</span>
          </SettingsRow>
          <SettingsRow label="Developed" hint={APP_AUTHOR}>
            <span className="settings-meta-value">{APP_DEVELOPED}</span>
          </SettingsRow>
        </section>
      </div>
    </div>
  )
}
