// ===== Data sources =====
const PATHS = {
  teamAts:  "data/metrics/team_ats_by_picker.csv",
  fadeAts:  "data/metrics/team_fade_ats_by_picker.csv",
  homeAway: "data/metrics/home_away_ats_by_picker.csv",
  totals:   "data/metrics/totals_by_picker.csv",
  // IMPORTANT: this file must be under docs/ to be published by GitHub Pages
  teamAbbr: "mappings/team_abbr.csv",
};

// ===== CSV helpers (robust to quoted commas) =====
async function fetchText(url) {
  const r = await fetch(url + "?v=" + Date.now(), { cache: "no-store" });
  if (!r.ok) throw new Error(`Fetch failed: ${url} (${r.status})`);
  return r.text();
}
function smartSplit(line) {
  const out = [];
  let cur = "", inQ = false;
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
  const lines = txt.replace(/\r/g,"").trim().split("\n");
  if (!lines.length) return [];
  const headers = smartSplit(lines.shift()).map(h => h.trim());
  return lines.map(l => {
    const cells = smartSplit(l);
    const o = {};
    headers.forEach((h, i) => o[h] = (cells[i] ?? "").trim());
    return o;
  });
}
const toNum = (v) => (v === "" || v == null ? null : (Number.isFinite(+v) ? +v : null));

// ===== Store =====
const store = { teamAts:[], fadeAts:[], homeAway:[], totals:[] };
const abbrMap = Object.create(null); // full name -> ABBR

// Load team abbreviation map: expects columns Team,Abbr
async function loadAbbr() {
  try {
    const txt = await fetchText(PATHS.teamAbbr);
    const rows = parseCSV(txt);
    rows.forEach(r => {
      const full = (r.Team || r.team || "").trim();
      const abbr = (r.Abbr || r.abbr || "").trim();
      if (full && abbr) abbrMap[full] = abbr;
    });
  } catch (e) {
    console.warn("Team abbreviation file missing or failed to load:", e);
  }
}
function shortName(name) {
  if (!name) return "";
  return abbrMap[name] || name;
}

// ===== Init all data =====
async function loadAll() {
  const [taTxt, faTxt, haTxt, toTxt] = await Promise.all([
    fetchText(PATHS.teamAts),
    fetchText(PATHS.fadeAts),
    fetchText(PATHS.homeAway),
    fetchText(PATHS.totals),
  ]);
  store.teamAts = parseCSV(taTxt);
  store.fadeAts = parseCSV(faTxt);
  store.homeAway = parseCSV(haTxt);
  store.totals = parseCSV(toTxt);

  // Load abbreviations AFTER other files kick off, but we await before render
  await loadAbbr();

  // Seasons list
  const seasons = Array.from(new Set(
    [...store.teamAts, ...store.fadeAts, ...store.homeAway, ...store.totals]
      .map(r => r.season).filter(Boolean)
  )).map(s => +s).filter(n => Number.isFinite(n)).sort((a,b)=>a-b);

  const seasonSel = document.getElementById("seasonSel");
  seasonSel.innerHTML = seasons.map(s => `<option value="${s}">${s}</option>`).join("");
  seasonSel.value = seasons.length ? String(seasons[seasons.length-1]) : "";

  // Team filter options from teamAts + fadeAts (team and opponent columns)
  const teamSet = new Set();
  store.teamAts.forEach(r => teamSet.add(r.team));
  store.fadeAts.forEach(r => teamSet.add(r.opponent));

  const teamFilter = document.getElementById("teamFilter");
  const sortedTeams = Array.from(teamSet).filter(Boolean).sort((a,b)=>a.localeCompare(b));
  // Show abbreviations in the dropdown as well
  teamFilter.innerHTML =
    `<option value="">All Teams</option>` +
    sortedTeams.map(t => `<option value="${t}">${shortName(t)}</option>`).join("");

  setSubtitle(seasonSel.value);
  render();
}

function setSubtitle(season) {
  const el = document.getElementById("insightsSubtitle");
  if (el) el.textContent = `Season ${season} — Insights by Picker`;
}

// ===== Rendering per picker =====
function fmtPct(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  return (n * 100 >= 10 ? (n*100).toFixed(1) : (n*100).toFixed(2)) + "%";
}
function fmtRow(c1, w,l,p,g, pct) {
  return `<tr><td>${c1}</td><td>${w||0}</td><td>${l||0}</td><td>${p||0}</td><td>${g||0}</td><td>${fmtPct(pct)}</td></tr>`;
}
function byWinPctDesc(a,b) {
  const aw = toNum(a.win_pct) ?? -1;
  const bw = toNum(b.win_pct) ?? -1;
  if (bw !== aw) return bw - aw;
  const an = (a.team ?? a.opponent ?? a.side ?? "").toString();
  const bn = (b.team ?? b.opponent ?? b.side ?? "").toString();
  return an.localeCompare(bn);
}

function renderPicker(picker, prefix, season, teamFilterVal) {
  // team ats
  let ta = store.teamAts.filter(r => r.picker === picker && String(r.season) === String(season));
  if (teamFilterVal) ta = ta.filter(r => r.team === teamFilterVal);
  ta.sort(byWinPctDesc);
  document.getElementById(prefix + "teamAtsBody").innerHTML =
    ta.map(r => fmtRow(shortName(r.team), r.wins, r.losses, r.pushes, r.games, r.win_pct)).join("");

  // fade ats
  let fa = store.fadeAts.filter(r => r.picker === picker && String(r.season) === String(season));
  if (teamFilterVal) fa = fa.filter(r => r.opponent === teamFilterVal);
  fa.sort(byWinPctDesc);
  document.getElementById(prefix + "fadeAtsBody").innerHTML =
    fa.map(r => fmtRow(shortName(r.opponent), r.wins, r.losses, r.pushes, r.games, r.win_pct)).join("");

  // home/away ats (no team dimension)
  let ha = store.homeAway.filter(r => r.picker === picker && String(r.season) === String(season));
  ha.sort((a,b) => (a.side||"").localeCompare(b.side||""));
  document.getElementById(prefix + "homeAwayBody").innerHTML =
    ha.map(r => fmtRow(r.side, r.wins, r.losses, r.pushes, r.games, r.win_pct)).join("");

  // totals over/under (no team dimension)
  let to = store.totals.filter(r => r.picker === picker && String(r.season) === String(season));
  to.sort((a,b) => (a.side||"").localeCompare(b.side||""));
  document.getElementById(prefix + "totalsBody").innerHTML =
    to.map(r => fmtRow(r.side, r.wins, r.losses, r.pushes, r.games, r.win_pct)).join("");
}

function render() {
  const season = document.getElementById("seasonSel").value;
  const teamFilterVal = document.getElementById("teamFilter").value;
  setSubtitle(season);
  renderPicker("Nikki", "nikki_", season, teamFilterVal);
  renderPicker("Mat",   "mat_",   season, teamFilterVal);
}

// Controls
document.addEventListener("change", (e) => {
  if (e.target.id === "seasonSel" || e.target.id === "teamFilter") render();
});

// Init
loadAll().catch(err => {
  console.error(err);
  alert("Failed to load insights data. Ensure docs/data/metrics/*.csv and docs/mappings/team_abbr.csv exist.");
});
