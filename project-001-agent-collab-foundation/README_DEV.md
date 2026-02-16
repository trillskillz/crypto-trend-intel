# Dev Quickstart

## Prereqs
- Node 20+
- Python 3.11+
- Docker + Docker Compose

## Boot
1. cp .env.example .env
2. docker compose up -d postgres redis
3. npm install --prefix apps/web
4. python -m venv .venv && source .venv/bin/activate
5. pip install -r services/api/requirements.txt -r services/models/requirements.txt -r services/ingest/requirements.txt

## Run
- Ingest sample market data: `python services/ingest/run_ingest.py`
- API: `uvicorn services.api.app.main:app --reload --port 8000`
- Web: `npm run dev --prefix apps/web`
