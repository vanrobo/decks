import { StrictMode, useCallback, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/space-grotesk/500.css'
import '@fontsource/space-grotesk/700.css'
import type { DeckManifest } from './types'
import { PrefsProvider } from './lib/prefs'
import { Presenter } from './components/Presenter'
import './styles.css'

declare global {
  interface Window {
    __CORE_DECK__?: DeckManifest | null
  }
}

function isZipPreviewUrl(href: string): boolean {
  return /\.(zip|core)[/\\]/i.test(href)
}

function assetUrl(src: string): string {
  return src.replace(/^\/+/, '')
}

function PresentApp({ manifest }: { manifest: DeckManifest }) {
  const [closeHint, setCloseHint] = useState(false)

  const onExit = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen()
      return
    }
    setCloseHint((v) => !v)
  }, [])

  const onOpenLink = useCallback((url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer')
  }, [])

  return (
    <>
      <Presenter
        manifest={manifest}
        assetUrl={assetUrl}
        onExit={onExit}
        onOpenLink={onOpenLink}
      />
      {closeHint && (
        <div className="present-standalone-exit" role="status">
          Close this tab to exit · Esc again dismisses this message
          <button
            type="button"
            className="present-standalone-exit-dismiss"
            onClick={() => setCloseHint(false)}
          >
            OK
          </button>
        </div>
      )}
    </>
  )
}

function boot() {
  const rootEl = document.getElementById('root')
  if (!rootEl) return

  if (isZipPreviewUrl(location.href)) {
    rootEl.innerHTML =
      '<div class="present-standalone-error">' +
      '<p><strong>Extract the archive first.</strong></p>' +
      '<p>Rename the .core to .zip → Extract All → open Present.html from the extracted folder. ' +
      'Opening it from inside the zip preview breaks images and video.</p>' +
      '</div>'
    return
  }

  const manifest = window.__CORE_DECK__
  if (!manifest || manifest.format !== 'core-deck') {
    rootEl.innerHTML =
      '<div class="present-standalone-error">' +
      '<p><strong>Missing deck data.</strong></p>' +
      '<p>Re-export this board from DECKS to get a Present.html with the deck baked in.</p>' +
      '</div>'
    return
  }

  document.title = manifest.title ? `${manifest.title} · Present` : 'DECKS Present'

  createRoot(rootEl).render(
    <StrictMode>
      <PrefsProvider>
        <PresentApp manifest={manifest} />
      </PrefsProvider>
    </StrictMode>,
  )
}

boot()
