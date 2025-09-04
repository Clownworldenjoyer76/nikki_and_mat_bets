// ---------- CONFIG ----------
const CSV_URL = "data/weekly/latest.csv"; // served from /docs

// ---------- UTILS ----------
function normalizeTeamName(name){
  return name === "Washington Commanders" ? "Washington Redskins" : name;
}

async function fetchCSV(url){
  const r = await fetch(url, { cache: "no-store" });
  if(!r.ok) throw new Error("CSV not found: " + url);
  return r.text();
}
function parseCSV(txt){
  const rows = txt.trim().split("\n").map(l=>l.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/));
  const hdr = rows.shift();
  return { hdr, rows };
}
function onlyConsensus(rows, hdr){ return rows.filter(r => r[hdr.indexOf("book")] === "CONSENSUS"); }
function keyOf(r,h){ return `${r[h.indexOf("away_team")]}@${r[h.indexOf("home_team")]}_${r[h.indexOf("commence_time_utc")]}`; }
function fmtDate(iso){
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}
function nflWeekLabel(csvWeek){
  const base = 36;
  return ((parseInt(csvWeek,10) - base) % 18 + 18) % 18 + 1;
}
function fmtSigned(n){
  if(n === "" || n === null || n === undefined) return "";
  const v = Number(n);
  if(Number.isNaN(v)) return String(n);
  return (v>0?`+${v}`:`${v}`);
}
function ensurePickShape(obj){
  if(!obj || typeof obj !== "object") return { spread: null, total: null };
  return { spread: obj.spread ?? null, total: obj.total ?? null };
}

// ---------- STORAGE ----------
const LS_MAT = "picks_mat";
const LS_NIK = "picks_nikki";
function loadPicks(){
  return {
    mat: JSON.parse(localStorage.getItem(LS_MAT) || "{}"),
    nikki: JSON.parse(localStorage.getItem(LS_NIK) || "{}"),
  };
}

// ---------- RENDER ----------
function makeCard(title, when, picksForGame, spreadHome, total){
  const el = document.createElement("article");
  el.className = "card";
  el.innerHTML = `
    <p class="title">${title}</p>
    <p class="when">${when}</p>
    <div class="row">
      <span class="pill">Home spread: <b>${fmtSigned(spreadHome)}</b></span>
      <span class="pill">Total: <b>${total}</b></span>
    </div>
    <div class="row" style="margin-top:6px">
      ${picksForGame.spread ? `<span class="pill"><span class="tag">Spread:</span> ${picksForGame.spread}</span>` : ``}
      ${picksForGame.total  ? `<span class="pill"><span class="tag">Total:</span> ${picksForGame.total}</span>`   : ``}
    </div>
  `;
  return el;
}

function renderLists(h, rows, picks){
  // map key -> game info
  const info = new Map();
  rows.forEach(r=>{
    const home = normalizeTeamName(r[h.indexOf("home_team")]);
    const away = normalizeTeamName(r[h.indexOf("away_team")]);
    const when = r[h.indexOf("commence_time_utc")];
    const spreadHome = r[h.indexOf("spread_home")] || "";
    const total = r[h.indexOf("total")] || "";
    const key = keyOf(r,h);
    info.set(key, { title:`${away} @ ${home}`, whenIso:when, whenTxt:fmtDate(when), spreadHome, total });
  });

  // helpers
  function toArray(bag){
    return Object.entries(bag).map(([k,v])=>{
      const shaped = ensurePickShape(v);
      const meta = info.get(k);
      if(!meta) return null;
      return {
        key:k,
        whenIso: meta.whenIso,
        el: makeCard(meta.title, meta.whenTxt, shaped, meta.spreadHome, meta.total)
      };
    }).filter(Boolean).sort((a,b)=> new Date(a.whenIso) - new Date(b.whenIso));
  }

  // Mat
  const matWrap = document.getElementById("matList");
  const matEmpty = document.getElementById("matEmpty");
  matWrap.innerHTML = "";
  const matItems = toArray(picks.mat || {});
  if(matItems.length === 0){
    matEmpty.hidden = false;
  }else{
    matEmpty.hidden = true;
    matItems.forEach(x => matWrap.appendChild(x.el));
  }

  // Nikki
  const nikWrap = document.getElementById("nikList");
  const nikEmpty = document.getElementById("nikEmpty");
  nikWrap.innerHTML = "";
  const nikItems = toArray(picks.nikki || {});
  if(nikItems.length === 0){
    nikEmpty.hidden = false;
  }else{
    nikEmpty.hidden = true;
    nikItems.forEach(x => nikWrap.appendChild(x.el));
  }
}

// ---------- LOAD ----------
async function load(){
  try{
    const txt = await fetchCSV(CSV_URL);
    const { hdr, rows } = parseCSV(txt);
    const cons = onlyConsensus(rows, hdr);

    // header label
    if(rows.length){
      const season = rows[0][hdr.indexOf("season")];
      const csvWeek = rows[0][hdr.indexOf("week")];
      const labelWeek = nflWeekLabel(csvWeek);
      const label = document.getElementById("weeklabel");
      if(label) label.textContent = `${season} • Week ${labelWeek}`;
    }

    const picks = loadPicks();
    renderLists(hdr, cons, picks);
  }catch(e){
    document.getElementById("weeklabel").textContent = "No latest.csv available.";
    document.getElementById("matEmpty").hidden = false;
    document.getElementById("nikEmpty").hidden = false;
  }
}
load();
