# Nabz (نبض) — dev convenience targets.
# Requires: server/venv created and deps installed, client deps installed.
# On Windows, call the venv Python directly: server/venv/Scripts/python.exe

.PHONY: help install server mock-server client test eval

help:
	@echo "Nabz make targets:"
	@echo "  make install      Install backend (venv) + frontend deps"
	@echo "  make server       Run FastAPI backend on :8000 (uses server/.env)"
	@echo "  make mock-server  Run backend forced into MOCK_MODE (no key needed)"
	@echo "  make client       Run Vite dev server on :5173"
	@echo "  make test         Run pytest in mock mode"
	@echo "  make eval         Run the safety eval (no server needed)"

install:
	cd server && python3 -m venv venv && ./venv/bin/pip install -r requirements.txt
	cd client && npm install

server:
	cd server && ./venv/bin/uvicorn main:app --reload --port 8000

mock-server:
	cd server && MOCK_MODE=true ./venv/bin/uvicorn main:app --reload --port 8000

client:
	cd client && npm run dev

test:
	cd server && MOCK_MODE=true ./venv/bin/python -m pytest tests/ -q

eval:
	./server/venv/bin/python eval.py
