// useVoiceInput — voice-capture compat layer.
//
// Picks the lowest-latency backend for the current browser:
//   1. Browser SpeechRecognition when available, because it supplies live
//      interim words while the person is still speaking.
//   2. Cloud STT via MediaRecorder as a cross-browser fallback.
//
// Exposes the same public shape both hooks used, so TriageConversation can
// keep its existing `speech.*` calls unchanged:
//   supported, listening, transcript, error, start(), stop(), reset()
//
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useCloudVoiceCapture } from './useCloudVoiceCapture'
import { useSpeechRecognition } from './useSpeechRecognition'

export function useVoiceInput({ lang = 'ur-PK', silenceMs = 6000 } = {}) {
  const langShort = (lang || 'ur').split('-')[0]
  const cloud = useCloudVoiceCapture({ lang: langShort })
  const webkit = useSpeechRecognition({ lang, silenceMs })
  const [prefer, setPrefer] = useState(() => (webkit.supported ? 'webkit' : 'cloud'))

  useEffect(() => {
    // Browser speech can be unavailable because the browser's recognition
    // service is blocked. Fall back to the upload endpoint for that case.
    if (
      prefer === 'webkit'
      && cloud.supported
      && ['network', 'service-not-allowed', 'speech-start-failed'].includes(webkit.error)
    ) {
      setPrefer('cloud')
    }
  }, [cloud.supported, prefer, webkit.error])

  const active = prefer === 'cloud' && cloud.supported ? cloud : webkit
  const supported = cloud.supported || webkit.supported

  // Both hooks stop themselves; we still surface a coherent stop that hits
  // whichever backend is currently active.
  const start = useCallback(() => active.start(), [active])
  const stop = useCallback(() => active.stop(), [active])
  const reset = useCallback(() => active.reset(), [active])

  return useMemo(
    () => ({
      supported,
      listening: active.listening,
      transcript: active.transcript,
      error: active.error,
      backend: prefer === 'webkit' ? 'live' : 'cloud',
      start,
      stop,
      reset,
    }),
    [supported, active.listening, active.transcript, active.error, prefer, start, stop, reset],
  )
}
