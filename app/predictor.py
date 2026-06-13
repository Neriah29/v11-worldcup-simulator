import numpy as np
import pandas as pd
import pickle
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
MODELS_PATH  = Path(__file__).parent / "data" / "trained_models.pkl"

# ─── Global state ────────────────────────────────────────────────────────────
models            = {}
scaler            = None
team_latest_stats = {}

# ─── Tournament importance weights ───────────────────────────────────────────
# Higher weight = this tournament type carries more signal.
# A World Cup match tells us far more than a Friendly with a rotated squad.
TOURNAMENT_WEIGHTS = {
    "FIFA World Cup":               1.0,
    "Confederations Cup":           0.85,
    "UEFA Euro":                    0.85,
    "Copa América":                 0.85,
    "AFC Asian Cup":                0.80,
    "Africa Cup of Nations":        0.80,
    "CONCACAF Gold Cup":            0.75,
    "UEFA Nations League":          0.75,
    "FIFA World Cup qualification": 0.70,
    "Friendly":                     0.30,
}
DEFAULT_TOURNAMENT_WEIGHT = 0.50

# ─── Feature columns — 21 features total ─────────────────────────────────────
FEATURE_COLS = [
    # Rolling form stats (exponential decay weighted)
    'home_goals_rolling',
    'away_goals_rolling',
    'home_conceded_rolling',
    'away_conceded_rolling',

    # Win rates split by home/away context
    'home_win_rate_home',    # how often home team wins when AT HOME
    'away_win_rate_away',    # how often away team wins when AWAY

    # Neutral ground
    'neutral',

    # FIFA ranking features
    'rank_diff',
    'points_diff',
    'same_conf',

    # Elo ratings — single strongest signal
    'home_elo',
    'away_elo',
    'elo_diff',

    # Goal difference rolling (margin of victory signal)
    'home_gd_rolling',
    'away_gd_rolling',

    # Momentum/streak
    'home_streak',
    'away_streak',

    # Defensive quality
    'home_clean_sheet_rate',
    'away_clean_sheet_rate',

    # Fatigue/rest
    'home_days_rest',
    'away_days_rest',

    # Head-to-head
    'h2h_home_win_rate',
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
        "badge": "",
        "available": True,
        "instance": lambda: KNNClassifier(k=10)
    },
    "decision_tree": {
        "label": "Decision Tree",
        "badge": "",
        "available": True,
        "instance": lambda: DecisionTreeClassifier()
    },
    "naive_bayes": {
        "label": "Naive Bayes",
        "badge": "",
        "available": True,
        "instance": lambda: GaussianNaiveBayes()
    },
    "perceptron": {
        "label": "Perceptron",
        "badge": "",
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


# ─────────────────────────────────────────────────────────────────────────────
# ELO COMPUTATION
# ─────────────────────────────────────────────────────────────────────────────

def _compute_elo(df, k=30, initial=1500):
    """
    Compute Elo ratings for every team across every match in history.

    How Elo works:
    - Every team starts at 1500 (the global average)
    - After each match, ratings update based on ACTUAL vs EXPECTED result
    - Beat a strong team -> gain lots of points
    - Lose to a weak team -> lose lots of points
    - K factor (30) controls how fast ratings shift
    - Tournament weight means World Cup matches update ratings more than Friendlies

    We record each team's rating BEFORE the match so the model only
    sees information that was available at prediction time (no leakage).
    """
    elo_ratings = {}
    home_elos, away_elos = [], []

    for _, row in df.iterrows():
        home = row['home_team']
        away = row['away_team']

        if home not in elo_ratings:
            elo_ratings[home] = initial
        if away not in elo_ratings:
            elo_ratings[away] = initial

        r_home = elo_ratings[home]
        r_away = elo_ratings[away]

        home_elos.append(r_home)
        away_elos.append(r_away)

        # Expected home win probability (Elo logistic curve)
        expected_home = 1 / (1 + 10 ** ((r_away - r_home) / 400))

        # Actual result
        if row['home_score'] > row['away_score']:
            actual_home = 1.0
        elif row['home_score'] == row['away_score']:
            actual_home = 0.5
        else:
            actual_home = 0.0

        # Tournament weight
        t_weight = TOURNAMENT_WEIGHTS.get(row['tournament'], DEFAULT_TOURNAMENT_WEIGHT)

        # Update — zero sum, one gains what the other loses
        change = k * t_weight * (actual_home - expected_home)
        elo_ratings[home] = r_home + change
        elo_ratings[away] = r_away - change

    df = df.copy()
    df['home_elo'] = home_elos
    df['away_elo'] = away_elos
    df['elo_diff'] = df['home_elo'] - df['away_elo']

    return df, elo_ratings


# ─────────────────────────────────────────────────────────────────────────────
# ROLLING STATS WITH EXPONENTIAL DECAY
# ─────────────────────────────────────────────────────────────────────────────

def _compute_rolling_stats(df, window=10):
    """
    Compute per-team rolling stats using exponential decay weighting.

    Exponential decay: last week's match counts more than 18 months ago.
    shift(1) ensures we only use PAST matches — no data leakage.

    Stats computed:
    - rolling goals scored/conceded (exponential decay)
    - rolling goal difference
    - clean sheet rate
    - win/draw/loss streak
    - home-specific win rate
    - away-specific win rate
    - days since last match (rest/fatigue)
    """
    home_log = df[['date', 'home_team', 'home_score', 'away_score']].copy()
    home_log.columns = ['date', 'team', 'scored', 'conceded']
    home_log['is_home'] = True

    away_log = df[['date', 'away_team', 'away_score', 'home_score']].copy()
    away_log.columns = ['date', 'team', 'scored', 'conceded']
    away_log['is_home'] = False

    team_log = pd.concat([home_log, away_log]).sort_values('date').reset_index(drop=True)
    team_log['gd']          = team_log['scored'] - team_log['conceded']
    team_log['win']         = (team_log['scored'] > team_log['conceded']).astype(int)
    team_log['clean_sheet'] = (team_log['conceded'] == 0).astype(int)

    def ewm_shift(series, span=window):
        return series.shift(1).ewm(span=span, adjust=False).mean()

    team_log['rolling_scored']   = team_log.groupby('team')['scored'].transform(ewm_shift)
    team_log['rolling_conceded'] = team_log.groupby('team')['conceded'].transform(ewm_shift)
    team_log['rolling_gd']       = team_log.groupby('team')['gd'].transform(ewm_shift)
    team_log['rolling_cs_rate']  = team_log.groupby('team')['clean_sheet'].transform(ewm_shift)

    # Streak: +1 per win, -1 per loss, 0 on draw (resets)
    def compute_streak(group):
        streak, current = [], 0
        for _, row in group.iterrows():
            streak.append(current)
            if row['win'] == 1:
                current = current + 1 if current >= 0 else 1
            elif row['scored'] < row['conceded']:
                current = current - 1 if current <= 0 else -1
            else:
                current = 0
        return pd.Series(streak, index=group.index)

    team_log['streak'] = team_log.groupby('team', group_keys=False).apply(compute_streak)

    # Days rest
    team_log['prev_date'] = team_log.groupby('team')['date'].shift(1)
    team_log['days_rest'] = (team_log['date'] - team_log['prev_date']).dt.days.fillna(30)

    # Home/away specific win rates
    home_mask = team_log['is_home']
    team_log['home_win_rate'] = np.nan
    team_log['away_win_rate'] = np.nan
    team_log.loc[home_mask,  'home_win_rate'] = (
        team_log[home_mask].groupby('team')['win'].transform(ewm_shift)
    )
    team_log.loc[~home_mask, 'away_win_rate'] = (
        team_log[~home_mask].groupby('team')['win'].transform(ewm_shift)
    )
    team_log['home_win_rate'] = team_log.groupby('team')['home_win_rate'].ffill()
    team_log['away_win_rate'] = team_log.groupby('team')['away_win_rate'].ffill()

    stats = team_log.drop_duplicates(subset=['date', 'team'], keep='last')
    return stats.set_index(['date', 'team'])


# ─────────────────────────────────────────────────────────────────────────────
# HEAD-TO-HEAD WIN RATE
# ─────────────────────────────────────────────────────────────────────────────

def _compute_h2h(df):
    """
    For each match, compute the home team's win rate against this
    specific opponent across the last 10 historical meetings.

    Only uses matches BEFORE the current match date — no leakage.
    Falls back to 0.5 (neutral) when no history exists.
    """
    h2h_rates = []

    for i, row in df.iterrows():
        home, away, date = row['home_team'], row['away_team'], row['date']

        past = df[
            (df['date'] < date) &
            (
                ((df['home_team'] == home) & (df['away_team'] == away)) |
                ((df['home_team'] == away) & (df['away_team'] == home))
            )
        ].tail(10)

        if len(past) == 0:
            h2h_rates.append(0.5)
            continue

        wins = sum(
            1 for _, m in past.iterrows()
            if (m['home_team'] == home and m['home_score'] > m['away_score']) or
               (m['away_team'] == home and m['away_score'] > m['home_score'])
        )
        h2h_rates.append(wins / len(past))

    return pd.Series(h2h_rates, index=df.index)


# ─────────────────────────────────────────────────────────────────────────────
# FIFA RANKINGS JOIN
# ─────────────────────────────────────────────────────────────────────────────

def _load_rankings():
    ranking = pd.read_csv(RANKING_PATH)
    ranking['rank_date'] = pd.to_datetime(ranking['rank_date'])
    ranking = ranking[['rank_date', 'country_full', 'rank', 'total_points', 'confederation']]
    return ranking.sort_values('rank_date').reset_index(drop=True)


def _add_ranking_features(df, ranking):
    results = []
    for _, match in df.iterrows():
        date = match['date']

        def get_team_ranking(team_name):
            rows = ranking[
                (ranking['country_full'] == team_name) &
                (ranking['rank_date'] <= date)
            ]
            if rows.empty:
                return np.nan, np.nan, None
            latest = rows.iloc[-1]
            return latest['rank'], latest['total_points'], latest['confederation']

        h_rank, h_pts, h_conf = get_team_ranking(match['home_team'])
        a_rank, a_pts, a_conf = get_team_ranking(match['away_team'])

        results.append({
            'home_rank': h_rank, 'home_points': h_pts, 'home_conf': h_conf,
            'away_rank': a_rank, 'away_points': a_pts, 'away_conf': a_conf,
        })

    rank_df = pd.DataFrame(results, index=df.index)
    df = pd.concat([df, rank_df], axis=1)

    df['rank_diff']   = df['home_rank'] - df['away_rank']
    df['points_diff'] = df['home_points'] - df['away_points']
    df['same_conf']   = (
        df['home_conf'].notna() & df['away_conf'].notna() &
        (df['home_conf'] == df['away_conf'])
    ).astype(int)

    df['rank_diff']   = df['rank_diff'].fillna(df['rank_diff'].median())
    df['points_diff'] = df['points_diff'].fillna(df['points_diff'].median())

    ranking_lookup = {
        row['country_full']: {
            'rank': row['rank'], 'points': row['total_points'], 'conf': row['confederation']
        }
        for _, row in ranking.drop_duplicates('country_full', keep='last').iterrows()
    }
    return df, ranking_lookup


# ─────────────────────────────────────────────────────────────────────────────
# PERSISTENCE
# ─────────────────────────────────────────────────────────────────────────────

def save(path: Path = MODELS_PATH):
    """Save trained models, scaler, and team stats to disk."""
    with open(path, "wb") as f:
        pickle.dump({
            "models":            models,
            "scaler":            scaler,
            "team_latest_stats": team_latest_stats,
        }, f)
    print(f"Saved to {path}")


def load(path: Path = MODELS_PATH) -> bool:
    """Load pre-trained models from disk. Returns True if successful."""
    global models, scaler, team_latest_stats
    if not path.exists():
        return False
    with open(path, "rb") as f:
        payload = pickle.load(f)
    models            = payload["models"]
    scaler            = payload["scaler"]
    team_latest_stats = payload["team_latest_stats"]
    print(f"Loaded pre-trained models. {len(team_latest_stats)} teams available.")
    return True


# ─────────────────────────────────────────────────────────────────────────────
# TRAIN
# ─────────────────────────────────────────────────────────────────────────────

def train():
    global models, scaler, team_latest_stats

    print("Loading match data...")
    df = pd.read_csv(DATA_PATH)
    df['date'] = pd.to_datetime(df['date'])
    df = df.sort_values('date').reset_index(drop=True)
    df['home_win'] = (df['home_score'] > df['away_score']).astype(int)
    df['neutral']  = df['neutral'].astype(int)

    print("Computing Elo ratings...")
    df, final_elo = _compute_elo(df)

    print("Computing rolling stats...")
    team_stats = _compute_rolling_stats(df)

    def get_stat(row, team_col, stat):
        try:
            return team_stats.loc[(row['date'], row[team_col]), stat]
        except KeyError:
            return np.nan

    stat_map = [
        ('home_goals_rolling',    'home_team', 'rolling_scored'),
        ('home_conceded_rolling', 'home_team', 'rolling_conceded'),
        ('home_gd_rolling',       'home_team', 'rolling_gd'),
        ('home_clean_sheet_rate', 'home_team', 'rolling_cs_rate'),
        ('home_streak',           'home_team', 'streak'),
        ('home_days_rest',        'home_team', 'days_rest'),
        ('home_win_rate_home',    'home_team', 'home_win_rate'),
        ('away_goals_rolling',    'away_team', 'rolling_scored'),
        ('away_conceded_rolling', 'away_team', 'rolling_conceded'),
        ('away_gd_rolling',       'away_team', 'rolling_gd'),
        ('away_clean_sheet_rate', 'away_team', 'rolling_cs_rate'),
        ('away_streak',           'away_team', 'streak'),
        ('away_days_rest',        'away_team', 'days_rest'),
        ('away_win_rate_away',    'away_team', 'away_win_rate'),
    ]

    for col, team_col, stat in stat_map:
        df[col] = df.apply(lambda r: get_stat(r, team_col, stat), axis=1)

    print("Computing head-to-head records...")
    df['h2h_home_win_rate'] = _compute_h2h(df)

    print("Joining FIFA rankings...")
    df, ranking_lookup = _add_ranking_features(df, _load_rankings())

    print("Building team stats lookup...")
    df_clean = df[FEATURE_COLS + ['date', 'home_win', 'home_team', 'away_team',
                                   'home_rank', 'home_points', 'home_conf',
                                   'away_rank', 'away_points', 'away_conf']].dropna(
        subset=FEATURE_COLS
    )

    # Build home stats from most recent home appearance per team
    home_df = df_clean.sort_values('date').drop_duplicates('home_team', keep='last')
    for _, row in home_df.iterrows():
        team = row['home_team']
        if team not in team_latest_stats:
            team_latest_stats[team] = {}
        team_latest_stats[team].update({
            'goals_rolling':    row['home_goals_rolling'],
            'conceded_rolling': row['home_conceded_rolling'],
            'gd_rolling':       row['home_gd_rolling'],
            'clean_sheet_rate': row['home_clean_sheet_rate'],
            'streak':           row['home_streak'],
            'days_rest':        row['home_days_rest'],
            'win_rate_home':    row['home_win_rate_home'],
            'elo':              final_elo.get(team, 1500),
            'rank':             row.get('home_rank',   np.nan),
            'points':           row.get('home_points', np.nan),
            'conf':             row.get('home_conf',   None),
        })

    # Fill in away-specific stats from most recent away appearance
    away_df = df_clean.sort_values('date').drop_duplicates('away_team', keep='last')
    for _, row in away_df.iterrows():
        team = row['away_team']
        if team not in team_latest_stats:
            team_latest_stats[team] = {}
        team_latest_stats[team].update({
            'win_rate_away': row['away_win_rate_away'],
        })
        # Fill in any missing keys for teams that only appear as away
        team_latest_stats[team].setdefault('goals_rolling',    row['away_goals_rolling'])
        team_latest_stats[team].setdefault('conceded_rolling', row['away_conceded_rolling'])
        team_latest_stats[team].setdefault('gd_rolling',       row['away_gd_rolling'])
        team_latest_stats[team].setdefault('clean_sheet_rate', row['away_clean_sheet_rate'])
        team_latest_stats[team].setdefault('streak',           row['away_streak'])
        team_latest_stats[team].setdefault('days_rest',        row['away_days_rest'])
        team_latest_stats[team].setdefault('elo',              final_elo.get(team, 1500))
        team_latest_stats[team].setdefault('rank',             row.get('away_rank',   np.nan))
        team_latest_stats[team].setdefault('points',           row.get('away_points', np.nan))
        team_latest_stats[team].setdefault('conf',             row.get('away_conf',   None))

    df['home_days_rest'] = df['home_days_rest'].clip(upper=90)
    df['away_days_rest'] = df['away_days_rest'].clip(upper=90)
    df['points_diff']    = df['points_diff'].clip(lower=-500, upper=500)

    X = df_clean[FEATURE_COLS].values
    y = df_clean['home_win'].values
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    scaler     = StandardScaler()
    X_train_sc = scaler.fit_transform(X_train)
    X_test_sc  = scaler.transform(X_test)

    print("\nTraining models...")
    accuracies = {}
    for key, config in MODEL_CONFIGS.items():
        if not config["available"]:
            print(f"  Skipping {config['label']} (coming soon)")
            continue
        print(f"  Training {config['label']}...")
        m = config['instance']()
        m.fit(X_train_sc, y_train)
        models[key] = m
        acc = float(np.mean(m.predict(X_test_sc) == y_test))
        accuracies[key] = acc
        print(f"    ✓ {config['label']} — test accuracy: {acc:.3f}")

    print(f"\nAll models trained. {len(team_latest_stats)} teams available.")
    print("\nAccuracy ranking:")
    for key, acc in sorted(accuracies.items(), key=lambda x: -x[1]):
        print(f"  {MODEL_CONFIGS[key]['label']}: {acc:.3f}")


# ─────────────────────────────────────────────────────────────────────────────
# PREDICT
# ─────────────────────────────────────────────────────────────────────────────

def _raw_prob(team_a: str, team_b: str, model_key: str, neutral: int) -> float:
    """
    Internal: return the model's raw P(team_a wins) with team_a in the home slot.
    Uses overall win rate for both teams when neutral=1.
    """
    h = team_latest_stats[team_a]
    a = team_latest_stats[team_b]

    h_rank, a_rank = h.get('rank', np.nan),   a.get('rank', np.nan)
    h_pts,  a_pts  = h.get('points', np.nan), a.get('points', np.nan)
    h_conf, a_conf = h.get('conf', None),     a.get('conf', None)
    h_elo,  a_elo  = h.get('elo', 1500),      a.get('elo', 1500)

    h_days_rest = min(h.get('days_rest', 30), 90)
    a_days_rest = min(a.get('days_rest', 30), 90)
    h_pts = np.clip(h_pts, -500, 500) if not np.isnan(h_pts) else np.nan
    a_pts = np.clip(a_pts, -500, 500) if not np.isnan(a_pts) else np.nan

    rank_diff   = (h_rank - a_rank) if not (np.isnan(h_rank) or np.isnan(a_rank)) else 0.0
    points_diff = (h_pts  - a_pts)  if not (np.isnan(h_pts)  or np.isnan(a_pts))  else 0.0
    same_conf   = 1 if (h_conf and a_conf and h_conf == a_conf) else 0
    elo_diff    = h_elo - a_elo

    def _safe(val, default=0.5):
        """Return default when val is None or NaN."""
        return default if (val is None or (isinstance(val, float) and np.isnan(val))) else val

    # Neutral mode: use each team's overall win rate so neither gets a home/away edge
    if neutral:
        h_win_rate = (_safe(h.get('win_rate_home')) + _safe(h.get('win_rate_away'))) / 2
        a_win_rate = (_safe(a.get('win_rate_home')) + _safe(a.get('win_rate_away'))) / 2
    else:
        h_win_rate = _safe(h.get('win_rate_home'))
        a_win_rate = _safe(a.get('win_rate_away'))

    features = np.array([[
        h['goals_rolling'], a['goals_rolling'],
        h['conceded_rolling'], a['conceded_rolling'],
        h_win_rate, a_win_rate,
        neutral,
        rank_diff, points_diff, same_conf,
        h_elo, a_elo, elo_diff,
        h.get('gd_rolling', 0), a.get('gd_rolling', 0),
        h.get('streak', 0), a.get('streak', 0),
        h.get('clean_sheet_rate', 0), a.get('clean_sheet_rate', 0),
        h_days_rest, a_days_rest,
        0.5,  # h2h_home_win_rate — fallback
    ]])

    features_scaled = scaler.transform(features)
    model = models[model_key]

    if model_key == "perceptron":
        # Perceptron outputs hard {0,1} — clip to soft probabilities
        return float(np.clip(model.predict(features_scaled)[0], 0.02, 0.98))
    return float(np.clip(model.predict_proba(features_scaled)[0], 0.02, 0.98))


def predict(home_team: str, away_team: str, model_key: str = "logistic_regression", neutral: int = 0):
    if home_team not in team_latest_stats:
        raise ValueError(f"Unknown team: {home_team}")
    if away_team not in team_latest_stats:
        raise ValueError(f"Unknown team: {away_team}")
    if model_key not in models:
        raise ValueError(f"Unknown model: {model_key}")

    if neutral:
        # For neutral matches, average the prediction from both orderings.
        # This removes any residual home-slot bias so that swapping the two
        # teams gives symmetric results — essential for World Cup Mode.
        p1 = _raw_prob(home_team, away_team, model_key, neutral)
        p2 = _raw_prob(away_team, home_team, model_key, neutral)
        prob = (p1 + (1 - p2)) / 2
    else:
        prob = _raw_prob(home_team, away_team, model_key, neutral)

    if neutral:
        # Neutral mode: scale both win probs by (1 - draw_rate) so that
        # swapping which team is in slot 1 gives identical predictions.
        # Draw rate held fixed at the historical neutral-match average (22.3%).
        _DRAW_RATE_NEUTRAL = 0.223
        home_win = round(prob * (1 - _DRAW_RATE_NEUTRAL), 3)
        draw_prob = _DRAW_RATE_NEUTRAL
        away_prob = round((1 - prob) * (1 - _DRAW_RATE_NEUTRAL), 3)
    else:
        # Non-neutral: prob = P(home wins outright) from the model.
        # Estimate draw probability from match closeness (more likely when even).
        # Then normalize all three so they always sum to exactly 1.0.
        spread    = abs(prob - 0.5)
        draw_raw  = float(np.clip(0.28 - 0.28 * spread, 0.08, 0.28))
        away_raw  = max(0.001, 1.0 - prob - draw_raw)
        _total    = prob + draw_raw + away_raw
        home_win  = prob      / _total
        draw_prob = draw_raw  / _total
        away_prob = away_raw  / _total

    # Winner draw uses only win probabilities (draws excluded) — always produces
    # a winner. Normalize so the two win probs sum to 1.
    win_total  = home_win + away_prob
    p_home_win = home_win  / win_total
    p_away_win = away_prob / win_total

    return {
        "home_team":            home_team,
        "away_team":            away_team,
        "model":                model_key,
        "model_label":          MODEL_CONFIGS[model_key]["label"],
        "home_win_probability": round(home_win, 3),
        "draw_probability":     round(draw_prob, 3),
        "away_win_probability": round(away_prob, 3),
        "predicted_winner":     str(np.random.choice([home_team, away_team], p=[p_home_win, p_away_win])),
    }


def get_models():
    return [
        {
            "key":       key,
            "label":     config["label"],
            "badge":     config["badge"],
            "available": config["available"],
        }
        for key, config in MODEL_CONFIGS.items()
    ]