from __future__ import annotations

import math
from typing import Literal

import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI(title="Crypto Trend API", version="0.2.0")

BINANCE_BASE_URL = "https://api.binance.com"
INTERVAL = "1h"
LIMIT = 200


class TrendResponse(BaseModel):
    symbol: str
    horizon: str
    up_probability: float
    momentum_score: float
    volatility_regime: Literal["low", "medium", "high"]
    explanation: str


@app.get("/health")
def health():
    return {"ok": True, "service": "crypto-trend-api"}


@app.get("/v1/trends/{symbol}", response_model=TrendResponse)
def trend(symbol: str):
    pair = symbol.upper()
    if not pair.endswith("USDT"):
        pair = f"{pair}USDT"

    closes = _fetch_closes(pair)
    if len(closes) < 60:
        raise HTTPException(status_code=502, detail="Not enough market data")

    momentum = _momentum_score(closes)
    vol = _volatility(closes)
    up_probability = _up_probability(momentum, vol)
    regime = _volatility_regime(vol)

    return TrendResponse(
        symbol=pair,
        horizon="24h",
        up_probability=round(up_probability, 4),
        momentum_score=round(momentum, 4),
        volatility_regime=regime,
        explanation=(
            f"Baseline signal from Binance {INTERVAL} candles: momentum={momentum:.3f}, "
            f"volatility={vol:.4f}, regime={regime}."
        ),
    )


@app.get("/v1/trends")
def trend_batch(symbols: str = "BTC,ETH,SOL"):
    out = []
    for s in [x.strip() for x in symbols.split(",") if x.strip()]:
        out.append(trend(s))
    return out


def _fetch_closes(symbol: str) -> list[float]:
    url = f"{BINANCE_BASE_URL}/api/v3/klines"
    params = {"symbol": symbol, "interval": INTERVAL, "limit": LIMIT}
    try:
        with httpx.Client(timeout=10.0) as client:
            r = client.get(url, params=params)
            r.raise_for_status()
            raw = r.json()
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=502, detail=f"Market data fetch failed: {exc}") from exc

    return [float(row[4]) for row in raw]


def _momentum_score(closes: list[float]) -> float:
    # blend short + medium returns
    r12 = (closes[-1] / closes[-12]) - 1.0
    r48 = (closes[-1] / closes[-48]) - 1.0
    return (0.65 * r12) + (0.35 * r48)


def _volatility(closes: list[float]) -> float:
    returns = []
    for i in range(1, len(closes)):
        returns.append((closes[i] / closes[i - 1]) - 1.0)
    if not returns:
        return 0.0
    mean = sum(returns) / len(returns)
    var = sum((x - mean) ** 2 for x in returns) / len(returns)
    return math.sqrt(var)


def _up_probability(momentum: float, vol: float) -> float:
    # simple calibrated-ish logistic baseline
    x = (momentum * 24.0) - (vol * 8.0)
    p = 1.0 / (1.0 + math.exp(-x))
    return max(0.05, min(0.95, p))


def _volatility_regime(vol: float) -> Literal["low", "medium", "high"]:
    if vol < 0.008:
        return "low"
    if vol < 0.02:
        return "medium"
    return "high"
