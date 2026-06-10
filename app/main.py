from fastapi import FastAPI, HTTPException
from contextlib import asynccontextmanager
from fastapi.middleware.cors import CORSMiddleware
from app import predictor

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
        "https://v11-worldcup.vercel.app"
    ],
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
    try:
        result = predictor.predict(home_team, away_team, model, neutral)
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@app.get("/teams")
def teams():
    teams = sorted(predictor.team_latest_stats.keys())
    return {"teams": teams}