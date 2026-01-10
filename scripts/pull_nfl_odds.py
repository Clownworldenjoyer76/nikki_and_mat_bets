import os, csv
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

def median(vals):
    x = sorted([v for v in vals if v is not None])
    if not x: return None
    n = len(x)
    return x[n//2] if n % 2 else (x[n//2-1] + x[n//2]) / 2

def week_window_ny(now_ny):
    start = now_ny.replace(hour=0, minute=0, second=0, microsecond=0)
    end = start + timedelta(days=6, hours=23, minutes=59)
    return start.astimezone(timezone.utc), end.astimezone(timezone.utc)

def main():
    now_ny = datetime.now(tz=NY)
    season = now_ny.year
    week = now_ny.isocalendar().week

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
    for ev in events:
        ct = datetime.fromisoformat(ev["commence_time"].replace("Z","+00:00"))
        if not (start_utc <= ct <= end_utc):
            continue

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
                        if o["name"] == home and "point" in o: sh = float(o["point"])
                        if o["name"] == away and "point" in o: sa = float(o["point"])
                elif m["key"] == "totals":
                    for o in m.get("outcomes", []):
                        if "point" in o: tot = float(o["point"]); break
            if sh is not None or tot is not None:
                rows.append([season, week, gid, ct.isoformat(), home, away, book,
                             sh, sa, tot, updated, 0])
                if sh is not None: sh_vals.append(sh)
                if sa is not None: sa_vals.append(sa)
                if tot is not None: tot_vals.append(tot)

        if sh_vals or tot_vals:
            rows.append([season, week, gid, ct.isoformat(), home, away, "CONSENSUS",
                         median(sh_vals), median(sa_vals), median(tot_vals),
                         datetime.now(timezone.utc).isoformat(), 1])

    outdir = "data/weekly"
    os.makedirs(outdir, exist_ok=True)
    out = f"{outdir}/{season}_wk{int(week):02d}_odds.csv" if rows else f"{outdir}/{season}_wk{int(week):02d}_odds_empty.csv"

    with open(out, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["season","week","game_id","commence_time_utc","home_team","away_team",
                    "book","spread_home","spread_away","total","updated_at_utc","is_consensus"])
        w.writerows(rows)
    print(f"Wrote {out}")

if __name__ == "__main__":
    main()
