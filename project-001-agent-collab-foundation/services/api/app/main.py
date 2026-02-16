from __future__ import annotations

import math
from datetime import UTC, datetime
from typing import Literal

import httpx
from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel

app = FastAPI(title="Crypto Trend API", version="0.4.0")

BINANCE_BASE_URL = "https://api.binance.com"
INTERVAL = "1h"
LIMIT = 1000


class TrendResponse(BaseModel):
    symbol: str
    horizon: str
    up_probability: float
    momentum_score: float
    volatility_regime: Literal["low", "medium", "high"]
    explanation: str


class EquityPoint(BaseModel):
    t: int
    strategy: float
    buy_hold: float


class BacktestResponse(BaseModel):
    symbol: str
    bars_tested: int
    signal_accuracy: float
    strategy_return: float
    buy_hold_return: float
    alpha_vs_buy_hold: float
    max_drawdown: float
    notes: str
    start_time: str
    end_time: str
    equity_curve: list[EquityPoint]


@app.get("/health")
def health():
    return {"ok": True, "service": "crypto-trend-api"}


@app.get("/v1/trends/{symbol}", response_model=TrendResponse)
def trend(symbol: str):
    pair = _to_pair(symbol)
    klines = _fetch_klines(pair)
    closes = [k["close"] for k in klines]
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
    return [trend(s.strip()) for s in symbols.split(",") if s.strip()]


@app.get("/v1/backtest/{symbol}", response_model=BacktestResponse)
def backtest(
    symbol: str,
    lookback: int = Query(default=240, ge=120, le=900),
):
    pair = _to_pair(symbol)
    klines = _fetch_klines(pair)

    if len(klines) < lookback:
        raise HTTPException(status_code=502, detail="Not enough market data for requested lookback")

    window = klines[-lookback:]
    closes = [k["close"] for k in window]
    times = [k["open_time"] for k in window]

    start = 60
    correct = 0
    total = 0
    equity = 1.0
    buy_hold = 1.0
    peak = 1.0
    max_dd = 0.0
    curve: list[EquityPoint] = []

    for i in range(start, len(closes) - 1):
        hist = closes[: i + 1]
        m = _momentum_score(hist)
        v = _volatility(hist)
        p_up = _up_probability(m, v)

        next_ret = (closes[i + 1] / closes[i]) - 1.0
        pred_up = p_up >= 0.5
        actual_up = next_ret >= 0
        if pred_up == actual_up:
            correct += 1
        total += 1

        if p_up >= 0.55:
            equity *= (1.0 + next_ret)
        buy_hold *= (1.0 + next_ret)

        peak = max(peak, equity)
        dd = (equity / peak) - 1.0
        max_dd = min(max_dd, dd)

        curve.append(
            EquityPoint(
                t=times[i + 1],
                strategy=round(equity, 6),
                buy_hold=round(buy_hold, 6),
            )
        )

    if total == 0:
        raise HTTPException(status_code=502, detail="Backtest produced no samples")

    strat_ret = equity - 1.0
    bh_ret = buy_hold - 1.0
    alpha = strat_ret - bh_ret

    return BacktestResponse(
        symbol=pair,
        bars_tested=total,
        signal_accuracy=round(correct / total, 4),
        strategy_return=round(strat_ret, 4),
        buy_hold_return=round(bh_ret, 4),
        alpha_vs_buy_hold=round(alpha, 4),
        max_drawdown=round(max_dd, 4),
        notes="Baseline heuristic backtest. Use for directional calibration only.",
        start_time=_fmt_ms(times[start]),
        end_time=_fmt_ms(times[-1]),
        equity_curve=curve,
    )


@app.get("/v1/backtest")
def backtest_batch(
    symbols: str = "BTC,ETH,SOL",
    lookback: int = Query(default=240, ge=120, le=900),
):
    return [backtest(s.strip(), lookback=lookback) for s in symbols.split(",") if s.strip()]


def _to_pair(symbol: str) -> str:
    pair = symbol.upper()
    return pair if pair.endswith("USDT") else f"{pair}USDT"


def _fetch_klines(symbol: str) -> list[dict]:
    url = f"{BINANCE_BASE_URL}/api/v3/klines"
    params = {"symbol": symbol, "interval": INTERVAL, "limit": LIMIT}
    try:
        with httpx.Client(timeout=12.0) as client:
            r = client.get(url, params=params)
            r.raise_for_status()
            raw = r.json()
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=502, detail=f"Market data fetch failed: {exc}") from exc

    return [
        {
            "open_time": int(row[0]),
            "close": float(row[4]),
        }
        for row in raw
    ]


def _momentum_score(closes: list[float]) -> float:
    r12 = (closes[-1] / closes[-12]) - 1.0
    r48 = (closes[-1] / closes[-48]) - 1.0
    return (0.65 * r12) + (0.35 * r48)


def _volatility(closes: list[float]) -> float:
    returns = [(closes[i] / closes[i - 1]) - 1.0 for i in range(1, len(closes))]
    if not returns:
        return 0.0
    mean = sum(returns) / len(returns)
    var = sum((x - mean) ** 2 for x in returns) / len(returns)
    return math.sqrt(var)


def _up_probability(momentum: float, vol: float) -> float:
    x = (momentum * 24.0) - (vol * 8.0)
    p = 1.0 / (1.0 + math.exp(-x))
    return max(0.05, min(0.95, p))


def _volatility_regime(vol: float) -> Literal["low", "medium", "high"]:
    if vol < 0.008:
        return "low"
    if vol < 0.02:
        return "medium"
    return "high"


def _fmt_ms(ms: int) -> str:
    return datetime.fromtimestamp(ms / 1000, tz=UTC).isoformat()
