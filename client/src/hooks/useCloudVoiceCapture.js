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
import { Capacitor, registerPlugin } from '@capacitor/core'
import { getToken } from '../api'

const API_BASE = import.meta.env.VITE_API_BASE || (Capacitor.isNativePlatform() ? 'https://nabz-api.onrender.com' : '')
const NativeVoiceRecorder = registerPlugin('NativeVoiceRecorder')

function base64ToBlob(data, mimeType) {
  const raw = window.atob(data)
  const bytes = new Uint8Array(raw.length)
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index)
  return new Blob([bytes], { type: mimeType })
}

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
  const native = typeof window !== 'undefined' && Capacitor.getPlatform() === 'android'
  const webSupported =
    typeof window !== 'undefined' &&
    typeof MediaRecorder !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices &&
    !!navigator.mediaDevices.getUserMedia
  const supported = native || webSupported

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
  const nativeRecordingRef = useRef(false)
  const nativeStartingRef = useRef(false)

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
    if (nativeRecordingRef.current || nativeStartingRef.current) {
      nativeRecordingRef.current = false
      nativeStartingRef.current = false
      NativeVoiceRecorder.cancel().catch(() => {})
    }
  }, [cleanupTimer, stopMediaTracks])

  const uploadBlob = useCallback(async (blob, mime) => {
    submittingRef.current = true
    try {
      const form = new FormData()
      form.append('lang', lang)
      const filename = mime && mime.includes('mp4') ? 'nabz.mp4' : 'nabz.webm'
      form.append('file', blob, filename)
      const token = getToken()
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
      if (native) {
        // Native AAC capture avoids WebView releases that expose getUserMedia
        // and grant permission but fail to start an audio MediaRecorder.
        nativeStartingRef.current = true
        await NativeVoiceRecorder.start()
        if (!nativeStartingRef.current) {
          NativeVoiceRecorder.cancel().catch(() => {})
          return
        }
        nativeStartingRef.current = false
        nativeRecordingRef.current = true
        startedAtRef.current = Date.now()
        timerRef.current = window.setInterval(() => {
          setElapsedMs(Date.now() - startedAtRef.current)
        }, 250)
        setListening(true)
        return
      }

      // Use `ideal:` constraints — plain values are treated as EXACT by
      // Chromium, which throws OverconstrainedError on any mic/OS combo that
      // can't hit them precisely (a real live bug reported by users where
      // Chrome's URL bar showed the mic permission granted but Nabz still
      // said "voice input could not start"). Ideal lets the browser pick the
      // closest available config instead of failing outright.
      let stream
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: { ideal: 1 },
            echoCancellation: { ideal: true },
            noiseSuppression: { ideal: true },
            autoGainControl: { ideal: true },
            sampleRate: { ideal: 16000 },
          },
        })
      } catch (firstErr) {
        // Android WebView (Chinese OEMs especially) frequently throws
        // NotReadableError on the first attempt even when nothing else is
        // holding the mic — the WebRTC audio pipeline needs a moment to
        // reinitialize. Wait briefly and retry with plain `{audio: true}`
        // to bypass constraint negotiation entirely.
        const n = firstErr?.name || ''
        if (n === 'NotReadableError' || n === 'TrackStartError' || n === 'AbortError') {
          await new Promise((r) => setTimeout(r, 500))
          stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        } else {
          throw firstErr
        }
      }
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
      nativeStartingRef.current = false
      // Surface the DOMException name so the UI (or user reporting a bug)
      // can distinguish permission-denied from hardware failures from
      // overconstrained-mic — all three previously collapsed into a single
      // opaque "voice input could not start" message.
      const name = err?.name || ''
      let code = err?.code || 'mic-failed'
      if (name === 'NotAllowedError' || name === 'SecurityError') code = 'not-allowed'
      else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') code = 'no-device'
      else if (name === 'NotReadableError' || name === 'TrackStartError') code = 'device-busy'
      else if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') code = 'constraints'
      else if (name === 'AbortError') code = 'aborted'
      if (typeof console !== 'undefined') {
        console.warn('[nabz] mic start failed:', code, name, err?.message)
      }
      setError(code)
      stopMediaTracks()
    }
  }, [supported, native, reset, cleanupTimer, stopMediaTracks, uploadBlob])

  const stop = useCallback(() => {
    if (native && nativeRecordingRef.current) {
      nativeRecordingRef.current = false
      setListening(false)
      cleanupTimer()
      stopMediaTracks()
      NativeVoiceRecorder.stop()
        .then(async (result) => {
          const mimeType = result.mimeType || 'audio/mp4'
          const blob = base64ToBlob(result.data, mimeType)
          await uploadBlob(blob, mimeType)
        })
        .catch((err) => setError(err?.code || 'mic-failed'))
      return
    }
    const rec = recorderRef.current
    if (rec && rec.state !== 'inactive') {
      try { rec.stop() } catch { /* ignore */ }
    } else {
      // Recorder is already gone; make sure state is coherent.
      setListening(false)
      stopMediaTracks()
    }
  }, [native, cleanupTimer, stopMediaTracks, uploadBlob])

  // Safety net on unmount.
  useEffect(() => () => reset(), [reset])

  return { supported, listening, transcript, error, elapsedMs, start, stop, reset }
}
