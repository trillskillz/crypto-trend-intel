from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="Crypto Trend API", version="0.1.0")

class TrendResponse(BaseModel):
    symbol: str
    horizon: str
    up_probability: float
    momentum_score: float
    volatility_regime: str
    explanation: str

@app.get('/health')
def health():
    return {'ok': True}

@app.get('/v1/trends/{symbol}', response_model=TrendResponse)
def trend(symbol: str):
    return TrendResponse(
        symbol=symbol.upper(),
        horizon='24h',
        up_probability=0.57,
        momentum_score=0.21,
        volatility_regime='medium',
        explanation='Initial baseline signal from placeholder model.'
    )
