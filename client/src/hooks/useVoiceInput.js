// useVoiceInput — voice-capture compat layer.
//
// Prefer MediaRecorder + Nabz cloud STT whenever it is available. Browser
// SpeechRecognition looks attractive because it supplies interim words, but
// Chrome can expose the API while its remote recognition service is blocked.
// In that case a new chat used to enter a dead "preparing" state and never
// start the recorder fallback. The recorder is deterministic on web and in
// Capacitor, so browser recognition is now only the last-resort fallback.
//
// Exposes the same public shape both hooks used, so TriageConversation can
// keep its existing `speech.*` calls unchanged:
//   supported, listening, transcript, error, start(), stop(), reset()
//
import { useMemo } from 'react'
import { useCloudVoiceCapture } from './useCloudVoiceCapture'
import { useSpeechRecognition } from './useSpeechRecognition'

export function useVoiceInput({ lang = 'ur-PK', silenceMs = 6000 } = {}) {
  const langShort = (lang || 'ur').split('-')[0]
  const cloud = useCloudVoiceCapture({ lang: langShort })
  const webkit = useSpeechRecognition({ lang, silenceMs })
  const active = cloud.supported ? cloud : webkit
  const supported = cloud.supported || webkit.supported

  return useMemo(
    () => ({
      supported,
      listening: active.listening,
      transcript: active.transcript,
      error: active.error,
      backend: cloud.supported ? 'cloud' : 'live',
      start: active.start,
      stop: active.stop,
      reset: active.reset,
    }),
    [
      supported,
      active.listening,
      active.transcript,
      active.error,
      active.start,
      active.stop,
      active.reset,
      cloud.supported,
    ],
  )
}
