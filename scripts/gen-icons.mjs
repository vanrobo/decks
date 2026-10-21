/**
 * Rasterize official CORE mark → taskbar / app / .core file icons
 * and NSIS installer bitmaps.
 *
 * - icon-light.png / .ico — black ink, transparent (light OS theme / light taskbar)
 * - icon-dark.png / .ico — white ink, transparent (dark OS theme / dark taskbar)
 * - icon.ico — black ink on a light circular plate (Explorer + installers; one static .ico)
 * - installerSidebar.bmp / uninstallerSidebar.bmp — 164×314 wizard art
 * - installerHeader.bmp — 150×57 assisted-installer header
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import pngToIco from 'png-to-ico'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const buildDir = path.join(root, 'build')
const markPath = path.join(root, 'src', 'assets', 'core-mark.svg')

fs.mkdirSync(buildDir, { recursive: true })

const blackSvg = fs.readFileSync(markPath, 'utf8')
const whiteSvg = blackSvg.replaceAll('#000000', '#ffffff')

/** Soft plate — visible on dark Explorer; not harsh on light. */
const PLATE = '#F3F0EB'
const INK = '#121212'
const SIDEBAR_BG = '#000000'
const HEADER_BG = '#FFFFFF'
const SIZES = [16, 32, 48, 64, 128, 256]

/** NSIS MUI slot sizes (fixed by the wizard — larger sources only get stretched). */
const SIDEBAR_W = 164
const SIDEBAR_H = 314
const HEADER_W = 150
const HEADER_H = 57

async function rasterTransparent(svg, size) {
  // Render oversized then Lanczos-down for cleaner edges than 1× SVG raster.
  const hi = Math.max(size * 4, 256)
  return sharp(Buffer.from(svg))
    .resize(hi, hi, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: sharp.kernel.lanczos3,
    })
    .resize(size, size, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: sharp.kernel.lanczos3,
    })
    .png()
    .toBuffer()
}

/** Mark centered on a filled circle (shell .ico / file association). */
async function rasterOnPlate(svg, size = 256) {
  const inset = Math.round(size * 0.08)
  const markSize = size - inset * 2
  const mark = await sharp(Buffer.from(svg))
    .resize(markSize, markSize, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer()

  const plateSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 1}" fill="${PLATE}"/>
</svg>`

  return sharp(Buffer.from(plateSvg))
    .composite([{ input: mark, top: inset, left: inset }])
    .png()
    .toBuffer()
}

async function writeIco(buffers, outPath) {
  fs.writeFileSync(outPath, await pngToIco(buffers))
}

/**
 * Write a classic Windows BITMAP (24-bit, no compression) for NSIS MUI.
 * Sharp in this project has no BMP encoder, so we pack pixels ourselves.
 */
async function writeBmpFromPng(pngBuffer, outPath, flattenBg = '#000000') {
  const { data, info } = await sharp(pngBuffer)
    .flatten({ background: flattenBg })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const width = info.width
  const height = info.height
  const rowSize = Math.ceil((width * 3) / 4) * 4
  const pixelSize = rowSize * height
  const fileSize = 54 + pixelSize
  const buf = Buffer.alloc(fileSize)

  // BITMAPFILEHEADER
  buf.write('BM', 0)
  buf.writeUInt32LE(fileSize, 2)
  buf.writeUInt32LE(0, 6)
  buf.writeUInt32LE(54, 10)
  // BITMAPINFOHEADER
  buf.writeUInt32LE(40, 14)
  buf.writeInt32LE(width, 18)
  buf.writeInt32LE(height, 22) // bottom-up
  buf.writeUInt16LE(1, 26)
  buf.writeUInt16LE(24, 28)
  buf.writeUInt32LE(0, 30)
  buf.writeUInt32LE(pixelSize, 34)
  buf.writeInt32LE(2835, 38)
  buf.writeInt32LE(2835, 42)
  buf.writeUInt32LE(0, 46)
  buf.writeUInt32LE(0, 50)

  for (let y = 0; y < height; y++) {
    const srcY = height - 1 - y
    const destRow = 54 + y * rowSize
    for (let x = 0; x < width; x++) {
      const si = (srcY * width + x) * 4
      const di = destRow + x * 3
      buf[di] = data[si + 2] // B
      buf[di + 1] = data[si + 1] // G
      buf[di + 2] = data[si] // R
    }
  }

  fs.writeFileSync(outPath, buf)
}

/**
 * Welcome/finish sidebar: pure black + centered CORE mark only.
 * Composed at 4× then downscaled so edges stay cleaner in the tiny NSIS slot.
 */
async function makeSidebarBmp(outPath) {
  const scale = 4
  const width = SIDEBAR_W * scale
  const height = SIDEBAR_H * scale
  const markSize = Math.round(Math.min(width, height) * 0.58)
  const mark = await rasterTransparent(whiteSvg, markSize)

  const base = await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: SIDEBAR_BG,
    },
  })
    .composite([
      {
        input: mark,
        top: Math.round((height - markSize) / 2),
        left: Math.round((width - markSize) / 2),
      },
    ])
    .png()
    .toBuffer()

  const finalPng = await sharp(base)
    .resize(SIDEBAR_W, SIDEBAR_H, { kernel: sharp.kernel.lanczos3 })
    .png()
    .toBuffer()

  await writeBmpFromPng(finalPng, outPath, SIDEBAR_BG)
}

/** Header strip: CORE mark + DECKS wordmark, white, no accent bars. */
async function makeHeaderBmp(outPath) {
  const scale = 4
  const width = HEADER_W * scale
  const height = HEADER_H * scale
  const markSize = Math.round(height * 0.62)
  const padX = Math.round(height * 0.18)
  const mark = await rasterTransparent(blackSvg, markSize)

  const textSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="${HEADER_BG}"/>
  <text
    x="${padX + markSize + Math.round(height * 0.22)}"
    y="${Math.round(height * 0.64)}"
    fill="${INK}"
    font-family="Segoe UI, Arial, sans-serif"
    font-size="${Math.round(height * 0.38)}"
    font-weight="700"
    letter-spacing="${Math.round(height * 0.04)}"
  >DECKS</text>
</svg>`

  const base = await sharp(Buffer.from(textSvg))
    .png()
    .composite([
      {
        input: mark,
        top: Math.round((height - markSize) / 2),
        left: padX,
      },
    ])
    .png()
    .toBuffer()

  const finalPng = await sharp(base)
    .resize(HEADER_W, HEADER_H, { kernel: sharp.kernel.lanczos3 })
    .png()
    .toBuffer()

  await writeBmpFromPng(finalPng, outPath, HEADER_BG)
}

const lightPng = path.join(buildDir, 'icon-light.png')
const darkPng = path.join(buildDir, 'icon-dark.png')
const lightIco = path.join(buildDir, 'icon-light.ico')
const darkIco = path.join(buildDir, 'icon-dark.ico')
const legacyPng = path.join(buildDir, 'core-logo.png')
const icon256 = path.join(buildDir, 'icon-256.png')
const icon1024 = path.join(buildDir, 'icon-1024.png')
const shellPng = path.join(buildDir, 'icon-shell.png')
const icoPath = path.join(buildDir, 'icon.ico')
const sidebarPath = path.join(buildDir, 'installerSidebar.bmp')
const unSidebarPath = path.join(buildDir, 'uninstallerSidebar.bmp')
const headerPath = path.join(buildDir, 'installerHeader.bmp')

const light256 = await rasterTransparent(blackSvg, 256)
const dark256 = await rasterTransparent(whiteSvg, 256)
const dark1024 = await rasterTransparent(whiteSvg, 1024)
await sharp(light256).png().toFile(lightPng)
await sharp(dark256).png().toFile(darkPng)
await sharp(dark1024).png().toFile(icon1024)
await sharp(light256).resize(128, 128).png().toFile(legacyPng)

const lightBufs = []
const darkBufs = []
for (const s of SIZES) {
  lightBufs.push(await rasterTransparent(blackSvg, s))
  darkBufs.push(await rasterTransparent(whiteSvg, s))
}
await writeIco(lightBufs, lightIco)
await writeIco(darkBufs, darkIco)

const shell256 = await rasterOnPlate(blackSvg, 256)
await sharp(shell256).png().toFile(shellPng)
await sharp(shell256).png().toFile(icon256)

const plateBufs = []
for (const s of SIZES) {
  plateBufs.push(await rasterOnPlate(blackSvg, s))
}
await writeIco(plateBufs, icoPath)

await makeSidebarBmp(sidebarPath)
await makeSidebarBmp(unSidebarPath)
await makeHeaderBmp(headerPath)

console.log('Wrote', lightPng, darkPng, lightIco, darkIco, shellPng, icoPath, icon1024)
console.log('Wrote', sidebarPath, unSidebarPath, headerPath)
