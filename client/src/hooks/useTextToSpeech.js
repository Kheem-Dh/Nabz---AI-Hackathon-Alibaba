// Shared Urdu speech output for the whole Nabz web application.
//
// Backend gTTS is preferred because browser voices often pronounce Urdu
// poorly. The active audio element is module-global so the header can stop
// speech started from any page or component.

import { useCallback, useEffect, useRef, useState } from 'react'

const API_BASE = import.meta.env.VITE_API_BASE || ''
const SPEECH_STATE_EVENT = 'nabz:speech-state'
let activeAudio = null

function emitSpeechState(speaking) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SPEECH_STATE_EVENT, { detail: { speaking } }))
  }
}

export function stopAllSpeech() {
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
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel()
  }
  emitSpeechState(false)
}

function ttsUrl(text, lang = 'ur') {
  const clipped = text.slice(0, 950)
  return `${API_BASE}/api/tts?lang=${encodeURIComponent(lang)}&text=${encodeURIComponent(clipped)}`
}

function pickVoice(voices) {
  if (!voices || voices.length === 0) return null
  const byLang = (prefix) =>
    voices.find((voice) => (voice.lang || '').toLowerCase().startsWith(prefix))
  return byLang('ur') || byLang('ar') || byLang('hi') || null
}

export function useTextToSpeech() {
  const synthSupported = typeof window !== 'undefined' && 'speechSynthesis' in window
  const [speaking, setSpeaking] = useState(false)
  const voiceRef = useRef(null)

  useEffect(() => {
    const updateState = (event) => setSpeaking(Boolean(event.detail?.speaking))
    window.addEventListener(SPEECH_STATE_EVENT, updateState)
    return () => window.removeEventListener(SPEECH_STATE_EVENT, updateState)
  }, [])

  useEffect(() => {
    if (!synthSupported) return undefined
    const load = () => {
      voiceRef.current = pickVoice(window.speechSynthesis.getVoices())
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
      const voice = voiceRef.current
      if (voice) {
        utterance.voice = voice
        utterance.lang = voice.lang
      } else {
        utterance.lang = lang === 'en' ? 'en-US' : 'ur-PK'
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

    const audio = new Audio(ttsUrl(text, lang))
    let fallbackStarted = false
    const useBrowserFallback = () => {
      if (fallbackStarted || activeAudio !== audio) return
      fallbackStarted = true
      activeAudio = null
      browserSpeak(text, lang)
    }
    activeAudio = audio
    audio.onplay = () => emitSpeechState(true)
    audio.onended = () => {
      if (activeAudio === audio) activeAudio = null
      emitSpeechState(false)
    }
    audio.onerror = useBrowserFallback
    audio.play().catch(useBrowserFallback)
  }, [browserSpeak])

  const prime = useCallback(() => {}, [])
  const cancel = useCallback(() => stopAllSpeech(), [])

  return { supported: true, speaking, speak, prime, cancel }
}
