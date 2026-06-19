import { createHash, randomUUID } from 'node:crypto'
import { desktopCapturer, screen, systemPreferences, type DesktopCapturerSource } from 'electron'
import type { RecordingOptions, ScreenshotRecord } from '../../shared/recording'
import { SessionWriter } from './SessionWriter'

interface ScreenCaptureCallbacks {
  onScreenshotSaved: (record: ScreenshotRecord) => void
  onError: (error: Error) => void
}

export class ScreenCaptureService {
  private active = false
  private paused = false
  private captureInProgress = false
  private timer: NodeJS.Timeout | null = null
  private previousThumbnail: Buffer | null = null
  private pendingChange = false
  private changeStartedAt = 0
  private lastChangedAt = 0
  private highestChangeScore = 0
  private screenshotSequence = 0
  private options: RecordingOptions | null = null
  private callbacks: ScreenCaptureCallbacks | null = null
  private currentScreenshotId: string | undefined
  private pendingEventIds: string[] = []

  constructor(private readonly sessionWriter: SessionWriter) {}

  async start(options: RecordingOptions, callbacks: ScreenCaptureCallbacks): Promise<void> {
    if (this.active) {
      throw new Error('Screen capture is already active.')
    }

    if (process.platform === 'darwin') {
      const permission = systemPreferences.getMediaAccessStatus('screen')
      if (permission === 'denied' || permission === 'restricted') {
        throw new Error(
          'Screen Recording permission is required. Enable it in System Settings > Privacy & Security > Screen Recording.'
        )
      }
    }

    this.options = options
    this.callbacks = callbacks
    this.active = true
    this.paused = false
    this.previousThumbnail = null
    this.pendingChange = false
    this.screenshotSequence = 0
    this.currentScreenshotId = undefined
    this.pendingEventIds = []

    try {
      await this.captureAndSave(1)
      await this.sample()
    } catch (error) {
      this.resetRuntimeState()
      throw error
    }
  }

  pause(): void {
    this.paused = true
    this.clearTimer()
  }

  resume(): void {
    if (!this.active) {
      return
    }

    this.paused = false
    this.scheduleNextSample(0)
  }

  async stop(): Promise<void> {
    this.active = false
    this.paused = false
    this.clearTimer()

    while (this.captureInProgress) {
      await new Promise<void>((resolve) => setTimeout(resolve, 25))
    }

    if (this.pendingChange) {
      await this.captureAndSave(this.highestChangeScore)
    }

    this.resetRuntimeState()
  }

  getCurrentScreenshotId(): string | undefined {
    return this.currentScreenshotId
  }

  registerEvent(eventId: string): void {
    if (!this.pendingEventIds.includes(eventId)) {
      this.pendingEventIds.push(eventId)
    }
  }

  private async sample(): Promise<void> {
    if (!this.active || this.paused || !this.options || this.captureInProgress) {
      return
    }

    this.captureInProgress = true

    try {
      const source = await this.getDisplaySource({
        width: this.options.thumbnailWidth,
        height: this.options.thumbnailHeight
      })
      const thumbnail = source.thumbnail
        .resize({
          width: this.options.thumbnailWidth,
          height: this.options.thumbnailHeight,
          quality: 'good'
        })
        .toBitmap()

      if (this.previousThumbnail) {
        const changeScore = calculateChangeScore(
          this.previousThumbnail,
          thumbnail,
          this.options.thumbnailWidth,
          this.options.thumbnailHeight
        )
        const now = Date.now()

        if (changeScore >= this.options.changeThreshold) {
          if (!this.pendingChange) {
            this.pendingChange = true
            this.changeStartedAt = now
          }

          this.lastChangedAt = now
          this.highestChangeScore = Math.max(this.highestChangeScore, changeScore)
        } else if (
          this.pendingChange &&
          now - this.lastChangedAt >= this.options.settleDurationMs
        ) {
          await this.captureAndSave(this.highestChangeScore)
          this.resetPendingChange()
        }

        if (
          this.pendingChange &&
          now - this.changeStartedAt >= this.options.maxSettleDurationMs
        ) {
          await this.captureAndSave(this.highestChangeScore)
          this.resetPendingChange()
        }
      }

      this.previousThumbnail = Buffer.from(thumbnail)
    } catch (error) {
      const captureError =
        error instanceof Error ? error : new Error('Screen capture failed unexpectedly.')
      this.callbacks?.onError(captureError)
      this.resetRuntimeState()
    } finally {
      this.captureInProgress = false
      this.scheduleNextSample()
    }
  }

  private async captureAndSave(changeScore: number): Promise<void> {
    if (!this.options) {
      return
    }

    const display = this.getTargetDisplay()
    const width = Math.round(display.size.width * display.scaleFactor)
    const height = Math.round(display.size.height * display.scaleFactor)
    const source = await this.getDisplaySource({ width, height })
    const png = source.thumbnail.toPNG()
    const sequence = ++this.screenshotSequence
    const id = randomUUID()
    const record: ScreenshotRecord = {
      id,
      sequence,
      capturedAt: new Date().toISOString(),
      eventIds: [...this.pendingEventIds],
      filename: `${sequence.toString().padStart(5, '0')}-${id}.png`,
      width: source.thumbnail.getSize().width,
      height: source.thumbnail.getSize().height,
      changeScore,
      contentHash: createHash('sha256').update(png).digest('hex')
    }

    await this.sessionWriter.appendScreenshot(record, png)
    this.currentScreenshotId = record.id
    this.pendingEventIds = []
    this.callbacks?.onScreenshotSaved(record)
  }

  private async getDisplaySource(thumbnailSize: {
    width: number
    height: number
  }): Promise<DesktopCapturerSource> {
    const display = this.getTargetDisplay()
    const sources = await this.getScreenSources(thumbnailSize)
    const displayId = display.id.toString()
    const source =
      sources.find((candidate) => candidate.display_id === displayId) ??
      sources.find((candidate) => candidate.name === `Screen ${displayId}`) ??
      sources[0]

    if (!source) {
      throw new Error(getUnavailableDisplayMessage('macOS returned no display sources.'))
    }

    if (source.thumbnail.isEmpty()) {
      const fallbackSources = await this.getScreenSources({
        width: Math.min(thumbnailSize.width, 1920),
        height: Math.min(thumbnailSize.height, 1080)
      })
      const fallback =
        fallbackSources.find((candidate) => candidate.display_id === displayId) ??
        fallbackSources[0]

      if (!fallback || fallback.thumbnail.isEmpty()) {
        throw new Error(
          getUnavailableDisplayMessage('macOS returned an empty display image.')
        )
      }

      return fallback
    }

    return source
  }

  private getScreenSources(thumbnailSize: {
    width: number
    height: number
  }): Promise<DesktopCapturerSource[]> {
    return desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize,
      fetchWindowIcons: false
    })
  }

  private getTargetDisplay() {
    if (this.options?.displayId) {
      const matchingDisplay = screen
        .getAllDisplays()
        .find((display) => display.id.toString() === this.options?.displayId)
      if (matchingDisplay) {
        return matchingDisplay
      }
    }

    return screen.getPrimaryDisplay()
  }

  private scheduleNextSample(delay = this.options?.sampleIntervalMs ?? 250): void {
    this.clearTimer()

    if (!this.active || this.paused) {
      return
    }

    this.timer = setTimeout(() => void this.sample(), delay)
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  private resetPendingChange(): void {
    this.pendingChange = false
    this.changeStartedAt = 0
    this.lastChangedAt = 0
    this.highestChangeScore = 0
  }

  private resetRuntimeState(): void {
    this.active = false
    this.paused = false
    this.captureInProgress = false
    this.clearTimer()
    this.previousThumbnail = null
    this.currentScreenshotId = undefined
    this.pendingEventIds = []
    this.options = null
    this.callbacks = null
    this.resetPendingChange()
  }
}

function getUnavailableDisplayMessage(detail: string): string {
  if (process.platform === 'darwin') {
    return `Screen capture could not start. ${detail} Fully quit and reopen WorkTrace after enabling Screen & System Audio Recording.`
  }

  return `Screen capture could not start. ${detail}`
}

function calculateChangeScore(
  previous: Buffer,
  current: Buffer,
  width: number,
  requestedHeight: number
): number {
  const pixelCount = Math.floor(Math.min(previous.length, current.length) / 4)
  if (pixelCount === 0) {
    return 0
  }

  let changedPixels = 0
  const brightnessThreshold = 18
  const blockColumns = 8
  const blockRows = 6
  const blockChanged = new Uint32Array(blockColumns * blockRows)
  const blockTotals = new Uint32Array(blockColumns * blockRows)
  const height = Math.min(requestedHeight, Math.max(1, Math.floor(pixelCount / width)))

  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
    const index = pixelIndex * 4
    const previousLuma =
      previous[index + 2] * 0.299 + previous[index + 1] * 0.587 + previous[index] * 0.114
    const currentLuma =
      current[index + 2] * 0.299 + current[index + 1] * 0.587 + current[index] * 0.114
    const x = pixelIndex % width
    const y = Math.floor(pixelIndex / width)
    const blockX = Math.min(blockColumns - 1, Math.floor((x / width) * blockColumns))
    const blockY = Math.min(blockRows - 1, Math.floor((y / height) * blockRows))
    const blockIndex = blockY * blockColumns + blockX

    blockTotals[blockIndex] += 1
    if (Math.abs(previousLuma - currentLuma) >= brightnessThreshold) {
      changedPixels += 1
      blockChanged[blockIndex] += 1
    }
  }

  let highestBlockScore = 0
  for (let index = 0; index < blockChanged.length; index += 1) {
    if (blockTotals[index] > 0) {
      highestBlockScore = Math.max(highestBlockScore, blockChanged[index] / blockTotals[index])
    }
  }

  const globalScore = changedPixels / pixelCount
  return Math.max(globalScore, highestBlockScore * 0.12)
}
