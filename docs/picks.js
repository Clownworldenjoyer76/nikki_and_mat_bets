// ---------- CONFIG ----------
const WEEKLY_LATEST = "data/weekly/latest.csv"; // to infer season
function finalPath(season, week){ return `data/final/${season}_wk${String(week).padStart(2,"0")}_final.csv`; }

// ---------- CSV UTILS ----------
async function fetchText(url){
  const r = await fetch(url, { cache: "no-store" });
  if(!r.ok) throw new Error(`Fetch failed: ${url}`);
  return r.text();
}
function parseCSV(txt){
  const lines = txt.trim().split(/\r?\n/);
  const rows = lines.map(l => l.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/));
  const hdr = rows.shift();
  const objs = rows.map(r=>{
    const o = {};
    hdr.forEach((h,i)=>o[h]=r[i]===undefined?"":r[i]);
    return o;
  });
  return { headers: hdr, rows: objs };
}

// ---------- MATH / RULES ----------
function toNum(v){ const n = Number(v); return Number.isFinite(n) ? n : null; }
function signed(n){ if(n===null || n===undefined || n==="") return ""; const v = Number(n); return v>0?`+${v}`:`${v}`; }

// Compute W-L-P for spread & total for one person for a week's final CSV rows
function computeRecord(rows, who){
  let wS=0,lS=0,pS=0, wT=0,lT=0,pT=0;

  for(const r of rows){
    const hs = toNum(r.home_score);
    const as = toNum(r.away_score);
    if(hs===null || as===null) continue; // skip games without scores

    const spreadHome = toNum(r.spread_home);
    const totalLine  = toNum(r.total);
    const pickSpread = (r[`${who}_spread`] || "").toLowerCase(); // 'home'|'away'|''
    const pickTotal  = (r[`${who}_total`]  || "").toLowerCase(); // 'over'|'under'|''

    // SPREAD outcome relative to home line
    if(spreadHome!==null){
      const margin = hs - as; // home - away
      const covered = margin + spreadHome; // >0 home covers, <0 away covers, 0 push
      let resultSide = null;
      if(covered > 0) resultSide = "home";
      else if(covered < 0) resultSide = "away";
      else resultSide = "push";

      if(pickSpread){
        if(resultSide==="push") pS++;
        else if(pickSpread===resultSide) wS++;
        else lS++;
      }
    }

    // TOTAL outcome
    if(totalLine!==null){
      const sum = hs + as;
      let resultTot = null;
      if(sum > totalLine) resultTot = "over";
      else if(sum < totalLine) resultTot = "under";
      else resultTot = "push";

      if(pickTotal){
        if(resultTot==="push") pT++;
        else if(pickTotal===resultTot) wT++;
        else lT++;
      }
    }
  }

  return {
    spread: `${wS}-${lS}${pS?`-${pS}`:""}`,
    total:  `${wT}-${lT}${pT?`-${pT}`:""}`
  };
}

// ---------- RENDER ----------
function setSeasonLabel(season){
  const el = document.getElementById("seasonLabel");
  if(el) el.textContent = `Season ${season} • Weekly Records`;
}
function ensureRow(tbody, week){
  let row = tbody.querySelector(`tr[data-week="${week}"]`);
  if(!row){
    row = document.createElement("tr");
    row.dataset.week = String(week);
    row.innerHTML = `
      <td>Week ${week}</td>
      <td class="spread">—</td>
      <td class="total">—</td>
    `;
    tbody.appendChild(row);
  }
  return row;
}

// ---------- LOAD ----------
async function getSeasonFromWeeklyLatest(){
  try{
    const txt = await fetchText(WEEKLY_LATEST);
    const { headers, rows } = parseCSV(txt);
    if(rows.length===0) throw new Error("weekly/latest.csv empty");
    const season = rows[0]["season"] || new Date().getFullYear();
    return String(season);
  }catch{
    return String(new Date().getFullYear());
  }
}

async function loadFinalForWeek(season, week){
  const url = finalPath(season, week);
  try{
    const txt = await fetchText(url);
    const parsed = parseCSV(txt);
    return parsed.rows;
  }catch(e){
    return null; // not available
  }
}

async function main(){
  const season = await getSeasonFromWeeklyLatest();
  setSeasonLabel(season);

  const nikBody = document.getElementById("nikkiBody");
  const matBody = document.getElementById("matBody");
  const nikEmpty = document.getElementById("nikkiEmpty");
  const matEmpty = document.getElementById("matEmpty");

  let anyNikki = false, anyMat = false;

  // Iterate Weeks 1..18, load final CSVs if present
  for(let wk=1; wk<=18; wk++){
    const rows = await loadFinalForWeek(season, wk);
    if(!rows) continue;

    // Compute records
    const nikRec = computeRecord(rows, "nikki");
    const matRec = computeRecord(rows, "mat");

    // Nikki column
    const nrow = ensureRow(nikBody, wk);
    nrow.querySelector(".spread").textContent = nikRec.spread;
    nrow.querySelector(".total").textContent = nikRec.total;
    anyNikki = true;

    // Mat column
    const mrow = ensureRow(matBody, wk);
    mrow.querySelector(".spread").textContent = matRec.spread;
    mrow.querySelector(".total").textContent = matRec.total;
    anyMat = true;
  }

  if(!anyNikki) nikEmpty.hidden = false;
  if(!anyMat)   matEmpty.hidden = false;
}

main();
