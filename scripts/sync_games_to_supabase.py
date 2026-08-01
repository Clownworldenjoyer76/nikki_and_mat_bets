#!/usr/bin/env python3
# scripts/sync_games_to_supabase.py

import csv
import json
import os
import sys
from datetime import datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


CSV_PATH = Path("docs/data/weekly/latest.csv")

REQUIRED_HEADERS = {
    "game_id",
    "season",
    "week",
    "away_team",
    "home_team",
    "commence_time_utc",
    "spread_home",
    "total",
    "is_consensus",
}


def require_environment_variable(name: str) -> str:
    value = os.environ.get(name, "").strip()

    if not value:
        raise RuntimeError(
            f"Missing required environment variable: {name}"
        )

    return value


def parse_integer(
    value: str,
    field_name: str,
    row_number: int,
) -> int:
    try:
        return int(value)
    except ValueError as error:
        raise ValueError(
            f"Row {row_number}: {field_name} must be an integer; "
            f"received {value!r}"
        ) from error


def parse_numeric(
    value: str,
    field_name: str,
    row_number: int,
) -> float:
    try:
        return float(Decimal(value))
    except (InvalidOperation, ValueError) as error:
        raise ValueError(
            f"Row {row_number}: {field_name} must be numeric; "
            f"received {value!r}"
        ) from error


def validate_timestamp(
    value: str,
    row_number: int,
) -> str:
    try:
        parsed = datetime.fromisoformat(
            value.replace("Z", "+00:00")
        )
    except ValueError as error:
        raise ValueError(
            f"Row {row_number}: commence_time_utc is invalid; "
            f"received {value!r}"
        ) from error

    if parsed.utcoffset() is None:
        raise ValueError(
            f"Row {row_number}: commence_time_utc must include "
            f"a UTC offset; received {value!r}"
        )

    return value


def load_consensus_games(path: Path) -> list[dict]:
    if not path.exists():
        raise FileNotFoundError(
            f"CSV file not found: {path}"
        )

    with path.open(
        "r",
        encoding="utf-8-sig",
        newline="",
    ) as file:
        reader = csv.DictReader(file)
        headers = set(reader.fieldnames or [])

        missing_headers = sorted(
            REQUIRED_HEADERS - headers
        )

        if missing_headers:
            raise ValueError(
                "latest.csv is missing required headers: "
                + ", ".join(missing_headers)
            )

        games = []
        seen_game_ids = set()

        for row_number, row in enumerate(
            reader,
            start=2,
        ):
            if (
                row.get("is_consensus") or ""
            ).strip() != "1":
                continue

            game_id = (
                row.get("game_id") or ""
            ).strip()

            away_team = (
                row.get("away_team") or ""
            ).strip()

            home_team = (
                row.get("home_team") or ""
            ).strip()

            kickoff_utc = (
                row.get("commence_time_utc") or ""
            ).strip()

            spread_home = (
                row.get("spread_home") or ""
            ).strip()

            total = (
                row.get("total") or ""
            ).strip()

            if not game_id:
                raise ValueError(
                    f"Row {row_number}: game_id is blank"
                )

            if game_id in seen_game_ids:
                raise ValueError(
                    f"Row {row_number}: duplicate consensus "
                    f"game_id {game_id!r}"
                )

            if not away_team:
                raise ValueError(
                    f"Row {row_number}: away_team is blank"
                )

            if not home_team:
                raise ValueError(
                    f"Row {row_number}: home_team is blank"
                )

            if away_team == home_team:
                raise ValueError(
                    f"Row {row_number}: away_team and "
                    f"home_team are identical"
                )

            if not kickoff_utc:
                raise ValueError(
                    f"Row {row_number}: "
                    f"commence_time_utc is blank"
                )

            if not spread_home:
                raise ValueError(
                    f"Row {row_number}: spread_home is blank"
                )

            if not total:
                raise ValueError(
                    f"Row {row_number}: total is blank"
                )

            games.append(
                {
                    "game_id": game_id,
                    "season": parse_integer(
                        (
                            row.get("season")
                            or ""
                        ).strip(),
                        "season",
                        row_number,
                    ),
                    "week": parse_integer(
                        (
                            row.get("week")
                            or ""
                        ).strip(),
                        "week",
                        row_number,
                    ),
                    "away_team": away_team,
                    "home_team": home_team,
                    "kickoff_utc": validate_timestamp(
                        kickoff_utc,
                        row_number,
                    ),
                    "spread_home": parse_numeric(
                        spread_home,
                        "spread_home",
                        row_number,
                    ),
                    "total": parse_numeric(
                        total,
                        "total",
                        row_number,
                    ),
                }
            )

            seen_game_ids.add(game_id)

    if not games:
        raise ValueError(
            "latest.csv contains no rows where "
            "is_consensus = 1"
        )

    return games


def upsert_games(
    supabase_url: str,
    service_role_key: str,
    games: list[dict],
) -> None:
    query = urlencode(
        {
            "on_conflict": "game_id",
        }
    )

    endpoint = (
        f"{supabase_url.rstrip('/')}"
        f"/rest/v1/games?{query}"
    )

    body = json.dumps(
        games,
        separators=(",", ":"),
    ).encode("utf-8")

    request = Request(
        endpoint,
        data=body,
        method="POST",
        headers={
            "apikey": service_role_key,
            "Authorization": (
                f"Bearer {service_role_key}"
            ),
            "Content-Type": "application/json",
            "Prefer": (
                "resolution=merge-duplicates,"
                "return=minimal"
            ),
        },
    )

    try:
        with urlopen(
            request,
            timeout=60,
        ) as response:
            if response.status not in {
                200,
                201,
                204,
            }:
                response_body = (
                    response.read().decode(
                        "utf-8",
                        errors="replace",
                    )
                )

                raise RuntimeError(
                    "Supabase upsert failed with "
                    f"HTTP {response.status}: "
                    f"{response_body}"
                )

    except HTTPError as error:
        response_body = error.read().decode(
            "utf-8",
            errors="replace",
        )

        raise RuntimeError(
            "Supabase upsert failed with "
            f"HTTP {error.code}: {response_body}"
        ) from error

    except URLError as error:
        raise RuntimeError(
            "Could not connect to Supabase: "
            f"{error.reason}"
        ) from error


def main() -> None:
    supabase_url = require_environment_variable(
        "SUPABASE_URL"
    )

    service_role_key = (
        require_environment_variable(
            "SUPABASE_SERVICE_ROLE_KEY"
        )
    )

    games = load_consensus_games(
        CSV_PATH
    )

    upsert_games(
        supabase_url,
        service_role_key,
        games,
    )

    print(
        f"UPSERTED {len(games)} games "
        f"from {CSV_PATH}"
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(
            f"ERROR: {error}",
            file=sys.stderr,
        )
        raise SystemExit(1)
