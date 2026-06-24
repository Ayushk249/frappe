import { createHash, randomUUID } from 'node:crypto'
import { BrowserWindow, ipcMain, systemPreferences } from 'electron'
import { join } from 'node:path'
import { recordingIpc, type AudioChunkRecord, type RecordingOptions } from '../../shared/recording'
import { SessionWriter } from './SessionWriter'

interface AudioCaptureCallbacks {
  onAudioChunkSaved: (record: AudioChunkRecord) => void
  onError: (error: Error) => void
}

export class AudioCaptureService {
  private active = false
  private paused = false
  private sequence = 0
  private window: BrowserWindow | null = null
  private callbacks: AudioCaptureCallbacks | null = null
  private readyResolver: (() => void) | null = null
  private stoppedResolver: (() => void) | null = null

  constructor(
    private readonly sessionWriter: SessionWriter,
    private readonly rendererUrl?: string
  ) {
    ipcMain.on(recordingIpc.audioReady, this.handleReady)
    ipcMain.handle(recordingIpc.audioChunk, this.handleChunk)
    ipcMain.on(recordingIpc.audioError, this.handleRendererError)
    ipcMain.on(recordingIpc.audioStopped, this.handleStopped)
  }

  async requestPermission(): Promise<boolean> {
    if (process.platform !== 'darwin') {
      return true
    }

    const current = systemPreferences.getMediaAccessStatus('microphone')
    if (current === 'granted') {
      return true
    }
    if (current === 'denied' || current === 'restricted') {
      return false
    }
    return systemPreferences.askForMediaAccess('microphone')
  }

  async start(options: RecordingOptions, callbacks: AudioCaptureCallbacks): Promise<void> {
    if (!options.recordAudio) {
      return
    }
    if (this.active) {
      throw new Error('Audio capture is already active.')
    }

    if (!(await this.requestPermission())) {
      throw new Error(
        'Microphone permission is required. Enable WorkTrace in System Settings > Privacy & Security > Microphone, then try again.'
      )
    }

    this.callbacks = callbacks
    this.sequence = 0
    this.active = true
    this.paused = false
    await this.ensureWindowReady()
    this.window?.webContents.send(recordingIpc.audioStart, {
      timesliceMs: options.audioTimesliceMs
    })
  }

  pause(): void {
    if (!this.active || this.paused) {
      return
    }
    this.paused = true
    this.window?.webContents.send(recordingIpc.audioPause)
  }

  resume(): void {
    if (!this.active || !this.paused) {
      return
    }
    this.paused = false
    this.window?.webContents.send(recordingIpc.audioResume)
  }

  async stop(): Promise<void> {
    if (!this.active) {
      return
    }

    const stopped = new Promise<void>((resolve) => {
      this.stoppedResolver = resolve
      setTimeout(resolve, 2500)
    })
    this.window?.webContents.send(recordingIpc.audioStop)
    await stopped
    this.active = false
    this.paused = false
    this.callbacks = null
    this.stoppedResolver = null
  }

  destroy(): void {
    ipcMain.off(recordingIpc.audioReady, this.handleReady)
    ipcMain.removeHandler(recordingIpc.audioChunk)
    ipcMain.off(recordingIpc.audioError, this.handleRendererError)
    ipcMain.off(recordingIpc.audioStopped, this.handleStopped)
    this.window?.destroy()
    this.window = null
  }

  private async ensureWindowReady(): Promise<void> {
    if (this.window && !this.window.isDestroyed()) {
      return
    }

    const ready = new Promise<void>((resolve) => {
      this.readyResolver = resolve
      setTimeout(resolve, 5000)
    })
    this.window = this.createWindow()
    await ready
    this.readyResolver = null
  }

  private createWindow(): BrowserWindow {
    const window = new BrowserWindow({
      width: 320,
      height: 180,
      show: false,
      frame: false,
      skipTaskbar: true,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false
      }
    })

    if (this.rendererUrl) {
      window.loadURL(`${this.rendererUrl}#/audio-recorder`)
    } else {
      window.loadFile(join(__dirname, '../renderer/index.html'), {
        hash: '/audio-recorder'
      })
    }

    return window
  }

  private handleReady = (): void => {
    this.readyResolver?.()
  }

  private handleStopped = (): void => {
    this.stoppedResolver?.()
  }

  private handleRendererError = (_event: Electron.IpcMainEvent, message: string): void => {
    const error = new Error(message || 'Audio capture failed.')
    this.callbacks?.onError(error)
  }

  private handleChunk = async (
    _event: Electron.IpcMainInvokeEvent,
    chunk: { capturedAt: string; mimeType: string; data: ArrayBuffer }
  ): Promise<void> => {
    if (!this.active || this.paused || !this.callbacks) {
      return
    }

    const payload = Buffer.from(chunk.data)
    if (payload.byteLength === 0) {
      return
    }

    const sequence = ++this.sequence
    const id = randomUUID()
    const extension = chunk.mimeType.includes('ogg') ? 'ogg' : 'webm'
    const record: AudioChunkRecord = {
      id,
      sequence,
      capturedAt: chunk.capturedAt,
      filename: `${sequence.toString().padStart(5, '0')}-${id}.${extension}`,
      mimeType: chunk.mimeType || 'audio/webm',
      source: 'microphone',
      durationMs: null,
      payloadSize: payload.byteLength,
      contentHash: createHash('sha256').update(payload).digest('hex')
    }

    await this.sessionWriter.appendAudioChunk(record, payload)
    this.callbacks.onAudioChunkSaved(record)
  }
}
