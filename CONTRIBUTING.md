# Contributing to Nabz

Thanks for wanting to help. Nabz handles health guidance for real people, so
a few things matter more here than in a typical app.

## Before you start

- Read the **Medical disclaimer** and **Privacy and safety boundaries**
  sections in [README.md](README.md). Every change should preserve those
  boundaries — Nabz never confirms a diagnosis or independently prescribes.
- For anything touching `server/triage.py`, `server/medicine_evidence.py`,
  or `server/safety_eval.py`, open an issue first to discuss the approach.
  Safety-relevant code gets reviewed more carefully than everything else.

## Local setup

```bash
git clone https://github.com/Kheem-Dh/Nabz---AI-Hackathon-Alibaba.git
cd Nabz---AI-Hackathon-Alibaba
cp .env.example server/.env   # fill in DASHSCOPE_API_KEY for live AI, or leave
                               # blank and set MOCK_MODE=true for synthetic data
```

Backend:

```bash
cd server
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
MOCK_MODE=true uvicorn main:app --reload --port 8000
```

Frontend:

```bash
cd client
npm install
npm run dev
```

Full setup details are in [README.md § Run locally](README.md#run-locally).

## Before opening a PR

```bash
cd server && MOCK_MODE=true venv/bin/python -m pytest tests/ -q
cd client && npm run build
```

Both must pass. CI runs the same two commands on every PR.

## Commit style

Short, imperative subject line describing the *why*, not a changelog of every
line touched. `git log` in this repo is a reasonable style guide.

## Code style

- Backend: type hints on new functions, no bare `except:`, keep the safety
  validation in `triage.py` server-side — never trust model output directly.
- Frontend: functional components + hooks, Urdu-primary / English-secondary
  for any new user-facing text (see existing pages for the pattern).
- No new dependencies without a good reason — this is a lean stack on
  purpose.

## Reporting a security issue

Please **do not** open a public issue for a security vulnerability. Use
[GitHub Security Advisories](https://github.com/Kheem-Dh/Nabz---AI-Hackathon-Alibaba/security/advisories/new)
instead.
