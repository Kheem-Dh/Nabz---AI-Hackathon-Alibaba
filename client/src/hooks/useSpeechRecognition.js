// useSpeechRecognition — isolates the browser Web Speech API (SpeechRecognition).
//
// This hook is intentionally the ONLY place that touches SpeechRecognition, so a
// cloud ASR service (e.g. Alibaba Cloud Intelligent Speech Interaction) can be
// swapped in later without changing any UI component.
//
// Returns:
//   supported   - boolean: is SpeechRecognition available in this browser?
//   listening   - boolean: are we currently capturing audio?
//   transcript  - string: the live/interim + final transcript
//   error       - string | null: e.g. 'not-allowed', 'no-speech'
//   start()     - begin listening
//   stop()      - stop listening
//   reset()     - clear transcript + error

import { useCallback, useEffect, useRef, useState } from 'react'

function getRecognitionCtor() {
  if (typeof window === 'undefined') return null
  return window.SpeechRecognition || window.webkitSpeechRecognition || null
}

export function useSpeechRecognition({ lang = 'ur-PK', silenceMs = 6000 } = {}) {
  const Ctor = getRecognitionCtor()
  const supported = !!Ctor

  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState(null)

  const recognitionRef = useRef(null)
  const finalRef = useRef('')
  const keepListeningRef = useRef(false)
  const activeRef = useRef(false)
  const silenceTimerRef = useRef(null)
  const restartTimerRef = useRef(null)

  useEffect(() => {
    if (!supported) return
    const recognition = new Ctor()
    recognition.lang = lang
    recognition.interimResults = true
    // Keep collecting across natural pauses. Some mobile Chrome builds still
    // end a continuous session, so onend below restarts while capture is wanted.
    recognition.continuous = true
    recognition.maxAlternatives = 1

    const clearSilenceTimer = () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }

    const clearRestartTimer = () => {
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current)
      restartTimerRef.current = null
    }

    const finishAfterSilence = () => {
      clearSilenceTimer()
      silenceTimerRef.current = setTimeout(() => {
        keepListeningRef.current = false
        try {
          recognition.stop()
        } catch {
          // If there is no active session, there will be no onend callback.
          setListening(false)
        }
      }, silenceMs)
    }

    recognition.onstart = () => {
      activeRef.current = true
      setListening(true)
    }

    recognition.onresult = (event) => {
      const interimParts = []
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const chunk = event.results[i][0].transcript.trim()
        if (!chunk) continue
        if (event.results[i].isFinal) {
          finalRef.current = [finalRef.current, chunk].filter(Boolean).join(' ')
        } else {
          interimParts.push(chunk)
        }
      }
      setTranscript([finalRef.current, interimParts.join(' ')].filter(Boolean).join(' '))
      // A short pause should not submit half a sentence. Finalize only after a
      // full three seconds without another recognition update; the stop button
      // remains available when the speaker finishes sooner.
      finishAfterSilence()
    }

    recognition.onerror = (event) => {
      if (event.error === 'aborted' && !keepListeningRef.current) return
      keepListeningRef.current = false
      activeRef.current = false
      clearSilenceTimer()
      clearRestartTimer()
      setError(event.error || 'speech-error')
      setListening(false)
    }

    recognition.onend = () => {
      activeRef.current = false
      if (!keepListeningRef.current) {
        clearSilenceTimer()
        setListening(false)
        return
      }

      // Browser speech services sometimes end after a brief pause even with
      // continuous=true. Resume without exposing a false "not listening" gap
      // that would auto-submit the partial transcript.
      clearRestartTimer()
      restartTimerRef.current = setTimeout(() => {
        if (!keepListeningRef.current) return
        try {
          recognition.start()
        } catch {
          keepListeningRef.current = false
          setError('speech-restart-failed')
          setListening(false)
        }
      }, 150)
    }

    recognitionRef.current = recognition
    return () => {
      keepListeningRef.current = false
      clearSilenceTimer()
      clearRestartTimer()
      try {
        recognition.abort()
      } catch {
        /* ignore */
      }
      recognitionRef.current = null
    }
  }, [Ctor, supported, lang, silenceMs])

  const start = useCallback(() => {
    if (!supported || !recognitionRef.current) return
    setError(null)
    finalRef.current = ''
    setTranscript('')
    keepListeningRef.current = true
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
    if (restartTimerRef.current) clearTimeout(restartTimerRef.current)
    try {
      recognitionRef.current.start()
      setListening(true)
    } catch {
      keepListeningRef.current = false
      setError('speech-start-failed')
      setListening(false)
    }
  }, [supported])

  const stop = useCallback(() => {
    if (!recognitionRef.current) return
    keepListeningRef.current = false
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
    if (restartTimerRef.current) clearTimeout(restartTimerRef.current)
    try {
      recognitionRef.current.stop()
    } catch {
      setListening(false)
    }
  }, [])

  const reset = useCallback(() => {
    keepListeningRef.current = false
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
    if (restartTimerRef.current) clearTimeout(restartTimerRef.current)
    if (activeRef.current && recognitionRef.current) {
      try {
        recognitionRef.current.abort()
      } catch {
        /* ignore */
      }
    }
    activeRef.current = false
    setListening(false)
    finalRef.current = ''
    setTranscript('')
    setError(null)
  }, [])

  return { supported, listening, transcript, error, start, stop, reset }
}
