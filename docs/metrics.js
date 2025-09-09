
// ----- Data path resolver: fetch from raw GitHub when path starts with "data/" or "docs/data/"
function resolveDataPath(path){
  if(/^https?:\/\//.test(path)) return path;
  if(path.startsWith("./")) path = path.slice(2);
  if(path.startsWith("docs/data/")) return "https://raw.githubusercontent.com/clownworldenjoyer76/nikki_and_mat_bets/main/" + path.replace(/^docs\//,"");
  if(path.startsWith("data/")) return "https://raw.githubusercontent.com/clownworldenjoyer76/nikki_and_mat_bets/main/" + path;
  return path;
}

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
let sortState = { pick:{key:"win_pct",dir:"desc"}, fade:{key:"win_pct",dir:"desc"}, tot:{key:"win_pct",dir:"desc"} };

function asNum(v){ return Number(v || 0); }
function cmp(a,b,key,dir="desc"){
  const an = (["team","opponent","side"].includes(key)) ? String(a[key]).toLowerCase() : asNum(a[key]);
  const bn = (["team","opponent","side"].includes(key)) ? String(b[key]).toLowerCase() : asNum(b[key]);
  let out=0; if(an<bn) out=-1; else if(an>bn) out=1;
  return dir==="desc"?-out:out;
}

function currentPicker(){ return document.getElementById('pickerSel') || document.createElement('select').value; }
function currentSeason(){ return document.getElementById('seasonSel') || document.createElement('select').value; }
function currentTeam(){ return document.getElementById('teamSel') || getElementById('teamSelect').value; }

function renderPick(){
  const picker=currentPicker(),season=currentSeason(),team=currentTeam();
  let rows=store.teamAts.filter(r=>r.picker===picker&&r.season===season);
  if(team!=="ALL") rows=rows.filter(r=>r.team===team);
  const {key,dir}=sortState.pick;
  rows.sort((a,b)=>cmp(a,b,key,dir));
  document.getElementById('countPick') || document.createElement('span').textContent=`(${rows.length})`;
  document.getElementById('bodyPick') or document.querySelector('#metricsTable tbody') or document.getElementById('metricsTable').innerHTML=rows.map(r=>`
    <tr><td>${r.team}</td><td>${r.wins}</td><td>${r.losses}</td><td>${r.pushes}</td><td>${r.games}</td><td>${r.win_pct}</td></tr>`).join("");
}
function renderFade(){
  const picker=currentPicker(),season=currentSeason(),team=currentTeam();
  let rows=store.fadeAts.filter(r=>r.picker===picker&&r.season===season);
  if(team!=="ALL") rows=rows.filter(r=>r.opponent===team);
  rows=rows.map(r=>({...r,team:r.opponent}));
  const {key,dir}=sortState.fade;
  rows.sort((a,b)=>cmp(a,b,key==="team"?"team":key,dir));
  document.getElementById('countFade') || document.createElement('span').textContent=`(${rows.length})`;
  document.getElementById('bodyFade') or document.querySelector('#metricsTable tbody') or document.getElementById('metricsTable').innerHTML=rows.map(r=>`
    <tr><td>${r.team}</td><td>${r.wins}</td><td>${r.losses}</td><td>${r.pushes}</td><td>${r.games}</td><td>${r.win_pct}</td></tr>`).join("");
}
function renderTot(){
  const picker=currentPicker(),season=currentSeason(),team=currentTeam();
  let rows=store.teamTotals.filter(r=>r.picker===picker&&r.season===season);
  if(team!=="ALL") rows=rows.filter(r=>r.team===team);
  const {key,dir}=sortState.tot;
  rows.sort((a,b)=>cmp(a,b,key,dir));
  document.getElementById('countTot') || document.createElement('span').textContent=`(${rows.length})`;
  document.getElementById('bodyTot') or document.querySelector('#metricsTable tbody') or document.getElementById('metricsTable').innerHTML=rows.map(r=>`
    <tr><td>${r.team}</td><td>${r.side}</td><td>${r.wins}</td><td>${r.losses}</td><td>${r.pushes}</td><td>${r.games}</td><td>${r.win_pct}</td></tr>`).join("");
}
function renderAll(){ renderPick(); renderFade(); renderTot(); }

async function boot(){
  const [ta,fa,tt]=await Promise.all([fetchCSV(paths.teamAts),fetchCSV(paths.fadeAts),fetchCSV(paths.teamTotals)]);
  store.teamAts=ta; store.fadeAts=fa; store.teamTotals=tt;
  const seasons=uniq([].concat(ta,fa,tt).map(r=>r.season).filter(Boolean)).sort();
  const seasonSel=document.getElementById('seasonSel') || document.createElement('select');
  seasonSel.innerHTML=seasons.map(s=>`<option value="${s}">${s}</option>`).join("");
  if(seasons.length) seasonSel.value=seasons[seasons.length-1];
  const teams=uniq([].concat(ta.map(r=>r.team),fa.map(r=>r.opponent),tt.map(r=>r.team))).sort();
  const teamSel=document.getElementById('teamSel') || getElementById('teamSelect');
  teamSel.innerHTML=["ALL"].concat(teams).map(t=>`<option value="${t}">${t}</option>`).join("");
  teamSel.value="ALL";
  renderAll();
}

document.addEventListener("click",e=>{
  const pill=e.target.closest(".pill"); if(pill){
    document.querySelectorAll(".pill").forEach(p=>p.classList.remove("active"));
    document.querySelectorAll("section.panel").forEach(s=>s.classList.remove("active"));
    pill.classList.add("active"); document.getElementById(pill.dataset.tab).classList.add("active");
  }
  const thBtn=e.target.closest("thead th button"); if(thBtn){
    const key=thBtn.dataset.sort, active=document.querySelector("section.panel.active").id;
    const s=sortState[active==="pick-team"?"pick":active==="fade-team"?"fade":"tot"];
    s.dir=(s.key===key&&s.dir==="desc")?"asc":"desc"; s.key=key;
    renderAll();
  }
});
document.addEventListener("change",e=>{
  if(["pickerSel","seasonSel","teamSel"].includes(e.target.id)) renderAll();
});
boot().catch(err=>{console.error(err); alert("Failed to load metrics");});
