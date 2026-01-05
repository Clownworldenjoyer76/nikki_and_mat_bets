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
    if (ch === '"') inQ = !inQ;
    else if (ch === "," && !inQ) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map(s => s.replace(/^"|"$/g, ""));
}

function parseCSV(text) {
  const lines = text.trim().split("\n");
  const headers = smartSplit(lines[0]);
  return lines.slice(1).map(l => {
    const vals = smartSplit(l);
    const o = {};
    headers.forEach((h, i) => (o[h] = vals[i]));
    return o;
  });
}

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
function lc(x) {
  return (x == null) ? "" : String(x).trim().toLowerCase();
}
function toNum(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function gradeATS(hs, as, spreadHome, pick) {
  if (hs === null || as === null || spreadHome === null) return null;
  if (pick !== "home" && pick !== "away") return null;
  const diff = (hs + spreadHome) - as;
  if (Math.abs(diff) < 1e-12) return "P";
  const homeCovers = diff > 0;
  return pick === "home" ? (homeCovers ? "W" : "L") : (homeCovers ? "L" : "W");
}

function gradeOU(hs, as, totalLine, pick) {
  if (hs === null || as === null || totalLine === null) return null;
  if (pick !== "over" && pick !== "under") return null;
  const sum = hs + as;
  if (Math.abs(sum - totalLine) < 1e-12) return "P";
  const isOver = sum > totalLine;
  return pick === "over" ? (isOver ? "W" : "L") : (isOver ? "L" : "W");
}

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

    if (!accByWeek.has(wk)) accByWeek.set(wk, { wS:0, lS:0, pS:0, wT:0, lT:0, pT:0 });
    const acc = accByWeek.get(wk);

    const atsRes = gradeATS(hs, as, spreadHome, sidePick);
    if (atsRes) {
      if (atsRes === "W") { acc.wS++; season.wS++; }
      else if (atsRes === "L") { acc.lS++; season.lS++; }
      else { acc.pS++; season.pS++; }
    }

    const ouRes = gradeOU(hs, as, totalLine, totPick);
    if (ouRes) {
      if (ouRes === "W") { acc.wT++; season.wT++; }
      else if (ouRes === "L") { acc.lT++; season.lT++; }
      else { acc.pT++; season.pT++; }
    }
  }

  function fmt(w,l,p){ return p ? `${w}-${l}-${p}` : `${w}-${l}`; }

  const byWeek = new Map(
    [...accByWeek.entries()].map(([wk, v]) => [wk, { ats: fmt(v.wS,v.lS,v.pS), ou: fmt(v.wT,v.lT,v.pT) }])
  );

  return {
    overall: { ats: fmt(season.wS,season.lS,season.pS), ou: fmt(season.wT,season.lT,season.pT) },
    byWeek
  };
}

// ===== TABLE HELPERS =====
function clearBody(tbody) {
  while (tbody.firstChild) tbody.removeChild(tbody.firstChild);
}

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

  const playoffWeeks = [
    { wk: 19, label: "WC" },
    { wk: 20, label: "DIV" },
    { wk: 21, label: "CONF" },
    { wk: 22, label: "SB" }
  ];
  for (const p of playoffWeeks) {
    const rec = graded.byWeek.get(p.wk);
    addRow(tbody, p.label, rec?.ats || "—", rec?.ou || "—");
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
  const nikRows = [...document.querySelectorAll("#nikkiTable tbody tr")];
  const matRows = [...document.querySelectorAll("#matTable tbody tr")];
  if (!nikRows.length || !matRows.length) return;

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
    rows = parseCSV(txt);
  } catch (e) {
    console.error(e);
    return;
  }

  const seasonLabel = "2025";

  const nikGraded = gradeByWeek(rows, "nikki");
  const matGraded = gradeByWeek(rows, "mat");

  const nikBody = document.querySelector("#nikkiTable tbody");
  const matBody = document.querySelector("#matTable tbody");
  if (!nikBody || !matBody) return;

  fillTable(nikBody, seasonLabel, nikGraded);
  fillTable(matBody, seasonLabel, matGraded);
  setSubtitle(seasonLabel);

  highlightWinners();
}

main();
