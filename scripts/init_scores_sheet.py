#!/usr/bin/env python3
import csv
from pathlib import Path

# Paths
ROOT = Path(__file__).resolve().parents[1]       # repo root
LATEST = ROOT / "docs" / "data" / "weekly" / "latest.csv"
OUT_DIR = ROOT / "docs" / "data" / "scores"

# CSV week 36 == NFL Week 1
def nfl_week_label(csv_week: int) -> int:
    return ((int(csv_week) - 36) % 18) + 1

def main():
    if not LATEST.exists():
        raise FileNotFoundError(f"Missing {LATEST}")

    # Load only CONSENSUS rows (or those marked as consensus)
    with LATEST.open(newline="", encoding="utf-8") as f:
        rdr = csv.DictReader(f)
        rows = [
            r for r in rdr
            if (r.get("book") == "CONSENSUS" or str(r.get("is_consensus","")).lower() in ("1","true"))
        ]

    if not rows:
        raise RuntimeError("No CONSENSUS rows found in weekly latest.csv")

    # Figure out naming from the first row
    season = int(rows[0]["season"])
    csv_week = int(rows[0]["week"])
    nfl_week = nfl_week_label(csv_week)

    # Deduplicate by (game_id)
    seen = set()
    games = []
    for r in rows:
        gid = r.get("game_id", "")
        if gid in seen:
            continue
        seen.add(gid)
        games.append({
            "game_id":  gid,
            "home_team": r.get("home_team",""),
            "away_team": r.get("away_team",""),
        })

    # Prepare output
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUT_DIR / f"{season}_wk{nfl_week:02d}_scores.csv"

    # Required headers (scores intentionally blank)
    fieldnames = ["game_id", "home_team", "away_team", "home_score", "away_score"]

    with out_path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for g in games:
            w.writerow({
                "game_id": g["game_id"],
                "home_team": g["home_team"],
                "away_team": g["away_team"],
                "home_score": "",
                "away_score": "",
            })

    print(f"Wrote: {out_path.relative_to(ROOT)}")

if __name__ == "__main__":
    main()
