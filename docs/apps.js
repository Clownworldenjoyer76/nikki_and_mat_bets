// docs/apps.js

// ---------- CONFIG ----------
const PRIMARY_CSV = "docs/data/weekly/latest.csv";
const CSV_CANDIDATES = [
  PRIMARY_CSV,
  "/nikki_and_mat_bets/docs/data/weekly/latest.csv",
  "data/weekly/latest.csv"
];

const OWNER = "clownworldenjoyer76";
const REPO  = "nikki_and_mat_bets";
const BRANCH = "main";

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
  return d.toLocaleString("en-US", {
    weekday:"long", month:"long", day:"numeric",
    hour:"numeric", minute:"2-digit", hour12:true
  });
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
function apiContentsUrl(path){
  return `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`;
}
function b64EncodeUtf8(str){
  return btoa(unescape(encodeURIComponent(str)));
}
function pad2(n){
  return String(n).padStart(2,"0");
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

  const key = keyOf(r,h);

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
    <div class="when" style="text-align:center; margin-top:6px;">${when}</div>
    <div class="line" style="text-align:center; margin-top:6px;">
      <span class="pill">Home spread: <b>${spreadHomeDisp}</b></span>
      <span class="pill" style="margin-left:8px;">Total: <b>${total}</b></span>
    </div>
  `;

  ["mat","nikki"].forEach(user=>{
    const section = document.createElement("div");
    section.style.marginTop = "10px";

    const nameDiv = document.createElement("div");
    nameDiv.className = "name " + user;
    nameDiv.textContent = user==="mat" ? "Mat" : "Nikki";
    nameDiv.style.textAlign = "center";
    nameDiv.style.fontWeight = "600";
    nameDiv.style.margin = "6px 0";
    section.appendChild(nameDiv);

    const grid = document.createElement("div");
    grid.className = "pick-grid";
    grid.style.display = "grid";
    grid.style.gridTemplateColumns = "1fr 1fr";
    grid.style.columnGap = "8px";
    grid.style.rowGap = "8px";
    grid.style.marginTop = "6px";

    const color = user==="mat" ? "mat" : "nikki";
    const picksUser = picksAll[user] || {};
    const curPick = ensurePickShape(picksUser[key]);

    grid.append(
      makePickButton(`${away} ${spreadAway}`, "spread", "away", curPick, color, key, user),
      makePickButton(`Over ${total}`, "total", "over", curPick, color, key, user),
      makePickButton(`${home} ${spreadHomeDisp}`, "spread", "home", curPick, color, key, user),
      makePickButton(`Under ${total}`, "total", "under", curPick, color, key, user)
    );

    section.appendChild(grid);
    el.appendChild(section);
  });

  return el;
}

function neonDivider(){
  const div = document.createElement("div");
  div.className = "neon-divider";
  div.setAttribute(
    "style",
    "height:3px;background:#39ff14;margin:10px 0;border-radius:2px;box-shadow:0 0 8px #39ff14;"
  );
  return div;
}

// ---------- RENDER ----------
async function render(){
  const { txt } = await fetchFirstAvailable(CSV_CANDIDATES);
  const { hdr, rows } = parseCSV(txt);
  const source = onlyConsensus(rows, hdr);
  const games = source.length ? source : rows;

  const iWeek = hdr.indexOf("week");
  const iSeason = hdr.indexOf("season");

  const nflWeek = parseInt(games[0][iWeek], 10);
  const nflSeason = parseInt(games[0][iSeason], 10);

  document.getElementById("seasonWeek").textContent = `NFL Week ${nflWeek}`;
  window._season = String(nflSeason);
  window._week = pad2(nflWeek);

  const picksAll = loadPicks();
  const gamesDiv = document.getElementById("games");
  gamesDiv.innerHTML = "";

  games.forEach((r,i)=>{
    gamesDiv.appendChild(card(hdr,r,picksAll));
    if(i < games.length-1) gamesDiv.appendChild(neonDivider());
  });
}

// ---------- SUBMIT PICKS ----------
document.getElementById("issueBtn").onclick = async ()=>{
  const season = window._season;
  const week = window._week;
  const picksAll = loadPicks();

  const rows = [];
  Object.entries(picksAll).forEach(([picker, games])=>{
    Object.entries(games).forEach(([game_id,p])=>{
      if(p.spread) rows.push({season,week,game_id,picker,pick_type:"ATS",pick:p.spread});
      if(p.total)  rows.push({season,week,game_id,picker,pick_type:"OU", pick:p.total});
    });
  });

  const headers = ["season","week","game_id","picker","pick_type","pick"];
  const csv = headers.join(",") + "\n" +
    rows.map(r=>headers.map(h=>r[h]).join(",")).join("\n");

  const token = prompt("GitHub token (contents:write)");
  if(!token) return;

  const path = `docs/data/picks/${season}_wk${week}_picks.csv`;
  let sha = null;

  const meta = await fetch(apiContentsUrl(path), {
    headers:{ Authorization:`token ${token}` }
  });
  if(meta.ok) sha = (await meta.json()).sha;

  const res = await fetch(apiContentsUrl(path), {
    method:"PUT",
    headers:{
      Authorization:`token ${token}`,
      "Content-Type":"application/json"
    },
    body:JSON.stringify({
      message:`Save picks ${season} wk${week}`,
      content:b64EncodeUtf8(csv),
      sha,
      branch:BRANCH
    })
  });

  const out = await res.json();
  if(!out.content || out.content.path !== path){
    throw new Error("Save failed");
  }
  alert(`Picks saved: ${out.content.path}`);
};

render().catch(e=>alert(e.message));
