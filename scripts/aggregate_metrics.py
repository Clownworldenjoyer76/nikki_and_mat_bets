#!/usr/bin/env python3
import sys
from pathlib import Path
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
FINAL_DIR = ROOT / "docs" / "data" / "final"
METRICS_DIR = ROOT / "docs" / "data" / "metrics"

def main():
    if len(sys.argv) < 2:
        print("Usage: aggregate_metrics.py <season>")
        sys.exit(1)

    season = sys.argv[1]
    pattern = f"{season}_wk*_final.csv"

    files = sorted(FINAL_DIR.glob(pattern))
    if not files:
        print(f"No final CSVs found for season {season}")
        sys.exit(1)

    print(f"Found {len(files)} final CSVs for season {season}")
    dfs = []
    for f in files:
        try:
            df = pd.read_csv(f)
            df["__source_file"] = f.name
            dfs.append(df)
        except Exception as e:
            print(f"Error reading {f}: {e}")

    if not dfs:
        print("No valid CSVs loaded, exiting.")
        sys.exit(1)

    combined = pd.concat(dfs, ignore_index=True)

    # Example aggregations — adjust for your columns
    metrics = {}
    if "team" in combined.columns:
        metrics["games_per_team"] = combined.groupby("team").size().to_dict()
    if "winner" in combined.columns:
        metrics["wins_per_team"] = combined.groupby("winner").size().to_dict()

    # Save combined CSV
    METRICS_DIR.mkdir(parents=True, exist_ok=True)
    out_file = METRICS_DIR / f"{season}_metrics.csv"
    combined.to_csv(out_file, index=False)
    print(f"Saved metrics to {out_file}")

if __name__ == "__main__":
    main()
