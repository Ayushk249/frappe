export type RecordingStatus = 'idle' | 'starting' | 'recording' | 'stopping' | 'error'

export interface RecordingSession {
  id: string
  name: string
  startedAt: string
  captureMode: 'full-desktop'
}

export interface RecordingController {
  start: () => Promise<RecordingSession>
  stop: (sessionId: string) => Promise<void>
}
