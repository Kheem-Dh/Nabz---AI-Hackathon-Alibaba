import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const FEATURES = [
  {
    icon: 'voice',
    tag: 'VOICE',
    en: 'Describe symptoms by voice',
    urdu: 'آواز میں بتائیں',
    desc: 'Speak naturally in Urdu, Roman Urdu, or English. No typing required.',
  },
  {
    icon: 'photo',
    tag: 'PHOTO',
    en: 'Send a photo for analysis',
    urdu: 'تصویر بھیجیں',
    desc: 'Upload a rash, wound, or prescription image — Nabz reads it.',
  },
  {
    icon: 'family',
    tag: 'FAMILY',
    en: 'Separate record for every member',
    urdu: 'ہر فرد کا الگ ریکارڈ',
    desc: 'One account covers the whole family. Each person keeps their own history.',
  },
  {
    icon: 'vault',
    tag: 'VAULT',
    en: 'Store reports and prescriptions',
    urdu: 'رپورٹس اور نسخے محفوظ',
    desc: 'Upload documents once. Access them any time, share with any doctor.',
  },
  {
    icon: 'lab',
    tag: 'LAB',
    en: 'Understand your lab results',
    urdu: 'لیب رپورٹ سمجھیں',
    desc: 'Plain-language explanation of blood tests, urine reports, and more.',
  },
  {
    icon: 'prescription',
    tag: 'RX',
    en: 'Scan a prescription',
    urdu: 'نسخہ اسکین کریں',
    desc: 'Point your camera at a handwritten prescription — Nabz reads and explains it.',
  },
  {
    icon: 'handoff',
    tag: 'HANDOFF',
    en: 'Share a summary with your doctor',
    urdu: 'ڈاکٹر کو خلاصہ بھیجیں',
    desc: 'Generate a secure QR code your doctor scans to see your full history.',
  },
  {
    icon: 'location',
    tag: 'NEARBY',
    en: 'Find nearby clinics and hospitals',
    urdu: 'قریبی مراکز تلاش کریں',
    desc: 'Ranked by your location. Includes blood banks, labs, and pharmacies.',
  },
  {
    icon: 'pk',
    tag: 'PK',
    en: 'Built for Pakistani health context',
    urdu: 'پاکستانی طبی حالات',
    desc: 'Dengue, typhoid, malaria patterns. Local disease prevalence factored in.',
  },
  {
    icon: 'memory',
    tag: 'MEMORY',
    en: 'Remembers your history',
    urdu: 'پرانی گفتگو یاد',
    desc: 'Past symptoms and medicines are recalled in every new conversation.',
  },
  {
    icon: 'safety',
    tag: 'SAFETY',
    en: 'Checks medicine safety automatically',
    urdu: 'ادویات کی جانچ',
    desc: 'Flags drug interactions, allergy risks, and pregnancy warnings.',
  },
  {
    icon: 'emergency',
    tag: 'EMERGENCY',
    en: 'Escalates emergencies automatically',
    urdu: 'ہنگامی حالت میں فوری اقدام',
    desc: 'When symptoms are serious, Nabz tells you to call 1122 immediately.',
  },
]

const STEPS = [
  {
    en: 'Describe what\'s wrong',
    urdu: 'تکلیف بتائیں',
    detail: 'Speak or type in any language. One sentence is enough to start.',
  },
  {
    en: 'Answer a few focused questions',
    urdu: 'چند سوالوں کے جواب دیں',
    detail: 'Nabz asks only what matters — never more than five questions.',
  },
  {
    en: 'Get a clear next step',
    urdu: 'واضح مشورہ ملے گا',
    detail: 'Home care, see a doctor, or go to emergency — stated plainly.',
  },
]

function Icon({ name }) {
  const paths = {
    voice: <><path d="M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z"/><path d="M5.5 10.5v.7a6.5 6.5 0 0 0 13 0v-.7M12 17.7V21M8.5 21h7"/></>,
    photo: <><rect x="3" y="6" width="18" height="14" rx="2"/><circle cx="12" cy="13" r="4"/><path d="M8 6l1.5-2h5L16 6"/></>,
    family: <><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.3"/><path d="M3.5 20v-1.4A5.6 5.6 0 0 1 9 13a5.6 5.6 0 0 1 5.5 5.6V20M14.6 14.5a4.5 4.5 0 0 1 5.9 4.3V20"/></>,
    vault: <><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 5V3h10v2M8 10h8M12 7v6M8 17h8"/></>,
    lab: <><path d="M9 3h6m-1 0v5l4.5 8.1A3.3 3.3 0 0 1 15.6 21H8.4a3.3 3.3 0 0 1-2.9-4.9L10 8V3m-2 11h8"/></>,
    prescription: <><path d="M6 3h9l3 3v15H6V3Zm8 0v4h4M9 12h6m-6 4h6"/></>,
    handoff: <><rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><path d="M13 13h3v3M20 16v4h-4"/></>,
    location: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
    pk: <><path d="M12 2v20M2 12h20"/><circle cx="12" cy="12" r="9"/></>,
    memory: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    safety: <><path d="M12 3 5 6v5c0 4.6 2.8 8.1 7 10 4.2-1.9 7-5.4 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/></>,
    emergency: <><path d="M12 2 3 21h18L12 2Z"/><path d="M12 10v5M12 18v.5"/></>,
    shield: <><path d="M12 3 5 6v5c0 4.6 2.8 8.1 7 10 4.2-1.9 7-5.4 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/></>,
    arrow: <><path d="M5 12h14M14 7l5 5-5 5"/></>,
    pulse: <path d="M3 12h4l2-6 4 12 2-6h6"/>,
    play: <path d="M8 5v14l11-7L8 5Z"/>,
  }
  return <svg className="landing-icon" viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>
}

export default function LandingPage() {
  const navigate = useNavigate()
  const { account } = useAuth()
  const openAuth = (mode) => navigate(account ? '/' : `/auth?mode=${mode}`)
  const openChat = () => navigate(account ? '/' : '/chat')

  return (
    <div className="landing-page landing-v2">
      <header className="landing-nav">
        <button className="landing-brand" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="Nabz home">
          <span className="landing-brand-mark"><Icon name="pulse" /></span>
          <span><b className="urdu">نبض</b><small>NABZ</small></span>
        </button>
        <nav aria-label="Navigation" className="landing-nav-links">
          <a href="#demo">Demo</a>
          <a href="#how">How it works</a>
          <a href="#features">Features</a>
          <a href="#safety">Safety</a>
        </nav>
        <div className="landing-nav-actions">
          {!account && <button className="landing-login" onClick={() => openAuth('login')}>Log in</button>}
          <button className="landing-nav-cta" onClick={openChat}>
            {account ? 'Open Nabz' : 'Try free'}
            <Icon name="arrow" />
          </button>
        </div>
      </header>

      <main>
        {/* ============ HERO ============ */}
        <section className="landing-hero landing-hero-v2">
          <div className="landing-hero-copy">
            <p className="lp-eyebrow">Urdu-first health guide for Pakistan</p>
            <h1 className="lp-hero-en">Your family's health,<br/>in one place.</h1>
            <p className="lp-hero-ur urdu" dir="rtl">پورے گھر کی صحت — ایک ہی جگہ</p>
            <p className="landing-lead">
              Describe symptoms by voice in Urdu. Nabz asks the right questions and tells you exactly what to do next.
            </p>
            <p className="landing-lead-ur urdu" dir="rtl">آواز میں بتائیں، واضح مشورہ ملے گا۔</p>
            <div className="landing-hero-actions">
              <button className="landing-primary" onClick={openChat}>
                {account ? 'Open Nabz' : 'Start for free'}
                <Icon name="arrow" />
              </button>
              <button className="landing-secondary" onClick={() => document.querySelector('#demo')?.scrollIntoView({ behavior: 'smooth' })}>
                <Icon name="play" /> Watch demo
              </button>
            </div>
          </div>
          <div className="landing-visual">
            <div className="visual-orbit orbit-one" />
            <div className="visual-orbit orbit-two" />
            <div className="hero-mockup">
              <div className="hero-mockup-head">
                <span className="mockup-dot" /><span className="mockup-dot" /><span className="mockup-dot" />
                <span className="mockup-title urdu" dir="rtl">نبض · گفتگو</span>
              </div>
              <div className="hero-mockup-body">
                <div className="mockup-msg mockup-msg-user urdu" dir="rtl">مجھے بخار اور سر درد ہے</div>
                <div className="mockup-msg mockup-msg-bot">
                  <span className="urdu" dir="rtl">کب سے یہ تکلیف ہے؟</span>
                  <small>How long has this been going on?</small>
                </div>
                <div className="mockup-msg mockup-msg-user urdu" dir="rtl">تین دن سے</div>
                <div className="mockup-msg mockup-msg-bot">
                  <span className="urdu" dir="rtl">درجہ حرارت ماپا؟ کہاں تک گیا؟</span>
                  <small>Did you measure the temperature? How high?</small>
                </div>
                <div className="mockup-typing"><span/><span/><span/></div>
              </div>
              <div className="hero-mockup-foot">
                <span>🎙️</span><span>📷</span><small className="urdu" dir="rtl">بولیں یا لکھیں</small>
              </div>
            </div>
          </div>
        </section>

        {/* ============ VIDEO DEMO ============ */}
        <section className="landing-section landing-video-section" id="demo">
          <div className="landing-section-head">
            <h2 className="lp-section-en">See it in 30 seconds</h2>
            <p className="lp-section-ur urdu" dir="rtl">۳۰ سیکنڈ میں دیکھیں</p>
          </div>
          <div className="landing-video-frame">
            <video
              controls
              playsInline
              preload="metadata"
              poster="/nabz-demo-poster.jpg"
              className="landing-video"
            >
              <source src="/nabz-demo.mp4" type="video/mp4" />
              <p className="urdu" dir="rtl">آپ کا براؤزر ویڈیو نہیں چلا سکتا۔</p>
            </video>
            <div className="landing-video-caption">
              <span>🔊 Turn sound on</span>
              <small className="urdu" dir="rtl">آواز آن کریں</small>
            </div>
          </div>
        </section>

        {/* ============ TRUST STRIP ============ */}
        <section className="landing-trust landing-trust-v2" aria-label="Nabz at a glance">
          <div>
            <strong>3</strong>
            <span>Languages</span>
            <small className="urdu" dir="rtl">زبانیں</small>
          </div>
          <div>
            <strong>12+</strong>
            <span>Features</span>
            <small className="urdu" dir="rtl">خصوصیات</small>
          </div>
          <div>
            <strong>≤ 5</strong>
            <span>Questions per session</span>
            <small className="urdu" dir="rtl">سوال زیادہ سے زیادہ</small>
          </div>
          <div>
            <strong>WHO/FDA</strong>
            <span>Drug database</span>
            <small className="urdu" dir="rtl">تصدیق شدہ ادویات</small>
          </div>
        </section>

        {/* ============ HOW IT WORKS ============ */}
        <section className="landing-section steps-section" id="how">
          <div className="landing-section-head">
            <h2 className="lp-section-en">How it works</h2>
            <p className="lp-section-ur urdu" dir="rtl">تین آسان قدم</p>
          </div>
          <div className="landing-steps lp-steps">
            {STEPS.map((s, i) => (
              <article className="landing-step lp-step" key={i}>
                <span className="lp-step-num">{i + 1}</span>
                <div className="lp-step-body">
                  <h3 className="lp-step-en">{s.en}</h3>
                  <p className="lp-step-ur urdu" dir="rtl">{s.urdu}</p>
                  <p className="lp-step-detail">{s.detail}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* ============ FEATURES ============ */}
        <section className="landing-section features-section" id="features">
          <div className="landing-section-head compact">
            <h2 className="lp-section-en">Everything in one place</h2>
            <p className="lp-section-ur urdu" dir="rtl">مکمل صحت کا نظام</p>
            <p className="lp-section-desc">Hover any card to learn what it does.</p>
          </div>
          <div className="lp-feature-grid">
            {FEATURES.map((f) => (
              <article className="lp-feat-card" key={f.tag}>
                <div className="lp-feat-front">
                  <div className="lp-feat-icon"><Icon name={f.icon} /></div>
                  <h3 className="lp-feat-en">{f.en}</h3>
                  <p className="lp-feat-ur urdu" dir="rtl">{f.urdu}</p>
                </div>
                <div className="lp-feat-back">
                  <p className="lp-feat-desc">{f.desc}</p>
                  <p className="lp-feat-back-ur urdu" dir="rtl">{f.urdu}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* ============ SAFETY ============ */}
        <section className="landing-safety" id="safety">
          <div className="safety-copy">
            <h2 className="lp-section-en">Helpful. Honest. Safe.</h2>
            <p className="lp-section-ur urdu" dir="rtl">مددگار، ذمہ دار</p>
            <p className="safety-lead">
              Nabz is not a replacement for a doctor. It helps you understand what's happening and decide when to seek care.
            </p>
            <p className="urdu safety-urdu-lead" dir="rtl">
              نبض ڈاکٹر کا متبادل نہیں۔ سنگین علامات پر فوراً ایمرجنسی کی سمت بتاتا ہے۔
            </p>
            <ul>
              <li><Icon name="shield" /> <span>Only WHO/FDA-verified drug data</span><small className="urdu" dir="rtl">صرف تصدیق شدہ ادویات</small></li>
              <li><Icon name="shield" /> <span>Automatic allergy and pregnancy checks</span><small className="urdu" dir="rtl">الرجی اور حمل کی جانچ</small></li>
              <li><Icon name="shield" /> <span>Escalates to emergency services when symptoms are serious</span><small className="urdu" dir="rtl">سنگین علامات پر فوری اقدام</small></li>
            </ul>
          </div>
          <div className="safety-card">
            <span className="safety-card-icon"><Icon name="emergency" /></span>
            <h3>Emergency?</h3>
            <p className="urdu" dir="rtl">ہنگامی حالت؟</p>
            <p>Call <strong>1122</strong> or go to your nearest emergency room immediately.</p>
            <p className="urdu" dir="rtl">فوراً <strong>۱۱۲۲</strong> ملائیں یا نزدیکی ایمرجنسی جائیں۔</p>
            <button onClick={openChat}>Open Nabz <Icon name="arrow" /></button>
          </div>
        </section>

        {/* ============ FINAL CTA ============ */}
        <section className="landing-final-cta">
          <div>
            <h2>Describe how you feel today.</h2>
            <p className="urdu" dir="rtl">آج اپنی تکلیف بتائیں — اپنی زبان میں — مفت۔</p>
          </div>
          <button className="landing-primary" onClick={openChat}>
            {account ? 'Open Nabz' : 'Start for free'}
            <Icon name="arrow" />
          </button>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-brand footer-brand">
          <span className="landing-brand-mark"><Icon name="pulse" /></span>
          <span><b className="urdu">نبض</b><small>NABZ · Your voice, your health</small></span>
        </div>
        <p>General health guidance only. For emergencies call 1122.</p>
        <button onClick={() => navigate('/privacy')}>Privacy</button>
      </footer>
    </div>
  )
}
