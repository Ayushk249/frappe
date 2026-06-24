import { useEffect, useRef } from 'react'

function chooseMimeType(): string {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg'
  ]
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? ''
}

export function AudioRecorderPage() {
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    window.audioRecorder.ready()

    const stopTracks = () => {
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }

    const stopRecorder = () => {
      const recorder = recorderRef.current
      if (!recorder || recorder.state === 'inactive') {
        stopTracks()
        window.audioRecorder.stopped()
        return
      }
      recorder.stop()
    }

    const removeStart = window.audioRecorder.onStart(async ({ timesliceMs }) => {
      try {
        stopTracks()
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        const mimeType = chooseMimeType()
        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
        streamRef.current = stream
        recorderRef.current = recorder

        recorder.addEventListener('dataavailable', (event) => {
          if (event.data.size === 0) {
            return
          }
          void event.data.arrayBuffer().then((data) =>
            window.audioRecorder.chunk({
              capturedAt: new Date().toISOString(),
              mimeType: event.data.type || recorder.mimeType || 'audio/webm',
              data
            })
          )
        })

        recorder.addEventListener('stop', () => {
          stopTracks()
          recorderRef.current = null
          window.audioRecorder.stopped()
        })

        recorder.start(timesliceMs)
      } catch (error) {
        window.audioRecorder.error(
          error instanceof Error ? error.message : 'Could not start microphone capture.'
        )
      }
    })

    const removePause = window.audioRecorder.onPause(() => {
      const recorder = recorderRef.current
      if (recorder?.state === 'recording') {
        recorder.pause()
      }
    })

    const removeResume = window.audioRecorder.onResume(() => {
      const recorder = recorderRef.current
      if (recorder?.state === 'paused') {
        recorder.resume()
      }
    })

    const removeStop = window.audioRecorder.onStop(stopRecorder)

    return () => {
      removeStart()
      removePause()
      removeResume()
      removeStop()
      stopRecorder()
    }
  }, [])

  return <main className="min-h-screen bg-black" />
}
