
# Sehat Saathi — صحت ساتھی

> **آواز سے صحت کا مشورہ** · *Health advice by voice*

An AI health-**triage** assistant for rural Pakistan, built for the **Alibaba
Cloud AI Hackathon 2026**. A user speaks their symptoms in Urdu; the app replies
in **real spoken Urdu** (server-side TTS) and written Urdu with a clear urgency
level, practical home-care and general medicine guidance, follow-up questions,
and nearby clinics for the user's own city.

**Sehat Saathi does not diagnose a specific disease and never recommends
prescription-only medicine.** It classifies urgency into one of three levels,
gives *general* self-care information, and always directs people to a real
doctor:

| Level | Urdu | Meaning |
|-------|------|---------|
| 🚑 **EMERGENCY** | فوری علاج | Go to a hospital now |
| 🩺 **DOCTOR_24H** | 24 گھنٹے میں ڈاکٹر | See a doctor within 24 hours |
| 🏠 **HOME_CARE** | گھر پر دیکھ بھال | Rest and monitor at home |

Each result also includes **گھریلو علاج** (home remedies), **دوا کی عمومی
رہنمائی** (general OTC medicine guidance, e.g. paracetamol for fever, ORS for
dehydration — with "confirm the dose with a pharmacist/doctor" caveats and no
prescription drugs), **خطرے کی علامات** (warning signs), and **follow-up
questions** so the assistant can understand the user better and refine its
advice.

---

## The problem

Rural Pakistan has one of the world's most stretched primary-care systems.
Basic Health Units are sparse, literacy is low, and the first instinct when
someone falls ill is often to wait — sometimes fatally — or to travel hours to
a hospital for something that could have been managed at home. People who *do*
need emergency care don't always recognise the red flags.

Two barriers make most health apps useless here: **language** (interfaces are in
English) and **literacy** (they assume reading and typing). Sehat Saathi is
**voice-first** and **Urdu-first**: you speak, it speaks back, and color + icons
carry the meaning so it works even if you can't read.

It is a **triage** tool, not a doctor. It answers one question well: *"How
urgently do I need to see a real clinician, and where is one?"*

---

## Architecture

```
  ┌──────────────┐   speech    ┌──────────────────────┐   HTTPS   ┌────────────────────────┐
  │  User speaks │ ─────────►  │   React + Vite (SPA)  │ ────────► │   FastAPI backend       │
  │  Urdu (mic)  │  Web Speech │   - useSpeechReco.    │  /api/... │   - /api/triage         │
  │              │ ◄─────────  │   - useTextToSpeech   │ ◄──────── │   - /api/clinics        │
  └──────────────┘  spoken     │   - triage UI/cards   │   JSON    │   - /api/health         │
                    reply      └──────────────────────┘           │        │                │
                                                                   │        ▼                │
                                                                   │   Qwen (qwen-plus)      │
                                                                   │   via Alibaba Cloud     │
                                                                   │   Model Studio          │
                                                                   │   (DashScope, OpenAI-   │
                                                                   │    compatible endpoint) │
                                                                   └────────────────────────┘

  🔑 The DashScope API key lives ONLY on the backend. It never reaches the browser.
```

- **Speech-to-text**: browser Web Speech API (`lang="ur-PK"`), isolated in
  `useSpeechRecognition` so a cloud ASR can be swapped in later.
- **Text-to-speech (real Urdu voice)**: the backend `/api/tts` endpoint uses
  **gTTS** to synthesize genuine spoken Urdu, played by the browser. This is the
  primary voice; the browser `SpeechSynthesis` is only a fallback. (Browser TTS
  on most machines has no Urdu voice and mispronounces the script — often reading
  only the digits — so we do NOT rely on it.) Isolated in `useTextToSpeech`.
- **Location**: a province → city picker (all provinces/territories of Pakistan)
  drives clinic results for the user's own city instead of a fixed district.
- **AI**: Qwen (`qwen-plus` default, `qwen-max` configurable) through the
  OpenAI-compatible DashScope endpoint. A strict system prompt enforces
  triage + general (non-prescription) guidance + always-escalate-when-uncertain.
- **UI**: mobile-first, with a widened two-column **desktop web layout**
  (result + guidance in the main column, clinics in a sticky sidebar).

---

## Repo structure

```
client/                 React app (Vite)
  src/
    hooks/              useSpeechRecognition, useTextToSpeech
    components/         MicButton, ResultCard, ClinicList, LocationPicker
    pakistan.js         provinces → cities dataset
    App.jsx, api.js, levels.js, styles.css
server/
  main.py               FastAPI app + routes (triage, clinics, health, tts) + CORS
  triage.py             Qwen client, system prompt, JSON parsing, mock + fallback
  clinics.py            city-aware clinic lookup
  models.py             pydantic v2 models
  tests/test_triage.py  pytest (mock mode)
  requirements.txt
eval.py                 safety eval harness (12 cases)
TESTING.md
.env.example
Makefile
```

---

## Setup

### 1. Backend (Python 3.11+)

```bash
cd server
python3 -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Environment / secrets

```bash
cp .env.example server/.env       # then edit server/.env
```

`server/.env` values:

- `DASHSCOPE_API_KEY` — your Alibaba Cloud Model Studio key. **Leave blank to run
  in mock mode automatically.**
- `QWEN_MODEL` — `qwen-plus` (default) or `qwen-max`.
- `MOCK_MODE` — `true` forces keyword mock responses (no API calls).
- `CORS_ORIGINS` — allowed frontend origins (defaults cover the Vite dev server).

> The backend loads `.env` from its own working directory, so put it at
> `server/.env`.

#### How to get a DashScope API key

1. Go to **Alibaba Cloud Model Studio** (International):
   <https://modelstudio.console.alibabacloud.com/>
2. Sign in / create an Alibaba Cloud account and activate Model Studio.
3. Open **API-KEY** management and **Create API Key**.
4. Copy it into `server/.env` as `DASHSCOPE_API_KEY`.
5. The app uses the OpenAI-compatible endpoint
   `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`, so no extra SDK
   config is needed.

### 3. Frontend (Node 18+)

```bash
cd client
npm install
```

---

## Running

Open **two terminals**.

**Terminal 1 — backend:**
```bash
cd server
source venv/bin/activate
uvicorn main:app --reload --port 8000
```

**Terminal 2 — frontend:**
```bash
cd client
npm run dev
```

Then open <http://localhost:5173>.

### Mock mode vs. real mode

- **Mock mode** (default when no key): keyword heuristic maps obvious emergency
  terms → EMERGENCY, fever/cough → DOCTOR_24H, mild → HOME_CARE. Responses carry
  `"mock": true` and the UI shows a small *demo / mock mode* badge. **The entire
  app is fully demoable with zero credentials.**
- **Real mode**: set a valid `DASHSCOPE_API_KEY` and `MOCK_MODE=false`. Triage is
  driven by Qwen; on any API/parse/timeout failure the backend returns a safe
  `DOCTOR_24H` fallback and logs the raw model output server-side.

Check which mode you're in:
```bash
curl -s http://localhost:8000/api/health
# {"status":"ok","mock_mode":true}
```

---

## Tests & the safety eval

**pytest (mock mode):**
```bash
cd server && MOCK_MODE=true python -m pytest tests/ -q
```

**Safety eval** — 12 fixed cases against the live endpoint; exits non-zero if any
true emergency is under-triaged:
```bash
# backend must be running on :8000
python eval.py
```

See [TESTING.md](TESTING.md) for the full case list and manual smoke tests.

---

## 60-second demo script (for judges)

1. **(0:00)** Open <http://localhost:5173>. Point out the big mic, the Urdu
   tagline, and the persistent *"not a substitute for a doctor"* disclaimer.
   Pick your **province → city** so clinics are local.
2. **(0:10)** *"Speech works in the browser, but for demo reliability we'll type —
   this fallback is deliberate for noisy hackathon rooms."* Type:
   **`Mujhe shadid bukhar hai`** → **Get advice**.
3. **(0:22)** A **YELLOW 24 گھنٹے میں ڈاکٹر** card appears, shows *"آپ نے کہا…"*
   (the transcript), and **auto-speaks real Urdu** (server-side gTTS). Point out
   **گھریلو علاج** (home remedies), **دوا کی عمومی رہنمائی** (paracetamol/ORS,
   with the pharmacist caveat), and **خطرے کی علامات** (warning signs).
4. **(0:38)** Show the **follow-up questions** and type an answer
   (e.g. *"3 din se, umar 30, khansi bhi"*) → **Update advice** re-triages with
   the added context. Expand **"Why?"** for judges.
5. **(0:48)** Point to the **Nearby — <your city>** sidebar; tap **Directions**
   for the Google Maps hand-off. Then **نئی بات**, type
   **`seenay mein dard hai aur saans nahi aa rahi`** → **RED EMERGENCY** with a
   pulsing **Call Rescue 1122** button.
6. **(0:58)** Close: *"Urdu-first voice triage with real spoken Urdu, practical
   guidance, and local clinics — on Alibaba Cloud Qwen — and it runs with zero
   credentials in mock mode, so it never fails on stage."*

---

## Roadmap

- **More languages**: Pashto and Sindhi (and Punjabi) voice + prompts.
- **WhatsApp bot**: reach users with no app install, via voice notes.
- **Offline mode**: on-device keyword triage when connectivity drops.
- **Alkhidmat / BHU integration**: live clinic directory with real availability
  and geolocation-based "nearest open unit".
- **Cloud ASR/TTS**: swap the browser speech hooks for Alibaba Cloud speech
  services for better Urdu accuracy on low-end phones.

---

## ⚠️ Medical disclaimer

**یہ ڈاکٹر کا متبادل نہیں ہے۔** Sehat Saathi is **not** a substitute for a
doctor. It does not diagnose a specific disease and never recommends
prescription-only medicine. Any home-remedy or over-the-counter guidance it
gives (e.g. paracetamol, ORS) is **general information only** — always confirm
medicines and doses with a pharmacist or doctor, and never give medicine to
infants, children, or pregnant women without a doctor. In an emergency, contact
local emergency services (Rescue **1122**) or go to the nearest hospital
immediately. Always consult a qualified healthcare professional.
