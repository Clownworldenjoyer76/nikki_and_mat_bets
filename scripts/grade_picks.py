#!/usr/bin/env python3
"""Grade NFL picks stored in Supabase.

Reads games, scores and picks, works out W / L / P for each pick's
spread and total selections, and writes the results back to picks.

Requires two environment variables:
    SUPABASE_URL
    SUPABASE_SERVICE_ROLE_KEY
"""

import os
import sys

import requests

TIMEOUT = 30


def env(name):
    value = os.environ.get(name, "").strip()
    if not value:
        sys.exit("Missing environment variable: " + name)
    return value


SUPABASE_URL = env("SUPABASE_URL").rstrip("/")
SERVICE_KEY = env("SUPABASE_SERVICE_ROLE_KEY")

HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": "Bearer " + SERVICE_KEY,
    "Content-Type": "application/json",
}


def get_all(table, select):
    """Fetch every row of a table, 1000 at a time."""
    rows = []
    offset = 0
    page = 1000

    while True:
        response = requests.get(
            SUPABASE_URL + "/rest/v1/" + table,
            headers=HEADERS,
            params={
                "select": select,
                "offset": str(offset),
                "limit": str(page),
            },
            timeout=TIMEOUT,
        )

        if response.status_code != 200:
            sys.exit(
                "Read failed on {}: HTTP {} {}".format(
                    table, response.status_code, response.text
                )
            )

        batch = response.json()
        rows.extend(batch)

        if len(batch) < page:
            return rows

        offset += page


def patch_pick(pick_id, spread_result, total_result):
    response = requests.patch(
        SUPABASE_URL + "/rest/v1/picks",
        headers=HEADERS,
        params={"id": "eq." + str(pick_id)},
        json={"spread_result": spread_result, "total_result": total_result},
        timeout=TIMEOUT,
    )

    if response.status_code not in (200, 204):
        sys.exit(
            "Write failed on pick {}: HTTP {} {}".format(
                pick_id, response.status_code, response.text
            )
        )


def to_number(value):
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def grade_spread(pick, spread_home, away_score, home_score):
    """spread_home is the home team's line. Negative = home favoured."""
    margin = (home_score + spread_home) - away_score

    if margin == 0:
        return "P"

    home_covered = margin > 0

    if pick == "home":
        return "W" if home_covered else "L"

    if pick == "away":
        return "L" if home_covered else "W"

    return None


def grade_total(pick, total_line, away_score, home_score):
    combined = away_score + home_score

    if combined == total_line:
        return "P"

    went_over = combined > total_line

    if pick == "over":
        return "W" if went_over else "L"

    if pick == "under":
        return "L" if went_over else "W"

    return None


def main():
    games = get_all("games", "id,game_id,spread_home,total")
    scores = get_all("scores", "game_id,away_score,home_score")
    picks = get_all(
        "picks",
        "id,game_id,spread_pick,total_pick,spread_result,total_result",
    )

    games_by_id = {row["id"]: row for row in games}

    scores_by_game = {}
    for row in scores:
        away = to_number(row.get("away_score"))
        home = to_number(row.get("home_score"))
        if away is None or home is None:
            continue
        scores_by_game[row["game_id"]] = (away, home)

    updated = 0
    skipped_no_score = 0
    skipped_no_game = 0
    skipped_no_line = 0
    unchanged = 0

    for pick in picks:
        game = games_by_id.get(pick["game_id"])

        if game is None:
            skipped_no_game += 1
            continue

        score = scores_by_game.get(pick["game_id"])

        if score is None:
            skipped_no_score += 1
            continue

        away_score, home_score = score
        spread_home = to_number(game.get("spread_home"))
        total_line = to_number(game.get("total"))

        if spread_home is None or total_line is None:
            skipped_no_line += 1
            continue

        new_spread = grade_spread(
            pick.get("spread_pick"), spread_home, away_score, home_score
        )
        new_total = grade_total(
            pick.get("total_pick"), total_line, away_score, home_score
        )

        if (
            new_spread == pick.get("spread_result")
            and new_total == pick.get("total_result")
        ):
            unchanged += 1
            continue

        patch_pick(pick["id"], new_spread, new_total)
        updated += 1

    print("Picks read:              {}".format(len(picks)))
    print("Picks updated:           {}".format(updated))
    print("Already correct:         {}".format(unchanged))
    print("Skipped, no final score: {}".format(skipped_no_score))
    print("Skipped, no game row:    {}".format(skipped_no_game))
    print("Skipped, missing line:   {}".format(skipped_no_line))


if __name__ == "__main__":
    main()
