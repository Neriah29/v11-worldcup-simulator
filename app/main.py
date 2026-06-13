from fastapi import FastAPI, HTTPException
from contextlib import asynccontextmanager
from fastapi.middleware.cors import CORSMiddleware
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