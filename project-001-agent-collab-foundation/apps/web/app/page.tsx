import type { CSSProperties } from 'react'

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

type PortfolioSim = {
  symbol: string
  risk_profile: Risk
  initial_capital: number
  position_size_pct: number
  stop_loss_pct: number
  take_profit_pct: number
  trades: number
  win_rate: number
  final_equity: number
  pnl_pct: number
  max_drawdown: number
  notes: string
}

type Watchlist = { symbols: string[] }
type AlertFlip = { symbol: string; from_outlook: string; to_outlook: string; up_probability: number }
type AlertsCheck = { checked_at: string; risk_profile: Risk; flips: AlertFlip[] }

const API_BASE = process.env.API_BASE_URL || 'http://127.0.0.1:8000'

async function mutateWatchlist(addSymbol?: string, removeSymbol?: string) {
  if (addSymbol) {
    await fetch(`${API_BASE}/v1/watchlist/${encodeURIComponent(addSymbol)}`, { method: 'POST', cache: 'no-store' })
  }
  if (removeSymbol) {
    await fetch(`${API_BASE}/v1/watchlist/${encodeURIComponent(removeSymbol)}`, { method: 'DELETE', cache: 'no-store' })
  }
}

async function getWatchlist(): Promise<Watchlist> {
  try {
    const r = await fetch(`${API_BASE}/v1/watchlist`, { cache: 'no-store' })
    if (!r.ok) return { symbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'] }
    return await r.json()
  } catch {
    return { symbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'] }
  }
}

async function getAlerts(risk: Risk): Promise<AlertsCheck | null> {
  try {
    const r = await fetch(`${API_BASE}/v1/alerts/check?risk=${risk}`, { cache: 'no-store' })
    if (!r.ok) return null
    return await r.json()
  } catch {
    return null
  }
}

async function getTrends(risk: Risk, symbols: string[]): Promise<Trend[]> {
  try {
    const csv = symbols.map((s) => s.replace('USDT', '')).join(',')
    const r = await fetch(`${API_BASE}/v1/trends?symbols=${csv}&risk=${risk}`, { cache: 'no-store' })
    if (!r.ok) return []
    return await r.json()
  } catch {
    return []
  }
}

async function getBacktests(lookback: number, risk: Risk, symbols: string[]): Promise<Backtest[]> {
  try {
    const csv = symbols.map((s) => s.replace('USDT', '')).join(',')
    const r = await fetch(`${API_BASE}/v1/backtest?symbols=${csv}&lookback=${lookback}&risk=${risk}`, { cache: 'no-store' })
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

async function getPortfolioSim(symbol: string, risk: Risk, lookback: number, capital: number): Promise<PortfolioSim | null> {
  try {
    const r = await fetch(
      `${API_BASE}/v1/portfolio/simulate/${symbol}?risk=${risk}&lookback=${lookback}&initial_capital=${capital}`,
      { cache: 'no-store' },
    )
    if (!r.ok) return null
    return await r.json()
  } catch {
    return null
  }
}

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`
}

function numberColor(v: number): string {
  if (v > 0) return '#22c55e'
  if (v < 0) return '#ef4444'
  return '#9ca3af'
}

function outlookPill(p: number) {
  if (p >= 0.56) return { label: 'Bullish', bg: 'rgba(34,197,94,0.18)', color: '#22c55e' }
  if (p <= 0.44) return { label: 'Bearish', bg: 'rgba(239,68,68,0.18)', color: '#ef4444' }
  return { label: 'Neutral', bg: 'rgba(148,163,184,0.2)', color: '#cbd5e1' }
}

function ConfidenceBar({ value }: { value: number }) {
  const width = Math.max(4, Math.min(100, value * 100))
  const color = value >= 0.56 ? '#22c55e' : value <= 0.44 ? '#ef4444' : '#60a5fa'
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>Confidence</div>
      <div style={{ height: 8, borderRadius: 999, background: 'rgba(148,163,184,.2)', overflow: 'hidden' }}>
        <div style={{ width: `${width}%`, height: '100%', background: color }} />
      </div>
    </div>
  )
}

function MiniTrendline({ data }: { data: EquityPoint[] }) {
  if (!data.length) return null
  const w = 220
  const h = 54
  const pad = 4
  const vals = data.map((d) => d.strategy)
  const minV = Math.min(...vals)
  const maxV = Math.max(...vals)
  const span = Math.max(0.0001, maxV - minV)
  const points = data.map((d, i) => {
    const x = pad + (i / Math.max(1, data.length - 1)) * (w - pad * 2)
    const y = h - pad - ((d.strategy - minV) / span) * (h - pad * 2)
    return `${x},${y}`
  }).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 54, marginTop: 8 }}>
      <polyline points={points} fill="none" stroke="#38bdf8" strokeWidth="2" />
    </svg>
  )
}

function EquityChart({ data }: { data: EquityPoint[] }) {
  if (!data.length) return <p style={{ color: '#94a3b8' }}>No chart data.</p>

  const w = 900
  const h = 260
  const pad = 26
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
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', border: '1px solid rgba(148,163,184,.25)', borderRadius: 12, background: 'linear-gradient(180deg,#0f172a,#020617)' }}>
      <polyline points={hold} fill="none" stroke="#64748b" strokeWidth="2" />
      <polyline points={strat} fill="none" stroke="#22c55e" strokeWidth="2.5" />
      <text x={18} y={20} fontSize="12" fill="#cbd5e1">Strategy (green) vs Buy & Hold (slate)</text>
    </svg>
  )
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ border: '1px solid rgba(148,163,184,.22)', borderRadius: 12, padding: 12, background: 'rgba(15,23,42,.55)' }}>
      <div style={{ fontSize: 12, color: '#94a3b8' }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: '#e2e8f0' }}>{value}</div>
      {sub ? <div style={{ fontSize: 12, color: '#94a3b8' }}>{sub}</div> : null}
    </div>
  )
}

export default async function Home({
  searchParams,
}: {
  searchParams?: { lookback?: string; risk?: string; capital?: string; addSymbol?: string; removeSymbol?: string }
}) {
  const lookback = Number(searchParams?.lookback || '240')
  const safeLookback = [120, 240, 360, 720].includes(lookback) ? lookback : 240
  const risk = (searchParams?.risk || 'moderate') as Risk
  const safeRisk: Risk = ['conservative', 'moderate', 'aggressive'].includes(risk) ? risk : 'moderate'
  const capital = Number(searchParams?.capital || '10000')
  const safeCapital = Number.isFinite(capital) && capital >= 100 ? capital : 10000

  await mutateWatchlist(searchParams?.addSymbol, searchParams?.removeSymbol)
  const watchlist = await getWatchlist()
  const symbols = watchlist.symbols.length ? watchlist.symbols : ['BTCUSDT', 'ETHUSDT', 'SOLUSDT']

  const [trends, backtests, explain, sim, alerts] = await Promise.all([
    getTrends(safeRisk, symbols),
    getBacktests(safeLookback, safeRisk, symbols),
    getExplain('BTC', safeRisk),
    getPortfolioSim('BTC', safeRisk, Math.max(240, safeLookback), safeCapital),
    getAlerts(safeRisk),
  ])

  const primary = backtests[0]
  const backtestBySymbol = new Map(backtests.map((b) => [b.symbol, b]))

  return (
    <main style={{
      minHeight: '100vh',
      padding: 24,
      fontFamily: 'Inter, ui-sans-serif, system-ui',
      background: 'radial-gradient(1200px 600px at 10% -10%, rgba(59,130,246,.25), transparent 55%), radial-gradient(800px 500px at 100% 0%, rgba(16,185,129,.2), transparent 45%), #020617',
      color: '#e2e8f0',
    }}>
      <div style={{ maxWidth: 1240, margin: '0 auto' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <p style={{ margin: 0, letterSpacing: '.08em', color: '#93c5fd', fontSize: 12, textTransform: 'uppercase' }}>Institutional-grade analytics</p>
            <h1 style={{ margin: '6px 0 8px', fontSize: 36 }}>Crypto Trend Intelligence</h1>
            <p style={{ margin: 0, color: '#94a3b8' }}>Professional signal terminal with backtests, risk controls, and execution simulation.</p>
          </div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>Live profile: <strong style={{ color: '#e2e8f0' }}>{safeRisk}</strong></div>
        </header>

        <section style={{ marginTop: 18, border: '1px solid rgba(148,163,184,.25)', borderRadius: 14, padding: 14, background: 'rgba(15,23,42,.5)', backdropFilter: 'blur(6px)' }}>
          <form style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end' }}>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ color: '#94a3b8', fontSize: 12 }}>Backtest Range</span>
              <select name="lookback" defaultValue={String(safeLookback)} style={inputStyle}>
                <option value="120">Last 120h</option>
                <option value="240">Last 240h</option>
                <option value="360">Last 360h</option>
                <option value="720">Last 720h</option>
              </select>
            </label>

            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ color: '#94a3b8', fontSize: 12 }}>Risk Profile</span>
              <select name="risk" defaultValue={safeRisk} style={inputStyle}>
                <option value="conservative">Conservative</option>
                <option value="moderate">Moderate</option>
                <option value="aggressive">Aggressive</option>
              </select>
            </label>

            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ color: '#94a3b8', fontSize: 12 }}>Capital</span>
              <input name="capital" type="number" min={100} step={100} defaultValue={safeCapital} style={inputStyle} />
            </label>

            <button type="submit" style={primaryButton}>Apply Settings</button>
          </form>
        </section>

        <section style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 10 }}>
          <Kpi label="Tracked Symbols" value={String(symbols.length)} sub={symbols.join(', ')} />
          <Kpi label="Backtest Window" value={`${safeLookback}h`} sub="rolling evaluation" />
          <Kpi label="Alert Flips" value={String(alerts?.flips.length ?? 0)} sub={alerts?.checked_at ? `last check ${new Date(alerts.checked_at).toLocaleTimeString()}` : 'n/a'} />
          <Kpi label="Portfolio PnL" value={sim ? pct(sim.pnl_pct) : 'n/a'} sub={sim ? `Final: $${sim.final_equity.toLocaleString()}` : 'simulator unavailable'} />
        </section>

        <section style={{ marginTop: 14, border: '1px solid rgba(148,163,184,.25)', borderRadius: 14, padding: 14, background: 'rgba(15,23,42,.5)' }}>
          <h2 style={h2}>Watchlist</h2>
          <p style={{ marginTop: 0, color: '#94a3b8' }}>{symbols.join(' • ')}</p>
          <form style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input name="addSymbol" placeholder="Add symbol (ADA, XRP, BNB...)" style={inputStyle} />
            <input type="hidden" name="lookback" value={safeLookback} />
            <input type="hidden" name="risk" value={safeRisk} />
            <input type="hidden" name="capital" value={safeCapital} />
            <button type="submit" style={primaryButton}>Add</button>
          </form>
          <div style={{ marginTop: 10, color: '#94a3b8', fontSize: 13 }}>
            Remove:&nbsp;
            {symbols.map((s) => (
              <a key={s} href={`?lookback=${safeLookback}&risk=${safeRisk}&capital=${safeCapital}&removeSymbol=${s.replace('USDT', '')}`} style={linkChip}>{s}</a>
            ))}
          </div>
        </section>

        <section style={{ marginTop: 14, border: '1px solid rgba(148,163,184,.25)', borderRadius: 14, padding: 14, background: 'rgba(15,23,42,.5)' }}>
          <h2 style={h2}>Signal Flip Alerts</h2>
          {!alerts ? <p style={{ color: '#94a3b8' }}>Alerts unavailable.</p> : alerts.flips.length === 0 ? <p style={{ color: '#94a3b8' }}>No flips detected on this check.</p> : (
            <ul>
              {alerts.flips.map((f) => (
                <li key={f.symbol}><strong>{f.symbol}</strong>: {f.from_outlook} → {f.to_outlook} ({pct(f.up_probability)})</li>
              ))}
            </ul>
          )}
        </section>

        {trends.length === 0 ? (
          <p style={{ color: '#fda4af' }}>
            API not reachable yet. Start backend: <code>uvicorn services.api.app.main:app --reload --port 8000</code>
          </p>
        ) : (
          <section style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 12 }}>
            {trends.map((t) => {
              const pill = outlookPill(t.up_probability)
              const bt = backtestBySymbol.get(t.symbol)
              return (
                <article key={t.symbol} style={{ border: '1px solid rgba(148,163,184,.25)', borderRadius: 14, padding: 14, background: 'linear-gradient(180deg, rgba(15,23,42,.75), rgba(2,6,23,.9))' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0 }}>{t.symbol}</h3>
                    <span style={{ padding: '4px 8px', borderRadius: 999, background: pill.bg, color: pill.color, fontSize: 12, fontWeight: 600 }}>{pill.label}</span>
                  </div>
                  <p style={{ margin: '8px 0', fontSize: 28, fontWeight: 700 }}>{pct(t.up_probability)}</p>
                  <p style={{ margin: '4px 0', color: '#94a3b8' }}><strong style={{ color: '#cbd5e1' }}>Momentum:</strong> {t.momentum_score.toFixed(3)}</p>
                  <p style={{ margin: '4px 0', color: '#94a3b8' }}><strong style={{ color: '#cbd5e1' }}>Volatility:</strong> {t.volatility_regime}</p>
                  {bt ? <p style={{ margin: '4px 0', color: '#94a3b8' }}><strong style={{ color: '#cbd5e1' }}>Alpha:</strong> <span style={{ color: numberColor(bt.alpha_vs_buy_hold) }}>{pct(bt.alpha_vs_buy_hold)}</span></p> : null}
                  {bt ? <MiniTrendline data={bt.equity_curve} /> : null}
                  <ConfidenceBar value={t.up_probability} />
                  <p style={{ marginTop: 10, color: '#94a3b8', fontSize: 13 }}>{t.explanation}</p>
                </article>
              )
            })}
          </section>
        )}

        <section style={{ marginTop: 14, border: '1px solid rgba(148,163,184,.25)', borderRadius: 14, padding: 14, background: 'rgba(15,23,42,.5)' }}>
          <h2 style={h2}>AI Explanation (BTC)</h2>
          {!explain ? (
            <p style={{ color: '#94a3b8' }}>Explanation unavailable.</p>
          ) : (
            <>
              <p><strong>Outlook:</strong> {explain.outlook} <span style={{ color: '#94a3b8' }}>({pct(explain.confidence)} confidence)</span></p>
              <p style={{ color: '#cbd5e1' }}>{explain.summary}</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 12 }}>
                <div>
                  <p style={{ marginBottom: 6 }}><strong>Drivers</strong></p>
                  <ul>{explain.drivers.map((d, i) => <li key={i}>{d}</li>)}</ul>
                </div>
                <div>
                  <p style={{ marginBottom: 6 }}><strong>Cautions</strong></p>
                  <ul>{explain.caution.map((d, i) => <li key={i}>{d}</li>)}</ul>
                </div>
              </div>
            </>
          )}
        </section>

        <section style={{ marginTop: 14, border: '1px solid rgba(148,163,184,.25)', borderRadius: 14, padding: 14, background: 'rgba(15,23,42,.5)' }}>
          <h2 style={h2}>Portfolio Simulator (BTC)</h2>
          {!sim ? (
            <p style={{ color: '#94a3b8' }}>Simulator unavailable.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10 }}>
              <Kpi label="Capital" value={`$${sim.initial_capital.toLocaleString()}`} />
              <Kpi label="Position Size" value={pct(sim.position_size_pct)} />
              <Kpi label="Stop Loss" value={pct(sim.stop_loss_pct)} />
              <Kpi label="Take Profit" value={pct(sim.take_profit_pct)} />
              <Kpi label="Trades" value={String(sim.trades)} />
              <Kpi label="Win Rate" value={pct(sim.win_rate)} />
              <Kpi label="PnL" value={pct(sim.pnl_pct)} sub={`Max DD ${pct(sim.max_drawdown)}`} />
            </div>
          )}
        </section>

        <section style={{ marginTop: 14, border: '1px solid rgba(148,163,184,.25)', borderRadius: 14, padding: 14, background: 'rgba(15,23,42,.5)' }}>
          <h2 style={h2}>Backtest Summary</h2>
          {backtests.length === 0 ? (
            <p style={{ color: '#94a3b8' }}>Backtests unavailable.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(148,163,184,.3)' }}>
                    <th align="left" style={th}>Symbol</th>
                    <th align="right" style={th}>Accuracy</th>
                    <th align="right" style={th}>Strategy</th>
                    <th align="right" style={th}>Buy&Hold</th>
                    <th align="right" style={th}>Alpha</th>
                    <th align="right" style={th}>Max DD</th>
                  </tr>
                </thead>
                <tbody>
                  {backtests.map((b) => (
                    <tr key={b.symbol} style={{ borderBottom: '1px solid rgba(148,163,184,.15)' }}>
                      <td style={td}>{b.symbol}</td>
                      <td align="right" style={td}>{pct(b.signal_accuracy)}</td>
                      <td align="right" style={{ ...td, color: numberColor(b.strategy_return) }}>{pct(b.strategy_return)}</td>
                      <td align="right" style={{ ...td, color: numberColor(b.buy_hold_return) }}>{pct(b.buy_hold_return)}</td>
                      <td align="right" style={{ ...td, color: numberColor(b.alpha_vs_buy_hold) }}>{pct(b.alpha_vs_buy_hold)}</td>
                      <td align="right" style={{ ...td, color: '#fda4af' }}>{pct(b.max_drawdown)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section style={{ marginTop: 14, border: '1px solid rgba(148,163,184,.25)', borderRadius: 14, padding: 14, background: 'rgba(15,23,42,.5)' }}>
          <h2 style={h2}>Equity Curve ({primary?.symbol || 'N/A'})</h2>
          {primary ? (
            <>
              <p style={{ marginTop: 0, color: '#94a3b8' }}>{primary.start_time} → {primary.end_time}</p>
              <EquityChart data={primary.equity_curve} />
            </>
          ) : (
            <p style={{ color: '#94a3b8' }}>No curve available.</p>
          )}
        </section>

        <footer style={{ marginTop: 16, padding: '12px 4px', color: '#64748b', fontSize: 12, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <span>Crypto Trend Intelligence • Quant Research Desk</span>
          <span>Signals are probabilistic and not financial advice.</span>
        </footer>
      </div>
    </main>
  )
}

const h2: CSSProperties = { marginTop: 0, marginBottom: 10, fontSize: 20 }
const th: CSSProperties = { padding: '10px 8px', color: '#94a3b8', fontSize: 12, textTransform: 'uppercase', letterSpacing: '.05em' }
const td: CSSProperties = { padding: '10px 8px', color: '#e2e8f0', fontSize: 14 }
const inputStyle: CSSProperties = {
  background: 'rgba(2,6,23,.75)',
  color: '#e2e8f0',
  border: '1px solid rgba(148,163,184,.3)',
  borderRadius: 10,
  padding: '10px 12px',
}
const primaryButton: CSSProperties = {
  background: 'linear-gradient(135deg,#2563eb,#0ea5e9)',
  color: 'white',
  border: 0,
  borderRadius: 10,
  padding: '10px 14px',
  fontWeight: 600,
  cursor: 'pointer',
}
const linkChip: CSSProperties = {
  display: 'inline-block',
  marginRight: 8,
  marginBottom: 6,
  padding: '4px 8px',
  borderRadius: 999,
  border: '1px solid rgba(148,163,184,.35)',
  color: '#93c5fd',
  textDecoration: 'none',
  fontSize: 12,
}
