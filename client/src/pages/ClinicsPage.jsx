import { useCallback, useEffect, useState } from 'react'
import {
  confirmLocation,
  getNearbyFacilities,
  resolveLocation,
} from '../api'
import { useGeolocation } from '../hooks/useGeolocation'
import { useLocationPref } from '../context/LocationContext'

const CATEGORIES = [
  { key: 'clinical', label: 'Clinics & hospitals', urdu: 'کلینک اور ہسپتال' },
  { key: 'blood_bank', label: 'Blood donation', urdu: 'خون کے عطیہ کے مراکز' },
]

export default function ClinicsPage() {
  const geo = useGeolocation()
  const { preference, confirm } = useLocationPref()
  const [category, setCategory] = useState('clinical')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshingLocation, setRefreshingLocation] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const filterType = category === 'blood_bank' ? 'blood_bank' : undefined
      // If the browser has already granted geolocation we use fresh coords;
      // otherwise the saved preference (with city-centre fallback) is used.
      const params = {
        urgency: 'DOCTOR_24H',
        limit: 12,
      }
      if (filterType) params.type = filterType
      if (geo.coords) {
        params.latitude = geo.coords.latitude
        params.longitude = geo.coords.longitude
      }
      const resp = await getNearbyFacilities(params)
      setData(resp)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [category, geo.coords])

  useEffect(() => {
    load()
  }, [load])

  async function useMyLocation() {
    setRefreshingLocation(true)
    setError('')
    try {
      const coords = await geo.detect()
      const label = await resolveLocation(coords.latitude, coords.longitude, coords.accuracy_m)
      await confirm({
        label: label.label,
        city: label.city || null,
        district: label.district || null,
        province: label.province || null,
        latitude: coords.latitude,
        longitude: coords.longitude,
        manual: false,
      })
      // load() will re-run via the geo.coords dependency
    } catch (e) {
      setError(e.message || 'location-failed')
    } finally {
      setRefreshingLocation(false)
    }
  }

  const facilities = data?.facilities || []
  const label = data?.location?.label || preference?.label || 'Pakistan'

  return (
    <div className="page">
      <div className="clinics-head">
        <div>
          <div className="section-title">
            <span className="ur urdu">قریبی سہولیات</span>
            <span className="en">Nearby facilities</span>
          </div>
          <p className="clinics-loc-note">
            Based on: <strong>{label}</strong>
            {data?.location?.source === 'manual' && (
              <span className="loc-source-badge">manual city</span>
            )}
            {data?.location?.source === 'reverse-geocode' && (
              <span className="loc-source-badge live">live location</span>
            )}
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary use-loc-btn"
          onClick={useMyLocation}
          disabled={refreshingLocation || geo.status === 'detecting'}
        >
          {refreshingLocation || geo.status === 'detecting'
            ? 'Detecting…'
            : '📍 Use my current location'}
        </button>
      </div>

      <div className="segmented">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            type="button"
            className={`seg-btn ${category === c.key ? 'active' : ''}`}
            onClick={() => setCategory(c.key)}
          >
            <span className="urdu">{c.urdu}</span>
            <span className="seg-en">{c.label}</span>
          </button>
        ))}
      </div>

      {geo.error === 'denied' && (
        <div className="notice notice-warn">
          <span className="urdu">
            براؤزر نے مقام دینے سے انکار کر دیا — نتائج آپ کی درج کردہ شہر کی بنیاد پر ہیں۔
          </span>
          <span>
            Browser denied location — results use your saved city instead. You can retry
            after granting permission in the browser bar.
          </span>
        </div>
      )}

      {loading && (
        <div className="center-state">
          <div className="spinner" />
        </div>
      )}
      {error && !loading && <div className="form-error">{error}</div>}

      <div className="stack">
        {facilities.map((f) => (
          <div className="clinic-item" key={f.id}>
            <span className="c-ico">
              {f.type === 'blood_bank'
                ? '🩸'
                : f.emergency_capable
                ? '🏥'
                : f.type === 'clinic'
                ? '🩺'
                : f.type === 'bhu'
                ? '🏘️'
                : '📍'}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="c-name">{f.name}</div>
              <div className="c-meta">
                {[f.area, f.city].filter(Boolean).join(', ')}
                {f.distance_km != null && ` · ${f.distance_km} km`}
                {f.hours && ` · ${f.hours}`}
              </div>
              {f.reason && <div className="c-reason">{f.reason}</div>}
            </div>
            <div className="clinic-actions">
              {f.phone && (
                <a className="round-btn" href={`tel:${f.phone}`} aria-label={`Call ${f.name}`}>
                  📞
                </a>
              )}
              <a
                className="round-btn"
                href={f.directions_url}
                target="_blank"
                rel="noreferrer"
                aria-label={`Directions to ${f.name}`}
              >
                🧭
              </a>
            </div>
          </div>
        ))}
        {!loading && facilities.length === 0 && (
          <div className="notice">
            <span>No {category === 'blood_bank' ? 'blood-donation' : 'clinical'} facilities found for this location yet.</span>
          </div>
        )}
      </div>

      <a className="rescue-banner" href="tel:1122">
        🚑 <span className="ur urdu">ہنگامی حالت میں ریسکیو 1122</span>
      </a>
    </div>
  )
}
