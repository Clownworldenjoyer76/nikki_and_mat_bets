#!/usr/bin/env python3
# scripts/manual_nfl_odds.py

import argparse
import csv
import re
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo


OUT_DIR = Path("docs/data/weekly")

CSV_HEADERS = [
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
    "moneyline_home",
    "moneyline_away",
    "updated_at_utc",
    "is_consensus",
    "game_date",
    "game_time",
    "home_prob",
    "away_prob",
    "spread_home_odds",
    "spread_away_odds",
    "total_over",
    "total_under",
    "total_odds_over",
    "total_odds_under",
    "away_projected_score",
    "home_projected_score",
    "total_projected_score",
]

DATE_RE = re.compile(r"^\d{2}/\d{2}/\d{4}$")
TIME_RE = re.compile(r"^\d{1,2}:\d{2}\s*(AM|PM)$", re.IGNORECASE)
PERCENT_RE = re.compile(r"(\d+(?:\.\d+)?)%")
MONEYLINE_RE = re.compile(r"^[+-]\d+$")
MARKET_RE = re.compile(
    r"^(?P<prefix>[ouOU])?"
    r"(?P<value>[+-]?(?:\d+(?:\.\d+)?|\d*½))"
    r"(?P<odds>[+-]\d+)$"
)
RECORD_RE = re.compile(r"\s*\([^)]*\)\s*$")

IGNORE_LINES = {
    "Time\tTeams\tQuarterbacks\tWin\tBest",
    "ML\tBest",
    "Spread\tPoints\tTotal",
    "Points\tBest",
    "O/U\tBet",
    "Value\tMore Details",
}


def split_tabs(value: str) -> list[str]:
    return [part.strip() for part in value.split("\t") if part.strip()]


def clean_raw_lines(raw_lines: list[str]) -> list[str]:
    cleaned = []

    for raw_line in raw_lines:
        line = raw_line.strip()

        if not line:
            continue

        if line in IGNORE_LINES:
            continue

        cleaned.append(line)

    return cleaned


def split_into_game_blocks(lines: list[str]) -> list[list[str]]:
    blocks = []
    current = []

    for line in lines:
        if DATE_RE.fullmatch(line):
            if current:
                blocks.append(current)
            current = [line]
        elif current:
            current.append(line)

    if current:
        blocks.append(current)

    return blocks


def clean_team(value: str) -> str:
    parts = split_tabs(value)
    first_field = parts[0] if parts else value.strip()
    return RECORD_RE.sub("", first_field).strip()


def normalize_game_date(value: str) -> str:
    parsed = datetime.strptime(value.strip(), "%m/%d/%Y")
    return parsed.strftime("%Y_%m_%d")


def normalize_game_time(value: str) -> str:
    parsed = datetime.strptime(value.strip().upper(), "%I:%M %p")
    return parsed.strftime("%I:%M %p")


def to_utc_iso(game_date_raw: str, game_time_raw: str) -> str:
    local_dt = datetime.strptime(
        f"{game_date_raw.strip()} {game_time_raw.strip().upper()}",
        "%m/%d/%Y %I:%M %p",
    ).replace(tzinfo=ZoneInfo("America/New_York"))

    return local_dt.astimezone(timezone.utc).isoformat(timespec="seconds")


def probability_to_decimal(value: str) -> str:
    match = PERCENT_RE.search(value)

    if not match:
        raise ValueError(f"Could not parse probability from: {value}")

    decimal_value = float(match.group(1)) / 100
    return f"{decimal_value:.3f}"


def normalize_half_number(value: str) -> str:
    value = value.strip().replace("½", ".5")
    number = float(value)

    if number == 0:
        return "0.0"

    return f"{number:+.1f}"


def normalize_total_number(value: str) -> str:
    value = value.strip().replace("½", ".5")
    return f"{float(value):.1f}"


def parse_market_line(line: str, expected_prefix: str | None = None) -> tuple[str, str]:
    compact = re.sub(r"\s+", "", line)
    match = MARKET_RE.fullmatch(compact)

    if not match:
        raise ValueError(f"Could not parse market line: {line}")

    prefix = (match.group("prefix") or "").lower()

    if expected_prefix is not None and prefix != expected_prefix:
        raise ValueError(
            f"Expected '{expected_prefix}' market line, received: {line}"
        )

    value = match.group("value")
    odds = match.group("odds")

    if expected_prefix in {"o", "u"}:
        normalized_value = normalize_total_number(value)
    else:
        normalized_value = normalize_half_number(value)

    return normalized_value, odds


def parse_moneyline(value: str) -> str:
    value = value.strip()

    if not MONEYLINE_RE.fullmatch(value):
        raise ValueError(f"Could not parse moneyline from: {value}")

    return value


def parse_projected_pair(value: str) -> tuple[str, str]:
    parts = split_tabs(value)

    if len(parts) < 2:
        raise ValueError(
            f"Could not parse home and total projected scores from: {value}"
        )

    return parts[0], parts[1]


def build_game_id(game_date: str, home_team: str, away_team: str) -> str:
    return f"{game_date}_{home_team}_{away_team}"


def parse_game_block(
    block: list[str],
    season: str,
    week: str,
    updated_at_utc: str,
) -> dict:
    if len(block) < 14:
        raise ValueError(f"Incomplete NFL odds game block: {block}")

    game_date_raw = block[0]
    game_time_raw = block[1]

    if not DATE_RE.fullmatch(game_date_raw):
        raise ValueError(f"Invalid game date: {game_date_raw}")

    if not TIME_RE.fullmatch(game_time_raw):
        raise ValueError(f"Invalid game time: {game_time_raw}")

    away_team = clean_team(block[2])
    home_team = clean_team(block[3])

    away_prob = probability_to_decimal(block[4])
    home_prob = probability_to_decimal(block[5])

    moneyline_away = parse_moneyline(block[6])
    moneyline_home = parse_moneyline(block[7])

    spread_away, spread_away_odds = parse_market_line(block[8])
    spread_home, spread_home_odds = parse_market_line(block[9])

    away_projected_score = block[10].strip()
    home_projected_score, total_projected_score = parse_projected_pair(block[11])

    total_over, total_odds_over = parse_market_line(block[12], expected_prefix="o")
    total_under, total_odds_under = parse_market_line(block[13], expected_prefix="u")

    game_date = normalize_game_date(game_date_raw)
    game_time = normalize_game_time(game_time_raw)

    return {
        "season": season,
        "week": week,
        "game_id": build_game_id(game_date, home_team, away_team),
        "commence_time_utc": to_utc_iso(game_date_raw, game_time_raw),
        "home_team": home_team,
        "away_team": away_team,
        "book": "NA",
        "spread_home": spread_home,
        "spread_away": spread_away,
        "total": total_over,
        "moneyline_home": moneyline_home,
        "moneyline_away": moneyline_away,
        "updated_at_utc": updated_at_utc,
        "is_consensus": "1",
        "game_date": game_date,
        "game_time": game_time,
        "home_prob": home_prob,
        "away_prob": away_prob,
        "spread_home_odds": spread_home_odds,
        "spread_away_odds": spread_away_odds,
        "total_over": total_over,
        "total_under": total_under,
        "total_odds_over": total_odds_over,
        "total_odds_under": total_odds_under,
        "away_projected_score": away_projected_score,
        "home_projected_score": home_projected_score,
        "total_projected_score": total_projected_score,
    }


def parse_rows(
    raw_lines: list[str],
    season: str,
    week: str,
    updated_at_utc: str,
) -> list[dict]:
    cleaned_lines = clean_raw_lines(raw_lines)
    blocks = split_into_game_blocks(cleaned_lines)

    return [
        parse_game_block(block, season, week, updated_at_utc)
        for block in blocks
    ]


def read_existing_rows(path: Path) -> list[dict]:
    if not path.exists():
        return []

    with path.open("r", encoding="utf-8", newline="") as file:
        return list(csv.DictReader(file))


def merge_rows(existing_rows: list[dict], incoming_rows: list[dict]) -> list[dict]:
    incoming_by_id = {row["game_id"]: row for row in incoming_rows}
    merged = []
    replaced_ids = set()

    for row in existing_rows:
        game_id = row.get("game_id", "")

        if game_id in incoming_by_id:
            merged.append(incoming_by_id[game_id])
            replaced_ids.add(game_id)
        else:
            merged.append(row)

    for row in incoming_rows:
        if row["game_id"] not in replaced_ids:
            merged.append(row)

    return merged


def write_csv(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)

    with path.open("w", encoding="utf-8", newline="") as file:
        writer = csv.DictWriter(
            file,
            fieldnames=CSV_HEADERS,
            extrasaction="ignore",
        )
        writer.writeheader()
        writer.writerows(rows)


def validate_numeric(value: str, field_name: str) -> str:
    value = value.strip()

    if not value.isdigit():
        raise ValueError(f"{field_name} must contain only numeric characters")

    return value


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--season", required=True)
    parser.add_argument("--week", required=True)
    parser.add_argument("--raw-file", required=True)
    args = parser.parse_args()

    season = validate_numeric(args.season, "Season")
    week = validate_numeric(args.week, "Week")
    raw_file = Path(args.raw_file)

    if not raw_file.exists():
        raise FileNotFoundError(f"Raw file not found: {raw_file}")

    raw_lines = raw_file.read_text(
        encoding="utf-8",
        errors="replace",
    ).splitlines()

    updated_at_utc = datetime.now(timezone.utc).isoformat(timespec="seconds")
    incoming_rows = parse_rows(raw_lines, season, week, updated_at_utc)

    if not incoming_rows:
        raise ValueError("No NFL odds rows were parsed from raw input")

    output_path = OUT_DIR / f"{season}_wk{int(week):02d}_odds.csv"
    existing_rows = read_existing_rows(output_path)
    final_rows = merge_rows(existing_rows, incoming_rows)

    write_csv(output_path, final_rows)
    print(f"WROTE CSV: {output_path} ({len(final_rows)} rows)")


if __name__ == "__main__":
    main()
