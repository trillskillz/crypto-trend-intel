# System Design

## Architecture
- Frontend: Next.js dashboard + copilot UI
- API: FastAPI service exposing signals, forecasts, explanations
- Ingest: scheduled jobs pulling market/on-chain/sentiment data
- Models: time-series + classification ensemble
- Storage: Postgres (+ Timescale optional) + Redis cache
- Orchestration: cron + worker queue

## Prediction Flow
1. Ingest market data
2. Build feature vectors
3. Run ensemble models
4. Calibrate probabilities
5. Store forecasts + explanations
6. Serve to dashboard + alert engine
