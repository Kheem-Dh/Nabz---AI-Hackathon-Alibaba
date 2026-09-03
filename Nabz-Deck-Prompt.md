# Prompt to give Claude Design (or any AI slide tool)

Paste the block below **verbatim** as the first message. Attach:

1. `Nabz-Deck-Knowledge.txt` — every fact, number, quote, technical detail the deck should draw from.
2. `Nabz-Pitch-Deck.pptx` — my current draft, **as a reference for what NOT to do**.
3. (Optional) `Nabz-Technical-Document.docx` — the full technical companion, if the tool accepts big documents.

---

## Prompt to paste

I'm presenting **Nabz** at the Alibaba Cloud AI Hackathon Pakistan 2026 (regional event, Islamabad). I need a **judge-facing pitch deck** that looks like it was built by a senior product designer for a Series-A pitch, not a hackathon submission.

**Non-negotiables:**

- **16 slides.** Widescreen 16:9.
- **Motion.** Every slide must have entrance animations — text staggers in, stats count up, diagrams reveal in sequence, cards slide/fade with a subtle delay. NOT text appearing all at once. Use subtle, professional motion (150–350ms per element, 40–80ms stagger). No spinning, no bouncing, no gimmicks.
- **A dark-light-dark sandwich.** Slides 1, 6 (demo), and 16 are dark (near-black with a teal accent orb). Slides 2–5 and 7–15 are light on a warm off-white (#FAFAF7), never plain white.
- **Custom illustrations, not clip-art.** Where a phone mockup is shown, draw a realistic Android status bar (10:12, signal, WiFi, 89%) and match the actual Nabz UI in the attached knowledge doc. Never use generic stock people photos.
- **One design motif carried across every slide.** A pulse waveform stroke (the Nabz logo mark) appears somewhere on every content slide as a signature element — sometimes as a divider, sometimes as an icon backdrop, sometimes as a section marker.

**Brand system:**

- Primary teal `#0F9D8A`, dark teal `#0B7D6E`, tint `#ECFDF7`.
- Ink `#0F172A`, soft ink `#334155`, muted `#64748B`.
- Warning coral `#EF4444` reserved for emergency (1122) and mental-health context — nowhere else.
- Amber `#F59E0B` for cost / budget stats.
- Off-white background `#FAFAF7` — NEVER pure `#FFFFFF` on content slides.
- Fonts: **serif for titles** (Cambria, or Fraunces if the tool supports it), **sans for body** (Inter or Calibri). Urdu (نبض) uses a Nastaliq font (Noto Nastaliq Urdu) at generous line-height 1.75.

**Typographic hierarchy per slide:**

- Kicker (uppercase, letter-spaced, teal, 11pt) — e.g. `01  ·  THE PROBLEM`
- Title (serif, 34–40pt bold, ink) — one clear sentence, never more than 8 words
- Body / cards — 12–15pt max, always left-aligned in Latin, right-aligned in Urdu
- Every slide has a **footer strip**: "Nabz · Alibaba Cloud AI Hackathon 2026" left, page number right

**Structure (16 slides, in order — same story as the attached draft, but redesigned):**

1. **Cover (dark)** — نبض (huge Nastaliq, teal), then "Nabz", tagline "Urdu-first, voice-first AI health triage", hackathon line, team name. Entrance: نبض fades in and grows, then tagline slides up.

2. **The Problem (light)** — Title: "A country of 240 million cannot triage in English." Four large stat callouts as horizontally-arranged tiles (1:1300, ~90 MH pros, ~40% English literacy, ~120M smartphones). Below: three persona cards (Primary earner, Night-shift caregiver, Student in crisis). Motion: stats count up from 0 with a 60ms stagger.

3. **The Solution (light)** — Title: "Speak your symptoms. Nabz talks back — in your language." Split layout: left is 4 numbered steps in circular badges (Tap and speak → Get structured triage → Hear it read back → Escalate or hand off). Right is a realistic phone mockup showing the Nabz guest chat: dark status bar (10:12, 89%), Urdu greeting "آج آپ کی طبیعت کیسی ہے؟", central teal mic pulse ring, three quick-symptom chips in Urdu. Motion: steps stagger left-to-right, phone mockup slides up with subtle scale-in.

4. **Why Now, Why Qwen (light)** — Title: "Qwen changed what a health assistant for Pakistan can hear." Two-column before-after. Left ("Before Qwen") four rows with coral bar accent; right ("With Qwen · Nabz") four rows with teal bar accent. Motion: left column reveals first, then right column beats it with a slight bounce-in.

5. **Feature Matrix (light)** — Title: "One product, three user modes — all built." Table: rows = capabilities (voice triage, emergency escalation, MH first-response, OCR, DailyMed, nearby care, TTS, persistent history, family vault, AI budget cap), columns = Guest / Registered / Doctor. Cells are filled circles (teal), dashes, or short labels. Motion: rows stagger top-to-bottom.

6. **Live Demo (dark)** — Title: "What we'll show in ninety seconds." Six-row timeline: 0:00 Open app · 0:10 Speak Urdu · 0:25 Watch triage render · 0:45 Hit TTS · 1:00 Trigger emergency phrase · 1:20 Switch family profile. Timestamp in teal pill on left, action title next to it, description muted below. Motion: rows type in one at a time.

7. **System Architecture (light)** — Title: "Three tiers. Two providers. One code path." A CUSTOM SVG diagram (not the raster PNG I attached — rebuild it clean in vector). Three columns: Client Tier (Web PWA, Android APK, Voice hook, Triage UI, Family Vault, Auth), Server Tier (FastAPI + all 8 modules named), AI + External (DashScope primary, OpenAI fallback, Gmail SMTP, DailyMed, Overpass). Arrows between columns. Motion: columns reveal L→R, then arrows draw in.

8. **Voice Pipeline (light)** — Title: "Speech in, structured triage out, speech back." Horizontal 8-step flow: Mic Capture → POST /transcribe → Qwen3.5-Omni STT → Whisper Fallback → Transcript JSON → Guardrails Check → Qwen3.7-plus Triage (with gpt-4o-mini branch) → Response Rendered → TTS Read-out. Three cross-cutting guarantee cards below (Never fabricate · Emergency first · Budget capped). Motion: nodes reveal L→R with arrow-draw-in.

9. **Tech Stack (light)** — Title: "Every choice is boring — on purpose." Four cards in 2×2 grid: Frontend, Backend, AI Models, Ops & Infra. Each card has an icon in a teal-tinted circle and 4 bulleted items. Motion: cards fade-in stagger diagonally.

10. **AI Layer + Cost (light)** — Title: "Under one US cent per triage. Capped, not estimated." Top: 4-row table (Role / Primary / Fallback / Cost lever). Bottom: TWO giant stat tiles — $0.50 (dark) per account, $0.30 (teal) per guest. Motion: table rows stagger, then USD tiles pop-in with number count-up from $0.00.

11. **Safety Guardrails (light)** — Title: "Safety is in the code, not in a prompt." Three horizontal rows, each with a left color bar (coral, amber, teal) and: layer name / fires-when / action. Bottom line in italic teal: '"میں خودکشی نہیں کروں گا" ← the negation window prevents this from firing.' Motion: rows reveal top-down, each with a subtle pulse on the color bar.

12. **Security (light)** — Title: "Twelve controls. All in production." 4×3 grid of 12 controls. Each cell: emoji in teal circle, control name bold, one-line description muted. Motion: 12 cards grid-stagger from top-left.

13. **Traction (light)** — Title: "Not a slide-only prototype — a shipped product." 2×3 grid of large stat tiles: v2.4.0 (APK), 4 (release iterations), 11 (SQA cases passed), 6 (viewport widths), 2 (STT providers), ~3s (OTP round-trip). Big teal-dark numbers, bold labels, muted sub-line. Motion: numbers count up simultaneously with 80ms stagger between tiles.

14. **Roadmap (light)** — Title: "Where Nabz goes after the hackathon." Four columns: Now · v2.4, Q4 2026, H1 2027, H2 2027+. Each column is a card with a colored header stripe (teal/dark alternating) and 4 bulleted items. Motion: columns reveal L→R.

15. **What We Need (light)** — Title: "To go from demo to district clinic." Three asks in a large card: Alibaba Cloud credits (bootstrap pilot) · Physician panel (safety review) · Partner hospital (measure time-to-care). Below: Team block with Kheem Parkash Dharmani, ML Engineer, contact details. Motion: asks stagger top-down, contact block fades in last.

16. **Thank You (dark)** — نبض huge Nastaliq on left teal orb, "Thank you." serif large, tagline "Nabz — a pulse of care, in the language patients actually speak.", then live URLs (https://nabz-web.onrender.com, https://nabz-api.onrender.com), then "Questions?" in teal. Motion: teal orb scales in from behind, نبض fades in, then text staggers in.

**What NOT to do (my current draft got these wrong — do the opposite):**

- No plain white backgrounds anywhere on content slides.
- No cheap gradient rectangles as accents.
- No solid-color header bars spanning slide width.
- No side accent stripes on cards — hallmark of AI-generated slides.
- No emoji-only iconography — use SVG icons in colored circles.
- No slides that are just a title + bulleted list.
- No table with cells full of "●" bullets — use custom shape cells if you can.
- Never truncate text; every string in the knowledge file fits, or the box needs to grow.

**Voice / tone:**

Every title is a **complete sentence with a period**, active voice, present tense. Body copy is confident and specific — never marketing fluff, never "revolutionize", never "seamless", never "leverage". If a stat is on the slide, it comes from the knowledge file, not invented.

**Deliverable:**

Return a fully-animated deck as an editable file (Google Slides link, Pitch deck, or Figma frames — whichever your tool supports). If you output PowerPoint, ensure each element has an entrance animation set (not just "appear").

**Attached files:**

- `Nabz-Deck-Knowledge.txt` — every fact you're allowed to use. If a claim isn't there, do NOT invent it.
- `Nabz-Pitch-Deck.pptx` — my current draft. Look at it as a **counter-example**: same story, but the execution reads as AI-generated / hackathon-tier. The redesign must feel like a senior designer built it.
- (Optional) `Nabz-Technical-Document.docx` — deeper technical background for context.

Now build the deck.
