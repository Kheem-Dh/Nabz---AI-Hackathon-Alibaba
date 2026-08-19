// Thin API client for the Nabz backend.
// In dev, Vite proxies /api -> http://localhost:8000 (see vite.config.js).
// Override the base with VITE_API_BASE. The JWT is read from localStorage and
// attached to every request; AI keys NEVER live here — all AI goes via backend.

const API_BASE = import.meta.env.VITE_API_BASE || ''
const TOKEN_KEY = 'nabz_token'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || ''
}
export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

function authHeaders(extra = {}) {
  const token = getToken()
  return token ? { ...extra, Authorization: `Bearer ${token}` } : { ...extra }
}

async function handle(resp) {
  if (resp.status === 204) return null
  let body = null
  const text = await resp.text()
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }
  if (!resp.ok) {
    const detail =
      body && typeof body === 'object' && body.detail
        ? typeof body.detail === 'string'
          ? body.detail
          : JSON.stringify(body.detail)
        : `HTTP ${resp.status}`
    const err = new Error(detail)
    err.status = resp.status
    throw err
  }
  return body
}

async function jsonReq(path, method, payload) {
  const resp = await fetch(`${API_BASE}${path}`, {
    method,
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: payload !== undefined ? JSON.stringify(payload) : undefined,
  })
  return handle(resp)
}

// --- Auth --------------------------------------------------------------------

export const registerAccount = (full_name, phone, password) =>
  jsonReq('/api/auth/register', 'POST', { full_name, phone, password })

export const loginAccount = (phone, password) =>
  jsonReq('/api/auth/login', 'POST', { phone, password })

export const getMe = () => jsonReq('/api/auth/me', 'GET')

// --- Profiles ----------------------------------------------------------------

export const listProfiles = () => jsonReq('/api/profiles', 'GET')
export const getProfile = (id) => jsonReq(`/api/profiles/${id}`, 'GET')
export const createProfile = (data) => jsonReq('/api/profiles', 'POST', data)
export const updateProfile = (id, data) => jsonReq(`/api/profiles/${id}`, 'PUT', data)
export const deleteProfile = (id) => jsonReq(`/api/profiles/${id}`, 'DELETE')

// --- Conversational triage ---------------------------------------------------

export const triageStart = (profile_id, text) =>
  jsonReq('/api/triage/start', 'POST', { profile_id, text })

export const triageAnswer = (session_id, text) =>
  jsonReq('/api/triage/answer', 'POST', { session_id, text })

// --- Documents ---------------------------------------------------------------

async function uploadFile(path, profileId, file) {
  const form = new FormData()
  form.append('profile_id', String(profileId))
  form.append('file', file)
  const resp = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: authHeaders(),
    body: form,
  })
  return handle(resp)
}

export const uploadLabReport = (profileId, file) => uploadFile('/api/labreport', profileId, file)
export const scanPrescription = (profileId, file) => uploadFile('/api/prescription', profileId, file)

export const confirmPrescription = (data) =>
  jsonReq('/api/prescription/confirm', 'POST', data)

// --- Summary + misc ----------------------------------------------------------

export const getSummary = (profileId) => jsonReq(`/api/summary/${profileId}`, 'GET')

export async function getClinics(city, province) {
  const params = new URLSearchParams()
  if (city) params.set('city', city)
  if (province) params.set('province', province)
  const qs = params.toString()
  return jsonReq(`/api/clinics${qs ? `?${qs}` : ''}`, 'GET')
}

export const getHealth = () => jsonReq('/api/health', 'GET')
