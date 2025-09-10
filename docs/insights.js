// ===== Data sources =====
const PATHS = {
  teamAts:  "data/metrics/team_ats_by_picker.csv",
  fadeAts:  "data/metrics/team_fade_ats_by_picker.csv",
  homeAway: "data/metrics/home_away_ats_by_picker.csv",
  totals:   "data/metrics/totals_by_picker.csv",
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

async function loadAll() {
  const [ta, fa, ha, to] = await Promise.all([
    fetchText(PATHS.teamAts).then(parseCSV),
    fetchText(PATHS.fadeAts).then(parseCSV),
    fetchText(PATHS.homeAway).then(parseCSV),
    fetchText(PATHS.totals).then(parseCSV),
  ]);
  store.teamAts = ta;
  store.fadeAts = fa;
  store.homeAway = ha;
  store.totals = to;

  // Seasons list
  const seasons = Array.from(new Set(
    [...ta, ...fa, ...ha, ...to].map(r => r.season).filter(Boolean)
  )).map(s => +s).filter(n => Number.isFinite(n)).sort((a,b)=>a-b);

  const seasonSel = document.getElementById("seasonSel");
  seasonSel.innerHTML = seasons.map(s => `<option value="${s}">${s}</option>`).join("");
  seasonSel.value = seasons.length ? String(seasons[seasons.length-1]) : "";

  // Team filter options from teamAts + fadeAts (team and opponent columns)
  const teamSet = new Set();
  ta.forEach(r => teamSet.add(r.team));
  fa.forEach(r => teamSet.add(r.opponent));
  const teamFilter = document.getElementById("teamFilter");
  const sortedTeams = Array.from(teamSet).filter(Boolean).sort((a,b)=>a.localeCompare(b));
  teamFilter.innerHTML = `<option value="">All Teams</option>` + sortedTeams.map(t => `<option value="${t}">${t}</option>`).join("");

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
  // tie-breakers
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
    ta.map(r => fmtRow(r.team, r.wins, r.losses, r.pushes, r.games, r.win_pct)).join("");

  // fade ats
  let fa = store.fadeAts.filter(r => r.picker === picker && String(r.season) === String(season));
  if (teamFilterVal) fa = fa.filter(r => r.opponent === teamFilterVal);
  fa.sort(byWinPctDesc);
  document.getElementById(prefix + "fadeAtsBody").innerHTML =
    fa.map(r => fmtRow(r.opponent, r.wins, r.losses, r.pushes, r.games, r.win_pct)).join("");

  // home/away ats
  let ha = store.homeAway.filter(r => r.picker === picker && String(r.season) === String(season));
  // (team filter not applicable here, this is global by side)
  ha.sort((a,b) => (a.side||"").localeCompare(b.side||""));
  document.getElementById(prefix + "homeAwayBody").innerHTML =
    ha.map(r => fmtRow(r.side, r.wins, r.losses, r.pushes, r.games, r.win_pct)).join("");

  // totals over/under
  let to = store.totals.filter(r => r.picker === picker && String(r.season) === String(season));
  // (team filter not applicable; totals are by side over/under)
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
  alert("Failed to load insights data. Ensure docs/data/metrics/*.csv exist.");
});
