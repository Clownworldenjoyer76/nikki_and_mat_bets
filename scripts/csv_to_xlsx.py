#!/usr/bin/env python3
import csv, re, sys
from pathlib import Path

from openpyxl import Workbook

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "docs" / "data"

def die(msg, code=78):
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(code)

def find_csv(folder: str, week: int) -> Path:
    wk_tag = f"wk{week:02d}"
    if folder == "scores":
        pattern = f"*_{wk_tag}_scores.csv"
        base_dir = DATA_DIR / "scores"
    elif folder == "picks":
        pattern = f"*_{wk_tag}_picks.csv"
        base_dir = DATA_DIR / "picks"
    elif folder == "final":
        pattern = f"*_{wk_tag}_final.csv"
        base_dir = DATA_DIR / "final"
    else:
        die(f"Folder must be one of: scores|picks|final (got '{folder}')")

    matches = sorted(base_dir.glob(pattern))
    if not matches:
        die(f"No CSV found for {folder} {wk_tag} in {base_dir}")
    # pick highest (latest) season by lexicographic name
    return max(matches)

def csv_to_xlsx(csv_path: Path, xlsx_path: Path):
    with csv_path.open("r", newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        rows = list(reader)

    wb = Workbook()
    ws = wb.active
    ws.title = "Sheet1"

    for row in rows:
        ws.append(row)

    xlsx_path.parent.mkdir(parents=True, exist_ok=True)
    wb.save(xlsx_path)

def main():
    if len(sys.argv) != 3:
        die("Usage: csv_to_xlsx.py <folder: scores|picks|final> <week-number 1..18>")

    folder = sys.argv[1].strip().lower()
    try:
        week = int(sys.argv[2])
    except:
        die("Week must be an integer 1..18")

    if not (1 <= week <= 18):
        die("Week must be 1..18")

    csv_path = find_csv(folder, week)
    xlsx_path = csv_path.with_suffix(".xlsx")

    csv_to_xlsx(csv_path, xlsx_path)

    rel = xlsx_path.relative_to(ROOT)
    print(f"Wrote XLSX: {rel}")

if __name__ == "__main__":
    main()
