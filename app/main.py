from fastapi import FastAPI, HTTPException
from contextlib import asynccontextmanager
from fastapi.middleware.cors import CORSMiddleware
from app import predictor

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Starting up — training model...")
    predictor.train()
    print("Model ready.")
    yield

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def home():
    return {"message": "World Cup Simulator API is running"}

@app.get("/predict")
def predict(home_team: str, away_team: str):
    try:
        result = predictor.predict(home_team, away_team)
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@app.get("/teams")
def teams():
    teams = sorted(predictor.team_latest_stats.keys())
    return {"teams": teams}