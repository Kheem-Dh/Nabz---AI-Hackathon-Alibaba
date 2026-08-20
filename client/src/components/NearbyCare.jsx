import { useEffect, useState } from 'react'
import { getNearbyFacilities } from '../api'
import { useLocationPref } from '../context/LocationContext'

// Renders after a triage RESULT. Loads /api/facilities/nearby using the
// current care location and the triage urgency. Emergency results get a
// dedicated red-hero facility on top.
export default function NearbyCare({ urgency = 'DOCTOR_24H', title = null }) {
  const { preference } = useLocationPref()
  const [state, setState] = useState({ loading: true, error: null, data: null })

  useEffect(() => {
    let alive = true
    async function load() {
      setState({ loading: true, error: null, data: null })
      try {
        const data = await getNearbyFacilities({
          urgency,
          latitude: preference?.latitude ?? undefined,
          longitude: preference?.longitude ?? undefined,
          limit: 4,
        })
        if (alive) setState({ loading: false, error: null, data })
      } catch (err) {
        if (alive) setState({ loading: false, error: err.message, data: null })
      }
    }
    load()
    return () => {
      alive = false
    }
  }, [urgency, preference?.latitude, preference?.longitude, preference?.city])

  if (state.loading) {
    return (
      <div className="nearby-loading">
        <span className="spinner-inline" />{' '}
        <span className="urdu">قریبی سہولیات تلاش کی جا رہی ہیں…</span>{' '}
        <span>Finding nearby care…</span>
      </div>
    )
  }
  if (state.error && !state.data) {
    return (
      <div className="notice notice-warn">
        <span>Nearby-care unavailable ({state.error}).</span>
      </div>
    )
  }
  if (!state.data || !state.data.facilities?.length) return null

  const { facilities, location } = state.data
  const [primary, ...rest] = facilities

  return (
    <section className="nearby">
      <div className="section-title">
        <span className="ur urdu">{title || 'قریبی سہولیات'}</span>
        <span className="en">
          {urgency === 'EMERGENCY'
            ? 'Nearest emergency care'
            : urgency === 'DOCTOR_24H'
            ? 'Nearby clinics & hospitals'
            : 'Nearby care (optional)'}
        </span>
      </div>
      {location?.label && (
        <div className="nearby-loc-note">
          Based on: <strong>{location.label}</strong>
        </div>
      )}

      {urgency === 'EMERGENCY' && primary && (
        <a
          className="facility-card facility-emergency"
          href={primary.directions_url}
          target="_blank"
          rel="noreferrer"
        >
          <div className="fc-title">🚑 {primary.name}</div>
          <div className="fc-meta">
            {primary.area} · {primary.city}
            {primary.distance_km != null ? ` · ${primary.distance_km} km` : ''}
          </div>
          <div className="fc-reason">{primary.reason}</div>
          <div className="fc-actions">
            {primary.phone && (
              <span className="btn btn-ghost btn-inline">📞 {primary.phone}</span>
            )}
            <span className="btn btn-primary btn-inline">Directions →</span>
          </div>
        </a>
      )}

      <div className="facility-list">
        {(urgency === 'EMERGENCY' ? rest : facilities).map((f) => (
          <a
            key={f.id}
            className="facility-card"
            href={f.directions_url}
            target="_blank"
            rel="noreferrer"
          >
            <div className="fc-title">
              {f.emergency_capable ? '🏥' : f.type === 'clinic' ? '🩺' : f.type === 'bhu' ? '🏘️' : '📍'}{' '}
              {f.name}
            </div>
            <div className="fc-meta">
              {f.area} · {f.city}
              {f.distance_km != null ? ` · ${f.distance_km} km` : ''}
              {f.hours ? ` · ${f.hours}` : ''}
            </div>
            <div className="fc-reason">{f.reason}</div>
            <div className="fc-actions">
              {f.phone && <span className="btn btn-ghost btn-inline">📞 {f.phone}</span>}
              <span className="btn btn-primary btn-inline">Directions →</span>
            </div>
          </a>
        ))}
      </div>
    </section>
  )
}
