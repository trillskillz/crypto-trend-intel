type Trend = {
  symbol: string
  horizon: string
  up_probability: number
  momentum_score: number
  volatility_regime: 'low' | 'medium' | 'high'
  explanation: string
}

async function getTrends(): Promise<Trend[]> {
  const base = process.env.API_BASE_URL || 'http://127.0.0.1:8000'
  try {
    const r = await fetch(`${base}/v1/trends?symbols=BTC,ETH,SOL`, { cache: 'no-store' })
    if (!r.ok) return []
    return await r.json()
  } catch {
    return []
  }
}

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`
}

export default async function Home() {
  const trends = await getTrends()

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui' }}>
      <h1>Crypto Trend Intelligence</h1>
      <p>Live baseline signals from market candles.</p>

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
    </main>
  )
}
