// ---------- CONFIG ----------
const PRIMARY_CSV = "docs/data/weekly/latest.csv";
const CSV_CANDIDATES = [
  PRIMARY_CSV,
  "/nikki_and_mat_bets/docs/data/weekly/latest.csv",
  "data/weekly/latest.csv"
];

const OWNER  = "clownworldenjoyer76";
const REPO   = "nikki_and_mat_bets";
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
    }catch{}
  }
  throw new Error("Schedule CSV not found");
}

function parseCSV(txt){
  const rows = txt.trim().split(/\r?\n/).map(l =>
    l.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
  );
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
  if(n === "" || n == null) return "";
  const v = Number(n);
  if(Number.isNaN(v)) return String(n);
  return v > 0 ? `+${v}` : `${v}`;
}

function logoPath(team){
  const cleaned = team.replace(/[^A-Za-z0-9 ]/g," ").replace(/\s+/g," ").trim();
  const nickname = cleaned.split(" ").pop().toLowerCase();
  return `assets/logos/${nickname}.png`;
}

function apiContentsUrl(path){
  return `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`;
}

function b64(str){
  return btoa(unescape(encodeURIComponent(str)));
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

function ensurePickShape(o){
  if(!o || typeof o !== "object") return { spread:null, total:null };
  return { spread:o.spread ?? null, total:o.total ?? null };
}

// ---------- UI ----------
function makePickButton(label,type,side,curPick,color,key,user){
  const b = document.createElement("button");
  b.className = "pickbtn";
  b.textContent = label;

  if(
    (type==="spread" && curPick.spread===side) ||
    (type==="total"  && curPick.total===side)
  ){
    b.classList.add("active",color);
  }

  b.onclick = async ()=>{
    const all = loadPicks();
    const mine = all[user] || {};
    const cur  = ensurePickShape(mine[key]);

    if(type==="spread") cur.spread = cur.spread===side ? null : side;
    else cur.total = cur.total===side ? null : side;

    if(cur.spread==null && cur.total==null) delete mine[key];
    else mine[key] = cur;

    all[user] = mine;
    savePicks(all);
    await render();
  };
  return b;
}

function card(h,r,picksAll){
  const when = fmtDate(r[h.indexOf("commence_time_utc")]);
  const home = normalizeTeamName(r[h.indexOf("home_team")]);
  const away = normalizeTeamName(r[h.indexOf("away_team")]);

  const spreadHome = r[h.indexOf("spread_home")] || "";
  const total = r[h.indexOf("total")] || "";
  const spreadAway = spreadHome==="" ? "" : fmtSigned(-Number(spreadHome));

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
    <div class="when">${when}</div>
    <div class="line">
      <span class="pill">Home spread: <b>${fmtSigned(spreadHome)}</b></span>
      <span class="pill">Total: <b>${total}</b></span>
    </div>
  `;

  ["mat","nikki"].forEach(user=>{
    const sec = document.createElement("div");
    const name = document.createElement("div");
    name.className = "name "+user;
    name.textContent = user==="mat"?"Mat":"Nikki";
    sec.appendChild(name);

    const grid = document.createElement("div");
    grid.className = "pick-grid";

    const cur = ensurePickShape((picksAll[user]||{})[key]);
    const color = user==="mat"?"mat":"nikki";

    [
      makePickButton(`${away} ${spreadAway}`,"spread","away",cur,color,key,user),
      makePickButton(`Over ${total}`,"total","over",cur,color,key,user),
      makePickButton(`${home} ${fmtSigned(spreadHome)}`,"spread","home",cur,color,key,user),
      makePickButton(`Under ${total}`,"total","under",cur,color,key,user)
    ].forEach(b=>grid.appendChild(b));

    sec.appendChild(grid);
    el.appendChild(sec);
  });

  return el;
}

// ---------- RENDER ----------
async function render(){
  const { txt } = await fetchFirstAvailable(CSV_CANDIDATES);
  const { hdr, rows } = parseCSV(txt);
  const src = onlyConsensus(rows,hdr).length ? onlyConsensus(rows,hdr) : rows;

  const iWeek   = hdr.indexOf("week");
  const iSeason = hdr.indexOf("season");
  const iTime   = hdr.indexOf("commence_time_utc");

  const csvWeek   = parseInt(src[0][iWeek],10);
  const csvSeason = parseInt(src[0][iSeason],10);
  const gameYear  = new Date(src[0][iTime]).getFullYear();

  let nflWeek = csvWeek;
  let nflSeason = csvSeason;

  if(csvWeek>=1 && csvWeek<=4 && gameYear>csvSeason){
    nflWeek = 18 + csvWeek;
    nflSeason = csvSeason - 1;
  }

  window._week   = String(nflWeek).padStart(2,"0");
  window._season = nflSeason;

  document.getElementById("seasonWeek").textContent = `NFL Week ${nflWeek}`;

  const picksAll = loadPicks();
  const games = document.getElementById("games");
  games.innerHTML = "";

  src.forEach((r,i)=>{
    games.appendChild(card(hdr,r,picksAll));
    if(i<src.length-1){
      const d = document.createElement("div");
      d.className="neon-divider";
      games.appendChild(d);
    }
  });
}

// ---------- SAVE PICKS (CORRECT + VERIFIED) ----------
document.getElementById("issueBtn").onclick = async ()=>{
  const season = window._season;
  const week   = window._week;

  if(!season || !week){
    alert("Season/week not set");
    return;
  }

  const picksAll = loadPicks();
  const rows = [];

  Object.entries(picksAll).forEach(([picker,games])=>{
    Object.entries(games).forEach(([game_id,p])=>{
      if(p.spread) rows.push({season,week,game_id,picker,pick_type:"ATS",pick:p.spread});
      if(p.total)  rows.push({season,week,game_id,picker,pick_type:"OU", pick:p.total});
    });
  });

  if(!rows.length){
    alert("No picks selected");
    return;
  }

  const headers = ["season","week","game_id","picker","pick_type","pick"];
  const csv = headers.join(",")+"\n"+rows.map(r=>headers.map(h=>r[h]).join(",")).join("\n");

  const token = prompt("GitHub token (contents:write)");
  if(!token) return;

  const path = `docs/data/picks/${season}_wk${week}_picks.csv`;

  let sha = null;
  const meta = await fetch(apiContentsUrl(path), {
    headers:{ Authorization:`token ${token}` }
  });
  if(meta.ok){
    const j = await meta.json();
    sha = j.sha;
  }

  const res = await fetch(apiContentsUrl(path), {
    method:"PUT",
    headers:{
      Authorization:`token ${token}`,
      "Content-Type":"application/json"
    },
    body:JSON.stringify({
      message:`Save picks ${season} wk${week}`,
      content:b64(csv),
      sha,
      branch:BRANCH
    })
  });

  const out = await res.json();

  if(!out.content || out.content.path !== path){
    alert("Save FAILED. GitHub did not create the file.");
    console.error(out);
    return;
  }

  alert(`Saved: ${out.content.path}`);
};

// ---------- CLEAR ----------
document.getElementById("clearBtn").onclick = ()=>{
  localStorage.removeItem(LS_MAT);
  localStorage.removeItem(LS_NIK);
  render();
};

render().catch(e=>{
  console.error(e);
  alert("Failed to load schedule CSV");
});
