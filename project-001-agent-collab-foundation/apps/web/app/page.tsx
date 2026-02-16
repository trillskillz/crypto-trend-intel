type Trend = {
  symbol: string
  horizon: string
  up_probability: number
  momentum_score: number
  volatility_regime: 'low' | 'medium' | 'high'
  explanation: string
}

type Backtest = {
  symbol: string
  bars_tested: number
  signal_accuracy: number
  strategy_return: number
  buy_hold_return: number
  alpha_vs_buy_hold: number
  max_drawdown: number
  notes: string
}

const API_BASE = process.env.API_BASE_URL || 'http://127.0.0.1:8000'

async function getTrends(): Promise<Trend[]> {
  try {
    const r = await fetch(`${API_BASE}/v1/trends?symbols=BTC,ETH,SOL`, { cache: 'no-store' })
    if (!r.ok) return []
    return await r.json()
  } catch {
    return []
  }
}

async function getBacktest(symbol: string): Promise<Backtest | null> {
  try {
    const r = await fetch(`${API_BASE}/v1/backtest/${symbol}`, { cache: 'no-store' })
    if (!r.ok) return null
    return await r.json()
  } catch {
    return null
  }
}

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`
}

export default async function Home() {
  const trends = await getTrends()
  const backtest = await getBacktest('BTC')

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui' }}>
      <h1>Crypto Trend Intelligence</h1>
      <p>Live baseline signals + backtest quality snapshot.</p>

      {trends.length === 0 ? (
        <p style={{ color: '#a00' }}>
          API not reachable yet. Start backend: <code>uvicorn services.api.app.main:app --reload --port 8000</code>
        </p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 12 }}>
          {trends.map((t) => (
            <section key={t.symbol} style={{ border: '1px solid #ddd', borderRadius: 12, padding: 14 }}>
              <h3 style={{ margin: 0 }}>{t.symbol}</h3>
              <p style={{ margin: '8px 0' }}><strong>Up probability:</strong> {pct(t.up_probability)}</p>
              <p style={{ margin: '8px 0' }}><strong>Momentum:</strong> {t.momentum_score.toFixed(3)}</p>
              <p style={{ margin: '8px 0' }}><strong>Volatility:</strong> {t.volatility_regime}</p>
              <small>{t.explanation}</small>
            </section>
          ))}
        </div>
      )}

      <section style={{ marginTop: 20, border: '1px solid #ddd', borderRadius: 12, padding: 14 }}>
        <h2 style={{ marginTop: 0 }}>Baseline Backtest (BTC)</h2>
        {!backtest ? (
          <p>Backtest unavailable.</p>
        ) : (
          <ul>
            <li><strong>Bars tested:</strong> {backtest.bars_tested}</li>
            <li><strong>Signal accuracy:</strong> {pct(backtest.signal_accuracy)}</li>
            <li><strong>Strategy return:</strong> {pct(backtest.strategy_return)}</li>
            <li><strong>Buy & hold:</strong> {pct(backtest.buy_hold_return)}</li>
            <li><strong>Alpha vs buy & hold:</strong> {pct(backtest.alpha_vs_buy_hold)}</li>
            <li><strong>Max drawdown:</strong> {pct(backtest.max_drawdown)}</li>
          </ul>
        )}
      </section>
    </main>
  )
}
