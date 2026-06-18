import { useEffect, useState } from 'react'
import { demoRecordingController } from '../features/recording/demoRecordingController'
import { useRecording } from '../features/recording/useRecording'

function formatElapsed(startedAt: string | undefined) {
  if (!startedAt) {
    return '00:00'
  }

  const elapsedSeconds = Math.max(
    0,
    Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)
  )
  const minutes = Math.floor(elapsedSeconds / 60)
  const seconds = elapsedSeconds % 60

  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
}

export function RecorderCard() {
  const { error, resetError, session, status, toggleRecording } =
    useRecording(demoRecordingController)
  const [elapsed, setElapsed] = useState('00:00')
  const isRecording = status === 'recording'
  const isBusy = status === 'starting' || status === 'stopping'

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'r') {
        event.preventDefault()
        void toggleRecording()
      }
    }

    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [toggleRecording])

  useEffect(() => {
    if (!isRecording) {
      setElapsed('00:00')
      return
    }

    setElapsed(formatElapsed(session?.startedAt))
    const timer = window.setInterval(() => {
      setElapsed(formatElapsed(session?.startedAt))
    }, 1000)

    return () => window.clearInterval(timer)
  }, [isRecording, session?.startedAt])

  return (
    <section className="mx-auto mt-16 mb-12 max-w-[840px] overflow-hidden rounded-xl border border-white/15 bg-[#0c0c0c] shadow-[0_20px_70px_rgba(0,0,0,0.65)]">
      <div className="flex min-h-[520px] flex-col items-center justify-center px-6 py-14 text-center sm:px-12">
        <div
          className={[
            'size-3 rounded-full transition-colors',
            isRecording
              ? 'animate-pulse bg-red-500 shadow-[0_0_18px_rgba(239,68,68,0.7)]'
              : 'bg-red-600 shadow-[0_0_16px_rgba(220,38,38,0.45)]'
          ].join(' ')}
        />

        <p className="mt-5 font-mono text-xs font-bold uppercase tracking-[0.32em] text-white/70">
          {isRecording ? 'Neural trace active' : isBusy ? 'Preparing capture' : 'Ready to capture'}
        </p>

        <h2 className="mt-8 text-4xl font-black tracking-[-0.045em] sm:text-5xl">
          {isRecording ? 'Recording Your Workflow' : 'Initiate Neural Trace'}
        </h2>

        <p className="mt-8 max-w-xl text-base leading-7 text-white/65">
          {isRecording
            ? 'Your desktop activity is being captured. Complete the workflow naturally, then stop when you are finished.'
            : 'Click below to start recording your desktop activity. AI will automatically segment workflows and generate documentation.'}
        </p>

        <button
          type="button"
          disabled={isBusy}
          onClick={() => void toggleRecording()}
          className={[
            'mt-12 flex min-w-72 items-center justify-center gap-4 rounded-full px-10 py-5 text-base font-extrabold transition focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white disabled:cursor-wait disabled:opacity-60',
            isRecording
              ? 'border border-red-500/50 bg-red-500 text-white hover:bg-red-400'
              : 'bg-white text-black hover:bg-white/85'
          ].join(' ')}
        >
          <span
            className={[
              'size-4',
              isRecording ? 'rounded-sm bg-white' : 'rounded-full bg-black'
            ].join(' ')}
          />
          {status === 'starting'
            ? 'Starting...'
            : status === 'stopping'
              ? 'Saving...'
              : isRecording
                ? 'Stop Recording'
                : 'Start Recording'}
        </button>

        {isRecording && (
          <p className="mt-5 font-mono text-sm font-bold tracking-[0.18em] text-red-400">
            {elapsed}
          </p>
        )}

        {error && (
          <button
            type="button"
            onClick={resetError}
            className="mt-5 text-xs text-red-400 underline underline-offset-4"
          >
            {error}
          </button>
        )}

        <div className="mt-12 flex flex-wrap items-center justify-center gap-4 font-mono text-xs font-semibold tracking-[0.08em] text-white/65 sm:text-sm">
          <span>⌘ Cmd + Shift + R</span>
          <span className="hidden h-5 w-px bg-white/15 sm:block" />
          <span className="flex items-center gap-2">
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="size-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
              <circle cx="12" cy="12" r="2.5" />
            </svg>
            Full Desktop Mode
          </span>
        </div>
      </div>
    </section>
  )
}
