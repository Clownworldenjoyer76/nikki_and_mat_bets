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

// FORCE NFL SEASON
const FORCED_SEASON = "2025";

// NFL Week 1 anchor (2025 season)
const NFL_WEEK1_UTC = Date.UTC(2025, 8, 4); // Sep 4 2025

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
    weekday:"long",
    month:"long",
    day:"numeric",
    hour:"numeric",
    minute:"2-digit",
    hour12:true
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

// NFL week calculation (only new logic)
function nflWeekFromISO(iso){
  const t = new Date(iso).getTime();
  return Math.floor((t - NFL_WEEK1_UTC) / (7 * 24 * 60 * 60 * 1000)) + 1;
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

// ---------- RENDER ----------
async function render(){
  const { txt } = await fetchFirstAvailable(CSV_CANDIDATES);
  const { hdr, rows } = parseCSV(txt);

  const consensus = onlyConsensus(rows, hdr);
  const sourceAll = consensus.length ? consensus : rows;

  const iCommence = hdr.indexOf("commence_time_utc");

  // determine latest NFL week
  const nflWeeks = sourceAll.map(r => nflWeekFromISO(r[iCommence]));
  const maxWeek = Math.max(...nflWeeks);

  const games = sourceAll.filter(
    r => nflWeekFromISO(r[iCommence]) === maxWeek
  );

  document.getElementById("seasonWeek").textContent =
    `NFL ${FORCED_SEASON} — Week ${maxWeek}`;

  window._season = FORCED_SEASON;
  window._week   = pad2(maxWeek);

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
  if(!out.content || out.content.path !== path) throw new Error("Save failed");
  alert(`Picks saved: ${out.content.path}`);
};

render().catch(e=>alert(e.message));
