// ---------- CONFIG ----------
const CSV_URL = "https://raw.githubusercontent.com/clownworldenjoyer76/nikki_and_mat_bets/main/data/weekly/latest.csv"; // served from /docs

// Where "Submit Picks" opens the issue:
const GH_OWNER = "clownworldenjoyer76";
const GH_REPO  = "nikki_and_mat_bets";


// ----- Data path resolver: fetch from raw GitHub when path starts with "data/" or "docs/data/"
function resolveDataPath(path){
  if(/^https?:\/\//.test(path)) return path;
  if(path.startsWith("./")) path = path.slice(2);
  if(path.startsWith("docs/data/")) return "https://raw.githubusercontent.com/clownworldenjoyer76/nikki_and_mat_bets/main/" + path.replace(/^docs\//,"");
  if(path.startsWith("data/")) return "https://raw.githubusercontent.com/clownworldenjoyer76/nikki_and_mat_bets/main/" + path;
  return path;
}

// ---------- UTILS ----------
function normalizeTeamName(name){
  if(name === "Washington Commanders") return "Washington Redskins";
  return name;
}

async function fetchCSV(url){
  const r = await fetch(resolveDataPath(\1), { cache: "no-store" });
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
  const base = 36; // CSV "week" that corresponds to NFL Week 1
  const w = ((parseInt(csvWeek,10) - base) % 18 + 18) % 18 + 1; // 1..18
  return w;
}
function fmtSigned(n){
  if(n === "" || n === null || n === undefined) return "";
  const v = Number(n);
  if(Number.isNaN(v)) return String(n);
  return (v>0?`+${v}`:`${v}`);
}

// Nickname-only PNG logos in docs/assets/logos/ (e.g., eagles.png, cowboys.png)
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

// Ensure structure { spread: 'home'|'away', total: 'over'|'under' }
function ensurePickShape(obj){
  if(!obj || typeof obj !== "object") return { spread: null, total: null };
  return { spread: obj.spread ?? null, total: obj.total ?? null };
}

// ---------- RENDER ----------
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

  // SECTION 1: logos + game info
  const sec1 = document.createElement("div");
  sec1.className = "section game-info";
  sec1.innerHTML = `
    <div class="matchgrid">
      <img class="team-logo" src="${logoPath(away)}" alt="${away} logo">
      <div class="matchtext">
        <div class="team">${away}</div>
        <div class="at">@</div>
        <div class="team">${home}</div>
      </div>
      <img class="team-logo right" src="${logoPath(home)}" alt="${home} logo">
    </div>
    <div class="when">${when}</div>
    <div class="line">
      <span class="pill">Home spread: <b>${spreadHomeDisp}</b></span>
      <span class="pill">Total: <b>${totalDisp}</b></span>
    </div>
  `;

  // SECTION 2: Mat
  const sec2 = document.createElement("div");
  sec2.className = "section";
  sec2.innerHTML = `
    <div class="lane">
      <div class="name mat">Mat</div>
      <div class="btnrow" data-user="mat"></div>
    </div>
  `;

  // SECTION 3: Nikki
  const sec3 = document.createElement("div");
  sec3.className = "section";
  sec3.innerHTML = `
    <div class="lane">
      <div class="name nikki">Nikki</div>
      <div class="btnrow" data-user="nikki"></div>
    </div>
  `;

  el.appendChild(sec1);
  el.appendChild(sec2);
  el.appendChild(sec3);

  // Options
  const opts = [
    {label:`Home ${spreadHomeDisp}`, type:"spread", side:"home"},
    {label:`Away ${spreadAway}`,     type:"spread", side:"away"},
    {label:`Over ${totalDisp}`,      type:"total",  side:"over"},
    {label:`Under ${totalDisp}`,     type:"total",  side:"under"},
  ];

  ["mat","nikki"].forEach(user=>{
    const row = el.querySelector(`.btnrow[data-user="${user}"]`);
    const color = user==="mat" ? "mat" : "nikki";

    const picksUser = picksAll[user] || {};
    const curPick = ensurePickShape(picksUser[key]);

    opts.forEach(o=>{
      const b = document.createElement("button");
      b.className = "pickbtn";
      b.textContent = o.label;
      b.dataset.type = o.type;
      b.dataset.side = o.side;

      if( (o.type === "spread" && curPick.spread === o.side) ||
          (o.type === "total"  && curPick.total  === o.side) ){
        b.classList.add("active", color);
      }

      b.onclick = ()=>{
        const all = loadPicks();
        const mine = all[user] || {};
        const current = ensurePickShape(mine[key]);

        if(o.type === "spread"){
          current.spread = (current.spread === o.side) ? null : o.side;
        }else if(o.type === "total"){
          current.total  = (current.total  === o.side) ? null : o.side;
        }

        if(current.spread === null && current.total === null){
          delete mine[key];
        }else{
          mine[key] = current;
        }
        all[user] = mine;
        savePicks(all);

        row.querySelectorAll(".pickbtn").forEach(x=>{
          x.classList.remove("active","mat","nikki");
          const t = x.dataset.type, s = x.dataset.side;
          if( (t==="spread" && current.spread===s) || (t==="total" && current.total===s) ){
            x.classList.add("active", color);
          }
        });
      };

      row.appendChild(b);
    });
  });

  return el;
}

function render(h, rows){
  const wrap = document.getElementById("games");
  const empty = document.getElementById("empty");
  wrap.innerHTML = "";
  if(!rows.length){ empty.hidden = false; return; }
  empty.hidden = true;

  const picks = loadPicks();
  rows.forEach(r => wrap.appendChild(card(h, r, picks)));
}

// ---------- ISSUE ----------
function openIssue(){
  const all = loadPicks();
  const combined = {};
  for(const [user, bag] of Object.entries(all)){
    for(const [k,v] of Object.entries(bag)){
      const shaped = ensurePickShape(v);
      (combined[k] ||= {});
      combined[k][user] = { spread: shaped.spread, total: shaped.total };
    }
  }

  const season = window._season || new Date().getFullYear();
  const weekLabel = window._week_label || "1";
  const title  = encodeURIComponent(`Nikki and Mat’s NFL Picks — ${season} Week ${weekLabel}`);
  const body   = encodeURIComponent(`Paste (do not edit):\n\n\`\`\`json\n${JSON.stringify(combined, null, 2)}\n\`\`\`\n`);

  const url = `https://github.com/${GH_OWNER}/${GH_REPO}/issues/new?title=${title}&body=${body}`;
  window.open(url, "_blank");
}

function clearPicks(){
  localStorage.removeItem(LS_MAT);
  localStorage.removeItem(LS_NIK);
  load();
}

// ---------- LOAD ----------
async function load(){
  try{
    const txt = await fetchCSV(CSV_URL);
    const { hdr, rows } = parseCSV(txt);
    const cons = onlyConsensus(rows, hdr);
    render(hdr, cons);

    if(rows.length){
      const season = rows[0][hdr.indexOf("season")];
      const csvWeek = rows[0][hdr.indexOf("week")];
      const labelWeek = nflWeekLabel(csvWeek);
      window._season = season;
      window._week = csvWeek;
      window._week_label = labelWeek;

      const label = document.getElementById("seasonWeek");
      if(label) label.textContent = `${season} • Week ${labelWeek}`;
    }
  }catch(e){
    const empty = document.getElementById("empty");
    empty.hidden = false;
    empty.textContent = "No latest.csv available.";
  }
}

document.getElementById("issueBtn").onclick = openIssue;
document.getElementById("clearBtn").onclick = clearPicks;

load();
