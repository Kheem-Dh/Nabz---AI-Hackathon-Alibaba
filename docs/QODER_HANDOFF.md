# Nabz — Qoder handoff

> A single-page brief for the Qoder assistant so it can continue this build
> without re-deriving context. Everything below is what already exists on
> `main` at the point of hand-off, plus the exact next steps.

## What Nabz is

Voice-first, Urdu-first AI health-triage companion for Pakistan. It **triages
urgency, it never diagnoses or prescribes**. Family vault, lab-report and
prescription reading, doctor-handoff summary, and location-aware nearby-care
navigation.

Built for **Alibaba Cloud AI Hackathon Pakistan 2026** (theme: *AI for
Pakistan's Future*). The winning thesis: *"From voice to the safest next
step — and the right nearby place to go — in under 90 seconds."*

## Repository layout

```
client/                     React 18 + Vite SPA (mobile-first, RTL, PWA)
  src/
    api.js                  fetch client, JWT bearer, all AI calls go via server
    App.jsx                 router + first-run location gate + TopBar
    hooks/
      useSpeechRecognition  browser STT (lang=ur-PK)
      useTextToSpeech       browser TTS + server gTTS fallback
      useGeolocation        device geolocation
    context/
      AuthContext           JWT + /api/auth/me
      LocationContext       LocationPreference + freshness
      ProfileContext        active family profile
    components/
      ActiveProfileBar      "Talking about X, age N" chip
      AnalysisPanel         live analysis (Assessment completeness · Q n/~5)
      BottomNav             Home · Vault · Clinics
      Disclaimer            persistent Urdu+English footer
      LocationChip          header chip → /location
      MicButton, ProfileSwitcher, TriageConversation, TriageResult
      NearbyCare            ranked facility cards after a triage result
    pages/
      AuthPage, LocationSetupPage, HomePage, VaultPage, ProfilePage,
      ProfileEditPage, ClinicsPage, LabReportPage, PrescriptionPage,
      SummaryPage, PrivacyPage
  public/
    manifest.webmanifest, icon.svg, icon-maskable.svg, sw.js
  capacitor.config.json     Android/iOS wrapper config

server/                     FastAPI + SQLAlchemy + Qwen
  main.py                   app + router mounts + /api/health(/detail)
  db.py, models_db.py       SQLite by default; DATABASE_URL swaps engines
  schemas.py                pydantic v2 request/response
  security.py               bcrypt + PyJWT + get_current_account dep
  auth.py                   register / login / me
  profiles.py               CRUD (with soft protection for is_self)
  location.py               /resolve /confirm /me (Nominatim + offline fallback)
  facilities.py             /api/facilities/nearby (severity + distance ranking)
  facilities_data.py        curated PK facility dataset (20+ with coords)
  clinics.py                legacy /api/clinics (8 KP items — kept for the tab)
  triage.py                 conversational engine (mock + Qwen), red-flag guardrail
  sessions.py               /api/triage/start /answer
  vision.py                 shared Qwen-VL helper
  labreport.py              /api/labreport (Qwen-VL + Urdu explain)
  prescription.py           /api/prescription (+/confirm) — never auto-saves
  summary.py                /api/summary/{profile_id} doctor handoff

docs/architecture.pdf       one-page architecture visual
docs/ALIBABA_CLOUD_DEPLOY.md ECS deployment, costs, TLS, backup, rollback
docs/QODER_HANDOFF.md       (this file)
README.md, TESTING.md, PRIVACY.md, eval.py, Makefile
.env.production.example     production env names only (no secrets)
compose.prod.yaml           FastAPI + Nginx production stack with volumes
.env.example                template — copy to server/.env
```

## Running it (local)

```bash
# 1. Backend
cd server
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp ../.env.example .env               # or edit server/.env directly
uvicorn main:app --reload --port 8000

# 2. Frontend
cd ../client
npm install
npm run dev                            # http://localhost:5173
```

`/api/health` returns `{"mock_mode": true|false}`; `/api/health/detail` also
shows the currently-configured text/vision model names and location provider.

## Mock vs. real gate

`is_mock_mode()` is true when **either** `MOCK_MODE=true` **or** no
`DASHSCOPE_API_KEY` is set. Every AI response carries `"mock": true|false`.

The entire app — including lab/prescription vision, conversational triage,
facility ranking, doctor handoff — works with zero credentials in mock mode.

## Model routing

Env-configurable with legacy fallbacks:

| Purpose  | Preferred env      | Legacy env          | Default        |
| -------- | ------------------ | ------------------- | -------------- |
| Text     | `NABZ_TEXT_MODEL`  | `QWEN_MODEL`        | `qwen-plus`    |
| Vision   | `NABZ_VL_MODEL`    | `QWEN_VL_MODEL`     | `qwen-vl-plus` |
| VL OCR   | `NABZ_VL_OCR_FALLBACK` | —               | *(optional)*   |

The winning plan (§6) recommends `qwen3.7-plus` for text and structured
vision, and `qwen3.5-omni-plus` if you later add native Alibaba-Cloud Urdu
audio (Nabz currently uses browser STT/TTS with a server gTTS fallback).

## Location + facilities

- **`useGeolocation`** hook fires on explicit user tap only.
- **`POST /api/location/resolve`** — Nominatim reverse-geocode with an offline
  Pakistan-city fallback so it always answers (critical on stage Wi-Fi).
- **`POST /api/location/confirm`** — persists a per-account `LocationPreference`
  with `last_confirmed_at` for the freshness policy (10-minute window).
- **`GET /api/facilities/nearby?urgency=…`** — ranks the curated dataset by
  `severity_fit + distance + emergency_capable_bonus + verified_bonus`.
  Returns the same shape whether the source is `live | curated | demo`.
- `NABZ_DISABLE_NOMINATIM=1` skips the online call and forces the offline
  city-center lookup — useful for rehearsals without internet.

## Conversational triage — the state machine

`triage/start` and `triage/answer` produce a unified `TriageTurn` with either
`type: "question"` (+ `quick_replies`, `analysis`) or `type: "result"`
(+ `level`, `advice_urdu/english`, `reason_english`, `facility_intent`).

Deterministic emergency guardrails run **on every turn**, before the LLM.
Uncertainty after five questions resolves upward to at least `DOCTOR_24H`.

Mock-mode follow-ups are complaint-specific (skin, fever, respiratory,
stomach, pain, or general) and recognize common Urdu/Roman-Urdu lay phrases.
Real-model instructions likewise forbid generic or repeated questions. Browser
speech capture uses continuous recognition, waits through short pauses, and
submits after three seconds of silence or an explicit Done tap.

The response's `analysis.confidence` and `analysis.completeness` carry the
same value; the UI labels it **"Assessment completeness"** — never diagnostic
probability (winning plan §4.5).

## Mobile

**PWA** (immediate, works everywhere):

- `public/manifest.webmanifest`, `public/sw.js`, SVG icons.
- Registered in `client/src/main.jsx` only when `import.meta.env.PROD`.
- Passes Android Chrome's install-to-homescreen criteria after `npm run
  build && npm run preview` (or any HTTPS deploy).
- SW **never** caches `/api/*` responses (auth + PHI) — API-first, shell-only.

**Capacitor** (native APK/IPA wrapper):

```bash
cd client
npm run cap:install              # installs @capacitor/{core,cli,android,ios}
npx cap init "Nabz" pk.nabz.app --web-dir dist   # first time only
npm run cap:add:android          # scaffolds android/ project
npm run mobile:android           # build web, sync, open Android Studio
```

Android Studio + JDK 17 are required to actually produce an APK. For iOS,
Xcode on macOS. The Capacitor config lives at `client/capacitor.config.json`.

## Safety boundary

- **Never diagnoses a specific disease.** **Never prescribes.**
- Emergency red-flag detection is a **non-LLM** rule engine that runs before
  every model call and can short-circuit to `EMERGENCY` with **zero**
  follow-up questions.
- Prescription scanning reads a clinician's paper and requires a mandatory
  human-confirmation screen. Nothing enters `Current Medicines` until the
  user taps **Confirm**.
- Low-confidence fields are flagged, not guessed.
- Suicidal input triggers a compassionate emergency card, never method
  discussion.
- VL prompts explicitly instruct the model to treat any text on the page as
  untrusted (prompt-injection defense, winning plan §15.3).

## Tests + eval

```bash
cd server && MOCK_MODE=true python -m pytest tests/ -q
python eval.py                              # runs against http://localhost:8000
```

`eval.py` exits non-zero if any curated emergency case is under-triaged. Do
not deploy demo day if this fails.

## Roadmap for Qoder (in priority order)

1. **Real-model rehearsal.** Set a real `DASHSCOPE_API_KEY`, flip
   `NABZ_TEXT_MODEL=qwen3.7-plus`, run through the 60-second demo path.
   Log latency; if a text turn exceeds ~6 s, revisit `qwen-plus`.
2. **Cloud launch.** The repo now ships a validated ECS Docker Compose stack:
   non-root FastAPI, Nginx + React, health checks, and persistent SQLite/upload
   volumes. Claim/provision the Alibaba Cloud ECS instance, configure the
   production env on-host, and add domain + HTTPS. See
   `docs/ALIBABA_CLOUD_DEPLOY.md`. Set DNS at least 24 h before presentation.
3. **Live facility provider.** Add a `MAPS_PROVIDER` env (e.g. Google Places
   or Baidu / Amap for CN-hosted). Wire it as an additional layer in
   `facilities.py` above the curated dataset. Keep the same response schema.
4. **Native Urdu audio (Qwen3.5-Omni).** Backend route that accepts recorded
   webm/wav, returns a transcript + optional spoken reply. Wire under
   `useTextToSpeech` when it beats browser TTS.
5. **PWA install prompt UI.** Add a soft banner that catches
   `beforeinstallprompt` and shows a "Install Nabz" CTA on Android.
6. **Capacitor APK.** Follow the mobile block above; sign with a debug key
   for demo, upload to Play Console internal testing for later.
7. **Cross-profile leakage test.** Add pytest cases that create two profiles
   under the same account, start a triage for A, and assert the model never
   sees profile B's context.
8. **Consent + audit.** Persist explicit `Consent` records and light
   `AuditEvent` rows for delete/upload/summary generation (plan §17).

## Credentials Qoder should collect

- **`DASHSCOPE_API_KEY`** from Alibaba Cloud Model Studio (International
  console → API-KEY → Create API Key). Never commits.
- **`JWT_SECRET`** — replace the dev secret before any deploy.
- **`CORS_ORIGINS`** — set to the deployed frontend origin(s).
- Optional: `MAPS_PROVIDER` credentials if you add a live-provider layer.

## Non-goals (do NOT let scope creep steal the demo)

Disease diagnosis, autonomous prescribing, differential-diagnosis panels,
huge clinic databases, admin dashboards, EHR integrations, offline-first
databases. See the winning plan §1.2 and §20.

---

`نبض · Nabz · Alibaba Cloud AI Hackathon Pakistan 2026`
