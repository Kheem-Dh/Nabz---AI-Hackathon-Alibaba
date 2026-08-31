import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getConsentStatus, getPrivacyActivity, updateConsentChoices } from '../api'
import { useAuth } from '../context/AuthContext'

const ACTIVITY_LABELS = {
  'consent.granted':          { ur: 'رضامندی دی گئی',              en: 'Consent granted' },
  'consent.revoked':          { ur: 'رضامندی واپس لی گئی',           en: 'Consent withdrawn' },
  'profile.created':          { ur: 'نیا پروفائل بنایا',              en: 'Profile created' },
  'profile.updated':          { ur: 'پروفائل اپ ڈیٹ',               en: 'Profile updated' },
  'profile.deleted':          { ur: 'پروفائل حذف',                    en: 'Profile deleted' },
  'triage.started':           { ur: 'AI اسیسمنٹ شروع',              en: 'AI assessment started' },
  'triage.completed':         { ur: 'AI اسیسمنٹ مکمل',              en: 'AI assessment completed' },
  'document.saved':           { ur: 'دستاویز محفوظ',                 en: 'Vault document saved' },
  'document.processed':       { ur: 'دستاویز پر AI پروسیسنگ',       en: 'Document processed with AI' },
  'document.source_attached': { ur: 'دستاویز کا ماخذ منسلک',         en: 'Document source attached' },
  'document.deleted':         { ur: 'دستاویز حذف',                    en: 'Vault document deleted' },
  'prescription.confirmed':   { ur: 'نسخہ کی تصدیق',                 en: 'Prescription confirmed' },
  'summary.generated':        { ur: 'ڈاکٹر ہینڈ آف تیار',            en: 'Doctor handoff generated' },
}

function formatActivityDate(value) {
  if (!value) return ''
  return new Intl.DateTimeFormat('en-PK', {
    dateStyle: 'medium', timeStyle: 'short',
  }).format(new Date(value))
}

export default function PrivacyPage({ required = false, initialStatus = null, onConsentChange }) {
  const navigate = useNavigate()
  const { account } = useAuth()
  const [status, setStatus] = useState(initialStatus)
  const [activity, setActivity] = useState([])
  const [choices, setChoices] = useState({ health_data_storage: false, ai_processing: false })
  const [loading, setLoading] = useState(Boolean(account && !initialStatus))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!account) return
    let alive = true
    Promise.all([getConsentStatus(), getPrivacyActivity(30)])
      .then(([nextStatus, nextActivity]) => {
        if (!alive) return
        setStatus(nextStatus)
        setChoices({
          health_data_storage: Boolean(nextStatus.consents?.health_data_storage?.granted),
          ai_processing: Boolean(nextStatus.consents?.ai_processing?.granted),
        })
        setActivity(nextActivity.events || [])
        onConsentChange?.(nextStatus)
      })
      .catch((err) => alive && setError(err.message || 'Could not load privacy settings.'))
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [account?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!initialStatus) return
    setStatus(initialStatus)
    setChoices({
      health_data_storage: Boolean(initialStatus.consents?.health_data_storage?.granted),
      ai_processing: Boolean(initialStatus.consents?.ai_processing?.granted),
    })
  }, [initialStatus])

  const changed = useMemo(() => {
    if (!status) return false
    return Object.entries(choices).some(([key, value]) =>
      Boolean(status.consents?.[key]?.granted) !== value)
  }, [choices, status])

  async function saveChoices() {
    if (required && (!choices.health_data_storage || !choices.ai_processing)) {
      setError('Accept both choices to use clinical AI and save health records.')
      return
    }
    setSaving(true)
    setSaved(false)
    setError('')
    try {
      const next = await updateConsentChoices(
        choices,
        required ? 'existing_user_gate' : 'privacy_page',
      )
      const nextActivity = await getPrivacyActivity(30)
      setStatus(next)
      setActivity(nextActivity.events || [])
      setSaved(true)
      onConsentChange?.(next)
    } catch (err) {
      setError(err.message || 'Could not save consent choices.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={`page privacy-page ${required ? 'privacy-required' : ''}`}>
      {!required && <button className="back-link" onClick={() => navigate(-1)}>‹ <span className="urdu" dir="rtl">واپس</span></button>}

      <header className="privacy-hero-v2">
        <div className="privacy-hero-icon" aria-hidden="true">🔒</div>
        <h1 className="urdu privacy-hero-urdu" dir="rtl">پرائیویسی اور رضامندی</h1>
        <p className="privacy-hero-en">Privacy &amp; consent</p>
        <p className="urdu privacy-hero-lead" dir="rtl">
          آپ کا ڈیٹا آپ کا ہے۔ نبض آپ کی صحت کی معلومات صرف آپ کی مدد کے لیے
          محفوظ کرتا ہے — بیچنے، شیئر کرنے یا AI ٹریننگ کے لیے نہیں۔
        </p>
        <p className="privacy-hero-lead-en">
          Your data is yours. Nabz stores health information only to help you and your family.
        </p>
      </header>

      {required && (
        <div className="privacy-gate-intro">
          <span className="urdu" dir="rtl">ایک بار کی تصدیق</span>
          <h2 className="urdu" dir="rtl">اپنی رضامندی کی تصدیق کریں</h2>
          <p className="urdu" dir="rtl">
            نئے اسیسمنٹ یا دستاویز اپلوڈ سے پہلے موجودہ رضامندی کی تصدیق ضروری ہے۔
          </p>
        </div>
      )}

      {account && (
        <div className="card privacy-controls privacy-controls-v2">
          <div className="privacy-control-head">
            <div>
              <span className="urdu" dir="rtl">آپ کے فیصلے</span>
              <h2 className="urdu" dir="rtl">اجازتیں</h2>
              <small className="privacy-en-sub">Clinical data permissions</small>
            </div>
            {status?.complete && <b className="privacy-current"><span className="urdu" dir="rtl">فعال</span></b>}
          </div>
          {loading ? <div className="muted"><span className="urdu" dir="rtl">لوڈ ہو رہا ہے…</span></div> : (
            <>
              <label className="privacy-choice">
                <input type="checkbox" checked={choices.health_data_storage} onChange={(event) => { setSaved(false); setChoices((value) => ({ ...value, health_data_storage: event.target.checked })) }} />
                <span>
                  <b className="urdu" dir="rtl">صحت کی معلومات محفوظ کریں</b>
                  <small className="urdu" dir="rtl">پروفائل، والٹ ریکارڈ، اسیسمنٹ ہسٹری اور تصدیق شدہ دستاویزات آپ کے اکاؤنٹ میں محفوظ رہیں۔</small>
                  <small className="privacy-en-sub-tight">Save profiles, Vault records, assessments, confirmed documents.</small>
                </span>
              </label>
              <label className="privacy-choice">
                <input type="checkbox" checked={choices.ai_processing} onChange={(event) => { setSaved(false); setChoices((value) => ({ ...value, ai_processing: event.target.checked })) }} />
                <span>
                  <b className="urdu" dir="rtl">AI سے پروسیس کریں</b>
                  <small className="urdu" dir="rtl">پروفائل کا متعلقہ سیاق اور آپ کی بھیجی گئی معلومات صرف اسیسمنٹ اور دستاویز کی وضاحت کے لیے۔ کبھی ماڈل ٹریننگ کے لیے نہیں۔</small>
                  <small className="privacy-en-sub-tight">Relevant context for triage and document explanations — never for training.</small>
                </span>
              </label>
              <p className="privacy-withdraw-note urdu" dir="rtl">
                آپ جب چاہیں کوئی بھی رضامندی واپس لے سکتے ہیں۔ واپسی سے نئی AI پروسیسنگ اور صحت کے نئے ریکارڈ رک جاتے ہیں —
                پرانے ریکارڈ آپ کے پاس ہی رہتے ہیں اور آپ خود انہیں دیکھ یا حذف کر سکتے ہیں۔
              </p>
              {error && <div className="form-error">{error}</div>}
              {saved && <div className="notice notice-ok"><span className="urdu" dir="rtl">✓ رضامندی محفوظ ہو گئی</span></div>}
              <button className="btn btn-primary" disabled={saving || (!changed && !required)} onClick={saveChoices}>
                {saving ? (
                  <span className="urdu" dir="rtl">محفوظ ہو رہا ہے…</span>
                ) : required ? (
                  <span className="urdu" dir="rtl">قبول کریں اور جاری رکھیں</span>
                ) : (
                  <span className="urdu" dir="rtl">فیصلے محفوظ کریں</span>
                )}
              </button>
            </>
          )}
        </div>
      )}

      <section className="privacy-rights-v2">
        <div className="privacy-rights-head">
          <h2 className="urdu" dir="rtl">آپ کے حقوق</h2>
          <small>Your rights</small>
        </div>
        <div className="privacy-rights-grid">
          {[
            ['🔒', 'صرف آپ کے اکاؤنٹ کے لیے', 'Tied to your account'],
            ['👨‍👩‍👧', 'ہر فرد کا الگ ریکارڈ', 'Each family member separate'],
            ['🚫', 'AI ٹریننگ نہیں', 'Never used to train AI'],
            ['🧾', 'محفوظ آڈٹ ریکارڈ', 'Privacy-safe audit trail'],
            ['🗑️', 'کسی بھی وقت حذف کریں', 'Delete anytime'],
            ['🔐', 'پاس ورڈ محفوظ ہیش کی صورت میں', 'Passwords stored as a secure hash'],
          ].map(([ico, ur, en], i) => (
            <div className="privacy-right-card" key={i}>
              <span className="privacy-right-ico" aria-hidden="true">{ico}</span>
              <div>
                <b className="urdu" dir="rtl">{ur}</b>
                <small>{en}</small>
              </div>
            </div>
          ))}
        </div>
      </section>

      {account && !required && (
        <div className="card privacy-activity privacy-activity-v2">
          <div className="privacy-control-head">
            <div>
              <span className="urdu" dir="rtl">حالیہ سرگرمی</span>
              <h2 className="urdu" dir="rtl">پرائیویسی ریکارڈ</h2>
              <small className="privacy-en-sub">Recent privacy events</small>
            </div>
            <small className="privacy-audit-note"><span className="urdu" dir="rtl">کوئی طبّی مواد محفوظ نہیں</span></small>
          </div>
          {activity.map((event) => {
            const label = ACTIVITY_LABELS[event.type] || { ur: event.type, en: event.type }
            return (
              <div className="privacy-event" key={event.id}>
                <i />
                <div>
                  <b className="urdu" dir="rtl">{label.ur}</b>
                  <small>{label.en} · {formatActivityDate(event.created_at)}</small>
                </div>
              </div>
            )
          })}
          {!activity.length && <p className="muted urdu" dir="rtl">آپ کی سرگرمی یہاں ظاہر ہو گی۔</p>}
        </div>
      )}

      <div className="notice notice-warn privacy-demo-notice">
        <span className="urdu" dir="rtl">یہ ایک ہیکاتھون ڈیمو ہے — اصل طبّی ریکارڈ سسٹم کے لیے مزید حفاظتی اقدامات درکار ہیں۔</span>
        <small>Hackathon/demo build — not production-grade medical infrastructure.</small>
      </div>
    </div>
  )
}
