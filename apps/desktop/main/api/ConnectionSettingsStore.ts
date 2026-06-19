import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { safeStorage } from 'electron'
import type { ConnectionSettings, ConnectionStatus } from '../../shared/connection'

interface StoredConnectionSettings {
  apiUrl: string
  tenantId: string
  encryptedApiToken: string
}

export interface ResolvedConnectionSettings {
  apiUrl: string
  tenantId: string
  apiToken: string
}

const defaultApiUrl = process.env['WORKTRACE_API_URL'] ?? 'http://127.0.0.1:8000'
const defaultTenantId = process.env['WORKTRACE_TENANT_ID'] ?? ''
const environmentApiToken = process.env['WORKTRACE_API_TOKEN'] ?? ''

export class ConnectionSettingsStore {
  private status: ConnectionStatus = {
    state: 'not-configured',
    apiUrl: defaultApiUrl,
    tenantId: defaultTenantId,
    hasApiToken: Boolean(environmentApiToken),
    error: null
  }

  constructor(private readonly settingsPath: string) {}

  async initialize(): Promise<ConnectionStatus> {
    this.status = this.toStatus(await this.readStoredSettings())
    return this.getStatus()
  }

  getStatus(): ConnectionStatus {
    return { ...this.status }
  }

  async save(settings: ConnectionSettings): Promise<ConnectionStatus> {
    const apiUrl = normalizeApiUrl(settings.apiUrl)
    const tenantId = normalizeTenantId(settings.tenantId)
    const existing = await this.readStoredSettings()
    const apiToken = settings.apiToken?.trim() || this.decryptToken(existing.encryptedApiToken)

    if (!apiToken) {
      throw new Error('API token is required.')
    }
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Secure credential storage is not available on this device.')
    }

    const stored: StoredConnectionSettings = {
      apiUrl,
      tenantId,
      encryptedApiToken: safeStorage.encryptString(apiToken).toString('base64')
    }
    await mkdir(dirname(this.settingsPath), { recursive: true })
    const temporaryPath = `${this.settingsPath}.tmp`
    await writeFile(temporaryPath, `${JSON.stringify(stored, null, 2)}\n`, { mode: 0o600 })
    await rename(temporaryPath, this.settingsPath)
    this.status = this.toStatus(stored)
    return this.getStatus()
  }

  async resolve(): Promise<ResolvedConnectionSettings> {
    const stored = await this.readStoredSettings()
    const apiToken = this.decryptToken(stored.encryptedApiToken)
    if (!stored.tenantId || !apiToken) {
      throw new Error('Connect this app to a WorkTrace workspace in Settings first.')
    }
    return {
      apiUrl: normalizeApiUrl(stored.apiUrl),
      tenantId: normalizeTenantId(stored.tenantId),
      apiToken
    }
  }

  setChecking(): ConnectionStatus {
    this.status = { ...this.status, state: 'checking', error: null }
    return this.getStatus()
  }

  setConnected(): ConnectionStatus {
    this.status = { ...this.status, state: 'connected', error: null }
    return this.getStatus()
  }

  setError(error: unknown): ConnectionStatus {
    this.status = {
      ...this.status,
      state: 'error',
      error: error instanceof Error ? error.message : 'Could not connect to the WorkTrace API.'
    }
    return this.getStatus()
  }

  private async readStoredSettings(): Promise<StoredConnectionSettings> {
    try {
      const stored = JSON.parse(await readFile(this.settingsPath, 'utf8')) as Partial<
        StoredConnectionSettings
      >
      return {
        apiUrl: stored.apiUrl || defaultApiUrl,
        tenantId: stored.tenantId || defaultTenantId,
        encryptedApiToken: stored.encryptedApiToken || ''
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw new Error('Saved WorkTrace connection settings are invalid.')
      }
      return {
        apiUrl: defaultApiUrl,
        tenantId: defaultTenantId,
        encryptedApiToken: ''
      }
    }
  }

  private decryptToken(encryptedApiToken: string): string {
    if (!encryptedApiToken) {
      return environmentApiToken
    }
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Secure credential storage is not available on this device.')
    }
    try {
      return safeStorage.decryptString(Buffer.from(encryptedApiToken, 'base64'))
    } catch {
      throw new Error('The saved API token could not be decrypted.')
    }
  }

  private toStatus(settings: StoredConnectionSettings): ConnectionStatus {
    return {
      state: 'not-configured',
      apiUrl: settings.apiUrl,
      tenantId: settings.tenantId,
      hasApiToken: Boolean(settings.encryptedApiToken || environmentApiToken),
      error: null
    }
  }
}

export function connectionSettingsPath(userDataPath: string): string {
  return join(userDataPath, 'connection.json')
}

function normalizeApiUrl(value: string): string {
  const url = new URL(value.trim())
  if (
    url.protocol !== 'https:' &&
    !(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '::1'].includes(url.hostname))
  ) {
    throw new Error('Use HTTPS for remote APIs. HTTP is allowed only for localhost.')
  }
  return url.toString().replace(/\/$/, '')
}

function normalizeTenantId(value: string): string {
  const tenantId = value.trim().toLowerCase()
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      tenantId
    )
  ) {
    throw new Error('Tenant ID must be a valid UUID.')
  }
  return tenantId
}
