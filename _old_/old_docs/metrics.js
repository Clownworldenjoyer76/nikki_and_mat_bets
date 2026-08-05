// ===== Data sources =====
const PATHS = {
  teamAts:   "data/metrics/team_ats_by_picker.csv",
  teamTotals:"data/metrics/team_totals_by_picker.csv", // team + side rows
  teamAbbr:  "mappings/team_abbr.csv"                  // optional overrides
};

// ===== Defaults (32 NFL teams) =====
const DEFAULT_ABBR = {
  "arizona cardinals":"ARI","atlanta falcons":"ATL","baltimore ravens":"BAL","buffalo bills":"BUF",
  "carolina panthers":"CAR","chicago bears":"CHI","cincinnati bengals":"CIN","cleveland browns":"CLE",
  "dallas cowboys":"DAL","denver broncos":"DEN","detroit lions":"DET","green bay packers":"GB",
  "houston texans":"HOU","indianapolis colts":"IND","jacksonville jaguars":"JAX","kansas city chiefs":"KC",
  "las vegas raiders":"LV","los angeles chargers":"LAC","los angeles rams":"LAR","miami dolphins":"MIA",
  "minnesota vikings":"MIN","new england patriots":"NE","new orleans saints":"NO","new york giants":"NYG",
  "new york jets":"NYJ","philadelphia eagles":"PHI","pittsburgh steelers":"PIT","san francisco 49ers":"SF",
  "seattle seahawks":"SEA","tampa bay buccaneers":"TB","tennessee titans":"TEN","washington commanders":"WAS"
};

// ===== CSV helpers (robust to quoted commas) =====
async function fetchText(url) {
  const r = await fetch(url + "?v=" + Date.now(), { cache: "no-store" });
  if (!r.ok) throw new Error(`Fetch failed: ${url} (${r.status})`);
  return r.text();
}
function smartSplit(line) {
  const out = []; let cur = "", inQ = false;
  for (let i=0;i<line.length;i++){
    const ch=line[i];
    if (ch === '"') { if (inQ && line[i+1] === '"') { cur+='"'; i++; } else { inQ=!inQ; } }
    else if (ch === "," && !inQ) { out.push(cur); cur=""; }
    else { cur += ch; }
  }
  out.push(cur);
  return out;
}
function parseCSV(txt) {
  const lines = txt.replace(/\r/g,"").trim().split("\n");
  if (!lines.length) return [];
  const headers = smartSplit(lines.shift()).map(h=>h.trim());
  return lines.filter(Boolean).map(l=>{
    const cells = smartSplit(l); const o={};
    headers.forEach((h,i)=>o[h]=(cells[i]??"").trim());
    return o;
  });
}
const toNum = v => (v===""||v==null) ? null : (Number.isFinite(+v) ? +v : null);

// ===== Abbreviation map =====
const abbrMap = Object.create(null); // normalized full -> ABBR
function normName(s){ return (s||"").trim().toLowerCase().replace(/\s+/g," "); }
Object.entries(DEFAULT_ABBR).forEach(([k,v])=>abbrMap[k]=v);

async function loadAbbrOverrides(){
  try {
    const rows = parseCSV(await fetchText(PATHS.teamAbbr));
    rows.forEach(r=>{
      const full = normName(r.Team || r.team);
      const abbr = (r.Abbr || r.abbr || "").trim();
      if (full && abbr) abbrMap[full]=abbr;
    });
  } catch { /* keep defaults if not present */ }
}
function shortName(name){ const k=normName(name); return abbrMap[k] || name || ""; }

// ===== Win% normalization (fraction or percent -> percent 0..100) =====
function pct100(v){ const n = Number(v); if(!Number.isFinite(n)) return null; return n>1 ? n : n*100; }
function fmtPct(v){ const p=pct100(v); if(p==null) return ""; return (p>=10?p.toFixed(1):p.toFixed(2))+"%"; }

// ===== Store =====
const store = { teamAts:[], teamTotals:[] };

async function loadAll(){
  const [taTxt, ttTxt] = await Promise.all([
    fetchText(PATHS.teamAts),
    fetchText(PATHS.teamTotals),
  ]);
  store.teamAts   = parseCSV(taTxt);
  store.teamTotals= parseCSV(ttTxt);
  await loadAbbrOverrides();

  // Seasons
  const seasons = Array.from(new Set(
    [...store.teamAts, ...store.teamTotals].map(r=>r.season).filter(Boolean)
  )).map(s=>+s).filter(Number.isFinite).sort((a,b)=>a-b);

  const seasonSel = document.getElementById("seasonSel");
  seasonSel.innerHTML = seasons.map(s=>`<option value="${s}">${s}</option>`).join("");
  seasonSel.value = seasons.length ? String(seasons[seasons.length-1]) : "";

  // Team filter (from team names across datasets)
  const teamSet = new Set();
  store.teamAts.forEach(r=>teamSet.add(r.team));
  store.teamTotals.forEach(r=>teamSet.add(r.team));
  const teams = Array.from(teamSet).filter(Boolean).sort((a,b)=>a.localeCompare(b));

  const teamFilter = document.getElementById("teamFilter");
  teamFilter.innerHTML = `<option value="">All Teams</option>` +
    teams.map(t=>`<option value="${t}">${shortName(t)}</option>`).join("");

  setSubtitle(seasonSel.value);
  render();
}

function setSubtitle(season){
  const el = document.getElementById("metricsSubtitle");
  if (el) el.textContent = `Season ${season} — By Team`;
}

// ===== Render helpers =====
function byWinPctDesc(a,b){
  const aw = pct100(a.win_pct) ?? -1;
  const bw = pct100(b.win_pct) ?? -1;
  if (bw !== aw) return bw - aw;
  const an = (a.team ?? a.side ?? "").toString();
  const bn = (b.team ?? b.side ?? "").toString();
  return an.localeCompare(bn);
}
function rowATS(name,w,l,p,g,pct){
  return `<tr><td>${name}</td><td>${w||0}</td><td>${l||0}</td><td>${p||0}</td><td>${g||0}</td><td>${fmtPct(pct)}</td></tr>`;
}
function rowTOT(name,side,w,l,p,g,pct){
  return `<tr><td>${name}</td><td>${side}</td><td>${w||0}</td><td>${l||0}</td><td>${p||0}</td><td>${g||0}</td><td>${fmtPct(pct)}</td></tr>`;
}

function renderPicker(picker, prefix, season, teamFilterVal){
  // ATS
  let ta = store.teamAts.filter(r => r.picker===picker && String(r.season)===String(season));
  if (teamFilterVal) ta = ta.filter(r => r.team===teamFilterVal);
  ta.sort(byWinPctDesc);
  document.getElementById(prefix+"teamAtsBody").innerHTML =
    ta.map(r => rowATS(shortName(r.team), r.wins, r.losses, r.pushes, r.games, r.win_pct)).join("");

  // Totals by team
  let tt = store.teamTotals.filter(r => r.picker===picker && String(r.season)===String(season));
  if (teamFilterVal) tt = tt.filter(r => r.team===teamFilterVal);
  tt.sort((a,b)=> {
    const tn = shortName(a.team).localeCompare(shortName(b.team));
    if (tn !== 0) return tn;
    return (a.side||"").localeCompare(b.side||"");
  });
  document.getElementById(prefix+"teamTotalsBody").innerHTML =
    tt.map(r => rowTOT(shortName(r.team), r.side, r.wins, r.losses, r.pushes, r.games, r.win_pct)).join("");
}

function render(){
  const season = document.getElementById("seasonSel").value;
  const teamFilterVal = document.getElementById("teamFilter").value;
  setSubtitle(season);
  renderPicker("Nikki", "nikki_", season, teamFilterVal);
  renderPicker("Mat",   "mat_",   season, teamFilterVal);
}

// Controls
document.addEventListener("change", (e)=>{
  if (e.target.id === "seasonSel" || e.target.id === "teamFilter") render();
});

// Init
loadAll().catch(err=>{
  console.error(err);
  alert("Failed to load by-team metrics. Ensure docs/data/metrics/*.csv exist (team_ats_by_picker.csv, team_totals_by_picker.csv).");
});
