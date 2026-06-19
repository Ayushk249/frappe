import { BrowserWindow, ipcMain } from 'electron'
import {
  connectionIpc,
  type ConnectionSettings,
  type ConnectionStatus
} from '../../shared/connection'
import { ConnectionSettingsStore } from './ConnectionSettingsStore'
import { WorkTraceApiClient } from './WorkTraceApiClient'

export function registerConnectionIpc(
  settings: ConnectionSettingsStore,
  apiClient: WorkTraceApiClient
): void {
  const broadcast = (status: ConnectionStatus) => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(connectionIpc.statusChanged, status)
    }
    return status
  }

  ipcMain.handle(connectionIpc.getStatus, () => settings.getStatus())
  ipcMain.handle(connectionIpc.save, async (_event, payload: ConnectionSettings) => {
    await settings.save(payload)
    return broadcast(await apiClient.testConnection())
  })
  ipcMain.handle(connectionIpc.test, async () => broadcast(await apiClient.testConnection()))
}
