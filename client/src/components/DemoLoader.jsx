import { useEffect, useState } from 'react'
import { getHealth, loadHassanDemo } from '../api'
import { useProfiles } from '../context/ProfileContext'

// One-click "Load Hassan demo" for judges. Only rendered when the backend is
// in mock mode (the /api/demo/hassan endpoint 404s in real mode).
export default function DemoLoader() {
  const [mockMode, setMockMode] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const { refresh, selectProfile } = useProfiles()

  useEffect(() => {
    let alive = true
    getHealth()
      .then((h) => alive && setMockMode(!!h?.mock_mode))
      .catch(() => alive && setMockMode(false))
    return () => {
      alive = false
    }
  }, [])

  if (mockMode !== true) return null

  async function handleLoad() {
    setError(null)
    setLoading(true)
    try {
      const res = await loadHassanDemo()
      await refresh()
      if (res?.profile_id) selectProfile(res.profile_id)
    } catch (err) {
      setError(err?.message || String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="demo-loader">
      <div>
        <span className="mock-pill">Offline demo mode</span>
        <div className="demo-loader-title">
          Load the full Hassan demo (private to this account)
        </div>
        <div className="demo-loader-sub">
          Adds a synthetic patient with a CBC, chest X-ray, confirmed
          Cetirizine prescription, skin progress photo, and prior cough triage.
          Idempotent — repeat safely. All fixtures are watermarked as synthetic.
        </div>
      </div>
      <button
        type="button"
        className="btn btn-primary"
        onClick={handleLoad}
        disabled={loading}
      >
        {loading ? 'Loading…' : 'Load Hassan demo'}
      </button>
      {error && <div className="notice notice-warn">{error}</div>}
    </div>
  )
}
