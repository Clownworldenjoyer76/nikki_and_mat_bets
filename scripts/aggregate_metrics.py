name: Build Metrics (Manual)

on:
  workflow_dispatch:
    inputs:
      season:
        description: "Season year (e.g., 2025). Leave blank to auto-detect from final CSVs."
        required: false
        default: ""

permissions:
  contents: write

jobs:
  run:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.11"

      - name: Run aggregator
        shell: bash
        run: |
          set -e

          IN_SEASON="${{ inputs.season }}"
          if [ -z "$IN_SEASON" ]; then
            # Auto-detect season from newest final csv
            latest=$(ls -t docs/data/final/*_wk*_final.csv 2>/dev/null | head -n1 || true)
            if [ -n "$latest" ]; then
              base=$(basename "$latest")
              # e.g. 2025_wk01_final.csv -> 2025
              IN_SEASON="${base%%_*}"
              echo "Auto-detected season: $IN_SEASON"
            else
              echo "ERROR: No final CSVs found to auto-detect season."
              exit 78
            fi
          fi

          # Sanity: ensure at least one final for this season exists
          matches=$(ls docs/data/final/${IN_SEASON}_wk*_final.csv 2>/dev/null | wc -l | xargs)
          if [ "$matches" = "0" ]; then
            echo "ERROR: No final CSVs for season ${IN_SEASON}"
            exit 78
          fi

          # Install deps your aggregator might need
          python -m pip install --upgrade pip pandas

          # Call your aggregator (adjusted to your script name)
          python scripts/aggregate_metrics.py "${IN_SEASON}"

      - name: Commit metrics
        if: always()
        run: |
          git config user.name "github-actions"
          git config user.email "actions@users.noreply.github.com"
          git add docs/data/metrics/*.csv || true
          git commit -m "Metrics updated" || echo "No metric changes"
          git push || true
