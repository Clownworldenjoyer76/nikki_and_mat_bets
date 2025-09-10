#!/usr/bin/env python3
import os
import sys
from pathlib import Path
import re
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
FINAL_DIR = ROOT / "docs" / "data" / "final"
METRICS_DIR = ROOT / "docs" / "data" / "metrics"

# Configure pickers here (columns expected: <Picker>_spread, <Picker>_total)
PICKERS = ["Mat", "Nikki"]

# Column alias maps
SPREAD_ALIASES = ["spread_home", "home_spread", "spread"]
TOTAL_ALIASES  = ["total", "over_under", "ou", "total_points"]

def _pick_first_col(df: pd.DataFrame, candidates: list[str]) -> str | None:
    for c in candidates:
        if c in df.columns:
            return c
    return None

def _norm_side(val: str | float | int) -> str | None:
    if pd.isna(val):
        return None
    s = str(val).strip().lower()
    if s in ("home", "h"):
        return "Home"
    if s in ("away", "a"):
        return "Away"
    if s in ("over", "o"):
        return "Over"
    if s in ("under", "u"):
        return "Under"
    return None

def _to_float(x):
    try:
        return float(x)
    except Exception:
        return None

def load_season_files(season: str) -> list[Path]:
    return sorted(FINAL_DIR.glob(f"{season}_wk*_final.csv"))

def infer_season_from_args_env() -> str:
    # Prefer CLI arg; next ENV SEASON; else fail with clear error
    if len(sys.argv) >= 2 and str(sys.argv[1]).strip():
        return str(sys.argv[1]).strip()
    env = os.getenv("SEASON", "").strip()
    if env:
        return env
    # Fallback: auto-detect newest by filename
    candidates = sorted(FINAL_DIR.glob("*_wk*_final.csv"))
    if not candidates:
        print("ERROR: No final CSVs found for any season.", file=sys.stderr)
        sys.exit(78)
    newest = max(candidates, key=lambda p: p.stat().st_mtime)
    m = re.match(r"^(\d{4})_wk\d{2}_final\.csv$", newest.name)
    if not m:
        print(f"ERROR: Could not infer season from newest file: {newest.name}", file=sys.stderr)
        sys.exit(78)
    season = m.group(1)
    print(f"Auto-detected season: {season}")
    return season

def main():
    season = infer_season_from_args_env()
    files = load_season_files(season)
    if not files:
        print(f"ERROR: No final CSVs for season {season}", file=sys.stderr)
        sys.exit(78)

    print("=== Inputs ===")
    for p in files:
        print(f"- {p.relative_to(ROOT)}")

    METRICS_DIR.mkdir(parents=True, exist_ok=True)

    # Buckets
    team_ats = {}          # (team, picker) -> [W,L,P]
    team_fade = {}         # (opponent, picker) -> [W,L,P]
    home_away = {}         # (picker, side[Home/Away]) -> [W,L,P]
    totals = {}            # (picker, side[Over/Under]) -> [W,L,P]
    team_totals = {}       # (team, picker, side[Over/Under]) -> [W,L,P]

    processed_rows = 0
    skipped_rows = 0
    skipped_records = []  # dicts with reason, game_id, file, (optional) week

    def tally(d: dict, key, result: str):
        w, l, p = d.get(key, [0, 0, 0])
        if result == "W":
            w += 1
        elif result == "L":
            l += 1
        else:
            p += 1
        d[key] = [w, l, p]

    def grade_ats(home_score, away_score, spread_home, pick_side) -> str | None:
        # returns W/L/P for the side picked (Home/Away)
        hs = _to_float(home_score)
        as_ = _to_float(away_score)
        sp = _to_float(spread_home)
        if hs is None or as_ is None or sp is None or pick_side not in ("Home", "Away"):
            return None
        diff = (hs + sp) - as_
        if abs(diff) < 1e-12:
            return "P"
        home_wins = diff > 0
        if pick_side == "Home":
            return "W" if home_wins else "L"
        else:
            return "L" if home_wins else "W"

    def grade_total(home_score, away_score, total_line, pick_side) -> str | None:
        hs = _to_float(home_score)
        as_ = _to_float(away_score)
        tl = _to_float(total_line)
        if hs is None or as_ is None or tl is None or pick_side not in ("Over", "Under"):
            return None
        s = hs + as_
        if abs(s - tl) < 1e-12:
            return "P"
        is_over = s > tl
        if pick_side == "Over":
            return "W" if is_over else "L"
        else:
            return "L" if is_over else "W"

    # Process each file
    for fpath in files:
        df = pd.read_csv(fpath)
        # Required core columns
        required = ["game_id", "home_team", "away_team", "home_score", "away_score"]
        missing_core = [c for c in required if c not in df.columns]
        if missing_core:
            skipped_rows += len(df)
            for _, r in df.iterrows():
                skipped_records.append({
                    "reason": f"missing core columns: {','.join(missing_core)}",
                    "game_id": r.get("game_id", ""),
                    "week": r.get("week", ""),
                    "file": str(fpath.relative_to(ROOT))
                })
            continue

        spread_col = _pick_first_col(df, SPREAD_ALIASES)
        total_col  = _pick_first_col(df, TOTAL_ALIASES)

        for _, row in df.iterrows():
            gid = row.get("game_id", "")
            week = row.get("week", "")

            # Normalize picks for each picker
            # We accept several column name variants; build a small lookup per picker
            picker_values = {}
            for picker in PICKERS:
                # ATS pick
                ats_candidates = [
                    f"{picker}_spread", f"{picker}_ats", f"{picker}_spread_pick",
                    f"{picker}_Spread", f"{picker}_ATS"
                ]
                ats_val = None
                for c in ats_candidates:
                    if c in df.columns:
                        ats_val = _norm_side(row.get(c))
                        if ats_val in ("Home", "Away"):
                            break
                        ats_val = None
                # Totals pick
                tot_candidates = [
                    f"{picker}_total", f"{picker}_Totals", f"{picker}_total_pick",
                    f"{picker}_OU", f"{picker}_O_U"
                ]
                tot_val = None
                for c in tot_candidates:
                    if c in df.columns:
                        tot_val = _norm_side(row.get(c))
                        if tot_val in ("Over", "Under"):
                            break
                        tot_val = None

                picker_values[picker] = (ats_val, tot_val)

            hs, as_ = row.get("home_score"), row.get("away_score")
            if pd.isna(hs) or pd.isna(as_):
                skipped_rows += 1
                skipped_records.append({
                    "reason": "missing score(s)",
                    "game_id": gid, "week": week, "file": str(fpath.relative_to(ROOT))
                })
                continue

            # ATS grading if we have a spread column
            if spread_col:
                sp = row.get(spread_col)
                for picker in PICKERS:
                    ats_pick, _ = picker_values[picker]
                    if ats_pick is None:
                        # No ATS pick for this picker; not a row skip (could still do totals)
                        pass
                    else:
                        res = grade_ats(hs, as_, sp, ats_pick)
                        if res is None:
                            skipped_rows += 1
                            skipped_records.append({
                                "reason": "ATS grade failed (bad spread or pick)",
                                "game_id": gid, "week": week, "file": str(fpath.relative_to(ROOT))
                            })
                        else:
                            processed_rows += 1
                            # Team for ATS = the team corresponding to the picked side
                            team = row.get("home_team") if ats_pick == "Home" else row.get("away_team")
                            opp  = row.get("away_team") if ats_pick == "Home" else row.get("home_team")
                            tally(team_ats, (team, picker), res)
                            tally(team_fade, (opp, picker), "L" if res == "W" else ("W" if res == "L" else "P"))
                            tally(home_away, (picker, ats_pick), res)

            # Totals grading if we have a total column
            if total_col:
                tl = row.get(total_col)
                for picker in PICKERS:
                    _, tot_pick = picker_values[picker]
                    if tot_pick is None:
                        continue
                    res = grade_total(hs, as_, tl, tot_pick)
                    if res is None:
                        skipped_rows += 1
                        skipped_records.append({
                            "reason": "Totals grade failed (bad total or pick)",
                            "game_id": gid, "week": week, "file": str(fpath.relative_to(ROOT))
                        })
                    else:
                        processed_rows += 1
                        team = row.get("home_team")  # team bucket for totals is arbitrary; keep by home team for stability
                        tally(totals, (picker, tot_pick), res)
                        tally(team_totals, (team, picker, tot_pick), res)

    # --- Write outputs
    def dump_triplets(rows, header, out_name):
        out_path = METRICS_DIR / out_name
        pd.DataFrame(rows, columns=header).to_csv(out_path, index=False)
        return out_path

    # team_ats_by_picker.csv
    rows = []
    for (team, picker), (w, l, p_) in sorted(team_ats.items()):
        games = w + l + p_
        win_pct = round(100.0 * (w / games), 1) if games else 0.0
        rows.append([season, team, picker, w, l, p_, games, win_pct])
    p1 = dump_triplets(rows,
        ["season","team","picker","wins","losses","pushes","games","win_pct"],
        "team_ats_by_picker.csv")

    # team_fade_ats_by_picker.csv
    rows = []
    for (opp, picker), (w, l, p_) in sorted(team_fade.items()):
        games = w + l + p_
        win_pct = round(100.0 * (w / games), 1) if games else 0.0
        rows.append([season, opp, picker, w, l, p_, games, win_pct])
    p2 = dump_triplets(rows,
        ["season","opponent","picker","wins","losses","pushes","games","win_pct"],
        "team_fade_ats_by_picker.csv")

    # home_away_ats_by_picker.csv
    rows = []
    for (picker, side), (w, l, p_) in sorted(home_away.items()):
        games = w + l + p_
        win_pct = round(100.0 * (w / games), 1) if games else 0.0
        rows.append([season, picker, side, w, l, p_, games, win_pct])
    p3 = dump_triplets(rows,
        ["season","picker","side","wins","losses","pushes","games","win_pct"],
        "home_away_ats_by_picker.csv")

    # totals_by_picker.csv
    rows = []
    for (picker, side), (w, l, p_) in sorted(totals.items()):
        games = w + l + p_
        win_pct = round(100.0 * (w / games), 1) if games else 0.0
        rows.append([season, picker, side, w, l, p_, games, win_pct])
    p4 = dump_triplets(rows,
        ["season","picker","side","wins","losses","pushes","games","win_pct"],
        "totals_by_picker.csv")

    # team_totals_by_picker.csv
    rows = []
    for (team, picker, side), (w, l, p_) in sorted(team_totals.items()):
        games = w + l + p_
        win_pct = round(100.0 * (w / games), 1) if games else 0.0
        rows.append([season, team, picker, side, w, l, p_, games, win_pct])
    p5 = dump_triplets(rows,
        ["season","team","picker","side","wins","losses","pushes","games","win_pct"],
        "team_totals_by_picker.csv")

    # Debug: skipped details
    dbg_path = METRICS_DIR / "_debug_skipped_rows.csv"
    if skipped_records:
        pd.DataFrame(skipped_records, columns=["reason","game_id","week","file"]).to_csv(dbg_path, index=False)

    # Console summary
    print("=== Summary ===")
    print(f"Season: {season}")
    print(f"Processed graded rows: {processed_rows}")
    print(f"Skipped rows:         {skipped_rows}")
    if skipped_records:
        # show top few reasons
        by_reason = pd.Series([r["reason"] for r in skipped_records]).value_counts().to_dict()
        print("Skip reasons:", by_reason)
        print(f"Debug file: {dbg_path.relative_to(ROOT)}")

    # Show outputs with row counts
    for pth in (p1, p2, p3, p4, p5):
        try:
            n = sum(1 for _ in open(pth, "r", encoding="utf-8")) - 1
        except Exception:
            n = "?"
        print(f"Wrote {pth.relative_to(ROOT)} (rows: {n})")

if __name__ == "__main__":
    main()
