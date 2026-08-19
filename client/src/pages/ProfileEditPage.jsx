import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { createProfile, getProfile, updateProfile } from '../api'
import { useProfiles } from '../context/ProfileContext'

const EMPTY = {
  display_name: '',
  relation: '',
  age: '',
  gender: '',
  blood_group: '',
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
  const { refresh, selectProfile } = useProfiles()
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (mode === 'edit' && id) {
      getProfile(id)
        .then((p) =>
          setForm({
            display_name: p.display_name || '',
            relation: p.relation || '',
            age: p.age ?? '',
            gender: p.gender || '',
            blood_group: p.blood_group || '',
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
  }

  async function submit(e) {
    e.preventDefault()
    setError('')
    if (form.display_name.trim().length < 1) {
      setError('Please enter a name.')
      return
    }
    setBusy(true)
    const payload = {
      display_name: form.display_name.trim(),
      relation: form.relation.trim() || null,
      age: form.age === '' ? null : Number(form.age),
      gender: form.gender || null,
      blood_group: form.blood_group.trim() || null,
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
        await refresh()
        selectProfile(created.id)
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
        <div className="field">
          <label>
            <span className="ur urdu">نام</span> Name *
          </label>
          <input className="input" value={form.display_name} onChange={(e) => set('display_name', e.target.value)} />
        </div>
        <div className="rx-grid">
          <div className="field">
            <label>
              <span className="ur urdu">رشتہ</span> Relation
            </label>
            <input
              className="input"
              placeholder="Son, Mother…"
              value={form.relation}
              onChange={(e) => set('relation', e.target.value)}
            />
          </div>
          <div className="field">
            <label>
              <span className="ur urdu">عمر</span> Age
            </label>
            <input
              className="input"
              inputMode="numeric"
              value={form.age}
              onChange={(e) => set('age', e.target.value)}
            />
          </div>
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
          <div className="field">
            <label>
              <span className="ur urdu">بلڈ گروپ</span> Blood
            </label>
            <input
              className="input"
              placeholder="O+"
              value={form.blood_group}
              onChange={(e) => set('blood_group', e.target.value)}
            />
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
