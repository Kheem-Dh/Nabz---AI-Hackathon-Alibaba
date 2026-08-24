import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useLocationPref } from '../context/LocationContext'
import { useProfiles } from '../context/ProfileContext'

const ONBOARDED_KEY = 'nabz_onboarded'

export function markOnboarded(accountId) {
  try {
    const seen = JSON.parse(localStorage.getItem(ONBOARDED_KEY) || '[]')
    if (!seen.includes(accountId)) {
      seen.push(accountId)
      localStorage.setItem(ONBOARDED_KEY, JSON.stringify(seen))
    }
  } catch {
    localStorage.setItem(ONBOARDED_KEY, JSON.stringify([accountId]))
  }
}

export function hasOnboarded(accountId) {
  try {
    const seen = JSON.parse(localStorage.getItem(ONBOARDED_KEY) || '[]')
    return seen.includes(accountId)
  } catch {
    return false
  }
}

// P3.3 — Cohesive first-run onboarding: one guided flow that ends by dropping
// the user directly into their first triage. All the pieces already existed;
// this wizard binds them into one story so a brand-new account is never left
// on a nav-less workspace.
export default function OnboardingPage() {
  const navigate = useNavigate()
  const { account } = useAuth()
  const { active } = useProfiles()
  const { preference } = useLocationPref()

  const [step, setStep] = useState(0)

  const steps = [
    { title: 'Welcome to Nabz', kicker: '01 · Getting started' },
    { title: 'Where are you?', kicker: '02 · Care location' },
    { title: 'How Nabz works', kicker: '03 · Safety first' },
    { title: 'Ready when you are', kicker: '04 · Start a triage' },
  ]

  function finish() {
    if (account?.id) markOnboarded(account.id)
    navigate('/', { replace: true })
  }

  const cur = steps[step]
  const activeName = active?.display_name || account?.full_name || 'you'

  return (
    <div className="page onboard-page">
      <div className="onboard-card">
        <div className="onboard-kicker">{cur.kicker}</div>
        <h1 className="onboard-title">{cur.title}</h1>

        <div className="wiz-steps" aria-label="Onboarding progress">
          {steps.map((_, i) => (
            <span key={i} className={`wiz-dot ${i <= step ? 'active' : ''}`} />
          ))}
        </div>

        {step === 0 && (
          <div className="onboard-body">
            <p className="onboard-lead urdu" dir="rtl">
              {activeName}، خوش آمدید۔ نبض آپ کی آواز میں طبیعت سمجھتا ہے، خطرے کی
              علامات فوری چیک کرتا ہے، اور آپ کے قریب مناسب کلینک یا ہسپتال بتاتا ہے۔
            </p>
            <p className="onboard-lead">
              Welcome, <strong>{activeName}</strong>. Nabz listens in Urdu, checks for red
              flags first, then guides you to the safest next step and the right nearby
              place to get care.
            </p>
            <ul className="onboard-list">
              <li>🩺 One-question-at-a-time interview — never a long form.</li>
              <li>👨‍👩‍👧 A private vault for every family member, with their own history.</li>
              <li>📍 Nearby clinics, hospitals, and blood banks ranked by your location.</li>
              <li>🔒 Your voice + health record are on your account only. Never used to train AI.</li>
            </ul>
          </div>
        )}

        {step === 1 && (
          <div className="onboard-body">
            <p className="onboard-lead">Your care location was confirmed before this tour so nearby results are ready from the first assessment.</p>
            <div className="notice notice-info location-confirmed-onboard">
              <strong>⌖ {preference?.label}</strong>
              <span>{preference?.permission_state === 'granted' ? 'Using current-location coordinates' : 'Using your selected city centre'}</span>
            </div>
            <button className="btn btn-outline" onClick={() => navigate('/location')}>Change location</button>
          </div>
        )}

        {step === 2 && (
          <div className="onboard-body">
            <div className="onboard-safety">
              <h3>What Nabz will and will not do</h3>
              <ul className="onboard-list">
                <li>✅ Triage urgency — Emergency, See a doctor 24h, or Home care.</li>
                <li>✅ Explain lab and prescription photos in simple Urdu.</li>
                <li>✅ Keep a family vault, per-person, private to your account.</li>
                <li>❌ Never diagnose a specific disease.</li>
                <li>❌ Never write a new prescription — it only reads existing clinician papers.</li>
                <li>❌ Never delay an emergency — red flags short-circuit the interview.</li>
              </ul>
              <p className="onboard-disclaimer urdu">
                یہ ڈاکٹر کا متبادل نہیں ہے۔ کسی بھی سنگین بات پر ڈاکٹر سے فوراً رجوع کریں۔
              </p>
              <p className="onboard-disclaimer-en">
                This is not a substitute for a doctor. For any serious concern, contact a clinician.
              </p>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="onboard-body">
            <p className="onboard-lead">
              You're set up. Tap the microphone on the next screen and describe how
              <strong> {activeName}</strong> feels. Nabz will ask the single most useful
              follow-up question and stop as soon as urgency is clear.
            </p>
            <div className="onboard-tips">
              <div><strong>Try:</strong></div>
              <div className="urdu" dir="rtl">"مجھے سر میں درد ہے"</div>
              <div className="urdu" dir="rtl">"میرے بچے کو دو دن سے بخار ہے"</div>
              <div className="urdu" dir="rtl">"سینے میں تکلیف ہے"</div>
            </div>
          </div>
        )}

        <footer className="onboard-foot">
          <button
            className="btn btn-ghost"
            onClick={() => { if (account?.id) markOnboarded(account.id); navigate('/', { replace: true }) }}
          >
            Skip
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            {step > 0 && (
              <button className="btn btn-outline" onClick={() => setStep((s) => Math.max(0, s - 1))}>
                Back
              </button>
            )}
            {step < steps.length - 1 ? (
              <button
                className="btn btn-primary"
                onClick={() => setStep((s) => Math.min(steps.length - 1, s + 1))}
                disabled={step === 1 && !preference}
              >
                Next
              </button>
            ) : (
              <button className="btn btn-primary" onClick={finish}>
                Start my first triage →
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  )
}
