import { useEffect, useState } from 'react'
import { listProfiles, updateConsentChoices, updateProfile } from '../api'
import { useAuth } from '../context/AuthContext'
import {
  BLOOD_GROUPS,
  validateAge,
  validateBp,
  validateBloodGroup,
  validateDob,
  validateWeight,
} from '../utils/validators'

const RELATIONS = ['Self', 'Father', 'Mother', 'Son', 'Daughter', 'Husband', 'Wife', 'Brother', 'Sister', 'Other']
const GENDERS = ['Male', 'Female', 'Other']
const COMMON_CONDITIONS = ['Diabetes', 'Hypertension', 'Asthma', 'Heart disease', 'Kidney disease', 'Thyroid', 'Migraine', 'Anaemia']
const COMMON_ALLERGIES = ['Penicillin', 'Ibuprofen', 'Sulfa drugs', 'Aspirin', 'Peanuts', 'Dust', 'Pollen', 'Latex']

// Shown once, right after registration. The user cannot reach the app until
// this is saved OR they log out and back in with a completed profile. On save
// we explicitly log out and drop them at Login with a "Log in to continue"
// toast, so registration never silently drops them into the workspace.
export default function CompleteProfilePage() {
  const { account, finishRegistration } = useAuth()
  const [selfId, setSelfId] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [form, setForm] = useState({
    display_name: account?.full_name || '',
    relation: 'Self',
    gender: '',
    date_of_birth: '',
    age: '',
    blood_group: '',
    weight_kg: '',
    bp_systolic: '',
    bp_diastolic: '',
    chronic_conditions: [],
    allergies: [],
    notes: '',
  })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [consents, setConsents] = useState({
    health_data_storage: false,
    ai_processing: false,
  })

  useEffect(() => {
    let alive = true
    listProfiles()
      .then((rows) => {
        if (!alive) return
        const self = rows.find((r) => r.is_self) || rows[0]
        if (self) {
          setSelfId(self.id)
          setForm((f) => ({
            ...f,
            display_name: f.display_name || self.display_name || '',
            relation: self.relation || 'Self',
            gender: self.gender || '',
            date_of_birth: self.date_of_birth || '',
            age: self.age != null ? String(self.age) : '',
            blood_group: self.blood_group || '',
            weight_kg: self.weight_kg != null ? String(self.weight_kg) : '',
            bp_systolic: self.bp_systolic != null ? String(self.bp_systolic) : '',
            bp_diastolic: self.bp_diastolic != null ? String(self.bp_diastolic) : '',
            chronic_conditions: Array.isArray(self.chronic_conditions) ? self.chronic_conditions : [],
            allergies: Array.isArray(self.allergies) ? self.allergies : [],
            notes: self.notes || '',
          }))
        }
      })
      .catch((e) => alive && setLoadError(e?.message || 'Could not load your profile.'))
    return () => { alive = false }
  }, [])

  function update(patch) { setForm((f) => ({ ...f, ...patch })) }
  function toggleInList(key, value) {
    setForm((f) => {
      const cur = f[key] || []
      return { ...f, [key]: cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value] }
    })
  }

  function collectErrors() {
    const next = {}
    if (!form.display_name.trim()) next.display_name = 'Enter a name.'
    if (!form.gender) next.gender = 'Select a gender.'
    if (!form.date_of_birth && !form.age) next.date_of_birth = 'Provide date of birth or age.'
    const dobErr = validateDob(form.date_of_birth)
    if (dobErr) next.date_of_birth = dobErr
    const ageErr = validateAge(form.age)
    if (ageErr) next.age = ageErr
    const bgErr = validateBloodGroup(form.blood_group)
    if (bgErr) next.blood_group = bgErr
    const wErr = validateWeight(form.weight_kg)
    if (wErr) next.weight_kg = wErr
    const bpErr = validateBp(form.bp_systolic, form.bp_diastolic)
    if (bpErr) next.bp = bpErr
    if (!consents.health_data_storage) next.health_data_storage = 'Required to save this health profile.'
    if (!consents.ai_processing) next.ai_processing = 'Required for personalised AI health guidance.'
    return next
  }

  async function submit(e) {
    e.preventDefault()
    setSaveError('')
    const v = collectErrors()
    setErrors(v)
    if (Object.keys(v).length > 0) return
    if (!selfId) { setSaveError('Profile not ready. Refresh and try again.'); return }

    setSaving(true)
    try {
      await updateConsentChoices(consents, 'registration')
      await updateProfile(selfId, {
        display_name: form.display_name.trim(),
        relation: form.relation || 'Self',
        age: form.age ? Number(form.age) : null,
        date_of_birth: form.date_of_birth || null,
        gender: form.gender || null,
        blood_group: form.blood_group || null,
        weight_kg: form.weight_kg ? Number(form.weight_kg) : null,
        bp_systolic: form.bp_systolic ? Number(form.bp_systolic) : null,
        bp_diastolic: form.bp_diastolic ? Number(form.bp_diastolic) : null,
        chronic_conditions: form.chronic_conditions,
        allergies: form.allergies,
        notes: form.notes || null,
      })
      // Force the user through login before landing on the app.
      finishRegistration(form.display_name.trim())
    } catch (e) {
      setSaveError(e?.message || 'Could not save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page complete-profile-page">
      <div className="complete-profile-card">
        <div className="onboard-kicker">One-time setup</div>
        <h1 className="onboard-title">Complete your health profile</h1>
        <p className="complete-profile-lead">
          This information stays on your account only. It is used to personalise triage —
          for example, so we don't suggest a medicine you're allergic to. You can edit it
          later from the Vault.
        </p>

        {loadError && <div className="form-error">{loadError}</div>}
        {saveError && <div className="form-error">{saveError}</div>}

        <form onSubmit={submit} noValidate>
          <div className="grid-2">
            <div className={`field ${errors.display_name ? 'has-error' : ''}`}>
              <label htmlFor="cp-name">Full name *</label>
              <input
                id="cp-name"
                className="input"
                value={form.display_name}
                onChange={(e) => update({ display_name: e.target.value })}
                required
              />
              {errors.display_name && <div className="field-error">{errors.display_name}</div>}
            </div>
            <div className="field">
              <label htmlFor="cp-rel">Relation</label>
              <select
                id="cp-rel"
                className="input"
                value={form.relation}
                onChange={(e) => update({ relation: e.target.value })}
              >
                {RELATIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>

          <div className="grid-2">
            <div className={`field ${errors.gender ? 'has-error' : ''}`}>
              <label htmlFor="cp-gender">Gender *</label>
              <select
                id="cp-gender"
                className="input"
                value={form.gender}
                onChange={(e) => update({ gender: e.target.value })}
                required
              >
                <option value="">Select…</option>
                {GENDERS.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
              {errors.gender && <div className="field-error">{errors.gender}</div>}
            </div>
            <div className={`field ${errors.blood_group ? 'has-error' : ''}`}>
              <label htmlFor="cp-blood">Blood group</label>
              <select
                id="cp-blood"
                className="input"
                value={form.blood_group}
                onChange={(e) => update({ blood_group: e.target.value })}
              >
                <option value="">Unknown</option>
                {BLOOD_GROUPS.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
              {errors.blood_group && <div className="field-error">{errors.blood_group}</div>}
            </div>
          </div>

          <div className="grid-2">
            <div className={`field ${errors.date_of_birth ? 'has-error' : ''}`}>
              <label htmlFor="cp-dob">Date of birth</label>
              <input
                id="cp-dob"
                className="input"
                type="date"
                max={new Date().toISOString().slice(0, 10)}
                value={form.date_of_birth}
                onChange={(e) => update({ date_of_birth: e.target.value })}
              />
              {errors.date_of_birth && <div className="field-error">{errors.date_of_birth}</div>}
              {!errors.date_of_birth && <div className="field-hint">Preferred — we calculate age from this.</div>}
            </div>
            <div className={`field ${errors.age ? 'has-error' : ''}`}>
              <label htmlFor="cp-age">Age (if DOB unknown)</label>
              <input
                id="cp-age"
                className="input"
                type="number"
                min="0"
                max="130"
                inputMode="numeric"
                value={form.age}
                onChange={(e) => update({ age: e.target.value.replace(/[^0-9]/g, '') })}
              />
              {errors.age && <div className="field-error">{errors.age}</div>}
            </div>
          </div>

          <div className="grid-3">
            <div className={`field ${errors.weight_kg ? 'has-error' : ''}`}>
              <label htmlFor="cp-w">Weight (kg)</label>
              <input
                id="cp-w"
                className="input"
                type="number"
                min="1"
                max="300"
                step="0.1"
                inputMode="decimal"
                value={form.weight_kg}
                onChange={(e) => update({ weight_kg: e.target.value })}
              />
              {errors.weight_kg && <div className="field-error">{errors.weight_kg}</div>}
            </div>
            <div className={`field ${errors.bp ? 'has-error' : ''}`}>
              <label htmlFor="cp-sys">Systolic BP (mmHg)</label>
              <input
                id="cp-sys"
                className="input"
                type="number"
                min="60"
                max="260"
                inputMode="numeric"
                value={form.bp_systolic}
                onChange={(e) => update({ bp_systolic: e.target.value.replace(/[^0-9]/g, '') })}
              />
            </div>
            <div className={`field ${errors.bp ? 'has-error' : ''}`}>
              <label htmlFor="cp-dia">Diastolic BP (mmHg)</label>
              <input
                id="cp-dia"
                className="input"
                type="number"
                min="30"
                max="180"
                inputMode="numeric"
                value={form.bp_diastolic}
                onChange={(e) => update({ bp_diastolic: e.target.value.replace(/[^0-9]/g, '') })}
              />
            </div>
          </div>
          {errors.bp && <div className="field-error">{errors.bp}</div>}

          <div className="field">
            <label>Chronic conditions (tap any that apply)</label>
            <div className="pill-picker">
              {COMMON_CONDITIONS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`pill compact ${form.chronic_conditions.includes(c) ? 'active' : ''}`}
                  onClick={() => toggleInList('chronic_conditions', c)}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label>Known allergies</label>
            <div className="pill-picker">
              {COMMON_ALLERGIES.map((a) => (
                <button
                  key={a}
                  type="button"
                  className={`pill compact warn ${form.allergies.includes(a) ? 'active' : ''}`}
                  onClick={() => toggleInList('allergies', a)}
                >
                  ⚠ {a}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label htmlFor="cp-notes">Notes for the doctor (optional)</label>
            <textarea
              id="cp-notes"
              className="input"
              rows={3}
              value={form.notes}
              onChange={(e) => update({ notes: e.target.value })}
              placeholder="e.g. seasonal breathing symptoms are worse with dust"
            />
          </div>

          <div className={`consent-setup ${errors.health_data_storage || errors.ai_processing ? 'has-error' : ''}`}>
            <h2>Your consent</h2>
            <p>You can review or withdraw these choices later from Privacy. Withdrawal stops new uploads and AI assessments; your existing records remain available to you.</p>
            <label>
              <input
                type="checkbox"
                checked={consents.health_data_storage}
                onChange={(e) => setConsents((value) => ({ ...value, health_data_storage: e.target.checked }))}
              />
              <span><b>Save health information</b><small>Allow Nabz to store this profile and future Vault records in your account.</small></span>
            </label>
            {errors.health_data_storage && <div className="field-error">{errors.health_data_storage}</div>}
            <label>
              <input
                type="checkbox"
                checked={consents.ai_processing}
                onChange={(e) => setConsents((value) => ({ ...value, ai_processing: e.target.checked }))}
              />
              <span><b>Use AI for health guidance</b><small>Allow selected profile information and submitted content to be processed for triage and document explanations.</small></span>
            </label>
            {errors.ai_processing && <div className="field-error">{errors.ai_processing}</div>}
          </div>

          <div className="complete-profile-actions">
            <button type="submit" className="btn btn-primary" disabled={saving || !selfId}>
              {saving ? 'Saving…' : 'Save and continue to login'}
            </button>
            <p className="complete-profile-note">
              After saving you'll be sent to the login screen to sign in and start using Nabz.
            </p>
          </div>
        </form>
      </div>
    </div>
  )
}
