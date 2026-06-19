import { contextBridge, ipcRenderer } from 'electron'
import {
  connectionIpc,
  type ConnectionSettings,
  type ConnectionStatus
} from '../shared/connection'
import {
  recordingIpc,
  type RecordingOptions,
  type RecordingState
} from '../shared/recording'

// Expose a safe, minimal API to the renderer via contextBridge.
// The renderer can call window.api.getAppVersion() but cannot access
// Node/Electron APIs directly.
contextBridge.exposeInMainWorld('api', {
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getSurajLol: async() => "kuch na",
  getSomeOtherThing: () => "kuch AUR bhi na",
  connection: {
    getStatus: () => ipcRenderer.invoke(connectionIpc.getStatus),
    save: (settings: ConnectionSettings) => ipcRenderer.invoke(connectionIpc.save, settings),
    test: () => ipcRenderer.invoke(connectionIpc.test),
    onStatusChanged: (listener: (status: ConnectionStatus) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, status: ConnectionStatus) =>
        listener(status)
      ipcRenderer.on(connectionIpc.statusChanged, handler)
      return () => ipcRenderer.off(connectionIpc.statusChanged, handler)
    }
  },
  recording: {
    start: (options?: Partial<RecordingOptions>) => ipcRenderer.invoke(recordingIpc.start, options),
    pause: () => ipcRenderer.invoke(recordingIpc.pause),
    resume: () => ipcRenderer.invoke(recordingIpc.resume),
    stop: () => ipcRenderer.invoke(recordingIpc.stop),
    getState: () => ipcRenderer.invoke(recordingIpc.getState),
    openPermissionSettings: (permission: 'accessibility' | 'screen') =>
      ipcRenderer.invoke(recordingIpc.openPermissionSettings, permission),
    onStateChanged: (listener: (state: RecordingState) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, state: RecordingState) => listener(state)
      ipcRenderer.on(recordingIpc.stateChanged, handler)
      return () => ipcRenderer.off(recordingIpc.stateChanged, handler)
    }
  }
})
