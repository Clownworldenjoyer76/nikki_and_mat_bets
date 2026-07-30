import csv
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests


SCOREBOARD_URL = (
    "https://site.api.espn.com/apis/site/v2/"
    "sports/football/nfl/scoreboard"
)

CORE_API_BASE = (
    "https://sports.core.api.espn.com/v2/"
    "sports/football/leagues/nfl"
)

OUTPUT_DIRECTORY = Path("data/weekly")
REQUEST_TIMEOUT_SECONDS = 30


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def get_nested(data: Any, *keys: str) -> Any:
    current = data

    for key in keys:
        if not isinstance(current, dict):
            return None

        current = current.get(key)

    return current


def parse_float(value: Any, field_name: str) -> float | None:
    if value is None or value == "":
        return None

    try:
        return float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(
            f"ESPN returned a nonnumeric value for {field_name}: {value!r}"
        ) from exc


def require_value(value: Any, field_name: str) -> Any:
    if value is None or value == "":
        raise ValueError(f"ESPN response is missing required field: {field_name}")

    return value


def get_scoreboard() -> dict[str, Any]:
    response = requests.get(
        SCOREBOARD_URL,
        params={"limit": 100},
        headers={"Accept": "application/json"},
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    response.raise_for_status()

    data = response.json()

    if not isinstance(data, dict):
        raise ValueError("ESPN scoreboard response was not a JSON object.")

    return data


def get_odds(event_id: str, competition_id: str) -> dict[str, Any]:
    url = (
        f"{CORE_API_BASE}/events/{event_id}/"
        f"competitions/{competition_id}/odds"
    )

    response = requests.get(
        url,
        params={"limit": 100},
        headers={"Accept": "application/json"},
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    response.raise_for_status()

    data = response.json()

    if not isinstance(data, dict):
        raise ValueError(
            f"ESPN odds response for event {event_id} "
            "was not a JSON object."
        )

    return data


def find_competitor(
    competition: dict[str, Any],
    home_away: str,
    event_id: str,
) -> dict[str, Any]:
    competitors = competition.get("competitors", [])

    if not isinstance(competitors, list):
        raise ValueError(
            f"ESPN competitors field was not a list for event {event_id}."
        )

    matches = [
        competitor
        for competitor in competitors
        if isinstance(competitor, dict)
        and competitor.get("homeAway") == home_away
    ]

    if len(matches) != 1:
        raise ValueError(
            f"Expected exactly one {home_away} competitor for event "
            f"{event_id}; found {len(matches)}."
        )

    return matches[0]


def determine_season_and_week(
    scoreboard: dict[str, Any],
    events: list[dict[str, Any]],
) -> tuple[int, int]:
    if events:
        season_week_values: set[tuple[int, int]] = set()

        for event in events:
            season_value = require_value(
                get_nested(event, "season", "year"),
                "events[].season.year",
            )
            week_value = require_value(
                get_nested(event, "week", "number"),
                "events[].week.number",
            )

            season_week_values.add(
                (int(season_value), int(week_value))
            )

        if len(season_week_values) != 1:
            raise ValueError(
                "ESPN scoreboard returned events from multiple "
                f"season/week combinations: {sorted(season_week_values)}"
            )

        return next(iter(season_week_values))

    leagues = scoreboard.get("leagues", [])

    if not isinstance(leagues, list) or not leagues:
        raise ValueError(
            "ESPN returned no events and no league season information."
        )

    season_value = require_value(
        get_nested(leagues[0], "season", "year"),
        "leagues[0].season.year",
    )
    week_value = require_value(
        get_nested(scoreboard, "week", "number"),
        "week.number",
    )

    return int(season_value), int(week_value)


def build_rows(
    scoreboard: dict[str, Any],
    pulled_at_utc: str,
) -> tuple[int, int, list[list[Any]]]:
    raw_events = scoreboard.get("events", [])

    if not isinstance(raw_events, list):
        raise ValueError("ESPN events field was not a list.")

    events = [
        event
        for event in raw_events
        if isinstance(event, dict)
    ]

    season, week = determine_season_and_week(
        scoreboard,
        events,
    )

    rows: list[list[Any]] = []

    for event in events:
        event_id = str(
            require_value(
                event.get("id"),
                "events[].id",
            )
        )

        event_season = int(
            require_value(
                get_nested(event, "season", "year"),
                f"event {event_id} season.year",
            )
        )

        event_week = int(
            require_value(
                get_nested(event, "week", "number"),
                f"event {event_id} week.number",
            )
        )

        if event_season != season or event_week != week:
            raise ValueError(
                f"Event {event_id} does not match output "
                f"season/week {season}/{week}."
            )

        commence_time_utc = str(
            require_value(
                event.get("date"),
                f"event {event_id} date",
            )
        )

        competitions = event.get("competitions", [])

        if not isinstance(competitions, list):
            raise ValueError(
                f"ESPN competitions field was not a list "
                f"for event {event_id}."
            )

        if len(competitions) != 1:
            raise ValueError(
                f"Expected exactly one competition for event "
                f"{event_id}; found {len(competitions)}."
            )

        competition = competitions[0]

        if not isinstance(competition, dict):
            raise ValueError(
                f"Competition data was invalid for event {event_id}."
            )

        competition_id = str(
            require_value(
                competition.get("id"),
                f"event {event_id} competition.id",
            )
        )

        home_competitor = find_competitor(
            competition,
            "home",
            event_id,
        )
        away_competitor = find_competitor(
            competition,
            "away",
            event_id,
        )

        home_team = str(
            require_value(
                get_nested(
                    home_competitor,
                    "team",
                    "displayName",
                ),
                f"event {event_id} home team displayName",
            )
        )

        away_team = str(
            require_value(
                get_nested(
                    away_competitor,
                    "team",
                    "displayName",
                ),
                f"event {event_id} away team displayName",
            )
        )

        odds_response = get_odds(
            event_id,
            competition_id,
        )

        odds_items = odds_response.get("items", [])

        if not isinstance(odds_items, list):
            raise ValueError(
                f"ESPN odds items field was not a list "
                f"for event {event_id}."
            )

        for odds_item in odds_items:
            if not isinstance(odds_item, dict):
                continue

            book = str(
                require_value(
                    get_nested(
                        odds_item,
                        "provider",
                        "name",
                    ),
                    f"event {event_id} provider.name",
                )
            )

            spread_home = parse_float(
                get_nested(
                    odds_item,
                    "homeTeamOdds",
                    "current",
                    "pointSpread",
                    "american",
                ),
                f"event {event_id} home current spread",
            )

            spread_away = parse_float(
                get_nested(
                    odds_item,
                    "awayTeamOdds",
                    "current",
                    "pointSpread",
                    "american",
                ),
                f"event {event_id} away current spread",
            )

            total = parse_float(
                get_nested(
                    odds_item,
                    "current",
                    "total",
                    "american",
                ),
                f"event {event_id} current total",
            )

            if (
                spread_home is None
                and spread_away is None
                and total is None
            ):
                continue

            rows.append(
                [
                    season,
                    week,
                    event_id,
                    commence_time_utc,
                    home_team,
                    away_team,
                    book,
                    spread_home,
                    spread_away,
                    total,
                    pulled_at_utc,
                ]
            )

    return season, week, rows


def write_csv(
    season: int,
    week: int,
    rows: list[list[Any]],
) -> Path:
    OUTPUT_DIRECTORY.mkdir(
        parents=True,
        exist_ok=True,
    )

    if rows:
        output_path = (
            OUTPUT_DIRECTORY
            / f"{season}_wk{week:02d}_odds.csv"
        )
    else:
        output_path = (
            OUTPUT_DIRECTORY
            / f"{season}_wk{week:02d}_odds_empty.csv"
        )

    with output_path.open(
        "w",
        newline="",
        encoding="utf-8",
    ) as csv_file:
        writer = csv.writer(csv_file)

        writer.writerow(
            [
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
            ]
        )

        writer.writerows(rows)

    return output_path


def main() -> None:
    pulled_at_utc = utc_now_iso()
    scoreboard = get_scoreboard()

    season, week, rows = build_rows(
        scoreboard,
        pulled_at_utc,
    )

    output_path = write_csv(
        season,
        week,
        rows,
    )

    print(f"Wrote {output_path}")


if __name__ == "__main__":
    main()
