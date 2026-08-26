import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// Feature list — Urdu-primary, English secondary. Urdu written as a
// Pakistani would actually speak it, not a literal English translation.
const FEATURES = [
  { icon: 'voice',        tag: 'VOICE',        urdu: 'اردو میں بولیں',                  en: 'Talk in your language' },
  { icon: 'photo',        tag: 'PHOTO',        urdu: 'تصویر بھیجیں',                    en: 'Send a photo' },
  { icon: 'family',       tag: 'FAMILY',       urdu: 'ہر فرد کا الگ ریکارڈ',            en: 'Separate family records' },
  { icon: 'vault',        tag: 'VAULT',        urdu: 'رپورٹس محفوظ',                    en: 'Vault your reports' },
  { icon: 'lab',          tag: 'LAB',          urdu: 'لیب رپورٹ سمجھیں',                 en: 'Explain lab values' },
  { icon: 'prescription', tag: 'RX',           urdu: 'نسخہ اسکین',                      en: 'Scan a prescription' },
  { icon: 'handoff',      tag: 'HANDOFF',      urdu: 'ڈاکٹر ہینڈ آف',                   en: 'Doctor QR handoff' },
  { icon: 'location',     tag: 'NEARBY',       urdu: 'قریبی مراکز',                     en: 'Nearby care' },
  { icon: 'pk',           tag: 'PK CONTEXT',   urdu: 'پاکستانی وباؤں کا خیال',         en: 'PK-context ranking' },
  { icon: 'memory',       tag: 'MEMORY',       urdu: 'پرانی گفتگو یاد',                 en: 'Cross-session memory' },
  { icon: 'safety',       tag: 'SAFETY',       urdu: 'ادویات کی جانچ',                  en: 'Medication safety' },
  { icon: 'emergency',    tag: 'EMERGENCY',    urdu: '۱۱۲۲ ایک ٹیپ',                    en: 'Rescue 1122 one tap' },
]

const STEPS = [
  { n: '۱', urdu: 'تکلیف بتائیں',            en: 'Tell us what is wrong' },
  { n: '۲', urdu: 'اہم سوالوں کے جواب دیں', en: 'Answer focused questions' },
  { n: '۳', urdu: 'واضح مشورہ لیں',           en: 'Get a clear next step' },
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
          <a href="#demo"><span className="urdu" dir="rtl">ڈیمو</span><small>Demo</small></a>
          <a href="#how"><span className="urdu" dir="rtl">طریقہ</span><small>How it works</small></a>
          <a href="#features"><span className="urdu" dir="rtl">خصوصیات</span><small>Features</small></a>
          <a href="#safety"><span className="urdu" dir="rtl">حفاظت</span><small>Safety</small></a>
        </nav>
        <div className="landing-nav-actions">
          {!account && <button className="landing-login" onClick={() => openAuth('login')}><span className="urdu" dir="rtl">لاگ اِن</span></button>}
          <button className="landing-nav-cta" onClick={openChat}>
            {account ? (
              <><span className="urdu" dir="rtl">گفتگو کھولیں</span></>
            ) : (
              <><span className="urdu" dir="rtl">ابھی آزمائیں</span></>
            )}
            <Icon name="arrow" />
          </button>
        </div>
      </header>

      <main>
        {/* ============ HERO ============ */}
        <section className="landing-hero landing-hero-v2">
          <div className="landing-hero-copy">
            <h1 className="urdu urdu-hero-xl" dir="rtl">پورے گھر کی صحت،<br/>ایک ہی جگہ۔</h1>
            <p className="landing-hero-en">Your family's health, in one place.</p>
            <p className="landing-lead urdu" dir="rtl">
              اپنی زبان میں بات کریں۔ نبض ڈاکٹر کی طرح سوچے گا، مشورہ دے گا۔
            </p>
            <p className="landing-lead-en">Voice-first health guide in Urdu.</p>
            <div className="landing-hero-actions">
              <button className="landing-primary" onClick={openChat}>
                <span className="urdu" dir="rtl">{account ? 'کھولیں' : 'ابھی شروع کریں'}</span>
                <Icon name="arrow" />
              </button>
              <button className="landing-secondary" onClick={() => document.querySelector('#demo')?.scrollIntoView({ behavior: 'smooth' })}>
                <Icon name="play" /> <span className="urdu" dir="rtl">ڈیمو</span>
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
            <h2 className="urdu urdu-h2" dir="rtl">۳۰ سیکنڈ میں دیکھیں</h2>
            <p className="landing-en-sub">See it in 30 seconds.</p>
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
              <span className="urdu" dir="rtl">🔊 آواز آن کریں</span>
              <small>Turn sound on</small>
            </div>
          </div>
        </section>

        {/* ============ TRUST STRIP ============ */}
        <section className="landing-trust landing-trust-v2" aria-label="Nabz stats">
          <div><strong>3</strong><span className="urdu" dir="rtl">زبانیں</span></div>
          <div><strong>12+</strong><span className="urdu" dir="rtl">خصوصیات</span></div>
          <div><strong>5</strong><span className="urdu" dir="rtl">سوال زیادہ سے زیادہ</span></div>
          <div><strong>WHO/FDA</strong><span className="urdu" dir="rtl">تصدیق شدہ</span></div>
        </section>

        {/* ============ HOW IT WORKS ============ */}
        <section className="landing-section steps-section" id="how">
          <div className="landing-section-head">
            <h2 className="urdu urdu-h2" dir="rtl">تین آسان قدم</h2>
            <p className="landing-en-sub">How it works.</p>
          </div>
          <div className="landing-steps">
            {STEPS.map((s) => (
              <article className="landing-step" key={s.n}>
                <span className="step-number urdu" dir="rtl">{s.n}</span>
                <h3 className="urdu" dir="rtl">{s.urdu}</h3>
                <small className="step-en">{s.en}</small>
              </article>
            ))}
          </div>
        </section>

        {/* ============ FEATURES ============ */}
        <section className="landing-section features-section" id="features">
          <div className="landing-section-head compact">
            <h2 className="urdu urdu-h2" dir="rtl">پورا ہیلتھ ورک اسپیس</h2>
            <p className="landing-en-sub">A full health workspace.</p>
          </div>
          <div className="landing-feature-grid landing-feature-grid-v2 landing-feature-grid-mini">
            {FEATURES.map((f) => (
              <article className="landing-feature landing-feature-mini" key={f.tag}>
                <div className="feature-icon"><Icon name={f.icon} /></div>
                <h3 className="urdu feature-mini-urdu" dir="rtl">{f.urdu}</h3>
                <small className="feature-mini-en">{f.en}</small>
              </article>
            ))}
          </div>
        </section>

        {/* ============ SAFETY ============ */}
        <section className="landing-safety" id="safety">
          <div className="safety-copy">
            <h2 className="urdu urdu-h2" dir="rtl">مددگار، ذمہ دار</h2>
            <p className="landing-en-sub">Helpful. Honest.</p>
            <p className="urdu safety-urdu-lead" dir="rtl">
              نبض ڈاکٹر کا متبادل نہیں۔ سنگین علامات پر فوراً ایمرجنسی کی سمت بتاتا ہے۔
            </p>
            <ul>
              <li><Icon name="shield" /> <span className="urdu" dir="rtl">صرف WHO/FDA سے تصدیق شدہ ادویات</span></li>
              <li><Icon name="shield" /> <span className="urdu" dir="rtl">الرجی اور حمل کی خودکار جانچ</span></li>
              <li><Icon name="shield" /> <span className="urdu" dir="rtl">سنگین علامات پر ۱۱۲۲</span></li>
            </ul>
          </div>
          <div className="safety-card">
            <span className="safety-card-icon"><Icon name="emergency" /></span>
            <h3 className="urdu" dir="rtl">ہنگامی حالت؟</h3>
            <p className="urdu" dir="rtl">
              فوراً <strong>۱۱۲۲</strong> ملائیں یا نزدیکی ایمرجنسی جائیں۔
            </p>
            <button onClick={openChat}><span className="urdu" dir="rtl">نبض کھولیں</span> <Icon name="arrow" /></button>
          </div>
        </section>

        {/* ============ FINAL CTA ============ */}
        <section className="landing-final-cta">
          <div>
            <h2 className="urdu urdu-h2" dir="rtl">آج اپنی تکلیف بتائیں</h2>
            <p className="urdu" dir="rtl">اپنی زبان میں۔ مفت۔</p>
          </div>
          <button className="landing-primary" onClick={openChat}>
            <span className="urdu" dir="rtl">{account ? 'کھولیں' : 'مفت آزمائیں'}</span>
            <Icon name="arrow" />
          </button>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-brand footer-brand">
          <span className="landing-brand-mark"><Icon name="pulse" /></span>
          <span><b className="urdu">نبض</b><small>NABZ · <span className="urdu" dir="rtl">آپ کی آواز، آپ کی صحت</span></small></span>
        </div>
        <p className="urdu" dir="rtl">عام مشورہ ہے۔ ہنگامی حالت میں ۱۱۲۲۔</p>
        <button onClick={() => navigate('/privacy')}><span className="urdu" dir="rtl">پرائیویسی</span></button>
      </footer>
    </div>
  )
}
