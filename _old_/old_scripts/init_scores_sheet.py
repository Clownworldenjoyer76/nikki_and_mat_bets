#!/usr/bin/env python3
import csv
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCORES_DIR = ROOT / "docs" / "data" / "scores"

def die(msg, code=78):
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(code)

def main():
    if len(sys.argv) != 3:
        die("Usage: init_scores_sheet.py <week> <season>")

    week = int(sys.argv[1])
    season = int(sys.argv[2])

    if not (1 <= week <= 23):
        die("Week must be 1..23")

    SCORES_DIR.mkdir(parents=True, exist_ok=True)
    out = SCORES_DIR / f"{season}_wk{week:02d}_scores.csv"

    headers = [
        "season","week","game_id","home_team","away_team","home_score","away_score"
    ]

    with out.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(headers)

    print(out)

if __name__ == "__main__":
    main()
