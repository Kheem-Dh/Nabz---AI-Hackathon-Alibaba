// useVoiceInput — voice-capture compat layer.
//
// Picks the best available voice backend for the current browser:
//   1. Cloud STT (Qwen3.5-Omni via /api/voice/transcribe) using MediaRecorder.
//      Works in Firefox, Chrome, Safari, in-app browsers — anywhere Nabz's
//      backend is reachable.
//   2. Browser webkitSpeechRecognition fallback (Chrome desktop / Android
//      Chrome only). Keeps the old behaviour for zero-network offline.
//
// Exposes the same public shape both hooks used, so TriageConversation can
// keep its existing `speech.*` calls unchanged:
//   supported, listening, transcript, error, start(), stop(), reset()
//
// If cloud STT errors more than a couple of times in a row, we permanently
// switch to the browser fallback for the rest of this tab session.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useCloudVoiceCapture } from './useCloudVoiceCapture'
import { useSpeechRecognition } from './useSpeechRecognition'

const CLOUD_FAILURE_BUDGET = 2

export function useVoiceInput({ lang = 'ur-PK', silenceMs = 6000 } = {}) {
  const langShort = (lang || 'ur').split('-')[0]
  const cloud = useCloudVoiceCapture({ lang: langShort })
  const webkit = useSpeechRecognition({ lang, silenceMs })
  const cloudFailuresRef = useRef(0)
  const [prefer, setPrefer] = useState(() => (cloud.supported ? 'cloud' : 'webkit'))

  useEffect(() => {
    // If cloud errors twice in a row, permanently prefer webkit for this tab.
    if (prefer !== 'cloud') return
    if (!cloud.error) return
    cloudFailuresRef.current += 1
    if (cloudFailuresRef.current >= CLOUD_FAILURE_BUDGET && webkit.supported) {
      setPrefer('webkit')
    }
  }, [cloud.error, prefer, webkit.supported])

  useEffect(() => {
    if (cloud.transcript) cloudFailuresRef.current = 0
  }, [cloud.transcript])

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
      backend: prefer,
      start,
      stop,
      reset,
    }),
    [supported, active.listening, active.transcript, active.error, prefer, start, stop, reset],
  )
}
