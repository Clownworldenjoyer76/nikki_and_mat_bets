#!/usr/bin/env python3
import os
import re
import csv
from pathlib import Path
import sys

PICKS_DIR = Path("docs/data/picks")

def die(msg):
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(1)

# ----- FORCE SEASON FROM ENV -----
SEASON = os.getenv("SEASON")
if not SEASON or not SEASON.isdigit():
    die("SEASON environment variable is required and must be a year (e.g. 2025)")

# ----- READ ISSUE BODY -----
issue_file = Path("issue_body.txt")
if not issue_file.exists():
    die("issue_body.txt not found")

text = issue_file.read_text()

# ----- EXTRACT WEEK ONLY -----
m_week = re.search(r"Week:\s*(\d+)", text)
if not m_week:
    die("Week not found in issue body (expected 'Week: X')")

week = int(m_week.group(1))

# ----- OUTPUT FILE -----
PICKS_DIR.mkdir(parents=True, exist_ok=True)
out_path = PICKS_DIR / f"{SEASON}_wk{week:02d}_picks.csv"

# ----- PARSE PICKS -----
rows = []

for line in text.splitlines():
    line = line.strip()
    if not line:
        continue

    # Example expected patterns (unchanged behavior)
    m = re.match(
        r"(?P<game_id>\S+)\s+"
        r"(?P<picker>\w+)\s+"
        r"(?P<ptype>ATS|OU)\s+"
        r"(?P<pick>.+)",
        line,
        re.IGNORECASE
    )

    if not m:
        continue

    rows.append({
        "season": SEASON,
        "week": week,
        "game_id": m.group("game_id"),
        "picker": m.group("picker"),
        "pick_type": m.group("ptype").upper(),
        "pick": m.group("pick")
    })

if not rows:
    die("No valid picks found in issue body")

# ----- WRITE CSV -----
with out_path.open("w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(
        f,
        fieldnames=["season", "week", "game_id", "picker", "pick_type", "pick"]
    )
    writer.writeheader()
    writer.writerows(rows)

print(f"Wrote picks file: {out_path}")
