import csv
import re
from datetime import datetime, timezone
from pathlib import Path

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
REQUEST_TIMEOUT = 30


def fetch_json(url, params=None, allow_404=False):
    response = requests.get(
        url,
        params=params,
        headers={
            "Accept": "application/json",
            "User-Agent": "nikki_and_mat_bets/1.0",
        },
        timeout=REQUEST_TIMEOUT,
    )

    if allow_404 and response.status_code == 404:
        return {}

    response.raise_for_status()
    data = response.json()

    if not isinstance(data, dict):
        raise ValueError(
            f"ESPN response from {url} was not a JSON object."
        )

    return data


def require(value, field_name):
    if value is None or value == "":
        raise ValueError(
            f"ESPN response is missing {field_name}."
        )

    return value


def parse_datetime(value, field_name):
    value = require(value, field_name)

    try:
        return datetime.fromisoformat(
            str(value).replace("Z", "+00:00")
        )
    except ValueError as exc:
        raise ValueError(
            f"ESPN returned an invalid {field_name}: {value!r}"
        ) from exc


def parse_float(value, field_name):
    if value is None or value == "":
        return None

    try:
        return float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(
            f"ESPN returned a nonnumeric {field_name}: {value!r}"
        ) from exc


def choose_reference_event(scoreboard):
    events = scoreboard.get("events", [])

    if not isinstance(events, list):
        raise ValueError(
            "ESPN events field was not a list."
        )

    now_utc = datetime.now(timezone.utc)
    candidates = []

    for event in events:
        if not isinstance(event, dict):
            continue

        kickoff = parse_datetime(
            event.get("date"),
            "events[].date",
        )

        candidates.append(
            (
                kickoff,
                event,
            )
        )

    if not candidates:
        raise ValueError(
            "ESPN returned no reference event."
        )

    candidates.sort(
        key=lambda item: (
            0 if item[0] >= now_utc else 1,
            abs(
                (
                    item[0] - now_utc
                ).total_seconds()
            ),
        )
    )

    return candidates[0][1]


def get_calendar_entries(
    scoreboard,
    season_type_number,
):
    leagues = scoreboard.get("leagues", [])

    if not isinstance(leagues, list) or not leagues:
        raise ValueError(
            "ESPN response is missing leagues[0]."
        )

    calendar = leagues[0].get(
        "calendar",
        [],
    )

    if not isinstance(calendar, list):
        raise ValueError(
            "ESPN leagues[0].calendar was not a list."
        )

    for season_calendar in calendar:
        if not isinstance(
            season_calendar,
            dict,
        ):
            continue

        if (
            str(
                season_calendar.get("value")
            )
            != str(season_type_number)
        ):
            continue

        entries = season_calendar.get(
            "entries",
            [],
        )

        if not isinstance(entries, list):
            raise ValueError(
                "ESPN calendar entries were not a list."
            )

        return [
            entry
            for entry in entries
            if isinstance(entry, dict)
        ]

    raise ValueError(
        "ESPN calendar did not contain "
        f"season type {season_type_number}."
    )


def determine_target_slate(scoreboard):
    event = choose_reference_event(
        scoreboard
    )

    season_data = require(
        event.get("season"),
        "event season",
    )

    week_data = require(
        event.get("week"),
        "event week",
    )

    season = int(
        require(
            season_data.get("year"),
            "season.year",
        )
    )

    season_type_number = int(
        require(
            season_data.get("type"),
            "season.type",
        )
    )

    season_type = str(
        require(
            season_data.get("slug"),
            "season.slug",
        )
    )

    espn_week = int(
        require(
            week_data.get("number"),
            "week.number",
        )
    )

    entries = get_calendar_entries(
        scoreboard,
        season_type_number,
    )

    selected_entry = next(
        (
            entry
            for entry in entries
            if str(entry.get("value"))
            == str(espn_week)
        ),
        None,
    )

    if selected_entry is None:
        raise ValueError(
            "ESPN calendar did not contain "
            f"week {espn_week}."
        )

    week_label = str(
        require(
            selected_entry.get("label"),
            "calendar label",
        )
    )

    if (
        season_type_number == 1
        and "hall of fame"
        in week_label.lower()
    ):
        preseason_candidates = []

        for entry in entries:
            entry_label = str(
                entry.get("label", "")
            )

            match = re.fullmatch(
                r"Preseason\s+Week\s+(\d+)",
                entry_label.strip(),
                flags=re.IGNORECASE,
            )

            if not match:
                continue

            entry_value = int(
                require(
                    entry.get("value"),
                    "calendar entry value",
                )
            )

            if entry_value <= espn_week:
                continue

            preseason_candidates.append(
                (
                    entry_value,
                    int(match.group(1)),
                    entry_label,
                )
            )

        if not preseason_candidates:
            raise ValueError(
                "ESPN calendar did not contain "
                "a preseason week after the "
                "Hall of Fame Game."
            )

        preseason_candidates.sort()

        (
            espn_week,
            display_week,
            week_label,
        ) = preseason_candidates[0]

    else:
        match = re.fullmatch(
            r"(?:Preseason\s+)?Week\s+(\d+)",
            week_label.strip(),
            flags=re.IGNORECASE,
        )

        if match:
            display_week = int(
                match.group(1)
            )
        else:
            display_week = espn_week

    return (
        season,
        season_type_number,
        season_type,
        espn_week,
        display_week,
        week_label,
    )


def get_complete_slate(
    season,
    season_type_number,
    espn_week,
):
    scoreboard = fetch_json(
        SCOREBOARD_URL,
        params={
            "dates": str(season),
            "seasontype": str(
                season_type_number
            ),
            "week": str(espn_week),
            "limit": 100,
        },
    )

    raw_events = scoreboard.get(
        "events",
        [],
    )

    if not isinstance(raw_events, list):
        raise ValueError(
            "ESPN weekly events field "
            "was not a list."
        )

    events = []

    for event in raw_events:
        if not isinstance(event, dict):
            continue

        event_season = require(
            event.get("season"),
            "event season",
        )

        event_week = require(
            event.get("week"),
            "event week",
        )

        if (
            int(
                require(
                    event_season.get("year"),
                    "season.year",
                )
            )
            == season
            and int(
                require(
                    event_season.get("type"),
                    "season.type",
                )
            )
            == season_type_number
            and int(
                require(
                    event_week.get("number"),
                    "week.number",
                )
            )
            == espn_week
        ):
            events.append(event)

    if not events:
        raise ValueError(
            "ESPN returned no games for "
            f"{season} season type "
            f"{season_type_number}, "
            f"ESPN week {espn_week}."
        )

    events.sort(
        key=lambda event: parse_datetime(
            event.get("date"),
            f"event {event.get('id')} date",
        )
    )

    return events


def get_team_name(
    competition,
    side,
    event_id,
):
    competitors = competition.get(
        "competitors",
        [],
    )

    if not isinstance(
        competitors,
        list,
    ):
        raise ValueError(
            "ESPN competitors were not "
            f"a list for event {event_id}."
        )

    matches = [
        competitor
        for competitor in competitors
        if isinstance(competitor, dict)
        and competitor.get("homeAway")
        == side
    ]

    if len(matches) != 1:
        raise ValueError(
            f"Expected one {side} team "
            f"for event {event_id}; "
            f"found {len(matches)}."
        )

    team = require(
        matches[0].get("team"),
        f"event {event_id} {side} team",
    )

    return str(
        require(
            team.get("displayName"),
            f"event {event_id} "
            f"{side} team displayName",
        )
    )


def get_odds(
    event_id,
    competition_id,
):
    odds_url = (
        f"{CORE_API_BASE}/events/"
        f"{event_id}/competitions/"
        f"{competition_id}/odds"
    )

    response = fetch_json(
        odds_url,
        params={
            "limit": 100,
        },
        allow_404=True,
    )

    items = response.get(
        "items",
        [],
    )

    if items is None:
        items = []

    if not isinstance(items, list):
        raise ValueError(
            "ESPN odds items were not "
            f"a list for event {event_id}."
        )

    fallback = (
        "",
        None,
        None,
        None,
    )

    for item in items:
        if not isinstance(item, dict):
            continue

        provider = (
            item.get("provider")
            or {}
        )

        home_odds = (
            item.get("homeTeamOdds")
            or {}
        )

        away_odds = (
            item.get("awayTeamOdds")
            or {}
        )

        current = (
            item.get("current")
            or {}
        )

        home_current = (
            home_odds.get("current")
            or {}
        )

        away_current = (
            away_odds.get("current")
            or {}
        )

        home_spread = (
            home_current.get(
                "pointSpread"
            )
            or {}
        )

        away_spread = (
            away_current.get(
                "pointSpread"
            )
            or {}
        )

        current_total = (
            current.get("total")
            or {}
        )

        total_value = current_total.get(
            "american"
        )

        if total_value is None:
            total_value = item.get(
                "overUnder"
            )

        selected = (
            str(
                provider.get("name")
                or ""
            ),
            parse_float(
                home_spread.get(
                    "american"
                ),
                f"event {event_id} "
                "home spread",
            ),
            parse_float(
                away_spread.get(
                    "american"
                ),
                f"event {event_id} "
                "away spread",
            ),
            parse_float(
                total_value,
                f"event {event_id} total",
            ),
        )

        fallback = selected

        if any(
            value is not None
            for value in selected[1:]
        ):
            return selected

    return fallback


def main():
    pulled_at_utc = (
        datetime.now(timezone.utc)
        .isoformat()
        .replace(
            "+00:00",
            "Z",
        )
    )

    reference_scoreboard = fetch_json(
        SCOREBOARD_URL,
        params={
            "limit": 100,
        },
    )

    (
        season,
        season_type_number,
        season_type,
        espn_week,
        display_week,
        week_label,
    ) = determine_target_slate(
        reference_scoreboard
    )

    events = get_complete_slate(
        season,
        season_type_number,
        espn_week,
    )

    rows = []
    games_with_odds = 0

    for event in events:
        event_id = str(
            require(
                event.get("id"),
                "event id",
            )
        )

        kickoff = str(
            require(
                event.get("date"),
                f"event {event_id} date",
            )
        )

        competitions = event.get(
            "competitions",
            [],
        )

        if (
            not isinstance(
                competitions,
                list,
            )
            or len(competitions) != 1
        ):
            if isinstance(
                competitions,
                list,
            ):
                count = len(competitions)
            else:
                count = 0

            raise ValueError(
                "Expected one competition "
                f"for event {event_id}; "
                f"found {count}."
            )

        competition = competitions[0]

        if not isinstance(
            competition,
            dict,
        ):
            raise ValueError(
                "Invalid competition for "
                f"event {event_id}."
            )

        competition_id = str(
            require(
                competition.get("id"),
                f"event {event_id} "
                "competition.id",
            )
        )

        home_team = get_team_name(
            competition,
            "home",
            event_id,
        )

        away_team = get_team_name(
            competition,
            "away",
            event_id,
        )

        (
            book,
            spread_home,
            spread_away,
            total,
        ) = get_odds(
            event_id,
            competition_id,
        )

        if any(
            value is not None
            for value in (
                spread_home,
                spread_away,
                total,
            )
        ):
            games_with_odds += 1

        rows.append(
            [
                season,
                display_week,
                season_type,
                event_id,
                kickoff,
                home_team,
                away_team,
                book,
                spread_home,
                spread_away,
                total,
                pulled_at_utc,
            ]
        )

    OUTPUT_DIRECTORY.mkdir(
        parents=True,
        exist_ok=True,
    )

    output_path = (
        OUTPUT_DIRECTORY
        / (
            f"{season}_{season_type}_"
            f"wk{display_week:02d}_odds.csv"
        )
    )

    with output_path.open(
        "w",
        newline="",
        encoding="utf-8",
    ) as csv_file:
        writer = csv.writer(
            csv_file
        )

        writer.writerow(
            [
                "season",
                "week",
                "season_type",
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

    print(
        f"Selected {season} "
        f"{week_label} "
        f"(season type "
        f"{season_type}, "
        f"ESPN week {espn_week}): "
        f"{len(rows)} games, "
        f"{games_with_odds} "
        "with odds."
    )

    print(
        f"Wrote {output_path}"
    )


if __name__ == "__main__":
    main()
