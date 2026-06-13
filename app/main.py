from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from contextlib import asynccontextmanager
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from app import predictor
from app import tournament as tour
from app.data.wc2026_groups import GROUPS


class SimulateRequest(BaseModel):
    model: str = "logistic_regression"
    groups: Optional[dict] = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    if not predictor.load():
        print("No saved models found — training from scratch...")
        predictor.train()
        predictor.save()
    else:
        print("Pre-trained models loaded successfully.")
    yield

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://v11-worldcup.vercel.app",
    ],
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def home():
    return {"message": "World Cup Simulator API is running"}

@app.get("/models")
def list_models():
    return {"models": predictor.get_models()}


@app.get("/predict")
def predict(home_team: str, away_team: str, model: str = "logistic_regression", neutral: int = 0):
    print(f"Predict called: {home_team} vs {away_team}, neutral={neutral}")
    try:
        result = predictor.predict(home_team, away_team, model, neutral)
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@app.get("/teams")
def teams():
    teams = sorted(predictor.team_latest_stats.keys())
    return {"teams": teams}


@app.get("/tournament/groups")
def tournament_groups():
    """Return the official WC 2026 group draw."""
    return {"groups": GROUPS}


@app.get("/tournament/monte_carlo/stream")
def tournament_monte_carlo_stream(runs: int = 500, model: str = "logistic_regression"):
    """SSE stream: yields cumulative stats after every batch of simulations."""
    if model not in predictor.models:
        raise HTTPException(status_code=400, detail=f"Unknown model: {model}")
    runs = max(1, min(runs, 10_000))
    return StreamingResponse(
        tour.monte_carlo_stream(runs=runs, model_key=model),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",   # prevent nginx/Railway proxy buffering
        },
    )


@app.get("/tournament/monte_carlo")
def tournament_monte_carlo(runs: int = 100, model: str = "logistic_regression"):
    """Run the tournament N times (max 10 000) and return aggregated win statistics."""
    if model not in predictor.models:
        raise HTTPException(status_code=400, detail=f"Unknown model: {model}")
    runs = max(1, min(runs, 10_000))
    try:
        result = tour.monte_carlo(runs=runs, model_key=model)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/tournament/simulate")
def tournament_simulate(model: str = "logistic_regression"):
    """
    Simulate the full WC 2026 tournament and return all results in one shot.
    The frontend uses this data to drive the animated bracket replay.
    """
    if model not in predictor.models:
        raise HTTPException(status_code=400, detail=f"Unknown model: {model}")
    try:
        result = tour.simulate_tournament(groups=None, model_key=model)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/tournament/simulate")
def tournament_simulate_post(req: SimulateRequest):
    """
    Simulate with optional custom group assignments.
    Body: { "model": str, "groups": { "A": ["Team1", ...], ... } | null }
    """
    if req.model not in predictor.models:
        raise HTTPException(status_code=400, detail=f"Unknown model: {req.model}")
    try:
        result = tour.simulate_tournament(groups=req.groups, model_key=req.model)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))