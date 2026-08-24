import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGeolocation } from '../hooks/useGeolocation'
import { useLocationPref } from '../context/LocationContext'
import { listKnownCities } from '../api'

// Screen 00 in the winning plan: location-first onboarding.
// This is the first thing a signed-in user sees if no LocationPreference is set.
//
// Winning-plan item #5: the manual city picker must not accept free-text
// garbage. We fetch the curated Pakistan city list and force a dropdown
// selection; auto-detect fires on mount when the browser has already granted
// permission ("granted" state via navigator.permissions), so the typical
// user never sees the manual form at all.
export default function LocationSetupPage({ redirectTo = '/' }) {
  const navigate = useNavigate()
  const geo = useGeolocation()
  const { resolve, confirm } = useLocationPref()

  const [resolved, setResolved] = useState(null)
  const [cities, setCities] = useState([])
  const [manualCity, setManualCity] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [autoTried, setAutoTried] = useState(false)

  useEffect(() => {
    listKnownCities()
      .then(setCities)
      .catch(() => setCities([]))
  }, [])

  // Auto-detect on open when the browser already has geolocation permission,
  // so users never need to type in the common case.
  useEffect(() => {
    if (autoTried || resolved) return
    if (!geo.supported) return
    if (!navigator.permissions || !navigator.permissions.query) {
      setAutoTried(true)
      return
    }
    let cancelled = false
    navigator.permissions
      .query({ name: 'geolocation' })
      .then((status) => {
        if (cancelled) return
        setAutoTried(true)
        if (status.state === 'granted') {
          handleDetect()
        }
      })
      .catch(() => setAutoTried(true))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo.supported])

  async function handleDetect() {
    setError(null)
    try {
      const coords = await geo.detect()
      const label = await resolve(coords.latitude, coords.longitude, coords.accuracy_m)
      setResolved(label)
    } catch (e) {
      setError(e.message || 'location-failed')
    }
  }

  async function handleConfirmDetected() {
    if (!resolved) return
    setSaving(true)
    try {
      await confirm({
        label: resolved.label,
        city: resolved.city || null,
        district: resolved.district || null,
        province: resolved.province || null,
        latitude: resolved.latitude || null,
        longitude: resolved.longitude || null,
        manual: false,
      })
      navigate(redirectTo, { replace: true })
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleManualSave() {
    if (!manualCity) return
    setSaving(true)
    setError(null)
    try {
      const selected = cities.find((c) => c.slug === manualCity)
      const cityName = selected ? selected.name : manualCity
      const label = `${cityName}, Pakistan`
      await confirm({
        label,
        city: cityName,
        province: null,
        latitude: selected?.latitude ?? null,
        longitude: selected?.longitude ?? null,
        manual: true,
      })
      navigate(redirectTo, { replace: true })
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page">
      <div className="loc-hero">
        <div className="loc-hero-icon" aria-hidden="true">📍</div>
        <h1 className="loc-hero-title urdu">آپ کہاں ہیں؟</h1>
        <p className="loc-hero-title-en">Where are you now?</p>
        <p className="loc-hero-sub urdu">
          قریبی ہسپتال اور کلینک دکھانے کے لیے آپ کی موجودہ جگہ درکار ہے۔
        </p>
        <p className="loc-hero-sub-en">
          We use your current location only to show nearby hospitals and clinics.
        </p>
      </div>

      {!resolved && (
        <>
          <button
            type="button"
            className="btn btn-primary btn-hero"
            onClick={handleDetect}
            disabled={!geo.supported || geo.status === 'detecting' || saving}
          >
            {geo.status === 'detecting' ? (
              <>
                <span className="spinner-inline" />{' '}
                <span className="urdu">جگہ معلوم ہو رہی ہے…</span>{' '}
                <span>Detecting…</span>
              </>
            ) : (
              <>
                <span className="urdu">میری موجودہ جگہ استعمال کریں</span>
                <span className="btn-sub">Use my current location (recommended)</span>
              </>
            )}
          </button>

          {geo.status === 'denied' && (
            <div className="notice notice-warn">
              <span className="urdu">جگہ کی اجازت نہیں دی گئی — نیچے شہر منتخب کریں۔</span>
              <span>Permission denied — pick your city below instead.</span>
            </div>
          )}
          {error && geo.status !== 'denied' && (
            <div className="notice notice-warn">
              <span>Could not detect location: {error}</span>
            </div>
          )}
        </>
      )}

      {resolved && (
        <div className="card confirm-card">
          <div className="confirm-label">
            <span className="urdu">پتہ چلا:</span>
            <span className="confirm-label-en">Detected</span>
          </div>
          <div className="confirm-value">{resolved.label}</div>
          {resolved.accuracy_m != null && (
            <div className="confirm-accuracy">
              accuracy ±{Math.round(resolved.accuracy_m)} m
            </div>
          )}
          <div className="confirm-actions">
            <button className="btn btn-primary" onClick={handleConfirmDetected} disabled={saving}>
              <span className="urdu">تصدیق کریں</span> · Confirm
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => setResolved(null)}
              disabled={saving}
            >
              <span className="urdu">تبدیل کریں</span> · Change
            </button>
          </div>
        </div>
      )}

      <div className="loc-divider">
        <span>{'یا · or'}</span>
      </div>

      <div className="card">
        <div className="section-title" style={{ marginBottom: 6 }}>
          <span className="ur urdu">شہر منتخب کریں</span>
          <span className="en">Pick your city from the list</span>
        </div>
        <div className="form-row">
          <label className="form-label" htmlFor="city">
            <span className="urdu">شہر</span> · City
          </label>
          <select
            id="city"
            className="form-input"
            value={manualCity}
            onChange={(e) => setManualCity(e.target.value)}
          >
            <option value="">— Select a city —</option>
            {cities.map((c) => (
              <option key={c.slug} value={c.slug}>{c.name}</option>
            ))}
          </select>
        </div>
        <button
          className="btn btn-primary"
          onClick={handleManualSave}
          disabled={!manualCity || saving}
        >
          <span className="urdu">محفوظ کریں</span> · Save
        </button>
        <p className="hero-hint-en" style={{ marginTop: 8 }}>
          Only cities Nabz covers appear here. If yours isn't listed, use "current location"
          — Nabz will still find the closest facilities.
        </p>
      </div>
    </div>
  )
}
