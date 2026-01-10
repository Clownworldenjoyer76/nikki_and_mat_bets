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
      inQ = !inQ;
    } else if (ch === "," && !inQ) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
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

// ===== GRADING =====
function gradeByWeek(rows, picker) {
  const byWeek = new Map();

  rows.forEach(r => {
    const wk = parseInt(r.week, 10);
    if (!byWeek.has(wk)) {
      byWeek.set(wk, { ats: { W: 0, L: 0, P: 0 }, ou: { W: 0, L: 0, P: 0 } });
    }
    const rec = byWeek.get(wk);
    const ats = r[`${picker}_ats`];
    const ou  = r[`${picker}_ou`];
    if (rec.ats[ats] !== undefined) rec.ats[ats]++;
    if (rec.ou[ou] !== undefined) rec.ou[ou]++;
  });

  return byWeek;
}

function recordStr(r) {
  return `${r.W}-${r.L}${r.P ? "-" + r.P : ""}`;
}

// ===== TABLE FILL =====
function fillTable(tbody, byWeek) {
  tbody.innerHTML = "";

  // Weeks 1–18 (UNCHANGED)
  for (let wk = 1; wk <= 18; wk++) {
    const rec = byWeek.get(wk);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>Week ${wk}</td>
      <td>${rec ? recordStr(rec.ats) : "—"}</td>
      <td>${rec ? recordStr(rec.ou) : "—"}</td>
    `;
    tbody.appendChild(tr);
  }

  // Weeks 19–22 (APPENDED, DATA-AWARE)
  const playoffWeeks = [
    { wk: 19, label: "WC" },
    { wk: 20, label: "DIV" },
    { wk: 21, label: "CONF" },
    { wk: 22, label: "SB" }
  ];

  playoffWeeks.forEach(p => {
    const rec = byWeek.get(p.wk);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${p.label}</td>
      <td>${rec ? recordStr(rec.ats) : "—"}</td>
      <td>${rec ? recordStr(rec.ou) : "—"}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ===== UI =====
function setSubtitle(seasonLabel) {
  const el = document.getElementById("subtitle");
  if (el) el.textContent = seasonLabel;
}

function highlightWinners() {
  // unchanged
}

// ===== MAIN =====
async function main() {
  const csv = await fetchText(METRICS_CSV);
  const rows = parseCSV(csv);

  const seasonLabel = "2025";

  const nikki = gradeByWeek(rows, "nikki");
  const mat   = gradeByWeek(rows, "mat");

  const nikBody = document.querySelector("#nikkiTable tbody");
  const matBody = document.querySelector("#matTable tbody");
  if (!nikBody || !matBody) return;

  fillTable(nikBody, nikki);
  fillTable(matBody, mat);
  setSubtitle(seasonLabel);

  highlightWinners();
}

main();
