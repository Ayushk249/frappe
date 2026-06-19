export type RecordingStatus =
  | 'idle'
  | 'requesting-permissions'
  | 'starting'
  | 'recording'
  | 'paused'
  | 'stopping'
  | 'processing'
  | 'completed'
  | 'error'

export type CaptureMode = 'full-desktop' | 'display'
export type RecordingPlatform = 'darwin' | 'win32' | 'linux'

export interface RecordingOptions {
  name?: string
  captureMode: CaptureMode
  displayId?: string
  sampleIntervalMs: number
  settleDurationMs: number
  maxSettleDurationMs: number
  thumbnailWidth: number
  thumbnailHeight: number
  changeThreshold: number
}

export const defaultRecordingOptions: RecordingOptions = {
  captureMode: 'full-desktop',
  sampleIntervalMs: 250,
  settleDurationMs: 400,
  maxSettleDurationMs: 2500,
  thumbnailWidth: 160,
  thumbnailHeight: 90,
  changeThreshold: 0.018
}

export interface RecordingState {
  status: RecordingStatus
  sessionId: string | null
  sessionName: string | null
  startedAt: string | null
  pausedAt: string | null
  accumulatedPausedMs: number
  eventCount: number
  screenshotCount: number
  outputPath: string | null
  error: string | null
}

export interface RecordingSessionManifest {
  schemaVersion: 1
  id: string
  name: string
  platform: RecordingPlatform
  startedAt: string
  endedAt: string | null
  status: 'recording' | 'paused' | 'completed' | 'interrupted' | 'error'
  options: RecordingOptions
  eventCount: number
  screenshotCount: number
}

export interface RecordedEvent {
  id: string
  sequence: number
  timestamp: string
  type: 'click' | 'key' | 'scroll' | 'app-switch' | 'navigation'
  data: Record<string, string | number | boolean | string[]>
  beforeScreenshotId?: string
  afterScreenshotId?: string
}

export interface ScreenshotRecord {
  id: string
  sequence: number
  capturedAt: string
  eventIds: string[]
  filename: string
  width: number
  height: number
  changeScore: number
  contentHash: string
}

export interface RecordingApi {
  start: (options?: Partial<RecordingOptions>) => Promise<RecordingState>
  pause: () => Promise<RecordingState>
  resume: () => Promise<RecordingState>
  stop: () => Promise<RecordingState>
  getState: () => Promise<RecordingState>
  openPermissionSettings: (permission: 'accessibility' | 'screen') => Promise<void>
  onStateChanged: (listener: (state: RecordingState) => void) => () => void
}

export const recordingIpc = {
  start: 'recording:start',
  pause: 'recording:pause',
  resume: 'recording:resume',
  stop: 'recording:stop',
  getState: 'recording:get-state',
  openPermissionSettings: 'recording:open-permission-settings',
  stateChanged: 'recording:state-changed',
  frameSample: 'recording:frame-sample',
  captureReady: 'recording:capture-ready',
  captureError: 'recording:capture-error'
} as const
