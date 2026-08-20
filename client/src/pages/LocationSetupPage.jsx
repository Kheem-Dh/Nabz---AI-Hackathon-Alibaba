import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGeolocation } from '../hooks/useGeolocation'
import { useLocationPref } from '../context/LocationContext'

// Screen 00 in the winning plan: location-first onboarding.
// This is the first thing a signed-in user sees if no LocationPreference is set.
// The user can either share device location OR fall back to a manual city.
export default function LocationSetupPage({ redirectTo = '/' }) {
  const navigate = useNavigate()
  const geo = useGeolocation()
  const { resolve, confirm } = useLocationPref()

  const [resolved, setResolved] = useState(null) // LocationLabel
  const [manualCity, setManualCity] = useState('')
  const [manualProvince, setManualProvince] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

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
    if (!manualCity.trim()) return
    setSaving(true)
    try {
      const label = manualProvince
        ? `${manualCity.trim()}, ${manualProvince.trim()}, Pakistan`
        : `${manualCity.trim()}, Pakistan`
      await confirm({
        label,
        city: manualCity.trim(),
        province: manualProvince.trim() || null,
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
                <span className="btn-sub">Use my current location</span>
              </>
            )}
          </button>

          {geo.status === 'denied' && (
            <div className="notice notice-warn">
              <span className="urdu">مائیک/جگہ کی اجازت نہیں دی گئی — نیچے شہر منتخب کریں۔</span>
              <span>Permission denied — pick a city below instead.</span>
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
          <span className="ur urdu">شہر خود منتخب کریں</span>
          <span className="en">Choose city manually</span>
        </div>
        <div className="form-row">
          <label className="form-label" htmlFor="city">
            <span className="urdu">شہر</span> · City
          </label>
          <input
            id="city"
            className="form-input"
            type="text"
            placeholder="e.g. Peshawar"
            value={manualCity}
            onChange={(e) => setManualCity(e.target.value)}
          />
        </div>
        <div className="form-row">
          <label className="form-label" htmlFor="province">
            <span className="urdu">صوبہ</span> · Province
          </label>
          <input
            id="province"
            className="form-input"
            type="text"
            placeholder="e.g. Khyber Pakhtunkhwa"
            value={manualProvince}
            onChange={(e) => setManualProvince(e.target.value)}
          />
        </div>
        <button
          className="btn btn-primary"
          onClick={handleManualSave}
          disabled={!manualCity.trim() || saving}
        >
          <span className="urdu">محفوظ کریں</span> · Save
        </button>
      </div>
    </div>
  )
}
