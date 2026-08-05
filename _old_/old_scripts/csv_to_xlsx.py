#!/usr/bin/env python3
import sys
import pandas as pd
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def die(msg, code=78):
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(code)

if len(sys.argv) != 4:
    die("Usage: csv_to_xlsx.py <folder> <week> <season>")

folder = sys.argv[1]
week = int(sys.argv[2])
season = int(sys.argv[3])

if not (1 <= week <= 23):
    die("Week must be 1..23")

src = ROOT / "docs" / "data" / folder / f"{season}_wk{week:02d}_{folder}.csv"
dst = ROOT / "docs" / "data" / folder / f"{season}_wk{week:02d}_{folder}.xlsx"

if not src.exists():
    die(f"Missing source CSV: {src}")

pd.read_csv(src).to_excel(dst, index=False)
print(dst)
