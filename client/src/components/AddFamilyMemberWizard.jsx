import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { createProfile } from '../api'
import { useProfiles } from '../context/ProfileContext'
import {
  validateAge,
  validateBloodGroup,
  validateBp,
  validateDob,
  validateFullName,
  validateWeightForDob,
} from '../utils/validators'

// 4-step "Add Family Member" wizard modelled on the reference UI:
//   1. Name + Age
//   2. Relation + Gender  (pill picker)
//   3. Blood group + Chronic conditions
//   4. Allergies + Confirm
//
// Rendered as a modal overlay on top of the current page. Backed by the
// existing POST /api/profiles endpoint — no server changes needed.

const RELATIONS = [
  { key: 'Father', gender_hint: 'Male' },
  { key: 'Mother', gender_hint: 'Female' },
  { key: 'Son', gender_hint: 'Male' },
  { key: 'Daughter', gender_hint: 'Female' },
  { key: 'Husband', gender_hint: 'Male' },
  { key: 'Wife', gender_hint: 'Female' },
  { key: 'Brother', gender_hint: 'Male' },
  { key: 'Sister', gender_hint: 'Female' },
  { key: 'Other', gender_hint: null },
]

const GENDERS = [
  { key: 'Male', icon: '♂' },
  { key: 'Female', icon: '♀' },
  { key: 'Other', icon: '⚧' },
]

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown']

const COMMON_CONDITIONS = [
  'Diabetes', 'Hypertension', 'Asthma', 'Heart disease',
  'Kidney disease', 'Thyroid', 'Migraine', 'Anaemia',
]

const COMMON_ALLERGIES = [
  'Penicillin', 'Ibuprofen', 'Sulfa drugs', 'Aspirin',
  'Peanuts', 'Dust', 'Pollen', 'Latex',
]

const FIELD_STEPS = {
  display_name: 0,
  age: 0,
  date_of_birth: 0,
  relation: 1,
  gender: 1,
  blood_group: 2,
  weight_kg: 2,
  bp_systolic: 2,
  bp_diastolic: 2,
  bp_recorded_at: 2,
}

function ageFromDob(value) {
  if (!value || validateDob(value)) return null
  const born = new Date(`${value}T00:00:00`)
  const today = new Date()
  let age = today.getFullYear() - born.getFullYear()
  if (
    today.getMonth() < born.getMonth()
    || (today.getMonth() === born.getMonth() && today.getDate() < born.getDate())
  ) age -= 1
  return age
}

export default function AddFamilyMemberWizard({ onClose, onCreated }) {
  const { refresh } = useProfiles()
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const dialogRef = useRef(null)

  const [form, setForm] = useState({
    display_name: '',
    age: '',
    date_of_birth: '',
    relation: '',
    gender: '',
    blood_group: '',
    weight_kg: '',
    bp_systolic: '',
    bp_diastolic: '',
    bp_recorded_at: '',
    chronic_conditions: [],
    allergies: [],
    notes: '',
  })

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !saving) onClose()
      if (event.key === 'Tab' && dialogRef.current) {
        const focusable = Array.from(dialogRef.current.querySelectorAll(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ))
        if (!focusable.length) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose, saving])

  function update(patch) {
    setForm((f) => ({ ...f, ...patch }))
    setFieldErrors((current) => {
      const next = { ...current }
      Object.keys(patch).forEach((key) => delete next[key])
      return next
    })
    setError('')
  }

  function toggleInList(key, value) {
    setForm((f) => {
      const cur = f[key]
      return {
        ...f,
        [key]: cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value],
      }
    })
  }

  function pickRelation(relation) {
    // Prefill gender from the relation hint if the user hasn't set one yet.
    const rel = RELATIONS.find((r) => r.key === relation)
    update({
      relation,
      gender: form.gender || (rel && rel.gender_hint) || '',
    })
  }

  function validateStep(stepNumber) {
    const next = {}
    if (stepNumber === 0) {
      const nameError = validateFullName(form.display_name)
      const ageError = validateAge(form.age)
      const dobError = validateDob(form.date_of_birth)
      if (nameError) next.display_name = nameError
      if (!form.age && !form.date_of_birth) next.age = 'Enter an age or date of birth.'
      else if (ageError) next.age = ageError
      if (dobError) next.date_of_birth = dobError
    }
    if (stepNumber === 1) {
      if (!form.relation) next.relation = 'Select how this person is related to you.'
      if (!form.gender) next.gender = 'Select a gender.'
    }
    if (stepNumber === 2) {
      const bloodError = validateBloodGroup(form.blood_group === 'Unknown' ? '' : form.blood_group)
      const weightError = validateWeightForDob(form.weight_kg, form.date_of_birth)
      const bpError = validateBp(form.bp_systolic, form.bp_diastolic)
      const bpDateError = validateDob(form.bp_recorded_at)
      if (bloodError) next.blood_group = bloodError
      if (weightError) next.weight_kg = weightError
      if (bpError) {
        next.bp_systolic = bpError
        next.bp_diastolic = bpError
      }
      if (bpDateError) next.bp_recorded_at = 'BP reading date cannot be in the future.'
    }
    return next
  }

  function goNext() {
    const validation = validateStep(step)
    setFieldErrors((current) => ({ ...current, ...validation }))
    if (Object.keys(validation).length) return
    setError('')
    setStep((current) => Math.min(3, current + 1))
  }

  function applyServerValidation(apiError) {
    if (!Array.isArray(apiError?.validation)) return false
    const next = {}
    for (const issue of apiError.validation) {
      const locations = Array.isArray(issue?.loc) ? issue.loc : []
      const field = locations[locations.length - 1]
      const message = String(issue?.msg || '')
      if (field === 'date_of_birth') next.date_of_birth = 'Date of birth must be today or earlier.'
      else if (field === 'weight_kg') next.weight_kg = validateWeightForDob(form.weight_kg, form.date_of_birth) || 'Check the weight.'
      else if (field === 'bp_systolic' || field === 'bp_diastolic') {
        next.bp_systolic = validateBp(form.bp_systolic, form.bp_diastolic) || 'Check both blood-pressure values.'
        next.bp_diastolic = next.bp_systolic
      } else if (field === 'bp_recorded_at') next.bp_recorded_at = 'BP reading date must be today or earlier.'
      else if (field === 'display_name') next.display_name = validateFullName(form.display_name) || 'Check the full name.'
      else if (/weight is not plausible/i.test(message)) next.weight_kg = validateWeightForDob(form.weight_kg, form.date_of_birth) || 'Check DOB and weight.'
      else if (/systolic|diastolic|blood pressure/i.test(message)) {
        next.bp_systolic = validateBp(form.bp_systolic, form.bp_diastolic) || 'Check both blood-pressure values.'
        next.bp_diastolic = next.bp_systolic
      }
    }
    if (!Object.keys(next).length) return false
    setFieldErrors((current) => ({ ...current, ...next }))
    setStep(Math.min(...Object.keys(next).map((field) => FIELD_STEPS[field] ?? 3)))
    setError('Please correct the highlighted health details.')
    return true
  }

  async function submit() {
    setError('')
    const validation = [0, 1, 2].reduce((all, stepNumber) => ({
      ...all,
      ...validateStep(stepNumber),
    }), {})
    if (Object.keys(validation).length) {
      setFieldErrors(validation)
      setStep(Math.min(...Object.keys(validation).map((field) => FIELD_STEPS[field] ?? 3)))
      setError('Please correct the highlighted details before saving.')
      return
    }
    setSaving(true)
    try {
      const payload = {
        display_name: form.display_name.trim(),
        relation: form.relation || null,
        age: form.age ? Number(form.age) : null,
        date_of_birth: form.date_of_birth || null,
        gender: form.gender || null,
        blood_group: form.blood_group && form.blood_group !== 'Unknown' ? form.blood_group : null,
        weight_kg: form.weight_kg ? Number(form.weight_kg) : null,
        bp_systolic: form.bp_systolic ? Number(form.bp_systolic) : null,
        bp_diastolic: form.bp_diastolic ? Number(form.bp_diastolic) : null,
        bp_recorded_at: form.bp_recorded_at || null,
        chronic_conditions: form.chronic_conditions,
        allergies: form.allergies,
        notes: form.notes || null,
      }
      const created = await createProfile(payload)
      await refresh(created?.id)
      onCreated && onCreated(created)
      onClose()
    } catch (e) {
      if (!applyServerValidation(e)) {
        setError(e?.status >= 500
          ? 'The profile service is temporarily unavailable. Your entries are still here—please try again.'
          : 'Could not save this family member. Please check the details and try again.')
      }
    } finally {
      setSaving(false)
    }
  }

  const canGoStep1 = form.display_name.trim().length >= 1 && Boolean(form.age || form.date_of_birth)
  const canGoStep2 = !!form.relation && !!form.gender
  const bpComplete = (!form.bp_systolic && !form.bp_diastolic) || (!!form.bp_systolic && !!form.bp_diastolic)
  const canFinish = canGoStep1 && canGoStep2 && bpComplete

  return createPortal(
    <div className="modal-scrim" role="presentation" onClick={() => !saving && onClose()}>
      <section ref={dialogRef} className="modal-card" role="dialog" aria-modal="true" aria-labelledby="family-modal-title" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <div>
            <h2 id="family-modal-title">Add family member</h2>
            <p className="modal-sub">One vault, shared safely with the family caregiver.</p>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close family-member form" disabled={saving}>×</button>
        </header>

        <div className="wiz-body">
        <div className="wiz-steps" aria-label="Progress">
          <span className="sr-only">Step {step + 1} of 4</span>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={`wiz-dot ${i <= step ? 'active' : ''}`} aria-hidden="true" />
          ))}
        </div>

        {step === 0 && (
          <div className="wiz-step">
            <h3>Who is this for?</h3>
            <div className="form-row">
              <label className="form-label" htmlFor="fm-name">Full name</label>
              <input
                id="fm-name"
                className={`form-input ${fieldErrors.display_name ? 'invalid' : ''}`}
                type="text"
                placeholder="e.g. Saliha"
                value={form.display_name}
                onChange={(e) => update({ display_name: e.target.value })}
                autoFocus
                aria-invalid={Boolean(fieldErrors.display_name)}
              />
              {fieldErrors.display_name && <p className="field-error" role="alert">{fieldErrors.display_name}</p>}
            </div>
            <div className="form-row">
              <label className="form-label" htmlFor="fm-age">Age</label>
              <input
                id="fm-age"
                className={`form-input ${fieldErrors.age ? 'invalid' : ''}`}
                type="number"
                min="0"
                max="130"
                placeholder="e.g. 24"
                value={form.age}
                onChange={(e) => update({ age: e.target.value.replace(/[^0-9]/g, '') })}
                aria-invalid={Boolean(fieldErrors.age)}
              />
              {fieldErrors.age && <p className="field-error" role="alert">{fieldErrors.age}</p>}
            </div>
            <div className="form-row">
              <label className="form-label" htmlFor="fm-dob">Date of birth (preferred)</label>
              <input
                id="fm-dob"
                className={`form-input ${fieldErrors.date_of_birth ? 'invalid' : ''}`}
                type="date"
                min="1900-01-01"
                max={new Date().toISOString().slice(0, 10)}
                value={form.date_of_birth}
                onChange={(e) => {
                  const value = e.target.value
                  const calculatedAge = ageFromDob(value)
                  update({
                    date_of_birth: value,
                    ...(calculatedAge != null ? { age: String(calculatedAge) } : {}),
                  })
                }}
                aria-invalid={Boolean(fieldErrors.date_of_birth)}
              />
              {fieldErrors.date_of_birth && <p className="field-error" role="alert">{fieldErrors.date_of_birth}</p>}
              {!fieldErrors.date_of_birth && <p className="wiz-hint">Age is calculated automatically when DOB is provided.</p>}
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="wiz-step">
            <h3>Relation &amp; Gender</h3>
            <div className="wiz-field-label">Relation *</div>
            <div className="pill-picker">
              {RELATIONS.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  className={`pill ${form.relation === r.key ? 'active' : ''}`}
                  onClick={() => pickRelation(r.key)}
                >
                  {r.key}
                </button>
              ))}
            </div>
            {fieldErrors.relation && <p className="field-error" role="alert">{fieldErrors.relation}</p>}
            <div className="wiz-field-label" style={{ marginTop: 12 }}>Gender *</div>
            <div className="tile-picker">
              {GENDERS.map((g) => (
                <button
                  key={g.key}
                  type="button"
                  className={`tile-pick ${form.gender === g.key ? 'active' : ''}`}
                  onClick={() => update({ gender: g.key })}
                >
                  <span className="tile-icon">{g.icon}</span>
                  <span>{g.key}</span>
                </button>
              ))}
            </div>
            {fieldErrors.gender && <p className="field-error" role="alert">{fieldErrors.gender}</p>}
          </div>
        )}

        {step === 2 && (
          <div className="wiz-step">
            <h3>Health context</h3>
            <div className="wiz-field-label">Blood group</div>
            <div className="pill-picker">
              {BLOOD_GROUPS.map((b) => (
                <button
                  key={b}
                  type="button"
                  className={`pill compact ${form.blood_group === b ? 'active' : ''}`}
                  onClick={() => update({ blood_group: b })}
                >
                  {b}
                </button>
              ))}
            </div>
            <div className="wiz-field-label" style={{ marginTop: 12 }}>Chronic conditions</div>
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
            <p className="wiz-hint">Tap any that apply. You can add more later.</p>
            <div className="tile-picker vitals-picker">
              <label className="form-row">
                <span className="form-label">Weight (kg)</span>
                <input className={`form-input ${fieldErrors.weight_kg ? 'invalid' : ''}`} type="number" min="1" max="300" step="0.1" value={form.weight_kg} onChange={(e) => update({ weight_kg: e.target.value })} aria-invalid={Boolean(fieldErrors.weight_kg)} />
                {fieldErrors.weight_kg && <span className="field-error" role="alert">{fieldErrors.weight_kg}</span>}
              </label>
              <label className="form-row">
                <span className="form-label">Systolic BP</span>
                <input className={`form-input ${fieldErrors.bp_systolic ? 'invalid' : ''}`} type="number" min="60" max="260" value={form.bp_systolic} onChange={(e) => update({ bp_systolic: e.target.value })} aria-invalid={Boolean(fieldErrors.bp_systolic)} />
              </label>
              <label className="form-row">
                <span className="form-label">Diastolic BP</span>
                <input className={`form-input ${fieldErrors.bp_diastolic ? 'invalid' : ''}`} type="number" min="30" max="180" value={form.bp_diastolic} onChange={(e) => update({ bp_diastolic: e.target.value })} aria-invalid={Boolean(fieldErrors.bp_diastolic)} />
              </label>
            </div>
            <div className="form-row">
              <label className="form-label" htmlFor="fm-bp-date">BP reading date</label>
              <input id="fm-bp-date" className={`form-input ${fieldErrors.bp_recorded_at ? 'invalid' : ''}`} type="date" max={new Date().toISOString().slice(0, 10)} value={form.bp_recorded_at} onChange={(e) => update({ bp_recorded_at: e.target.value })} aria-invalid={Boolean(fieldErrors.bp_recorded_at)} />
              {fieldErrors.bp_recorded_at && <p className="field-error" role="alert">{fieldErrors.bp_recorded_at}</p>}
            </div>
            {(fieldErrors.bp_systolic || (!bpComplete && !fieldErrors.bp_systolic)) && (
              <p className="field-error bp-error" role="alert">{fieldErrors.bp_systolic || 'Enter both blood-pressure numbers, or leave both blank.'}</p>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="wiz-step">
            <h3>Allergies &amp; notes</h3>
            <div className="wiz-field-label">Known allergies</div>
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
            <div className="form-row" style={{ marginTop: 10 }}>
              <label className="form-label" htmlFor="fm-notes">Notes for the doctor (optional)</label>
              <textarea
                id="fm-notes"
                className="form-input"
                rows={3}
                placeholder="e.g. seasonal breathing symptoms are worse with dust"
                value={form.notes}
                onChange={(e) => update({ notes: e.target.value })}
              />
            </div>
            <div className="wiz-review">
              <div><strong>Summary:</strong></div>
              <div>{form.display_name || '—'}, {form.age || '—'} yrs</div>
              <div>{form.relation || '—'} · {form.gender || '—'} · {form.blood_group || 'Blood group unknown'}</div>
              {form.chronic_conditions.length > 0 && (
                <div>Conditions: {form.chronic_conditions.join(', ')}</div>
              )}
              {form.allergies.length > 0 && (
                <div className="wiz-warn">Allergies: {form.allergies.join(', ')}</div>
              )}
            </div>
          </div>
        )}

        {error && <div className="wiz-error-summary" role="alert"><strong>Check the form</strong><span>{error}</span></div>}
        </div>

        <footer className="wiz-foot">
          <button
            className="btn btn-outline"
            disabled={step === 0 || saving}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
          >
            Back
          </button>
          {step < 3 ? (
            <button
              className="btn btn-primary"
              disabled={saving}
              onClick={goNext}
            >
              Next
            </button>
          ) : (
            <button
              className="btn btn-primary"
              disabled={!canFinish || saving}
              onClick={submit}
            >
              {saving ? 'Saving…' : 'Save family member'}
            </button>
          )}
        </footer>
      </section>
    </div>,
    document.body,
  )
}
