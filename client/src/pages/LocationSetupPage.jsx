import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGeolocation } from '../hooks/useGeolocation'
import { useLocationPref } from '../context/LocationContext'
import { listLocationRegions } from '../api'

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
  const [regions, setRegions] = useState([])
  const [manualOpen, setManualOpen] = useState(false)
  const [manualProvince, setManualProvince] = useState('')
  const [manualCity, setManualCity] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [autoTried, setAutoTried] = useState(false)

  useEffect(() => {
    listLocationRegions()
      .then(setRegions)
      .catch(() => setRegions([]))
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
      if (e.message === 'denied') setManualOpen(true)
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
      const region = regions.find((item) => item.name === manualProvince)
      const selected = region?.cities.find((c) => c.slug === manualCity)
      const cityName = selected ? selected.name : manualCity
      const label = `${cityName}, ${manualProvince}, Pakistan`
      await confirm({
        label,
        city: cityName,
        province: manualProvince,
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

  const manualCities = regions.find((item) => item.name === manualProvince)?.cities || []

  return (
    <div className="page">
      <div className="loc-hero location-permission-hero">
        <div className="loc-hero-icon" aria-hidden="true">⌖</div>
        <span className="location-step-kicker">STEP 1 · CURRENT LOCATION</span>
        <h1 className="loc-hero-title urdu">آپ کہاں ہیں؟</h1>
        <p className="loc-hero-title-en">Where are you now?</p>
        <p className="loc-hero-sub urdu">
          قریبی ہسپتال اور کلینک دکھانے کے لیے آپ کی موجودہ جگہ درکار ہے۔
        </p>
        <p className="loc-hero-sub-en">
          Allow location to rank nearby clinics, hospitals and pharmacies accurately.
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

      {!resolved && !manualOpen && (
        <button className="location-manual-link" onClick={() => setManualOpen(true)}>
          Can’t share location? Choose province and city manually
        </button>
      )}

      {!resolved && manualOpen && <div className="card location-manual-card">
        <div className="section-title" style={{ marginBottom: 6 }}>
          <span className="ur urdu">صوبہ اور شہر منتخب کریں</span>
          <span className="en">Choose your province or territory, then your city</span>
        </div>
        <div className="form-row">
          <label className="form-label" htmlFor="province">
            <span className="urdu">صوبہ</span> · Province / territory
          </label>
          <select
            id="province"
            className="form-input"
            value={manualProvince}
            onChange={(event) => {
              setManualProvince(event.target.value)
              setManualCity('')
            }}
          >
            <option value="">— Select province / territory —</option>
            {regions.map((region) => (
              <option key={region.name} value={region.name}>{region.name}</option>
            ))}
          </select>
        </div>
        <div className="form-row">
          <label className="form-label" htmlFor="city">
            <span className="urdu">شہر</span> · City
          </label>
          <select
            id="city"
            className="form-input"
            value={manualCity}
            disabled={!manualProvince}
            onChange={(event) => setManualCity(event.target.value)}
          >
            <option value="">— {manualProvince ? 'Select a city' : 'Choose province first'} —</option>
            {manualCities.map((c) => (
              <option key={c.slug} value={c.slug}>{c.name}</option>
            ))}
          </select>
        </div>
        <button
          className="btn btn-primary"
          onClick={handleManualSave}
          disabled={!manualProvince || !manualCity || saving}
        >
          <span className="urdu">محفوظ کریں</span> · Save
        </button>
        <p className="hero-hint-en" style={{ marginTop: 8 }}>
          GPS gives the most accurate nearby results. Manual selection uses the selected city centre.
        </p>
        {geo.status !== 'denied' && (
          <button className="location-retry-gps" onClick={() => { setManualOpen(false); handleDetect() }}>
            ← Try current location again
          </button>
        )}
      </div>}
    </div>
  )
}
