# Privacy & Consent — Nabz (نبض)

**آپ کا ڈیٹا آپ کا ہے۔ · Your data is yours.**

Nabz stores health information so it can help you and your family — never to
sell, share, or train AI models. This page explains, in plain language, what we
store, why, and how you stay in control.

---

## پلین اردو میں / In plain Urdu

- آپ کی معلومات صرف آپ کے اکاؤنٹ سے جُڑی ہوتی ہیں۔
- ہر مریض (فیملی ممبر) کا ریکارڈ الگ رہتا ہے۔
- ہم آپ کا ڈیٹا کسی کو بیچتے یا شیئر نہیں کرتے۔
- آپ کا ڈیٹا AI ماڈل کی ٹریننگ کے لیے استعمال نہیں ہوتا۔
- آپ جب چاہیں اپنا ریکارڈ حذف (delete) کر سکتے ہیں۔
- کوئی بھی صحت کا ڈیٹا یا تصویر محفوظ کرنے سے پہلے آپ کی اجازت لی جاتی ہے۔

---

## What Nabz stores

| Data | Why | Where |
| --- | --- | --- |
| Account: name, phone, password **hash** | To sign you in and own your family vault | Backend database, account-scoped |
| Patient profiles (name, age, conditions, allergies, medicines, notes) | To personalize triage and keep a family health record | Backend database, per profile |
| Triage sessions (your symptoms + answers) | To continue a conversation and build a health timeline | Backend database, per profile |
| Lab reports & prescription images | To explain results and let you view the original later | Backend `uploads/` + database reference |

Your **password is never stored in plain text** — only a bcrypt hash. The
DashScope/Qwen API key lives only on the backend and **never reaches the
browser**. Health-conversation and relevant Vault context are sent from the
backend to the configured Qwen service to generate an assessment or follow-up
answer. DailyMed receives only an allowlisted generic medicine name; Nabz does
not send DailyMed a patient name, transcript, diagnosis, or Vault data.

## Consent

- Before any health data or uploaded image is **saved**, Nabz asks for your
  consent with a clear checkbox.
- Consent is specific: uploading a document to a profile applies to that
  profile only.
- You can use triage without creating permanent records if you decline saving.

## Your controls

- **Delete a profile** removes that person's profile and all of their data
  (medicines, timeline, triage sessions) in one tap.
- **Deleting your account** removes every profile you own.
- You can edit or correct any profile field at any time.

## What Nabz does **not** do

- It does not sell your data or share it with advertisers.
- It does not use your health data to train AI models.
- It does not put personal or health data in URLs or query strings.
- It does not diagnose a disease or prescribe medicine.

## Boundaries & honesty

Nabz is a **hackathon/demo build**. Local SQLite storage and a local `uploads/`
folder are **not** production-grade medical-record infrastructure. A real
deployment would require formal security, encryption at rest, access controls,
audit logging, retention policy, clinical-safety review, and regulatory
compliance before handling real patient data at scale.

---

**یہ ڈاکٹر کا متبادل نہیں ہے · This is not a substitute for a doctor.**
