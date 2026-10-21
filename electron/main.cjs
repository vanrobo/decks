const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  protocol,
  shell,
  Menu,
  nativeTheme,
  nativeImage,
} = require('electron')
const path = require('path')
const fs = require('fs')
const fsp = require('fs/promises')
const crypto = require('crypto')
const JSZip = require('jszip')

/** @type {BrowserWindow | null} */
let mainWindow = null
/** Active project working directory (imports / export target) */
let projectDir = null
/** Pending .core path from OS file association */
let pendingOpenPath = null
/** Open boards: folder basename → absolute path (for scoped core-asset URLs) */
const projectRoots = new Map()

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL)

function registerProjectRoot(dir) {
  if (!dir || typeof dir !== 'string') return null
  const abs = path.normalize(dir)
  const id = path.basename(abs)
  projectRoots.set(id, abs)
  return id
}

/** Per-board asset base so media keeps working with multiple tabs open */
function assetBaseFor(dir) {
  const id = registerProjectRoot(dir)
  if (!id) return 'core-asset://local/'
  return `core-asset://p/${id}/`
}

function projectPayload(dir, manifest, extra = {}) {
  return {
    dir,
    manifest,
    assetBase: assetBaseFor(dir),
    ...extra,
  }
}

function getUserDataProjects() {
  return path.join(app.getPath('userData'), 'projects')
}

function getRecentsPath() {
  return path.join(app.getPath('userData'), 'recents.json')
}

async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true })
}

function iconSearchDirs() {
  const dirs = []
  if (app.isPackaged) {
    dirs.push(process.resourcesPath)
  }
  dirs.push(path.join(__dirname, '..', 'build'))
  return dirs
}

/**
 * Taskbar / window icon follows the *shell* theme (taskbar/Start), not app chrome.
 * Windows can be Dark taskbar + Light apps — shouldUseDarkColors would be wrong there.
 * Dark shell → white CORE ink (transparent); light shell → black CORE ink (transparent).
 * Never use the plated Explorer icon.ico here — that white disc is for .core files only.
 */
function shellPrefersDark() {
  if (typeof nativeTheme.shouldUseDarkColorsForSystemIntegratedUI === 'boolean') {
    return nativeTheme.shouldUseDarkColorsForSystemIntegratedUI
  }
  return nativeTheme.shouldUseDarkColors
}

function resolveThemeIcon() {
  const dark = shellPrefersDark()
  // PNG first — Windows taskbar handles transparent PNG setIcon more reliably than our .ico.
  const names = dark
    ? ['icon-dark.png', 'icon-dark.ico']
    : ['icon-light.png', 'icon-light.ico']
  for (const dir of iconSearchDirs()) {
    for (const name of names) {
      const p = path.join(dir, name)
      if (fs.existsSync(p)) return p
    }
  }
  return undefined
}

function applyWindowIcon() {
  const iconPath = resolveThemeIcon()
  if (!iconPath || !mainWindow || mainWindow.isDestroyed()) return
  try {
    const image = nativeImage.createFromPath(iconPath)
    if (image.isEmpty()) return
    mainWindow.setIcon(image)
  } catch {
    /* ignore */
  }
}

function createWindow() {
  const icon = resolveThemeIcon()
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    title: 'DECKS',
    backgroundColor: '#ffffff',
    frame: false,
    titleBarStyle: 'hidden',
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    show: false,
  })

  mainWindow.once('ready-to-show', () => {
    applyWindowIcon()
    mainWindow?.show()
    // Windows often paints the shortcut/.exe icon first; re-assert after show.
    setTimeout(() => applyWindowIcon(), 50)
    setTimeout(() => applyWindowIcon(), 400)
    setTimeout(() => applyWindowIcon(), 1200)
  })

  const sendMaximized = () => {
    mainWindow?.webContents.send('window:maximized', mainWindow.isMaximized())
  }
  mainWindow.on('maximize', sendMaximized)
  mainWindow.on('unmaximize', sendMaximized)

  if (isDev) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  buildMenu()
}

function buildMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New Board',
          accelerator: 'CmdOrCtrl+N',
          click: () => mainWindow?.webContents.send('menu:new'),
        },
        {
          label: 'Open .core…',
          accelerator: 'CmdOrCtrl+O',
          click: () => mainWindow?.webContents.send('menu:open'),
        },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => mainWindow?.webContents.send('menu:save'),
        },
        {
          label: 'Export .core…',
          accelerator: 'CmdOrCtrl+E',
          click: () => mainWindow?.webContents.send('menu:export'),
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Present',
          accelerator: 'F5',
          click: () => mainWindow?.webContents.send('menu:present'),
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { role: 'togglefullscreen' },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setTitle('DECKS')
  }
}

function emptyManifest(title = 'New Board') {
  return {
    format: 'core-deck',
    version: 1,
    title,
    width: 1200,
    background: '#111111',
    gap: 24,
    blocks: [],
    backdrop: { kind: 'solid' },
  }
}

/** Natural / version-aware path sort: 1, 2, 9, 9.5, 10 */
function naturalCompareName(a, b) {
  const ax = []
  const bx = []
  String(a).replace(/(\d+\.?\d*|\D+)/g, (_, tok) => {
    ax.push(/\d/.test(tok) ? parseFloat(tok) : tok.toLowerCase())
    return ''
  })
  String(b).replace(/(\d+\.?\d*|\D+)/g, (_, tok) => {
    bx.push(/\d/.test(tok) ? parseFloat(tok) : tok.toLowerCase())
    return ''
  })
  const n = Math.max(ax.length, bx.length)
  for (let i = 0; i < n; i++) {
    const x = ax[i]
    const y = bx[i]
    if (x === undefined) return -1
    if (y === undefined) return 1
    if (typeof x === 'number' && typeof y === 'number') {
      if (x !== y) return x - y
      continue
    }
    const xs = String(x)
    const ys = String(y)
    if (xs !== ys) return xs < ys ? -1 : 1
  }
  return 0
}

async function writeManifest(dir, manifest) {
  await fsp.writeFile(
    path.join(dir, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf8',
  )
}

async function readManifest(dir) {
  const raw = await fsp.readFile(path.join(dir, 'manifest.json'), 'utf8')
  return JSON.parse(raw)
}

async function createNewProject(title = 'New Board') {
  const id = crypto.randomUUID()
  const dir = path.join(getUserDataProjects(), id)
  await ensureDir(path.join(dir, 'assets'))
  const manifest = emptyManifest(title)
  await writeManifest(dir, manifest)
  projectDir = dir
  registerProjectRoot(dir)
  await addRecent({ id, title, path: dir, kind: 'project' })
  return { dir, manifest }
}

async function loadProject(dir) {
  const manifest = await readManifest(dir)
  projectDir = dir
  registerProjectRoot(dir)
  await addRecent({
    id: path.basename(dir),
    title: manifest.title || 'Untitled',
    path: dir,
    kind: 'project',
  })
  return { dir, manifest }
}

async function unpackCoreFile(corePath) {
  const buf = await fsp.readFile(corePath)
  const zip = await JSZip.loadAsync(buf)
  const id = crypto.randomUUID()
  const dir = path.join(getUserDataProjects(), id)
  await ensureDir(path.join(dir, 'assets'))

  const entries = Object.keys(zip.files)
  for (const name of entries) {
    const entry = zip.files[name]
    if (entry.dir) continue
    // Standalone player is for Extract All + browser; keep edit projects clean.
    const base = path.basename(name)
    if (isPresentHtmlName(base)) continue
    const dest = path.join(dir, name)
    await ensureDir(path.dirname(dest))
    const data = await entry.async('nodebuffer')
    await fsp.writeFile(dest, data)
  }

  if (!fs.existsSync(path.join(dir, 'manifest.json'))) {
    throw new Error('Invalid .core file: missing manifest.json')
  }

  const manifest = await readManifest(dir)
  projectDir = dir
  registerProjectRoot(dir)
  await addRecent({
    id,
    title: manifest.title || path.basename(corePath, '.core'),
    path: dir,
    corePath,
    kind: 'core',
  })
  return { dir, manifest, sourcePath: corePath }
}

/** Skip when re-packing a project that was opened from a .core (standalone player). */
function isPresentHtmlName(name) {
  return /^present\.html$/i.test(name)
}

function getPresentTemplatePath() {
  const packaged = path.join(app.getAppPath(), 'dist-present', 'present.html')
  if (fs.existsSync(packaged)) return packaged
  const dev = path.join(__dirname, '..', 'dist-present', 'present.html')
  if (fs.existsSync(dev)) return dev
  return null
}

/**
 * Build Present.html with manifest inlined for file:// after Extract All.
 * Marker must match present.html source / dist-present build.
 */
async function buildPresentHtml(manifest) {
  const templatePath = getPresentTemplatePath()
  if (!templatePath) {
    throw new Error(
      'Present.html template missing. Run npm run build (or build:present) first.',
    )
  }
  const html = await fsp.readFile(templatePath, 'utf8')
  const marker = /\/\*__CORE_DECK__\*\/[\s\S]*?\/\*__\/CORE_DECK__\*\//
  if (!marker.test(html)) {
    throw new Error('Present.html template missing __CORE_DECK__ placeholder')
  }
  // Escape < so </script> in strings cannot break out of the inline script.
  const payload = JSON.stringify(manifest).replace(/</g, '\\u003c')
  return html.replace(marker, `/*__CORE_DECK__*/${payload}/*__/CORE_DECK__*/`)
}

/** Asset paths referenced by the deck (blocks + backdrop). Normalized `assets/…`. */
function referencedAssetRels(manifest) {
  const refs = new Set()
  const add = (src) => {
    if (!src || typeof src !== 'string') return
    const clean = src.replace(/^\/+/, '').replace(/\\/g, '/')
    if (clean.startsWith('assets/')) refs.add(clean)
  }
  for (const b of manifest.blocks || []) {
    if (b && b.type === 'image' && b.src) add(b.src)
  }
  if (manifest.backdrop?.imageSrc) add(manifest.backdrop.imageSrc)
  return refs
}

function sanitizeFolderName(name) {
  const cleaned = String(name || 'deck')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '')
  return cleaned || 'deck'
}

/**
 * Copy board media into a folder as 1.ext, 2.ext, … in block order
 * so Behance drag-and-drop keeps the deck sequence.
 */
async function exportBehanceFolder(dir, destDir, onProgress) {
  const report = (pct, phase) => {
    if (typeof onProgress === 'function') onProgress(pct, phase)
  }
  report(4, 'collect')
  const manifest = await readManifest(dir)
  const media = (manifest.blocks || []).filter(
    (b) => b && b.type === 'image' && typeof b.src === 'string' && b.src,
  )
  if (!media.length) throw new Error('No media on this board to export')

  await ensureDir(destDir)
  // Drop prior numbered frames so a shorter re-export doesn't leave leftovers.
  try {
    const existing = await fsp.readdir(destDir)
    await Promise.all(
      existing
        .filter((name) => /^\d+\.[^.]+$/i.test(name))
        .map((name) => fsp.unlink(path.join(destDir, name)).catch(() => {})),
    )
  } catch {
    /* fresh folder */
  }
  const total = media.length
  for (let i = 0; i < total; i++) {
    const block = media[i]
    const rel = block.src.replace(/^\/+/, '').replace(/\\/g, '/')
    const abs = path.join(dir, ...rel.split('/'))
    if (!fs.existsSync(abs)) {
      throw new Error(`Missing asset for frame ${i + 1}: ${path.basename(rel)}`)
    }
    const ext = path.extname(abs).toLowerCase() || '.png'
    const destName = `${i + 1}${ext}`
    await fsp.copyFile(abs, path.join(destDir, destName))
    const pct = 8 + Math.round(((i + 1) / total) * 86)
    report(Math.min(94, pct), 'copy')
  }
  report(100, 'done')
  return destDir
}

async function packCoreFile(dir, destPath, onProgress) {
  const report = (pct, phase) => {
    if (typeof onProgress === 'function') onProgress(pct, phase)
  }
  report(4, 'collect')
  const manifest = await readManifest(dir)
  const assetRefs = referencedAssetRels(manifest)
  const zip = new JSZip()
  async function addDir(relBase, absBase) {
    const items = await fsp.readdir(absBase, { withFileTypes: true })
    for (const item of items) {
      if (!relBase && isPresentHtmlName(item.name)) continue
      const abs = path.join(absBase, item.name)
      const rel = path.join(relBase, item.name).replace(/\\/g, '/')
      if (item.isDirectory()) {
        // Only pack used media — orphan UUID copies from double-drop stay out of .core
        if (rel === 'assets') {
          for (const ref of assetRefs) {
            const assetAbs = path.join(dir, ...ref.split('/'))
            if (!fs.existsSync(assetAbs)) continue
            zip.file(ref, await fsp.readFile(assetAbs))
          }
          continue
        }
        await addDir(rel, abs)
      } else {
        const data = await fsp.readFile(abs)
        zip.file(rel, data)
      }
    }
  }
  await addDir('', dir)
  report(14, 'present')
  const presentHtml = await buildPresentHtml(manifest)
  zip.file('Present.html', presentHtml)
  report(18, 'compress')
  const out = await zip.generateAsync(
    { type: 'nodebuffer', compression: 'DEFLATE' },
    (meta) => {
      const pct = 18 + Math.round((meta.percent || 0) * 0.72)
      report(Math.min(90, pct), 'compress')
    },
  )
  report(94, 'write')
  await fsp.writeFile(destPath, out)
  report(100, 'done')
  return destPath
}

async function copyAssetIntoProject(sourcePath) {
  if (!projectDir) throw new Error('No project open')
  const ext = path.extname(sourcePath).toLowerCase()
  const name = `${crypto.randomUUID()}${ext}`
  const destRel = `assets/${name}`
  const destAbs = path.join(projectDir, destRel)
  await ensureDir(path.dirname(destAbs))
  await fsp.copyFile(sourcePath, destAbs)
  return {
    src: destRel.replace(/\\/g, '/'),
    originalName: path.basename(sourcePath),
  }
}

async function saveBufferAsset(buffer, ext, originalName) {
  if (!projectDir) throw new Error('No project open')
  const name = `${crypto.randomUUID()}${ext.startsWith('.') ? ext : `.${ext}`}`
  const destRel = `assets/${name}`
  const destAbs = path.join(projectDir, destRel)
  await ensureDir(path.dirname(destAbs))
  const data = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
  await fsp.writeFile(destAbs, data)
  return {
    src: destRel.replace(/\\/g, '/'),
    originalName: originalName || name,
  }
}

async function readRecents() {
  try {
    const raw = await fsp.readFile(getRecentsPath(), 'utf8')
    return JSON.parse(raw)
  } catch {
    return []
  }
}

async function writeRecents(list) {
  await ensureDir(path.dirname(getRecentsPath()))
  await fsp.writeFile(getRecentsPath(), JSON.stringify(list, null, 2), 'utf8')
}

async function addRecent(entry) {
  const list = await readRecents()
  const next = [
    { ...entry, openedAt: Date.now() },
    ...list.filter((r) => r.path !== entry.path),
  ].slice(0, 12)
  await writeRecents(next)
}

async function listAllProjects() {
  const root = getUserDataProjects()
  await ensureDir(root)
  const entries = await fsp.readdir(root, { withFileTypes: true })
  const projects = []
  for (const ent of entries) {
    if (!ent.isDirectory()) continue
    const dir = path.join(root, ent.name)
    const manifestPath = path.join(dir, 'manifest.json')
    if (!fs.existsSync(manifestPath)) continue
    try {
      const manifest = await readManifest(dir)
      const stat = await fsp.stat(manifestPath)
      projects.push({
        id: ent.name,
        title: manifest.title || 'Untitled',
        path: dir,
        kind: 'project',
        openedAt: stat.mtimeMs,
      })
    } catch {
      /* skip corrupt */
    }
  }
  const recents = await readRecents()
  const openedAtByPath = new Map(
    recents.filter((r) => r.path).map((r) => [path.normalize(r.path), r.openedAt]),
  )
  for (const p of projects) {
    const fromRecent = openedAtByPath.get(path.normalize(p.path))
    if (typeof fromRecent === 'number') p.openedAt = fromRecent
  }
  projects.sort((a, b) => {
    const ta = a.title.toLowerCase()
    const tb = b.title.toLowerCase()
    if (ta !== tb) return ta < tb ? -1 : 1
    return (b.openedAt || 0) - (a.openedAt || 0)
  })
  return projects
}

async function renameProject(dir, title) {
  if (!dir || typeof dir !== 'string' || !fs.existsSync(dir)) {
    throw new Error('Project folder missing')
  }
  const nextTitle = String(title || '').trim() || 'Untitled'
  const manifest = await readManifest(dir)
  manifest.title = nextTitle
  await writeManifest(dir, manifest)
  const list = await readRecents()
  const norm = path.normalize(dir)
  let found = false
  const next = list.map((r) => {
    if (path.normalize(r.path) !== norm) return r
    found = true
    return { ...r, title: nextTitle }
  })
  if (found) await writeRecents(next)
  return {
    id: path.basename(dir),
    title: nextTitle,
    path: dir,
    kind: 'project',
  }
}

async function deleteProject(dir) {
  if (!dir || typeof dir !== 'string') throw new Error('No project path')
  const abs = path.normalize(dir)
  const root = path.normalize(getUserDataProjects())
  const rel = path.relative(root, abs)
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('Refusing to delete outside projects folder')
  }
  if (fs.existsSync(abs)) {
    await fsp.rm(abs, { recursive: true, force: true })
  }
  const list = await readRecents()
  await writeRecents(list.filter((r) => path.normalize(r.path) !== abs))
  const id = path.basename(abs)
  projectRoots.delete(id)
  if (projectDir && path.normalize(projectDir) === abs) {
    projectDir = null
  }
  return true
}

async function removeRecent(dir) {
  if (!dir || typeof dir !== 'string') return false
  const abs = path.normalize(dir)
  const list = await readRecents()
  const next = list.filter((r) => path.normalize(r.path) !== abs)
  await writeRecents(next)
  return true
}

function registerProtocols() {
  protocol.registerFileProtocol('core-asset', (request, callback) => {
    try {
      const url = new URL(request.url)
      let root = null
      let rel = decodeURIComponent(url.pathname || '').replace(/^\/+/, '')

      // Preferred: core-asset://p/<projectId>/assets/foo.mp4
      if (url.hostname === 'p') {
        const parts = rel.split('/').filter(Boolean)
        const id = parts.shift()
        root = id ? projectRoots.get(id) : null
        rel = parts.join('/')
      } else if (url.hostname === 'local' || !url.hostname) {
        // Legacy: core-asset://local/assets/foo.mp4 → active projectDir
        root = projectDir
      } else if (projectRoots.has(url.hostname)) {
        root = projectRoots.get(url.hostname)
      } else {
        // Very old: core-asset://assets/foo.png (host as first segment)
        root = projectDir
        rel = path.join(url.hostname, rel)
      }

      if (!root) {
        callback({ error: -6 })
        return
      }
      const rootNorm = path.normalize(root)
      const abs = path.normalize(path.join(rootNorm, rel))
      const outside = path.relative(rootNorm, abs).startsWith('..') || path.isAbsolute(path.relative(rootNorm, abs))
      if (outside) {
        callback({ error: -10 })
        return
      }
      callback({ path: abs })
    } catch {
      callback({ error: -2 })
    }
  })
}

function assetUrl(relPath, dir = projectDir) {
  const clean = relPath.replace(/^\/+/, '').replace(/\\/g, '/')
  if (dir) return `${assetBaseFor(dir)}${clean}`
  return `core-asset://local/${clean}`
}

function registerIpc() {
  ipcMain.handle('app:getPath', (_e, name) => app.getPath(name))

  ipcMain.handle('project:new', async (_e, title) => {
    const result = await createNewProject(title || 'New Board')
    return projectPayload(result.dir, result.manifest)
  })

  ipcMain.handle('project:getState', async () => {
    if (!projectDir) return null
    const manifest = await readManifest(projectDir)
    return projectPayload(projectDir, manifest)
  })

  /** Switch which project folder is active (imports / export). */
  ipcMain.handle('project:activate', async (_e, dir) => {
    if (!dir || typeof dir !== 'string' || !fs.existsSync(dir)) {
      throw new Error('Project folder missing')
    }
    projectDir = dir
    registerProjectRoot(dir)
    const manifest = await readManifest(dir)
    return projectPayload(dir, manifest)
  })

  ipcMain.handle('project:saveManifest', async (_e, manifest, dir) => {
    const target = typeof dir === 'string' && dir ? dir : projectDir
    if (!target) throw new Error('No project open')
    registerProjectRoot(target)
    // Keep active dir aligned when saving the board you're on
    if (
      !projectDir ||
      path.normalize(projectDir) === path.normalize(target)
    ) {
      projectDir = target
    }
    await writeManifest(target, manifest)
    await addRecent({
      id: path.basename(target),
      title: manifest.title || 'Board',
      path: target,
      kind: 'project',
    })
    return true
  })

  ipcMain.handle('project:importMedia', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Add media from Figma export',
      properties: ['openFile', 'multiSelections'],
      filters: [
        {
          name: 'Media',
          extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'mp4', 'webm', 'mov'],
        },
      ],
    })
    if (canceled || !filePaths.length) return []
    const sorted = [...filePaths].sort((a, b) =>
      naturalCompareName(path.basename(a), path.basename(b)),
    )
    const results = []
    for (const fp of sorted) {
      const copied = await copyAssetIntoProject(fp)
      const ext = path.extname(fp).toLowerCase()
      const kind = ['.mp4', '.webm', '.mov'].includes(ext) ? 'video' : 'image'
      results.push({
        src: copied.src,
        kind,
        url: assetUrl(copied.src),
        name: copied.originalName,
      })
    }
    return results
  })

  ipcMain.handle('project:importDropped', async (_e, files) => {
    // files: [{ name, buffer (ArrayBuffer|Uint8Array|number[]), ext }]
    const results = []
    for (const file of files || []) {
      const ext = file.ext || path.extname(file.name || '').toLowerCase() || '.png'
      let buf = file.buffer
      if (buf instanceof ArrayBuffer) buf = Buffer.from(buf)
      else if (ArrayBuffer.isView(buf)) buf = Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength)
      else if (Array.isArray(buf)) buf = Buffer.from(buf)
      else buf = Buffer.from(buf)
      const copied = await saveBufferAsset(buf, ext, file.name)
      const kind = ['.mp4', '.webm', '.mov'].includes(ext.toLowerCase()) ? 'video' : 'image'
      results.push({
        src: copied.src,
        kind,
        url: assetUrl(copied.src),
        name: copied.originalName,
      })
    }
    return results
  })

  ipcMain.handle('project:openCore', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Open Core deck',
      properties: ['openFile'],
      filters: [{ name: 'Core Deck', extensions: ['core'] }],
    })
    if (canceled || !filePaths[0]) return null
    const result = await unpackCoreFile(filePaths[0])
    return projectPayload(result.dir, result.manifest, {
      sourcePath: result.sourcePath,
    })
  })

  ipcMain.handle('project:openCorePath', async (_e, corePath) => {
    if (!corePath || !fs.existsSync(corePath)) return null
    const result = await unpackCoreFile(corePath)
    return projectPayload(result.dir, result.manifest, {
      sourcePath: result.sourcePath,
    })
  })

  ipcMain.handle('project:exportCorePick', async (_e, suggestedName) => {
    if (!projectDir) throw new Error('No project open')
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Export .core',
      defaultPath: `${suggestedName || 'deck'}.core`,
      filters: [{ name: 'Core Deck', extensions: ['core'] }],
    })
    if (canceled || !filePath) return null
    return filePath.endsWith('.core') ? filePath : `${filePath}.core`
  })

  ipcMain.handle('project:exportCoreWrite', async (e, destPath) => {
    if (!projectDir) throw new Error('No project open')
    if (!destPath || typeof destPath !== 'string') throw new Error('No export path')
    const dest = destPath.endsWith('.core') ? destPath : `${destPath}.core`
    const wc = e.sender
    await packCoreFile(projectDir, dest, (pct, phase) => {
      try {
        wc.send('export:progress', { percent: pct, phase })
      } catch {
        /* window gone */
      }
    })
    return dest
  })

  /** Full pick+write (menu / older callers) */
  ipcMain.handle('project:exportCore', async (e, suggestedName) => {
    if (!projectDir) throw new Error('No project open')
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Export .core',
      defaultPath: `${suggestedName || 'deck'}.core`,
      filters: [{ name: 'Core Deck', extensions: ['core'] }],
    })
    if (canceled || !filePath) return null
    const dest = filePath.endsWith('.core') ? filePath : `${filePath}.core`
    const wc = e.sender
    await packCoreFile(projectDir, dest, (pct, phase) => {
      try {
        wc.send('export:progress', { percent: pct, phase })
      } catch {
        /* window gone */
      }
    })
    return dest
  })

  ipcMain.handle('project:exportBehancePick', async (_e, suggestedName) => {
    if (!projectDir) throw new Error('No project open')
    const base = sanitizeFolderName(suggestedName || 'deck')
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Export for Behance',
      defaultPath: path.join(app.getPath('documents'), base),
      buttonLabel: 'Export folder',
      properties: ['createDirectory', 'showOverwriteConfirmation'],
    })
    if (canceled || !filePath) return null
    return filePath
  })

  ipcMain.handle('project:exportBehanceWrite', async (e, destDir) => {
    if (!projectDir) throw new Error('No project open')
    if (!destDir || typeof destDir !== 'string') throw new Error('No export folder')
    const wc = e.sender
    const dest = await exportBehanceFolder(projectDir, destDir, (pct, phase) => {
      try {
        wc.send('export:progress', { percent: pct, phase })
      } catch {
        /* window gone */
      }
    })
    try {
      await shell.openPath(dest)
    } catch {
      /* ignore */
    }
    return dest
  })

  ipcMain.handle('project:listRecents', async () => {
    const list = await readRecents()
    return list.filter((r) => fs.existsSync(r.path))
  })

  ipcMain.handle('project:listProjects', async () => listAllProjects())

  /** Lightweight peek for library preview — does not set active project. */
  ipcMain.handle('project:peek', async (_e, dir) => {
    if (!dir || typeof dir !== 'string' || !fs.existsSync(dir)) return null
    try {
      const manifest = await readManifest(dir)
      registerProjectRoot(dir)
      const media = (manifest.blocks || []).find((b) => b && b.type === 'image')
      return {
        path: path.normalize(dir),
        title: manifest.title || 'Untitled',
        background: manifest.background || '#111111',
        previewUrl: media?.src ? assetUrl(media.src, dir) : null,
        previewKind: media?.kind || null,
        previewName: media?.name || null,
        rotate: typeof media?.rotate === 'number' ? media.rotate : 0,
        blockCount: Array.isArray(manifest.blocks) ? manifest.blocks.length : 0,
      }
    } catch {
      return null
    }
  })

  ipcMain.handle('project:rename', async (_e, dir, title) => renameProject(dir, title))

  ipcMain.handle('project:delete', async (_e, dir) => deleteProject(dir))

  ipcMain.handle('project:removeRecent', async (_e, dir) => removeRecent(dir))

  ipcMain.handle('project:openRecent', async (_e, dir) => {
    if (!dir || !fs.existsSync(dir)) return null
    const result = await loadProject(dir)
    return projectPayload(result.dir, result.manifest)
  })

  ipcMain.handle('project:assetUrl', (_e, rel) => assetUrl(rel, projectDir))

  ipcMain.handle('shell:openExternal', (_e, url) => {
    if (typeof url !== 'string') return
    const u = url.trim()
    if (!u || u === 'https://' || u === 'http://') return
    if (!/^https?:\/\/.+/i.test(u)) return
    return shell.openExternal(u)
  })

  ipcMain.handle('window:setFullscreen', (_e, flag) => {
    if (mainWindow) mainWindow.setFullScreen(Boolean(flag))
    return mainWindow?.isFullScreen() ?? false
  })

  ipcMain.handle('window:isFullscreen', () => mainWindow?.isFullScreen() ?? false)

  ipcMain.handle('window:minimize', () => {
    mainWindow?.minimize()
  })

  ipcMain.handle('window:maximizeToggle', () => {
    if (!mainWindow) return false
    if (mainWindow.isMaximized()) mainWindow.unmaximize()
    else mainWindow.maximize()
    return mainWindow.isMaximized()
  })

  ipcMain.handle('window:close', () => {
    mainWindow?.close()
  })

  ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() ?? false)

  ipcMain.handle('dialog:showError', async (_e, title, message) => {
    await dialog.showMessageBox(mainWindow, {
      type: 'error',
      title: title || 'Error',
      message: message || 'Something went wrong',
    })
  })
}

function takeOpenPathFromArgv(argv) {
  const candidate = argv.find(
    (a) => typeof a === 'string' && a.toLowerCase().endsWith('.core') && fs.existsSync(a),
  )
  return candidate || null
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    const openPath = takeOpenPathFromArgv(argv)
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
      if (openPath) {
        mainWindow.webContents.send('app:open-file', openPath)
      }
    } else if (openPath) {
      pendingOpenPath = openPath
    }
  })

  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'core-asset',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        bypassCSP: true,
        corsEnabled: true,
      },
    },
  ])

  app.whenReady().then(async () => {
    // Taskbar grouping id. Use a .dev id while unpackaged so an installed DECKS
    // Start-menu shortcut (plated icon.ico) cannot hijack the running window icon.
    if (process.platform === 'win32') {
      app.setAppUserModelId(
        app.isPackaged ? 'club.core.pitchdeck' : 'club.core.pitchdeck.dev',
      )
    }
    await ensureDir(getUserDataProjects())
    registerProtocols()
    registerIpc()
    pendingOpenPath = takeOpenPathFromArgv(process.argv)
    createWindow()
    applyWindowIcon()
    nativeTheme.on('updated', () => applyWindowIcon())

    mainWindow?.webContents.on('did-finish-load', () => {
      if (pendingOpenPath) {
        mainWindow?.webContents.send('app:open-file', pendingOpenPath)
        pendingOpenPath = null
      }
    })

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('open-file', (event, filePath) => {
    event.preventDefault()
    if (mainWindow) {
      mainWindow.webContents.send('app:open-file', filePath)
    } else {
      pendingOpenPath = filePath
    }
  })
}
