import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { createProfile, getProfile, updateProfile } from '../api'
import { useProfiles } from '../context/ProfileContext'
import {
  validateAge,
  validateBloodGroup,
  validateBp,
  validateDob,
  validateFullName,
  validateWeightForDob,
} from '../utils/validators'

const EMPTY = {
  display_name: '',
  relation: '',
  age: '',
  date_of_birth: '',
  gender: '',
  blood_group: '',
  weight_kg: '',
  bp_systolic: '',
  bp_diastolic: '',
  bp_recorded_at: '',
  chronic_conditions: '',
  allergies: '',
  notes: '',
}

// Turn a comma-separated string into a clean list, and back.
const toList = (s) =>
  (s || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)

export default function ProfileEditPage({ mode }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const { refresh } = useProfiles()
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (mode === 'edit' && id) {
      getProfile(id)
        .then((p) =>
          setForm({
            display_name: p.display_name || '',
            relation: p.relation || '',
            age: p.age ?? '',
            date_of_birth: p.date_of_birth || '',
            gender: p.gender || '',
            blood_group: p.blood_group || '',
            weight_kg: p.weight_kg ?? '',
            bp_systolic: p.bp_systolic ?? '',
            bp_diastolic: p.bp_diastolic ?? '',
            bp_recorded_at: p.bp_recorded_at || '',
            chronic_conditions: (p.chronic_conditions || []).join(', '),
            allergies: (p.allergies || []).join(', '),
            notes: p.notes || '',
          }),
        )
        .catch((e) => setError(e.message))
    }
  }, [mode, id])

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }))
    setFieldErrors((current) => ({ ...current, [k]: null }))
  }

  function collectErrors() {
    const next = {}
    const name = validateFullName(form.display_name)
    const age = validateAge(form.age)
    const dob = validateDob(form.date_of_birth)
    const weight = validateWeightForDob(form.weight_kg, form.date_of_birth)
    const blood = validateBloodGroup(form.blood_group)
    const bp = validateBp(form.bp_systolic, form.bp_diastolic)
    if (name) next.display_name = name
    if (age) next.age = age
    if (dob) next.date_of_birth = dob
    if (weight) next.weight_kg = weight
    if (blood) next.blood_group = blood
    if (bp) {
      next.bp_systolic = bp
      next.bp_diastolic = bp
    }
    return next
  }

  async function submit(e) {
    e.preventDefault()
    setError('')
    const validation = collectErrors()
    setFieldErrors(validation)
    if (Object.keys(validation).length) return
    setBusy(true)
    const payload = {
      display_name: form.display_name.trim(),
      relation: form.relation.trim() || null,
      age: form.age === '' ? null : Number(form.age),
      date_of_birth: form.date_of_birth || null,
      gender: form.gender || null,
      blood_group: form.blood_group.trim() || null,
      weight_kg: form.weight_kg === '' ? null : Number(form.weight_kg),
      bp_systolic: form.bp_systolic === '' ? null : Number(form.bp_systolic),
      bp_diastolic: form.bp_diastolic === '' ? null : Number(form.bp_diastolic),
      bp_recorded_at: form.bp_recorded_at || null,
      chronic_conditions: toList(form.chronic_conditions),
      allergies: toList(form.allergies),
      notes: form.notes.trim() || null,
    }
    try {
      if (mode === 'edit') {
        await updateProfile(id, payload)
        await refresh()
        navigate(`/profile/${id}`)
      } else {
        const created = await createProfile(payload)
        await refresh(created.id)
        navigate(`/profile/${created.id}`)
      }
    } catch (err) {
      setError(err.message || 'Could not save.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <button className="back-link" onClick={() => navigate(-1)}>
        ‹ واپس · Back
      </button>
      <div className="section-title">
        <span className="ur urdu">{mode === 'edit' ? 'پروفائل ترمیم' : 'نیا فرد'}</span>
        <span className="en">{mode === 'edit' ? 'Edit profile' : 'Add a family member'}</span>
      </div>

      {error && <div className="form-error">{error}</div>}

      <form className="card" onSubmit={submit}>
        <div className={`field ${fieldErrors.display_name ? 'has-error' : ''}`}>
          <label>
            <span className="ur urdu">نام</span> Name *
          </label>
          <input
            className="input"
            value={form.display_name}
            onChange={(e) => set('display_name', e.target.value)}
            onBlur={() => setFieldErrors((current) => ({
              ...current,
              display_name: validateFullName(form.display_name),
            }))}
          />
          {fieldErrors.display_name && <div className="field-error">{fieldErrors.display_name}</div>}
        </div>
        <div className="rx-grid">
          <div className="field">
            <label>
              <span className="ur urdu">رشتہ</span> Relation
            </label>
            <select
              className="input"
              value={form.relation}
              onChange={(e) => set('relation', e.target.value)}
            >
              <option value="">Select relation</option>
              {['Self', 'Mother', 'Father', 'Spouse', 'Daughter', 'Son', 'Sister', 'Brother', 'Other'].map((relation) => (
                <option key={relation} value={relation}>{relation}</option>
              ))}
            </select>
          </div>
          <div className={`field ${fieldErrors.age ? 'has-error' : ''}`}>
            <label>
              <span className="ur urdu">عمر</span> Age
            </label>
            <input
              className="input"
              type="number"
              min="0"
              max="130"
              inputMode="numeric"
              value={form.age}
              onChange={(e) => set('age', e.target.value)}
              onBlur={() => setFieldErrors((current) => ({ ...current, age: validateAge(form.age) }))}
              disabled={Boolean(form.date_of_birth)}
            />
            {fieldErrors.age && <div className="field-error">{fieldErrors.age}</div>}
            {form.date_of_birth && <small className="muted">Calculated from date of birth.</small>}
          </div>
        </div>
        <div className={`field ${fieldErrors.date_of_birth ? 'has-error' : ''}`}>
          <label><span className="ur urdu">تاریخ پیدائش</span> Date of birth (preferred)</label>
          <input
            className="input"
            type="date"
            min="1900-01-01"
            max={new Date().toISOString().slice(0, 10)}
            value={form.date_of_birth}
            onChange={(e) => set('date_of_birth', e.target.value)}
            onBlur={() => setFieldErrors((current) => ({
              ...current,
              date_of_birth: validateDob(form.date_of_birth),
              weight_kg: validateWeightForDob(form.weight_kg, form.date_of_birth),
            }))}
          />
          {fieldErrors.date_of_birth && <div className="field-error">{fieldErrors.date_of_birth}</div>}
          <small className="muted">When provided, Nabz calculates age from date of birth.</small>
        </div>
        <div className="rx-grid">
          <div className="field">
            <label>
              <span className="ur urdu">جنس</span> Gender
            </label>
            <select className="input" value={form.gender} onChange={(e) => set('gender', e.target.value)}>
              <option value="">—</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className={`field ${fieldErrors.blood_group ? 'has-error' : ''}`}>
            <label>
              <span className="ur urdu">بلڈ گروپ</span> Blood
            </label>
            <select
              className="input"
              value={form.blood_group}
              onChange={(e) => set('blood_group', e.target.value)}
              onBlur={() => setFieldErrors((current) => ({
                ...current,
                blood_group: validateBloodGroup(form.blood_group),
              }))}
            >
              <option value="">Unknown</option>
              {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((group) => (
                <option key={group} value={group}>{group}</option>
              ))}
            </select>
            {fieldErrors.blood_group && <div className="field-error">{fieldErrors.blood_group}</div>}
          </div>
        </div>
        <div className="rx-grid">
          <div className={`field ${fieldErrors.weight_kg ? 'has-error' : ''}`}>
            <label><span className="ur urdu">وزن</span> Weight (kg)</label>
            <input
              className="input"
              type="number"
              min="1"
              max="300"
              step="0.1"
              value={form.weight_kg}
              onChange={(e) => set('weight_kg', e.target.value)}
              onBlur={() => setFieldErrors((current) => ({
                ...current,
                weight_kg: validateWeightForDob(form.weight_kg, form.date_of_birth),
              }))}
            />
            {fieldErrors.weight_kg && <div className="field-error">{fieldErrors.weight_kg}</div>}
            {!fieldErrors.weight_kg && form.date_of_birth && (
              <small className="muted">Broad age-plausibility check only — not a growth assessment.</small>
            )}
          </div>
          <div className="field">
            <label>BP reading date</label>
            <input className="input" type="date" max={new Date().toISOString().slice(0, 10)} value={form.bp_recorded_at} onChange={(e) => set('bp_recorded_at', e.target.value)} />
          </div>
        </div>
        <div className="rx-grid">
          <div className={`field ${fieldErrors.bp_systolic ? 'has-error' : ''}`}>
            <label>Systolic BP</label>
            <input className="input" type="number" min="60" max="260" placeholder="120" value={form.bp_systolic} onChange={(e) => set('bp_systolic', e.target.value)} onBlur={() => { const message = validateBp(form.bp_systolic, form.bp_diastolic); setFieldErrors((current) => ({ ...current, bp_systolic: message, bp_diastolic: message })) }} />
            {fieldErrors.bp_systolic && <div className="field-error">{fieldErrors.bp_systolic}</div>}
          </div>
          <div className={`field ${fieldErrors.bp_diastolic ? 'has-error' : ''}`}>
            <label>Diastolic BP</label>
            <input className="input" type="number" min="30" max="180" placeholder="80" value={form.bp_diastolic} onChange={(e) => set('bp_diastolic', e.target.value)} onBlur={() => { const message = validateBp(form.bp_systolic, form.bp_diastolic); setFieldErrors((current) => ({ ...current, bp_systolic: message, bp_diastolic: message })) }} />
            {fieldErrors.bp_diastolic && <div className="field-error">{fieldErrors.bp_diastolic}</div>}
          </div>
        </div>
        <div className="field">
          <label>
            <span className="ur urdu">دائمی امراض</span> Chronic conditions
          </label>
          <input
            className="input"
            placeholder="Diabetes, Hypertension (comma separated)"
            value={form.chronic_conditions}
            onChange={(e) => set('chronic_conditions', e.target.value)}
          />
        </div>
        <div className="field">
          <label>
            <span className="ur urdu">الرجی</span> Allergies
          </label>
          <input
            className="input"
            placeholder="Penicillin, dust (comma separated)"
            value={form.allergies}
            onChange={(e) => set('allergies', e.target.value)}
          />
        </div>
        <div className="field">
          <label>
            <span className="ur urdu">نوٹس</span> Notes
          </label>
          <textarea className="input" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
        </div>

        <button className="btn btn-primary" disabled={busy}>
          {busy ? '…' : 'محفوظ کریں · Save'}
        </button>
      </form>
    </div>
  )
}
