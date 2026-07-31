#!/usr/bin/env python3
# scripts/manual_nfl_final_scores.py

import argparse
import csv
import re
from datetime import datetime
from pathlib import Path


OUT_DIR = Path("docs/data/scores")

CSV_HEADERS = [
    "season",
    "week",
    "game_date",
    "game_id",
    "home_team",
    "away_team",
    "home_score",
    "away_score",
]

DATE_RE = re.compile(r"^\d{2}/\d{2}/\d{4}$")
INTEGER_RE = re.compile(r"^\d+$")

IGNORE_LINES = {
    "Time\tTeams\tWin\tBest",
    "ML\tBest",
    "Spread\tFinal",
    "Points\tSportsbook",
    "Log Loss\tDRatings",
    "Log Loss",
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


def normalize_game_date(value: str) -> str:
    parsed = datetime.strptime(value.strip(), "%m/%d/%Y")
    return parsed.strftime("%Y_%m_%d")


def parse_away_team(value: str) -> str:
    parts = split_tabs(value)

    if len(parts) < 2:
        raise ValueError(f"Could not parse away team from: {value}")

    return parts[1]


def parse_home_team(value: str) -> str:
    parts = split_tabs(value)

    if not parts:
        raise ValueError(f"Could not parse home team from: {value}")

    return parts[0]


def parse_score(value: str, field_name: str) -> str:
    parts = split_tabs(value)

    if not parts:
        raise ValueError(f"Could not parse {field_name} from: {value}")

    score = parts[0]

    if not INTEGER_RE.fullmatch(score):
        raise ValueError(f"Invalid {field_name}: {value}")

    return score


def build_game_id(game_date: str, home_team: str, away_team: str) -> str:
    return f"{game_date}_{home_team}_{away_team}"


def parse_game_block(block: list[str], season: str, week: str) -> dict:
    if len(block) < 10:
        raise ValueError(f"Incomplete NFL final-score game block: {block}")

    game_date = normalize_game_date(block[0])
    away_team = parse_away_team(block[1])
    home_team = parse_home_team(block[2])
    away_score = parse_score(block[8], "away_score")
    home_score = parse_score(block[9], "home_score")

    return {
        "season": season,
        "week": week,
        "game_date": game_date,
        "game_id": build_game_id(game_date, home_team, away_team),
        "home_team": home_team,
        "away_team": away_team,
        "home_score": home_score,
        "away_score": away_score,
    }


def parse_rows(raw_lines: list[str], season: str, week: str) -> list[dict]:
    cleaned_lines = clean_raw_lines(raw_lines)
    blocks = split_into_game_blocks(cleaned_lines)

    rows = []

    for block in blocks:
        rows.append(parse_game_block(block, season, week))

    return rows


def read_existing_rows(path: Path) -> list[dict]:
    if not path.exists():
        return []

    with path.open("r", encoding="utf-8", newline="") as file:
        return list(csv.DictReader(file))


def merge_rows(existing_rows: list[dict], incoming_rows: list[dict]) -> list[dict]:
    incoming_by_id = {
        row["game_id"]: row
        for row in incoming_rows
    }

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

    incoming_rows = parse_rows(raw_lines, season, week)

    if not incoming_rows:
        raise ValueError("No NFL final-score rows were parsed from raw input")

    output_path = OUT_DIR / f"{season}_wk{int(week):02d}_scores.csv"

    existing_rows = read_existing_rows(output_path)
    final_rows = merge_rows(existing_rows, incoming_rows)

    write_csv(output_path, final_rows)

    print(f"WROTE CSV: {output_path} ({len(final_rows)} rows)")


if __name__ == "__main__":
    main()
