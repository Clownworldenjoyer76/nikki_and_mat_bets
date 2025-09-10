// ===== SOURCE: single file accumulating all weeks of the season =====
const METRICS_CSV = "data/metrics/2025_metrics.csv";

// ===== CSV HELPERS =====
async function fetchText(url) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`Fetch failed: ${url} (${r.status})`);
  return r.text();
}

function smartSplit(line) {
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
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

// ===== COLUMN MAP =====
const COLS = {
  season: ["season"],
  week: ["week"],
  homeScore: ["home_score"],
  awayScore: ["away_score"],
  spreadHome: ["spread_home", "spread"],
  total: ["total", "over_under"],
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

  const accByWeek = new Map();
  const season = { wS:0, lS:0, pS:0, wT:0, lT:0, pT:0 };

  for (const r of rows) {
    const wk = Number(r[cols.week]);
    if (!Number.isFinite(wk)) continue;

    const hs = toNum(r[cols.homeScore]);
    const as = toNum(r[cols.awayScore]);
    if (hs === null || as === null) continue;

    const spreadHome = cols.spreadHome ? toNum(r[cols.spreadHome]) : null;
    const totalLine  = cols.total      ? toNum(r[cols.total])      : null;
    const sidePick   = cols.ats ? lc(r[cols.ats]) : "";
    let   totPickRaw = cols.ou  ? lc(r[cols.ou])  : "";
    const totPick = totPickRaw === "o" ? "over" : totPickRaw === "u" ? "under" : totPickRaw;

    if (!accByWeek.has(wk)) accByWeek.set(wk, { wS:0,lS:0,pS:0, wT:0,lT:0,pT:0 });
    const W = accByWeek.get(wk);

    if (spreadHome !== null && (sidePick === "home" || sidePick === "away")) {
      const covered = (hs - as) + spreadHome;
      const res = covered > 0 ? "home" : covered < 0 ? "away" : "push";
      if (res === "push") { W.pS++; season.pS++; }
      else if (res === sidePick)   { W.wS++; season.wS++; }
      else                         { W.lS++; season.lS++; }
    }

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
  addRow(tbody, seasonLabel, graded.overall.ats, graded.overall.ou, "year-row");
  for (let wk = 1; wk <= 18; wk++) {
    const rec = graded.byWeek.get(wk);
    addRow(tbody, `Week ${wk}`, rec?.ats || "—", rec?.ou || "—");
  }
}
function setSubtitle(season) {
  const el = document.getElementById("seasonWeek");
  if (el) el.textContent = `Season ${season} — ATS & O/U by Week`;
}

// ===== HIGHLIGHT WINNERS =====
function parseWins(str) {
  if (!str || str === "—") return null;
  const parts = str.split("-");
  const wins = parseInt(parts[0], 10);
  return Number.isFinite(wins) ? wins : null;
}
function outlineCompare(nikCell, matCell) {
  const n = parseWins(nikCell.textContent);
  const m = parseWins(matCell.textContent);
  if (n == null || m == null) return;
  if (n > m) {
    nikCell.style.outline = "2px solid lime";
    matCell.style.outline = "2px solid hotpink";
  } else if (m > n) {
    matCell.style.outline = "2px solid lime";
    nikCell.style.outline = "2px solid hotpink";
  } else {
    nikCell.style.outline = "2px solid orange";
    matCell.style.outline = "2px solid orange";
  }
}
function highlightWinners() {
  const nikRows = document.querySelectorAll("#nikkiTable tbody tr");
  const matRows = document.querySelectorAll("#matTable tbody tr");
  for (let i = 0; i < nikRows.length && i < matRows.length; i++) {
    const nTds = nikRows[i].querySelectorAll("td");
    const mTds = matRows[i].querySelectorAll("td");
    if (nTds.length < 3 || mTds.length < 3) continue;
    outlineCompare(nTds[1], mTds[1]); // ATS
    outlineCompare(nTds[2], mTds[2]); // O/U
  }
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

  highlightWinners();
}

main();
