from __future__ import annotations

import csv
from datetime import UTC, datetime
from pathlib import Path

import httpx

BINANCE_BASE_URL = "https://api.binance.com"
SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"]
INTERVAL = "1h"
LIMIT = 500


def fetch_klines(symbol: str) -> list[list]:
    url = f"{BINANCE_BASE_URL}/api/v3/klines"
    params = {"symbol": symbol, "interval": INTERVAL, "limit": LIMIT}
    with httpx.Client(timeout=15.0) as client:
        r = client.get(url, params=params)
        r.raise_for_status()
        return r.json()


def write_csv(symbol: str, rows: list[list], out_dir: Path) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"{symbol.lower()}_{INTERVAL}.csv"
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow([
            "open_time",
            "open",
            "high",
            "low",
            "close",
            "volume",
            "close_time",
        ])
        for row in rows:
            w.writerow([row[0], row[1], row[2], row[3], row[4], row[5], row[6]])
    return path


def main() -> None:
    ts = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    root = Path(__file__).resolve().parents[2] / "data" / "market" / ts

    print(f"Ingesting Binance klines -> {root}")
    for symbol in SYMBOLS:
        rows = fetch_klines(symbol)
        out = write_csv(symbol, rows, root)
        print(f"saved {symbol}: {out}")


if __name__ == "__main__":
    main()
