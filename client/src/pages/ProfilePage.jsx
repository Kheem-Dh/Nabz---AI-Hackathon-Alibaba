import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getProfile, deleteProfile } from '../api'
import { useProfiles } from '../context/ProfileContext'

const LEVEL_DOT = { EMERGENCY: 'red', DOCTOR_24H: 'amber', HOME_CARE: 'green' }

function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return ''
  }
}

export default function ProfilePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { refresh, selectProfile } = useProfiles()
  const [profile, setProfile] = useState(null)
  const [error, setError] = useState('')
  const [confirmDel, setConfirmDel] = useState(false)

  useEffect(() => {
    let alive = true
    getProfile(id)
      .then((p) => alive && setProfile(p))
      .catch((e) => alive && setError(e.message))
    return () => {
      alive = false
    }
  }, [id])

  async function onDelete() {
    try {
      await deleteProfile(id)
      await refresh()
      navigate('/vault')
    } catch (e) {
      setError(e.message)
    }
  }

  if (error) {
    return (
      <div className="page">
        <button className="back-link" onClick={() => navigate('/vault')}>
          ‹ Vault
        </button>
        <div className="form-error">{error}</div>
      </div>
    )
  }
  if (!profile) {
    return (
      <div className="center-state">
        <div className="spinner" />
      </div>
    )
  }

  const meds = profile.medicines || []
  const timeline = profile.timeline || []

  return (
    <div className="page">
      <button className="back-link" onClick={() => navigate('/vault')}>
        ‹ والٹ · Vault
      </button>

      <div className="detail-head">
        <div className="dh-name urdu">{profile.display_name}</div>
        <div className="dh-meta">
          {[profile.relation, profile.age != null ? `${profile.age} yrs` : null, profile.gender]
            .filter(Boolean)
            .join(' · ') || 'Patient profile'}
        </div>
        <div className="kv-grid">
          <div className="kv">
            <div className="k">Blood group</div>
            <div className="v">{profile.blood_group || '—'}</div>
          </div>
          <div className="kv">
            <div className="k">Conditions</div>
            <div className="v">{(profile.chronic_conditions || []).length || '—'}</div>
          </div>
        </div>
        <div className="profile-vitals-summary">
          {profile.date_of_birth && <span>DOB <strong>{profile.date_of_birth}</strong></span>}
          {profile.weight_kg && <span>Weight <strong>{profile.weight_kg} kg</strong></span>}
          {profile.bp_systolic && profile.bp_diastolic && (
            <span>Latest BP <strong>{profile.bp_systolic}/{profile.bp_diastolic}</strong>{profile.bp_recorded_at ? ` · ${profile.bp_recorded_at}` : ''}</span>
          )}
        </div>
      </div>

      <div className="btn-row">
        <button className="btn btn-ghost" onClick={() => navigate(`/profile/${id}/edit`)}>
          ✎ ترمیم · Edit
        </button>
        <button
          className="btn btn-primary"
          onClick={() => {
            selectProfile(Number(id))
            navigate('/')
          }}
        >
          🎤 ٹرائیج
        </button>
      </div>

      <div className="tile-grid">
        <button className="tile" onClick={() => navigate(`/profile/${id}/documents`)}>
          <span className="tile-icon">🗂️</span>
          <span className="tile-ur urdu">دستاویزات</span>
          <span className="tile-en">All medical documents</span>
        </button>
        <button className="tile" onClick={() => navigate(`/profile/${id}/lab`)}>
          <span className="tile-icon">🧪</span>
          <span className="tile-ur urdu">لیب رپورٹ</span>
          <span className="tile-en">Read a lab report</span>
        </button>
        <button className="tile" onClick={() => navigate(`/profile/${id}/prescription`)}>
          <span className="tile-icon">📝</span>
          <span className="tile-ur urdu">نسخہ اسکین</span>
          <span className="tile-en">Scan a prescription</span>
        </button>
      </div>

      {/* Conditions & allergies */}
      {(profile.chronic_conditions?.length > 0 || profile.allergies?.length > 0) && (
        <div className="card">
          {profile.chronic_conditions?.length > 0 && (
            <>
              <div className="section-title" style={{ margin: '0 0 8px' }}>
                <span className="ur urdu">دائمی امراض</span>
                <span className="en">Chronic conditions</span>
              </div>
              <div className="tag-list">
                {profile.chronic_conditions.map((c, i) => (
                  <span className="tag" key={i}>
                    {c}
                  </span>
                ))}
              </div>
            </>
          )}
          {profile.allergies?.length > 0 && (
            <>
              <div className="section-title" style={{ margin: '12px 0 8px' }}>
                <span className="ur urdu">الرجی</span>
                <span className="en">Allergies</span>
              </div>
              <div className="tag-list">
                {profile.allergies.map((c, i) => (
                  <span className="tag warn" key={i}>
                    ⚠ {c}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Current medicines */}
      <div className="card">
        <div className="section-title" style={{ margin: '0 0 6px' }}>
          <span className="ur urdu">موجودہ ادویات</span>
          <span className="en">Current medicines — this patient only</span>
        </div>
        {meds.length === 0 ? (
          <p className="muted" style={{ fontSize: 13 }}>
            No medicines yet. Scan a prescription to add some.
          </p>
        ) : (
          meds.map((m) => (
            <div className="med-item" key={m.id}>
              <span className="m-ico">💊</span>
              <div>
                <div className="m-name">
                  {m.name} {m.strength && <span className="muted">{m.strength}</span>}
                </div>
                <div className="m-meta">
                  {[m.frequency, m.duration, m.with_food, m.notes].filter(Boolean).join(' · ')}
                  {m.source === 'prescription' && <span className="badge"> نسخہ</span>}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Timeline */}
      <div className="card">
        <div className="section-title" style={{ margin: '0 0 8px' }}>
          <span className="ur urdu">ہیلتھ ٹائم لائن</span>
          <span className="en">Health timeline</span>
        </div>
        {timeline.length === 0 ? (
          <p className="muted" style={{ fontSize: 13 }}>
            No history yet.
          </p>
        ) : (
          <div className="timeline">
            {timeline.map((e, i) => (
              <div className="tl-item" key={e.id}>
                <div className="tl-rail">
                  <span className={`tl-dot ${LEVEL_DOT[e.level] || ''}`} />
                  {i < timeline.length - 1 && <span className="tl-line" />}
                </div>
                <div className="tl-body">
                  <div className="tl-title">
                    {e.kind === 'triage' ? '🩺 ' : e.kind === 'lab' ? '🧪 ' : '📝 '}
                    {e.title}
                  </div>
                  {e.subtitle && <div className="tl-sub">{e.subtitle}</div>}
                  <div className="tl-date">{fmtDate(e.created_at)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <button className="btn btn-outline" onClick={() => navigate(`/summary/${id}`)}>
        🩺 ڈاکٹر کے لیے خلاصہ · Doctor summary
      </button>

      {/* Delete (privacy story) — hidden for the self profile */}
      {!profile.is_self && (
        <div className="card" style={{ border: '1px solid var(--red-bg)' }}>
          <div className="section-title" style={{ margin: '0 0 6px' }}>
            <span className="ur urdu" style={{ color: 'var(--red)' }}>
              ریکارڈ حذف کریں
            </span>
            <span className="en">Delete this profile and all its data</span>
          </div>
          {!confirmDel ? (
            <button className="btn btn-danger" onClick={() => setConfirmDel(true)}>
              🗑 حذف کریں · Delete
            </button>
          ) : (
            <div className="btn-row">
              <button className="btn btn-outline" onClick={() => setConfirmDel(false)}>
                منسوخ · Cancel
              </button>
              <button className="btn btn-danger" onClick={onDelete}>
                تصدیق · Confirm delete
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
