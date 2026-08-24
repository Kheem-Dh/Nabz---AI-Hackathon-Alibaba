import { useState } from 'react'
import { createProfile } from '../api'
import { useProfiles } from '../context/ProfileContext'

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

export default function AddFamilyMemberWizard({ onClose, onCreated }) {
  const { refresh } = useProfiles()
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

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

  function update(patch) {
    setForm((f) => ({ ...f, ...patch }))
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

  async function submit() {
    setError('')
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
      setError(e?.message || 'Could not save this profile.')
    } finally {
      setSaving(false)
    }
  }

  const canGoStep1 = form.display_name.trim().length >= 1
  const canGoStep2 = !!form.relation && !!form.gender
  const bpComplete = (!form.bp_systolic && !form.bp_diastolic) || (!!form.bp_systolic && !!form.bp_diastolic)
  const canFinish = canGoStep1 && canGoStep2 && bpComplete

  return (
    <div className="modal-scrim" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <div>
            <h2>Add Family Member</h2>
            <p className="modal-sub">One vault, shared safely with the family caregiver.</p>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </header>

        <div className="wiz-steps" aria-label="Progress">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={`wiz-dot ${i <= step ? 'active' : ''}`} />
          ))}
        </div>

        {step === 0 && (
          <div className="wiz-step">
            <h3>Who is this for?</h3>
            <div className="form-row">
              <label className="form-label" htmlFor="fm-name">Full name</label>
              <input
                id="fm-name"
                className="form-input"
                type="text"
                placeholder="e.g. Saliha"
                value={form.display_name}
                onChange={(e) => update({ display_name: e.target.value })}
                autoFocus
              />
            </div>
            <div className="form-row">
              <label className="form-label" htmlFor="fm-age">Age</label>
              <input
                id="fm-age"
                className="form-input"
                type="number"
                min="0"
                max="130"
                placeholder="e.g. 24"
                value={form.age}
                onChange={(e) => update({ age: e.target.value.replace(/[^0-9]/g, '') })}
              />
            </div>
            <div className="form-row">
              <label className="form-label" htmlFor="fm-dob">Date of birth (preferred)</label>
              <input
                id="fm-dob"
                className="form-input"
                type="date"
                max={new Date().toISOString().slice(0, 10)}
                value={form.date_of_birth}
                onChange={(e) => update({ date_of_birth: e.target.value })}
              />
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
                <input className="form-input" type="number" min="1" max="500" step="0.1" value={form.weight_kg} onChange={(e) => update({ weight_kg: e.target.value })} />
              </label>
              <label className="form-row">
                <span className="form-label">Systolic BP</span>
                <input className="form-input" type="number" min="50" max="300" value={form.bp_systolic} onChange={(e) => update({ bp_systolic: e.target.value })} />
              </label>
              <label className="form-row">
                <span className="form-label">Diastolic BP</span>
                <input className="form-input" type="number" min="30" max="200" value={form.bp_diastolic} onChange={(e) => update({ bp_diastolic: e.target.value })} />
              </label>
            </div>
            <div className="form-row">
              <label className="form-label" htmlFor="fm-bp-date">BP reading date</label>
              <input id="fm-bp-date" className="form-input" type="date" max={new Date().toISOString().slice(0, 10)} value={form.bp_recorded_at} onChange={(e) => update({ bp_recorded_at: e.target.value })} />
            </div>
            {!bpComplete && <p className="form-error">Enter both blood-pressure numbers, or leave both blank.</p>}
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

        {error && <div className="form-error" style={{ marginTop: 8 }}>{error}</div>}

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
              disabled={(step === 0 && !canGoStep1) || (step === 1 && !canGoStep2) || saving}
              onClick={() => setStep((s) => Math.min(3, s + 1))}
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
      </div>
    </div>
  )
}
