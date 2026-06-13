"""
WC 2026 Tournament Simulation Engine
=====================================
Simulates the full 48-team FIFA World Cup 2026:
  1. Group stage (72 matches, Poisson scorelines)
  2. 3rd-place qualification (best 8 of 12)
  3. Round of 32 → R16 → QF → SF → Final (knockout, no draws)

All randomness lives here. The frontend receives a complete snapshot and
replays it with animation — the backend never streams partial results.
"""

from __future__ import annotations

import copy
import numpy as np
from itertools import combinations
from typing import Any

from app import predictor
from app.data.wc2026_groups import GROUPS, ALL_TEAMS, to_dataset_name, to_display_name

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Average international goals per team per match (used to normalise xG).
_AVG_GOALS = 1.15

# Maximum rejection-sampling attempts before using the fallback scoreline.
_MAX_POISSON_TRIES = 30


# ---------------------------------------------------------------------------
# WC 2026 Round-of-32 bracket template
# ---------------------------------------------------------------------------
# Source: FIFA official bracket publication (Annex C, December 2025 draw).
#
# Slot notation:
#   "1X" = group-X winner   "2X" = group-X runner-up
#   "3ABCDE" = a 3rd-place team from one of those groups (resolved at runtime)
#
# Matches are listed in FIFA match-number order (73–88).
# Third-place assignment is handled by _resolve_bracket_slots() below using
# the published eligible-group pools for each 3rd-place slot.

R32_BRACKET: list[tuple[str, str]] = [
    ("2A",  "2B"),       # M73
    ("1E",  "3ABCDF"),   # M74  — 3rd from A, B, C, D, or F
    ("1F",  "2C"),       # M75
    ("1C",  "2F"),       # M76
    ("1I",  "3CDFGH"),   # M77  — 3rd from C, D, F, G, or H
    ("2E",  "2I"),       # M78
    ("1A",  "3CEFHI"),   # M79  — 3rd from C, E, F, H, or I
    ("1L",  "3EHIJK"),   # M80  — 3rd from E, H, I, J, or K
    ("1D",  "3BEFIJ"),   # M81  — 3rd from B, E, F, I, or J
    ("1G",  "3AEHIJ"),   # M82  — 3rd from A, E, H, I, or J
    ("2K",  "2L"),       # M83
    ("1H",  "2J"),       # M84
    ("1B",  "3EFGIJ"),   # M85  — 3rd from E, F, G, I, or J
    ("1J",  "2H"),       # M86
    ("1K",  "3DEIJL"),   # M87  — 3rd from D, E, I, J, or L
    ("2D",  "2G"),       # M88
]

# R16: pairs of R32-result indices (0 = M73, 1 = M74, … 15 = M88).
R16_PAIRS: list[tuple[int, int]] = [
    (1, 4),   # M89: W74 vs W77
    (0, 2),   # M90: W73 vs W75
    (3, 5),   # M91: W76 vs W78
    (6, 7),   # M92: W79 vs W80
    (10, 11), # M93: W83 vs W84
    (8, 9),   # M94: W81 vs W82
    (13, 15), # M95: W86 vs W88
    (12, 14), # M96: W85 vs W87
]

# QF: pairs of R16-result indices (0 = M89, …, 7 = M96).
QF_PAIRS: list[tuple[int, int]] = [
    (0, 1),  # M97: W89 vs W90
    (4, 5),  # M98: W93 vs W94
    (2, 3),  # M99: W91 vs W92
    (6, 7),  # M100: W95 vs W96
]

# SF: pairs of QF-result indices (0 = M97, …, 3 = M100).
SF_PAIRS: list[tuple[int, int]] = [
    (0, 1),  # M101: W97 vs W98
    (2, 3),  # M102: W99 vs W100
]

# Final: SF-result indices.
FINAL_PAIR: tuple[int, int] = (0, 1)  # M104: W101 vs W102


# ---------------------------------------------------------------------------
# Expected-goals helpers
# ---------------------------------------------------------------------------

def _xg(team_display: str) -> float:
    """
    Expected goals for a team per match, derived from rolling stats.
    Uses goals_rolling as the attack proxy and the opponent's
    conceded_rolling as the defence proxy — both normalised to the
    international average.
    """
    name = to_dataset_name(team_display)
    stats = predictor.team_latest_stats.get(name, {})
    raw = stats.get("goals_rolling", _AVG_GOALS)
    return float(np.clip(raw, 0.3, 4.5))


def _defense_factor(team_display: str) -> float:
    """
    How hard it is to score against this team (lower = harder).
    Returns the team's conceded_rolling normalised to the average.
    """
    name = to_dataset_name(team_display)
    stats = predictor.team_latest_stats.get(name, {})
    raw = stats.get("conceded_rolling", _AVG_GOALS)
    return float(np.clip(raw / _AVG_GOALS, 0.2, 3.0))


def _match_xg(team_a: str, team_b: str) -> tuple[float, float]:
    """Return (xg_a, xg_b) for a neutral-venue match."""
    xg_a = float(np.clip(_xg(team_a) * _defense_factor(team_b), 0.3, 4.5))
    xg_b = float(np.clip(_xg(team_b) * _defense_factor(team_a), 0.3, 4.5))
    return xg_a, xg_b


# ---------------------------------------------------------------------------
# Scoreline sampling
# ---------------------------------------------------------------------------

def _poisson_score(
    xg_a: float,
    xg_b: float,
    outcome: str,          # "home" | "draw" | "away"
) -> tuple[int, int]:
    """
    Rejection-sample a scoreline from Poisson(xg_a) × Poisson(xg_b)
    conditioned on the desired outcome.  Falls back to a hand-crafted
    scoreline if rejection sampling fails within _MAX_POISSON_TRIES.
    """
    for _ in range(_MAX_POISSON_TRIES):
        g_a = int(np.random.poisson(xg_a))
        g_b = int(np.random.poisson(xg_b))
        if outcome == "home" and g_a > g_b:
            return g_a, g_b
        if outcome == "draw" and g_a == g_b:
            return g_a, g_b
        if outcome == "away" and g_b > g_a:
            return g_a, g_b

    # Fallback
    if outcome == "home":
        g_a = max(1, int(round(xg_a)))
        return g_a, max(0, g_a - 1)
    if outcome == "draw":
        g = max(0, int(round((xg_a + xg_b) / 2)))
        return g, g
    # away
    g_b = max(1, int(round(xg_b)))
    return max(0, g_b - 1), g_b


# ---------------------------------------------------------------------------
# Single match simulation
# ---------------------------------------------------------------------------

def _simulate_match(
    team_a: str,
    team_b: str,
    model_key: str,
    allow_draw: bool = True,
) -> dict[str, Any]:
    """
    Simulate one match.  Returns a result dict with keys:
      home, away, home_score, away_score, winner (display names)

    If allow_draw=False (knockout), draws trigger a penalty shootout:
    the winner is chosen with a 50/50 coin flip and the score is kept
    as-is (reflecting extra time).
    """
    da, db = to_dataset_name(team_a), to_dataset_name(team_b)

    # Get three-way probabilities from the ML model
    pred = predictor.predict(da, db, model_key, neutral=1)
    p_home = pred["home_win_probability"]
    p_draw = pred["draw_probability"]
    p_away = pred["away_win_probability"]

    # Sample outcome
    r = np.random.random()
    if r < p_home:
        outcome = "home"
    elif r < p_home + p_draw:
        outcome = "draw"
    else:
        outcome = "away"

    # In knockouts, resolve draws via penalties
    if not allow_draw and outcome == "draw":
        outcome = "home" if np.random.random() < 0.5 else "away"
        penalties = True
    else:
        penalties = False

    # Sample scoreline
    xg_a, xg_b = _match_xg(team_a, team_b)
    home_score, away_score = _poisson_score(xg_a, xg_b, outcome)

    winner = team_a if outcome == "home" else team_b

    return {
        "home":       team_a,
        "away":       team_b,
        "home_score": home_score,
        "away_score": away_score,
        "winner":     winner,
        "penalties":  penalties,
    }


# ---------------------------------------------------------------------------
# Group stage
# ---------------------------------------------------------------------------

def _blank_row(team: str) -> dict:
    return {"team": team, "P": 0, "W": 0, "D": 0, "L": 0,
            "GF": 0, "GA": 0, "GD": 0, "Pts": 0}


def simulate_group(
    group_letter: str,
    teams: list[str],
    model_key: str,
) -> dict[str, Any]:
    """
    Simulate a single group (round-robin, 6 matches).
    Returns {"standings": [...], "matches": [...]}.
    """
    rows: dict[str, dict] = {t: _blank_row(t) for t in teams}
    matches: list[dict] = []

    for team_a, team_b in combinations(teams, 2):
        result = _simulate_match(team_a, team_b, model_key, allow_draw=True)
        matches.append({**result, "group": group_letter})

        for team, gf, ga in [
            (team_a, result["home_score"], result["away_score"]),
            (team_b, result["away_score"], result["home_score"]),
        ]:
            rows[team]["P"]  += 1
            rows[team]["GF"] += gf
            rows[team]["GA"] += ga
            rows[team]["GD"] += gf - ga

        w = result["winner"]
        if result["home_score"] == result["away_score"]:      # draw
            rows[team_a]["D"] += 1; rows[team_a]["Pts"] += 1
            rows[team_b]["D"] += 1; rows[team_b]["Pts"] += 1
        elif w == team_a:
            rows[team_a]["W"] += 1; rows[team_a]["Pts"] += 3
            rows[team_b]["L"] += 1
        else:
            rows[team_b]["W"] += 1; rows[team_b]["Pts"] += 3
            rows[team_a]["L"] += 1

    # Sort: Pts → GD → GF → random tiebreak
    standings = sorted(
        rows.values(),
        key=lambda x: (x["Pts"], x["GD"], x["GF"], np.random.random()),
        reverse=True,
    )

    return {"group": group_letter, "standings": standings, "matches": matches}


def simulate_all_groups(
    groups: dict[str, list[str]],
    model_key: str,
) -> dict[str, dict]:
    """Simulate all 12 groups. Returns {group_letter: group_result}."""
    return {
        letter: simulate_group(letter, teams, model_key)
        for letter, teams in groups.items()
    }


# ---------------------------------------------------------------------------
# Third-place qualification (best 8 of 12)
# ---------------------------------------------------------------------------

def _third_place_teams(group_results: dict[str, dict]) -> list[dict]:
    """Extract all 12 third-place finishers with their group letter."""
    thirds = []
    for letter, result in group_results.items():
        row = copy.deepcopy(result["standings"][2])  # 3rd place (0-indexed)
        row["group"] = letter
        thirds.append(row)
    return thirds


def _best_eight_thirds(thirds: list[dict]) -> list[dict]:
    """
    Select the 8 best 3rd-place teams using FIFA criteria:
    Points → GD → GF → random.
    """
    ranked = sorted(
        thirds,
        key=lambda x: (x["Pts"], x["GD"], x["GF"], np.random.random()),
        reverse=True,
    )
    return ranked[:8]


# ---------------------------------------------------------------------------
# Bracket seeding
# ---------------------------------------------------------------------------

def _resolve_bracket_slots(
    group_results: dict[str, dict],
    qualified_thirds: list[dict],
) -> dict[str, str]:
    """
    Build a mapping from bracket slot label → team display name.
    Handles "1X" (group winner), "2X" (runner-up), and "3ABC" style
    third-place slots by assigning qualifying thirds greedily to
    the first matching slot.
    """
    slots: dict[str, str] = {}

    # Winners and runners-up
    for letter, result in group_results.items():
        slots[f"1{letter}"] = result["standings"][0]["team"]
        slots[f"2{letter}"] = result["standings"][1]["team"]

    # Assign 3rd-place teams to slots
    # Each "3XYZ" slot accepts a 3rd-place team from group X, Y, or Z.
    # We assign greedily: iterate slots, assign the first available third
    # whose group letter matches, then remove from pool.
    third_pool = list(qualified_thirds)  # already ranked best-first

    third_slots = [slot for pair in R32_BRACKET for slot in pair if slot.startswith("3")]
    for slot in third_slots:
        eligible_groups = set(slot[1:])   # e.g. "3DEF" → {"D","E","F"}
        assigned = False
        for candidate in third_pool:
            if candidate["group"] in eligible_groups:
                slots[slot] = candidate["team"]
                third_pool.remove(candidate)
                assigned = True
                break
        if not assigned:
            # Fallback: assign the highest-ranked remaining third
            if third_pool:
                slots[slot] = third_pool.pop(0)["team"]

    return slots


def _build_r32(slots: dict[str, str]) -> list[dict]:
    """Convert R32_BRACKET slot pairs into concrete match dicts."""
    matches = []
    for i, (slot_h, slot_a) in enumerate(R32_BRACKET):
        matches.append({
            "match_id": f"R32-{i+1}",
            "home": slots.get(slot_h, "TBD"),
            "away": slots.get(slot_a, "TBD"),
            "slot_home": slot_h,
            "slot_away": slot_a,
        })
    return matches


# ---------------------------------------------------------------------------
# Knockout rounds
# ---------------------------------------------------------------------------

def _simulate_round(
    matches: list[dict],
    model_key: str,
    round_name: str,
) -> tuple[list[dict], list[str]]:
    """
    Simulate all matches in one knockout round.
    Returns (results, [winners in match order]).
    """
    results = []
    winners = []
    for m in matches:
        result = _simulate_match(m["home"], m["away"], model_key, allow_draw=False)
        results.append({
            "match_id":   m.get("match_id", ""),
            "round":      round_name,
            **result,
        })
        winners.append(result["winner"])
    return results, winners


def _pair_winners(winners: list[str], pairs: list[tuple[int, int]], round_name: str) -> list[dict]:
    """Build next-round match list from a winners list and pairing table."""
    return [
        {
            "match_id": f"{round_name}-{i+1}",
            "home": winners[a],
            "away": winners[b],
        }
        for i, (a, b) in enumerate(pairs)
    ]


# ---------------------------------------------------------------------------
# Full tournament
# ---------------------------------------------------------------------------

def simulate_tournament(
    groups: dict[str, list[str]] | None = None,
    model_key: str = "logistic_regression",
) -> dict[str, Any]:
    """
    Run the complete WC 2026 simulation.

    Parameters
    ----------
    groups : optional custom group assignments {letter: [team, ...]}
             Defaults to the official WC 2026 draw.
    model_key : which ML model to use for predictions.

    Returns
    -------
    A structured dict the frontend can consume to drive the animation:
    {
      "groups":        {letter: {standings, matches}},
      "qualified":     {letter: {winner, runner_up, third}},
      "thirds":        [top-8 3rd-place rows],
      "r32":           [match results],
      "r16":           [match results],
      "qf":            [match results],
      "sf":            [match results],
      "final":         [match result],
      "champion":      "Team Name",
      "model":         model_key,
    }
    """
    if groups is None:
        groups = GROUPS

    # ── Group stage ──────────────────────────────────────────────────────
    group_results = simulate_all_groups(groups, model_key)

    qualified: dict[str, dict] = {}
    for letter, res in group_results.items():
        st = res["standings"]
        qualified[letter] = {
            "winner":     st[0]["team"],
            "runner_up":  st[1]["team"],
            "third":      st[2]["team"],
            "fourth":     st[3]["team"],
        }

    all_thirds   = _third_place_teams(group_results)
    best_thirds  = _best_eight_thirds(all_thirds)
    slots        = _resolve_bracket_slots(group_results, best_thirds)

    # ── Round of 32 ──────────────────────────────────────────────────────
    r32_matches              = _build_r32(slots)
    r32_results, r32_winners = _simulate_round(r32_matches, model_key, "R32")

    # ── Round of 16 ──────────────────────────────────────────────────────
    r16_matches              = _pair_winners(r32_winners, R16_PAIRS, "R16")
    r16_results, r16_winners = _simulate_round(r16_matches, model_key, "R16")

    # ── Quarter-finals ────────────────────────────────────────────────────
    qf_matches               = _pair_winners(r16_winners, QF_PAIRS, "QF")
    qf_results,  qf_winners  = _simulate_round(qf_matches, model_key, "QF")

    # ── Semi-finals ───────────────────────────────────────────────────────
    sf_matches               = _pair_winners(qf_winners, SF_PAIRS, "SF")
    sf_results,  sf_winners  = _simulate_round(sf_matches, model_key, "SF")

    # ── Final ─────────────────────────────────────────────────────────────
    final_match              = _pair_winners(sf_winners, [FINAL_PAIR], "Final")
    final_results, final_winners = _simulate_round(final_match, model_key, "Final")
    champion                 = final_winners[0]

    return {
        "groups":   group_results,
        "qualified": qualified,
        "thirds":   best_thirds,
        "r32":      r32_results,
        "r16":      r16_results,
        "qf":       qf_results,
        "sf":       sf_results,
        "final":    final_results,
        "champion": champion,
        "model":    model_key,
    }


# ---------------------------------------------------------------------------
# Monte Carlo
# ---------------------------------------------------------------------------

def _blank_counts() -> dict[str, dict[str, int]]:
    return {
        team: {"champion": 0, "finalist": 0, "semi": 0, "quarter": 0}
        for team in ALL_TEAMS
    }


def _accumulate(counts: dict, r: dict) -> None:
    """Add one tournament result into the running counts dict."""
    counts[r["champion"]]["champion"] += 1

    f = r["final"][0]
    for team in (f["home"], f["away"]):
        if team in counts:
            counts[team]["finalist"] += 1

    for match in r["sf"]:
        for team in (match["home"], match["away"]):
            if team in counts:
                counts[team]["semi"] += 1

    for match in r["qf"]:
        for team in (match["home"], match["away"]):
            if team in counts:
                counts[team]["quarter"] += 1


def _counts_to_teams(counts: dict, completed: int) -> list[dict]:
    teams_out = [
        {
            "team":         team,
            "champion_pct": round(s["champion"]  / completed * 100, 1),
            "finalist_pct": round(s["finalist"]  / completed * 100, 1),
            "semi_pct":     round(s["semi"]      / completed * 100, 1),
            "quarter_pct":  round(s["quarter"]   / completed * 100, 1),
            "champion_n":   s["champion"],
        }
        for team, s in counts.items()
    ]
    teams_out.sort(
        key=lambda x: (x["champion_pct"], x["finalist_pct"], x["semi_pct"]),
        reverse=True,
    )
    return teams_out


def monte_carlo(
    runs: int = 100,
    model_key: str = "logistic_regression",
) -> dict[str, Any]:
    """Run `runs` full tournaments and return aggregated statistics."""
    runs = max(1, min(runs, 10_000))
    counts = _blank_counts()

    for _ in range(runs):
        _accumulate(counts, simulate_tournament(model_key=model_key))

    return {"runs": runs, "model": model_key, "teams": _counts_to_teams(counts, runs)}


def monte_carlo_stream(runs: int, model_key: str):
    """
    Sync generator for SSE streaming of Monte Carlo results.

    Yields one SSE `data:` line after every batch of simulations so the
    frontend can update the bar chart in real time.  Designed to be wrapped
    in a FastAPI StreamingResponse (runs in a threadpool, not the event loop).
    """
    import json

    runs = max(1, min(runs, 10_000))
    counts = _blank_counts()

    # Aim for ~50 UI updates regardless of total run count
    batch_size = max(10, runs // 50)
    completed = 0

    while completed < runs:
        batch = min(batch_size, runs - completed)
        for _ in range(batch):
            _accumulate(counts, simulate_tournament(model_key=model_key))
            completed += 1

        payload = json.dumps({
            "runs_done": completed,
            "total":     runs,
            "model":     model_key,
            "teams":     _counts_to_teams(counts, completed),
        })
        yield f"data: {payload}\n\n"

    yield "data: [DONE]\n\n"
