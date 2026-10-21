const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('core', {
  isElectron: true,

  newProject: (title) => ipcRenderer.invoke('project:new', title),
  getState: () => ipcRenderer.invoke('project:getState'),
  activateProject: (dir) => ipcRenderer.invoke('project:activate', dir),
  saveManifest: (manifest, dir) => ipcRenderer.invoke('project:saveManifest', manifest, dir),
  importMedia: () => ipcRenderer.invoke('project:importMedia'),
  importDropped: (files) => ipcRenderer.invoke('project:importDropped', files),
  openCore: () => ipcRenderer.invoke('project:openCore'),
  openCorePath: (p) => ipcRenderer.invoke('project:openCorePath', p),
  exportCore: (name) => ipcRenderer.invoke('project:exportCore', name),
  exportCorePick: (name) => ipcRenderer.invoke('project:exportCorePick', name),
  exportCoreWrite: (destPath) => ipcRenderer.invoke('project:exportCoreWrite', destPath),
  exportBehancePick: (name) => ipcRenderer.invoke('project:exportBehancePick', name),
  exportBehanceWrite: (destDir) => ipcRenderer.invoke('project:exportBehanceWrite', destDir),
  listRecents: () => ipcRenderer.invoke('project:listRecents'),
  listProjects: () => ipcRenderer.invoke('project:listProjects'),
  peekProject: (dir) => ipcRenderer.invoke('project:peek', dir),
  renameProject: (dir, title) => ipcRenderer.invoke('project:rename', dir, title),
  deleteProject: (dir) => ipcRenderer.invoke('project:delete', dir),
  removeRecent: (dir) => ipcRenderer.invoke('project:removeRecent', dir),
  openRecent: (dir) => ipcRenderer.invoke('project:openRecent', dir),
  assetUrl: (rel) => ipcRenderer.invoke('project:assetUrl', rel),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  setFullscreen: (flag) => ipcRenderer.invoke('window:setFullscreen', flag),
  isFullscreen: () => ipcRenderer.invoke('window:isFullscreen'),
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximizeToggle: () => ipcRenderer.invoke('window:maximizeToggle'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  showError: (title, message) => ipcRenderer.invoke('dialog:showError', title, message),

  onExportProgress: (handler) => {
    const listener = (_e, payload) => handler(payload || { percent: 0, phase: '' })
    ipcRenderer.on('export:progress', listener)
    return () => ipcRenderer.removeListener('export:progress', listener)
  },

  onMenu: (channel, handler) => {
    const map = {
      new: 'menu:new',
      open: 'menu:open',
      save: 'menu:save',
      export: 'menu:export',
      present: 'menu:present',
    }
    const event = map[channel]
    if (!event) return () => {}
    const listener = () => handler()
    ipcRenderer.on(event, listener)
    return () => ipcRenderer.removeListener(event, listener)
  },

  onOpenFile: (handler) => {
    const listener = (_e, filePath) => handler(filePath)
    ipcRenderer.on('app:open-file', listener)
    return () => ipcRenderer.removeListener('app:open-file', listener)
  },

  onMaximized: (handler) => {
    const listener = (_e, value) => handler(Boolean(value))
    ipcRenderer.on('window:maximized', listener)
    return () => ipcRenderer.removeListener('window:maximized', listener)
  },
})
