// Thin API client for the Nabz backend.
// In dev, Vite proxies /api -> http://localhost:8000 (see vite.config.js).
// Override the base with VITE_API_BASE. The JWT is read from localStorage and
// attached to every request; AI keys NEVER live here — all AI goes via backend.

const API_BASE = import.meta.env.VITE_API_BASE || ''
const TOKEN_KEY = 'nabz_token'
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024

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
    const friendly = detail.startsWith('file_too_large')
      ? 'File is too large. Maximum size is 25 MB.'
      : detail.startsWith('unsupported_type') || detail.startsWith('file_signature')
        ? 'This file format is not supported, or the file does not match its extension.'
        : detail === 'pdf_render_failed'
          ? 'This PDF could not be opened. It may be damaged or password protected.'
          : detail
    const err = new Error(friendly)
    err.status = resp.status
    err.detail = detail
    throw err
  }
  return body
}

async function jsonReq(path, method, payload, options = {}) {
  const controller = new AbortController()
  const timeoutMs = options.timeoutMs || 0
  let abortCause = ''
  const timeout = timeoutMs ? window.setTimeout(() => {
    abortCause = 'timeout'
    controller.abort()
  }, timeoutMs) : null
  const abortFromCaller = () => {
    abortCause = 'cancelled'
    controller.abort()
  }
  options.signal?.addEventListener('abort', abortFromCaller, { once: true })
  if (options.signal?.aborted) abortFromCaller()
  try {
    const resp = await fetch(`${API_BASE}${path}`, {
      method,
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: payload !== undefined ? JSON.stringify(payload) : undefined,
      signal: controller.signal,
    })
    return handle(resp)
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timedOut = abortCause === 'timeout'
      const next = new Error(timedOut
        ? 'The assessment took too long. Your conversation is preserved; please retry.'
        : 'Request cancelled. Your conversation is preserved.')
      next.name = 'AbortError'
      next.timedOut = timedOut
      throw next
    }
    throw error
  } finally {
    if (timeout) window.clearTimeout(timeout)
    options.signal?.removeEventListener('abort', abortFromCaller)
  }
}

function validateClientUpload(file) {
  if (!file || !file.size) throw new Error('Please choose a non-empty file.')
  if (file.size > MAX_UPLOAD_BYTES) throw new Error('File is too large. Maximum size is 25 MB.')
}

// --- Auth --------------------------------------------------------------------

export const registerAccount = (full_name, phone, password, email) =>
  jsonReq('/api/auth/register', 'POST', { full_name, phone, password, email: email || null })

export const loginAccount = (phone, password) =>
  jsonReq('/api/auth/login', 'POST', { phone, password })

export const getMe = () => jsonReq('/api/auth/me', 'GET')

// Verification (soft gate). requestOtp returns { dev_code } in mock mode.
export const requestOtp = (channel) =>
  jsonReq('/api/auth/request-otp', 'POST', { channel })

export const verifyOtp = (channel, code) =>
  jsonReq('/api/auth/verify-otp', 'POST', { channel, code })

// --- Profiles ----------------------------------------------------------------

export const listProfiles = () => jsonReq('/api/profiles', 'GET')
export const getProfile = (id) => jsonReq(`/api/profiles/${id}`, 'GET')
export const createProfile = (data) => jsonReq('/api/profiles', 'POST', data)
export const updateProfile = (id, data) => jsonReq(`/api/profiles/${id}`, 'PUT', data)
export const deleteProfile = (id) => jsonReq(`/api/profiles/${id}`, 'DELETE')

// --- Conversational triage ---------------------------------------------------

export const triageStart = (profile_id, text, signal) =>
  jsonReq('/api/triage/start', 'POST', { profile_id, text }, { signal, timeoutMs: 75_000 })

export const triageAnswer = (session_id, text, signal) =>
  jsonReq('/api/triage/answer', 'POST', { session_id, text }, { signal, timeoutMs: 75_000 })

export const triageChat = (session_id, text) =>
  jsonReq('/api/triage/chat', 'POST', { session_id, text })

export function triageImage(sessionId, file, signal) {
  validateClientUpload(file)
  const form = new FormData()
  form.append('session_id', String(sessionId))
  form.append('file', file)
  return fetch(`${API_BASE}/api/triage/image`, {
    method: 'POST',
    headers: authHeaders(),
    body: form,
    signal,
  }).then(handle)
}

export const retryTriageAssessment = (sessionId, signal) =>
  jsonReq(`/api/triage/retry/${encodeURIComponent(sessionId)}`, 'POST', undefined, { signal, timeoutMs: 75_000 })

export const listTriageHistory = (profileId) =>
  jsonReq(`/api/triage/history?profile_id=${encodeURIComponent(profileId)}`, 'GET')

export const getTriageHistory = (sessionId) =>
  jsonReq(`/api/triage/history/${encodeURIComponent(sessionId)}`, 'GET')

// --- Documents ---------------------------------------------------------------

async function uploadFile(path, profileId, file) {
  validateClientUpload(file)
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

export function confirmLabReport(profileId, file, report) {
  validateClientUpload(file)
  const form = new FormData()
  form.append('profile_id', String(profileId))
  form.append('report_json', JSON.stringify(report))
  form.append('file', file)
  return fetch(`${API_BASE}/api/labreport/confirm`, {
    method: 'POST', headers: authHeaders(), body: form,
  }).then(handle)
}

export const confirmPrescription = (data) =>
  jsonReq('/api/prescription/confirm', 'POST', data)

export function attachConfirmedPrescription(profileId, confirmationEntryId, file) {
  validateClientUpload(file)
  const form = new FormData()
  form.append('profile_id', String(profileId))
  form.append('confirmation_entry_id', String(confirmationEntryId))
  form.append('file', file)
  return fetch(`${API_BASE}/api/documents/prescription-source`, {
    method: 'POST',
    headers: authHeaders(),
    body: form,
  }).then(handle)
}

export function uploadVaultDocument(profileId, documentType, file, title = '', notes = '') {
  validateClientUpload(file)
  const form = new FormData()
  form.append('profile_id', String(profileId))
  form.append('document_type', documentType)
  form.append('title', title)
  form.append('notes', notes)
  form.append('file', file)
  return fetch(`${API_BASE}/api/documents`, {
    method: 'POST',
    headers: authHeaders(),
    body: form,
  }).then(handle)
}

export const listDocuments = (profileId) =>
  jsonReq(`/api/documents?profile_id=${encodeURIComponent(profileId)}`, 'GET')

export async function openDocument(document) {
  const resp = await fetch(`${API_BASE}${document.view_url}`, { headers: authHeaders() })
  if (!resp.ok) await handle(resp)
  const blob = await resp.blob()
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank', 'noopener,noreferrer')
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export const deleteDocument = (entryId) => jsonReq(`/api/documents/${entryId}`, 'DELETE')

// --- Location + facilities ---------------------------------------------------

export const resolveLocation = (latitude, longitude, accuracy_m) =>
  jsonReq('/api/location/resolve', 'POST', { latitude, longitude, accuracy_m })

export const confirmLocation = (data) =>
  jsonReq('/api/location/confirm', 'POST', data)

export const getMyLocation = () => jsonReq('/api/location/me', 'GET')

export function getNearbyFacilities({ urgency = 'DOCTOR_24H', latitude, longitude, limit = 6, type } = {}) {
  const params = new URLSearchParams({ urgency, limit: String(limit) })
  if (latitude != null) params.set('latitude', String(latitude))
  if (longitude != null) params.set('longitude', String(longitude))
  if (type) params.set('type', type)
  return jsonReq(`/api/facilities/nearby?${params.toString()}`, 'GET')
}

// --- Summary + misc ----------------------------------------------------------

export const getSummary = (profileId) => jsonReq(`/api/summary/${profileId}`, 'GET')
export const getDashboard = (profileId) => jsonReq(`/api/dashboard/${profileId}`, 'GET')
export const seedDemoProfile = (profileId) => jsonReq(`/api/demo/seed/${profileId}`, 'POST')

export async function getClinics(city, province) {
  const params = new URLSearchParams()
  if (city) params.set('city', city)
  if (province) params.set('province', province)
  const qs = params.toString()
  return jsonReq(`/api/clinics${qs ? `?${qs}` : ''}`, 'GET')
}

export const getHealth = () => jsonReq('/api/health', 'GET')
export const getHealthDetail = () => jsonReq('/api/health/detail', 'GET')

export const loadHassanDemo = () => jsonReq('/api/demo/hassan', 'POST')

export async function attachChatImage(profileId, file) {
  validateClientUpload(file)
  const form = new FormData()
  form.append('profile_id', String(profileId))
  form.append('file', file)
  const resp = await fetch(`${API_BASE}/api/chat/attach`, {
    method: 'POST',
    headers: authHeaders(),
    body: form,
  })
  return handle(resp)
}
