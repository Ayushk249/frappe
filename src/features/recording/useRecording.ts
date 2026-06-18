import { useCallback, useState } from 'react'
import type {
  RecordingController,
  RecordingSession,
  RecordingStatus
} from './recording.types'

export function useRecording(controller: RecordingController) {
  const [status, setStatus] = useState<RecordingStatus>('idle')
  const [session, setSession] = useState<RecordingSession | null>(null)
  const [error, setError] = useState<string | null>(null)

  const toggleRecording = useCallback(async () => {
    if (status !== 'idle' && status !== 'recording') {
      return
    }

    setError(null)

    try {
      if (status === 'recording' && session) {
        setStatus('stopping')
        await controller.stop(session.id)
        setSession(null)
        setStatus('idle')
        return
      }

      setStatus('starting')
      const nextSession = await controller.start()
      setSession(nextSession)
      setStatus('recording')
    } catch {
      setError('Recording could not be started. Check capture permissions and try again.')
      setStatus('error')
    }
  }, [controller, session, status])

  const resetError = useCallback(() => {
    setError(null)
    setStatus('idle')
  }, [])

  return {
    error,
    resetError,
    session,
    status,
    toggleRecording
  }
}
