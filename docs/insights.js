
// ----- Data path resolver: fetch from raw GitHub when path starts with "data/" or "docs/data/"
function resolveDataPath(path){
  if(/^https?:\/\//.test(path)) return path;
  if(path.startsWith("./")) path = path.slice(2);
  if(path.startsWith("docs/data/")) return "https://raw.githubusercontent.com/clownworldenjoyer76/nikki_and_mat_bets/main/" + path.replace(/^docs\//,"");
  if(path.startsWith("data/")) return "https://raw.githubusercontent.com/clownworldenjoyer76/nikki_and_mat_bets/main/" + path;
  return path;
}

// Simple CSV fetcher
async function fetchCSV(path) {
  const res = await fetch(path + "?v=" + Date.now());
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  const text = await res.text();
  const [header, ...lines] = text.trim().split(/\r?\n/);
  const cols = header.split(",");
  return lines.map(l => {
    const vals = l.split(","); // fine for our simple numeric/text rows
    const o = {};
    cols.forEach((c, i) => o[c] = vals[i] ?? "");
    return o;
  });
}

function unique(arr) {
  return Array.from(new Set(arr));
}

function byNum(a,b,field){ return Number(a[field]) - Number(b[field]); }
function formatPct(v){ return Number(v).toFixed(1) + "%"; }

const paths = {
  teamAts: "data/metrics/team_ats_by_picker.csv",
  fadeAts: "data/metrics/team_fade_ats_by_picker.csv",
  homeAway: "data/metrics/home_away_ats_by_picker.csv",
  totals: "data/metrics/totals_by_picker.csv"
};

let dataStore = { teamAts:[], fadeAts:[], homeAway:[], totals:[] };

async function loadAll() {
  const [ta, fa, ha, to] = await Promise.all([
    fetchCSV(paths.teamAts),
    fetchCSV(paths.fadeAts),
    fetchCSV(paths.homeAway),
    fetchCSV(paths.totals),
  ]);
  dataStore.teamAts = ta;
  dataStore.fadeAts = fa;
  dataStore.homeAway = ha;
  dataStore.totals = to;

  // seasons from files
  const seasons = unique(
    [].concat(ta,fa,ha,to).map(r => r.season).filter(Boolean)
  ).sort();
  const seasonSel = document.getElementById('seasonSel') || document.createElement('select');
  seasonSel.innerHTML = seasons.map(s => `<option value="${s}">${s}</option>`).join("");
  seasonSel.value = seasons[seasons.length-1] || "";

  render();
}

function render() {
  const picker = document.getElementById('pickerSel') || document.createElement('select').value;
  const season = document.getElementById('seasonSel') || document.createElement('select').value;

  // Team ATS
  const ta = dataStore.teamAts.filter(r => r.picker === picker && r.season === season);
  ta.sort((a,b) => b.win_pct - a.win_pct || a.team.localeCompare(b.team));
  document.getElementById('teamAtsBody') || document.querySelector('#table tbody') || document.getElementById('table') || document.body.innerHTML = ta.map(r => `
    <tr>
      <td>${r.team}</td>
      <td>${r.wins}</td>
      <td>${r.losses}</td>
      <td>${r.pushes}</td>
      <td>${r.games}</td>
      <td>${r.win_pct}</td>
    </tr>`).join("");

  // Fade ATS
  const fa = dataStore.fadeAts.filter(r => r.picker === picker && r.season === season);
  fa.sort((a,b) => b.win_pct - a.win_pct || a.opponent.localeCompare(b.opponent));
  document.getElementById('fadeAtsBody') || document.querySelector('#table tbody') || document.getElementById('table') || document.body.innerHTML = fa.map(r => `
    <tr>
      <td>${r.opponent}</td>
      <td>${r.wins}</td>
      <td>${r.losses}</td>
      <td>${r.pushes}</td>
      <td>${r.games}</td>
      <td>${r.win_pct}</td>
    </tr>`).join("");

  // Home/Away ATS
  const ha = dataStore.homeAway.filter(r => r.picker === picker && r.season === season);
  ha.sort((a,b) => a.side.localeCompare(b.side));
  document.getElementById('homeAwayBody') || document.querySelector('#table tbody') || document.getElementById('table') || document.body.innerHTML = ha.map(r => `
    <tr>
      <td>${r.side}</td>
      <td>${r.wins}</td>
      <td>${r.losses}</td>
      <td>${r.pushes}</td>
      <td>${r.games}</td>
      <td>${r.win_pct}</td>
    </tr>`).join("");

  // Totals
  const to = dataStore.totals.filter(r => r.picker === picker && r.season === season);
  to.sort((a,b) => a.side.localeCompare(b.side));
  document.getElementById('totalsBody') || document.querySelector('#table tbody') || document.getElementById('table') || document.body.innerHTML = to.map(r => `
    <tr>
      <td>${r.side}</td>
      <td>${r.wins}</td>
      <td>${r.losses}</td>
      <td>${r.pushes}</td>
      <td>${r.games}</td>
      <td>${r.win_pct}</td>
    </tr>`).join("");
}

// Tabs
document.addEventListener("click", (e) => {
  const btn = e.target.closest(".tab-btn");
  if (!btn) return;
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  document.querySelectorAll("section.panel").forEach(p => p.classList.remove("active"));
  btn.classList.add("active");
  document.getElementById(btn.dataset.tab).classList.add("active");
});

// Controls
document.addEventListener("change", (e) => {
  if (e.target.id === "pickerSel" || e.target.id === "seasonSel") render();
});

loadAll().catch(err => {
  console.error(err);
  alert("Failed to load insights data. Make sure you ran the 'Build Insights Metrics' workflow and that docs/data/metrics/*.csv exist.");
});
