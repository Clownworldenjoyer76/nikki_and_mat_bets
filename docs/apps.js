// ---------- CONFIG ----------
const PRIMARY_CSV = "docs/data/weekly/latest.csv";
const CSV_CANDIDATES = [
  PRIMARY_CSV,
  "/nikki_and_mat_bets/docs/data/weekly/latest.csv",
  "data/weekly/latest.csv"
];

// ---------- UTILS ----------
function normalizeTeamName(name){
  if(name === "Washington Commanders") return "Washington Redskins";
  return name;
}
async function fetchFirstAvailable(urls){
  for(const p of urls){
    const url = p + (p.includes("?") ? "&" : "?") + "v=" + Date.now();
    try{
      const r = await fetch(url, { cache: "no-store" });
      if(r.ok) return { txt: await r.text(), used: p };
    }catch(_e){}
  }
  throw new Error("Schedule CSV not found at: " + urls.join(" | "));
}
function parseCSV(txt){
  const rows = txt.trim().split(/\r?\n/).map(l=>l.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/));
  const hdr = rows.shift() || [];
  return { hdr, rows };
}
function onlyConsensus(rows, hdr){
  const iBook = hdr.indexOf("book");
  const iCons = hdr.indexOf("is_consensus");
  return rows.filter(r =>
    (iCons !== -1 && String(r[iCons]).trim() === "1") ||
    (iBook !== -1 && String(r[iBook]).trim().toUpperCase() === "CONSENSUS")
  );
}
function keyOf(r,h){ 
  return `${r[h.indexOf("away_team")]}@${r[h.indexOf("home_team")]}_${r[h.indexOf("commence_time_utc")]}`; 
}
function fmtDate(iso){
  const d = new Date(iso);
  return d.toLocaleString("en-US", { weekday:"long", month:"long", day:"numeric", hour:"numeric", minute:"2-digit", hour12:true });
}
function nflWeekLabel(csvWeek){
  const base = 36;
  const w = ((parseInt(csvWeek,10) - base) % 18 + 18) % 18 + 1;
  return w;
}
function fmtSigned(n){
  if(n === "" || n === null || n === undefined) return "";
  const v = Number(n);
  if(Number.isNaN(v)) return String(n);
  return v>0?`+${v}`:`${v}`;
}
function logoPath(team){
  const cleaned = team.replace(/[^A-Za-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const parts = cleaned.split(" ");
  const nickname = parts[parts.length - 1].toLowerCase();
  return `assets/logos/${nickname}.png`;
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
function savePicks(all){
  localStorage.setItem(LS_MAT, JSON.stringify(all.mat || {}));
  localStorage.setItem(LS_NIK, JSON.stringify(all.nikki || {}));
}
function ensurePickShape(obj){
  if(!obj || typeof obj !== "object") return { spread: null, total: null };
  return { spread: obj.spread ?? null, total: obj.total ?? null };
}

// ---------- RENDER HELPERS ----------
function makePickButton(label, type, side, curPick, color, key, user){
  const b = document.createElement("button");
  b.className = "pickbtn";
  b.type = "button";
  b.textContent = label;
  b.dataset.type = type;
  b.dataset.side = side;
  if(
    (type === "spread" && curPick.spread === side) ||
    (type === "total"  && curPick.total  === side)
  ){
    b.classList.add("active", color);
  }
  b.onclick = async ()=>{
    const all = loadPicks();
    const mine = all[user] || {};
    const current = ensurePickShape(mine[key]);

    if(type === "spread"){
      current.spread = (current.spread === side) ? null : side;
    }else{
      current.total = (current.total === side) ? null : side;
    }

    if(current.spread === null && current.total === null){
      delete mine[key];
    }else{
      mine[key] = current;
    }

    all[user] = mine;
    savePicks(all);
    await render();
  };
  return b;
}

function card(h, r, picksAll){
  const when = fmtDate(r[h.indexOf("commence_time_utc")]);
  const home = normalizeTeamName(r[h.indexOf("home_team")]);
  const away = normalizeTeamName(r[h.indexOf("away_team")]);

  const spreadHome  = r[h.indexOf("spread_home")] || "";
  const total       = r[h.indexOf("total")] || "";
  const spreadAway  = spreadHome === "" ? "" : fmtSigned(-Number(spreadHome));
  const spreadHomeDisp = fmtSigned(spreadHome);
  const totalDisp   = total;

  const key  = keyOf(r,h);

  const el = document.createElement("article");
  el.className = "card";
  el.innerHTML = `
    <div class="matchgrid">
      <img class="team-logo" src="${logoPath(away)}">
      <div class="matchtext">
        <div class="team">${away}</div>
        <div class="at">@</div>
        <div class="team">${home}</div>
      </div>
      <img class="team-logo right" src="${logoPath(home)}">
    </div>
    <div class="when">${when}</div>
    <div class="line">
      <span class="pill">Home spread: <b>${spreadHomeDisp}</b></span>
      <span class="pill">Total: <b>${totalDisp}</b></span>
    </div>
  `;

  ["mat","nikki"].forEach(user=>{
    const section = document.createElement("div");
    const nameDiv = document.createElement("div");
    nameDiv.className = "name " + user;
    nameDiv.textContent = user==="mat" ? "Mat" : "Nikki";
    section.appendChild(nameDiv);

    const grid = document.createElement("div");
    grid.className = "pick-grid";

    const color = user==="mat" ? "mat" : "nikki";
    const picksUser = picksAll[user] || {};
    const curPick = ensurePickShape(picksUser[key]);

    [
      makePickButton(`${away} ${spreadAway}`, "spread", "away", curPick, color, key, user),
      makePickButton(`Over ${totalDisp}`, "total", "over", curPick, color, key, user),
      makePickButton(`${home} ${spreadHomeDisp}`, "spread", "home", curPick, color, key, user),
      makePickButton(`Under ${totalDisp}`, "total", "under", curPick, color, key, user),
    ].forEach(b=>grid.appendChild(b));

    section.appendChild(grid);
    el.appendChild(section);
  });

  return el;
}

// ---------- MAIN RENDER ----------
async function render(){
  const { txt } = await fetchFirstAvailable(CSV_CANDIDATES);
  const { hdr, rows } = parseCSV(txt);
  const source = onlyConsensus(rows, hdr);
  const data = source.length ? source : rows;

  const iWeek = hdr.indexOf("week");
  const iSeason = hdr.indexOf("season");

  const csvWeek = data[0][iWeek];
  const csvSeason = parseInt(data[0][iSeason], 10);

  const nflWeek = nflWeekLabel(csvWeek);

  // 🔴 FIX: postseason season correction
  const nflSeason = nflWeek >= 19 ? csvSeason - 1 : csvSeason;

  window._week = String(nflWeek).padStart(2,"0");
  window._season = String(nflSeason);

  document.getElementById("seasonWeek").textContent = `NFL Week ${nflWeek}`;

  const picksAll = loadPicks();
  const gamesDiv = document.getElementById("games");
  gamesDiv.innerHTML = "";

  data.forEach((r,i)=>{
    gamesDiv.appendChild(card(hdr,r,picksAll));
    if(i < data.length - 1){
      const d = document.createElement("div");
      d.className = "neon-divider";
      gamesDiv.appendChild(d);
    }
  });
}

document.getElementById("clearBtn").onclick = ()=>{
  localStorage.removeItem(LS_MAT);
  localStorage.removeItem(LS_NIK);
  render();
};

render();
