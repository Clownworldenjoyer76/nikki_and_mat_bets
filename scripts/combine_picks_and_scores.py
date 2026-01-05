#!/usr/bin/env python3
import csv
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PICKS_DIR = ROOT / "docs" / "data" / "picks"
SCORES_DIR = ROOT / "docs" / "data" / "scores"
FINAL_DIR = ROOT / "docs" / "data" / "final"

def die(msg, code=78):
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(code)

def main():
    if len(sys.argv) != 3:
        die("Usage: combine_picks_and_scores.py <week> <season>")

    week = int(sys.argv[1])
    season = int(sys.argv[2])

    if not (1 <= week <= 23):
        die("Week must be 1..23")

    wk = f"wk{week:02d}"
    pick = PICKS_DIR / f"{season}_{wk}_picks.csv"
    score = SCORES_DIR / f"{season}_{wk}_scores.csv"

    if not pick.exists():
        die(f"Missing picks file: {pick}")
    if not score.exists():
        die(f"Missing scores file: {score}")

    with pick.open(newline="", encoding="utf-8") as f:
        pr = csv.DictReader(f)
        picks = list(pr)
        ph = pr.fieldnames or []

    with score.open(newline="", encoding="utf-8") as f:
        sr = csv.DictReader(f)
        scores = {r["game_id"]: r for r in sr}

    FINAL_DIR.mkdir(parents=True, exist_ok=True)
    out = FINAL_DIR / f"{season}_{wk}_final.csv"
    headers = list(dict.fromkeys(ph + ["season","week","home_score","away_score"]))

    with out.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=headers)
        w.writeheader()
        for r in picks:
            gid = r.get("game_id")
            if gid in scores:
                o = dict(r)
                o["season"] = season
                o["week"] = week
                o["home_score"] = scores[gid].get("home_score")
                o["away_score"] = scores[gid].get("away_score")
                w.writerow(o)

    print(out)

if __name__ == "__main__":
    main()
