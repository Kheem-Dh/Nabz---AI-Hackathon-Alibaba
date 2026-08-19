// useTextToSpeech — spoken Urdu output.
//
// PRIMARY: server-side gTTS (`/api/tts`) which produces REAL Urdu speech.
// Browser SpeechSynthesis on most machines has no Urdu voice and mangles the
// text (often reading only the digits) — that is the "it only says numbers"
// bug. So we play backend audio first and only fall back to browser speech if
// the audio request fails (e.g. backend offline).
//
// This is the ONLY place that touches speech output, so the engine can be
// swapped again later (e.g. Alibaba Cloud TTS) without changing components.

import { useCallback, useEffect, useRef, useState } from 'react'

const API_BASE = import.meta.env.VITE_API_BASE || ''

function ttsUrl(text, lang = 'ur') {
  const clipped = text.slice(0, 950)
  return `${API_BASE}/api/tts?lang=${encodeURIComponent(lang)}&text=${encodeURIComponent(
    clipped,
  )}`
}

// --- Browser fallback voice selection ---
function pickVoice(voices) {
  if (!voices || voices.length === 0) return null
  const byLang = (prefix) =>
    voices.find((v) => (v.lang || '').toLowerCase().startsWith(prefix))
  // Urdu → Arabic (both use Arabic script) → Hindi → none.
  return byLang('ur') || byLang('ar') || byLang('hi') || null
}

export function useTextToSpeech() {
  const synthSupported =
    typeof window !== 'undefined' && 'speechSynthesis' in window

  const [speaking, setSpeaking] = useState(false)
  const audioRef = useRef(null)
  const voiceRef = useRef(null)

  useEffect(() => {
    if (!synthSupported) return
    const load = () => {
      voiceRef.current = pickVoice(window.speechSynthesis.getVoices())
    }
    load()
    window.speechSynthesis.onvoiceschanged = load
    return () => {
      window.speechSynthesis.onvoiceschanged = null
    }
  }, [synthSupported])

  const stopAll = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    if (synthSupported) window.speechSynthesis.cancel()
    setSpeaking(false)
  }, [synthSupported])

  const browserSpeak = useCallback(
    (text, lang) => {
      if (!synthSupported) {
        setSpeaking(false)
        return
      }
      try {
        window.speechSynthesis.cancel()
        const utter = new SpeechSynthesisUtterance(text)
        const voice = voiceRef.current
        if (voice) {
          utter.voice = voice
          utter.lang = voice.lang
        } else {
          utter.lang = lang === 'en' ? 'en-US' : 'ur-PK'
        }
        utter.rate = 0.9
        utter.onstart = () => setSpeaking(true)
        utter.onend = () => setSpeaking(false)
        utter.onerror = () => setSpeaking(false)
        window.speechSynthesis.speak(utter)
        window.speechSynthesis.resume()
      } catch {
        setSpeaking(false)
      }
    },
    [synthSupported],
  )

  const speak = useCallback(
    (text, { lang = 'ur' } = {}) => {
      if (!text) return
      stopAll()
      // Try real Urdu audio from the backend first.
      const audio = new Audio(ttsUrl(text, lang))
      audioRef.current = audio
      audio.onplay = () => setSpeaking(true)
      audio.onended = () => {
        setSpeaking(false)
        audioRef.current = null
      }
      audio.onerror = () => {
        // Backend TTS unavailable -> fall back to browser speech.
        audioRef.current = null
        browserSpeak(text, lang)
      }
      audio.play().catch(() => {
        audioRef.current = null
        browserSpeak(text, lang)
      })
    },
    [stopAll, browserSpeak],
  )

  // Kept for API compatibility; audio playback needs no separate priming.
  const prime = useCallback(() => {}, [])

  const cancel = useCallback(() => stopAll(), [stopAll])

  return { supported: true, speaking, speak, prime, cancel }
}
