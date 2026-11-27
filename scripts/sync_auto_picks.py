#!/usr/bin/env python3
"""Manually submit missing AutoPicks NFL selections. Python 3.11+, stdlib only."""
import argparse
import csv
import hashlib
import io
import json
import os
import re
import sys
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import HTTPRedirectHandler, Request, build_opener, urlopen
from uuid import UUID

ROOT = Path(__file__).resolve().parents[1]
PROJECT_URL = "https://qbxwresgflqmvxzwaqqu.supabase.co"
SOURCE = ("https://raw.githubusercontent.com/Clownworldenjoyer76/"
          "football_for_mat/main/docs/win/football/nfl/03_picks/nmbets/")
ACCOUNT = "AutoPicks"


def require(condition, message):
    if not condition:
        raise ValueError(message)


def number(value):
    result = Decimal(str(value).strip())
    require(result.is_finite(), "Non-finite numeric value")
    return result


def utc(value):
    result = datetime.fromisoformat(value.replace("Z", "+00:00"))
    require(result.tzinfo is not None, "Kickoff timestamp lacks timezone")
    return result.astimezone(timezone.utc)


def csv_rows(raw, fields):
    reader = csv.DictReader(io.StringIO(raw.decode("utf-8-sig"), newline=""))
    headers = reader.fieldnames or []
    require(len(set(headers)) == len(headers), "Duplicate CSV headers")
    require(set(fields).issubset(headers), "Missing CSV headers: " +
            ", ".join(sorted(set(fields) - set(headers))))
    rows = list(reader)
    require(rows and all(None not in r and all(v is not None for v in r.values())
                         for r in rows), "Empty or malformed CSV")
    return rows


def match_key(day, away, home):
    day = date.fromisoformat(day.strip().replace("_", "-"))
    away, home = away.strip(), home.strip()
    require(away and home and away != home, "Invalid team names")
    return day, away, home


def unique_index(rows, key, label):
    result = {}
    for row in rows:
        k = key(row)
        require(k not in result, f"Duplicate {label}: {k}")
        result[k] = row
    return result


def select_picks(margin, total, home_line, away_line, over_line, under_line):
    """A matching line includes equality; never round. Home/over win dual matches."""
    home = margin + home_line >= 0
    away = -margin + away_line >= 0
    over = total >= over_line
    under = total <= under_line
    require(home or away, "Neither spread matches projection")
    require(over or under, "Neither total matches projection")
    return ("home" if home else "away", "over" if over else "under")


def build_plan(projections_raw, odds_raw, season, week):
    projections = csv_rows(projections_raw, ("Date", "Away_Team", "Home_Team",
                                             "Predicted_Margin", "Predicted_Total"))
    odds = csv_rows(odds_raw, ("season", "week", "game_id", "game_date",
                              "away_team", "home_team", "commence_time_utc",
                              "is_consensus", "spread_home", "spread_away", "total",
                              "total_over", "total_under"))
    odds = [r for r in odds if r["is_consensus"].strip() == "1"]
    require(odds and all(int(r["season"]) == season and int(r["week"]) == week
                         for r in odds), "latest.csv does not match selected season/week")
    by_match = unique_index(projections, lambda r: match_key(
        r["Date"], r["Away_Team"], r["Home_Team"]), "projection matchup")
    odds_by_match = unique_index(odds, lambda r: match_key(
        r["game_date"], r["away_team"], r["home_team"]), "odds matchup")
    require(by_match.keys() == odds_by_match.keys(),
            f"Matchup mismatch: projection-only={sorted(by_match.keys()-odds_by_match.keys())}; "
            f"odds-only={sorted(odds_by_match.keys()-by_match.keys())}")
    unique_index(odds, lambda r: r["game_id"], "CSV game ID")
    plan = []
    for key, line in odds_by_match.items():
        projection = by_match[key]
        raw_margin = projection["Predicted_Margin"].strip()
        match = re.fullmatch(r"([+-]?\d+(?:\.\d+)?)\s+Home", raw_margin)
        require(match is not None, f"Invalid home margin for {key}: {raw_margin}")
        margin = number(match.group(1))
        total = number(projection["Predicted_Total"])
        require(total >= 0, f"Negative predicted total for {key}")
        home_line, away_line, over_line, under_line = (
            number(line[field]) for field in ("spread_home", "spread_away", "total_over", "total_under"))
        try:
            spread, total_pick = select_picks(margin, total, home_line, away_line,
                                               over_line, under_line)
        except ValueError as error:
            raise ValueError(f"{key}: {error}") from error
        require(line["game_id"].strip(), "Blank CSV game ID")
        plan.append(dict(game_id=line["game_id"], away_team=key[1], home_team=key[2],
                         kickoff=utc(line["commence_time_utc"]), home_line=home_line,
                         database_total=number(line["total"]), spread_pick=spread,
                         total_pick=total_pick))
    return plan


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class Supabase:
    def __init__(self):
        url = os.environ.get("SUPABASE_URL", "").strip().rstrip("/")
        require(url == PROJECT_URL, "SUPABASE_URL is not the NFL Picks project")
        key = (os.environ.get("SUPABASE_SECRET_KEY", "").strip() or
               os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip())
        require(bool(key), "Missing Supabase server-side API key")
        self.headers = {"apikey": key, "Accept": "application/json"}
        if not key.startswith("sb_secret_"):
            self.headers["Authorization"] = "Bearer " + key
        self.opener = build_opener(NoRedirect())

    def request(self, table, params, rows=None):
        require(table in {"profiles", "games", "picks"}, "Unexpected table")
        require(rows is None or table == "picks", "Writes restricted to picks")
        url = PROJECT_URL + "/rest/v1/" + table + "?" + urlencode(params)
        headers = dict(self.headers)
        body = None
        if rows is not None:
            headers.update({"Content-Type": "application/json",
                            "Prefer": "resolution=ignore-duplicates,return=representation"})
            body = json.dumps(rows).encode("utf-8")
        req = Request(url, data=body, headers=headers, method="POST" if body else "GET")
        try:
            with self.opener.open(req, timeout=45) as response:
                result = json.load(response)
        except HTTPError as error:
            # Avoid echoing response bodies or credentials into public workflow logs.
            raise RuntimeError(f"Supabase {table} HTTP {error.code}") from None
        require(isinstance(result, list), f"Unexpected response from {table}")
        return result


def read_picks(api, user_id, ids):
    return unique_index(api.request("picks", {
        "select": "user_id,game_id,spread_pick,total_pick",
        "user_id": "eq." + user_id, "game_id": "in.(" + ",".join(ids) + ")",
        "limit": "100"}), lambda row: row["game_id"], "saved pick")


def run(api, plan, season, week, submit):
    users = api.request("profiles", {"select": "id,display_name",
                                     "display_name": "eq." + ACCOUNT, "limit": "2"})
    require(len(users) == 1 and users[0]["display_name"] == ACCOUNT,
            "Expected exactly one AutoPicks profile")
    user_id = str(UUID(users[0]["id"]))
    games = api.request("games", {"select": "id,game_id,away_team,home_team,kickoff_utc,spread_home,total,status",
                                  "season": f"eq.{season}", "week": f"eq.{week}",
                                  "week_type": "eq." + ("regular" if week <= 18 else "playoff"),
                                  "limit": "100"})
    by_id = unique_index(games, lambda row: row["game_id"], "Supabase game ID")
    require(set(by_id) == {r["game_id"] for r in plan}, "CSV and Supabase game IDs differ")
    prepared = []
    for row in plan:
        game = by_id[row["game_id"]]
        require((game["away_team"], game["home_team"]) == (row["away_team"], row["home_team"]),
                "Supabase team mismatch: " + row["game_id"])
        require(utc(game["kickoff_utc"]) == row["kickoff"], "Kickoff mismatch: " + row["game_id"])
        require(number(game["spread_home"]) == row["home_line"] and
                number(game["total"]) == row["database_total"],
                "Supabase stored odds differ from CSV: " + row["game_id"])
        prepared.append((row, game, str(UUID(game["id"]))))
    ids = [gid for _, _, gid in prepared]
    require(len(set(ids)) == len(ids), "Duplicate database game UUID")
    existing = read_picks(api, user_id, ids)
    now = datetime.now(timezone.utc)
    missing = []
    locked = unchanged = different = 0
    for row, game, gid in prepared:
        if gid in existing:
            saved = existing[gid]
            if (saved["spread_pick"], saved["total_pick"]) == (row["spread_pick"], row["total_pick"]):
                unchanged += 1
            else:
                different += 1
        elif game["status"] != "scheduled" or row["kickoff"] <= now:
            locked += 1
        else:
            missing.append((row["kickoff"], dict(user_id=user_id, game_id=gid,
                            spread_pick=row["spread_pick"], total_pick=row["total_pick"])))
    print(f"MATCHED: {len(plan)} | EXISTING SAME: {unchanged} | EXISTING DIFFERENT (preserved): {different}")
    print(f"LOCKED MISSING: {locked} | ELIGIBLE MISSING: {len(missing)}")
    if not submit:
        print("PREVIEW: PASS | WRITES: 0")
        return
    require(all(kickoff > datetime.now(timezone.utc) for kickoff, _ in missing),
            "Kickoff passed during validation; rerun")
    payload = [row for _, row in missing]
    inserted = []
    if payload:
        inserted = api.request("picks", {"on_conflict": "user_id,game_id",
                               "select": "user_id,game_id,spread_pick,total_pick"}, payload)
    after = read_picks(api, user_id, ids)
    # Confirm existing selections were not overwritten, and all requested inserts match.
    for gid, original in existing.items():
        require(after.get(gid) == original, f"Existing pick changed concurrently: {gid}")
    for row in payload:
        require(after.get(row["game_id"]) == row, f"Pick verification failed: {row['game_id']}")
    print(f"INSERTED: {len(inserted)} | VERIFIED NEW TARGETS: {len(payload)} | WEEK RECORDS: {len(after)}/{len(plan)}")
    print("DATABASE VERIFICATION: PASS")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--season", type=int, required=True)
    parser.add_argument("--week", type=int, required=True)
    parser.add_argument("--mode", choices=("preview", "submit"), default="preview")
    parser.add_argument("--projections-file", type=Path, help="Optional local source for testing")
    args = parser.parse_args()
    require(2000 <= args.season <= 2100 and 1 <= args.week <= 22, "Invalid season/week")
    if args.projections_file:
        projections = args.projections_file.read_bytes()
    else:
        url = SOURCE + f"week_{args.week}_NM_NFL_picks.csv"
        with urlopen(Request(url, headers={"User-Agent": "AutoPicks-sync", "Cache-Control": "no-cache"}), timeout=45) as response:
            projections = response.read(2_000_001)
        require(len(projections) <= 2_000_000, "Unexpectedly large projection file")
    odds = (ROOT / "docs/data/weekly/latest.csv").read_bytes()
    print(f"ACCOUNT: {ACCOUNT} | SEASON: {args.season} | WEEK: {args.week} | MODE: {args.mode}")
    print("PROJECTIONS SHA256: " + hashlib.sha256(projections).hexdigest())
    print("ODDS SHA256: " + hashlib.sha256(odds).hexdigest())
    plan = build_plan(projections, odds, args.season, args.week)
    run(Supabase(), plan, args.season, args.week, args.mode == "submit")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        sys.exit(1)
