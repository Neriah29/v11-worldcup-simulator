import json
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import StreamingResponse
from contextlib import asynccontextmanager
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional
from app import predictor
from app import tournament as tour
from app.data.wc2026_groups import GROUPS

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
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def home():
    return {"message": "World Cup Simulator API is running"}

@app.get("/status")
def status():
    return {"trained_at": predictor.trained_at}

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
def tournament_simulate(
    model: str = "logistic_regression",
    groups: Optional[str] = Query(default=None),
):
    """
    Simulate the full WC 2026 tournament. Optional ?groups=<JSON-encoded dict>
    for custom group assignments. Accepts GET to avoid CORS preflight.
    """
    if model not in predictor.models:
        raise HTTPException(status_code=400, detail=f"Unknown model: {model}")
    parsed_groups = None
    if groups:
        try:
            parsed_groups = json.loads(groups)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid groups JSON")
    try:
        result = tour.simulate_tournament(groups=parsed_groups, model_key=model)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/elo")
def elo_rankings():
    """Return all teams sorted by Elo rating descending."""
    wc_teams = set()
    for teams_list in GROUPS.values():
        wc_teams.update(teams_list)

    ranked = sorted(
        [
            {
                "team": t,
                "elo": round(float(s.get("elo", 1500)), 1),
                "in_wc2026": t in wc_teams,
            }
            for t, s in predictor.team_latest_stats.items()
        ],
        key=lambda x: -x["elo"],
    )
    for i, t in enumerate(ranked):
        t["rank"] = i + 1
    return {"teams": ranked}


