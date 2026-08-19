// Thin API client for the Sehat Saathi backend.
// In dev, Vite proxies /api -> http://localhost:8000 (see vite.config.js).
// You can override the base with VITE_API_BASE.

const API_BASE = import.meta.env.VITE_API_BASE || ''

export async function postTriage(text) {
  const resp = await fetch(`${API_BASE}/api/triage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  if (!resp.ok) {
    let detail = ''
    try {
      const body = await resp.json()
      detail = body?.detail ? JSON.stringify(body.detail) : ''
    } catch {
      /* ignore */
    }
    throw new Error(`Triage failed (${resp.status}) ${detail}`)
  }
  return resp.json()
}

export async function getClinics(city, province) {
  const params = new URLSearchParams()
  if (city) params.set('city', city)
  if (province) params.set('province', province)
  const qs = params.toString()
  const resp = await fetch(`${API_BASE}/api/clinics${qs ? `?${qs}` : ''}`)
  if (!resp.ok) throw new Error(`Clinics failed (${resp.status})`)
  return resp.json()
}

export async function getHealth() {
  const resp = await fetch(`${API_BASE}/api/health`)
  if (!resp.ok) throw new Error(`Health failed (${resp.status})`)
  return resp.json()
}
