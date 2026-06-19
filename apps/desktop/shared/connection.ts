export type ConnectionState = 'not-configured' | 'checking' | 'connected' | 'error'

export interface ConnectionSettings {
  apiUrl: string
  tenantId: string
  apiToken?: string
}

export interface ConnectionStatus {
  state: ConnectionState
  apiUrl: string
  tenantId: string
  hasApiToken: boolean
  error: string | null
}

export interface ConnectionApi {
  getStatus: () => Promise<ConnectionStatus>
  save: (settings: ConnectionSettings) => Promise<ConnectionStatus>
  test: () => Promise<ConnectionStatus>
  onStatusChanged: (listener: (status: ConnectionStatus) => void) => () => void
}

export const connectionIpc = {
  getStatus: 'connection:get-status',
  save: 'connection:save',
  test: 'connection:test',
  statusChanged: 'connection:status-changed'
} as const
