import type { RecordingController, RecordingSession } from './recording.types'

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds))

export const demoRecordingController: RecordingController = {
  async start(): Promise<RecordingSession> {
    await wait(450)

    return {
      id: crypto.randomUUID(),
      name: 'Untitled workflow',
      startedAt: new Date().toISOString(),
      captureMode: 'full-desktop'
    }
  },

  async stop(): Promise<void> {
    await wait(300)
  }
}
