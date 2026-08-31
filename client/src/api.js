// Thin API client for the Nabz backend.
// In dev, Vite proxies /api -> http://localhost:8000 (see vite.config.js).
// Override the base with VITE_API_BASE. The JWT is kept in tab-scoped
// sessionStorage and attached to every request; AI keys NEVER live here.

const API_BASE = import.meta.env.VITE_API_BASE || ''
const TOKEN_KEY = 'nabz_token'
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024

export function getToken() {
  // Purge the persistent token format used by older releases.
  try { localStorage.removeItem(TOKEN_KEY) } catch { /* ignore */ }
  try {
    return sessionStorage.getItem(TOKEN_KEY) || ''
  } catch {
    return ''
  }
}
export function setToken(token) {
  // A health session must never be restored from persistent browser storage
  // or browser-profile migration.
  try { localStorage.removeItem(TOKEN_KEY) } catch { /* ignore */ }
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token)
    else sessionStorage.removeItem(TOKEN_KEY)
  } catch { /* private/locked-down browsers may deny storage */ }
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
    const validation = body && typeof body === 'object' && Array.isArray(body.detail)
      ? body.detail
      : null
    const detail =
      body && typeof body === 'object' && body.detail
        ? typeof body.detail === 'string'
          ? body.detail
          : JSON.stringify(body.detail)
        : `HTTP ${resp.status}`
    const friendly = validation
      ? 'Please check the highlighted fields and try again.'
      : detail.startsWith('file_too_large')
        ? 'File is too large. Maximum size is 25 MB.'
        : detail.startsWith('unsupported_type') || detail.startsWith('file_signature')
          ? 'This file format is not supported, or the file does not match its extension.'
          : detail === 'pdf_render_failed'
            ? 'This PDF could not be opened. It may be damaged or password protected.'
            : detail.startsWith('consent_required')
              ? 'Your privacy consent needs to be refreshed before this health action. Open Privacy & consent from the account menu, review the choices, and save them again.'
              : detail
    const err = new Error(friendly)
    err.status = resp.status
    err.detail = detail
    err.validation = validation
    err.body = body
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

export const registerAccount = (full_name, phone, password, email, date_of_birth) =>
  jsonReq('/api/auth/register', 'POST', {
    full_name,
    phone,
    password,
    email: email || null,
    date_of_birth,
  })

export const loginAccount = (identifier, password) =>
  jsonReq('/api/auth/login', 'POST', { identifier, password })

export const requestPasswordReset = (identifier) =>
  jsonReq('/api/auth/password-reset/request', 'POST', { identifier })

export const confirmPasswordReset = (identifier, code, new_password) =>
  jsonReq('/api/auth/password-reset/confirm', 'POST', { identifier, code, new_password })

export const getMe = () => jsonReq('/api/auth/me', 'GET')

// Verification (soft gate). A code is rendered only when the backend explicitly
// authorizes a recipient-scoped demo fallback.
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

// --- Privacy, consent, and account activity ---------------------------------

export const getConsentStatus = () => jsonReq('/api/privacy/consents', 'GET')

export const updateConsentChoices = (choices, source = 'privacy_page') =>
  jsonReq('/api/privacy/consents', 'PUT', { choices, source })

export const getPrivacyActivity = (limit = 30) =>
  jsonReq(`/api/privacy/activity?limit=${encodeURIComponent(limit)}`, 'GET')

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

// Anonymous assessments use an opaque, expiring state token. They are never
// attached to an account or Vault unless the person later signs in and starts
// a saved encounter.
export const guestTriageStart = (text, consent, signal) =>
  jsonReq('/api/guest/triage/start', 'POST', { text, consent }, { signal, timeoutMs: 75_000 })

export const guestTriageAnswer = (state_token, text, signal) =>
  jsonReq('/api/guest/triage/answer', 'POST', { state_token, text }, { signal, timeoutMs: 75_000 })

export const retryGuestTriage = (state_token, signal) =>
  jsonReq('/api/guest/triage/retry', 'POST', { state_token }, { signal, timeoutMs: 75_000 })

export const guestTriageChat = (state_token, text, signal) =>
  jsonReq('/api/guest/triage/chat', 'POST', { state_token, text }, { signal, timeoutMs: 75_000 })

export function attachGuestTriageFile(file, { stateToken = '', consent = false, signal } = {}) {
  validateClientUpload(file)
  const form = new FormData()
  form.append('file', file)
  form.append('consent', String(Boolean(consent)))
  if (stateToken) form.append('state_token', stateToken)
  return fetch(`${API_BASE}/api/guest/triage/attach`, {
    method: 'POST',
    headers: authHeaders(),
    body: form,
    signal,
  }).then(handle)
}

export const clearGuestTriage = (stateToken) =>
  jsonReq(`/api/guest/triage/${encodeURIComponent(stateToken)}`, 'DELETE')

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

export const listKnownCities = () => jsonReq('/api/location/cities', 'GET')
export const listLocationRegions = () => jsonReq('/api/location/regions', 'GET')

export function getNearbyFacilities({ urgency = 'DOCTOR_24H', latitude, longitude, limit = 6, type } = {}) {
  const params = new URLSearchParams({ urgency, limit: String(limit) })
  if (latitude != null) params.set('latitude', String(latitude))
  if (longitude != null) params.set('longitude', String(longitude))
  if (type) params.set('type', type)
  return jsonReq(`/api/facilities/nearby?${params.toString()}`, 'GET')
}

// --- Summary + misc ----------------------------------------------------------

export const getSummary = (profileId) => jsonReq(`/api/summary/${profileId}`, 'GET')

// Doctor QR handoff — issues a short-lived read-only link the doctor can
// scan or open on their phone. The public read endpoint is unauthenticated
// (the token in the URL grants read access), so we do not attach the JWT.
export const createDoctorHandoff = (profileId) =>
  jsonReq(`/api/summary/${profileId}/handoff`, 'POST')

export async function readDoctorHandoff(token) {
  const url = `${API_BASE}/api/handoff/${encodeURIComponent(token)}`
  let lastError = null
  // Public Render services can occasionally be waking while the web page is
  // already visible. Retry one transient network/5xx failure, but never retry
  // a rejected or expired grant.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const resp = await fetch(url, { cache: 'no-store', headers: { Accept: 'application/json' } })
      if (resp.status >= 500 && attempt === 0) {
        await new Promise((resolve) => window.setTimeout(resolve, 650))
        continue
      }
      const contentType = resp.headers.get('content-type') || ''
      if (resp.ok && !contentType.includes('application/json')) {
        throw new Error('handoff_service_misrouted')
      }
      return handle(resp)
    } catch (error) {
      lastError = error
      if (error?.status || attempt > 0) throw error
      await new Promise((resolve) => window.setTimeout(resolve, 650))
    }
  }
  throw lastError || new Error('handoff_service_unavailable')
}
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

// --- Private product analytics ----------------------------------------------

export const trackUsage = (payload) =>
  jsonReq('/api/analytics/heartbeat', 'POST', payload)

export const getAdminOverview = (days = 14) =>
  jsonReq(`/api/admin/overview?days=${encodeURIComponent(days)}`, 'GET')

export const getAdminLogs = (errorsOnly = false, limit = 80) =>
  jsonReq(`/api/admin/logs?errors_only=${errorsOnly ? 'true' : 'false'}&limit=${encodeURIComponent(limit)}`, 'GET')

export const loadHassanDemo = () => jsonReq('/api/demo/hassan', 'POST')

// --- SSE streaming triage ---------------------------------------------------
//
// Streams milestone progress events from the backend while the model runs.
// Returns an object with .cancel() to abort in flight; callers get called
// back for progress events and the final turn.
//
// Usage:
//   const stream = triageStreamStart(profileId, text, {
//     onProgress: (evt) => ...,
//     onTurn: (turn) => ...,
//     onError: (err) => ...,
//   })
//   stream.cancel()   // abort at any time
export function triageStreamStart(profile_id, text, handlers = {}) {
  return _openTriageStream('/api/triage/stream/start', { profile_id, text }, handlers)
}

export function triageStreamAnswer(session_id, text, handlers = {}) {
  return _openTriageStream('/api/triage/stream/answer', { session_id, text }, handlers)
}

function _openTriageStream(path, body, { onProgress, onTurn, onError } = {}) {
  const ctrl = new AbortController()
  const url = `${API_BASE}${path}`
  const promise = (async () => {
    let resp
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json', Accept: 'text/event-stream' }),
        body: JSON.stringify(body),
        signal: ctrl.signal,
      })
    } catch (err) {
      if (err.name !== 'AbortError') onError && onError(err)
      return
    }
    if (!resp.ok || !resp.body) {
      const detail = await resp.text().catch(() => '')
      onError && onError(new Error(`stream_failed:${resp.status}:${detail}`))
      return
    }
    const reader = resp.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buf = ''
    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        let idx
        while ((idx = buf.indexOf('\n\n')) !== -1) {
          const raw = buf.slice(0, idx)
          buf = buf.slice(idx + 2)
          const evt = _parseSseEvent(raw)
          if (!evt) continue
          if (evt.event === 'turn') {
            try { onTurn && onTurn(JSON.parse(evt.data)) } catch (e) { onError && onError(e) }
          } else if (evt.event === 'error') {
            try { onError && onError(new Error(JSON.parse(evt.data).message || 'stream_error')) }
            catch { onError && onError(new Error('stream_error')) }
          } else {
            try { onProgress && onProgress({ event: evt.event, ...JSON.parse(evt.data) }) }
            catch { onProgress && onProgress({ event: evt.event, raw: evt.data }) }
          }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') onError && onError(err)
    }
  })()
  return { cancel: () => ctrl.abort(), done: promise }
}

function _parseSseEvent(block) {
  const lines = block.split('\n')
  let event = 'message'
  const dataLines = []
  for (const line of lines) {
    if (line.startsWith('event:')) event = line.slice(6).trim()
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''))
  }
  if (dataLines.length === 0) return null
  return { event, data: dataLines.join('\n') }
}

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
