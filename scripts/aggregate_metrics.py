#!/usr/bin/env python3
"""
Reads docs/data/final/<season>_wkNN_final.csv files,
derives per-pick results for Mat & Nikki, and writes rollups to:

docs/data/metrics/
  - team_ats_by_picker.csv
  - team_fade_ats_by_picker.csv
  - home_away_ats_by_picker.csv
  - totals_by_picker.csv
  - team_totals_by_picker.csv
"""

import csv
import os
import re
from pathlib import Path
from collections import defaultdict

ROOT = Path(__file__).resolve().parents[1]
FINAL_DIR = ROOT / "docs" / "data" / "final"
OUT_DIR = ROOT / "docs" / "data" / "metrics"

PICKERS = ["Mat", "Nikki"]

def die(msg, code=78):
    print(f"ERROR: {msg}")
    raise SystemExit(code)

def norm(s):
    return (s or "").strip()

def lowerkeys(d):
    return {k.lower(): v for k, v in d.items()}

def find_col(headers, *alts):
    """Find the first header name that matches any lowercased alternative."""
    hset = {h.lower(): h for h in headers}
    for a in alts:
        a = a.lower()
        if a in hset:
            return hset[a]
    # fuzzy find if "pick" wording varies
    for a in alts:
        a = a.lower()
        for h in headers:
            if a in h.lower():
                return h
    return None

def get_latest_season(files):
    """Pick latest season by lexicographic prefix (e.g., 2025_...)."""
    seasons = []
    for f in files:
        m = re.match(r"^(\d{4})_wk\d{2}_final\.csv$", f.name)
        if m:
            seasons.append(m.group(1))
    return max(seasons) if seasons else None

def parse_final_row(row, header_map):
    """Extract typed values from a final.csv row using header_map."""
    val = lambda key, default="": norm(row.get(header_map.get(key, ""), default))

    # Required
    home_team = val("home_team")
    away_team = val("away_team")
    try:
        spread_home = float(val("spread_home", ""))
    except:
        spread_home = None
    try:
        total_line = float(val("total", ""))
    except:
        total_line = None

    # Scores (may be blank)
    try:
        home_score = int(val("home_score", ""))
        away_score = int(val("away_score", ""))
        have_scores = True
    except:
        home_score = away_score = 0
        have_scores = False

    # normalized picks: dict like {"Mat": {"spread": "Home"/"Away"/"", "total": "Over"/"Under"/""}, ...}
    picks = {p: {"spread": "", "total": ""} for p in PICKERS}
    for p in PICKERS:
        spread_key = header_map.get(f"{p.lower()}_spread") or header_map.get(f"{p.lower()}_spread_pick")
        total_key  = header_map.get(f"{p.lower()}_total")  or header_map.get(f"{p.lower()}_total_pick")
        if spread_key:
            picks[p]["spread"] = norm(row.get(spread_key, ""))
        if total_key:
            picks[p]["total"]  = norm(row.get(total_key, ""))

    return {
        "home_team": home_team,
        "away_team": away_team,
        "spread_home": spread_home,
        "total_line": total_line,
        "home_score": home_score,
        "away_score": away_score,
        "have_scores": have_scores,
        "picks": picks,
    }

def result_spread(pick_side, spread_home, home_score, away_score):
    """
    Return W/L/P for a spread pick:
    - pick_side: "Home" or "Away"
    - spread_home: spread for the HOME team (e.g., -3.5 if favorite)
    """
    if pick_side not in ("Home", "Away"):
        return None
    # margin > 0 means HOME covers; ==0 push; <0 home doesn't cover
    margin = (home_score + (spread_home or 0.0)) - away_score
    if margin == 0:
        covered_home = None  # push
    else:
        covered_home = margin > 0

    if covered_home is None:
        return "P"
    if (covered_home and pick_side == "Home") or ((not covered_home) and pick_side == "Away"):
        return "W"
    return "L"

def result_total(pick_side, total_line, home_score, away_score):
    if pick_side not in ("Over", "Under"):
        return None
    total_points = home_score + away_score
    if total_points == (total_line or 0.0):
        return "P"
    if (pick_side == "Over" and total_points > (total_line or 0.0)) or (pick_side == "Under" and total_points < (total_line or 0.0)):
        return "W"
    return "L"

def safe_inc(bucket, key_tuple, res):
    """Increment W/L/P counters in bucket[key_tuple]."""
    if res is None:
        return
    wins, losses, pushes = bucket[key_tuple]
    if res == "W":
        wins += 1
    elif res == "L":
        losses += 1
    elif res == "P":
        pushes += 1
    bucket[key_tuple] = (wins, losses, pushes)

def percent(w, l, p):
    games = w + l + p
    return (games and round(100.0 * w / games, 1)) or 0.0, games

def write_rows(path, headers, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(headers)
        for r in rows:
            w.writerow(r)

def main():
    season = os.environ.get("SEASON", "").strip()
    files = sorted(FINAL_DIR.glob("*_wk??_final.csv"))
    if not files:
        die(f"No final CSV files found in {FINAL_DIR}")

    if not season:
        season = get_latest_season(files) or ""
    if not season:
        die("Could not determine season. Provide SEASON env or ensure filenames like 2025_wk01_final.csv")

    season_files = [f for f in files if f.name.startswith(season + "_")]
    if not season_files:
        die(f"No final CSVs for season {season} in {FINAL_DIR}")

    # Buckets
    team_ats_by_picker = defaultdict(lambda: (0, 0, 0))   # (team, picker) -> (W,L,P)
    team_fade_by_picker = defaultdict(lambda: (0, 0, 0))  # (opponent, picker) -> (W,L,P)
    home_away_by_picker = defaultdict(lambda: (0, 0, 0))  # (picker, side) -> (W,L,P)
    totals_by_picker = defaultdict(lambda: (0, 0, 0))     # (picker, side) -> (W,L,P)
    team_totals_by_picker = defaultdict(lambda: (0, 0, 0))# (team, picker, side) -> (W,L,P)

    # process files
    for f in season_files:
        with f.open("r", encoding="utf-8", newline="") as fh:
            reader = csv.DictReader(fh)
            headers = reader.fieldnames or []
            hlow = [h.lower() for h in headers]

            # build header map
            hm = {}
            hm["home_team"] = find_col(headers, "home_team")
            hm["away_team"] = find_col(headers, "away_team")
            hm["spread_home"] = find_col(headers, "spread_home", "home_spread", "spread")
            hm["total"] = find_col(headers, "total", "over_under", "ou", "total_points")
            hm["home_score"] = find_col(headers, "home_score", "score_home")
            hm["away_score"] = find_col(headers, "away_score", "score_away")

            # pick columns per person
            for p in PICKERS:
                pl = p.lower()
                hm[f"{pl}_spread"] = find_col(headers, f"{pl}_spread_pick", f"{pl}_spread", f"{p} Spread", f"{p}_spread")
                hm[f"{pl}_total"]  = find_col(headers, f"{pl}_total_pick",  f"{pl}_total",  f"{p} Total",  f"{p}_total")

            # iterate rows
            for row in reader:
                data = parse_final_row(row, hm)
                if not data["have_scores"]:
                    # can't grade without scores
                    continue

                # Spread results
                for p in PICKERS:
                    side = data["picks"][p]["spread"]  # "Home"/"Away"/""
                    if side:
                        res = result_spread(side, data["spread_home"], data["home_score"], data["away_score"])
                        # chosen/faded teams
                        if side == "Home":
                            chosen = data["home_team"]; faded = data["away_team"]; side_flag = "home"
                        else:
                            chosen = data["away_team"]; faded = data["home_team"]; side_flag = "away"

                        safe_inc(team_ats_by_picker, (chosen, p), res)
                        safe_inc(team_fade_by_picker, (faded, p), res)
                        safe_inc(home_away_by_picker, (p, side_flag), res)

                # Totals results
                for p in PICKERS:
                    side = data["picks"][p]["total"]  # "Over"/"Under"/""
                    if side:
                        res = result_total(side, data["total_line"], data["home_score"], data["away_score"])
                        safe_inc(totals_by_picker, (p, side.lower()), res)

                        # attribute totals to BOTH teams (game involves both)
                        for team in (data["home_team"], data["away_team"]):
                            safe_inc(team_totals_by_picker, (team, p, side.lower()), res)

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    # Write: team_ats_by_picker.csv
    rows = []
    for (team, picker), (w,l,p) in sorted(team_ats_by_picker.items()):
        pct, games = percent(w,l,p)
        rows.append([season, team, picker, w, l, p, games, pct])
    write_rows(OUT_DIR / "team_ats_by_picker.csv",
               ["season","team","picker","wins","losses","pushes","games","win_pct"],
               rows)

    # Write: team_fade_ats_by_picker.csv
    rows = []
    for (opponent, picker), (w,l,p) in sorted(team_fade_by_picker.items()):
        pct, games = percent(w,l,p)
        rows.append([season, opponent, picker, w, l, p, games, pct])
    write_rows(OUT_DIR / "team_fade_ats_by_picker.csv",
               ["season","opponent","picker","wins","losses","pushes","games","win_pct"],
               rows)

    # Write: home_away_ats_by_picker.csv
    rows = []
    for (picker, side), (w,l,p) in sorted(home_away_by_picker.items()):
        pct, games = percent(w,l,p)
        rows.append([season, picker, side, w, l, p, games, pct])
    write_rows(OUT_DIR / "home_away_ats_by_picker.csv",
               ["season","picker","side","wins","losses","pushes","games","win_pct"],
               rows)

    # Write: totals_by_picker.csv
    rows = []
    for (picker, side), (w,l,p) in sorted(totals_by_picker.items()):
        pct, games = percent(w,l,p)
        rows.append([season, picker, side, w, l, p, games, pct])
    write_rows(OUT_DIR / "totals_by_picker.csv",
               ["season","picker","side","wins","losses","pushes","games","win_pct"],
               rows)

    # Write: team_totals_by_picker.csv
    rows = []
    for (team, picker, side), (w,l,p) in sorted(team_totals_by_picker.items()):
        pct, games = percent(w,l,p)
        rows.append([season, team, picker, side, w, l, p, games, pct])
    write_rows(OUT_DIR / "team_totals_by_picker.csv",
               ["season","team","picker","side","wins","losses","pushes","games","win_pct"],
               rows)

    print(f"Wrote metrics to {OUT_DIR.relative_to(ROOT)} for season {season}")

if __name__ == "__main__":
    main()
