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

export function useSpeechRecognition({ lang = 'ur-PK' } = {}) {
  const Ctor = getRecognitionCtor()
  const supported = !!Ctor

  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState(null)

  const recognitionRef = useRef(null)
  const finalRef = useRef('')

  useEffect(() => {
    if (!supported) return
    const recognition = new Ctor()
    recognition.lang = lang
    recognition.interimResults = true
    recognition.continuous = false
    recognition.maxAlternatives = 1

    recognition.onresult = (event) => {
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const chunk = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          finalRef.current += chunk
        } else {
          interim += chunk
        }
      }
      setTranscript((finalRef.current + ' ' + interim).trim())
    }

    recognition.onerror = (event) => {
      setError(event.error || 'speech-error')
      setListening(false)
    }

    recognition.onend = () => {
      setListening(false)
    }

    recognitionRef.current = recognition
    return () => {
      try {
        recognition.abort()
      } catch {
        /* ignore */
      }
      recognitionRef.current = null
    }
  }, [Ctor, supported, lang])

  const start = useCallback(() => {
    if (!supported || !recognitionRef.current) return
    setError(null)
    finalRef.current = ''
    setTranscript('')
    try {
      recognitionRef.current.start()
      setListening(true)
    } catch {
      // start() throws if already started; ignore.
    }
  }, [supported])

  const stop = useCallback(() => {
    if (!recognitionRef.current) return
    try {
      recognitionRef.current.stop()
    } catch {
      /* ignore */
    }
    setListening(false)
  }, [])

  const reset = useCallback(() => {
    finalRef.current = ''
    setTranscript('')
    setError(null)
  }, [])

  return { supported, listening, transcript, error, start, stop, reset }
}
