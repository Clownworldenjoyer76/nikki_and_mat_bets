#!/usr/bin/env python3

import os
import re
import csv
import sys
from pathlib import Path
from datetime import datetime, timedelta, timezone
from dateutil import tz
import requests

API_KEY = os.environ.get("ODDS_API_KEY")
if not API_KEY:
    print("ERROR: ODDS_API_KEY env var is required", file=sys.stderr)
    sys.exit(1)

SPORT = "americanfootball_nfl"
BASE = "https://api.the-odds-api.com/v4"
REGION = "us"
MARKETS = "spreads,totals"
ODDS_FMT = "american"

NY = tz.gettz("America/New_York")

OUTDIR = Path("docs/data/weekly")
LATEST_PATH = OUTDIR / "latest.csv"

HEADERS = [
    "season",
    "week",
    "game_id",
    "commence_time_utc",
    "home_team",
    "away_team",
    "book",
    "spread_home",
    "spread_away",
    "total",
    "updated_at_utc",
    "is_consensus",
]

FNAME_RE = re.compile(r"^(?P<season>\d{4})_wk(?P<wk>\d{2})_odds\.csv$")


def die(msg: str, code: int = 1):
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(code)


def median(vals):
    x = sorted(v for v in vals if v is not None)
    if not x:
        return None
    n = len(x)
    return x[n // 2] if n % 2 else (x[n // 2 - 1] + x[n // 2]) / 2


def latest_existing_season_week(outdir: Path):
    if not outdir.exists():
        return None

    best = None  # tuple (season:int, week:int)
    for p in outdir.glob("*_wk*_odds.csv"):
        m = FNAME_RE.match(p.name)
        if not m:
            continue
        s = int(m.group("season"))
        w = int(m.group("wk"))
        if best is None or (s, w) > best:
            best = (s, w)
    return best


def choose_label_season_week():
    # Prefer explicit env vars if provided
    s_env = os.environ.get("NFL_SEASON", "").strip()
    w_env = os.environ.get("NFL_WEEK", "").strip()

    if s_env and w_env:
        if not (s_env.isdigit() and w_env.isdigit()):
            die("NFL_SEASON and NFL_WEEK must be numeric if provided")
        return int(s_env), int(w_env)

    # Otherwise, reuse the latest existing week file in docs/data/weekly
    best = latest_existing_season_week(OUTDIR)
    if best:
        return best

    die("No existing *_wk##_odds.csv found in docs/data/weekly and NFL_SEASON/NFL_WEEK not provided")


def main():
    season, week = choose_label_season_week()

    params = {
        "apiKey": API_KEY,
        "regions": REGION,
        "markets": MARKETS,
        "oddsFormat": ODDS_FMT,
        "dateFormat": "iso",
    }

    resp = requests.get(f"{BASE}/sports/{SPORT}/odds", params=params, timeout=30)
    resp.raise_for_status()
    events = resp.json()

    if not events:
        die("No events returned from odds API")

    # Define the "current week window" based on the earliest event returned (not 'now')
    ct_ny_list = []
    for ev in events:
        ct = datetime.fromisoformat(ev["commence_time"].replace("Z", "+00:00"))
        ct_ny_list.append(ct.astimezone(NY))

    earliest_ny = min(ct_ny_list)
    start_ny = earliest_ny.replace(hour=0, minute=0, second=0, microsecond=0)
    end_ny = start_ny + timedelta(days=6, hours=23, minutes=59)

    start_utc = start_ny.astimezone(timezone.utc)
    end_utc = end_ny.astimezone(timezone.utc)

    rows = []

    for ev in events:
        ct = datetime.fromisoformat(ev["commence_time"].replace("Z", "+00:00"))
        if not (start_utc <= ct <= end_utc):
            continue

        home = ev.get("home_team")
        away = ev.get("away_team")
        gid = ev.get("id")
        updated = ev.get("last_update", datetime.now(timezone.utc).isoformat())

        sh_vals, sa_vals, tot_vals = [], [], []

        for bk in ev.get("bookmakers", []):
            book = bk.get("title", "")
            sh = sa = tot = None

            for m in bk.get("markets", []):
                if m.get("key") == "spreads":
                    for o in m.get("outcomes", []):
                        nm = o.get("name")
                        if nm == home and "point" in o:
                            sh = float(o["point"])
                        elif nm == away and "point" in o:
                            sa = float(o["point"])
                elif m.get("key") == "totals":
                    for o in m.get("outcomes", []):
                        if "point" in o:
                            tot = float(o["point"])
                            break

            if sh is not None or tot is not None:
                rows.append([
                    season,
                    week,
                    gid,
                    ct.isoformat(),
                    home,
                    away,
                    book,
                    sh,
                    sa,
                    tot,
                    updated,
                    0,
                ])
                if sh is not None:
                    sh_vals.append(sh)
                if sa is not None:
                    sa_vals.append(sa)
                if tot is not None:
                    tot_vals.append(tot)

        if sh_vals or tot_vals:
            rows.append([
                season,
                week,
                gid,
                ct.isoformat(),
                home,
                away,
                "CONSENSUS",
                median(sh_vals),
                median(sa_vals),
                median(tot_vals),
                datetime.now(timezone.utc).isoformat(),
                1,
            ])

    OUTDIR.mkdir(parents=True, exist_ok=True)

    week_tag = f"{week:02d}"
    week_file = OUTDIR / f"{season}_wk{week_tag}_odds.csv"

    # Write the per-week file
    with week_file.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(HEADERS)
        w.writerows(rows)

    # Overwrite latest.csv with THIS week's file content
    with LATEST_PATH.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(HEADERS)
        w.writerows(rows)

    print(f"Wrote {week_file} ({len(rows)} rows)")
    print(f"Wrote {LATEST_PATH} ({len(rows)} rows)")


if __name__ == "__main__":
    main()
