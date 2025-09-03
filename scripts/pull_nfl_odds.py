import os, csv, math, time, json
from datetime import datetime, timedelta, timezone
from dateutil import tz
import requests

API_KEY = os.environ["ODDS_API_KEY"]
SPORT = "americanfootball_nfl"
BASE = "https://api.the-odds-api.com/v4"
REGION = "us"
MARKETS = "spreads,totals"
ODDS_FMT = "american"
DATE_FMT = "iso"

NY = tz.gettz("America/New_York")

def current_season(dt):
    # NFL season labeled by the year the regular season starts
    return dt.astimezone(NY).year

def nfl_week_start_end(now_ny):
    # Run Tuesdays 06:00 NY; capture games Tue 00:00 through next Mon 23:59 NY
    start = now_ny.replace(hour=0, minute=0, second=0, microsecond=0)
    end = (start + timedelta(days=6, hours=23, minutes=59))
    return start, end

def median(nums):
    a = sorted([n for n in nums if n is not None])
    if not a: return None
    n = len(a)
    mid = n//2
    return (a[mid] if n%2==1 else (a[mid-1]+a[mid])/2)

def main():
    now = datetime.now(tz=NY)
    season = current_season(now)
    start_ny, end_ny = nfl_week_start_end(now)
    start_utc = start_ny.astimezone(timezone.utc)
    end_utc   = end_ny.astimezone(timezone.utc)

    params = {
        "apiKey": API_KEY,
        "regions": REGION,
        "markets": MARKETS,
        "oddsFormat": ODDS_FMT,
        "dateFormat": DATE_FMT
    }
    url = f"{BASE}/sports/{SPORT}/odds"
    resp = requests.get(url, params=params, timeout=30)
    resp.raise_for_status()
    events = resp.json()

    rows = []
    for ev in events:
        ct = datetime.fromisoformat(ev["commence_time"].replace("Z","+00:00"))
        if not (start_utc <= ct <= end_utc):
            continue

        home = ev.get("home_team")
        away = ev.get("away_team")
        gid  = ev.get("id")
        updated = ev.get("last_update", datetime.now(timezone.utc).isoformat())

        # collect book-level lines
        spread_home_vals, spread_away_vals, total_vals = [], [], []
        for bk in ev.get("bookmakers", []):
            book = bk["title"]
            # find latest market values
            spread_home, spread_away, total = None, None, None
            for m in bk.get("markets", []):
                if m["key"] == "spreads" and m.get("outcomes"):
                    for o in m["outcomes"]:
                        if o["name"] == home and "point" in o: spread_home = float(o["point"])
                        if o["name"] == away and "point" in o: spread_away = float(o["point"])
                if m["key"] == "totals" and m.get("outcomes"):
                    # outcomes: Over/Under, each with "point"
                    if "point" in m["outcomes"][0]:
                        total = float(m["outcomes"][0]["point"])
            # record book row if we have something
            if spread_home is not None or total is not None:
                rows.append([season, "", gid, ct.isoformat(), home, away, book,
                             spread_home, spread_away, total, updated, 0])
                if spread_home is not None: spread_home_vals.append(spread_home)
                if spread_away is not None: spread_away_vals.append(spread_away)
                if total is not None: total_vals.append(total)

        # consensus row
        if spread_home_vals or total_vals:
            rows.append([season, "", gid, ct.isoformat(), home, away, "CONSENSUS",
                         median(spread_home_vals), median(spread_away_vals), median(total_vals),
                         datetime.now(timezone.utc).isoformat(), 1])

    # infer week sequentially by Tuesday count in season (simple; tweak if you want exact NFL wk)
    # store as current NY week-of-year anchor
    for r in rows:
        r[1] = datetime.now(NY).isocalendar().week

    outdir = "data/weekly"
    os.makedirs(outdir, exist_ok=True)
    out = f"{outdir}/{season}_wk{int(rows[0][1]):02d}_odds.csv" if rows else f"{outdir}/{season}_wk_unknown_odds.csv"

    with open(out, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["season","week","game_id","commence_time_utc","home_team","away_team",
                    "book","spread_home","spread_away","total","updated_at_utc","is_consensus"])
        w.writerows(rows)
    print(f"Wrote {out}")

if __name__ == "__main__":
    main()
