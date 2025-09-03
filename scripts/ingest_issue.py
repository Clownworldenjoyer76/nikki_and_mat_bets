import json, os, re, sys, pathlib

def main():
    # Read the issue body from env (GitHub passes it in below)
    body = os.environ.get("ISSUE_BODY", "")
    title = os.environ.get("ISSUE_TITLE", "")

    # Pull JSON between ```json ... ```
    m = re.search(r"```json\s*(\{.*?\})\s*```", body, flags=re.S)
    if not m:
        print("No JSON block found in issue body")
        sys.exit(1)
    picks_json = m.group(1)

    # Parse season/week from title like: "PICKS 2025 WK01 (Mathew vs Wife)"
    sm = re.search(r"PICKS\s+(\d{4})", title)
    wm = re.search(r"WK(\d{2})", title)
    if not (sm and wm):
        print("Title must contain 'PICKS <YEAR> WK<NN>'")
        sys.exit(1)
    season = sm.group(1)
    week = wm.group(1)

    # Validate JSON (also normalizes formatting)
    picks = json.loads(picks_json)

    out_dir = pathlib.Path("picks")
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{season}_wk{week}_picks.json"
    out_path.write_text(json.dumps(picks, indent=2, sort_keys=True))
    print(f"WROTE {out_path}")

if __name__ == "__main__":
    main()
