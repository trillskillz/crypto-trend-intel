type Risk = 'conservative' | 'moderate' | 'aggressive'

type Trend = {
  symbol: string
  horizon: string
  risk_profile: Risk
  up_probability: number
  momentum_score: number
  volatility_regime: 'low' | 'medium' | 'high'
  explanation: string
}

type EquityPoint = {
  t: number
  strategy: number
  buy_hold: number
}

type Backtest = {
  symbol: string
  bars_tested: number
  risk_profile: Risk
  signal_accuracy: number
  strategy_return: number
  buy_hold_return: number
  alpha_vs_buy_hold: number
  max_drawdown: number
  notes: string
  start_time: string
  end_time: string
  equity_curve: EquityPoint[]
}

type Explain = {
  symbol: string
  risk_profile: Risk
  outlook: 'bullish' | 'neutral' | 'bearish'
  confidence: number
  drivers: string[]
  caution: string[]
  summary: string
}

const API_BASE = process.env.API_BASE_URL || 'http://127.0.0.1:8000'

async function getTrends(risk: Risk): Promise<Trend[]> {
  try {
    const r = await fetch(`${API_BASE}/v1/trends?symbols=BTC,ETH,SOL&risk=${risk}`, { cache: 'no-store' })
    if (!r.ok) return []
    return await r.json()
  } catch {
    return []
  }
}

async function getBacktests(lookback: number, risk: Risk): Promise<Backtest[]> {
  try {
    const r = await fetch(`${API_BASE}/v1/backtest?symbols=BTC,ETH,SOL&lookback=${lookback}&risk=${risk}`, { cache: 'no-store' })
    if (!r.ok) return []
    return await r.json()
  } catch {
    return []
  }
}

async function getExplain(symbol: string, risk: Risk): Promise<Explain | null> {
  try {
    const r = await fetch(`${API_BASE}/v1/explain/${symbol}?risk=${risk}`, { cache: 'no-store' })
    if (!r.ok) return null
    return await r.json()
  } catch {
    return null
  }
}

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`
}

function EquityChart({ data }: { data: EquityPoint[] }) {
  if (!data.length) return <p>No chart data.</p>

  const w = 760
  const h = 220
  const pad = 20

  const all = data.flatMap((d) => [d.strategy, d.buy_hold])
  const minV = Math.min(...all)
  const maxV = Math.max(...all)
  const span = Math.max(0.0001, maxV - minV)

  const toXY = (v: number, i: number) => {
    const x = pad + (i / Math.max(1, data.length - 1)) * (w - pad * 2)
    const y = h - pad - ((v - minV) / span) * (h - pad * 2)
    return `${x},${y}`
  }

  const strat = data.map((d, i) => toXY(d.strategy, i)).join(' ')
  const hold = data.map((d, i) => toXY(d.buy_hold, i)).join(' ')

  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', border: '1px solid #ddd', borderRadius: 8, background: '#fff' }}>
      <polyline points={hold} fill="none" stroke="#888" strokeWidth="2" />
      <polyline points={strat} fill="none" stroke="#0a7" strokeWidth="2.5" />
      <text x={16} y={18} fontSize="12" fill="#444">Strategy (green) vs Buy&Hold (gray)</text>
    </svg>
  )
}

export default async function Home({ searchParams }: { searchParams?: { lookback?: string; risk?: string } }) {
  const lookback = Number(searchParams?.lookback || '240')
  const safeLookback = [120, 240, 360, 720].includes(lookback) ? lookback : 240
  const risk = (searchParams?.risk || 'moderate') as Risk
  const safeRisk: Risk = ['conservative', 'moderate', 'aggressive'].includes(risk) ? risk : 'moderate'

  const [trends, backtests, explain] = await Promise.all([
    getTrends(safeRisk),
    getBacktests(safeLookback, safeRisk),
    getExplain('BTC', safeRisk),
  ])

  const primary = backtests[0]

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui' }}>
      <h1>Crypto Trend Intelligence</h1>
      <p>Live signals + multi-asset backtest analytics + AI explanation.</p>

      <form style={{ marginBottom: 14, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <label>
          Backtest range:&nbsp;
          <select name="lookback" defaultValue={String(safeLookback)}>
            <option value="120">Last 120h</option>
            <option value="240">Last 240h</option>
            <option value="360">Last 360h</option>
            <option value="720">Last 720h</option>
          </select>
        </label>

        <label>
          Risk profile:&nbsp;
          <select name="risk" defaultValue={safeRisk}>
            <option value="conservative">Conservative</option>
            <option value="moderate">Moderate</option>
            <option value="aggressive">Aggressive</option>
          </select>
        </label>

        <button type="submit">Apply</button>
      </form>

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
        <h2 style={{ marginTop: 0 }}>AI Explanation (BTC)</h2>
        {!explain ? (
          <p>Explanation unavailable.</p>
        ) : (
          <>
            <p><strong>Outlook:</strong> {explain.outlook} ({pct(explain.confidence)} confidence)</p>
            <p>{explain.summary}</p>
            <p><strong>Drivers</strong></p>
            <ul>{explain.drivers.map((d, i) => <li key={i}>{d}</li>)}</ul>
            <p><strong>Cautions</strong></p>
            <ul>{explain.caution.map((d, i) => <li key={i}>{d}</li>)}</ul>
          </>
        )}
      </section>

      <section style={{ marginTop: 20, border: '1px solid #ddd', borderRadius: 12, padding: 14 }}>
        <h2 style={{ marginTop: 0 }}>Backtest Summary</h2>
        {backtests.length === 0 ? (
          <p>Backtests unavailable.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th align="left">Symbol</th>
                <th align="right">Accuracy</th>
                <th align="right">Strategy</th>
                <th align="right">Buy&Hold</th>
                <th align="right">Alpha</th>
                <th align="right">Max DD</th>
              </tr>
            </thead>
            <tbody>
              {backtests.map((b) => (
                <tr key={b.symbol}>
                  <td>{b.symbol}</td>
                  <td align="right">{pct(b.signal_accuracy)}</td>
                  <td align="right">{pct(b.strategy_return)}</td>
                  <td align="right">{pct(b.buy_hold_return)}</td>
                  <td align="right">{pct(b.alpha_vs_buy_hold)}</td>
                  <td align="right">{pct(b.max_drawdown)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section style={{ marginTop: 20, border: '1px solid #ddd', borderRadius: 12, padding: 14 }}>
        <h2 style={{ marginTop: 0 }}>Equity Curve ({primary?.symbol || 'N/A'})</h2>
        {primary ? (
          <>
            <p style={{ marginTop: 0, color: '#555' }}>{primary.start_time} → {primary.end_time}</p>
            <EquityChart data={primary.equity_curve} />
          </>
        ) : (
          <p>No curve available.</p>
        )}
      </section>
    </main>
  )
}
