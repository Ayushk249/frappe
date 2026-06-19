export type ConnectionState = 'signed-out' | 'checking' | 'connected' | 'error'

export interface Account {
  userId: string
  tenantId: string
  companyName: string
  email: string
  role: 'owner' | 'admin' | 'member'
}

export interface LoginCredentials {
  apiUrl: string
  email: string
  password: string
}

export interface SignUpCredentials extends LoginCredentials {
  companyName: string
}

export interface ConnectionStatus {
  state: ConnectionState
  apiUrl: string
  account: Account | null
  hasSession: boolean
  error: string | null
}

export interface ConnectionApi {
  getStatus: () => Promise<ConnectionStatus>
  login: (credentials: LoginCredentials) => Promise<ConnectionStatus>
  signup: (credentials: SignUpCredentials) => Promise<ConnectionStatus>
  logout: () => Promise<ConnectionStatus>
  test: () => Promise<ConnectionStatus>
  onStatusChanged: (listener: (status: ConnectionStatus) => void) => () => void
}

export const connectionIpc = {
  getStatus: 'connection:get-status',
  login: 'connection:login',
  signup: 'connection:signup',
  logout: 'connection:logout',
  test: 'connection:test',
  statusChanged: 'connection:status-changed'
} as const
