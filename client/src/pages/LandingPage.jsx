import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const FEATURES = [
  {
    icon: 'voice',
    eyebrow: 'VOICE + TEXT',
    title: 'Speak naturally',
    urdu: 'اپنی زبان میں بات کریں',
    body: 'Describe symptoms in English, Urdu or Roman Urdu. Nabz asks focused follow-up questions and keeps text available whenever voice is not.',
  },
  {
    icon: 'family',
    eyebrow: 'FAMILY CARE',
    title: 'One account, separate histories',
    urdu: 'پورے خاندان کی الگ ہسٹری',
    body: 'Add parents, children or grandparents and keep each person’s conversations, medicines and documents in their own profile.',
  },
  {
    icon: 'vault',
    eyebrow: 'MEDICAL VAULT',
    title: 'Turn reports into useful context',
    urdu: 'رپورٹس، نسخے اور ادویات',
    body: 'Upload prescriptions and lab reports, review extracted details before saving, and bring the right history into the next conversation.',
  },
  {
    icon: 'location',
    eyebrow: 'CARE NEARBY',
    title: 'Know where to go next',
    urdu: 'قریب ترین مناسب نگہداشت',
    body: 'Use your confirmed location to find nearby hospitals, clinics, emergency care and blood-donation facilities.',
  },
]

const STEPS = [
  ['01', 'Choose who needs care', 'Select yourself or a family member so every answer and record stays with the right person.'],
  ['02', 'Tell Nabz what is happening', 'Speak, type or attach a photo. Nabz gathers the important details without an endless questionnaire.'],
  ['03', 'Leave with a clear next step', 'See urgency, self-care guidance, warning signs and nearby care—then keep the encounter in your timeline.'],
]

function Icon({ name }) {
  const paths = {
    voice: <><path d="M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z"/><path d="M5.5 10.5v.7a6.5 6.5 0 0 0 13 0v-.7M12 17.7V21M8.5 21h7"/></>,
    family: <><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.3"/><path d="M3.5 20v-1.4A5.6 5.6 0 0 1 9 13a5.6 5.6 0 0 1 5.5 5.6V20M14.6 14.5a4.5 4.5 0 0 1 5.9 4.3V20"/></>,
    vault: <><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 5V3h10v2M8 10h8M12 7v6M8 17h8"/></>,
    location: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
    shield: <><path d="M12 3 5 6v5c0 4.6 2.8 8.1 7 10 4.2-1.9 7-5.4 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/></>,
    arrow: <><path d="M5 12h14M14 7l5 5-5 5"/></>,
    pulse: <path d="M3 12h4l2-6 4 12 2-6h6"/>,
  }
  return <svg className="landing-icon" viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>
}

function ProductPreview() {
  return (
    <div className="landing-preview" aria-label="Preview of a Nabz health conversation">
      <div className="preview-topline" />
      <div className="preview-head">
        <div className="preview-mark"><Icon name="pulse" /></div>
        <div>
          <strong>Nabz health guide</strong>
          <span><i /> Ready to listen</span>
        </div>
        <span className="preview-lang">اردو · EN</span>
      </div>
      <div className="preview-profile">
        <span className="preview-avatar">A</span>
        <div><small>CARING FOR</small><strong>Ammi · Mother</strong></div>
        <span className="preview-switch">Switch</span>
      </div>
      <div className="preview-chat">
        <div className="preview-message assistant">
          <span className="urdu">السلام علیکم، آج طبیعت کیسی ہے؟</span>
          <p>Tell me what feels different today.</p>
        </div>
        <div className="preview-message patient">She has had a fever and cough since last night.</div>
        <div className="preview-thinking"><span /><span /><span /> Checking the important details</div>
      </div>
      <div className="preview-actions">
        <span>＋ Photo</span><strong>Hold to speak</strong><span>⌨ Type</span>
      </div>
      <div className="preview-result">
        <span className="result-dot" />
        <div><small>NEXT STEP</small><strong>Answer 2 focused questions</strong></div>
        <span>→</span>
      </div>
    </div>
  )
}

export default function LandingPage() {
  const navigate = useNavigate()
  const { account } = useAuth()
  const openAuth = (mode) => navigate(account ? '/' : `/auth?mode=${mode}`)
  const openChat = () => navigate(account ? '/' : '/chat')

  return (
    <div className="landing-page">
      <header className="landing-nav">
        <button className="landing-brand" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="Nabz home">
          <span className="landing-brand-mark"><Icon name="pulse" /></span>
          <span><b className="urdu">نبض</b><small>NABZ</small></span>
        </button>
        <nav aria-label="Website navigation">
          <a href="#how">How it works</a>
          <a href="#features">What you can do</a>
          <a href="#safety">Safety</a>
        </nav>
        <div className="landing-nav-actions">
          {!account && <button className="landing-login" onClick={() => openAuth('login')}>Log in</button>}
          <button className="landing-nav-cta" onClick={openChat}>
            {account ? 'Open workspace' : 'Try Nabz now'} <Icon name="arrow" />
          </button>
        </div>
      </header>

      <main>
        <section className="landing-hero">
          <div className="landing-hero-copy">
            <div className="landing-kicker"><span /> BUILT FOR FAMILIES IN PAKISTAN</div>
            <h1>Your family’s health,<br/><em>finally in one place.</em></h1>
            <p className="landing-hero-urdu urdu">اپنی زبان میں بات کریں، واضح اگلا قدم پائیں</p>
            <p className="landing-lead">Talk through symptoms, organise medical records and find nearby care—with a bilingual AI health guide that remembers who you are caring for.</p>
            <div className="landing-hero-actions">
              <button className="landing-primary" onClick={openChat}>{account ? 'Continue to your workspace' : 'Start a health conversation'} <Icon name="arrow" /></button>
              <button className="landing-secondary" onClick={() => document.querySelector('#how')?.scrollIntoView({ behavior: 'smooth' })}>See how Nabz works</button>
            </div>
            <div className="landing-assurances">
              <span><Icon name="shield" /> Separate family profiles</span>
              <span><Icon name="pulse" /> Clear urgency guidance</span>
              <span>اردو · Roman Urdu · English</span>
            </div>
          </div>
          <div className="landing-visual">
            <div className="visual-orbit orbit-one" />
            <div className="visual-orbit orbit-two" />
            <div className="visual-note note-family"><Icon name="family" /><span><small>FAMILY PROFILES</small><b>Everyone stays separate</b></span></div>
            <ProductPreview />
            <div className="visual-note note-care"><Icon name="location" /><span><small>FIND CARE</small><b>Location-aware options</b></span></div>
          </div>
        </section>

        <section className="landing-trust" aria-label="Nabz capabilities">
          <div><strong>3</strong><span>languages<br/>understood</span></div>
          <div><strong>1</strong><span>vault for the<br/>whole family</span></div>
          <div><strong>5</strong><span>question maximum<br/>in an assessment</span></div>
          <div><strong>25 MB</strong><span>report and<br/>prescription uploads</span></div>
        </section>

        <section className="landing-section steps-section" id="how">
          <div className="landing-section-head">
            <span className="landing-kicker">FROM CONCERN TO A CLEAR NEXT STEP</span>
            <h2>Care should feel simpler.</h2>
            <p>Nabz connects the conversation, the context and the place to get help.</p>
          </div>
          <div className="landing-steps">
            {STEPS.map(([number, title, body]) => (
              <article className="landing-step" key={number}>
                <span className="step-number">{number}</span>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-section features-section" id="features">
          <div className="landing-section-head compact">
            <span className="landing-kicker">MORE THAN A SYMPTOM CHAT</span>
            <h2>A health workspace that stays useful tomorrow.</h2>
          </div>
          <div className="landing-feature-grid">
            {FEATURES.map((feature) => (
              <article className="landing-feature" key={feature.title}>
                <div className="feature-icon"><Icon name={feature.icon} /></div>
                <span className="feature-eyebrow">{feature.eyebrow}</span>
                <h3>{feature.title}</h3>
                <div className="feature-urdu urdu">{feature.urdu}</div>
                <p>{feature.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-safety" id="safety">
          <div className="safety-copy">
            <span className="landing-kicker light">DESIGNED FOR SAFER DECISIONS</span>
            <h2>Helpful guidance.<br/>Honest boundaries.</h2>
            <p>Nabz is an AI health guide—not a doctor and not a replacement for emergency care. It is designed to surface urgency, warning signs and appropriate next steps without hiding uncertainty.</p>
            <ul>
              <li><Icon name="shield" /> Review extracted lab and prescription details before saving</li>
              <li><Icon name="shield" /> Cancel, retry and recover a conversation if connectivity fails</li>
              <li><Icon name="shield" /> Emergency guidance and nearby-care shortcuts when risk is high</li>
            </ul>
          </div>
          <div className="safety-card">
            <span className="safety-card-icon"><Icon name="pulse" /></span>
            <small>IF SOMETHING FEELS SERIOUS</small>
            <h3>Do not wait for an AI response.</h3>
            <p>Call Rescue <strong>1122</strong>, Police <strong>15</strong>, or go to the nearest emergency department.</p>
            <button onClick={openChat}>Open Nabz health guide <Icon name="arrow" /></button>
          </div>
        </section>

        <section className="landing-final-cta">
          <div>
            <span className="landing-kicker">YOUR VOICE. YOUR HEALTH.</span>
            <h2>Start with what you are feeling.</h2>
            <p className="urdu">جو بھی مسئلہ ہے، اپنی زبان میں بتائیں</p>
          </div>
          <button className="landing-primary" onClick={openChat}>{account ? 'Return to your health space' : 'Try a temporary assessment'} <Icon name="arrow" /></button>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-brand footer-brand">
          <span className="landing-brand-mark"><Icon name="pulse" /></span>
          <span><b className="urdu">نبض</b><small>NABZ · Your voice, your health</small></span>
        </div>
        <p>General health guidance only. For emergencies, call 1122 or visit the nearest emergency department.</p>
        <button onClick={() => navigate('/privacy')}>Privacy</button>
      </footer>
    </div>
  )
}
