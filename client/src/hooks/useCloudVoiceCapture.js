// useCloudVoiceCapture — MediaRecorder + /api/voice/transcribe.
//
// Works everywhere a browser has MediaRecorder + getUserMedia (Firefox,
// Chrome, Safari, in-app browsers) so Nabz's voice-first story no longer
// depends on Chrome-only webkitSpeechRecognition.
//
// Public shape mirrors useSpeechRecognition so callers can swap between them:
//   supported, listening, transcript, error, elapsedMs, start(), stop(), reset()
//
// Unlike webkit STT there is no interim transcript — the model returns one
// final transcript after the user taps Done. That is intentional: the review
// step already gives the user a chance to edit before sending.

import { useCallback, useEffect, useRef, useState } from 'react'

const API_BASE = import.meta.env.VITE_API_BASE || ''
const TOKEN_KEY = 'nabz_token'

function pickMimeType() {
  if (typeof MediaRecorder === 'undefined') return null
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
    'audio/ogg',
  ]
  for (const type of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(type)) return type
    } catch { /* ignore */ }
  }
  return ''  // let the browser pick a default
}

export function useCloudVoiceCapture({ lang = 'ur' } = {}) {
  const supported =
    typeof window !== 'undefined' &&
    typeof MediaRecorder !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices &&
    !!navigator.mediaDevices.getUserMedia

  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState(null)
  const [elapsedMs, setElapsedMs] = useState(0)

  const streamRef = useRef(null)
  const recorderRef = useRef(null)
  const chunksRef = useRef([])
  const startedAtRef = useRef(0)
  const timerRef = useRef(null)
  const submittingRef = useRef(false)

  const stopMediaTracks = useCallback(() => {
    const stream = streamRef.current
    if (stream) {
      try { stream.getTracks().forEach((t) => t.stop()) } catch { /* ignore */ }
    }
    streamRef.current = null
  }, [])

  const cleanupTimer = useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const reset = useCallback(() => {
    cleanupTimer()
    stopMediaTracks()
    recorderRef.current = null
    chunksRef.current = []
    startedAtRef.current = 0
    setListening(false)
    setTranscript('')
    setError(null)
    setElapsedMs(0)
    submittingRef.current = false
  }, [cleanupTimer, stopMediaTracks])

  const uploadBlob = useCallback(async (blob, mime) => {
    submittingRef.current = true
    try {
      const form = new FormData()
      form.append('lang', lang)
      const filename = mime && mime.includes('mp4') ? 'nabz.mp4' : 'nabz.webm'
      form.append('file', blob, filename)
      const token = localStorage.getItem(TOKEN_KEY) || ''
      const headers = token ? { Authorization: `Bearer ${token}` } : {}
      const resp = await fetch(`${API_BASE}/api/voice/transcribe`, {
        method: 'POST',
        headers,
        body: form,
      })
      if (!resp.ok) {
        let msg = `HTTP ${resp.status}`
        try {
          const body = await resp.json()
          msg = body?.detail || msg
        } catch { /* ignore */ }
        setError(String(msg))
        setTranscript('')
        return
      }
      const data = await resp.json()
      setTranscript(String(data.transcript || '').trim())
    } catch (err) {
      setError(err?.message || 'transcribe-failed')
    } finally {
      submittingRef.current = false
    }
  }, [lang])

  const start = useCallback(async () => {
    if (!supported) return
    reset()
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000,
        },
      })
      streamRef.current = stream
      const mimeType = pickMimeType()
      const rec = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream)
      recorderRef.current = rec
      chunksRef.current = []
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
      }
      rec.onstop = async () => {
        setListening(false)
        cleanupTimer()
        const chunks = chunksRef.current
        chunksRef.current = []
        stopMediaTracks()
        if (chunks.length === 0) return
        const chosenType = rec.mimeType || mimeType || 'audio/webm'
        const blob = new Blob(chunks, { type: chosenType })
        if (blob.size < 500) {
          setError('no-speech')
          return
        }
        await uploadBlob(blob, chosenType)
      }
      rec.start(250)
      startedAtRef.current = Date.now()
      timerRef.current = window.setInterval(() => {
        setElapsedMs(Date.now() - startedAtRef.current)
      }, 250)
      setListening(true)
    } catch (err) {
      const name = err?.name || ''
      setError(name === 'NotAllowedError' ? 'not-allowed' : (err?.message || 'mic-failed'))
      stopMediaTracks()
    }
  }, [supported, reset, cleanupTimer, stopMediaTracks, uploadBlob])

  const stop = useCallback(() => {
    const rec = recorderRef.current
    if (rec && rec.state !== 'inactive') {
      try { rec.stop() } catch { /* ignore */ }
    } else {
      // Recorder is already gone; make sure state is coherent.
      setListening(false)
      stopMediaTracks()
    }
  }, [stopMediaTracks])

  // Safety net on unmount.
  useEffect(() => () => reset(), [reset])

  return { supported, listening, transcript, error, elapsedMs, start, stop, reset }
}
