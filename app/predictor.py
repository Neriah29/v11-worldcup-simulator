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

DATA_PATH    = Path(__file__).parent / "data" / "results.csv"
RANKING_PATH = Path(__file__).parent / "data" / "fifa_ranking_24.csv"

# Global state
models = {}
scaler = None
team_latest_stats = {}

# --- UPDATED: 10 features now instead of 7 ---
FEATURE_COLS = [
    'home_goals_rolling',
    'away_goals_rolling',
    'home_conceded_rolling',
    'away_conceded_rolling',
    'home_win_rate',
    'away_win_rate',
    'neutral',
    'rank_diff',       # NEW: home_rank - away_rank (negative = home team is better)
    'points_diff',     # NEW: home_points - away_points (more granular than rank)
    'same_conf',       # NEW: 1 if both teams are from the same confederation
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


def _load_rankings():
    """
    Load FIFA rankings and build a lookup structure.

    The rankings file has one row per team per ranking date (quarterly snapshots).
    For each match, we want the ranking that was active ON or BEFORE that match date.
    We do this with a technique called an "as-of join" (also called merge_asof).

    Returns a DataFrame sorted by rank_date, ready for merging.
    """
    ranking = pd.read_csv(RANKING_PATH)
    ranking['rank_date'] = pd.to_datetime(ranking['rank_date'])

    # Keep only the columns we need
    ranking = ranking[['rank_date', 'country_full', 'rank', 'total_points', 'confederation']]
    ranking = ranking.sort_values('rank_date').reset_index(drop=True)
    return ranking


def _add_ranking_features(df, ranking):
    """
    For each match in df, look up the FIFA ranking for both teams
    that was active on or before the match date.

    Think of it like this: if a match was played on 2018-06-15,
    we want the ranking published on 2018-06-14 or earlier — not
    a future ranking the model couldn't have known about.

    Teams with no ranking data (pre-1992 or unranked nations) get
    NaN, which we fill with a neutral fallback later.
    """
    # We'll merge rankings twice — once for home team, once for away team
    results = []

    for _, match in df.iterrows():
        match_date = match['date']

        # Get the most recent ranking for home team on/before match date
        home_rows = ranking[
            (ranking['country_full'] == match['home_team']) &
            (ranking['rank_date'] <= match_date)
        ]
        away_rows = ranking[
            (ranking['country_full'] == match['away_team']) &
            (ranking['rank_date'] <= match_date)
        ]

        if not home_rows.empty:
            home_latest = home_rows.iloc[-1]
            home_rank   = home_latest['rank']
            home_points = home_latest['total_points']
            home_conf   = home_latest['confederation']
        else:
            home_rank   = np.nan
            home_points = np.nan
            home_conf   = None

        if not away_rows.empty:
            away_latest = away_rows.iloc[-1]
            away_rank   = away_latest['rank']
            away_points = away_latest['total_points']
            away_conf   = away_latest['confederation']
        else:
            away_rank   = np.nan
            away_points = np.nan
            away_conf   = None

        results.append({
            'home_rank':   home_rank,
            'home_points': home_points,
            'home_conf':   home_conf,
            'away_rank':   away_rank,
            'away_points': away_points,
            'away_conf':   away_conf,
        })

    rank_df = pd.DataFrame(results, index=df.index)
    df = pd.concat([df, rank_df], axis=1)

    # --- Compute the three new features ---

    # rank_diff: positive means home team is WORSE ranked (higher number = worse)
    # negative means home team is BETTER ranked
    df['rank_diff']   = df['home_rank'] - df['away_rank']

    # points_diff: positive means home team has MORE points (better)
    df['points_diff'] = df['home_points'] - df['away_points']

    # same_conf: 1 if both teams are from the same confederation
    # e.g. Germany vs France = 1 (both UEFA), Brazil vs Argentina = 1 (both CONMEBOL)
    # Brazil vs Germany = 0 (CONMEBOL vs UEFA)
    df['same_conf'] = (
        (df['home_conf'].notna()) &
        (df['away_conf'].notna()) &
        (df['home_conf'] == df['away_conf'])
    ).astype(int)

    return df


def train():
    global models, scaler, team_latest_stats

    # 1. Load match data
    df = pd.read_csv(DATA_PATH)
    df['date'] = pd.to_datetime(df['date'])
    df = df.sort_values('date').reset_index(drop=True)
    df['home_win'] = (df['home_score'] > df['away_score']).astype(int)

    # 2. Load rankings
    print("Loading FIFA rankings...")
    ranking = _load_rankings()

    # 3. Rolling stats (same as before)
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

    # 4. Add ranking features
    print("Joining ranking data to matches...")
    df = _add_ranking_features(df, ranking)

    # 5. Fill NaN ranking values for pre-1992 matches
    # We use the median rank/points as a neutral fallback so those rows
    # still contribute to training, just without ranking signal
    median_rank   = df['rank_diff'].median()
    median_points = df['points_diff'].median()
    df['rank_diff']   = df['rank_diff'].fillna(median_rank)
    df['points_diff'] = df['points_diff'].fillna(median_points)
    # same_conf is already 0 for unranked teams (handled above)

    # 6. Save team latest stats (now includes ranking info)
    df_clean = df[FEATURE_COLS + ['home_win', 'home_team', 'away_team',
                                   'home_rank', 'home_points', 'home_conf',
                                   'away_rank', 'away_points', 'away_conf']].dropna(
        subset=['home_goals_rolling', 'away_goals_rolling',
                'home_conceded_rolling', 'away_conceded_rolling']
    )

    for _, row in df_clean.iterrows():
        team_latest_stats[row['home_team']] = {
            'goals_rolling':    row['home_goals_rolling'],
            'conceded_rolling': row['home_conceded_rolling'],
            'win_rate':         row['home_win_rate'],
            'rank':             row['home_rank'],
            'points':           row['home_points'],
            'conf':             row['home_conf'],
        }
        team_latest_stats[row['away_team']] = {
            'goals_rolling':    row['away_goals_rolling'],
            'conceded_rolling': row['away_conceded_rolling'],
            'win_rate':         row['away_win_rate'],
            'rank':             row['away_rank'],
            'points':           row['away_points'],
            'conf':             row['away_conf'],
        }

    # 7. Prepare training data
    X = df_clean[FEATURE_COLS].values
    y = df_clean['home_win'].values
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42
    )

    scaler = StandardScaler()
    X_train_sc = scaler.fit_transform(X_train)

    # 8. Train available models
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

    # Compute ranking features at prediction time
    h_rank   = h.get('rank',   np.nan)
    a_rank   = a.get('rank',   np.nan)
    h_points = h.get('points', np.nan)
    a_points = a.get('points', np.nan)
    h_conf   = h.get('conf',   None)
    a_conf   = a.get('conf',   None)

    rank_diff   = (h_rank - a_rank)     if not (np.isnan(h_rank)   or np.isnan(a_rank))   else 0.0
    points_diff = (h_points - a_points) if not (np.isnan(h_points) or np.isnan(a_points)) else 0.0
    same_conf   = 1 if (h_conf and a_conf and h_conf == a_conf) else 0

    features = np.array([[
        h['goals_rolling'],
        a['goals_rolling'],
        h['conceded_rolling'],
        a['conceded_rolling'],
        h['win_rate'],
        a['win_rate'],
        0,            # neutral — hardcoded for now, toggle coming soon
        rank_diff,
        points_diff,
        same_conf,
    ]])

    features_scaled = scaler.transform(features)
    model = models[model_key]

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