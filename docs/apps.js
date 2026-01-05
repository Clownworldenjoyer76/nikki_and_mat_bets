/* apps.js */

async function fetchCSV(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return res.text();
}

function parseCSV(text) {
  const lines = text.trim().split("\n");
  const headers = lines[0].split(",");
  return lines.slice(1).map(line => {
    const values = line.split(",");
    const obj = {};
    headers.forEach((h, i) => obj[h] = values[i]);
    return obj;
  });
}

function weekLabel(wk) {
  if (wk === 19) return "WC";
  if (wk === 20) return "DIV";
  if (wk === 21) return "CONF";
  if (wk === 22) return "SB";
  return `Week ${wk}`;
}

function buildWeeklyTable(rows) {
  const byWeek = new Map();

  rows.forEach(r => {
    const wk = parseInt(r.week, 10);
    if (!byWeek.has(wk)) {
      byWeek.set(wk, { ats: 0, ou: 0 });
    }
    const rec = byWeek.get(wk);
    if (r.ats === "W") rec.ats++;
    if (r.ou === "W") rec.ou++;
  });

  const tbody = document.querySelector("#weekly tbody");
  tbody.innerHTML = "";

  for (let wk = 1; wk <= 22; wk++) {
    const rec = byWeek.get(wk);
    const tr = document.createElement("tr");

    const tdWeek = document.createElement("td");
    tdWeek.textContent = weekLabel(wk);

    const tdATS = document.createElement("td");
    tdATS.textContent = rec ? rec.ats : "—";

    const tdOU = document.createElement("td");
    tdOU.textContent = rec ? rec.ou : "—";

    tr.appendChild(tdWeek);
    tr.appendChild(tdATS);
    tr.appendChild(tdOU);
    tbody.appendChild(tr);
  }
}

async function init() {
  try {
    const csv = await fetchCSV("data/metrics/2025_metrics.csv");
    const rows = parseCSV(csv);
    buildWeeklyTable(rows);
  } catch (err) {
    console.error(err);
  }
}

document.addEventListener("DOMContentLoaded", init);
