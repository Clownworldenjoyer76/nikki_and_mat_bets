// ===== CONFIG =====
const PICKS_LATEST = "docs/data/picks/latest.csv"; // source of truth for picks + final scores

// ===== CSV UTILS =====
async function fetchText(url){
  const r = await fetch(url, { cache: "no-store" });
  if(!r.ok) throw new Error(`Fetch failed: ${url}`);
  return r.text();
}
function parseCSV(txt){
  const lines = txt.trim().split(/\r?\n/);
  if(!lines.length) return { headers: [], rows: [] };
  const rows = lines.map(l => l.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/));
  const hdr = rows.shift();
  const objs = rows.map(r=>{
    const o = {};
    hdr.forEach((h,i)=>o[h]=r[i]===undefined?"":r[i]);
    return o;
  });
  return { headers: hdr, rows: objs };
}
const N = v => (v===null||v===undefined||v==="") ? null : (Number.isFinite(+v) ? +v : null);

// ===== GRADING =====
// Grades one person's picks across an array of game rows.
// Expects columns: season, week, home_score, away_score, spread_home, total,
// and for each person: `${who}_spread` in {"home","away"}, `${who}_total` in {"over","under"}.
function gradeRows(rows, who){
  const byWeek = new Map(); // {week -> {wS,lS,pS,wT,lT,pT}}
  const overall = { wS:0,lS:0,pS:0, wT:0,lT:0,pT:0 };

  for(const r of rows){
    const hs = N(r.home_score), as = N(r.away_score);
    if(hs===null || as===null) continue; // only grade finished games

    const spreadHome = N(r.spread_home);
    const totalLine  = N(r.total);
    const pickSide   = (r[`${who}_spread`]||"").trim().toLowerCase();  // "home"|"away"
    const pickTot    = (r[`${who}_total`] ||"").trim().toLowerCase();  // "over"|"under"
    const wk         = Number(r.week);
    if(!Number.isFinite(wk)) continue;

    if(!byWeek.has(wk)) byWeek.set(wk, { wS:0,lS:0,pS:0, wT:0,lT:0,pT:0 });
    const acc = byWeek.get(wk);

    // ATS
    if(spreadHome!==null && (pickSide==="home" || pickSide==="away")){
      const covered = (hs - as) + spreadHome; // >0 home covers, <0 away covers, =0 push
      const result  = covered>0 ? "home" : covered<0 ? "away" : "push";
      if(result==="push"){ acc.pS++; overall.pS++; }
      else if(result===pickSide){ acc.wS++; overall.wS++; }
      else { acc.lS++; overall.lS++; }
    }

    // O/U
    if(totalLine!==null && (pickTot==="over" || pickTot==="under")){
      const sum = hs + as;
      const result = sum>totalLine ? "over" : sum<totalLine ? "under" : "push";
      if(result==="push"){ acc.pT++; overall.pT++; }
      else if(result===pickTot){ acc.wT++; overall.wT++; }
      else { acc.lT++; overall.lT++; }
    }
  }

  // Pretty record strings
  const fmt = (w,l,p) => `${w}-${l}${p ? `-${p}` : ""}`;
  const weekStrings = new Map(
    [...byWeek.entries()].map(([wk, v]) => [wk, { ats: fmt(v.wS,v.lS,v.pS), ou: fmt(v.wT,v.lT,v.pT) }])
  );
  const overallStr = { ats: fmt(overall.wS,overall.lS,overall.pS), ou: fmt(overall.wT,overall.lT,overall.pT) };

  return { weekStrings, overallStr };
}

// ===== RENDER =====
function clearTable(tbody){
  while(tbody.firstChild) tbody.removeChild(tbody.firstChild);
}
function addRow(tbody, label, ats, ou, extraClass=""){
  const tr = document.createElement("tr");
  if(extraClass) tr.className = extraClass;
  tr.innerHTML = `<td>${label}</td><td>${ats||"—"}</td><td>${ou||"—"}</td>`;
  tbody.appendChild(tr);
}
function fillTable(tbody, seasonLabel, graded){
  clearTable(tbody);
  // Year row first (e.g., 2025)
  addRow(tbody, seasonLabel, graded.overallStr.ats, graded.overallStr.ou, "year-row");
  // Then Week 1..18
  for(let wk=1; wk<=18; wk++){
    const rec = graded.weekStrings.get(wk);
    addRow(tbody, `Week ${wk}`, rec?.ats || "—", rec?.ou || "—");
  }
}

function labelSeason(rows){
  // Prefer the single distinct season in the file; fallback to current year
  const seasons = [...new Set(rows.map(r => String(r.season||"").trim()).filter(Boolean))];
  if(seasons.length===1) return seasons[0];
  // if multiple, choose numerically max if possible, else the first non-empty
  const nums = seasons.map(s => +s).filter(n => Number.isFinite(n));
  if(nums.length) return String(Math.max(...nums));
  return String(new Date().getFullYear());
}

function setSubtitle(season){
  const el = document.getElementById("seasonWeek");
  if(el) el.textContent = `Season ${season} — ATS & O/U by Week`;
}

// ===== MAIN =====
async function main(){
  let rows = [];
  try{
    const txt = await fetchText(PICKS_LATEST);
    rows = parseCSV(txt).rows;
  }catch(e){
    console.error("Failed to load latest picks CSV:", e);
    return;
  }

  const season = labelSeason(rows);
  setSubtitle(season);

  const nikki = gradeRows(rows, "nikki");
  const mat   = gradeRows(rows, "mat");

  const nikBody = document.querySelector("#nikkiTable tbody");
  const matBody = document.querySelector("#matTable tbody");
  if(!nikBody || !matBody) return;

  fillTable(nikBody, season, nikki);
  fillTable(matBody, season, mat);
}

main();
