import { contextBridge, ipcRenderer } from 'electron'

// Expose a safe, minimal API to the renderer via contextBridge.
// The renderer can call window.api.getAppVersion() but cannot access
// Node/Electron APIs directly.
contextBridge.exposeInMainWorld('api', {
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getSurajLol: async() => "kuch na",
  getSomeOtherThing: () => "kuch AUR bhi na"
})
