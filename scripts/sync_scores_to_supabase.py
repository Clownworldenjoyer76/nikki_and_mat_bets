#!/usr/bin/env python3

import csv
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


REQUIRED_HEADERS = {
    "season",
    "week",
    "game_id",
    "home_score",
    "away_score",
}


def require_environment(name: str) -> str:
    value = os.environ.get(name, "").strip()

    if not value:
        raise ValueError(f"Missing environment variable: {name}")

    return value


def request_supabase(
    method: str,
    path: str,
    payload=None,
    prefer: str | None = None,
):
    supabase_url = require_environment("SUPABASE_URL").rstrip("/")
    service_role_key = require_environment("SUPABASE_SERVICE_ROLE_KEY")

    headers = {
        "apikey": service_role_key,
        "Authorization": f"Bearer {service_role_key}",
        "Accept": "application/json",
    }

    data = None

    if payload is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(payload).encode("utf-8")

    if prefer:
        headers["Prefer"] = prefer

    request = urllib.request.Request(
        url=f"{supabase_url}{path}",
        data=data,
        headers=headers,
        method=method,
    )

    try:
        with urllib.request.urlopen(request) as response:
            response_text = response.read().decode("utf-8").strip()
    except urllib.error.HTTPError as error:
        error_text = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(
            f"Supabase request failed: {error.code} {error.reason}\n"
            f"{error_text}"
        ) from error

    if not response_text:
        return None

    return json.loads(response_text)


def parse_score(value: str, field_name: str) -> int:
    cleaned = value.strip()

    if not cleaned.isdigit():
        raise ValueError(f"{field_name} must be a nonnegative integer: {value}")

    score = int(cleaned)

    if score > 32767:
        raise ValueError(f"{field_name} exceeds Supabase smallint range: {score}")

    return score


def read_score_rows(path: Path, season: int, week: int) -> list[dict]:
    if not path.exists():
        raise FileNotFoundError(f"Score CSV not found: {path}")

    with path.open("r", encoding="utf-8", newline="") as file:
        reader = csv.DictReader(file)

        headers = set(reader.fieldnames or [])
        missing_headers = REQUIRED_HEADERS - headers

        if missing_headers:
            raise ValueError(
                "Score CSV is missing headers: "
                + ", ".join(sorted(missing_headers))
            )

        rows = []
        seen_game_ids = set()

        for line_number, row in enumerate(reader, start=2):
            row_season = row["season"].strip()
            row_week = row["week"].strip()
            game_id = row["game_id"].strip()

            if row_season != str(season):
                raise ValueError(
                    f"Line {line_number}: season {row_season} does not match {season}"
                )

            if row_week != str(week):
                raise ValueError(
                    f"Line {line_number}: week {row_week} does not match {week}"
                )

            if not game_id:
                raise ValueError(f"Line {line_number}: game_id is empty")

            if game_id in seen_game_ids:
                raise ValueError(
                    f"Line {line_number}: duplicate game_id: {game_id}"
                )

            seen_game_ids.add(game_id)

            rows.append(
                {
                    "game_id": game_id,
                    "home_score": parse_score(
                        row["home_score"],
                        f"Line {line_number} home_score",
                    ),
                    "away_score": parse_score(
                        row["away_score"],
                        f"Line {line_number} away_score",
                    ),
                }
            )

    if not rows:
        raise ValueError("Score CSV contains no score rows")

    return rows


def load_games(season: int, week: int) -> dict[str, str]:
    query = urllib.parse.urlencode(
        {
            "select": "id,game_id",
            "season": f"eq.{season}",
            "week": f"eq.{week}",
        },
        safe=",.*()-",
    )

    rows = request_supabase(
        "GET",
        f"/rest/v1/games?{query}",
    )

    return {
        row["game_id"]: row["id"]
        for row in rows or []
    }


def upsert_scores(score_rows: list[dict], game_ids: dict[str, str]) -> None:
    payload = [
        {
            "game_id": game_ids[row["game_id"]],
            "home_score": row["home_score"],
            "away_score": row["away_score"],
            "status": "final",
        }
        for row in score_rows
    ]

    request_supabase(
        "POST",
        "/rest/v1/scores?on_conflict=game_id",
        payload=payload,
        prefer="resolution=merge-duplicates,return=minimal",
    )


def mark_games_final(game_uuids: list[str]) -> None:
    filter_value = f"in.({','.join(game_uuids)})"

    query = urllib.parse.urlencode(
        {"id": filter_value},
        safe=",.*()-",
    )

    request_supabase(
        "PATCH",
        f"/rest/v1/games?{query}",
        payload={"status": "final"},
        prefer="return=minimal",
    )


def main() -> None:
    output_path = Path(require_environment("OUTPUT_PATH"))
    season = int(require_environment("SEASON"))
    week = int(require_environment("WEEK"))

    score_rows = read_score_rows(output_path, season, week)
    games_by_game_id = load_games(season, week)

    missing_game_ids = [
        row["game_id"]
        for row in score_rows
        if row["game_id"] not in games_by_game_id
    ]

    if missing_game_ids:
        raise ValueError(
            "Scores cannot be synced because these games are missing "
            "from public.games:\n"
            + "\n".join(missing_game_ids)
        )

    upsert_scores(score_rows, games_by_game_id)

    game_uuids = [
        games_by_game_id[row["game_id"]]
        for row in score_rows
    ]

    mark_games_final(game_uuids)

    print(f"SYNCED SCORES: {len(score_rows)} rows")


if __name__ == "__main__":
    main()
