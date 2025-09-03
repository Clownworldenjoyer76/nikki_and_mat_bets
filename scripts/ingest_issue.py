import json, os, re, sys, pathlib

def main():
    body = os.environ.get("ISSUE_BODY", "")
    title = os.environ.get("ISSUE_TITLE", "")

    m = re.search(r"```json\s*(\{.*?\})\s*```", body, flags=re.S)
    if not m:
        print("No JSON block found in issue body"); sys.exit(1)
    picks = json.loads(m.group(1))

    sm = re.search(r"PICKS\s+(\d{4})", title)
    wm = re.search(r"WK(\d{2})", title)
    if not (sm and wm):
        print("Title must contain 'PICKS <YEAR> WK<NN>'"); sys.exit(1)
    season, week = sm.group(1), wm.group(1)

    out_dir = pathlib.Path("picks"); out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{season}_wk{week}_picks.json"
    out_path.write_text(json.dumps(picks, indent=2, sort_keys=True))
    print(f"WROTE {out_path}")

if __name__ == "__main__":
    main()
