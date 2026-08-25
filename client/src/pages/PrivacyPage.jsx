import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getConsentStatus, getPrivacyActivity, updateConsentChoices } from '../api'
import { useAuth } from '../context/AuthContext'

const ACTIVITY_LABELS = {
  'consent.granted': 'Consent granted',
  'consent.revoked': 'Consent withdrawn',
  'profile.created': 'Family profile created',
  'profile.updated': 'Health profile updated',
  'profile.deleted': 'Family profile deleted',
  'triage.started': 'AI assessment started',
  'triage.completed': 'AI assessment completed',
  'document.saved': 'Vault document saved',
  'document.processed': 'Document processed with AI',
  'document.source_attached': 'Document source attached',
  'document.deleted': 'Vault document deleted',
  'prescription.confirmed': 'Prescription transcription confirmed',
  'summary.generated': 'Doctor handoff generated',
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
      {!required && <button className="back-link" onClick={() => navigate(-1)}>‹ واپس · Back</button>}
      <div className="section-title">
        <span className="ur urdu">پرائیویسی اور رضامندی</span>
        <span className="en">Privacy & consent</span>
      </div>

      {required && (
        <div className="privacy-gate-intro">
          <span>ONE-TIME PRIVACY CHECK</span>
          <h1>Choose how Nabz may use your health information</h1>
          <p>Existing accounts need to confirm the current privacy choices before starting new AI assessments or uploading records.</p>
        </div>
      )}

      <div className="card">
        <p className="advice-ur urdu" dir="rtl" style={{ margin: 0 }}>
          آپ کا ڈیٹا آپ کا ہے۔ نبض آپ کی صحت کی معلومات صرف آپ کی مدد کے لیے محفوظ کرتا ہے — بیچنے، شیئر کرنے یا AI ٹریننگ کے لیے نہیں۔
        </p>
        <p className="advice-en" style={{ marginTop: 10 }}>Your data is yours. Nabz stores health information only to help you and your family.</p>
      </div>

      {account && (
        <div className="card privacy-controls">
          <div className="privacy-control-head">
            <div><span>YOUR CHOICES</span><h2>Clinical data permissions</h2></div>
            {status?.complete && <b className="privacy-current">Current</b>}
          </div>
          {loading ? <div className="muted">Loading your choices…</div> : (
            <>
              <label className="privacy-choice">
                <input type="checkbox" checked={choices.health_data_storage} onChange={(event) => { setSaved(false); setChoices((value) => ({ ...value, health_data_storage: event.target.checked })) }} />
                <span><b>Store health information</b><small>Save profiles, Vault records, assessment history and confirmed documents in your account.</small></span>
              </label>
              <label className="privacy-choice">
                <input type="checkbox" checked={choices.ai_processing} onChange={(event) => { setSaved(false); setChoices((value) => ({ ...value, ai_processing: event.target.checked })) }} />
                <span><b>Process selected information with AI</b><small>Use relevant profile context and content you submit for triage and document explanations. Nabz does not use it to train models.</small></span>
              </label>
              <p className="privacy-withdraw-note">You may withdraw either choice here. Withdrawal stops new clinical AI processing and health-data writes; it does not delete existing records or prevent you from viewing and deleting them.</p>
              {error && <div className="form-error">{error}</div>}
              {saved && <div className="notice notice-ok">Privacy choices saved.</div>}
              <button className="btn btn-primary" disabled={saving || (!changed && !required)} onClick={saveChoices}>
                {saving ? 'Saving…' : required ? 'Accept and continue' : 'Save privacy choices'}
              </button>
            </>
          )}
        </div>
      )}

      <div className="card">
        {[
          ['🔒', 'آپ کی معلومات صرف آپ کے اکاؤنٹ سے جُڑی ہیں۔', 'Tied to your account only.'],
          ['👨‍👩‍👧', 'ہر فرد کا ریکارڈ الگ رہتا ہے۔', 'Each family member is kept separate.'],
          ['🚫', 'ڈیٹا AI ماڈل کی ٹریننگ کے لیے استعمال نہیں ہوتا۔', 'Never used to train AI models.'],
          ['🧾', 'حساس اقدامات کا محفوظ ریکارڈ رکھا جاتا ہے۔', 'Sensitive actions have a privacy-safe audit record.'],
          ['🗑️', 'آپ جب چاہیں اپنا ریکارڈ حذف کر سکتے ہیں۔', 'Delete your records anytime.'],
          ['🔐', 'پاس ورڈ صرف hash کی صورت میں محفوظ ہوتا ہے۔', 'Passwords are stored only as a hash.'],
        ].map(([ico, ur, en], i) => (
          <div className="med-item" key={i}>
            <span className="m-ico">{ico}</span>
            <div><div className="urdu" style={{ fontSize: 15 }} dir="rtl">{ur}</div><div className="m-meta">{en}</div></div>
          </div>
        ))}
      </div>

      {account && !required && (
        <div className="card privacy-activity">
          <div className="privacy-control-head"><div><span>ACCOUNT ACTIVITY</span><h2>Recent privacy events</h2></div><small>No clinical content is logged</small></div>
          {activity.map((event) => (
            <div className="privacy-event" key={event.id}>
              <i />
              <div><b>{ACTIVITY_LABELS[event.type] || event.type}</b><small>{event.resource_type.replaceAll('_', ' ')} · {formatActivityDate(event.created_at)}</small></div>
            </div>
          ))}
          {!activity.length && <p className="muted">Your activity history will appear here.</p>}
        </div>
      )}

      <div className="notice notice-warn">
        <span className="ur urdu">یہ ایک ہیکاتھون ڈیمو ہے — اصل طبّی ریکارڈ سسٹم کے لیے مزید حفاظتی اقدامات درکار ہیں۔</span>
        This is a hackathon/demo build — not production-grade medical-record infrastructure.
      </div>
    </div>
  )
}
