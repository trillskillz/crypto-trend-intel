from __future__ import annotations

import json
import math
from datetime import UTC, datetime
from pathlib import Path
from typing import Literal

import httpx
from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel

app = FastAPI(title="Crypto Trend API", version="0.6.0")

BINANCE_BASE_URL = "https://api.binance.com"
COINBASE_BASE_URL = "https://api.exchange.coinbase.com"
COINGECKO_BASE_URL = "https://api.coingecko.com/api/v3"
INTERVAL = "1h"
LIMIT = 1000
RiskProfile = Literal["conservative", "moderate", "aggressive"]

STATE_DIR = Path(__file__).resolve().parents[1] / "state"
WATCHLIST_FILE = STATE_DIR / "watchlist.json"
ALERTS_FILE = STATE_DIR / "alerts_state.json"
COINGECKO_UNIVERSE_FILE = STATE_DIR / "coingecko_universe.json"


class TrendResponse(BaseModel):
    symbol: str
    horizon: str
    risk_profile: RiskProfile
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
    risk_profile: RiskProfile
    signal_accuracy: float
    strategy_return: float
    buy_hold_return: float
    alpha_vs_buy_hold: float
    max_drawdown: float
    notes: str
    start_time: str
    end_time: str
    equity_curve: list[EquityPoint]


class ExplainResponse(BaseModel):
    symbol: str
    risk_profile: RiskProfile
    outlook: Literal["bullish", "neutral", "bearish"]
    confidence: float
    drivers: list[str]
    caution: list[str]
    summary: str


class PortfolioSimResponse(BaseModel):
    symbol: str
    risk_profile: RiskProfile
    initial_capital: float
    position_size_pct: float
    stop_loss_pct: float
    take_profit_pct: float
    trades: int
    win_rate: float
    final_equity: float
    pnl_pct: float
    max_drawdown: float
    notes: str


class WatchlistResponse(BaseModel):
    symbols: list[str]


class AlertFlip(BaseModel):
    symbol: str
    from_outlook: str
    to_outlook: str
    up_probability: float


class AlertsCheckResponse(BaseModel):
    risk_profile: RiskProfile
    checked_at: str
    flips: list[AlertFlip]


class CoinUniverseItem(BaseModel):
    id: str
    symbol: str
    name: str


class CoinUniverseResponse(BaseModel):
    total: int
    offset: int
    limit: int
    items: list[CoinUniverseItem]


@app.get("/health")
def health():
    return {"ok": True, "service": "crypto-trend-api"}


@app.get("/v1/watchlist", response_model=WatchlistResponse)
def get_watchlist():
    return WatchlistResponse(symbols=_load_watchlist())


@app.post("/v1/watchlist/{symbol}", response_model=WatchlistResponse)
def add_watchlist(symbol: str):
    pair = _to_pair(symbol)
    current = _load_watchlist()
    if pair not in current:
        current.append(pair)
        _save_watchlist(current)
    return WatchlistResponse(symbols=current)


@app.delete("/v1/watchlist/{symbol}", response_model=WatchlistResponse)
def remove_watchlist(symbol: str):
    pair = _to_pair(symbol)
    current = [s for s in _load_watchlist() if s != pair]
    _save_watchlist(current)
    return WatchlistResponse(symbols=current)


@app.post("/v1/watchlist/import/coingecko", response_model=WatchlistResponse)
def import_watchlist_from_coingecko(refresh: bool = Query(default=False)):
    coins = _load_coingecko_universe(refresh=refresh)
    symbols = [_to_pair(c.get("symbol", "")) for c in coins if c.get("symbol")]
    _save_watchlist(symbols)
    return WatchlistResponse(symbols=_load_watchlist())


@app.get("/v1/universe/coingecko", response_model=CoinUniverseResponse)
def universe_coingecko(
    search: str = Query(default=""),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=200, ge=1, le=2000),
    refresh: bool = Query(default=False),
):
    coins = _load_coingecko_universe(refresh=refresh)
    q = search.strip().lower()
    if q:
        coins = [
            c for c in coins
            if q in c.get("id", "").lower() or q in c.get("symbol", "").lower() or q in c.get("name", "").lower()
        ]

    total = len(coins)
    window = coins[offset : offset + limit]
    items = [CoinUniverseItem(id=c["id"], symbol=c["symbol"], name=c["name"]) for c in window]
    return CoinUniverseResponse(total=total, offset=offset, limit=limit, items=items)


@app.get("/v1/alerts/check", response_model=AlertsCheckResponse)
def alerts_check(
    risk: RiskProfile = Query(default="moderate"),
    max_symbols: int = Query(default=200, ge=1, le=2000),
):
    symbols = _load_watchlist()[:max_symbols]
    prev = _load_json(ALERTS_FILE, default={})
    flips: list[AlertFlip] = []
    next_state: dict[str, str] = {}

    for symbol in symbols:
        try:
            t = trend(symbol, risk=risk)
        except HTTPException:
            continue
        now = _outlook_from_probability(t.up_probability)
        old = prev.get(symbol)
        if old and old != now:
            flips.append(
                AlertFlip(
                    symbol=symbol,
                    from_outlook=old,
                    to_outlook=now,
                    up_probability=round(t.up_probability, 4),
                )
            )
        next_state[symbol] = now

    _save_json(ALERTS_FILE, next_state)
    return AlertsCheckResponse(
        risk_profile=risk,
        checked_at=datetime.now(UTC).isoformat(),
        flips=flips,
    )


@app.get("/v1/trends/{symbol}", response_model=TrendResponse)
def trend(
    symbol: str,
    risk: RiskProfile = Query(default="moderate"),
):
    pair = _to_pair(symbol)
    closes = [k["close"] for k in _fetch_klines(pair)]
    if len(closes) < 60:
        raise HTTPException(status_code=502, detail="Not enough market data")

    momentum = _momentum_score(closes)
    vol = _volatility(closes)
    up_probability = _up_probability(momentum, vol)
    regime = _volatility_regime(vol)

    return TrendResponse(
        symbol=pair,
        horizon="24h",
        risk_profile=risk,
        up_probability=round(up_probability, 4),
        momentum_score=round(momentum, 4),
        volatility_regime=regime,
        explanation=_signal_explanation(momentum, vol, regime, risk),
    )


@app.get("/v1/trends")
def trend_batch(
    symbols: str = "BTC,ETH,SOL",
    risk: RiskProfile = Query(default="moderate"),
):
    out = []
    for s in symbols.split(","):
        s = s.strip()
        if not s:
            continue
        try:
            out.append(trend(s, risk=risk))
        except HTTPException:
            continue
    return out


@app.get("/v1/backtest/{symbol}", response_model=BacktestResponse)
def backtest(
    symbol: str,
    lookback: int = Query(default=240, ge=120, le=900),
    risk: RiskProfile = Query(default="moderate"),
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

    entry_threshold = _entry_threshold(risk)

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

        if p_up >= entry_threshold:
            equity *= (1.0 + next_ret)
        buy_hold *= (1.0 + next_ret)

        peak = max(peak, equity)
        dd = (equity / peak) - 1.0
        max_dd = min(max_dd, dd)

        curve.append(
            EquityPoint(t=times[i + 1], strategy=round(equity, 6), buy_hold=round(buy_hold, 6))
        )

    if total == 0:
        raise HTTPException(status_code=502, detail="Backtest produced no samples")

    strat_ret = equity - 1.0
    bh_ret = buy_hold - 1.0
    alpha = strat_ret - bh_ret

    return BacktestResponse(
        symbol=pair,
        bars_tested=total,
        risk_profile=risk,
        signal_accuracy=round(correct / total, 4),
        strategy_return=round(strat_ret, 4),
        buy_hold_return=round(bh_ret, 4),
        alpha_vs_buy_hold=round(alpha, 4),
        max_drawdown=round(max_dd, 4),
        notes=f"Baseline heuristic backtest with {risk} threshold={entry_threshold:.2f}.",
        start_time=_fmt_ms(times[start]),
        end_time=_fmt_ms(times[-1]),
        equity_curve=curve,
    )


@app.get("/v1/backtest")
def backtest_batch(
    symbols: str = "BTC,ETH,SOL",
    lookback: int = Query(default=240, ge=120, le=900),
    risk: RiskProfile = Query(default="moderate"),
):
    out = []
    for s in symbols.split(","):
        s = s.strip()
        if not s:
            continue
        try:
            out.append(backtest(s, lookback=lookback, risk=risk))
        except HTTPException:
            continue
    return out


@app.get("/v1/explain/{symbol}", response_model=ExplainResponse)
def explain(
    symbol: str,
    risk: RiskProfile = Query(default="moderate"),
):
    t = trend(symbol, risk=risk)
    confidence = abs(t.up_probability - 0.5) * 2.0
    outlook: Literal["bullish", "neutral", "bearish"]
    if t.up_probability >= 0.56:
        outlook = "bullish"
    elif t.up_probability <= 0.44:
        outlook = "bearish"
    else:
        outlook = "neutral"

    drivers = [
        f"Momentum score is {t.momentum_score:+.3f}",
        f"Volatility regime is {t.volatility_regime}",
        f"Model up-probability is {t.up_probability:.1%}",
    ]

    caution = [
        "Signal is baseline and should be validated with additional factors",
        "Crypto volatility can invalidate short-term forecasts quickly",
    ]
    if t.volatility_regime == "high":
        caution.append("High volatility regime increases whipsaw risk")
    if risk == "aggressive":
        caution.append("Aggressive profile takes more entries and larger drawdown risk")

    return ExplainResponse(
        symbol=t.symbol,
        risk_profile=risk,
        outlook=outlook,
        confidence=round(confidence, 4),
        drivers=drivers,
        caution=caution,
        summary=(
            f"{outlook.title()} setup with {confidence:.1%} confidence under {risk} risk profile. "
            f"Primary driver: momentum {t.momentum_score:+.3f} in {t.volatility_regime} volatility."
        ),
    )


@app.get("/v1/portfolio/simulate/{symbol}", response_model=PortfolioSimResponse)
def portfolio_simulate(
    symbol: str,
    lookback: int = Query(default=360, ge=120, le=900),
    risk: RiskProfile = Query(default="moderate"),
    initial_capital: float = Query(default=10_000, ge=100),
):
    pair = _to_pair(symbol)
    klines = _fetch_klines(pair)
    if len(klines) < lookback:
        raise HTTPException(status_code=502, detail="Not enough market data for requested lookback")

    closes = [k["close"] for k in klines[-lookback:]]
    pos_size, stop_loss, take_profit = _risk_params(risk)

    equity = initial_capital
    peak = equity
    max_dd = 0.0
    wins = 0
    trades = 0

    i = 60
    while i < len(closes) - 2:
        hist = closes[: i + 1]
        m = _momentum_score(hist)
        v = _volatility(hist)
        p_up = _up_probability(m, v)

        if p_up < _entry_threshold(risk):
            i += 1
            continue

        entry = closes[i]
        capital_at_risk = equity * pos_size
        trades += 1

        exit_ret = 0.0
        exited = False
        for j in range(i + 1, min(i + 25, len(closes))):
            ret = (closes[j] / entry) - 1.0
            if ret <= -stop_loss:
                exit_ret = -stop_loss
                exited = True
                break
            if ret >= take_profit:
                exit_ret = take_profit
                exited = True
                break

        if not exited:
            # time-based exit
            j = min(i + 24, len(closes) - 1)
            exit_ret = (closes[j] / entry) - 1.0

        pnl = capital_at_risk * exit_ret
        equity += pnl
        if pnl > 0:
            wins += 1

        peak = max(peak, equity)
        dd = (equity / peak) - 1.0
        max_dd = min(max_dd, dd)

        i = j + 1

    win_rate = (wins / trades) if trades else 0.0
    pnl_pct = (equity / initial_capital) - 1.0

    return PortfolioSimResponse(
        symbol=pair,
        risk_profile=risk,
        initial_capital=round(initial_capital, 2),
        position_size_pct=round(pos_size, 4),
        stop_loss_pct=round(stop_loss, 4),
        take_profit_pct=round(take_profit, 4),
        trades=trades,
        win_rate=round(win_rate, 4),
        final_equity=round(equity, 2),
        pnl_pct=round(pnl_pct, 4),
        max_drawdown=round(max_dd, 4),
        notes="Simple long-only simulation with risk-based sizing and stop/take exits.",
    )


def _load_json(path: Path, default):
    try:
        if not path.exists():
            return default
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def _save_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def _load_coingecko_universe(refresh: bool = False) -> list[dict]:
    cached = _load_json(COINGECKO_UNIVERSE_FILE, default=[])
    if cached and not refresh:
        return cached

    url = f"{COINGECKO_BASE_URL}/coins/list"
    params = {"include_platform": "false"}
    try:
        with httpx.Client(timeout=20.0) as client:
            r = client.get(url, params=params)
            r.raise_for_status()
            raw = r.json()
        cleaned = [
            {
                "id": str(c.get("id", "")).strip(),
                "symbol": str(c.get("symbol", "")).strip().lower(),
                "name": str(c.get("name", "")).strip(),
            }
            for c in raw
            if c.get("id") and c.get("symbol") and c.get("name")
        ]
        _save_json(COINGECKO_UNIVERSE_FILE, cleaned)
        return cleaned
    except Exception:
        return cached if cached else []


def _load_watchlist() -> list[str]:
    data = _load_json(WATCHLIST_FILE, default=["BTCUSDT", "ETHUSDT", "SOLUSDT"])
    out = []
    for s in data:
        pair = _to_pair(str(s))
        if pair not in out:
            out.append(pair)
    return out


def _save_watchlist(symbols: list[str]) -> None:
    cleaned = []
    for s in symbols:
        pair = _to_pair(s)
        if pair not in cleaned:
            cleaned.append(pair)
    _save_json(WATCHLIST_FILE, cleaned)


def _outlook_from_probability(p: float) -> str:
    if p >= 0.56:
        return "bullish"
    if p <= 0.44:
        return "bearish"
    return "neutral"


def _to_pair(symbol: str) -> str:
    pair = symbol.upper()
    return pair if pair.endswith("USDT") else f"{pair}USDT"


def _coinbase_product(symbol: str) -> str:
    base = symbol.upper().replace("USDT", "")
    return f"{base}-USD"


def _fetch_klines(symbol: str) -> list[dict]:
    # Primary: Binance
    url = f"{BINANCE_BASE_URL}/api/v3/klines"
    params = {"symbol": symbol, "interval": INTERVAL, "limit": LIMIT}
    try:
        with httpx.Client(timeout=12.0) as client:
            r = client.get(url, params=params)
            r.raise_for_status()
            raw = r.json()
        return [{"open_time": int(row[0]), "close": float(row[4])} for row in raw]
    except Exception:
        pass

    # Fallback: Coinbase candles (public)
    product = _coinbase_product(symbol)
    cb_url = f"{COINBASE_BASE_URL}/products/{product}/candles"
    cb_params = {"granularity": 3600}
    try:
        with httpx.Client(timeout=12.0) as client:
            r = client.get(cb_url, params=cb_params)
            r.raise_for_status()
            raw = r.json()
        if not raw:
            raise ValueError("No candles in Coinbase response")
        # Coinbase returns newest-first: [time, low, high, open, close, volume]
        raw_sorted = sorted(raw, key=lambda x: x[0])
        return [{"open_time": int(row[0]) * 1000, "close": float(row[4])} for row in raw_sorted]
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=502, detail=f"Market data fetch failed (Binance+Coinbase): {exc}") from exc


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


def _entry_threshold(risk: RiskProfile) -> float:
    if risk == "conservative":
        return 0.62
    if risk == "aggressive":
        return 0.52
    return 0.55


def _risk_params(risk: RiskProfile) -> tuple[float, float, float]:
    # position_size, stop_loss, take_profit
    if risk == "conservative":
        return (0.15, 0.025, 0.05)
    if risk == "aggressive":
        return (0.35, 0.05, 0.10)
    return (0.25, 0.035, 0.07)


def _signal_explanation(momentum: float, vol: float, regime: str, risk: RiskProfile) -> str:
    return (
        f"Baseline from Binance {INTERVAL}: momentum={momentum:+.3f}, volatility={vol:.4f} ({regime}). "
        f"Risk profile={risk}."
    )
