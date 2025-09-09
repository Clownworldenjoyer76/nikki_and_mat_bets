// ---------- CONFIG ----------
const WEEKLY_LATEST = "docs/data/weekly/latest.csv"; // to infer season
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
function computeRecord(rows, who){
  let wS=0,lS=0,pS=0, wT=0,lT=0,pT=0;
  for(const r of rows){
    const hs = toNum(r.home_score);
    const as = toNum(r.away_score);
    if(hs===null || as===null) continue;

    const spreadHome = toNum(r.spread_home);
    const totalLine  = toNum(r.total);
    const pickSpread = (r[`${who}_spread`] || "").toLowerCase();
    const pickTotal  = (r[`${who}_total`]  || "").toLowerCase();

    if(spreadHome!==null){
      const margin = hs - as;
      const covered = margin + spreadHome;
      let resultSide = covered > 0 ? "home" : covered < 0 ? "away" : "push";
      if(pickSpread){
        if(resultSide==="push") pS++;
        else if(pickSpread===resultSide) wS++;
        else lS++;
      }
    }

    if(totalLine!==null){
      const sum = hs + as;
      let resultTot = sum > totalLine ? "over" : sum < totalLine ? "under" : "push";
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
function ensureRow(tbody, week){
  let row = tbody.querySelector(`tr[data-week="${week}"]`);
  if(!row){
    row = document.createElement("tr");
    row.dataset.week = String(week);
    row.innerHTML = `<td>Week ${week}</td><td class="spread">—</td><td class="total">—</td>`;
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
    return String(rows[0]["season"] || new Date().getFullYear());
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
    return null;
  }
}

async function main(){
  const season = await getSeasonFromWeeklyLatest();
  const nikBody = document.querySelector('#nikkiTable tbody');
  const matBody = document.querySelector('#matTable tbody');

  let anyNikki = false, anyMat = false;
  for(let wk=1; wk<=18; wk++){
    const rows = await loadFinalForWeek(season, wk);
    if(!rows) continue;

    const nikRec = computeRecord(rows, "nikki");
    const matRec = computeRecord(rows, "mat");

    const nrow = ensureRow(nikBody, wk);
    nrow.querySelector(".spread").textContent = nikRec.spread;
    nrow.querySelector(".total").textContent = nikRec.total;
    anyNikki = true;

    const mrow = ensureRow(matBody, wk);
    mrow.querySelector(".spread").textContent = matRec.spread;
    mrow.querySelector(".total").textContent = matRec.total;
    anyMat = true;
  }
}

main();
