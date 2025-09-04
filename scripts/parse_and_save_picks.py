#!/usr/bin/env python3
import csv, json, os, re, sys
from pathlib import Path
from datetime import datetime

ROOT = Path(__file__).resolve().parents[1]  # repo root
LATEST_CSV = ROOT / "docs" / "data" / "weekly" / "latest.csv"
PICKS_DIR = ROOT / "docs" / "data" / "picks"
HISTORY = PICKS_DIR / "history.csv"
BODY_FILE = Path(os.environ.get("BODY_FILE", "issue_body.txt"))

def nfl_week_label(csv_week: int) -> int:
    # CSV "week" 36 => NFL Week 1
    return ((int(csv_week) - 36) % 18) + 1

def fmt_key(away: str, home: str, iso: str) -> str:
    return f"{away}@{home}_{iso}"

def parse_issue_body(path: Path) -> dict:
    text = path.read_text(encoding="utf-8", errors="ignore")
    m = re.search(r"```json\s*(\{.*?\})\s*```", text, flags=re.S | re.I)
    if not m:
        print("ERROR: no JSON code block found in issue body.", file=sys.stderr)
        sys.exit(78)
    return json.loads(m.group(1))

def load_latest_rows(latest_csv: Path):
    with latest_csv.open(newline="", encoding="utf-8") as f:
        rdr = csv.DictReader(f)
        rows = list(rdr)
    if not rows:
        print("ERROR: latest.csv is empty.", file=sys.stderr); sys.exit(78)
    return rows

def main():
    if not LATEST_CSV.exists():
        print(f"ERROR: {LATEST_CSV} not found.", file=sys.stderr); sys.exit(78)
    if not BODY_FILE.exists():
        print(f"ERROR: {BODY_FILE} not found.", file=sys.stderr); sys.exit(78)

    picks_by_game = parse_issue_body(BODY_FILE)  # { key: { mat:{spread,total}, nikki:{spread,total} } }
    weekly_rows = load_latest_rows(LATEST_CSV)

    # Build map game key -> weekly info (CONSENSUS rows are fine; dedupe by game_id+time)
    seen_keys = set()
    games = []
    for r in weekly_rows:
        season = int(r["season"])
        csv_week = int(r["week"])
        when_iso = r["commence_time_utc"]
        home = r["home_team"]
        away = r["away_team"]
        key = fmt_key(away, home, when_iso)
        if key in seen_keys:
            continue
        seen_keys.add(key)
        games.append({
            "season": season,
            "csv_week": csv_week,
            "game_id": r.get("game_id",""),
            "commence_time_utc": when_iso,
            "home_team": home,
            "away_team": away,
        })

    # Determine labels
    season = games[0]["season"]
    nfl_week = nfl_week_label(games[0]["csv_week"])
    PICKS_DIR.mkdir(parents=True, exist_ok=True)
    out_name = f"{season}_wk{nfl_week:02d}_picks.csv"
    OUT_FILE = PICKS_DIR / out_name
    OUT_LATEST = PICKS_DIR / "latest.csv"

    # Compose output rows
    fieldnames = [
        "season","week","game_id","commence_time_utc","home_team","away_team",
        "mat_spread","mat_total","nikki_spread","nikki_total"
    ]
    out_rows = []
    for g in sorted(games, key=lambda x: x["commence_time_utc"]):
        k = fmt_key(g["away_team"], g["home_team"], g["commence_time_utc"])
        pick = picks_by_game.get(k, {})
        mat = pick.get("mat", {})
        nik = pick.get("nikki", {})
        out_rows.append({
            "season": g["season"],
            "week": nfl_week,
            "game_id": g["game_id"],
            "commence_time_utc": g["commence_time_utc"],
            "home_team": g["home_team"],
            "away_team": g["away_team"],
            "mat_spread": mat.get("spread") or "",
            "mat_total":  mat.get("total")  or "",
            "nikki_spread": nik.get("spread") or "",
            "nikki_total":  nik.get("total")  or "",
        })

    # Write weekly file
    with OUT_FILE.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader(); w.writerows(out_rows)

    # Update "latest.csv"
    with OUT_LATEST.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader(); w.writerows(out_rows)

    # Update history.csv (append non-duplicates)
    if HISTORY.exists():
        # load existing rows into a set of keys (season, week, game_id)
        with HISTORY.open(newline="", encoding="utf-8") as f:
            rdr = csv.DictReader(f)
            hist = list(rdr)
        existing = {(r["season"], r["week"], r["game_id"]) for r in hist}
        to_add = [r for r in out_rows if (str(r["season"]), str(r["week"]), r["game_id"]) not in existing]
        all_rows = hist + to_add
    else:
        all_rows = out_rows

    with HISTORY.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader(); w.writerows(all_rows)

    print(f"Wrote: {OUT_FILE.relative_to(ROOT)}")
    print(f"Updated: {OUT_LATEST.relative_to(ROOT)}")
    print(f"Upserted history: {HISTORY.relative_to(ROOT)}")

if __name__ == "__main__":
    main()
