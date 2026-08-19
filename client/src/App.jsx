import { useEffect, useRef, useState } from 'react'
import MicButton from './components/MicButton'
import ResultCard from './components/ResultCard'
import ClinicList from './components/ClinicList'
import LocationPicker from './components/LocationPicker'
import { useSpeechRecognition } from './hooks/useSpeechRecognition'
import { useTextToSpeech } from './hooks/useTextToSpeech'
import { postTriage, getClinics } from './api'

const LOCATION_KEY = 'sehat_saathi_location'

function loadLocation() {
  try {
    return JSON.parse(localStorage.getItem(LOCATION_KEY)) || { province: '', city: '' }
  } catch {
    return { province: '', city: '' }
  }
}

// Screen state machine: 'landing' | 'listening' | 'loading' | 'result' | 'error'
export default function App() {
  const [screen, setScreen] = useState('landing')
  const [typed, setTyped] = useState('')
  const [result, setResult] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [clinics, setClinics] = useState([])
  const [lastQuery, setLastQuery] = useState('')
  const [location, setLocation] = useState(loadLocation)

  const speech = useSpeechRecognition({ lang: 'ur-PK' })
  const tts = useTextToSpeech()
  const submittedRef = useRef(false)

  // Persist + (re)load clinics whenever the chosen city changes.
  useEffect(() => {
    localStorage.setItem(LOCATION_KEY, JSON.stringify(location))
    getClinics(location.city, location.province)
      .then(setClinics)
      .catch(() => setClinics([]))
  }, [location.city, location.province])

  // When speech stops and we have a transcript, auto-submit it.
  useEffect(() => {
    if (
      screen === 'listening' &&
      !speech.listening &&
      speech.transcript.trim() &&
      !submittedRef.current
    ) {
      submittedRef.current = true
      submit(speech.transcript.trim())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speech.listening, speech.transcript, screen])

  async function submit(text) {
    if (!text || !text.trim()) return
    setLastQuery(text.trim())
    setScreen('loading')
    setErrorMsg('')
    try {
      const data = await postTriage(text.trim())
      setResult(data)
      setScreen('result')
      if (data?.advice_urdu) tts.speak(data.advice_urdu) // auto-speak
    } catch (e) {
      setErrorMsg(e.message || 'Something went wrong.')
      setScreen('error')
    }
  }

  function startListening() {
    if (!speech.supported) return
    tts.prime() // unlock speech synthesis inside the user gesture
    submittedRef.current = false
    speech.reset()
    speech.start()
    setScreen('listening')
  }

  function cancelListening() {
    speech.stop()
    speech.reset()
    submittedRef.current = false
    setScreen('landing')
  }

  function newQuery() {
    tts.cancel()
    setResult(null)
    setTyped('')
    setErrorMsg('')
    speech.reset()
    submittedRef.current = false
    setScreen('landing')
  }

  function handleTypedSubmit(e) {
    e.preventDefault()
    if (!typed.trim()) return
    tts.prime() // unlock speech synthesis inside the user gesture
    submit(typed)
  }

  // Refine: combine the original description with the user's follow-up answer.
  function handleRefine(answer) {
    tts.prime()
    const combined = `${lastQuery} ۔ ${answer}`
    submit(combined)
  }

  const isEmergency = result?.level === 'EMERGENCY'

  return (
    <div className="app-shell">
      <div className="app-container">
        <Header />

        <main className="app-main">
          {screen === 'landing' && (
            <Landing
              speech={speech}
              typed={typed}
              setTyped={setTyped}
              onMic={startListening}
              onTypedSubmit={handleTypedSubmit}
              location={location}
              setLocation={setLocation}
            />
          )}

          {screen === 'listening' && (
            <Listening
              transcript={speech.transcript}
              onCancel={cancelListening}
              onStop={() => speech.stop()}
              error={speech.error}
            />
          )}

          {screen === 'loading' && <Loading query={lastQuery} />}

          {screen === 'result' && result && (
            <div className="result-layout">
              <div className="result-col">
                <ResultCard
                  result={result}
                  transcript={lastQuery}
                  onReplay={() => tts.speak(result.advice_urdu)}
                  speaking={tts.speaking}
                  onNew={newQuery}
                  onRefine={handleRefine}
                  ttsSupported={tts.supported}
                />
                {isEmergency && <RescueBanner />}
                {!location.city && (
                  <SetLocationNudge location={location} setLocation={setLocation} />
                )}
              </div>
              <aside className="side-col">
                <ClinicList clinics={clinics} city={location.city} />
              </aside>
            </div>
          )}

          {screen === 'error' && (
            <ErrorState
              message={errorMsg}
              onRetry={() => submit(lastQuery)}
              onNew={newQuery}
            />
          )}
        </main>

        <Footer />
      </div>
    </div>
  )
}

function Header() {
  return (
    <header className="app-header">
      <h1 className="app-title">
        <span className="urdu">صحت ساتھی</span>
        <span className="app-title-en">Sehat Saathi</span>
      </h1>
      <p className="app-tagline urdu">آواز سے صحت کا مشورہ</p>
      <p className="app-tagline-en">Health advice by voice</p>
    </header>
  )
}

function Landing({ speech, typed, setTyped, onMic, onTypedSubmit, location, setLocation }) {
  return (
    <div className="landing">
      <div className="landing-hero">
        {speech.supported ? (
          <MicButton listening={false} onClick={onMic} />
        ) : (
          <div className="notice">
            <p className="urdu">اس براؤزر میں آواز دستیاب نہیں — نیچے لکھیں۔</p>
            <p>Voice input isn’t supported in this browser. Please type below.</p>
          </div>
        )}
        <p className="hero-hint urdu">مائیک دبائیں اور اپنی تکلیف بتائیں</p>
        <p className="hero-hint-en">Tap the mic and describe how you feel</p>

        {speech.error === 'not-allowed' && (
          <div className="notice notice-warn">
            <p className="urdu">مائیک کی اجازت درکار ہے — یا نیچے لکھیں۔</p>
            <p>Microphone permission denied. Please allow it, or type below.</p>
          </div>
        )}
      </div>

      <div className="landing-cols">
      <form className="type-fallback" onSubmit={onTypedSubmit}>
        <label className="type-label" htmlFor="symptom-input">
          <span className="urdu">یا یہاں لکھیں</span>
          <span className="type-label-en">or type here</span>
        </label>
        <textarea
          id="symptom-input"
          className="type-input urdu"
          dir="auto"
          rows={3}
          placeholder="مثلاً: تین دن سے بخار ہے…"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
        />
        <button type="submit" className="submit-btn" disabled={!typed.trim()}>
          مشورہ لیں · Get advice
        </button>
      </form>

      <div className="location-card">
        <p className="location-heading">
          <span className="urdu">اپنا شہر منتخب کریں</span>
          <span className="location-heading-en">
            Select your city — for nearby clinics
          </span>
        </p>
        <LocationPicker
          province={location.province}
          city={location.city}
          onChange={setLocation}
        />
        {location.city && (
          <p className="location-current urdu">
            منتخب: {location.city}
          </p>
        )}
      </div>
      </div>
    </div>
  )
}

function Listening({ transcript, onCancel, onStop, error }) {
  return (
    <div className="listening">
      <MicButton listening onClick={onStop} />
      <p className="listening-hint urdu">اب اپنی تکلیف بتائیں…</p>
      <div className="live-transcript urdu" dir="auto" aria-live="polite">
        {transcript || <span className="placeholder">…</span>}
      </div>
      {error && error !== 'no-speech' && (
        <p className="notice-warn">Mic error: {error}</p>
      )}
      {error === 'no-speech' && (
        <p className="notice-warn urdu">آواز سنائی نہیں دی — دوبارہ کوشش کریں۔</p>
      )}
      <button type="button" className="cancel-btn" onClick={onCancel}>
        منسوخ کریں · Cancel
      </button>
    </div>
  )
}

function Loading({ query }) {
  return (
    <div className="loading">
      <div className="spinner" aria-hidden="true" />
      <p className="urdu">مشورہ تیار ہو رہا ہے…</p>
      <p className="loading-en">Analyzing your symptoms…</p>
      {query && <p className="loading-query">“{query}”</p>}
    </div>
  )
}

function RescueBanner() {
  return (
    <a className="rescue-banner" href="tel:1122">
      🚑 <span className="urdu">ریسکیو 1122 کو کال کریں</span>
      <span className="rescue-en">Call Rescue 1122 now</span>
    </a>
  )
}

function SetLocationNudge({ location, setLocation }) {
  return (
    <div className="location-card location-card-inline">
      <p className="location-heading">
        <span className="urdu">قریبی کلینک کے لیے شہر منتخب کریں</span>
        <span className="location-heading-en">Select your city for nearby clinics</span>
      </p>
      <LocationPicker
        province={location.province}
        city={location.city}
        onChange={setLocation}
        compact
      />
    </div>
  )
}

function ErrorState({ message, onRetry, onNew }) {
  return (
    <div className="error-state">
      <div className="error-icon" aria-hidden="true">⚠️</div>
      <p className="urdu">معذرت، مسئلہ پیش آیا۔ دوبارہ کوشش کریں۔</p>
      <p className="error-en">Sorry, something went wrong. Please try again.</p>
      <p className="error-detail">{message}</p>
      <div className="error-actions">
        <button type="button" className="submit-btn" onClick={onRetry}>
          دوبارہ · Retry
        </button>
        <button type="button" className="cancel-btn" onClick={onNew}>
          نئی بات · New query
        </button>
      </div>
    </div>
  )
}

function Footer() {
  return (
    <footer className="app-footer">
      <span className="urdu">یہ ڈاکٹر کا متبادل نہیں ہے</span>
      <span className="footer-en">This is not a substitute for a doctor.</span>
    </footer>
  )
}
