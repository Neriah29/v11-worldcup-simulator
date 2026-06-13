"""
FIFA World Cup 2026 — Official Group Draw
Draw held: December 5, 2025, Kennedy Center, Washington D.C.
48 teams, 12 groups (A–L), 4 teams per group.

Co-hosts: Mexico (A), Canada (B), United States (D)
"""

# Display names exactly as we want to show them in the UI.
# These are the FIFA-official English names where possible.
GROUPS: dict[str, list[str]] = {
    "A": ["Mexico",         "South Korea",           "Czechia",    "South Africa"],
    "B": ["Canada",         "Bosnia and Herzegovina","Switzerland","Qatar"],
    "C": ["Brazil",         "Morocco",               "Haiti",      "Scotland"],
    "D": ["United States",  "Paraguay",              "Australia",  "Turkey"],
    "E": ["Germany",        "Curaçao",               "Ivory Coast","Ecuador"],
    "F": ["Netherlands",    "Japan",                 "Sweden",     "Tunisia"],
    "G": ["Belgium",        "Egypt",                 "Iran",       "New Zealand"],
    "H": ["Spain",          "Cape Verde",            "Saudi Arabia","Uruguay"],
    "I": ["France",         "Senegal",               "Iraq",       "Norway"],
    "J": ["Argentina",      "Algeria",               "Austria",    "Jordan"],
    "K": ["Portugal",       "DR Congo",              "Uzbekistan", "Colombia"],
    "L": ["England",        "Croatia",               "Ghana",      "Panama"],
}

# Map display name → dataset name (only entries that differ).
_NAME_MAP: dict[str, str] = {
    "Czechia": "Czech Republic",
}


def to_dataset_name(display_name: str) -> str:
    """Convert a display team name to the name used in our ML dataset."""
    return _NAME_MAP.get(display_name, display_name)


def to_display_name(dataset_name: str) -> str:
    """Convert a dataset team name back to its display name."""
    reverse = {v: k for k, v in _NAME_MAP.items()}
    return reverse.get(dataset_name, dataset_name)


# Flat list of all 48 qualified teams (display names).
ALL_TEAMS: list[str] = [t for teams in GROUPS.values() for t in teams]
