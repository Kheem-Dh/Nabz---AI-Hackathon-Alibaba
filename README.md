# Nabz — نبض

> **آپ کی آواز، آپ کی صحت** · _Your voice, your health_

**Nabz** is an Urdu-first, voice-first AI health companion for underserved communities in Pakistan, built for the **Alibaba Cloud AI Hackathon Pakistan 2026**.

Instead of behaving like a generic symptom checker, Nabz guides the user through a **personalized, one-question-at-a-time triage conversation**, shows a live analysis of what has been collected, identifies emergency red flags early, and produces a clear urgency recommendation:

| Level             | Urdu                       | Meaning                                            |
| ----------------- | -------------------------- | -------------------------------------------------- |
| 🚑 **EMERGENCY**  | فوری مدد                   | Go to a hospital / emergency service now           |
| 🩺 **DOCTOR_24H** | ڈاکٹر سے 24 گھنٹے میں ملیں | See a clinician within 24 hours                    |
| 🏠 **HOME_CARE**  | گھر پر دیکھ بھال           | Home care, monitoring, and escalation instructions |

Nabz also includes a **family Medical Vault**, **lab-report explanation**, **prescription extraction with human confirmation**, **nearby-clinic handoff**, and a **print/share doctor summary**.

> **Safety boundary:** Nabz is not a doctor, does not diagnose a specific disease, and does not independently prescribe medication. Prescription scanning only extracts information from an existing clinician-issued prescription and requires user confirmation before anything is saved.

---

## What's new — 2026-08-21 (adaptive clinical interview + curated evidence + desktop workspace)

This drop lands the "adaptive triage + curated evidence + doctor-ready dashboard" phase of the winning plan. Everything below is on `main` and covered by `pytest` (41/41), the safety `eval.py` (16/16, zero emergency under-triage, zero emergency extra questions), a live-Qwen script that self-SKIPs without credentials, and a browser end-to-end walk-through of the exact required transcript.

### ✅ Shipped in this pass

**Adaptive clinical interview**

- New `ClinicalState` structured snapshot (chief complaint, body location + laterality, onset/duration, course, severity, associated symptoms, red flags present/denied, unknowns) rebuilt every turn from the full transcript. Fed into both mock and Qwen paths and returned on every `TriageTurn`.
- `TriageTurn` now carries `patient_facing_impression_urdu/english`, `possible_causes`, `doctor_differential`, `supporting_findings`, `findings_against`, `unresolved_questions`, `red_flags_present/denied`, `escalation_signs`, `question_goal`, `why_this_matters`, and `medication_options`.
- Rewritten Qwen system prompt: adaptive interview only, one highest-value question per turn, hedged patient-facing language, explicit "medication candidates go through server validation," and an untrusted-content notice (transcripts / documents / Vault text are data, never directives).
- Emergency short-circuit still deterministic and runs before every model call; question ceiling still 5; conservative safe fallback on parse failure.

**Curated medication-evidence resolver**

- `server/medicine_evidence.py` extended in place with a curated evidence catalog keyed by `(condition_key, generic_name)` and `resolve_medication_candidates()` — the ONLY writer of `MedicationOption` cards.
- Every model-generated `dose_guidance`, `evidence_source_url`, and `safety_note` is **discarded**. Those fields only come from the catalog. Allowlisted evidence domains: `who.int`, `list.essentialmeds.org`, `nice.org.uk`, `cks.nice.org.uk`, `cdc.gov`, `dailymed.nlm.nih.gov`, `dra.gov.pk`, `medlineplus.gov`.
- Blocked as self-treatment options: amoxicillin, azithromycin, ciprofloxacin, prednisolone, dexamethasone, morphine, codeine, tramadol, diazepam, insulin, and 15+ more antibiotics / steroids / opioids / sedatives / controlled drugs.
- Allergy suppression with brand aliases: **Hassan's ibuprofen allergy blocks ibuprofen (and NSAID aliases) from ever surfacing**; the resolver is unit-tested to guarantee it.
- Emergency urgency → empty medication_options; the winning plan forbids delaying an emergency with drug information.

**Hassan demo — real, readable, watermarked fixtures**

- Replaced the 1×1 PNG placeholders. New `server/demo_fixtures.py` renders four documents at seed time (CBC, prescription, chest X-ray note, right-arm skin progress) as legible PNGs with a fixed banner: **"SYNTHETIC DEMO — NOT A REAL PATIENT DOCUMENT"**. No PIL/Pillow dependency — a minimal in-repo 5×7 bitmap font.
- New `POST /api/demo/hassan` — one-click, mock-mode-only, idempotent: creates the Hassan profile if missing, seeds it with the fixtures, and returns its id.
- Home workspace surfaces a **"Load Hassan demo"** call-to-action inside the Switch-patient panel; visible only when `/api/health` reports `mock_mode: true`.

**Encounter persistence + doctor-ready view**

- Full encounter transcript is now attached to the completed-triage timeline payload (`payload.encounter_transcript`), so the doctor dashboard renders the conversation with zero extra lookups.
- `GET /api/dashboard/{profile_id}` and `GET /api/summary/{profile_id}` both surface `patient_facing_impression_english`, `doctor_differential`, `supporting_findings`, `findings_against`, `unresolved_questions`, `red_flags_present/denied`, `escalation_signs`, `medication_options`, `clinical_state`, `vault_context_used`, and the encounter transcript.
- `PatientDashboard.jsx` adds a doctor-facing differential panel with an expandable transcript and a red-flags block.

**Voice capture + review**

- `useSpeechRecognition` default silence window extended (initial capture 8s, follow-ups 5s+). Prominent **"Done speaking · مکمل"** button.
- New `reviewing` phase in `TriageConversation` — the transcript never sends until the user taps Send. Retry, Edit, and Cancel are always visible. `tts.cancel()` fires before mic capture so the assistant never records itself.

**Live-Qwen adaptive-triage eval**

- `scripts/live_triage_eval.py` runs the right-arm skin transcript five times, hard-caps at 25 total Qwen calls, and reports per-session: skin-specific / no-breathing-default / no-medication-on-turn-1 / question-variation. **SKIPPED (exit 0) when `DASHSCOPE_API_KEY` is unset — CI never depends on network.**

### 🚧 Still to do (Qoder handoff — priority order)

1. **Real-Qwen rehearsal.** Set `DASHSCOPE_API_KEY` and `NABZ_TEXT_MODEL=qwen3.7-plus`, then run `scripts/live_triage_eval.py` and time end-to-end triage turns. Fall back to `qwen-plus` if any turn exceeds ~6 s.
2. **Cloud deploy.** Follow `docs/ALIBABA_CLOUD_DEPLOY.md` (ECS + Nginx + Compose stack already scaffolded). Fixed demo URL wired in DNS ≥24 h before presentation.
3. **Expand curated evidence catalog** in `server/medicine_evidence.py` (e.g. topical hydrocortisone with strict eligibility rules, oral rehydration variants). Add matching pytest rows in `server/tests/test_adaptive_triage.py`.
4. **Live facility provider layer** — Google Places or Amap above the curated dataset in `server/facilities.py` (schema is already provider-agnostic).
5. **Qwen3.5-Omni Urdu audio** — backend route accepting recorded webm → transcript + optional spoken reply. Fall back to browser STT/TTS on failure.
6. **PWA install-prompt UI + Capacitor APK** — capture `beforeinstallprompt`; sign a debug APK for internal testing (Capacitor scaffold + npm scripts already landed).
7. **Cross-provenance dashboard chips** on each Vault fact (patient-entered vs. lab vs. prescription vs. prior triage) — schema already carries `source`; the UI can render provenance.
8. **Consent + audit persistence** (winning plan §17).

---

## What's new — 2026-08-21 (lay-language triage + complete voice capture)

- Mock triage now routes follow-up questions by the complaint already given
  instead of using one fixed sequence. Skin marks/redness, fever, respiratory,
  stomach, and pain complaints each have relevant one-question-at-a-time paths.
- Roman Urdu such as `mere right arm pe surkh nishan hai` is recognized as a
  skin complaint, retains the body location, and asks about the mark rather
  than unrelated breathing symptoms.
- Real-model instructions now prohibit generic or repeated questions and make
  breathing questions conditional on a relevant complaint.
- Browser speech recognition continues through short pauses, safely restarts
  if the browser ends a continuous session, and finalizes after three seconds
  of silence or an explicit **Done** tap.
- A plain `ہاں / Yes` answer to a breathing-difficulty question now triggers
  the deterministic emergency short-circuit without relying on the LLM.
- The web Vault now accepts patient-scoped X-rays, MRI/scan files, skin photos,
  lab reports, confirmed prescription papers, and other medical documents.
  Every file view is authenticated and checked against account ownership.
- Home now opens with a private summary for the active patient: demographics,
  stored-document counts, confirmed medicines, conditions, and allergies.
- Prescription extraction remains temporary until the user confirms it; only
  then are the reviewed medicines and original paper attached to the Vault.
- Desktop browsers now receive a two-column patient workspace with the Vault
  context beside the transcript-driven triage conversation; mobile retains the
  compact voice-first flow.
- Real Qwen turns receive a bounded snapshot of the selected patient's history,
  allergies, clinician-confirmed medicines, recent labs/documents, and prior
  urgency results. Final cards include practical next steps and a copyable,
  diagnosis-free doctor handoff.
- Mock mode includes an authenticated, idempotent Hassan demo-record seeder.
- WHO reference cards annotate clinician-confirmed medicines only. They link to
  the [2025 WHO Model List of Essential Medicines](https://www.who.int/publications/i/item/B09474)
  and never select a new medicine or alter a prescription.
- Backend suite: **26/26 green**; safety evaluation: **16/16 green**.

---

## What's new — 2026-08-20 (winning-plan pivot)

This drop lands the [winning-plan](docs/QODER_HANDOFF.md) pivot around location, mobile, and safety polish. Everything below is shipped in `main` and covered by `pytest` (20/20 green) and a manual end-to-end mock demo.

### ✅ Shipped in this pass

**Location-first onboarding & care navigation**

- New first-run gate: registered users land on **screen 00 — "آپ کہاں ہیں؟ / Where are you now?"** and cannot proceed until a location is confirmed. Manual city-picker fallback if the browser denies geolocation.
- `useGeolocation` hook (explicit-tap only, no auto-tracking).
- Backend: `POST /api/location/resolve` (Nominatim + offline Pakistan-city fallback so it always answers on flaky Wi-Fi), `POST /api/location/confirm`, `GET /api/location/me`. New `LocationPreference` table with a 10-minute freshness window.
- Persistent **location chip in the header** on every screen; taps back to the setup page for a quick change.
- **`GET /api/facilities/nearby?urgency=…`** — severity-aware ranking (emergency-capable bonus + distance + verified-contact bonus), curated dataset of 20 Pakistan facilities with real coordinates spanning Karachi, Lahore, Islamabad/Rawalpindi, Peshawar / KP, and Quetta. Emergency results surface an emergency-hospital hero card with Directions before the ranked list.
- New `NearbyCare` component renders under every triage result, filtered by the returned `facility_intent`.

**Triage & AI polish**

- Triage result now carries **`facility_intent`** (`emergency_hospital` | `clinic_or_bhu` | `optional`) so the UI can filter facilities without re-inferring urgency.
- Analysis panel relabelled to **"Assessment completeness · Question n of ~5"** (winning plan §4.5 — never diagnostic probability). Backend exposes both `confidence` and `completeness` fields carrying the same value.
- Winning UX detail: **"Talking about Rayan, age 6"** active-profile bar above the mic on Home, so the wrong family member is never silently the subject of the next conversation.
- Env-driven **model routing** with legacy fallbacks: `NABZ_TEXT_MODEL` (→ `qwen3.7-plus`), `NABZ_VL_MODEL` (→ `qwen3.7-plus`), `NABZ_VL_OCR_FALLBACK` (→ `qwen-vl-ocr`), while continuing to honour `QWEN_MODEL` / `QWEN_VL_MODEL`.
- **Prompt-injection defense** added to the lab-report and prescription VL system prompts (winning plan §15.3).
- Extended `GET /api/health/detail` returns the currently-configured text/vision model IDs, location provider, and facilities layer for the pre-demo dev gesture.

**Mobile shell (PWA + Capacitor)**

- Installable PWA: `manifest.webmanifest`, SVG icons (`any` + `maskable`), theme-coloured splash, offline app-shell service worker. **The SW never caches `/api/*`** (auth + PHI) — it is API-first and shell-only.
- Capacitor scaffolding: `capacitor.config.json` (`pk.nabz.app`) plus `npm run cap:install / cap:add:android / mobile:android` scripts. A real APK is one `npm run mobile:android` + Android Studio away.

**Cloud deployment foundation**

- Production Docker images for non-root FastAPI and React + Nginx, joined by a
  same-origin `/api` proxy so no AI credential enters the frontend image.
- `compose.prod.yaml` adds health checks and persistent named volumes for the
  SQLite Vault and confirmed prescription uploads.
- [Alibaba Cloud deployment guide](docs/ALIBABA_CLOUD_DEPLOY.md) covers ECS
  sizing, free-trial boundaries, secret setup, backups, HTTPS, and rollback.
- Production frontend dependencies upgraded and audited with zero known npm
  vulnerabilities.

**Docs & handoff**

- New [`docs/QODER_HANDOFF.md`](docs/QODER_HANDOFF.md) — full one-page brief for the Qoder assistant covering repo layout, run steps, mock/real gate, model routing table, location + facilities API contract, mobile build steps, credentials to collect, and a priority-ordered next-day roadmap.
- Updated `.env.example` to document all new envs.

### 🚧 Still to do (post-hackathon / Qoder session)

Priority order matches the roadmap block in `docs/QODER_HANDOFF.md`.

1. **Real-model rehearsal.** Set a real `DASHSCOPE_API_KEY`, flip `NABZ_TEXT_MODEL=qwen3.7-plus`, measure end-to-end latency. Revisit `qwen-plus` if any text turn exceeds ~6 s.
2. **Cloud launch (infrastructure ready).** Claim/provision the ECS trial,
   configure `.env.production` directly on the host, and connect a domain +
   HTTPS using the validated `compose.prod.yaml` stack. Fixed demo URL wired in
   DNS ≥24 h before the presentation.
3. **Live facility provider layer.** Wire a `MAPS_PROVIDER` env (Google Places / Amap / Baidu) above the curated dataset in `facilities.py` — schema is already provider-agnostic.
4. **Native Urdu audio via Qwen3.5-Omni.** Backend route that accepts recorded webm/wav → transcript + optional spoken reply. Fall back to browser STT/TTS on failure.
5. **PWA install-prompt UI.** Capture `beforeinstallprompt` and show a soft "Install Nabz" CTA on Android.
6. **Capacitor APK.** Run through `npm run cap:add:android` → build signed APK → upload to Play Console internal testing.
7. **Cross-profile leakage tests.** Add pytest cases that start a triage for profile A under the same account as B and assert profile B's context never leaks into any prompt.
8. **Consent + audit persistence.** Explicit `Consent` rows plus a light `AuditEvent` trail for delete / upload / summary events (winning plan §17).
9. **Expanded safety eval.** Grow `eval.py` from the current curated set toward the plan's targets (40+ EMERGENCY, 30+ DOCTOR_24H, 25+ HOME_CARE, 20+ ambiguous, 10+ non-health / misuse) in Urdu script, Roman Urdu, and English.
10. **P2 polish.** Confirmed-Rx medication reminders, QR-code doctor handoff, caregiver location share.

---

## Why Nabz

Many health applications assume that the user can comfortably read English, type a detailed history, understand medical terminology, and decide which symptoms matter. That assumption excludes many people in rural and underserved communities.

Nabz is designed around a different interaction model:

- **Urdu first** — Urdu leads every patient-facing screen; English is available as a smaller translation.
- **Voice first** — users can speak naturally instead of typing a medical history.
- **One question at a time** — the system asks only the single most useful next question.
- **Low-literacy friendly** — large touch targets, icons, color-coded urgency, quick replies, replay, and spoken prompts.
- **Family centered** — one account can maintain separate health profiles for multiple family members.
- **Clinician connected** — the final goal is to help the user reach appropriate care and give the clinician a concise handoff summary.
- **Safety first** — emergency red flags short-circuit the conversation instead of waiting for the AI to finish a full interview.

The core question Nabz answers is:

> **“How urgently should this person seek care, what information matters right now, and how can we make the next interaction with a real clinician more effective?”**

---

## Core user journey

The current product flow is designed as a cohesive mobile experience:

1. **Home / Listen** — tap the microphone and describe the problem in Urdu.
2. **Listening state** — live transcript confirms what Nabz heard.
3. **Conversational triage** — Nabz asks one high-value follow-up question at a time.
4. **Live analysis** — collected findings appear as chips while confidence and the remaining uncertainty are shown transparently.
5. **Triage result** — Emergency, See a doctor within 24 hours, or Home care.
6. **Nearby care** — appropriate clinics or hospitals are shown with directions.
7. **Medical Vault** — maintain separate records for family members.
8. **Profile detail** — conditions, allergies, medicines, recent triage, labs, and timeline.
9. **Lab report explanation** — upload a report for structured extraction and a plain-Urdu explanation.
10. **Doctor handoff summary** — generate a concise English clinical summary for print/share.
11. **Privacy & consent** — health information is account-scoped, deletable, and not used for model training.
12. **Register / Log in** — account-based access with family profiles.
13. **Prescription scan** — photograph a printed or handwritten prescription.
14. **Confirm extracted medicines** — review and edit every extracted field before saving it to the selected profile.

---

## What makes the triage different

### Multi-turn, not one-shot

Nabz does **not** immediately jump from a symptom sentence to a final result unless an emergency red flag is already present.

For a non-emergency presentation, the backend creates a triage session and progressively gathers context:

```text
User symptom
   ↓
Emergency red-flag guardrail
   ↓
Ask ONE most useful question
   ↓
User answers by voice / quick reply / text
   ↓
Update collected findings + confidence
   ↓
Ask another question only if needed
   ↓
Final urgency result
```

The system asks a maximum of **5 follow-up questions**. If important uncertainty remains after that point, it produces a result and safely escalates to at least **DOCTOR_24H** when appropriate rather than continuing indefinitely.

### Emergency short-circuit

If an emergency red flag appears in the initial complaint or any later turn, Nabz stops questioning and returns **EMERGENCY immediately**.

Examples of automatic emergency red flags include:

- chest pain;
- difficulty breathing;
- unconsciousness;
- severe bleeding;
- seizures;
- stroke signs such as facial droop, slurred speech, or one-sided weakness;
- severe dehydration in a child;
- high fever in an infant under 3 months;
- pregnancy complications such as bleeding, severe pain, or reduced fetal movement;
- poisoning;
- serious injury;
- suicidal thoughts.

The red-flag layer is intentionally conservative: an emergency should never be delayed simply because the conversational AI wants more information.

---

## Live analysis

Every conversational turn returns a small, structured analysis object so the UI can show the user what Nabz has understood so far.

Example:

```json
{
  "analysis": {
    "collected": [
      {
        "label_urdu": "بخار",
        "label_english": "Fever",
        "value_urdu": "3 دن",
        "value_english": "3 days"
      },
      {
        "label_urdu": "عمر",
        "label_english": "Age",
        "value_urdu": "6 سال",
        "value_english": "6 years"
      }
    ],
    "still_checking_urdu": "سانس اور پانی کی کمی کی علامات",
    "confidence": 0.72,
    "questions_asked": 3
  }
}
```

The frontend renders this as:

- collected-finding chips;
- **Still checking… / ابھی دیکھ رہے ہیں…**;
- a calm confidence/progress indicator;
- an early-analysis state and a near-complete state.

This is not presented as diagnostic certainty. It is a transparent representation of how complete the triage information is.

---

## Personalized family Medical Vault

A single account can own multiple patient profiles — for example Ammi, Bilal, Sana, and Rayan — while keeping each person's information isolated.

Each profile can contain:

- display name and relation label;
- age and gender;
- blood group;
- chronic conditions;
- allergies;
- current medicines;
- medicine dose, schedule, and with-food instructions;
- profile notes;
- past triage sessions;
- uploaded lab reports;
- scanned prescriptions;
- X-rays, MRI/scan files, skin photos, and other medical documents;
- longitudinal health timeline.

The **active profile** is injected into every relevant AI interaction. Nabz therefore addresses the selected person by name and can use that profile's known conditions, allergies, medicines, and recent labs as context.

Patient data is never pulled from a global medicine or history pool. Every saved item belongs to the selected profile.

---

## Lab-report explanation

Users can upload an image or PDF lab report for the selected profile.

Nabz uses **Qwen-VL** to:

1. extract structured test names and values;
2. identify values outside the provided reference range;
3. provide a plain-Urdu explanation addressed to the selected profile;
4. include an English explanation;
5. save the report to the profile timeline.

The lab workflow does **not** diagnose a disease. It ends with a clear instruction to discuss abnormal or concerning results with a qualified clinician.

---

## Prescription scan + confirmation

Nabz can read a printed or handwritten clinician-issued prescription using **Qwen-VL**.

The extraction is structured approximately as:

```json
{
  "date": "2026-08-19",
  "doctor_name": "Dr. A. Khan",
  "clinic": "Family Clinic",
  "medicines": [
    {
      "name": "Amoxicillin",
      "strength": "250 mg",
      "frequency": "3 times/day",
      "duration": "5 days",
      "notes": "1 tsp",
      "confidence": 0.94
    }
  ],
  "unreadable": false,
  "raw_text": "..."
}
```

### Safety rule: extraction is never an automatic save

Handwritten prescriptions can be ambiguous. Nabz therefore:

- assigns confidence to extracted medicine fields;
- visibly flags low-confidence values;
- marks a document `unreadable` when necessary;
- **never invents a medicine, strength, dose, frequency, or duration**;
- always shows a **Confirm extracted medicines** screen;
- allows editing before saving;
- saves confirmed medicines only to the selected patient's Vault;
- retains a reference to the original prescription image.

Prescription extraction is document reading, **not prescribing**.

---

## Doctor handoff summary

Nabz can generate a concise English clinical handoff for the selected profile.

The summary can include:

- patient demographics;
- latest chief complaint;
- relevant history;
- chronic conditions;
- current medications;
- allergies;
- latest triage status;
- recent lab findings.

The UI provides **Print** and **Share** actions with print-friendly styling.

The purpose is to make a clinician's limited time more effective — not to replace clinical assessment or documentation.

---

## Design system

The UI follows the mobile designs shown in the project mockups.

- **Primary:** teal `#0F9D8A`
- **Background:** warm off-white
- **Cards:** white, rounded (~16 px), soft shadow
- **Status colors:** reserved only for triage state
  - red = emergency
  - amber = see doctor within 24 hours
  - green = home care
- **Typography:** Urdu leads; English translation is smaller and secondary
- **Urdu font:** Noto Nastaliq Urdu
- **Direction:** full RTL support where appropriate
- **Mobile width:** designed around a ~480 px content container
- **Navigation:** Home · Vault · Clinics
- **Accessibility:** large touch targets, microphone-first interaction, quick replies, replay, typed fallback
- **Persistent clinical disclaimer:**
  - `یہ ڈاکٹر کا متبادل نہیں ہے`
  - `This is not a substitute for a doctor.`

---

## Architecture

```text
┌────────────────────────────────────────────────────────────────────────────┐
│                              User / Family                                 │
│                     Urdu voice · quick reply · text                        │
└───────────────────────────────┬────────────────────────────────────────────┘
                                │
                                ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                         React 18 + Vite SPA                                │
│                                                                            │
│  • Urdu / RTL UI                  • Conversational triage                   │
│  • useSpeechRecognition           • Live analysis                          │
│  • useTextToSpeech                • Family Medical Vault                    │
│  • Lab / prescription upload      • Doctor handoff                          │
└───────────────────────────────┬────────────────────────────────────────────┘
                                │ HTTPS / JSON + JWT
                                ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                         FastAPI backend                                    │
│                                                                            │
│  Auth & JWT        Triage state machine       Profile/Vault APIs            │
│  Safety guards     Qwen structured parsing    Upload handling               │
│  Clinic lookup     Summary generation         Mock-mode fallbacks           │
└───────────────┬─────────────────────────┬───────────────────────┬───────────┘
                │                         │                       │
                ▼                         ▼                       ▼
┌───────────────────────┐   ┌─────────────────────────┐   ┌──────────────────┐
│ Qwen text model       │   │ Qwen-VL vision model    │   │ SQLite / SQLA    │
│ qwen-plus default     │   │ qwen-vl-plus default    │   │ family Vault     │
│                       │   │                         │   │ sessions/timeline│
│ Conversational triage │   │ Labs + prescriptions    │   │ users/profiles   │
└───────────────────────┘   └─────────────────────────┘   └──────────────────┘
                \___________________________  _______________________________/
                                            \/
                              Alibaba Cloud Model Studio
                                   DashScope API

🔐 DASHSCOPE_API_KEY and JWT_SECRET stay on the backend only.
```

---

## Technology stack

### Frontend

- React 18
- Vite
- Urdu / RTL layout support
- Browser Web Speech API for STT (`lang="ur-PK"`)
- Browser `SpeechSynthesis` for TTS where available
  - prefer an Urdu voice;
  - fall back to `hi-IN` when needed;
  - replay control on assistant turns

Speech is isolated behind hooks so a stronger cloud ASR/TTS implementation can replace browser services later without redesigning the UI.

### Backend

- Python 3.11+
- FastAPI
- uvicorn
- Pydantic v2
- SQLAlchemy
- SQLite for the hackathon build, with a data layer that can migrate to a managed database
- `python-dotenv`
- JWT authentication
- password hashing using passlib / bcrypt

### AI

- Alibaba Cloud Model Studio / DashScope
- OpenAI-compatible API
- text model: `qwen-plus` by default
- vision model: `qwen-vl-plus` by default
- strict JSON outputs
- Pydantic validation
- safe parsing and fallback behavior
- 20-second AI timeout target

OpenAI-compatible base URL:

```text
https://dashscope-intl.aliyuncs.com/compatible-mode/v1
```

---

## API overview

### Authentication

| Method | Endpoint             | Purpose                                        |
| ------ | -------------------- | ---------------------------------------------- |
| `POST` | `/api/auth/register` | Create account with full name, phone, password |
| `POST` | `/api/auth/login`    | Authenticate and issue JWT                     |
| `GET`  | `/api/auth/me`       | Return authenticated account                   |

### Conversational triage

| Method | Endpoint             | Purpose                                                     |
| ------ | -------------------- | ----------------------------------------------------------- |
| `POST` | `/api/triage/start`  | Start a profile-specific triage session                     |
| `POST` | `/api/triage/answer` | Submit one answer and receive next question or final result |

Start request:

```json
{
  "profile_id": 4,
  "text": "میرے بچے کو تین دن سے بخار ہے"
}
```

Question-turn response:

```json
{
  "type": "question",
  "session_id": "session-id",
  "patient_name": "Rayan",
  "question_urdu": "ریان، کیا آپ کو سانس لینے میں دشواری ہو رہی ہے؟",
  "question_english": "Rayan, are you having trouble breathing?",
  "quick_replies": [
    { "urdu": "ہاں", "english": "Yes" },
    { "urdu": "نہیں", "english": "No" },
    { "urdu": "پتہ نہیں", "english": "Don't know" }
  ],
  "analysis": {
    "collected": [],
    "still_checking_urdu": "سانس کی علامات",
    "confidence": 0.3,
    "questions_asked": 1
  },
  "mock": true
}
```

Final result response:

```json
{
  "type": "result",
  "session_id": "session-id",
  "patient_name": "Rayan",
  "analysis": {
    "collected": [],
    "still_checking_urdu": "",
    "confidence": 0.89,
    "questions_asked": 3
  },
  "level": "DOCTOR_24H",
  "advice_urdu": "ریان کو ڈاکٹر سے 24 گھنٹے کے اندر دکھائیں۔",
  "advice_english": "Rayan should be seen by a doctor within 24 hours.",
  "reason_english": "Persistent fever and reduced appetite require clinical review.",
  "mock": true
}
```

### Medical Vault

| Method   | Endpoint             | Purpose                            |
| -------- | -------------------- | ---------------------------------- |
| `GET`    | `/api/profiles`      | List account profiles              |
| `POST`   | `/api/profiles`      | Create a family profile            |
| `GET`    | `/api/profiles/{id}` | Get profile detail                 |
| `PUT`    | `/api/profiles/{id}` | Update profile                     |
| `DELETE` | `/api/profiles/{id}` | Delete profile and associated data |
| `GET`    | `/api/dashboard/{id}` | Active patient's private Home summary |
| `GET`    | `/api/documents?profile_id={id}` | List that patient's documents |
| `POST`   | `/api/documents` | Store a lab, image/scan, or other document |
| `GET`    | `/api/documents/{entry_id}/file` | Authenticated original-file view |
| `DELETE` | `/api/documents/{entry_id}` | Delete a directly uploaded document |
| `POST`   | `/api/demo/seed/{profile_id}` | Seed synthetic Vault history in mock mode |
| `GET`    | `/api/medicine-evidence/{profile_id}` | WHO references for confirmed medicines |

### Document intelligence

| Method | Endpoint                    | Purpose                                          |
| ------ | --------------------------- | ------------------------------------------------ |
| `POST` | `/api/labreport`            | Extract + explain lab report for a profile       |
| `POST` | `/api/prescription`         | Extract a prescription for user confirmation     |
| `POST` | `/api/prescription/confirm` | Save the user-reviewed medicines to the profile  |
| `POST` | `/api/documents/prescription-source` | Attach paper after prescription confirmation |

### Clinician handoff

| Method | Endpoint                    | Purpose                                 |
| ------ | --------------------------- | --------------------------------------- |
| `GET`  | `/api/summary/{profile_id}` | Generate concise doctor handoff summary |

### Miscellaneous

| Method | Endpoint       | Purpose                                     |
| ------ | -------------- | ------------------------------------------- |
| `GET`  | `/api/clinics` | Return sample KP BHUs / clinics / hospitals |
| `GET`  | `/api/health`  | Backend status and mock-mode state          |

Protected Vault, triage, report, and summary routes require the JWT session token.

---

## Repository layout

The project is organized as a React frontend and FastAPI backend:

```text
client/
  src/
    components/          UI components
    hooks/               speech recognition / speech synthesis
    pages/               onboarding, auth, triage, vault, reports, summary
    api/                 backend client
    App.jsx

server/
  main.py                FastAPI application and route registration
  auth/                  register/login/JWT/password hashing
  triage/                state machine, guardrails, prompts, parsing
  profiles/              family Vault data access
  reports/               lab + prescription Qwen-VL workflows
  summary/               doctor handoff generation
  clinics/               clinic lookup data/service
  db/                    SQLAlchemy models/session
  uploads/               local development upload storage
  tests/                 pytest suite
  requirements.txt

eval.py                  scripted safety evaluation harness
TESTING.md                test cases + manual smoke tests
PRIVACY.md                privacy / consent behavior
.env.example              environment template
.gitignore
README.md
```

> Exact internal module filenames may evolve; the public API boundaries and product behavior above are the stable contract.

---

## Setup

### Prerequisites

- Python **3.11 or 3.12** (recommended). The pinned dependency versions ship
  prebuilt wheels for these; on very new interpreters (e.g. 3.14) some pinned
  packages have no wheel yet and would need a compiler.
- Node.js **18+**
- npm
- Optional: Alibaba Cloud Model Studio / DashScope API key

The complete product remains demoable in **MOCK_MODE** without external credentials.

### 1. Backend

```bash
cd server
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

Windows:

```powershell
cd server
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Environment variables

Create the backend environment file from the example:

```bash
cp .env.example server/.env
```

Configure:

```env
DASHSCOPE_API_KEY=
QWEN_MODEL=qwen-plus
QWEN_VL_MODEL=qwen-vl-plus
JWT_SECRET=replace-with-a-long-random-secret
MOCK_MODE=true
CORS_ORIGINS=http://localhost:5173
```

Environment variables:

| Variable            | Purpose                                                     |
| ------------------- | ----------------------------------------------------------- |
| `DASHSCOPE_API_KEY` | Alibaba Cloud Model Studio API key                          |
| `QWEN_MODEL`        | Text model, default `qwen-plus`                             |
| `QWEN_VL_MODEL`     | Vision model for labs/prescriptions, default `qwen-vl-plus` |
| `JWT_SECRET`        | Secret used to sign authentication tokens                   |
| `MOCK_MODE`         | Force local deterministic demo responses                    |
| `CORS_ORIGINS`      | Allowed frontend origins                                    |

### 3. Get a DashScope key

1. Open Alibaba Cloud Model Studio:
   <https://modelstudio.console.alibabacloud.com/>
2. Sign in or create an Alibaba Cloud account.
3. Activate Model Studio.
4. Open **API-KEY** management.
5. Create a key.
6. Put the value in `server/.env` as `DASHSCOPE_API_KEY`.
7. Set `MOCK_MODE=false` when you are ready to use real Qwen calls.

Never place the DashScope key in Vite environment variables or frontend code.

### 4. Frontend

```bash
cd client
npm install
```

---

## Running locally

Open two terminals.

### Terminal 1 — FastAPI

```bash
cd server
source venv/bin/activate
uvicorn main:app --reload --port 8000
```

### Terminal 2 — React

```bash
cd client
npm run dev
```

Open:

```text
http://localhost:5173
```

Backend health check:

```bash
curl -s http://localhost:8000/api/health
```

Example mock response:

```json
{
  "status": "ok",
  "mock_mode": true
}
```

---

## Mock mode vs real mode

### Mock mode

Set:

```env
MOCK_MODE=true
```

or leave `DASHSCOPE_API_KEY` empty.

Mock mode is intended for reliable development and hackathon demos. It returns deterministic sample behavior for:

- conversational triage;
- emergency red-flag paths;
- follow-up questions;
- live-analysis findings;
- lab-report extraction;
- prescription extraction;
- low-confidence prescription fields.

AI responses include:

```json
{ "mock": true }
```

### Real mode

Set:

```env
DASHSCOPE_API_KEY=your-real-key
MOCK_MODE=false
```

Real mode sends text tasks to Qwen and visual document tasks to Qwen-VL through Alibaba Cloud Model Studio.

The backend must still apply safety controls outside the model:

- emergency keyword / red-flag guardrails;
- strict JSON parsing;
- Pydantic validation;
- allowed triage enums only;
- maximum five questions;
- timeout handling;
- safe `DOCTOR_24H` fallback when the model fails or output cannot be trusted;
- server-side logging of invalid raw model output.

---

## Authentication and privacy

### Authentication

- registration requires full name, phone number, and password;
- passwords are stored only as secure hashes;
- login issues a JWT session token;
- protected requests include the token;
- account data is isolated between users.

### Privacy model

Nabz is designed around the following commitments:

- health data belongs to the account;
- profile data is patient-specific;
- consent is requested before health data or uploads are saved;
- users can delete their information;
- deleting a profile should delete its associated health history;
- uploaded health data is not used to train AI models;
- API keys never reach the browser.

See [`PRIVACY.md`](PRIVACY.md) for the full privacy and consent statement.

> For a hackathon/demo deployment, do not represent local SQLite/upload storage as production-grade medical-record infrastructure. A real deployment requires formal security, privacy, retention, access-control, audit, clinical-safety, and regulatory review.

---

## Tests

### Pytest

Run backend tests (mock mode is applied automatically by `conftest.py`, which
also uses a throwaway SQLite file so your real `nabz.db` is untouched):

```bash
cd server
python -m pytest tests/ -q          # or ./venv/Scripts/python.exe -m pytest tests/ -q on Windows
```

Expected: **16 passed**. The suite covers:

- registration and login;
- protected-route rejection without a token;
- profile CRUD;
- triage start returning a question;
- triage answer eventually returning a result;
- emergency red flag returning `EMERGENCY` immediately with no extra questions;
- maximum-question behavior;
- lab report structured output;
- prescription structured output;
- doctor summary generation;
- clinic list response.

### Safety evaluation harness

From the repository root (drives the state machine directly — **no server
needed**):

```bash
python eval.py                      # or ./server/venv/Scripts/python.exe eval.py
```

`eval.py` uses **16 scripted conversations** spanning:

- `EMERGENCY`;
- `DOCTOR_24H`;
- `HOME_CARE`;
- emergency short-circuit cases;
- ambiguous cases;
- non-health input.

The key safety assertion is:

> **No scripted emergency should be under-triaged or forced through unnecessary follow-up questions.**

See [`TESTING.md`](TESTING.md) for the expected conversations and manual smoke tests.

---

## 60-second judge demo

### 0:00–0:08 — Open Nabz

Show the **Home / Listen** screen.

> “Nabz is an Urdu-first AI health companion for families who may not be comfortable typing or reading medical English.”

Select a profile — for example **Rayan, age 6**.

### 0:08–0:20 — Speak a symptom

Tap the microphone and say a rehearsed Urdu symptom statement such as:

```text
میرے بچے کو تین دن سے بخار ہے اور وہ کم کھا رہا ہے
```

Show the live transcript.

### 0:20–0:34 — Conversational triage + live analysis

Nabz asks **one** question:

```text
ریان، کیا آپ کو سانس لینے میں دشواری ہو رہی ہے؟
```

Use a quick reply such as **No / نہیں**.

Point to the live analysis panel as it fills:

- Fever — 3 days
- Age — 6
- Breathing — OK
- Still checking… hydration / severity
- confidence increasing as the interview becomes complete

### 0:34–0:44 — Final result

Show the color-coded urgency result, Replay, **Why? / کیوں؟**, and the nearby-clinic handoff.

Emphasize:

> “If an emergency sign appears at any point, Nabz stops questioning immediately.”

### 0:44–0:55 — Prescription intelligence

Open **Scan prescription** and use a clean demo prescription.

Show Qwen-VL extracting the medicine fields, then stop on **Confirm extracted medicines**.

Point out the low-confidence field:

> “Nabz never silently trusts handwriting. Nothing is saved until the user confirms it.”

### 0:55–1:00 — Close

Open the selected family profile / doctor handoff view.

> “Nabz connects Urdu voice triage, family health context, Alibaba Cloud Qwen intelligence, and a safer handoff to real healthcare — in one low-literacy-friendly workflow.”

---

## Demo reliability checklist

For the stage demo:

- use a rehearsed triage conversation;
- keep a text fallback available if the venue microphone is noisy;
- use `MOCK_MODE=true` as a zero-credential fallback;
- use a **clean printed sample prescription** for the live Qwen-VL flow;
- keep the prescription confirmation screen in the demo even if extraction confidence is high;
- verify the emergency short-circuit path before presenting;
- preselect the intended family profile;
- keep the browser microphone permission already granted.

---

## Safety principles

Nabz is deliberately designed as a **triage and health-information assistant**, not an autonomous clinician.

### Nabz may

- collect a symptom history;
- ask high-value follow-up questions;
- identify urgency bands;
- identify emergency red flags;
- provide simple non-diagnostic care-navigation guidance;
- explain a lab report in plain language;
- extract information from an existing prescription;
- organize confirmed health information in a family Vault;
- generate a clinician handoff summary.

### Nabz must not

- claim a definitive diagnosis;
- delay an emergency to complete an interview;
- independently prescribe medicine;
- invent prescription text that cannot be read;
- silently save uncertain prescription extraction;
- mix data between family profiles;
- expose API keys to the browser;
- present AI confidence as medical certainty;
- represent itself as a substitute for a qualified clinician.

---

## Roadmap

### Language and access

- Pashto voice + prompts
- Sindhi voice + prompts
- Punjabi voice + prompts
- stronger cloud speech recognition for low-end devices
- Urdu cloud TTS

### Distribution

- WhatsApp voice-note bot
- offline / low-connectivity triage
- SMS-assisted follow-up

### Clinical access

- Alkhidmat clinic integration
- Basic Health Unit directory integration
- real-time nearest-open-facility lookup
- appointment / referral handoff

### Platform

- managed production database
- encrypted object storage
- formal audit trail
- stronger role-based access controls
- consent/version tracking
- clinical safety monitoring and model evaluation dashboard

---

## Product positioning

Nabz is not trying to become “an AI doctor.”

The product is designed to become the **first safe digital step between a family's concern and appropriate real-world care**:

```text
Speak in Urdu
   → understand the concern
   → ask only what matters
   → catch danger early
   → personalize using the right family profile
   → explain health documents clearly
   → organize confirmed information
   → hand off to a real clinician
```

That combination — **voice + Urdu + conversational triage + visible analysis + family context + Qwen-VL document intelligence + clinician handoff** — is the core Nabz experience.

---

## Medical disclaimer

**یہ ڈاکٹر کا متبادل نہیں ہے۔**

Nabz is **not a substitute for a doctor or emergency service**. It does not provide a definitive diagnosis and does not independently prescribe medication. Triage output is informational and is intended to help users recognize urgency and seek appropriate professional care.

Prescription scanning only attempts to extract information from a prescription already issued by a clinician. Users must confirm extracted medicine names, strengths, frequencies, durations, and other instructions against the original prescription or with a pharmacist/doctor before relying on them.

Lab-report explanations are educational summaries and are not a diagnosis or treatment plan.

If there is severe difficulty breathing, chest pain, unconsciousness, major bleeding, seizures, stroke symptoms, poisoning, a serious injury, severe pregnancy-related symptoms, suicidal thoughts, or another emergency concern, seek emergency medical help immediately.

---

## Project

**Nabz — نبض**  
_آپ کی آواز، آپ کی صحت · Your voice, your health_  
Built for the **Alibaba Cloud AI Hackathon Pakistan 2026**.
