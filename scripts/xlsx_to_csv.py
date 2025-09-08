#!/usr/bin/env python3
import sys
import re
import csv
from pathlib import Path
from openpyxl import load_workbook

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "docs" / "data"

def die(msg, code=78):
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(code)

def find_xlsx(folder: str, week: int) -> Path:
    wk_tag = f"wk{week:02d}"
    if folder not in {"scores", "picks", "final"}:
        die(f"Folder must be one of: scores|picks|final (got '{folder}')")
    base = DATA_DIR / folder
    suffix = {"scores":"scores","picks":"picks","final":"final"}[folder]
    matches = sorted(base.glob(f"*_{wk_tag}_{suffix}.xlsx"))
    if not matches:
        die(f"No XLSX found for {wk_tag} in {base}")
    # pick the highest (latest) season lexicographically
    return max(matches)

def xlsx_to_csv(xlsx_path: Path, csv_path: Path):
    wb = load_workbook(filename=xlsx_path, read_only=True, data_only=True)
    ws = wb.active

    rows = []
    for row in ws.iter_rows(values_only=True):
        # Convert None -> "" and ensure strings
        rows.append([("" if v is None else str(v)) for v in row])

    if not rows:
        die(f"{xlsx_path} appears to be empty")

    headers = rows[0]
    data = rows[1:]

    csv_path.parent.mkdir(parents=True, exist_ok=True)
    with csv_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(headers)
        writer.writerows(data)

def main():
    if len(sys.argv) != 3:
        die("Usage: xlsx_to_csv.py <folder: scores|picks|final> <week-number 1..18>")

    folder = sys.argv[1].strip().lower()
    try:
        week = int(sys.argv[2])
    except:
        die("Week must be an integer 1..18")
    if not (1 <= week <= 18):
        die("Week must be 1..18")

    xlsx_path = find_xlsx(folder, week)

    # Build the CSV path by swapping extension
    csv_path = xlsx_path.with_suffix(".csv")

    xlsx_to_csv(xlsx_path, csv_path)

    print(f"Converted XLSX -> CSV")
    print(f"  XLSX: {xlsx_path.relative_to(ROOT)}")
    print(f"  CSV : {csv_path.relative_to(ROOT)}")

if __name__ == "__main__":
    main()
