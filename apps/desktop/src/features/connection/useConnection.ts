import { useCallback, useEffect, useState } from 'react'
import type {
  ConnectionStatus,
  LoginCredentials,
  SignUpCredentials
} from '../../../shared/connection'

const initialStatus: ConnectionStatus = {
  state: 'checking',
  apiUrl: 'http://127.0.0.1:8000',
  account: null,
  hasSession: false,
  error: null
}

export function useConnection() {
  const [status, setStatus] = useState(initialStatus)

  useEffect(() => {
    void window.api.connection.getStatus().then(setStatus)
    return window.api.connection.onStatusChanged(setStatus)
  }, [])

  const login = useCallback(async (credentials: LoginCredentials) => {
    const nextStatus = await window.api.connection.login(credentials)
    setStatus(nextStatus)
    return nextStatus
  }, [])

  const signup = useCallback(async (credentials: SignUpCredentials) => {
    const nextStatus = await window.api.connection.signup(credentials)
    setStatus(nextStatus)
    return nextStatus
  }, [])

  const logout = useCallback(async () => {
    const nextStatus = await window.api.connection.logout()
    setStatus(nextStatus)
    return nextStatus
  }, [])

  const test = useCallback(async () => {
    const nextStatus = await window.api.connection.test()
    setStatus(nextStatus)
    return nextStatus
  }, [])

  return { status, login, signup, logout, test }
}
