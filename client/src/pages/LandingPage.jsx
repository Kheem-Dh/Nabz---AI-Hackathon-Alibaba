import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const STEPS = [
  { number: '01', title: 'Share what you are feeling', urdu: 'اپنی کیفیت اطمینان سے بتائیے', body: 'Speak naturally in Urdu, Roman Urdu or English. Typing is always available too.' },
  { number: '02', title: 'A short, thoughtful conversation', urdu: 'ضروری باتوں پر مختصر گفتگو', body: 'Nabz asks only the questions that help make the next step clearer.' },
  { number: '03', title: 'Understand what to do next', urdu: 'آپ کے لیے مناسب اگلا قدم', body: 'See practical guidance, warning signs and when it may be better to seek care.' },
]

const FEATURES = [
  { icon: 'voice', eyebrow: 'VOICE + TEXT', title: 'A conversation in your language', urdu: 'جس زبان میں آپ آسانی محسوس کریں', body: 'Urdu, Roman Urdu and English are understood, so health questions can begin naturally.' },
  { icon: 'family', eyebrow: 'FAMILY CARE', title: 'Separate care for every person', urdu: 'ہر فرد کی صحت کا الگ اور واضح ریکارڈ', body: 'Parents, children and grandparents each have their own timeline, medicines and documents.' },
  { icon: 'vault', eyebrow: 'PRIVATE VAULT', title: 'Reports become useful context', urdu: 'رپورٹس محفوظ بھی، سمجھنے میں آسان بھی', body: 'Keep reviewed reports and prescriptions ready for a future conversation or doctor visit.' },
  { icon: 'location', eyebrow: 'CARE NEARBY', title: 'Find the right place for care', urdu: 'قریب ہی مناسب طبی سہولت تلاش کیجیے', body: 'Use your confirmed location to see nearby clinics, hospitals, labs and emergency care.' },
]

function Icon({ name }) {
  const paths = {
    voice: <><path d="M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z"/><path d="M5.5 10.5v.7a6.5 6.5 0 0 0 13 0v-.7M12 17.7V21M8.5 21h7"/></>,
    family: <><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.3"/><path d="M3.5 20v-1.4A5.6 5.6 0 0 1 9 13a5.6 5.6 0 0 1 5.5 5.6V20M14.6 14.5a4.5 4.5 0 0 1 5.9 4.3V20"/></>,
    vault: <><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 5V3h10v2M8 10h8M12 7v6M8 17h8"/></>,
    location: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
    shield: <><path d="M12 3 5 6v5c0 4.6 2.8 8.1 7 10 4.2-1.9 7-5.4 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/></>,
    arrow: <><path d="M5 12h14M14 7l5 5-5 5"/></>,
    pulse: <path d="M2.5 12h4l2.1-6 4.2 12 2.2-6h6.5"/>,
    play: <path d="M8 5v14l11-7L8 5Z"/>,
    mic: <><path d="M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z"/><path d="M5.5 10.5v.7a6.5 6.5 0 0 0 13 0v-.7"/></>,
  }
  return <svg className="landing-icon" viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>
}

function ProductPreview() {
  return (
    <div className="landing-preview landing-preview-live" aria-label="Animated preview of a Nabz health conversation">
      <div className="preview-topline" />
      <div className="preview-head">
        <div className="preview-mark"><Icon name="pulse" /></div>
        <div><strong>Nabz health guide</strong><span><i /> Ready to listen</span></div>
        <span className="preview-lang">اردو · EN</span>
      </div>
      <div className="preview-profile">
        <span className="preview-avatar urdu">ا</span>
        <div><small>CARING FOR</small><strong>Ammi · Mother</strong></div>
        <span className="preview-switch">Private profile</span>
      </div>
      <div className="preview-chat preview-chat-live">
        <div className="preview-message assistant preview-line-one">
          <span className="urdu" dir="rtl">السلام علیکم، آج طبیعت کیسی محسوس ہو رہی ہے؟</span>
          <p>You can speak in the language that feels easiest.</p>
        </div>
        <div className="preview-message patient preview-line-two"><span className="urdu" dir="rtl">امی کو کل رات سے بخار اور کھانسی ہے۔</span></div>
        <div className="preview-message assistant preview-line-three">
          <span className="urdu" dir="rtl">کیا سانس لینے میں بھی کوئی دشواری محسوس ہو رہی ہے؟</span>
          <p>This helps me understand how urgent it may be.</p>
        </div>
        <div className="preview-thinking"><span /><span /><span /> Listening carefully</div>
      </div>
      <div className="preview-actions">
        <span>＋ Photo</span><strong><Icon name="mic" /> Hold to speak</strong><span>⌨ Type</span>
      </div>
      <div className="preview-result">
        <span className="result-dot" />
        <div><small>NEXT STEP</small><strong>Clear guidance, with safety signs</strong></div>
        <span>→</span>
      </div>
    </div>
  )
}

function SectionHead({ kicker, title, urdu, body }) {
  return (
    <div className="landing-section-head">
      <span className="landing-kicker">{kicker}</span>
      <h2>{title}</h2>
      <p className="landing-section-urdu urdu" dir="rtl">{urdu}</p>
      {body && <p className="landing-section-copy">{body}</p>}
    </div>
  )
}

export default function LandingPage() {
  const navigate = useNavigate()
  const { account } = useAuth()
  const openChat = () => navigate(account ? '/' : '/chat')
  const openAuth = () => navigate('/auth?mode=login')

  useEffect(() => {
    const nodes = document.querySelectorAll('[data-reveal]')
    if (!('IntersectionObserver' in window)) {
      nodes.forEach((node) => node.classList.add('is-visible'))
      return undefined
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible')
          observer.unobserve(entry.target)
        }
      })
    }, { threshold: 0.14, rootMargin: '0px 0px -8% 0px' })
    nodes.forEach((node) => observer.observe(node))
    return () => observer.disconnect()
  }, [])

  return (
    <div className="landing-page landing-homepage-theme">
      <header className="landing-nav">
        <button className="landing-brand" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="Nabz home">
          <span className="landing-brand-mark"><Icon name="pulse" /></span>
          <span><b className="urdu">نبض</b><small>NABZ</small></span>
        </button>
        <nav aria-label="Website navigation">
          <a href="#how">How it works</a>
          <a href="#demo">See Nabz</a>
          <a href="#features">What you can do</a>
          <a href="#safety">Safety</a>
        </nav>
        <div className="landing-nav-actions">
          {!account && <button className="landing-login" onClick={openAuth}>Log in</button>}
          <button className="landing-nav-cta" onClick={openChat}>{account ? 'Open Nabz' : 'Try Nabz free'} <Icon name="arrow" /></button>
        </div>
      </header>

      <main className="landing-flow">
        <section className="landing-hero" data-reveal>
          <div className="landing-hero-copy">
            <div className="landing-kicker"><span /> HEALTH GUIDANCE THAT LISTENS</div>
            <h1>Your health questions,<br/><em>heard with care.</em></h1>
            <p className="landing-hero-urdu urdu" lang="ur" dir="rtl">اپنی کیفیت اطمینان سے بتائیے، نبض مناسب اگلا قدم سمجھنے میں آپ کی مدد کرے گا۔</p>
            <p className="landing-lead">Talk through symptoms, keep family health records organised and understand when it may be time to seek care—all in one calm, bilingual space.</p>
            <div className="landing-hero-actions">
              <button className="landing-primary" onClick={openChat}>{account ? 'Continue to Nabz' : 'Start a private conversation'} <Icon name="arrow" /></button>
              <button className="landing-secondary" onClick={() => document.querySelector('#demo')?.scrollIntoView({ behavior: 'smooth' })}><Icon name="play" /> See Nabz in action</button>
            </div>
            <div className="landing-assurances">
              <span><Icon name="shield" /> Private family profiles</span>
              <span><Icon name="pulse" /> Clear safety guidance</span>
              <span>اردو · Roman Urdu · English</span>
            </div>
          </div>
          <div className="landing-visual">
            <div className="visual-orbit orbit-one" />
            <div className="visual-orbit orbit-two" />
            <div className="visual-note note-family"><Icon name="family" /><span><small>FAMILY PROFILES</small><b>Each history stays separate</b></span></div>
            <ProductPreview />
            <div className="visual-note note-care"><Icon name="location" /><span><small>CARE NEARBY</small><b>Options around you</b></span></div>
          </div>
        </section>

        <section className="landing-trust" aria-label="Nabz capabilities" data-reveal>
          <div><strong>3</strong><span>languages<br/>understood</span><small className="urdu">تین زبانیں</small></div>
          <div><strong>1</strong><span>private space for<br/>your whole family</span><small className="urdu">خاندان کے لیے</small></div>
          <div><strong>≤ 5</strong><span>focused questions<br/>per assessment</span><small className="urdu">مختصر گفتگو</small></div>
          <div><strong>24/7</strong><span>guidance when<br/>you need it</span><small className="urdu">ہر وقت دستیاب</small></div>
        </section>

        <section className="landing-section steps-section landing-flow-section" id="how" data-reveal>
          <span className="landing-flow-node" aria-hidden="true"><Icon name="pulse" /></span>
          <SectionHead kicker="A CALMER WAY TO BEGIN" title="From a concern to a clearer next step." urdu="بات آپ کی کیفیت سے شروع ہوتی ہے، تاکہ صورتِ حال کو بہتر طور پر سمجھا جا سکے۔" body="One connected conversation keeps the person, their context and the next decision together." />
          <div className="landing-steps">
            {STEPS.map((step) => (
              <article className="landing-step" key={step.number}>
                <span className="step-number">{step.number}</span>
                <h3>{step.title}</h3>
                <div className="feature-urdu urdu" dir="rtl">{step.urdu}</div>
                <p>{step.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-demo landing-flow-section" id="demo" data-reveal>
          <span className="landing-flow-node" aria-hidden="true"><Icon name="play" /></span>
          <div className="landing-demo-copy">
            <span className="landing-kicker">A REAL NABZ CONVERSATION</span>
            <h2>See how the conversation flows.</h2>
            <p className="landing-section-urdu urdu" dir="rtl">مختصر سا تعارف دیکھیے—نبض آپ کی بات کس طرح سنتا اور سمجھتا ہے۔</p>
            <p>The preview plays automatically without sound, like a GIF. Use the controls whenever you want to hear the full conversation.</p>
            <div className="landing-demo-signal" aria-hidden="true">{Array.from({ length: 9 }, (_, index) => <i key={index} />)}</div>
          </div>
          <div className="landing-demo-frame">
            <video autoPlay muted loop controls playsInline preload="metadata" poster="/nabz-demo-poster.jpg">
              <source src="/nabz-demo.mp4" type="video/mp4" />
            </video>
          </div>
        </section>

        <section className="landing-section features-section landing-flow-section" id="features" data-reveal>
          <span className="landing-flow-node" aria-hidden="true"><Icon name="vault" /></span>
          <SectionHead kicker="ONE CONNECTED HEALTH SPACE" title="Useful today. Ready for tomorrow." urdu="گفتگو، رپورٹس اور گھر کے ہر فرد کی معلومات—سب اپنی مناسب جگہ پر۔" body="Nabz brings the everyday pieces of family health into one familiar product experience." />
          <div className="landing-feature-grid">
            {FEATURES.map((feature, index) => (
              <article className="landing-feature" key={feature.title} style={{ '--reveal-delay': `${index * 70}ms` }}>
                <div className="feature-icon"><Icon name={feature.icon} /></div>
                <span className="feature-eyebrow">{feature.eyebrow}</span>
                <h3>{feature.title}</h3>
                <div className="feature-urdu urdu" dir="rtl">{feature.urdu}</div>
                <p>{feature.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-safety landing-flow-section" id="safety" data-reveal>
          <span className="landing-flow-node" aria-hidden="true"><Icon name="shield" /></span>
          <div className="safety-copy">
            <span className="landing-kicker light">HONEST ABOUT ITS LIMITS</span>
            <h2>Helpful guidance.<br/>Clear boundaries.</h2>
            <p className="landing-section-urdu urdu" lang="ur" dir="rtl">نبض صرف عمومی رہنمائی فراہم کرتا ہے؛ یہ تشخیص نہیں کرتا اور ڈاکٹر کا متبادل نہیں ہے۔</p>
            <p>Nabz helps organise what you know, surface warning signs and make the next step easier to understand. It does not replace professional medical care.</p>
            <ul>
              <li><Icon name="shield" /> You review extracted report and prescription details before saving</li>
              <li><Icon name="shield" /> Your family profiles and medical history remain separate</li>
              <li><Icon name="shield" /> Serious warning signs lead to emergency guidance, not false reassurance</li>
            </ul>
          </div>
          <div className="safety-card">
            <span className="safety-card-icon"><Icon name="pulse" /></span>
            <small>WHEN SOMETHING FEELS SERIOUS</small>
            <h3>Please seek urgent help.</h3>
            <p className="urdu" lang="ur" dir="rtl">اگر صورتِ حال سنگین محسوس ہو تو فوراً ۱۱۲۲ سے رابطہ کیجیے یا قریبی ہسپتال کے ایمرجنسی شعبے میں جائیے۔</p>
            <p>Do not wait for an AI response in an emergency.</p>
            <button onClick={openChat}>Open Nabz health guide <Icon name="arrow" /></button>
          </div>
        </section>

        <section className="landing-final-cta" data-reveal>
          <div>
            <span className="landing-kicker">YOUR VOICE. YOUR HEALTH.</span>
            <h2>A thoughtful first step, whenever you are ready.</h2>
            <p className="urdu" dir="rtl">جب آپ مناسب سمجھیں، نبض آپ کی بات سننے کے لیے حاضر ہے۔</p>
          </div>
          <button className="landing-primary" onClick={openChat}>{account ? 'Return to Nabz' : 'Begin a private conversation'} <Icon name="arrow" /></button>
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
