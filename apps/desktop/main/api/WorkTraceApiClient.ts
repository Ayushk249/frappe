import type { ConnectionStatus } from '../../shared/connection'
import { ConnectionSettingsStore } from './ConnectionSettingsStore'

export class WorkTraceApiClient {
  constructor(private readonly settings: ConnectionSettingsStore) {}

  async testConnection(): Promise<ConnectionStatus> {
    this.settings.setChecking()
    try {
      await this.request('/sessions?limit=1')
      return this.settings.setConnected()
    } catch (error) {
      return this.settings.setError(error)
    }
  }

  async request(path: string, init: RequestInit = {}): Promise<Response> {
    const connection = await this.settings.resolve()
    const response = await fetch(`${connection.apiUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${connection.apiToken}`,
        'X-Tenant-ID': connection.tenantId,
        ...init.headers
      },
      signal: AbortSignal.timeout(15_000)
    })
    if (!response.ok) {
      let detail = `WorkTrace API returned ${response.status}.`
      try {
        const payload = (await response.json()) as { detail?: string }
        detail = payload.detail || detail
      } catch {
        // Keep the status-based message for non-JSON responses.
      }
      throw new Error(detail)
    }
    return response
  }
}
