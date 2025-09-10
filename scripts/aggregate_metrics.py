#!/usr/bin/env python3
"""
Builds season metrics from docs/data/final/{season}_wk*_final.csv and writes:
  docs/data/metrics/team_ats_by_picker.csv
  docs/data/metrics/team_fade_ats_by_picker.csv
  docs/data/metrics/home_away_ats_by_picker.csv
  docs/data/metrics/totals_by_picker.csv
  docs/data/metrics/team_totals_by_picker.csv
PLUS also writes the concatenated season file:
  docs/data/metrics/{season}_metrics.csv
"""

import os
import sys
import re
from pathlib import Path
import pandas as pd

# --- Paths
ROOT = Path(__file__).resolve().parents[1]
FINAL_DIR = ROOT / "docs" / "data" / "final"
METRICS_DIR = ROOT / "docs" / "data" / "metrics"

# --- Configure pickers (case-insensitive column matching)
PICKERS = ["Mat", "Nikki"]

# Column alias candidates (case-insensitive)
SPREAD_ALIASES = ["spread_home", "home_spread", "spread"]
TOTAL_ALIASES  = ["total", "over_under", "ou", "total_points"]

def err_exit(msg, code=78):
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(code)

def infer_season() -> str:
    # Prefer CLI arg, then SEASON env, else infer newest by mtime
    if len(sys.argv) >= 2 and sys.argv[1].strip():
        return sys.argv[1].strip()
    env = os.getenv("SEASON", "").strip()
    if env:
        return env
    cands = list(FINAL_DIR.glob("*_wk*_final.csv"))
    if not cands:
        err_exit("No final CSVs found for any season.")
    newest = max(cands, key=lambda p: p.stat().st_mtime)
    m = re.match(r"^(\d{4})_wk\d{2}_final\.csv$", newest.name)
    if not m:
        err_exit(f"Could not infer season from newest file: {newest.name}")
    season = m.group(1)
    print(f"Auto-detected season: {season}")
    return season

# --- Case-insensitive column helpers
def lower_map(columns) -> dict:
    """Map lowercase->original for DataFrame columns."""
    return {c.lower(): c for c in columns}

def pick_first_col(ci_map: dict, candidates: list[str]) -> str | None:
    """Return the ORIGINAL column name for first candidate found (case-insensitive)."""
    for cand in candidates:
        k = cand.lower()
        if k in ci_map:
            return ci_map[k]
    return None

def find_picker_col(ci_map: dict, picker: str, bases: list[str]) -> str | None:
    """
    For a picker like 'Mat', try variants case-insensitively:
      Mat_spread, mat_spread, MAT_SPREAD, Mat_spread_pick, Mat_ATS, etc.
    """
    pfx = picker
    pfx_low = picker.lower()
    variants = []
    for b in bases:
        variants += [
            f"{pfx}_{b}",
            f"{pfx}_{b}_pick",
            f"{pfx} {b}".replace("_", " "),
            f"{pfx}_{b.upper()}",
            f"{pfx_low}_{b}",
            f"{pfx_low}_{b}_pick",
            f"{pfx_low} {b}".replace("_", " "),
            f"{pfx}_{'ATS' if b=='spread' else ('OU' if b in ('total','Totals','O_U') else b)}",
            f"{pfx_low}_{'ATS' if b=='spread' else ('OU' if b in ('total','Totals','O_U') else b)}",
        ]
    variants += [f"{pfx}_ATS", f"{pfx_low}_ATS", f"{pfx}_OU", f"{pfx_low}_OU"]
    tried = set()
    for v in variants:
        key = v.strip().lower()
        if key and key not in tried:
            tried.add(key)
            if key in ci_map:
                return ci_map[key]
    return None

# --- Value normalization (accepts h/a/o/u too)
def norm_side(val: object) -> str | None:
    if pd.isna(val):
        return None
    s = str(val).strip().lower()
    if s in ("home", "h"):   return "Home"
    if s in ("away", "a"):   return "Away"
    if s in ("over", "o"):   return "Over"
    if s in ("under", "u"):  return "Under"
    return None

def to_float(x):
    try:
        return float(x)
    except Exception:
        return None

def list_season_files(season: str) -> list[Path]:
    return sorted(FINAL_DIR.glob(f"{season}_wk*_final.csv"))

def grade_ats(home_score, away_score, spread_home, pick_side) -> str | None:
    hs = to_float(home_score); as_ = to_float(away_score); sp = to_float(spread_home)
    if hs is None or as_ is None or sp is None or pick_side not in ("Home", "Away"):
        return None
    diff = (hs + sp) - as_
    if abs(diff) < 1e-12:
        return "P"
    home_wins = diff > 0
    return ("W" if home_wins else "L") if pick_side == "Home" else ("L" if home_wins else "W")

def grade_total(home_score, away_score, total_line, pick_side) -> str | None:
    hs = to_float(home_score); as_ = to_float(away_score); tl = to_float(total_line)
    if hs is None or as_ is None or tl is None or pick_side not in ("Over", "Under"):
        return None
    s = hs + as_
    if abs(s - tl) < 1e-12:
        return "P"
    is_over = s > tl
    return "W" if (pick_side == "Over" and is_over) or (pick_side == "Under" and not is_over) else "L"

def main(season: str):
    files = list_season_files(season)
    if not files:
        err_exit(f"No final CSVs for season {season}")

    METRICS_DIR.mkdir(parents=True, exist_ok=True)

    # 0) Also build the concatenated season file (all finals stacked)
    combined = []
    for f in files:
        try:
            df = pd.read_csv(f)
            df["__source_file"] = f.name
            combined.append(df)
        except Exception as e:
            print(f"WARNING: could not read {f.name}: {e}", file=sys.stderr)
    if combined:
        all_rows = pd.concat(combined, ignore_index=True)
        (METRICS_DIR / f"{season}_metrics.csv").parent.mkdir(parents=True, exist_ok=True)
        all_rows.to_csv(METRICS_DIR / f"{season}_metrics.csv", index=False)
    else:
        print("WARNING: no readable finals to concatenate; skipping {season}_metrics.csv", file=sys.stderr)

    # Aggregation buckets
    team_ats = {}          # (team, picker) -> [W,L,P]
    team_fade = {}         # (opponent, picker) -> [W,L,P]
    home_away = {}         # (picker, side[Home/Away]) -> [W,L,P]
    totals = {}            # (picker, side[Over/Under]) -> [W,L,P]
    team_totals = {}       # (team, picker, side[Over/Under]) -> [W,L,P]

    def tally(d: dict, key, res: str):
        w, l, p = d.get(key, [0, 0, 0])
        if   res == "W": w += 1
        elif res == "L": l += 1
        else:            p += 1
        d[key] = [w, l, p]

    processed, skipped = 0, 0
    skipped_reasons = {}

    def skip(reason: str):
        nonlocal skipped
        skipped += 1
        skipped_reasons[reason] = skipped_reasons.get(reason, 0) + 1

    # 1) Grade each week's final
    for f in files:
        df = pd.read_csv(f)
        ci = lower_map(df.columns)

        # Required core columns (case-insensitive)
        need = ["game_id", "home_team", "away_team", "home_score", "away_score"]
        if any(c.lower() not in ci for c in need):
            skip(f"missing core columns ({f.name})")
            continue

        game_id_col   = ci["game_id"]
        home_team_col = ci["home_team"]
        away_team_col = ci["away_team"]
        home_score_col= ci["home_score"]
        away_score_col= ci["away_score"]

        spread_col = pick_first_col(ci, SPREAD_ALIASES)
        total_col  = pick_first_col(ci, TOTAL_ALIASES)

        # Pre-locate picker columns (ATS & Totals) per picker
        picker_ats_col = {}
        picker_tot_col = {}
        for picker in PICKERS:
            ats = find_picker_col(ci, picker, ["spread", "ats"])
            tot = find_picker_col(ci, picker, ["total", "totals", "ou", "o_u"])
            picker_ats_col[picker] = ats
            picker_tot_col[picker] = tot

        # Row-wise grading
        for _, row in df.iterrows():
            hs = row.get(home_score_col); as_ = row.get(away_score_col)
            if pd.isna(hs) or pd.isna(as_):
                skip("missing score(s)")
                continue

            # ATS grading
            if spread_col is not None:
                sp_val = row.get(spread_col)
                for picker in PICKERS:
                    ats_col = picker_ats_col[picker]
                    if ats_col is None:
                        continue
                    pick = norm_side(row.get(ats_col))
                    if pick not in ("Home", "Away"):
                        continue
                    res = grade_ats(hs, as_, sp_val, pick)
                    if res is None:
                        skip("ATS grade failed")
                    else:
                        processed += 1
                        team = row.get(home_team_col) if pick == "Home" else row.get(away_team_col)
                        opp  = row.get(away_team_col) if pick == "Home" else row.get(home_team_col)
                        tally(team_ats, (team, picker), res)
                        fade_res = "L" if res == "W" else ("W" if res == "L" else "P")
                        tally(team_fade, (opp, picker), fade_res)
                        tally(home_away, (picker, pick), res)

            # Totals grading
            if total_col is not None:
                tl_val = row.get(total_col)
                for picker in PICKERS:
                    tot_col = picker_tot_col[picker]
                    if tot_col is None:
                        continue
                    pick = norm_side(row.get(tot_col))
                    if pick not in ("Over", "Under"):
                        continue
                    res = grade_total(hs, as_, tl_val, pick)
                    if res is None:
                        skip("Totals grade failed")
                    else:
                        processed += 1
                        team = row.get(home_team_col)  # stable anchor; totals aren’t team-specific
                        tally(totals, (picker, pick), res)
                        tally(team_totals, (team, picker, pick), res)

    # --- Emit outputs (five breakdown CSVs)
    METRICS_DIR.mkdir(parents=True, exist_ok=True)

    def dump(rows, header, name):
        path = METRICS_DIR / name
        pd.DataFrame(rows, columns=header).to_csv(path, index=False)
        return path

    # team_ats_by_picker.csv
    rows = []
    for (team, picker), (w, l, p) in sorted(team_ats.items()):
        g = w + l + p
        wp = round(100.0 * (w / g), 1) if g else 0.0
        rows.append([season, team, picker, w, l, p, g, wp])
    p1 = dump(rows, ["season","team","picker","wins","losses","pushes","games","win_pct"], "team_ats_by_picker.csv")

    # team_fade_ats_by_picker.csv
    rows = []
    for (opp, picker), (w, l, p) in sorted(team_fade.items()):
        g = w + l + p
        wp = round(100.0 * (w / g), 1) if g else 0.0
        rows.append([season, opp, picker, w, l, p, g, wp])
    p2 = dump(rows, ["season","opponent","picker","wins","losses","pushes","games","win_pct"], "team_fade_ats_by_picker.csv")

    # home_away_ats_by_picker.csv
    rows = []
    for (picker, side), (w, l, p) in sorted(home_away.items()):
        g = w + l + p
        wp = round(100.0 * (w / g), 1) if g else 0.0
        rows.append([season, picker, side, w, l, p, g, wp])
    p3 = dump(rows, ["season","picker","side","wins","losses","pushes","games","win_pct"], "home_away_ats_by_picker.csv")

    # totals_by_picker.csv
    rows = []
    for (picker, side), (w, l, p) in sorted(totals.items()):
        g = w + l + p
        wp = round(100.0 * (w / g), 1) if g else 0.0
        rows.append([season, picker, side, w, l, p, g, wp])
    p4 = dump(rows, ["season","picker","side","wins","losses","pushes","games","win_pct"], "totals_by_picker.csv")

    # team_totals_by_picker.csv
    rows = []
    for (team, picker, side), (w, l, p) in sorted(team_totals.items()):
        g = w + l + p
        wp = round(100.0 * (w / g), 1) if g else 0.0
        rows.append([season, team, picker, side, w, l, p, g, wp])
    p5 = dump(rows, ["season","team","picker","side","wins","losses","pushes","games","win_pct"], "team_totals_by_picker.csv")

    # Console summary
    print("=== Metrics Summary ===")
    print(f"Season: {season}")
    print(f"Graded rows:   {processed}")
    print(f"Skipped rows:  {skipped}")
    if skipped_reasons:
        print("Skip reasons:", dict(sorted(skipped_reasons.items(), key=lambda x: -x[1])))
    for pth in (p1, p2, p3, p4, p5, METRICS_DIR / f"{season}_metrics.csv"):
        try:
            n = max(0, sum(1 for _ in open(pth, "r", encoding="utf-8")) - 1)
        except Exception:
            n = "?"
        print(f"{pth.relative_to(ROOT)} -> rows: {n}")

if __name__ == "__main__":
    season = infer_season()
    main(season)
