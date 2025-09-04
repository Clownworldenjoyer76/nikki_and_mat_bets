#!/usr/bin/env python3
import csv
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]  # repo root
PICKS_DIR = ROOT / "docs" / "data" / "picks"
SCORES_DIR = ROOT / "docs" / "data" / "scores"
FINAL_DIR = ROOT / "docs" / "data" / "final"

def die(msg: str, code: int = 78):
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(code)

def find_week_files(week_str: str):
    wk = int(week_str)
    if not (1 <= wk <= 18):
        die(f"Week must be 1..18, got: {week_str}")

    wk_tag = f"wk{wk:02d}"

    pick_matches = sorted(PICKS_DIR.glob(f"*_{wk_tag}_picks.csv"))
    score_matches = sorted(SCORES_DIR.glob(f"*_{wk_tag}_scores.csv"))

    if not pick_matches:
        die(f"No picks CSV found for {wk_tag} in {PICKS_DIR}")
    if not score_matches:
        die(f"No scores CSV found for {wk_tag} in {SCORES_DIR}")

    pick_path = max(pick_matches)
    score_path = max(score_matches)

    season_from_picks = extract_season_from_filename(pick_path.name) or guess_season_from_csv(pick_path)
    season_from_scores = extract_season_from_filename(score_path.name) or guess_season_from_csv(score_path)

    if season_from_scores and season_from_scores != season_from_picks:
        print(f"WARNING: Season mismatch ({season_from_picks} vs {season_from_scores}); using {season_from_picks}", file=sys.stderr)

    return season_from_picks, wk_tag, pick_path, score_path

def extract_season_from_filename(name: str):
    m = re.match(r"(?P<season>\d{4})_wk\d{2}_(picks|scores)\.csv$", name)
    return int(m.group("season")) if m else None

def guess_season_from_csv(path: Path):
    try:
        with path.open(newline="", encoding="utf-8") as f:
            rdr = csv.DictReader(f)
            for row in rdr:
                v = row.get("season")
                if v:
                    return int(v)
                break
    except Exception:
        pass
    return None

def read_csv(path: Path):
    with path.open(newline="", encoding="utf-8") as f:
        rdr = csv.DictReader(f)
        rows = list(rdr)
        headers = rdr.fieldnames or []
    return headers, rows

def write_csv(path: Path, headers, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=headers)
        w.writeheader()
        w.writerows(rows)

def main():
    if len(sys.argv) < 2:
        die("Usage: combine_picks_and_scores.py <week-number> (e.g., 1)")

    week_str = sys.argv[1]
    season, wk_tag, picks_path, scores_path = find_week_files(week_str)

    picks_hdr, picks_rows = read_csv(picks_path)
    scores_hdr, scores_rows = read_csv(scores_path)

    if not picks_rows:
        die(f"Picks file has no rows: {picks_path}")
    if not scores_rows:
        die(f"Scores file has no rows: {scores_path}")

    scores_by_gid = {r["game_id"]: r for r in scores_rows}
    for col in ("home_score", "away_score"):
        if col not in scores_hdr:
            scores_hdr.append(col)

    combined_hdr = list(picks_hdr)
    for extra in ("home_score", "away_score"):
        if extra not in combined_hdr:
            combined_hdr.append(extra)

    if "game_id" not in picks_hdr:
        die(f"'game_id' missing in picks CSV: {picks_path}")

    combined_rows = []
    missing_scores = []
    for prow in picks_rows:
        gid = prow.get("game_id", "")
        srow = scores_by_gid.get(gid)
        if not srow:
            missing_scores.append(gid)
            continue
        out = dict(prow)
        out["home_score"] = srow.get("home_score", "")
        out["away_score"] = srow.get("away_score", "")
        combined_rows.append(out)

    if missing_scores:
        print(f"WARNING: {len(missing_scores)} games in picks had no matching score rows: {', '.join(missing_scores)}", file=sys.stderr)

    out_name = f"{season}_{wk_tag}_final.csv"
    out_path = FINAL_DIR / out_name
    write_csv(out_path, combined_hdr, combined_rows)

    print(f"Final CSV written: {out_path.relative_to(ROOT)}")
    print(f"  Picks:  {picks_path.relative_to(ROOT)}")
    print(f"  Scores: {scores_path.relative_to(ROOT)}")
    print(f"  Rows:   {len(combined_rows)}")

if __name__ == "__main__":
    main()
