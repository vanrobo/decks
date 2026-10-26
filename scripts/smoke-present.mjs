/**
 * Smoke-test present parallax stage + spatial snap fly.
 * Serves dist-present/Present.html with a tall grid deck, drives Space, asserts motion.
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const presentDir = path.join(root, 'dist-present')

const deck = {
  format: 'core-deck',
  version: 1,
  title: 'Smoke Parallax',
  width: 1200,
  background: '#0d0d0d',
  gap: 48,
  backdrop: { kind: 'pattern', pattern: 'grid' },
  frameFill: 'contained',
  blocks: [
    { id: 't1', type: 'text', variant: 'heading', content: 'Snap A', align: 'center', size: 'xl' },
    { id: 'm1', type: 'marker', label: 'a' },
    { id: 's1', type: 'spacer', height: 900 },
    { id: 't2', type: 'text', variant: 'heading', content: 'Snap B', align: 'center', size: 'xl' },
    { id: 'm2', type: 'marker', label: 'b' },
    { id: 's2', type: 'spacer', height: 900 },
    { id: 't3', type: 'text', variant: 'heading', content: 'Snap C', align: 'center', size: 'xl' },
    { id: 'm3', type: 'marker', label: 'c' },
    { id: 's3', type: 'spacer', height: 600 },
  ],
}

function mime(file) {
  if (file.endsWith('.html')) return 'text/html; charset=utf-8'
  if (file.endsWith('.js')) return 'text/javascript; charset=utf-8'
  if (file.endsWith('.css')) return 'text/css; charset=utf-8'
  return 'application/octet-stream'
}

function injectDeck(html) {
  const json = JSON.stringify(deck)
  if (html.includes('/*__CORE_DECK__*/')) {
    return html.replace(
      /window\.__CORE_DECK__\s*=\s*\/\*__CORE_DECK__\*\/null\/\*__\/CORE_DECK__\*\//,
      `window.__CORE_DECK__ = ${json}`,
    )
  }
  // singlefile build may already inline null
  return html.replace(
    /window\.__CORE_DECK__\s*=\s*null/,
    `window.__CORE_DECK__ = ${json}`,
  )
}

async function main() {
  const htmlPath = path.join(presentDir, 'Present.html')
  const alt = path.join(presentDir, 'present.html')
  const entry = fs.existsSync(htmlPath) ? htmlPath : alt
  if (!fs.existsSync(entry)) {
    console.error('Missing dist-present Present.html — run npm run build:present first')
    process.exit(1)
  }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1')
    let rel = decodeURIComponent(url.pathname)
    if (rel === '/') rel = '/' + path.basename(entry)
    const file = path.join(presentDir, rel.replace(/^\//, ''))
    if (!file.startsWith(presentDir) || !fs.existsSync(file)) {
      res.writeHead(404)
      res.end('missing')
      return
    }
    let body = fs.readFileSync(file)
    if (file.toLowerCase().endsWith('.html')) {
      body = Buffer.from(injectDeck(body.toString('utf8')), 'utf8')
    }
    res.writeHead(200, { 'Content-Type': mime(file) })
    res.end(body)
  })

  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const { port } = server.address()
  const url = `http://127.0.0.1:${port}/${path.basename(entry)}`
  console.log('smoke url', url)

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  await page.goto(url, { waitUntil: 'networkidle' })

  const ready = await page.evaluate(() => {
    const presenter = document.querySelector('.presenter')
    const parallax = document.querySelector('.presenter-parallax')
    const snaps = document.querySelectorAll('[data-present-snap]')
    return {
      presenter: !!presenter,
      parallax: !!parallax,
      parallaxLive: parallax?.classList.contains('is-live') ?? false,
      snaps: snaps.length,
      detached: !!document.querySelector('.board-stage.backdrop-detached'),
      scrollTop: presenter?.scrollTop ?? -1,
    }
  })
  console.log('ready', ready)
  if (!ready.presenter || !ready.parallax || !ready.parallaxLive) {
    throw new Error('Presenter/parallax stage missing')
  }
  if (ready.snaps < 2) throw new Error(`Expected snap markers, got ${ready.snaps}`)
  if (!ready.detached) throw new Error('Board backdrop not detached for parallax')

  const before = await page.evaluate(() => {
    const p = document.querySelector('.presenter')
    const layer = document.querySelector('.presenter-parallax')
    return {
      scrollTop: p.scrollTop,
      bgPos: getComputedStyle(layer).backgroundPosition,
    }
  })

  await page.keyboard.press('Space')
  await page.waitForTimeout(700)

  const mid = await page.evaluate(() => {
    const p = document.querySelector('.presenter')
    const layer = document.querySelector('.presenter-parallax')
    return {
      scrollTop: p.scrollTop,
      bgPos: getComputedStyle(layer).backgroundPosition,
    }
  })

  await page.keyboard.press('Space')
  await page.waitForTimeout(900)

  const after = await page.evaluate(() => {
    const p = document.querySelector('.presenter')
    const layer = document.querySelector('.presenter-parallax')
    return {
      scrollTop: p.scrollTop,
      bgPos: getComputedStyle(layer).backgroundPosition,
      max: p.scrollHeight - p.clientHeight,
    }
  })

  console.log('motion', { before, mid, after })

  if (!(mid.scrollTop > before.scrollTop + 40)) {
    throw new Error(`Spatial fly did not advance scroll (${before.scrollTop} → ${mid.scrollTop})`)
  }
  if (!(after.scrollTop > mid.scrollTop + 40)) {
    throw new Error(`Second snap fly stalled (${mid.scrollTop} → ${after.scrollTop})`)
  }
  if (before.bgPos === after.bgPos && after.scrollTop > 100) {
    throw new Error(`Parallax background-position did not drift (${after.bgPos})`)
  }

  // Mouse wheel (line mode) — Windows notch wheels; must drive parallax too.
  await page.evaluate(() => {
    localStorage.setItem('decks-reduce-motion', '0')
  })
  await page.reload({ waitUntil: 'networkidle' })
  const wheelBefore = await page.evaluate(() => {
    const p = document.querySelector('.presenter')
    const layer = document.querySelector('.presenter-parallax')
    return {
      scrollTop: p?.scrollTop ?? 0,
      bgPos: layer ? getComputedStyle(layer).backgroundPosition : '',
    }
  })
  await page.locator('.presenter').click({ position: { x: 40, y: 40 } })
  await page.mouse.wheel(0, 480)
  // Also dispatch a line-mode wheel like a classic mouse notch.
  await page.evaluate(() => {
    const el = document.querySelector('.presenter')
    el?.dispatchEvent(
      new WheelEvent('wheel', {
        deltaY: 3,
        deltaMode: WheelEvent.DOM_DELTA_LINE,
        bubbles: true,
        cancelable: true,
      }),
    )
  })
  await page.waitForTimeout(80)
  const wheelAfter = await page.evaluate(() => {
    const p = document.querySelector('.presenter')
    const layer = document.querySelector('.presenter-parallax')
    return {
      scrollTop: p?.scrollTop ?? 0,
      bgPos: layer ? getComputedStyle(layer).backgroundPosition : '',
      live: layer?.classList.contains('is-live') ?? false,
    }
  })
  console.log('mouseWheel', { wheelBefore, wheelAfter })
  if (!(wheelAfter.scrollTop > wheelBefore.scrollTop + 20)) {
    throw new Error(
      `Mouse wheel did not scroll presenter (${wheelBefore.scrollTop} → ${wheelAfter.scrollTop})`,
    )
  }
  if (wheelAfter.live && wheelBefore.bgPos === wheelAfter.bgPos) {
    throw new Error(`Mouse wheel did not drift parallax (${wheelAfter.bgPos})`)
  }

  // Reduce-motion path: flip pref and reload — fly should still land
  await page.evaluate(() => {
    localStorage.setItem('decks-reduce-motion', '1')
  })
  await page.reload({ waitUntil: 'networkidle' })
  await page.keyboard.press('Space')
  await page.waitForTimeout(100)
  const reduced = await page.evaluate(() => document.querySelector('.presenter')?.scrollTop ?? 0)
  const live = await page.evaluate(() =>
    document.querySelector('.presenter-parallax')?.classList.contains('is-live'),
  )
  console.log('reduceMotion', { reduced, live })
  if (!(reduced > 40)) throw new Error('Reduce-motion snap jump failed')
  if (live) throw new Error('Parallax should be off when reduce motion is on')

  console.log('SMOKE OK')
  await browser.close()
  server.close()
}

main().catch((err) => {
  console.error('SMOKE FAIL', err)
  process.exit(1)
})
