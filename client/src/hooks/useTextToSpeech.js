// Shared Urdu speech output for the whole Nabz web application.
//
// Backend gTTS is preferred because browser voices often pronounce Urdu
// poorly. The active audio element is module-global so the header can stop
// speech started from any page or component.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const API_BASE = import.meta.env.VITE_API_BASE || ''
const SPEECH_STATE_EVENT = 'nabz:speech-state'
let activeAudio = null
let sharedAudio = null
let audioPrimed = false
let activeFetchController = null
let activeObjectUrl = ''

// A few silent PCM samples in a valid WAV container. Playing this from the
// user's first click blesses the shared media element on Safari/iOS, allowing
// the next server-generated question to play after the async API response.
const SILENT_WAV =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQQAAACAgICA'

function getSharedAudio() {
  if (!sharedAudio && typeof Audio !== 'undefined') {
    sharedAudio = new Audio()
    sharedAudio.preload = 'auto'
    sharedAudio.playsInline = true
  }
  return sharedAudio
}

function emitSpeechState(speaking) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SPEECH_STATE_EVENT, { detail: { speaking } }))
  }
}

export function stopAllSpeech() {
  if (activeFetchController) {
    activeFetchController.abort()
    activeFetchController = null
  }
  if (activeAudio) {
    const audio = activeAudio
    activeAudio = null
    audio.onplay = null
    audio.onended = null
    audio.onerror = null
    audio.pause()
    audio.removeAttribute('src')
    audio.load()
  }
  if (activeObjectUrl) {
    URL.revokeObjectURL(activeObjectUrl)
    activeObjectUrl = ''
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel()
  }
  emitSpeechState(false)
}

function ttsUrl(text, lang = 'ur') {
  const clipped = text.slice(0, 950)
  return `${API_BASE}/api/tts?lang=${encodeURIComponent(lang)}&text=${encodeURIComponent(clipped)}`
}

function pickVoice(voices, lang) {
  if (!voices || voices.length === 0) return null
  const prefix = lang === 'en' ? 'en' : 'ur'
  return voices.find((voice) =>
    (voice.lang || '').toLowerCase().startsWith(prefix),
  ) || null
}

export function useTextToSpeech() {
  const synthSupported = typeof window !== 'undefined' && 'speechSynthesis' in window
  const [speaking, setSpeaking] = useState(false)
  const voicesRef = useRef([])

  useEffect(() => {
    const updateState = (event) => setSpeaking(Boolean(event.detail?.speaking))
    window.addEventListener(SPEECH_STATE_EVENT, updateState)
    return () => window.removeEventListener(SPEECH_STATE_EVENT, updateState)
  }, [])

  useEffect(() => {
    if (!synthSupported) return undefined
    const load = () => {
      voicesRef.current = window.speechSynthesis.getVoices()
    }
    load()
    window.speechSynthesis.addEventListener?.('voiceschanged', load)
    return () => window.speechSynthesis.removeEventListener?.('voiceschanged', load)
  }, [synthSupported])

  const browserSpeak = useCallback((text, lang) => {
    if (!synthSupported) {
      emitSpeechState(false)
      return
    }
    try {
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      const voice = pickVoice(voicesRef.current, lang)
      if (voice) {
        utterance.voice = voice
        utterance.lang = voice.lang
      } else if (lang !== 'en') {
        // Never substitute Arabic or Hindi for Urdu. Those voices can read the
        // script but pronounce Pakistani Urdu incorrectly and sound alarming.
        emitSpeechState(false)
        return
      } else {
        utterance.lang = 'en-US'
      }
      utterance.rate = 0.9
      utterance.onstart = () => emitSpeechState(true)
      utterance.onend = () => emitSpeechState(false)
      utterance.onerror = () => emitSpeechState(false)
      window.speechSynthesis.speak(utterance)
      window.speechSynthesis.resume()
    } catch {
      emitSpeechState(false)
    }
  }, [synthSupported])

  const speak = useCallback((text, { lang = 'ur' } = {}) => {
    if (!text) return
    stopAllSpeech()

    const audio = getSharedAudio()
    if (!audio) {
      browserSpeak(text, lang)
      return
    }
    audio.pause()
    audio.muted = false
    let fallbackStarted = false
    const useBrowserFallback = () => {
      if (fallbackStarted || activeAudio !== audio) return
      fallbackStarted = true
      activeAudio = null
      if (activeObjectUrl) {
        URL.revokeObjectURL(activeObjectUrl)
        activeObjectUrl = ''
      }
      browserSpeak(text, lang)
    }
    activeAudio = audio
    const controller = new AbortController()
    activeFetchController = controller

    // Fetch through connect-src, then play a same-page blob URL. Render hosts
    // the web app and API on different domains; assigning the API URL directly
    // to <audio> is blocked by the production media-src CSP even though JSON
    // API requests are allowed.
    fetch(ttsUrl(text, lang), { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`TTS HTTP ${response.status}`)
        return response.blob()
      })
      .then((blob) => {
        if (controller.signal.aborted || activeAudio !== audio) return
        activeFetchController = null
        activeObjectUrl = URL.createObjectURL(blob)
        audio.src = activeObjectUrl
        audio.load()
        audio.onplay = () => emitSpeechState(true)
        audio.onended = () => {
          if (activeAudio === audio) activeAudio = null
          if (activeObjectUrl) {
            URL.revokeObjectURL(activeObjectUrl)
            activeObjectUrl = ''
          }
          emitSpeechState(false)
        }
        audio.onerror = useBrowserFallback
        audio.play().catch(useBrowserFallback)
      })
      .catch((error) => {
        if (error?.name !== 'AbortError') useBrowserFallback()
      })
  }, [browserSpeak])

  const prime = useCallback(() => {
    if (audioPrimed) return
    const audio = getSharedAudio()
    if (!audio) return
    const oldMuted = audio.muted
    audio.muted = true
    audio.src = SILENT_WAV
    const attempt = audio.play()
    Promise.resolve(attempt)
      .then(() => {
        audio.pause()
        audio.currentTime = 0
        audio.muted = oldMuted
        audioPrimed = true
      })
      .catch(() => {
        audio.muted = oldMuted
      })
  }, [])
  const cancel = useCallback(() => stopAllSpeech(), [])

  return useMemo(
    () => ({ supported: true, speaking, speak, prime, cancel }),
    [speaking, speak, prime, cancel],
  )
}
