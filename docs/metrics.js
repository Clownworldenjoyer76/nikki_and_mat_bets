// Simple CSV loader
async function fetchCSV(path) {
  const res = await fetch(path + "?v=" + Date.now());
  if (!res.ok) throw new Error("Failed to load " + path);
  const text = await res.text();
  const [header, ...lines] = text.trim().split(/\r?\n/);
  const cols = header.split(",");
  return lines.filter(Boolean).map(l => {
    const vals = l.split(",");
    const o = {};
    cols.forEach((c, i) => o[c] = vals[i] ?? "");
    return o;
  });
}
function uniq(arr){ return Array.from(new Set(arr)); }

const paths = {
  teamAts: "data/metrics/team_ats_by_picker.csv",
  fadeAts: "data/metrics/team_fade_ats_by_picker.csv",
  teamTotals: "data/metrics/team_totals_by_picker.csv"
};

let store = { teamAts:[], fadeAts:[], teamTotals:[] };
let sortState = {
  pick: { key: "win_pct", dir: "desc" },
  fade: { key: "win_pct", dir: "desc" },
  tot:  { key: "win_pct", dir: "desc" }
};

function asNum(v){ return Number(v || 0); }
function cmp(a,b,key,dir="desc"){
  const an = (key==="team"||key==="opponent"||key==="side") ? String(a[key]).toLowerCase() : asNum(a[key]);
  const bn = (key==="team"||key==="opponent"||key==="side") ? String(b[key]).toLowerCase() : asNum(b[key]);
  let out = 0;
  if (an < bn) out = -1; else if (an > bn) out = 1;
  return dir==="desc" ? -out : out;
}

function currentPicker(){ return document.getElementById("pickerSel").value; }
function currentSeason(){ return document.getElementById("seasonSel").value; }
function teamFilter(){ return (document.getElementById("teamSearch").value || "").toLowerCase(); }

function renderPick() {
  const picker = currentPicker(), season = currentSeason(), f = teamFilter();
  let rows = store.teamAts.filter(r => r.picker===picker && r.season===season);
  if (f) rows = rows.filter(r => r.team.toLowerCase().includes(f));
  const {key, dir} = sortState.pick;
  rows.sort((a,b)=>cmp(a,b,key,dir));
  document.getElementById("countPick").textContent = `(${rows.length})`;
  document.getElementById("bodyPick").innerHTML = rows.map(r => `
    <tr>
      <td>${r.team}</td>
      <td>${r.wins}</td>
      <td>${r.losses}</td>
      <td>${r.pushes}</td>
      <td>${r.games}</td>
      <td>${r.win_pct}</td>
    </tr>
  `).join("");
}
function renderFade() {
  const picker = currentPicker(), season = currentSeason(), f = teamFilter();
  let rows = store.fadeAts.filter(r => r.picker===picker && r.season===season);
  if (f) rows = rows.filter(r => r.opponent.toLowerCase().includes(f));
  // normalize opponent field to "team" for sorting key binding
  rows = rows.map(r => ({...r, team:r.opponent}));
  const {key, dir} = sortState.fade;
  rows.sort((a,b)=>cmp(a,b,key==="team"?"team":key,dir));
  document.getElementById("countFade").textContent = `(${rows.length})`;
  document.getElementById("bodyFade").innerHTML = rows.map(r => `
    <tr>
      <td>${r.team}</td>
      <td>${r.wins}</td>
      <td>${r.losses}</td>
      <td>${r.pushes}</td>
      <td>${r.games}</td>
      <td>${r.win_pct}</td>
    </tr>
  `).join("");
}
function renderTot() {
  const picker = currentPicker(), season = currentSeason(), f = teamFilter();
  let rows = store.teamTotals.filter(r => r.picker===picker && r.season===season);
  if (f) rows = rows.filter(r => r.team.toLowerCase().includes(f));
  const {key, dir} = sortState.tot;
  rows.sort((a,b)=>cmp(a,b,key,dir));
  document.getElementById("countTot").textContent = `(${rows.length})`;
  document.getElementById("bodyTot").innerHTML = rows.map(r => `
    <tr>
      <td>${r.team}</td>
      <td>${r.side}</td>
      <td>${r.wins}</td>
      <td>${r.losses}</td>
      <td>${r.pushes}</td>
      <td>${r.games}</td>
      <td>${r.win_pct}</td>
    </tr>
  `).join("");
}

function renderAll(){ renderPick(); renderFade(); renderTot(); }

async function boot() {
  const [ta, fa, tt] = await Promise.all([
    fetchCSV(paths.teamAts),
    fetchCSV(paths.fadeAts),
    fetchCSV(paths.teamTotals)
  ]);
  store.teamAts = ta;
  store.fadeAts = fa;
  store.teamTotals = tt;

  // Populate seasons (latest default)
  const seasons = uniq([].concat(ta,fa,tt).map(r => r.season).filter(Boolean)).sort();
  const seasonSel = document.getElementById("seasonSel");
  seasonSel.innerHTML = seasons.map(s => `<option value="${s}">${s}</option>`).join("");
  if (seasons.length) seasonSel.value = seasons[seasons.length-1];

  renderAll();
}

// Tab switching
document.addEventListener("click", (e) => {
  const pill = e.target.closest(".pill");
  if (pill){
    document.querySelectorAll(".pill").forEach(p=>p.classList.remove("active"));
    document.querySelectorAll("section.panel").forEach(s=>s.classList.remove("active"));
    pill.classList.add("active");
    document.getElementById(pill.dataset.tab).classList.add("active");
    return;
  }
  const thBtn = e.target.closest("thead th button");
  if (thBtn){
    const key = thBtn.dataset.sort;
    const activePanel = document.querySelector("section.panel.active").id;
    if (activePanel==="pick-team"){
      const s = sortState.pick;
      s.dir = (s.key===key && s.dir==="desc") ? "asc" : "desc";
      s.key = key;
      renderPick();
    } else if (activePanel==="fade-team"){
      const s = sortState.fade;
      s.dir = (s.key===key && s.dir==="desc") ? "asc" : "desc";
      s.key = key;
      renderFade();
    } else if (activePanel==="totals-team"){
      const s = sortState.tot;
      s.dir = (s.key===key && s.dir==="desc") ? "asc" : "desc";
      s.key = key;
      renderTot();
    }
  }
});

// Controls
document.addEventListener("change", (e) => {
  if (e.target.id==="pickerSel" || e.target.id==="seasonSel") renderAll();
});
document.getElementById("teamSearch").addEventListener("input", () => renderAll());

// Go
boot().catch(err => {
  console.error(err);
  alert("Failed to load metrics. Make sure you ran the 'Build Insights Metrics' workflow and that docs/data/metrics/*.csv exist.");
});
