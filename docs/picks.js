// ===== SOURCE (single season file that accumulates all weeks) =====
const METRICS_CSV = "docs/data/metrics/2025_metrics.csv";

// ===== CSV HELPERS =====
async function fetchText(url) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`Fetch failed: ${url} (${r.status})`);
  return r.text();
}

// Robust CSV split (handles quoted commas)
function smartSplit(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      // Toggle quotes unless it's an escaped quote ("")
      if (inQuotes && line[i + 1] === '"') {
        cur += '"'; i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      out.push(cur); cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function parseCSV(txt) {
  if (!txt || !txt.trim()) return { headers: [], rows: [] };
  const lines = txt.replace(/\r/g, "").trim().split("\n");
  const header = smartSplit(lines.shift() || "");
  const rows = lines.map(l => {
    const cells = smartSplit(l);
    const o = {};
    header.forEach((h, i) => { o[h] = cells[i] ?? ""; });
    return o;
  });
  return { headers: header, rows };
}

const toNum = v => (v === "" || v == null ? null : (Number.isFinite(+v) ? +v : null));
const lc = s => (s || "").trim().toLowerCase();

// ===== GRADING =====
// Expects columns in METRICS_CSV: season, week, home_score, away_score, spread_home, total,
// and for each person: `<who>_spread` in {"home","away"}, `<who>_total` in {"over","under"}.
function gradeByWeek(rows, who) {
  // week -> counters
  const accByWeek = new Map(); // wk -> {wS,lS,pS,wT,lT,pT}
  const season = { wS:0, lS:0, pS:0, wT:0, lT:0, pT:0 };

  for (const r of rows) {
    const wk = Number(r.week);
    if (!Number.isFinite(wk)) continue;

    // only grade finished games
    const hs = toNum(r.home_score);
    const as = toNum(r.away_score);
    if (hs === null || as === null) continue;

    const spreadHome = toNum(r.spread_home);
    const totalLine  = toNum(r.total);
    const sidePick   = lc(r[`${who}_spread`]);  // "home" | "away"
    const totPick    = lc(r[`${who}_total`]);   // "over" | "under"

    if (!accByWeek.has(wk)) accByWeek.set(wk, { wS:0,lS:0,pS:0, wT:0,lT:0,pT:0 });
    const W = accByWeek.get(wk);

    // ATS grading
    if (spreadHome !== null && (sidePick === "home" || sidePick === "away")) {
      const covered = (hs - as) + spreadHome; // >0 home covers; <0 away covers; 0 push
      const res = covered > 0 ? "home" : covered < 0 ? "away" : "push";
      if (res === "push") { W.pS++; season.pS++; }
      else if (res === sidePick)   { W.wS++; season.wS++; }
      else                         { W.lS++; season.lS++; }
    }

    // O/U grading
    if (totalLine !== null && (totPick === "over" || totPick === "under")) {
      const sum = hs + as;
      const res = sum > totalLine ? "over" : sum < totalLine ? "under" : "push";
      if (res === "push") { W.pT++; season.pT++; }
      else if (res === totPick)   { W.wT++; season.wT++; }
      else                        { W.lT++; season.lT++; }
    }
  }

  const fmt = (w,l,p) => `${w}-${l}${p ? `-${p}` : ""}`;

  // Map weeks to display strings
  const byWeek = new Map(
    [...accByWeek.entries()]
      .map(([wk, v]) => [wk, { ats: fmt(v.wS, v.lS, v.pS), ou: fmt(v.wT, v.lT, v.pT) }])
  );
  const overall = { ats: fmt(season.wS, season.lS, season.pS), ou: fmt(season.wT, season.lT, season.pT) };
  return { byWeek, overall };
}

function deriveSeasonLabel(rows) {
  // Prefer numeric max of `season` column; else current year
  const seasons = [...new Set(rows.map(r => String(r.season || "").trim()).filter(Boolean))];
  const nums = seasons.map(s => +s).filter(Number.isFinite);
  if (nums.length) return String(Math.max(...nums));
  return String(new Date().getFullYear());
}

// ===== RENDER =====
function clearBody(tbody) { while (tbody.firstChild) tbody.removeChild(tbody.firstChild); }
function addRow(tbody, label, ats, ou, cls = "") {
  const tr = document.createElement("tr");
  if (cls) tr.className = cls;
  tr.innerHTML = `<td>${label}</td><td>${ats ?? "—"}</td><td>${ou ?? "—"}</td>`;
  tbody.appendChild(tr);
}
function fillTable(tbody, seasonLabel, graded) {
  clearBody(tbody);
  // Top season total row (e.g., 2025)
  addRow(tbody, seasonLabel, graded.overall.ats, graded.overall.ou, "year-row");
  // Week 1..18 rows, always shown; fill with "—" if no graded games that week
  for (let wk = 1; wk <= 18; wk++) {
    const rec = graded.byWeek.get(wk);
    addRow(tbody, `Week ${wk}`, rec?.ats || "—", rec?.ou || "—");
  }
}
function setSubtitle(season) {
  const el = document.getElementById("seasonWeek");
  if (el) el.textContent = `Season ${season} — ATS & O/U by Week`;
}

// ===== MAIN =====
async function main() {
  let rows = [];
  try {
    const txt = await fetchText(METRICS_CSV);
    rows = parseCSV(txt).rows;
  } catch (e) {
    console.error("Could not load metrics CSV:", e);
    // Render empty structure anyway
  }

  const seasonLabel = deriveSeasonLabel(rows);

  const nikki = gradeByWeek(rows, "nikki");
  const mat   = gradeByWeek(rows, "mat");

  const nikBody = document.querySelector("#nikkiTable tbody");
  const matBody = document.querySelector("#matTable tbody");
  if (!nikBody || !matBody) return;

  fillTable(nikBody, seasonLabel, nikki);
  fillTable(matBody, seasonLabel, mat);

  setSubtitle(seasonLabel);
}

main();
