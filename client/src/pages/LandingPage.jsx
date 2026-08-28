import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const HERO_FEATURES = [
  {
    icon: 'voice',
    en: 'Talk in Urdu — no typing needed',
    urdu: 'آواز میں بتائیں',
    desc: 'Speak naturally. Nabz understands Urdu, Roman Urdu, and English.',
  },
  {
    icon: 'family',
    en: 'One account for the whole family',
    urdu: 'پورا گھرانہ، ایک جگہ',
    desc: 'Each person keeps their own medical history. Nothing gets mixed up.',
  },
  {
    icon: 'emergency',
    en: 'Knows when it\'s serious',
    urdu: 'سنگین حالت پہچانتا ہے',
    desc: 'When symptoms signal danger, Nabz tells you to call 1122 immediately.',
  },
]

const ALL_FEATURES = [
  { icon: 'photo',        en: 'Photo analysis',            urdu: 'تصویر سے تشخیص',          desc: 'Upload a rash, wound, or prescription — Nabz reads it.' },
  { icon: 'vault',        en: 'Document vault',            urdu: 'رپورٹس محفوظ',             desc: 'Store reports and prescriptions. Share with any doctor via QR.' },
  { icon: 'lab',          en: 'Lab result explainer',      urdu: 'لیب رپورٹ سمجھیں',         desc: 'Plain-language explanation of blood tests and urine reports.' },
  { icon: 'prescription', en: 'Prescription scanner',      urdu: 'نسخہ اسکین',               desc: 'Point your camera at a handwritten prescription to decode it.' },
  { icon: 'handoff',      en: 'Doctor handoff QR',         urdu: 'ڈاکٹر کو خلاصہ',           desc: 'Generate a QR your doctor scans to see your full history.' },
  { icon: 'location',     en: 'Nearby clinics & labs',     urdu: 'قریبی مراکز',              desc: 'Find hospitals, blood banks, and pharmacies near you.' },
  { icon: 'pk',           en: 'Built for Pakistan',        urdu: 'پاکستانی طبی حالات',       desc: 'Dengue, typhoid, malaria patterns. Local disease context built in.' },
  { icon: 'memory',       en: 'Remembers your history',    urdu: 'پرانی گفتگو یاد',           desc: 'Past symptoms and medicines are recalled in every new session.' },
  { icon: 'safety',       en: 'Medicine safety checks',    urdu: 'ادویات کی جانچ',            desc: 'Flags drug interactions, allergy risks, and pregnancy warnings.' },
]

const VAULT_DOCS = [
  { emoji: '🩻', type: 'xray',         en: 'X-ray',           urdu: 'ایکس رے',         badge: 'analyzed', desc: 'Chest, bone, spine — Nabz reads the report and explains findings in plain Urdu.' },
  { emoji: '🧪', type: 'lab',          en: 'Lab report',      urdu: 'لیب رپورٹ',        badge: 'flagged',  desc: 'CBC, HbA1c, thyroid, urine — flags abnormal values and what they might mean.' },
  { emoji: '📋', type: 'prescription', en: 'Prescription',    urdu: 'نسخہ',             badge: 'analyzed', desc: 'Handwritten or printed — decodes medicine names, doses, and timing in Urdu.' },
  { emoji: '🧠', type: 'mri',          en: 'MRI / CT scan',   urdu: 'ایم آر آئی / سی ٹی', badge: 'new',   desc: 'Uploads the report text so Nabz can reference it during any future consultation.' },
  { emoji: '📸', type: 'skin',         en: 'Skin photo',      urdu: 'جلدی تصویر',       badge: 'analyzed', desc: 'Rash, wound, or growth — described and tracked over time for changes.' },
  { emoji: '📄', type: 'other',        en: 'Other document',  urdu: 'دیگر دستاویز',     badge: 'analyzed', desc: 'Discharge summaries, specialist letters — stored and surfaced when relevant.' },
]

const VAULT_POINTS = [
  { icon: 'shield',  en: 'Private by design', urdu: 'نجی اور محفوظ',          detail: 'Each family member has a separate, encrypted vault. Nothing is shared without your permission.' },
  { icon: 'memory',  en: 'Remembered forever', urdu: 'ہمیشہ یاد رہتا ہے',      detail: 'Nabz references your past documents in every new conversation — no re-uploading.' },
  { icon: 'handoff', en: 'Share with any doctor', urdu: 'کسی بھی ڈاکٹر سے شیئر', detail: 'Generate a QR code that gives your doctor an instant, complete medical summary.' },
]

const STEPS = [
  {
    en: 'Describe what\'s wrong',
    urdu: 'تکلیف بتائیں',
    detail: 'One sentence in any language. Voice or text — your choice.',
  },
  {
    en: 'Answer a few questions',
    urdu: 'چند سوالوں کے جواب',
    detail: 'Nabz asks only what matters. Never more than five questions.',
  },
  {
    en: 'Get a clear next step',
    urdu: 'واضح فیصلہ',
    detail: 'Home care, see a doctor, or call emergency — stated plainly.',
  },
]

function Icon({ name, className = '' }) {
  const paths = {
    voice:        <><path d="M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z"/><path d="M5.5 10.5v.7a6.5 6.5 0 0 0 13 0v-.7M12 17.7V21M8.5 21h7"/></>,
    photo:        <><rect x="3" y="6" width="18" height="14" rx="2"/><circle cx="12" cy="13" r="4"/><path d="M8 6l1.5-2h5L16 6"/></>,
    family:       <><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.3"/><path d="M3.5 20v-1.4A5.6 5.6 0 0 1 9 13a5.6 5.6 0 0 1 5.5 5.6V20M14.6 14.5a4.5 4.5 0 0 1 5.9 4.3V20"/></>,
    vault:        <><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 5V3h10v2M8 10h8M12 7v6M8 17h8"/></>,
    lab:          <><path d="M9 3h6m-1 0v5l4.5 8.1A3.3 3.3 0 0 1 15.6 21H8.4a3.3 3.3 0 0 1-2.9-4.9L10 8V3m-2 11h8"/></>,
    prescription: <><path d="M6 3h9l3 3v15H6V3Zm8 0v4h4M9 12h6m-6 4h6"/></>,
    handoff:      <><rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><path d="M13 13h3v3M20 16v4h-4"/></>,
    location:     <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
    pk:           <><path d="M12 2v20M2 12h20"/><circle cx="12" cy="12" r="9"/></>,
    memory:       <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    safety:       <><path d="M12 3 5 6v5c0 4.6 2.8 8.1 7 10 4.2-1.9 7-5.4 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/></>,
    emergency:    <><path d="M12 2 3 21h18L12 2Z"/><path d="M12 10v5M12 18v.5"/></>,
    shield:       <><path d="M12 3 5 6v5c0 4.6 2.8 8.1 7 10 4.2-1.9 7-5.4 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/></>,
    arrow:        <><path d="M5 12h14M14 7l5 5-5 5"/></>,
    pulse:        <path d="M3 12h4l2-6 4 12 2-6h6"/>,
    play:         <path d="M8 5v14l11-7L8 5Z"/>,
    check:        <><path d="M20 6 9 17l-5-5"/></>,
    mic:          <><path d="M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z"/><path d="M5.5 10.5v.7a6.5 6.5 0 0 0 13 0v-.7"/></>,
    lock:         <><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></>,
    star:         <><path d="M12 2l3 6 6 .9-4.5 4.3 1 6.3L12 16.9 6.5 19.5l1-6.3L3 8.9 9 8l3-6z"/></>,
    sparkle:      <><path d="M9.5 2.5 11 7l4.5 1.5L11 10l-1.5 4.5L8 10l-4.5-1.5L8 7z"/><path d="M16 14l.8 2.5L19 17.2l-2.2.8-.8 2.5-.8-2.5-2.2-.8 2.2-.8z"/></>,
  }
  return (
    <svg
      className={`nb-icon ${className}`}
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  )
}

export default function LandingPage() {
  const navigate = useNavigate()
  const { account } = useAuth()
  const openChat = () => navigate(account ? '/' : '/chat')
  const openAuth = (mode) => navigate(account ? '/' : `/auth?mode=${mode}`)

  return (
    <div className="nb-page">

      {/* ── NAV ── */}
      <header className="nb-nav">
        <button
          className="nb-brand"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label="Nabz home"
        >
          <span className="nb-brand-pulse"><Icon name="pulse" /></span>
          <span className="nb-brand-name">
            <strong className="urdu" dir="rtl">نبض</strong>
            <small>NABZ</small>
          </span>
        </button>

        <nav className="nb-nav-links" aria-label="Page sections">
          <a href="#how">How it works</a>
          <a href="#vault">Vault</a>
          <a href="#features">Features</a>
          <a href="#safety">Safety</a>
        </nav>

        <div className="nb-nav-actions">
          {!account && (
            <button className="nb-btn-ghost" onClick={() => openAuth('login')}>
              Log in
            </button>
          )}
          <button className="nb-btn-clay" onClick={openChat}>
            {account ? 'Open Nabz' : 'Start free'}
            <Icon name="arrow" />
          </button>
        </div>
      </header>

      <main>

        {/* ── HERO ── */}
        <section className="nb-hero">
          {/* watermark Urdu word behind the copy — the signature element */}
          <span className="nb-hero-wm urdu" aria-hidden="true">نبض</span>

          <div className="nb-hero-copy">
            <p className="nb-eyebrow">Urdu-first · Pakistan · Free</p>
            <h1 className="nb-h1">
              Describe your symptoms.<br />
              Get a clear answer.
            </h1>
            <p className="nb-hero-ur urdu" dir="rtl">
              اپنی تکلیف بتائیں — واضح مشورہ ملے گا۔
            </p>
            <p className="nb-hero-sub">
              Nabz listens in Urdu, asks the right questions, and tells you exactly
              what to do — in under two minutes.
            </p>
            <div className="nb-hero-actions">
              <button className="nb-btn-clay nb-btn-lg" onClick={openChat}>
                {account ? 'Open Nabz' : 'Start for free'}
                <Icon name="arrow" />
              </button>
              <button
                className="nb-btn-outline"
                onClick={() => document.querySelector('#demo')?.scrollIntoView({ behavior: 'smooth' })}
              >
                <Icon name="play" />
                Watch 30-second demo
              </button>
            </div>
          </div>

          <div className="nb-hero-phone">
            <div className="nb-phone-shell">
              <div className="nb-phone-notch" />
              <div className="nb-phone-screen">
                <div className="nb-phone-header">
                  <span className="nb-phone-logo urdu" dir="rtl">نبض</span>
                  <span className="nb-phone-session">Guest session</span>
                </div>
                <div className="nb-phone-chat">
                  <div className="nb-chat-prompt urdu" dir="rtl">
                    <strong>آج آپ کی طبیعت کیسی ہے؟</strong>
                    <small>How are you feeling today?</small>
                  </div>
                  <div className="nb-chat-bubble nb-chat-user urdu" dir="rtl">
                    مجھے بخار اور سر درد ہے
                  </div>
                  <div className="nb-chat-bubble nb-chat-bot">
                    <span className="urdu" dir="rtl">کب سے یہ تکلیف ہے؟</span>
                    <small>How long has this been going on?</small>
                  </div>
                  <div className="nb-chat-bubble nb-chat-user urdu" dir="rtl">
                    تین دن سے
                  </div>
                  <div className="nb-chat-typing">
                    <span /><span /><span />
                  </div>
                </div>
                <div className="nb-phone-input">
                  <Icon name="mic" className="nb-phone-mic" />
                  <span className="urdu" dir="rtl">بولیں یا لکھیں</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── SOCIAL PROOF STRIP ── */}
        <div className="nb-proof-strip">
          <div><strong>Urdu</strong><span>native language</span></div>
          <div className="nb-proof-div" aria-hidden="true" />
          <div><strong>≤ 5</strong><span>questions per session</span></div>
          <div className="nb-proof-div" aria-hidden="true" />
          <div><strong>12+</strong><span>features</span></div>
          <div className="nb-proof-div" aria-hidden="true" />
          <div><strong>WHO/FDA</strong><span>verified drug data</span></div>
        </div>

        {/* ── VIDEO DEMO ── */}
        <section className="nb-section nb-demo-section" id="demo">
          <div className="nb-section-head">
            <h2 className="nb-h2">See it in 30 seconds</h2>
            <p className="nb-section-ur urdu" dir="rtl">۳۰ سیکنڈ میں دیکھیں</p>
          </div>
          <div className="nb-video-wrap">
            <video
              controls
              playsInline
              preload="metadata"
              poster="/nabz-demo-poster.jpg"
              className="nb-video"
            >
              <source src="/nabz-demo.mp4" type="video/mp4" />
            </video>
          </div>
          <p className="nb-video-hint">🔊 Turn sound on for the full experience</p>
        </section>

        {/* ── HOW IT WORKS ── */}
        <section className="nb-section nb-how-section" id="how">
          <div className="nb-section-head">
            <p className="nb-label">THE PROCESS</p>
            <h2 className="nb-h2">Three steps. Two minutes.</h2>
            <p className="nb-section-ur urdu" dir="rtl">تین قدم — دو منٹ</p>
          </div>
          <div className="nb-steps">
            {STEPS.map((s, i) => (
              <div className="nb-step" key={i}>
                <div className="nb-step-num">{i + 1}</div>
                <div className="nb-step-connector" aria-hidden="true" />
                <h3 className="nb-step-en">{s.en}</h3>
                <p className="nb-step-ur urdu" dir="rtl">{s.urdu}</p>
                <p className="nb-step-detail">{s.detail}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ============ VAULT SHOWCASE ============ */}
        <section className="nb-vault-section" id="vault">
          <div className="nb-vault-inner">

            <div className="nb-vault-copy">
              <p className="nb-label nb-label-marigold">FAMILY MEDICAL VAULT</p>
              <h2 className="nb-h2 nb-h2-light">
                Every document.<br/>Always with you.
              </h2>
              <p className="nb-vault-ur urdu" dir="rtl">خاندانی صحت والٹ — تمام رپورٹس ایک جگہ</p>
              <p className="nb-vault-lead">
                Upload once. Nabz reads, summarizes, and remembers every medical
                document — so your whole health history is in every conversation,
                without you having to repeat yourself.
              </p>

              <div className="nb-vault-doc-types">
                {VAULT_DOCS.map((d) => (
                  <div className="nb-vault-doc-type" key={d.type}>
                    <div className={`nb-vault-doc-ico nb-vault-ico-${d.type}`}>
                      <span>{d.emoji}</span>
                    </div>
                    <div className="nb-vault-doc-body">
                      <div className="nb-vault-doc-labels">
                        <strong>{d.en}</strong>
                        <span className="nb-vault-doc-ur urdu" dir="rtl">{d.urdu}</span>
                      </div>
                      <p className="nb-vault-doc-desc">{d.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="nb-vault-visual">
              <div className="nb-vault-card">
                <div className="nb-vault-card-head">
                  <div className="nb-vault-card-title">
                    <Icon name="vault" className="nb-vault-head-icon" />
                    <span>Ahmad's Vault</span>
                  </div>
                  <small>6 documents · all private</small>
                </div>

                <div className="nb-vault-doc-list">
                  {[
                    { emoji: '🩻', name: 'Chest X-ray — July 2024',  date: '12 Jul', badge: 'analyzed', ai: 'No abnormalities found. Lungs clear.' },
                    { emoji: '🧪', name: 'CBC Blood Test',            date: '3 Jun',  badge: 'flagged',  ai: '⚠ Haemoglobin low — 10.8 g/dL' },
                    { emoji: '📋', name: "Dr. Asif's prescription",   date: '1 Jun',  badge: 'analyzed', ai: 'Amoxicillin 500mg, twice daily, 7 days.' },
                    { emoji: '🧠', name: 'Brain MRI report',          date: '15 May', badge: 'new',       ai: null },
                    { emoji: '📸', name: 'Skin rash — right arm',     date: '2 May',  badge: 'analyzed', ai: 'Possible contact dermatitis.' },
                  ].map((doc, i) => (
                    <div className="nb-vault-row" key={i}>
                      <span className="nb-vault-thumb">{doc.emoji}</span>
                      <div className="nb-vault-row-info">
                        <strong>{doc.name}</strong>
                        {doc.ai
                          ? <span className="nb-vault-ai">{doc.ai}</span>
                          : <span className="nb-vault-pending">AI analysis in progress…</span>
                        }
                      </div>
                      <span className={`nb-vault-badge nb-vault-badge-${doc.badge}`}>
                        {doc.badge === 'analyzed' ? '✓' : doc.badge === 'flagged' ? '⚠' : '●'}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="nb-vault-points">
                  {VAULT_POINTS.map((p) => (
                    <div className="nb-vault-point" key={p.en}>
                      <div className="nb-vault-point-ico">
                        <Icon name={p.icon} />
                      </div>
                      <div className="nb-vault-point-body">
                        <strong>{p.en}</strong>
                        <span className="nb-vault-point-ur urdu" dir="rtl">{p.urdu}</span>
                        <p>{p.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="nb-vault-cta-row">
                <button className="nb-btn-marigold nb-btn-lg" onClick={openChat}>
                  {account ? 'Open your Vault' : 'Start your Vault — free'}
                  <Icon name="arrow" />
                </button>
                <span className="nb-vault-cta-note">No account needed to try Nabz</span>
              </div>
            </div>

          </div>
        </section>

        {/* ── HERO FEATURES (3 large cards) ── */}
        <section className="nb-section nb-hero-features-section" id="features">
          <div className="nb-section-head">
            <p className="nb-label">WHAT IT DOES</p>
            <h2 className="nb-h2">Everything your family needs</h2>
            <p className="nb-section-ur urdu" dir="rtl">مکمل صحت کا نظام</p>
          </div>

          <div className="nb-hero-features">
            {HERO_FEATURES.map((f) => (
              <div className="nb-hfeat" key={f.icon}>
                <div className="nb-hfeat-icon">
                  <Icon name={f.icon} />
                </div>
                <h3 className="nb-hfeat-en">{f.en}</h3>
                <p className="nb-hfeat-ur urdu" dir="rtl">{f.urdu}</p>
                <p className="nb-hfeat-desc">{f.desc}</p>
              </div>
            ))}
          </div>

          {/* secondary feature grid — no hover tricks, direct display */}
          <div className="nb-feat-grid">
            {ALL_FEATURES.map((f) => (
              <div className="nb-feat" key={f.icon}>
                <div className="nb-feat-icon">
                  <Icon name={f.icon} />
                </div>
                <div className="nb-feat-body">
                  <h4 className="nb-feat-en">{f.en}</h4>
                  <p className="nb-feat-ur urdu" dir="rtl">{f.urdu}</p>
                  <p className="nb-feat-desc">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── SAFETY ── */}
        <section className="nb-safety-band" id="safety">
          <div className="nb-safety-inner">
            <div className="nb-safety-copy">
              <p className="nb-label nb-label-light">SAFETY FIRST</p>
              <h2 className="nb-h2 nb-h2-light">Helpful. Honest. Safe.</h2>
              <p className="nb-section-ur nb-section-ur-light urdu" dir="rtl">مددگار، ذمہ دار، محفوظ</p>
              <p className="nb-safety-lead">
                Nabz is not a replacement for a doctor. It helps you understand
                what's happening and decide when to seek care.
              </p>
              <ul className="nb-safety-list">
                <li>
                  <Icon name="check" className="nb-check-icon" />
                  <span>Only WHO/FDA-verified drug data</span>
                </li>
                <li>
                  <Icon name="check" className="nb-check-icon" />
                  <span>Automatic allergy and pregnancy checks</span>
                </li>
                <li>
                  <Icon name="check" className="nb-check-icon" />
                  <span>Escalates to emergency services when symptoms are serious</span>
                </li>
              </ul>
            </div>

            <div className="nb-safety-card">
              <Icon name="emergency" className="nb-emerg-icon" />
              <h3>Emergency?</h3>
              <p className="urdu" dir="rtl">ہنگامی حالت؟</p>
              <p>Call <strong>1122</strong> or go to the nearest emergency room immediately.</p>
              <p className="urdu" dir="rtl">فوراً <strong>۱۱۲۲</strong> ملائیں</p>
              <button className="nb-btn-white" onClick={openChat}>
                Open Nabz <Icon name="arrow" />
              </button>
            </div>
          </div>
        </section>

        {/* ── FINAL CTA ── */}
        <section className="nb-final-cta">
          <div className="nb-final-inner">
            <p className="nb-label">FREE · NO ACCOUNT REQUIRED</p>
            <h2 className="nb-h2">Tell Nabz how you feel.</h2>
            <p className="nb-final-ur urdu" dir="rtl">آج اپنی تکلیف بتائیں — اپنی زبان میں</p>
            <button className="nb-btn-clay nb-btn-lg" onClick={openChat}>
              {account ? 'Open Nabz' : 'Start for free'}
              <Icon name="arrow" />
            </button>
          </div>
        </section>

      </main>

      <footer className="nb-footer">
        <button className="nb-brand nb-brand-sm" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          <span className="nb-brand-pulse"><Icon name="pulse" /></span>
          <span className="nb-brand-name">
            <strong className="urdu" dir="rtl">نبض</strong>
            <small>NABZ</small>
          </span>
        </button>
        <p>General health guidance only. Not a substitute for professional medical advice. For emergencies call 1122.</p>
        <button className="nb-footer-link" onClick={() => navigate('/privacy')}>Privacy policy</button>
      </footer>

    </div>
  )
}
