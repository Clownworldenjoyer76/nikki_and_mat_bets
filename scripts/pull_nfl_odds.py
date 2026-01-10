#!/usr/bin/env python3
import os
import csv
from datetime import datetime, timedelta, timezone
from dateutil import tz
import requests

API_KEY = os.environ["ODDS_API_KEY"]
SPORT = "americanfootball_nfl"
BASE = "https://api.the-odds-api.com/v4"
REGION = "us"
MARKETS = "spreads,totals"
ODDS_FMT = "american"

NY = tz.gettz("America/New_York")

# ---------------- NFL CALENDAR RULES ----------------
# NFL regular season starts the week containing the first Thursday of September
# Playoffs:
#   WC   = week 19
#   DIV  = week 20
#   CONF = week 21
#   SB   = week 22

def nfl_season_start(year: int) -> datetime:
    """Return kickoff datetime (NY) of NFL Week 1 for a given season year."""
    d = datetime(year, 9, 1, tzinfo=NY)
    while d.weekday() != 3:  # Thursday
        d += timedelta(days=1)
    return d.replace(hour=20, minute=20, second=0, microsecond=0)

def nfl_season_and_week(kickoff_utc: datetime):
    """Given a game kickoff (UTC), return (nfl_season, nfl_week)."""
    kickoff_ny = kickoff_utc.astimezone(NY)
    year = kickoff_ny.year

    # If Jan/Feb, NFL season is previous calendar year
    if kickoff_ny.month <= 2:
        season = year - 1
    else:
        season = year

    week1 = nfl_season_start(season)
    delta_days = (kickoff_ny - week1).days
    week = delta_days // 7 + 1

    # Clamp to playoff weeks
    if week < 1:
        week = 1
    if week > 22:
        week = 22

    return season, week

def median(vals):
    x = sorted([v for v in vals if v is not None])
    if not x:
        return None
    n = len(x)
    return x[n//2] if n % 2 else (x[n//2-1] + x[n//2]) / 2

def week_window_ny(now_ny):
    start = now_ny.replace(hour=0, minute=0, second=0, microsecond=0)
    end = start + timedelta(days=6, hours=23, minutes=59)
    return start.astimezone(timezone.utc), end.astimezone(timezone.utc)

def main():
    now_ny = datetime.now(tz=NY)
    start_utc, end_utc = week_window_ny(now_ny)

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

    rows = []
    season_written = None
    week_written = None

    for ev in events:
        ct = datetime.fromisoformat(ev["commence_time"].replace("Z", "+00:00"))
        if not (start_utc <= ct <= end_utc):
            continue

        nfl_season, nfl_week = nfl_season_and_week(ct)
        season_written = nfl_season
        week_written = nfl_week

        home, away = ev.get("home_team"), ev.get("away_team")
        gid = ev.get("id")
        updated = ev.get("last_update", datetime.now(timezone.utc).isoformat())

        sh_vals, sa_vals, tot_vals = [], [], []

        for bk in ev.get("bookmakers", []):
            book = bk["title"]
            sh = sa = tot = None

            for m in bk.get("markets", []):
                if m["key"] == "spreads":
                    for o in m.get("outcomes", []):
                        if o["name"] == home and "point" in o:
                            sh = float(o["point"])
                        if o["name"] == away and "point" in o:
                            sa = float(o["point"])
                elif m["key"] == "totals":
                    for o in m.get("outcomes", []):
                        if "point" in o:
                            tot = float(o["point"])
                            break

            if sh is not None or tot is not None:
                rows.append([
                    nfl_season,
                    nfl_week,
                    gid,
                    ct.isoformat(),
                    home,
                    away,
                    book,
                    sh,
                    sa,
                    tot,
                    updated,
                    0
                ])
                if sh is not None: sh_vals.append(sh)
                if sa is not None: sa_vals.append(sa)
                if tot is not None: tot_vals.append(tot)

        if sh_vals or tot_vals:
            rows.append([
                nfl_season,
                nfl_week,
                gid,
                ct.isoformat(),
                home,
                away,
                "CONSENSUS",
                median(sh_vals),
                median(sa_vals),
                median(tot_vals),
                datetime.now(timezone.utc).isoformat(),
                1
            ])

    outdir = "docs/data/weekly"
    os.makedirs(outdir, exist_ok=True)

    if rows and season_written is not None and week_written is not None:
        out = f"{outdir}/{season_written}_wk{int(week_written):02d}_odds.csv"
    else:
        out = f"{outdir}/empty.csv"

    with open(out, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow([
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
            "is_consensus"
        ])
        w.writerows(rows)

    print(f"Wrote {out}")

if __name__ == "__main__":
    main()
