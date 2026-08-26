import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// Feature list — Urdu-primary, English secondary. Urdu written as a
// Pakistani would actually speak it, not a literal English translation.
const FEATURES = [
  {
    icon: 'voice', tag: 'VOICE',
    urdu_title: 'اردو میں آواز سے بات کریں',
    en_title: 'Talk in your own language',
    urdu_body: 'اردو، رومن اردو یا انگریزی — جس زبان میں آسانی ہو، بات کریں۔ نبض سمجھے گا۔',
    en_body: 'Speak in Urdu, Roman Urdu or English. Nabz understands all three.',
  },
  {
    icon: 'photo', tag: 'PHOTO',
    urdu_title: 'زخم یا داغ کی تصویر بھیجیں',
    en_title: 'Send a photo of the concern',
    urdu_body: 'کیسا داغ ہے، سوجن کہاں تک ہے — تصویر سے AI بہتر اندازہ لگاتا ہے۔',
    en_body: 'For visible marks, wounds, or rashes, a photo helps AI narrow the differential.',
  },
  {
    icon: 'family', tag: 'FAMILY',
    urdu_title: 'پورے گھر کا الگ الگ ریکارڈ',
    en_title: 'A separate record for every family member',
    urdu_body: 'امی، ابو، بچوں سب کی گفتگو اور ادویات الگ محفوظ — ایک ہی اکاؤنٹ میں۔',
    en_body: 'Mother, father, kids — each person has their own history in one account.',
  },
  {
    icon: 'vault', tag: 'VAULT',
    urdu_title: 'رپورٹس اور نسخے محفوظ',
    en_title: 'Lab reports and prescriptions safe forever',
    urdu_body: 'رپورٹ کی تصویر لگائیں — AI اہم چیزیں نکالے گا اور اگلی بار خودبخود یاد رکھے گا۔',
    en_body: 'Upload a lab report; AI extracts the key values and remembers them next time.',
  },
  {
    icon: 'lab', tag: 'LAB EXPLAIN',
    urdu_title: 'لیب رپورٹ آسان زبان میں سمجھیں',
    en_title: 'Understand your lab report',
    urdu_body: 'حیران کن نمبروں کے پیچھے کیا ہے؟ نبض ہر خطرے والے قدر کی وضاحت کرتا ہے۔',
    en_body: 'Flagged values explained in plain Urdu and English — no medical jargon.',
  },
  {
    icon: 'prescription', tag: 'PRESCRIPTION',
    urdu_title: 'نسخہ اسکین کریں',
    en_title: 'Scan a paper prescription',
    urdu_body: 'ڈاکٹر کے نسخے کی تصویر لگائیں، AI پڑھ کر ادویات کی فہرست بنا دے گا — آپ تصدیق کریں۔',
    en_body: 'Photograph a doctor prescription; AI drafts the medicine list for you to confirm.',
  },
  {
    icon: 'handoff', tag: 'DOCTOR HANDOFF',
    urdu_title: 'ڈاکٹر کو QR سے پوری کہانی بھیجیں',
    en_title: 'Hand off to a doctor with one QR code',
    urdu_body: 'ڈاکٹر کے پاس جانے سے پہلے، QR اسکین کریں — پوری تشخیص، ادویات اور ٹیسٹ ایک نظر میں۔',
    en_body: 'Before your visit, generate a QR — doctor sees the full assessment in 30 seconds.',
  },
  {
    icon: 'location', tag: 'NEARBY CARE',
    urdu_title: 'قریب ترین ہسپتال، فارمیسی یا بلڈ بینک',
    en_title: 'Nearest hospital, pharmacy or blood bank',
    urdu_body: 'اپنے شہر میں تصدیق شدہ ہسپتال، کلینک، فارمیسی اور بلڈ بینک — فاصلہ اور فون نمبر سمیت۔',
    en_body: 'Curated PK facilities directory with distance, phone, and directions.',
  },
  {
    icon: 'pk', tag: 'PK CONTEXT',
    urdu_title: 'پاکستان کی وباؤں کے حساب سے تشخیص',
    en_title: 'Diagnosis ranked for Pakistani seasons',
    urdu_body: 'ڈینگی، ٹائیفائیڈ، ملیریا — مہینے اور صوبے کے حساب سے AI پہلے ان پر سوچتا ہے۔',
    en_body: 'Dengue, typhoid, malaria — weighted by month + province, not generic prevalence.',
  },
  {
    icon: 'memory', tag: 'MEMORY',
    urdu_title: 'پرانی گفتگو یاد رکھتا ہے',
    en_title: 'Remembers your past conversations',
    urdu_body: 'اگلی بار جب آپ آئیں، AI کو یاد ہو گا کہ پچھلی بار کیا مسئلہ تھا اور کیا مشورہ دیا گیا۔',
    en_body: 'Cross-session memory — Nabz picks up where the last chat left off.',
  },
  {
    icon: 'safety', tag: 'SAFETY',
    urdu_title: 'ادویات کی حفاظتی جانچ',
    en_title: 'Built-in medication safety checks',
    urdu_body: 'الرجی، حمل، عمر — AI ہر دوا کی تجویز سے پہلے یہ سب دیکھتا ہے۔ صرف WHO/FDA سے تصدیق شدہ ادویات۔',
    en_body: 'Every drug suggestion checked against allergies, pregnancy, age — WHO/FDA sourced.',
  },
  {
    icon: 'emergency', tag: 'EMERGENCY',
    urdu_title: 'ہنگامی حالت میں فوراً 1122',
    en_title: 'Rescue 1122 one tap away',
    urdu_body: 'اگر AI کو سنگین علامات ملیں، فوراً ریسکیو 1122 اور نزدیکی ایمرجنسی کی سمت بتاتا ہے۔',
    en_body: 'On red-flag symptoms Nabz routes you to 1122 and the nearest emergency room.',
  },
]

const STEPS = [
  {
    n: '۱', ne: '01',
    urdu_title: 'اپنی تکلیف بتائیں',
    en_title: 'Tell Nabz what is wrong',
    urdu_body: 'بولیں، لکھیں یا تصویر بھیجیں — کسی بھی طریقے سے۔',
    en_body: 'Voice, text or photo — whichever is easiest.',
  },
  {
    n: '۲', ne: '02',
    urdu_title: 'ذہین سوالات کے جواب دیں',
    en_title: 'Answer smart follow-up questions',
    urdu_body: 'نبض ایک تجربہ کار ڈاکٹر کی طرح صرف اہم سوال پوچھتا ہے — لمبی لسٹ نہیں۔',
    en_body: 'Like an experienced GP: only the questions that change the outcome.',
  },
  {
    n: '۳', ne: '03',
    urdu_title: 'واضح مشورہ اور اگلا قدم',
    en_title: 'Clear plan and next step',
    urdu_body: 'کیا ممکن ہے، گھر پر کیا کریں، کب ڈاکٹر کے پاس جائیں — سب واضح۔',
    en_body: 'What it might be, what to do at home, when to see a doctor — all plain.',
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
            <div className="landing-kicker"><span /> <span className="urdu" dir="rtl">پاکستانی گھرانوں کے لیے</span> · Built for Pakistan</div>
            <h1 className="urdu urdu-hero-xl" dir="rtl">پورے گھر کی صحت،<br/>ایک ہی جگہ۔</h1>
            <p className="landing-hero-en">Your family's health, finally in one place.</p>
            <p className="landing-lead urdu" dir="rtl">
              اپنی زبان میں تکلیف بتائیں، نبض ایک تجربہ کار ڈاکٹر کی طرح اہم سوال پوچھے گا،
              پھر واضح مشورہ اور اگلا قدم بتائے گا — ادویات، ٹیسٹ اور ڈاکٹر ہینڈ آف سمیت۔
            </p>
            <p className="landing-lead-en">
              Chat naturally in Urdu, Roman Urdu or English. Nabz asks the right questions
              like a Pakistani GP, then gives clear guidance — medication, lab tests, and a
              doctor-ready handoff.
            </p>
            <div className="landing-hero-actions">
              <button className="landing-primary" onClick={openChat}>
                <span className="urdu" dir="rtl">{account ? 'گفتگو کھولیں' : 'ابھی گفتگو شروع کریں'}</span>
                <Icon name="arrow" />
              </button>
              <button className="landing-secondary" onClick={() => document.querySelector('#demo')?.scrollIntoView({ behavior: 'smooth' })}>
                <Icon name="play" /> <span className="urdu" dir="rtl">ڈیمو دیکھیں</span> <small>Watch demo</small>
              </button>
            </div>
            <div className="landing-assurances">
              <span><Icon name="shield" /> <span className="urdu" dir="rtl">پرائیویٹ والٹ</span></span>
              <span><Icon name="pulse" /> <span className="urdu" dir="rtl">فوری urgency</span></span>
              <span><span className="urdu" dir="rtl">اردو · رومن اردو · English</span></span>
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
            <span className="landing-kicker"><span className="urdu" dir="rtl">۳۰ سیکنڈ ڈیمو</span> · 30-second demo</span>
            <h2 className="urdu urdu-h2" dir="rtl">دیکھیں نبض کیسے کام کرتا ہے</h2>
            <p className="urdu" dir="rtl">اصلی مریض کی ایک مثال — سر درد، بخار، اور نبض کا مشورہ۔</p>
            <p className="landing-en-sub">See a real example — headache + fever + Nabz's advice.</p>
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
              <span className="urdu" dir="rtl">آواز آن کر کے دیکھیں</span>
              <small>Turn sound on for the full experience</small>
            </div>
          </div>
        </section>

        {/* ============ TRUST STRIP ============ */}
        <section className="landing-trust landing-trust-v2" aria-label="Nabz stats">
          <div><strong>3</strong><span className="urdu" dir="rtl">زبانیں</span><small>Languages</small></div>
          <div><strong>12+</strong><span className="urdu" dir="rtl">خصوصیات</span><small>Features</small></div>
          <div><strong>5</strong><span className="urdu" dir="rtl">سوال زیادہ سے زیادہ</span><small>Max questions</small></div>
          <div><strong>WHO/FDA</strong><span className="urdu" dir="rtl">ذرائع سے تصدیق شدہ</span><small>Sourced</small></div>
        </section>

        {/* ============ HOW IT WORKS ============ */}
        <section className="landing-section steps-section" id="how">
          <div className="landing-section-head">
            <span className="landing-kicker"><span className="urdu" dir="rtl">تین آسان قدم</span> · Three simple steps</span>
            <h2 className="urdu urdu-h2" dir="rtl">آسان طریقہ، واضح مشورہ</h2>
            <p className="urdu" dir="rtl">نبض آپ کی گفتگو، ریکارڈ، اور علاج کی جگہ — سب کو جوڑتا ہے۔</p>
          </div>
          <div className="landing-steps">
            {STEPS.map((s) => (
              <article className="landing-step" key={s.ne}>
                <span className="step-number urdu" dir="rtl">{s.n}</span>
                <h3 className="urdu" dir="rtl">{s.urdu_title}</h3>
                <p className="urdu step-urdu-body" dir="rtl">{s.urdu_body}</p>
                <small className="step-en">{s.en_title} — {s.en_body}</small>
              </article>
            ))}
          </div>
        </section>

        {/* ============ FEATURES ============ */}
        <section className="landing-section features-section" id="features">
          <div className="landing-section-head compact">
            <span className="landing-kicker"><span className="urdu" dir="rtl">صرف چیٹ نہیں</span> · More than a chat</span>
            <h2 className="urdu urdu-h2" dir="rtl">پورا ہیلتھ ورک اسپیس</h2>
            <p className="urdu" dir="rtl">۱۲ سے زیادہ خصوصیات — سب پاکستانی گھرانوں کے لیے بنائی گئیں۔</p>
          </div>
          <div className="landing-feature-grid landing-feature-grid-v2">
            {FEATURES.map((f) => (
              <article className="landing-feature landing-feature-v2" key={f.tag}>
                <div className="feature-icon"><Icon name={f.icon} /></div>
                <span className="feature-eyebrow">{f.tag}</span>
                <h3 className="urdu feature-urdu-title" dir="rtl">{f.urdu_title}</h3>
                <p className="feature-en-title">{f.en_title}</p>
                <p className="urdu feature-urdu-body" dir="rtl">{f.urdu_body}</p>
                <small className="feature-en-body">{f.en_body}</small>
              </article>
            ))}
          </div>
        </section>

        {/* ============ SAFETY ============ */}
        <section className="landing-safety" id="safety">
          <div className="safety-copy">
            <span className="landing-kicker light"><span className="urdu" dir="rtl">محفوظ فیصلوں کے لیے</span> · Made for safer decisions</span>
            <h2 className="urdu urdu-h2" dir="rtl">مددگار مشورہ، دیانتدار حدود</h2>
            <p className="landing-en-sub">Helpful guidance. Honest limits.</p>
            <p className="urdu" dir="rtl">
              نبض AI ہیلتھ گائیڈ ہے — ڈاکٹر کا متبادل نہیں۔ سنگین علامات پر یہ آپ کو
              فوراً ایمرجنسی کی طرف بھیجتا ہے۔
            </p>
            <ul>
              <li><Icon name="shield" /> <span className="urdu" dir="rtl">لیب اور نسخہ محفوظ کرنے سے پہلے تصدیق</span></li>
              <li><Icon name="shield" /> <span className="urdu" dir="rtl">ادویات پر الرجی اور حمل کی خودکار جانچ</span></li>
              <li><Icon name="shield" /> <span className="urdu" dir="rtl">سنگین علامات پر ریسکیو 1122 کی سمت</span></li>
            </ul>
          </div>
          <div className="safety-card">
            <span className="safety-card-icon"><Icon name="emergency" /></span>
            <small><span className="urdu" dir="rtl">اگر حالت سنگین لگے</span></small>
            <h3 className="urdu" dir="rtl">AI کا جواب مت روکیں</h3>
            <p className="urdu" dir="rtl">
              فوراً <strong>ریسکیو 1122</strong>، <strong>پولیس 15</strong>، یا نزدیکی ایمرجنسی جائیں۔
            </p>
            <button onClick={openChat}><span className="urdu" dir="rtl">نبض کھولیں</span> <Icon name="arrow" /></button>
          </div>
        </section>

        {/* ============ FINAL CTA ============ */}
        <section className="landing-final-cta">
          <div>
            <span className="landing-kicker"><span className="urdu" dir="rtl">آپ کی آواز، آپ کی صحت</span></span>
            <h2 className="urdu urdu-h2" dir="rtl">آج اپنی تکلیف بتائیں</h2>
            <p className="urdu" dir="rtl">جو بھی مسئلہ ہے، اپنی زبان میں بتائیں — نبض سنے گا، سمجھے گا۔</p>
          </div>
          <button className="landing-primary" onClick={openChat}>
            <span className="urdu" dir="rtl">{account ? 'اپنے ورک اسپیس پر جائیں' : 'مفت آزمائیں'}</span>
            <Icon name="arrow" />
          </button>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-brand footer-brand">
          <span className="landing-brand-mark"><Icon name="pulse" /></span>
          <span><b className="urdu">نبض</b><small>NABZ · <span className="urdu" dir="rtl">آپ کی آواز، آپ کی صحت</span></small></span>
        </div>
        <p className="urdu" dir="rtl">عام صحت کا مشورہ ہے — ہنگامی حالت میں 1122 یا نزدیکی ایمرجنسی پر جائیں۔</p>
        <button onClick={() => navigate('/privacy')}><span className="urdu" dir="rtl">پرائیویسی</span></button>
      </footer>
    </div>
  )
}
