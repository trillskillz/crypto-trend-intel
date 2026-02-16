# Replit Quick Start

This project has two services:
- `apps/web` (Next.js frontend)
- `services/api` (FastAPI backend)

## 1) Install deps

### Web
```bash
cd apps/web
npm install
cd ../..
```

### API
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r services/api/requirements.txt
```

## 2) Run API (port 8000)

```bash
source .venv/bin/activate
uvicorn services.api.app.main:app --host 0.0.0.0 --port 8000
```

## 3) Run Web (port 3000)

In a second shell:
```bash
cd apps/web
API_BASE_URL=http://127.0.0.1:8000 npm run dev -- --hostname 0.0.0.0 --port 3000
```

## 4) Replit port mapping

- Expose port `3000` publicly (web app)
- Keep `8000` internal (API)

If Replit gives internal URL for API, set:
```bash
API_BASE_URL=<your-api-url>
```

## 5) Production mode (optional)

```bash
cd apps/web
npm run build
npm run start -- --hostname 0.0.0.0 --port 3000
```

## Troubleshooting

- If you see `Cannot find module './819.js'` in Next.js:
  ```bash
  cd apps/web
  rm -rf .next
  npm run build
  npm run start -- --hostname 0.0.0.0 --port 3000
  ```

- If page says API unreachable:
  - confirm API is running on `:8000`
  - check `/health` returns `{ "ok": true, ... }`
  - verify `API_BASE_URL` is correct

## Notes

- The watchlist can be huge after CoinGecko import; use lower **Live Analysis Size** for speed.
- Always do your own due diligence; signals are probabilistic, not financial advice.
