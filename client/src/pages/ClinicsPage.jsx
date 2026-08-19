import { useEffect, useState } from 'react'
import { getClinics } from '../api'

export default function ClinicsPage() {
  const [clinics, setClinics] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getClinics()
      .then(setClinics)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="page">
      <div className="section-title">
        <span className="ur urdu">قریبی کلینک اور ہسپتال</span>
        <span className="en">Nearby clinics & hospitals — Khyber Pakhtunkhwa</span>
      </div>

      {loading && (
        <div className="center-state">
          <div className="spinner" />
        </div>
      )}
      {error && <div className="form-error">{error}</div>}

      <div className="stack">
        {clinics.map((c, i) => (
          <div className="clinic-item" key={i}>
            <span className="c-ico">🏥</span>
            <div>
              <div className="c-name">{c.name}</div>
              <div className="c-meta">
                {[c.area, c.city].filter(Boolean).join(', ')}
                {c.hours && ` · ${c.hours}`}
              </div>
            </div>
            <div className="clinic-actions">
              {c.phone && (
                <a className="round-btn" href={`tel:${c.phone}`} aria-label={`Call ${c.name}`}>
                  📞
                </a>
              )}
              <a
                className="round-btn"
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                  c.maps_query,
                )}`}
                target="_blank"
                rel="noreferrer"
                aria-label={`Directions to ${c.name}`}
              >
                🧭
              </a>
            </div>
          </div>
        ))}
      </div>

      <a className="rescue-banner" href="tel:1122">
        🚑 <span className="ur urdu">ہنگامی حالت میں ریسکیو 1122</span>
      </a>
    </div>
  )
}
