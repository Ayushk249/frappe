import { useCallback, useEffect, useState } from 'react'
import type { ConnectionSettings, ConnectionStatus } from '../../../shared/connection'

const initialStatus: ConnectionStatus = {
  state: 'not-configured',
  apiUrl: 'http://127.0.0.1:8000',
  tenantId: '',
  hasApiToken: false,
  error: null
}

export function useConnection() {
  const [status, setStatus] = useState(initialStatus)

  useEffect(() => {
    void window.api.connection.getStatus().then(setStatus)
    return window.api.connection.onStatusChanged(setStatus)
  }, [])

  const save = useCallback(async (settings: ConnectionSettings) => {
    const nextStatus = await window.api.connection.save(settings)
    setStatus(nextStatus)
    return nextStatus
  }, [])

  const test = useCallback(async () => {
    const nextStatus = await window.api.connection.test()
    setStatus(nextStatus)
    return nextStatus
  }, [])

  return { status, save, test }
}
