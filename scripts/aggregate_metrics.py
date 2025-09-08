#!/usr/bin/env python3
import csv, os, re
from pathlib import Path
from collections import defaultdict

ROOT = Path(__file__).resolve().parents[1]
FINAL_DIR = ROOT / "docs" / "data" / "final"
OUT_DIR = ROOT / "docs" / "data" / "metrics"

PICKERS = ["Mat", "Nikki"]

def die(msg, code=78):
    print(f"ERROR: {msg}")
    raise SystemExit(code)

def norm(s): return (s or "").strip()

def find_col(headers, *alts):
    hset = {h.lower(): h for h in headers}
    # exact
    for a in alts:
        a = a.lower()
        if a in hset: return hset[a]
    # fuzzy contains
    for a in alts:
        a = a.lower()
        for h in headers:
            if a in h.lower(): return h
    return None

def latest_season(files):
    seasons = []
    for f in files:
        m = re.match(r"^(\d{4})_wk\d{2}_final\.csv$", f.name)
        if m: seasons.append(m.group(1))
    return max(seasons) if seasons else None

def to_float(v):
    try: return float(v)
    except: return None

def to_int_pair(hs, as_):
    try:
        return int(hs), int(as_)
    except:
        return None, None

def result_spread(pick_side, spread_home, hs, as_):
    if pick_side not in ("Home", "Away") or spread_home is None or hs is None or as_ is None:
        return None
    margin = (hs + spread_home) - as_
    if margin == 0: return "P"
    covered_home = margin > 0
    if (covered_home and pick_side=="Home") or ((not covered_home) and pick_side=="Away"):
        return "W"
    return "L"

def result_total(pick_side, total_line, hs, as_):
    if pick_side not in ("Over", "Under") or total_line is None or hs is None or as_ is None:
        return None
    total_pts = hs + as_
    if total_pts == total_line: return "P"
    if (pick_side=="Over" and total_pts>total_line) or (pick_side=="Under" and total_pts<total_line):
        return "W"
    return "L"

def pct(w,l,p):
    g = w+l+p
    return (round(100.0*w/g,1) if g else 0.0), g

def write_rows(path, headers, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(headers)
        for r in rows:
            w.writerow(r)

def main():
    season = os.environ.get("SEASON","").strip()
    files = sorted(FINAL_DIR.glob("*_wk??_final.csv"))
    if not files: die(f"No final CSV files found in {FINAL_DIR}")
    if not season:
        season = latest_season(files) or ""
    if not season: die("Could not determine season; set SEASON env or ensure filenames like 2025_wk01_final.csv")

    season_files = [f for f in files if f.name.startswith(season + "_")]
    if not season_files: die(f"No final CSVs for season {season}")

    # Buckets
    team_ats = defaultdict(lambda:(0,0,0))         # (team, picker)
    team_fade = defaultdict(lambda:(0,0,0))        # (opponent, picker)
    home_away = defaultdict(lambda:(0,0,0))        # (picker, side)
    totals = defaultdict(lambda:(0,0,0))           # (picker, side)
    team_totals = defaultdict(lambda:(0,0,0))      # (team, picker, side)

    total_rows=0; graded_rows=0
    skipped_no_scores=0; skipped_no_picks=0
    debug_samples=[]

    for f in season_files:
        with f.open("r", encoding="utf-8", newline="") as fh:
            reader = csv.DictReader(fh)
            headers = reader.fieldnames or []

            # map columns
            col_home_team = find_col(headers, "home_team")
            col_away_team = find_col(headers, "away_team")
            col_spread_home = find_col(headers, "spread_home","home_spread","spread")
            col_total = find_col(headers, "total","over_under","ou","total_points")
            col_home_score = find_col(headers, "home_score","score_home")
            col_away_score = find_col(headers, "away_score","score_away")

            # picks (support many variants)
            pick_cols = {}
            for p in PICKERS:
                pl = p.lower()
                pick_cols[f"{p}_spread"] = find_col(headers,
                    f"{pl}_spread", f"{pl}_spread_pick", f"{p} Spread", f"{p}_Spread")
                pick_cols[f"{p}_total"] = find_col(headers,
                    f"{pl}_total", f"{pl}_total_pick", f"{p} Total", f"{p}_Total")

            for row in reader:
                total_rows += 1

                ht = norm(row.get(col_home_team,""))
                at = norm(row.get(col_away_team,""))
                sh = to_float(row.get(col_spread_home,""))
                tot = to_float(row.get(col_total,""))
                hs, as_ = to_int_pair(row.get(col_home_score,""), row.get(col_away_score,""))

                has_any_pick=False
                for p in PICKERS:
                    ps = norm(row.get(pick_cols.get(f"{p}_spread","") or "", "")).capitalize()
                    pt = norm(row.get(pick_cols.get(f"{p}_total","") or "", "")).capitalize()
                    if ps in ("Home","Away") or pt in ("Over","Under"):
                        has_any_pick=True

                if hs is None or as_ is None:
                    skipped_no_scores += 1
                    if len(debug_samples)<5:
                        debug_samples.append(f"{f.name}: skipped(no scores) {ht} vs {at} | hs='{row.get(col_home_score)}' as='{row.get(col_away_score)}'")
                    continue

                if not has_any_pick:
                    skipped_no_picks += 1
                    if len(debug_samples)<5:
                        debug_samples.append(f"{f.name}: skipped(no picks) {ht} vs {at}")
                    continue

                graded_rows += 1

                # grade each picker
                for p in PICKERS:
                    ps = norm(row.get(pick_cols.get(f"{p}_spread","") or "", "")).capitalize()
                    if ps in ("Home","Away"):
                        res = result_spread(ps, sh, hs, as_)
                        if ps=="Home":
                            chosen, faded, side = ht, at, "home"
                        else:
                            chosen, faded, side = at, ht, "away"
                        w,l,push = team_ats[(chosen,p)]
                        if   res=="W": w+=1
                        elif res=="L": l+=1
                        elif res=="P": push+=1
                        team_ats[(chosen,p)]=(w,l,push)

                        w,l,push = team_fade[(faded,p)]
                        if   res=="W": w+=1
                        elif res=="L": l+=1
                        elif res=="P": push+=1
                        team_fade[(faded,p)]=(w,l,push)

                        w,l,push = home_away[(p,side)]
                        if   res=="W": w+=1
                        elif res=="L": l+=1
                        elif res=="P": push+=1
                        home_away[(p,side)]=(w,l,push)

                    pt = norm(row.get(pick_cols.get(f"{p}_total","") or "", "")).capitalize()
                    if pt in ("Over","Under"):
                        res = result_total(pt, tot, hs, as_)
                        w,l,push = totals[(p,pt.lower())]
                        if   res=="W": w+=1
                        elif res=="L": l+=1
                        elif res=="P": push+=1
                        totals[(p,pt.lower())]=(w,l,push)

                        for team in (ht, at):
                            w,l,push = team_totals[(team,p,pt.lower())]
                            if   res=="W": w+=1
                            elif res=="L": l+=1
                            elif res=="P": push+=1
                            team_totals[(team,p,pt.lower())]=(w,l,push)

    # Write outputs
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    def pct_and_games(w,l,p):
        g = w+l+p
        return g, (round(100.0*w/g,1) if g else 0.0)

    rows=[]
    for (team,picker),(w,l,p) in sorted(team_ats.items()):
        g,wp = pct_and_games(w,l,p)
        rows.append([season,team,picker,w,l,p,g,wp])
    write_rows(OUT_DIR/"team_ats_by_picker.csv",
               ["season","team","picker","wins","losses","pushes","games","win_pct"], rows)

    rows=[]
    for (opp,picker),(w,l,p) in sorted(team_fade.items()):
        g,wp = pct_and_games(w,l,p)
        rows.append([season,opp,picker,w,l,p,g,wp])
    write_rows(OUT_DIR/"team_fade_ats_by_picker.csv",
               ["season","opponent","picker","wins","losses","pushes","games","win_pct"], rows)

    rows=[]
    for (picker,side),(w,l,p) in sorted(home_away.items()):
        g,wp = pct_and_games(w,l,p)
        rows.append([season,picker,side,w,l,p,g,wp])
    write_rows(OUT_DIR/"home_away_ats_by_picker.csv",
               ["season","picker","side","wins","losses","pushes","games","win_pct"], rows)

    rows=[]
    for (picker,side),(w,l,p) in sorted(totals.items()):
        g,wp = pct_and_games(w,l,p)
        rows.append([season,picker,side,w,l,p,g,wp])
    write_rows(OUT_DIR/"totals_by_picker.csv",
               ["season","picker","side","wins","losses","pushes","games","win_pct"], rows)

    rows=[]
    for (team,picker,side),(w,l,p) in sorted(team_totals.items()):
        g,wp = pct_and_games(w,l,p)
        rows.append([season,team,picker,side,w,l,p,g,wp])
    write_rows(OUT_DIR/"team_totals_by_picker.csv",
               ["season","team","picker","side","wins","losses","pushes","games","win_pct"], rows)

    print(f"Season {season}: processed files={len(season_files)} rows_total={total_rows} graded_rows={graded_rows} skipped_no_scores={skipped_no_scores} skipped_no_picks={skipped_no_picks}")
    if debug_samples:
        print("Examples of skipped rows:")
        for s in debug_samples:
            print("  - " + s)

if __name__ == "__main__":
    main()
