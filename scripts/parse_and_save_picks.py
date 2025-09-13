#!/usr/bin/env python3
"""
Parse picks from a GitHub Issue body and write CSVs under docs/data/picks/.

- Supports two JSON shapes in the issue body (inside a fenced ```json block):
  A) Game-centric:
     {
       "Away@Home_2025-09-14T17:00:00Z": {
         "mat":   { "spread": "home|away|<num>", "total": "over|under|<num>" },
         "nikki": { "spread": "...",             "total": "..." }
       },
       ...
     }

  B) Picker-centric (your current output):
     {
       "mat": {
         "Away@Home_2025-09-14T17:00:00+00:00": { "spread": "...", "total": "..." },
         ...
       },
       "nikki": {
         "Away@Home_2025-09-14T17:00:00+00:00": { "spread": "...", "total": "..." },
         ...
       }
     }

- Matches games from docs/data/weekly/latest.csv where book == "CONSENSUS" (or is_consensus truthy).
- Normalizes timestamps to "YYYY-MM-DDTHH:MM:SS+00:00" before matching.

Environment:
  BODY_FILE = path to a file containing the issue body (set by the workflow)

Outputs:
  docs/data/picks/{season}_wkXX_picks.csv
  docs/data/picks/latest.csv
  docs/data/picks/history.csv
"""
import csv, json, os, re, sys
from pathlib import Path
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
WEEKLY_LATEST = ROOT / "docs" / "data" / "weekly" / "latest.csv"
PICKS_DIR     = ROOT / "docs" / "data" / "picks"
HISTORY_CSV   = PICKS_DIR / "history.csv"
BODY_FILE     = Path(os.environ.get("BODY_FILE", "issue_body.txt"))

# --------------------------
# Helpers
# --------------------------

def nfl_week_label(csv_week: int) -> int:
    # CSV "week" 36 => NFL Week 1, wrap every 18 weeks
    return ((int(csv_week) - 36) % 18) + 1

def fmt_key(away: str, home: str, iso_norm: str) -> str:
    return f"{away}@{home}_{iso_norm}"

def norm_team(s: str) -> str:
    return (s or "").strip()

def norm_iso_str(ts: str) -> str:
    """
    Normalize ISO timestamps to 'YYYY-MM-DDTHH:MM:SS+00:00' in UTC.
    Accepts Z or +00:00; with or without seconds.
    """
    if not ts:
        return ts
    ts = ts.strip()
    if ts.endswith("Z"):
        ts = ts[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(ts)
    except ValueError:
        # If seconds are missing, insert :00 before offset
        m = re.match(r"^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})([+-]\d{2}:\d{2})$", ts)
        if not m:
            raise
        dt = datetime.fromisoformat(m.group(1) + ":00" + m.group(2))
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S+00:00")

def read_issue_json(body_path: Path) -> dict:
    """
    Pull JSON from a fenced ```json block; if not found, try to parse the whole body.
    Return a dict in GAME-CENTRIC form:
      { "Away@Home_<iso_norm>": { "mat": {...}, "nikki": {...} }, ... }
    """
    if not body_path.exists():
        print(f"ERROR: BODY_FILE '{body_path}' not found.", file=sys.stderr)
        sys.exit(78)

    text = body_path.read_text(encoding="utf-8", errors="ignore")
    m = re.search(r"```json\s*(\{.*?\})\s*```", text, flags=re.S | re.I)
    raw = m.group(1) if m else text.strip()

    try:
        data = json.loads(raw)
    except Exception as e:
        print("ERROR: Unable to parse JSON from issue body.", file=sys.stderr)
        raise

    # Shape B (picker-centric) -> convert to game-centric
    if ("mat" in data or "nikki" in data) and not any("@" in k for k in data.keys()):
        mat_map = data.get("mat", {}) or {}
        nik_map = data.get("nikki", {}) or {}
        combined = {}
        all_keys = set(mat_map.keys()) | set(nik_map.keys())
        for gk in all_keys:
            combined[gk] = {}
            if isinstance(mat_map.get(gk), dict):
                combined[gk]["mat"] = mat_map[gk]
            if isinstance(nik_map.get(gk), dict):
                combined[gk]["nikki"] = nik_map[gk]
        data = combined

    # Normalize game keys' timestamp portion
    out = {}
    for raw_key, obj in data.items():
        if not isinstance(obj, dict) or "_" not in raw_key or "@" not in raw_key:
            continue
        left, ts = raw_key.rsplit("_", 1)
        away, home = left.split("@", 1)
        key = fmt_key(norm_team(away), norm_team(home), norm_iso_str(ts))
        out[key] = {
            "mat":   obj.get("mat", {}) or {},
            "nikki": obj.get("nikki", {}) or {}
        }
    return out

def load_weekly_consensus(latest_csv: Path):
    if not latest_csv.exists():
        print(f"ERROR: Weekly feed not found: {latest_csv}", file=sys.stderr)
        sys.exit(78)
    rows = []
    with latest_csv.open(newline="", encoding="utf-8") as f:
        rdr = csv.DictReader(f)
        for r in rdr:
            if (r.get("book") == "CONSENSUS") or (str(r.get("is_consensus","")).lower() in ("1","true","yes")):
                r["home_team"] = norm_team(r.get("home_team",""))
                r["away_team"] = norm_team(r.get("away_team",""))
                r["commence_time_utc_norm"] = norm_iso_str(r.get("commence_time_utc",""))
                rows.append(r)
    if not rows:
        print("ERROR: No CONSENSUS rows in weekly feed.", file=sys.stderr)
        sys.exit(78)
    return rows

# --------------------------
# Main
# --------------------------

def main():
    picks_map = read_issue_json(BODY_FILE)  # game-centric, normalized ISO keys
    weekly_rows = load_weekly_consensus(WEEKLY_LATEST)

    # Build unique games from the feed
    seen = set()
    games = []
    for r in weekly_rows:
        try:
            season   = int(r["season"])
            csv_week = int(r["week"])
        except Exception:
            continue
        key = fmt_key(r["away_team"], r["home_team"], r["commence_time_utc_norm"])
        if key in seen:
            continue
        seen.add(key)
        games.append({
            "season": season,
            "csv_week": csv_week,
            "game_id": r.get("game_id",""),
            "commence_time_utc": r["commence_time_utc_norm"],
            "home_team": r["home_team"],
            "away_team": r["away_team"],
            "spread_home": r.get("spread_home",""),
            "total": r.get("total",""),
        })

    if not games:
        print("ERROR: No games matched in weekly feed.", file=sys.stderr)
        sys.exit(78)

    # Determine filenames
    season = games[0]["season"]
    nfl_week = nfl_week_label(games[0]["csv_week"])
    PICKS_DIR.mkdir(parents=True, exist_ok=True)
    out_weekly  = PICKS_DIR / f"{season}_wk{nfl_week:02d}_picks.csv"
    out_latest  = PICKS_DIR / "latest.csv"

    # Prepare CSV rows
    fieldnames = [
        "season","week","game_id","commence_time_utc","home_team","away_team",
        "spread_home","total",
        "mat_spread","mat_total","nikki_spread","nikki_total"
    ]
    out_rows = []
    missing = 0

    for g in sorted(games, key=lambda x: x["commence_time_utc"]):
        k = fmt_key(g["away_team"], g["home_team"], g["commence_time_utc"])
        pick = picks_map.get(k)
        mat = (pick or {}).get("mat", {}) or {}
        nik = (pick or {}).get("nikki", {}) or {}
        if pick is None:
            missing += 1

        out_rows.append({
            "season": g["season"],
            "week": nfl_week,
            "game_id": g["game_id"],
            "commence_time_utc": g["commence_time_utc"],
            "home_team": g["home_team"],
            "away_team": g["away_team"],
            "spread_home": g["spread_home"],
            "total": g["total"],
            "mat_spread":   str(mat.get("spread","")),
            "mat_total":    str(mat.get("total","")),
            "nikki_spread": str(nik.get("spread","")),
            "nikki_total":  str(nik.get("total","")),
        })

    # Write weekly and latest
    for path in (out_weekly, out_latest):
        with path.open("w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=fieldnames)
            w.writeheader(); w.writerows(out_rows)

    # Upsert history
    if HISTORY_CSV.exists():
        with HISTORY_CSV.open(newline="", encoding="utf-8") as f:
            rdr = csv.DictReader(f)
            hist = list(rdr)
        existing = {(r["season"], r["week"], r["game_id"]) for r in hist}
        to_add = [r for r in out_rows if (str(r["season"]), str(r["week"]), r["game_id"]) not in existing]
        combined = hist + to_add
    else:
        combined = out_rows

    with HISTORY_CSV.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader(); w.writerows(combined)

    print(f"Wrote:   {out_weekly.relative_to(ROOT)}")
    print(f"Updated: {out_latest.relative_to(ROOT)}")
    print(f"Upserted {HISTORY_CSV.relative_to(ROOT)}")
    if missing:
        print(f"Note: {missing} game(s) had no picks in the issue JSON (after normalization).", file=sys.stderr)

if __name__ == "__main__":
    main()
