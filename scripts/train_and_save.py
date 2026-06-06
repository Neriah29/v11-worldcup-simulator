import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from app import predictor
from football_ml.supervised_learning.logistic_regression import LogisticRegression

# ── Diagnostic ────────────────────────────────────────────────────────────────
print("Running feature engineering diagnostic...")

df = pd.read_csv(predictor.DATA_PATH)
df['date'] = pd.to_datetime(df['date'])
df = df.sort_values('date').reset_index(drop=True)
df['home_win'] = (df['home_score'] > df['away_score']).astype(int)
df['neutral']  = df['neutral'].astype(int)

df, _ = predictor._compute_elo(df)
team_stats = predictor._compute_rolling_stats(df)

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
    df[col] = df.apply(lambda r, tc=team_col, s=stat: get_stat(r, tc, s), axis=1)

df['h2h_home_win_rate'] = predictor._compute_h2h(df)
df, _ = predictor._add_ranking_features(df, predictor._load_rankings())

print(f"\nTotal rows before dropna : {len(df)}")
df_clean = df.dropna(subset=predictor.FEATURE_COLS)
print(f"Total rows after dropna  : {len(df_clean)}")

print(f"\n{'Feature':<25} {'% NaN':>8}  {'Mean':>10}  {'Std':>10}")
print("-" * 58)
for col in predictor.FEATURE_COLS:
    pct_nan = df[col].isna().mean() * 100
    mean    = df[col].mean()
    std     = df[col].std()
    print(f"{col:<25} {pct_nan:>7.1f}%  {mean:>10.4f}  {std:>10.4f}")

print("\nDiagnostic complete.\n")
# ── End diagnostic ────────────────────────────────────────────────────────────


# ── Feature ablation experiment ───────────────────────────────────────────────
print("=" * 58)
print("LOGISTIC REGRESSION FEATURE ABLATION EXPERIMENT")
print("=" * 58)

# Use home_win_rate and away_win_rate (original — from rolling stats directly)
# The original 7 used a single win_rate not split by home/away context,
# so we compute a simple overall win rate here
df['home_win_rate'] = df.apply(lambda r: get_stat(r, 'home_team', 'home_win_rate'), axis=1)
df['away_win_rate'] = df.apply(lambda r: get_stat(r, 'away_team', 'away_win_rate'), axis=1)

def run_lr(feature_cols, label):
    d = df.dropna(subset=feature_cols + ['home_win'])
    X = d[feature_cols].values
    y = d['home_win'].values
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    sc = StandardScaler()
    X_train_sc = sc.fit_transform(X_train)
    X_test_sc  = sc.transform(X_test)
    m = LogisticRegression(learning_rate=0.1, n_epochs=1000)
    m.fit(X_train_sc, y_train)
    preds = m.predict(X_test_sc)
    acc = (preds == y_test).mean()
    print(f"  {label:<45} accuracy: {acc:.3f}")

ORIG_7 = [
    'home_goals_rolling', 'away_goals_rolling',
    'home_conceded_rolling', 'away_conceded_rolling',
    'home_win_rate', 'away_win_rate',
    'neutral',
]

run_lr(ORIG_7,               "7 features (original)")
run_lr(ORIG_7 + ['elo_diff'], "8 features (+ elo_diff)")
run_lr(ORIG_7 + ['elo_diff', 'rank_diff'], "9 features (+ elo_diff + rank_diff)")

print("=" * 58)
print()

# ── Full 22-feature LR hyperparameter experiment ──────────────────────────────
print("=" * 58)
print("LR HYPERPARAMETER EXPERIMENT (full 22 features)")
print("=" * 58)

def run_lr_full(lr, epochs, label):
    d = df.dropna(subset=predictor.FEATURE_COLS + ['home_win'])
    X = d[predictor.FEATURE_COLS].values
    y = d['home_win'].values
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    sc = StandardScaler()
    X_train_sc = sc.fit_transform(X_train)
    X_test_sc  = sc.transform(X_test)
    m = LogisticRegression(learning_rate=lr, n_epochs=epochs)
    m.fit(X_train_sc, y_train)
    preds = m.predict(X_test_sc)
    acc = (preds == y_test).mean()
    print(f"  {label:<45} accuracy: {acc:.3f}")

run_lr_full(0.1,  1000, "lr=0.1,  epochs=1000  (current)")
run_lr_full(0.1,  5000, "lr=0.1,  epochs=5000")
run_lr_full(0.01, 5000, "lr=0.01, epochs=5000")

print("=" * 58)
print()
# ── End hyperparameter experiment ─────────────────────────────────────────────


print("Starting training...")
predictor.train()
predictor.save()
print("Done. Models saved to app/data/trained_models.pkl")
