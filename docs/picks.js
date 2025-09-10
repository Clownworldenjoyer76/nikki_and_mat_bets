// ===== CONFIG =====
const PICKS_LATEST = "./docs/data/picks/latest.csv"; // single source of truth

// ===== CSV UTILS =====
async function fetchText(url){
  const r = await fetch(url, { cache: "no-store" });
  if(!r.ok) throw new Error(`Fetch failed: ${url} (${r.status})`);
  return r.text();
}
function parseCSV(txt){
  if(!txt || !txt.trim()) return { headers: [], rows: [] };
  const lines = txt.replace(/\r/g,"").trim().split("\n");
  const rows = lines.map(l => l.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/));
  const hdr = rows.shift() || [];
  const objs = rows.map(r=>{
    const o = {};
    hdr.forEach((h,i)=>o[h]=r[i]===undefined?"":r[i]);
    return o;
  });
  return { headers: hdr, rows: objs };
}
const N = v => (v===""||v==null) ? null : (Number.isFinite(+v) ? +v : null);

// ===== GRADING =====
function gradeRows(rows, who){
  const weeks = new Map(); // wk -> {wS,lS,pS,wT,lT,pT}
  const total = { wS:0,lS:0,pS:0, wT:0,lT:0,pT:0 };

  for(const r of rows){
    const hs = N(r.home_score), as = N(r.away_score);
    if(hs===null || as===null) continue;           // only finished games

    const wk = Number(r.week);
    if(!Number.isFinite(wk)) continue;

    const spreadHome = N(r.spread_home);
    const totalLine  = N(r.total);
    const sidePick   = (r[`${who}_spread`]||"").trim().toLowerCase();  // home|away
    const totPick    = (r[`${who}_total`] ||"").trim().toLowerCase();  // over|under

    if(!weeks.has(wk)) weeks.set(wk, { wS:0,lS:0,pS:0, wT:0,lT:0,pT:0 });
    const acc = weeks.get(wk);

    if(spreadHome!==null && (sidePick==="home"||sidePick==="away")){
      const covered = (hs - as) + spreadHome;        // >0 home cover, <0 away, 0 push
      const res = covered>0 ? "home" : covered<0 ? "away" : "push";
      if(res==="push"){ acc.pS++; total.pS++; }
      else if(res===sidePick){ acc.wS++; total.wS++; }
      else { acc.lS++; total.lS++; }
    }
    if(totalLine!==null && (totPick==="over"||totPick==="under")){
      const sum = hs + as;
      const res = sum>totalLine ? "over" : sum<totalLine ? "under" : "push";
      if(res==="push"){ acc.pT++; total.pT++; }
      else if(res===totPick){ acc.wT++; total.wT++; }
      else { acc.lT++; total.lT++; }
    }
  }

  const fmt = (w,l,p)=>`${w}-${l}${p?`-${p}`:""}`;
  const byWeek = new Map(
    [...weeks.entries()].map(([wk,v]) => [wk, { ats: fmt(v.wS,v.lS,v.pS), ou: fmt(v.wT,v.lT,v.pT) }])
  );
  const season = { ats: fmt(total.wS,total.lS,total.pS), ou: fmt(total.wT,total.lT,total.pT) };
  return { byWeek, season };
}

// ===== RENDER =====
function clear(tbody){ while(tbody.firstChild) tbody.removeChild(tbody.firstChild); }
function row(tbody,label,ats,ou,cls=""){
  const tr=document.createElement("tr"); if(cls) tr.className=cls;
  tr.innerHTML = `<td>${label}</td><td>${ats||"—"}</td><td>${ou||"—"}</td>`;
  tbody.appendChild(tr);
}
function fill(tbody, seasonLabel, graded){
  clear(tbody);
  row(tbody, seasonLabel, graded.season.ats, graded.season.ou, "year-row");
  for(let wk=1; wk<=18; wk++){
    const rec = graded.byWeek.get(wk);
    row(tbody, `Week ${wk}`, rec?.ats, rec?.ou);
  }
}
function labelSeason(rows){
  const ss=[...new Set(rows.map(r=>String(r.season||"").trim()).filter(Boolean))];
  const nums=ss.map(s=>+s).filter(Number.isFinite);
  if(nums.length) return String(Math.max(...nums));
  return String(new Date().getFullYear());
}
function setSubtitle(season){
  const el=document.getElementById("seasonWeek");
  if(el) el.textContent=`Season ${season} — ATS & O/U by Week`;
}

// ===== MAIN =====
async function main(){
  let rows=[];
  try{
    const txt = await fetchText(PICKS_LATEST);
    rows = parseCSV(txt).rows;
  }catch(err){
    console.error("Could not load latest.csv", err);
    // Still render empty 2025 + Week rows so the page shows structure
  }

  const season = labelSeason(rows);
  setSubtitle(season);

  const nik = gradeRows(rows, "nikki");
  const mat = gradeRows(rows, "mat");

  const nikBody=document.querySelector("#nikkiTable tbody");
  const matBody=document.querySelector("#matTable tbody");
  if(!nikBody||!matBody) return;

  fill(nikBody, season, nik);
  fill(matBody, season, mat);
}
main();
