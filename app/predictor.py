import numpy as np
import pandas as pd
from pathlib import Path
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split

from football_ml.supervised_learning.logistic_regression import LogisticRegression

# ── paths ──────────────────────────────────────────────────────────────────
DATA_PATH = Path(__file__).parent / "data" / "results.csv"

# ── these will be filled on startup ────────────────────────────────────────
model = None
scaler = None
team_latest_stats = {}

FEATURE_COLS = [
    'home_goals_rolling', 'away_goals_rolling',
    'home_conceded_rolling', 'away_conceded_rolling',
    'home_win_rate', 'away_win_rate',
    'neutral'
]

def train():
    global model, scaler, team_latest_stats

    # 1. load
    df = pd.read_csv(DATA_PATH)
    df['date'] = pd.to_datetime(df['date'])
    df = df.sort_values('date').reset_index(drop=True)
    df['home_win'] = (df['home_score'] > df['away_score']).astype(int)

    # 2. feature engineering (your exact notebook code)
    def compute_team_rolling_stats(df, window=10):
        home_log = df[['date', 'home_team', 'home_score', 'away_score']].copy()
        home_log.columns = ['date', 'team', 'scored', 'conceded']
        away_log = df[['date', 'away_team', 'away_score', 'home_score']].copy()
        away_log.columns = ['date', 'team', 'scored', 'conceded']
        team_log = pd.concat([home_log, away_log]).sort_values('date').reset_index(drop=True)
        team_log['rolling_scored'] = (
            team_log.groupby('team')['scored']
            .transform(lambda x: x.shift(1).rolling(window, min_periods=1).mean())
        )
        team_log['rolling_conceded'] = (
            team_log.groupby('team')['conceded']
            .transform(lambda x: x.shift(1).rolling(window, min_periods=1).mean())
        )
        return team_log.drop_duplicates(subset=['date', 'team'], keep='last').set_index(['date', 'team'])

    team_stats = compute_team_rolling_stats(df)

    def get_stat(row, team_col, stat_col):
        try:
            return team_stats.loc[(row['date'], row[team_col]), stat_col]
        except KeyError:
            return np.nan

    df['home_goals_rolling']    = df.apply(lambda r: get_stat(r, 'home_team', 'rolling_scored'), axis=1)
    df['home_conceded_rolling'] = df.apply(lambda r: get_stat(r, 'home_team', 'rolling_conceded'), axis=1)
    df['away_goals_rolling']    = df.apply(lambda r: get_stat(r, 'away_team', 'rolling_scored'), axis=1)
    df['away_conceded_rolling'] = df.apply(lambda r: get_stat(r, 'away_team', 'rolling_conceded'), axis=1)

    home_wins = df.groupby('home_team').apply(lambda g: (g['home_score'] > g['away_score']).mean()).rename('home_win_rate')
    away_wins = df.groupby('away_team').apply(lambda g: (g['away_score'] > g['home_score']).mean()).rename('away_win_rate')
    df = df.join(home_wins, on='home_team').join(away_wins, on='away_team')
    df['neutral'] = df['neutral'].astype(int)

    # 3. save each team's most recent stats for prediction lookup
    df_clean = df[FEATURE_COLS + ['home_win', 'home_team', 'away_team']].dropna()

    for _, row in df_clean.iterrows():
        team_latest_stats[row['home_team']] = {
            'goals_rolling': row['home_goals_rolling'],
            'conceded_rolling': row['home_conceded_rolling'],
            'win_rate': row['home_win_rate'],
        }
        team_latest_stats[row['away_team']] = {
            'goals_rolling': row['away_goals_rolling'],
            'conceded_rolling': row['away_conceded_rolling'],
            'win_rate': row['away_win_rate'],
        }

    # 4. train
    X = df_clean[FEATURE_COLS].values
    y = df_clean['home_win'].values
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    scaler = StandardScaler()
    X_train_sc = scaler.fit_transform(X_train)

    model = LogisticRegression(learning_rate=0.1, n_epochs=1000)
    model.fit(X_train_sc, y_train)

    print(f"Model trained. {len(team_latest_stats)} teams in lookup.")


def predict(home_team: str, away_team: str):
    if home_team not in team_latest_stats:
        raise ValueError(f"Unknown team: {home_team}")
    if away_team not in team_latest_stats:
        raise ValueError(f"Unknown team: {away_team}")

    h = team_latest_stats[home_team]
    a = team_latest_stats[away_team]

    features = np.array([[
        h['goals_rolling'],
        a['goals_rolling'],
        h['conceded_rolling'],
        a['conceded_rolling'],
        h['win_rate'],
        a['win_rate'],
        0  # neutral ground — default false
    ]])

    features_scaled = scaler.transform(features)
    prob_home_win = model.predict_proba(features_scaled)[0]

    return {
        "home_team": home_team,
        "away_team": away_team,
        "home_win_probability": round(float(prob_home_win), 3),
        "away_win_probability": round(float(1 - prob_home_win), 3),
        "predicted_winner": home_team if prob_home_win > 0.5 else away_team
    }