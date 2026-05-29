import numpy as np
import pandas as pd
from pathlib import Path
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split

from football_ml.supervised_learning.logistic_regression import LogisticRegression
from football_ml.supervised_learning.knn import KNNClassifier
from football_ml.supervised_learning.mlp import MLP
from football_ml.supervised_learning.decision_tree import DecisionTreeClassifier
from football_ml.supervised_learning.naive_bayes import GaussianNaiveBayes
from football_ml.supervised_learning.svm import SVM
from football_ml.supervised_learning.perceptron import Perceptron

DATA_PATH = Path(__file__).parent / "data" / "results.csv"

# Global state
models = {}
scaler = None
team_latest_stats = {}

FEATURE_COLS = [
    'home_goals_rolling', 'away_goals_rolling',
    'home_conceded_rolling', 'away_conceded_rolling',
    'home_win_rate', 'away_win_rate',
    'neutral'
]

MODEL_CONFIGS = {
    "logistic_regression": {
        "label": "Logistic Regression",
        "badge": "Most Accurate",
        "available": True,
        "instance": lambda: LogisticRegression(learning_rate=0.1, n_epochs=1000)
    },
    "knn": {
        "label": "K-Nearest Neighbors",
        "badge": "Classic",
        "available": True,
        "instance": lambda: KNNClassifier(k=10)
    },
    "decision_tree": {
        "label": "Decision Tree",
        "badge": "Interpretable",
        "available": True,
        "instance": lambda: DecisionTreeClassifier()
    },
    "naive_bayes": {
        "label": "Naive Bayes",
        "badge": "Fastest",
        "available": True,
        "instance": lambda: GaussianNaiveBayes()
    },
    "perceptron": {
        "label": "Perceptron",
        "badge": "Foundational",
        "available": True,
        "instance": lambda: Perceptron()
    },
    "mlp": {
        "label": "Neural Network (MLP)",
        "badge": "Coming Soon",
        "available": False,
        "instance": None
    },
    "svm": {
        "label": "Support Vector Machine",
        "badge": "Coming Soon",
        "available": False,
        "instance": None
    },
}
def train():
    global models, scaler, team_latest_stats

    # 1. Load
    df = pd.read_csv(DATA_PATH)
    df['date'] = pd.to_datetime(df['date'])
    df = df.sort_values('date').reset_index(drop=True)
    df['home_win'] = (df['home_score'] > df['away_score']).astype(int)

    # 2. Feature engineering
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

    home_wins = df.groupby('home_team').apply(
        lambda g: (g['home_score'] > g['away_score']).mean()
    ).rename('home_win_rate')
    away_wins = df.groupby('away_team').apply(
        lambda g: (g['away_score'] > g['home_score']).mean()
    ).rename('away_win_rate')
    df = df.join(home_wins, on='home_team').join(away_wins, on='away_team')
    df['neutral'] = df['neutral'].astype(int)

    # 3. Save team latest stats
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

    # 4. Prepare data
    X = df_clean[FEATURE_COLS].values
    y = df_clean['home_win'].values
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42
    )

    scaler = StandardScaler()
    X_train_sc = scaler.fit_transform(X_train)

# 5. Train available models only
    for key, config in MODEL_CONFIGS.items():
        if not config["available"]:
            print(f"Skipping {config['label']} (coming soon)")
            continue
        print(f"Training {config['label']}...")
        m = config['instance']()
        m.fit(X_train_sc, y_train)
        models[key] = m
        print(f"  ✓ {config['label']} ready")

    print(f"\nAll models trained. {len(team_latest_stats)} teams available.")


def predict(home_team: str, away_team: str, model_key: str = "logistic_regression"):
    if home_team not in team_latest_stats:
        raise ValueError(f"Unknown team: {home_team}")
    if away_team not in team_latest_stats:
        raise ValueError(f"Unknown team: {away_team}")
    if model_key not in models:
        raise ValueError(f"Unknown model: {model_key}")

    h = team_latest_stats[home_team]
    a = team_latest_stats[away_team]

    features = np.array([[
        h['goals_rolling'],
        a['goals_rolling'],
        h['conceded_rolling'],
        a['conceded_rolling'],
        h['win_rate'],
        a['win_rate'],
        0
    ]])

    features_scaled = scaler.transform(features)
    model = models[model_key]

    # Perceptron only has predict(), not predict_proba()
    if model_key == "perceptron":
        pred = model.predict(features_scaled)[0]
        prob = float(pred)
    else:
        prob = float(model.predict_proba(features_scaled)[0])

    return {
        "home_team": home_team,
        "away_team": away_team,
        "model": model_key,
        "model_label": MODEL_CONFIGS[model_key]["label"],
        "home_win_probability": round(prob, 3),
        "away_win_probability": round(1 - prob, 3),
        "predicted_winner": home_team if prob > 0.5 else away_team
    }


def get_models():
    return [
        {
            "key": key,
            "label": config["label"],
            "badge": config["badge"],
            "available": config["available"]
        }
        for key, config in MODEL_CONFIGS.items()
    ]