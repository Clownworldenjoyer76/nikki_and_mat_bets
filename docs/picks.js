// ===== SOURCE: single file accumulating all weeks of the season =====
const METRICS_CSV = "docs/data/metrics/2025_metrics.csv";

// ===== CSV HELPERS =====
async function fetchText(url) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`Fetch failed: ${url} (${r.status})`);
  return r.text();
}

// Robust CSV splitter (handles quoted commas and escaped quotes)
function smartSplit(line) {
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; } // escaped quote
      else { inQ = !inQ; }
    } else if (ch === "," && !inQ) {
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
  const headers = smartSplit(lines.shift() || "").map(h => h.trim());
  const rows = lines.map(l => {
    const cells = smartSplit(l);
    const o = {};
    headers.forEach((h, i) => { o[h] = (cells[i] ?? "").trim(); });
    return o;
  });
  return { headers, rows };
}

const toNum = v => (v === "" || v == null ? null : (Number.isFinite(+v) ? +v : null));
const lc = s => (s || "").trim().toLowerCase();

// ===== COLUMN MAP (supports both the new metrics names and the older names) =====
const COLS = {
  season: ["season"],
  week: ["week"],
  homeScore: ["home_score"],
  awayScore: ["away_score"],
  spreadHome: ["spread_home", "spread"], // prefer spread_home, else spread
  total: ["total", "over_under"],         // prefer total, else over_under
  nikkiAts: ["nikki_spread", "nikki_pick"],
  matAts:   ["mat_spread",   "mat_pick"],
  nikkiOu:  ["nikki_total"],
  matOu:    ["mat_total"]
};

function pickCol(row, keys) {
  for (const k of keys) if (k in row) return k;
  return null;
}

// ===== GRADING =====
function gradeByWeek(rows, who) {
  // Resolve column names once based on the first row
  const probe = rows[0] || {};
  const cols = {
    season:     pickCol(probe, COLS.season),
    week:       pickCol(probe, COLS.week),
    homeScore:  pickCol(probe, COLS.homeScore),
    awayScore:  pickCol(probe, COLS.awayScore),
    spreadHome: pickCol(probe, COLS.spreadHome),
    total:      pickCol(probe, COLS.total),
    ats:        pickCol(probe, who === "nikki" ? COLS.nikkiAts : COLS.matAts),
    ou:         pickCol(probe, who === "nikki" ? COLS.nikkiOu  : COLS.matOu)
  };

  const accByWeek = new Map(); // wk -> {wS,lS,pS,wT,lT,pT}
  const season = { wS:0, lS:0, pS:0, wT:0, lT:0, pT:0 };

  for (const r of rows) {
    const wk = Number(r[cols.week]);
    if (!Number.isFinite(wk)) continue;

    const hs = toNum(r[cols.homeScore]);
    const as = toNum(r[cols.awayScore]);
    if (hs === null || as === null) continue; // only grade finished games

    const spreadHome = cols.spreadHome ? toNum(r[cols.spreadHome]) : null;
    const totalLine  = cols.total      ? toNum(r[cols.total])      : null;
    const sidePick   = cols.ats ? lc(r[cols.ats]) : "";
    let   totPickRaw = cols.ou  ? lc(r[cols.ou])  : "";

    // Normalize possible O/U shorthands
    const totPick = totPickRaw === "o" ? "over"
                   : totPickRaw === "u" ? "under"
                   : totPickRaw;

    if (!accByWeek.has(wk)) accByWeek.set(wk, { wS:0,lS:0,pS:0, wT:0,lT:0,pT:0 });
    const W = accByWeek.get(wk);

    // ATS grading (spread is home-centric: -3.5 means home favored by 3.5)
    if (spreadHome !== null && (sidePick === "home" || sidePick === "away")) {
      const covered = (hs - as) + spreadHome; // >0 home covers; <0 away covers; 0 push
      const res = covered > 0 ? "home" : covered < 0 ? "away" : "push";
      if (res === "push") { W.pS++; season.pS++; }
      else if (res === sidePick)   { W.wS++; season.wS++; }
      else                         { W.lS++; season.lS++; }
    }

    // Totals grading
    if (totalLine !== null && (totPick === "over" || totPick === "under")) {
      const sum = hs + as;
      const res = sum > totalLine ? "over" : sum < totalLine ? "under" : "push";
      if (res === "push") { W.pT++; season.pT++; }
      else if (res === totPick)   { W.wT++; season.wT++; }
      else                        { W.lT++; season.lT++; }
    }
  }

  const fmt = (w,l,p) => `${w}-${l}${p ? `-${p}` : ""}`;
  const byWeek = new Map(
    [...accByWeek.entries()].map(([wk,v]) => [wk, { ats: fmt(v.wS,v.lS,v.pS), ou: fmt(v.wT,v.lT,v.pT) }])
  );
  const overall = { ats: fmt(season.wS, season.lS, season.pS), ou: fmt(season.wT, season.lT, season.pT) };
  return { byWeek, overall };
}

function deriveSeasonLabel(rows) {
  const seasons = [...new Set(rows.map(r => String(r.season || "").trim()).filter(Boolean))];
  const nums = seasons.map(s => +s).filter(Number.isFinite);
  return nums.length ? String(Math.max(...nums)) : String(new Date().getFullYear());
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
  addRow(tbody, seasonLabel, graded.overall.ats, graded.overall.ou, "year-row"); // season total
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
