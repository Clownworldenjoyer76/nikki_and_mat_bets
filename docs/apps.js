// ---------- config: your project pages base ----------
const BASE = "/nikki_and_mat_bets"; // your Pages project path
const CSV_URL = `${BASE}/data/weekly/latest.csv`;

// ---------- utils ----------
async function fetchCSV(url){
  const r = await fetch(url, { cache: "no-store" });
  if(!r.ok) throw new Error("CSV not found");
  return r.text();
}
function parseCSV(txt){
  const rows = txt.trim().split("\n").map(l=>l.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/));
  const hdr = rows.shift();
  return { hdr, rows };
}
function onlyConsensus(rows, hdr){
  const i = hdr.indexOf("book");
  return rows.filter(r=>r[i]==="CONSENSUS");
}
function kOf(r,h){ return `${r[h.indexOf("away_team")]}@${r[h.indexOf("home_team")]}_${r[h.indexOf("commence_time_utc")]}`; }

// ---------- storage (two lanes) ----------
const LS_MAT = "picks_mat";
const LS_NIK = "picks_nikki";
function loadPicks(){ 
  return {
    mat: JSON.parse(localStorage.getItem(LS_MAT)||"{}"),
    nikki: JSON.parse(localStorage.getItem(LS_NIK)||"{}")
  };
}
function savePicks(all){
  localStorage.setItem(LS_MAT, JSON.stringify(all.mat||{}));
  localStorage.setItem(LS_NIK, JSON.stringify(all.nikki||{}));
}

// ---------- render ----------
function gameCard(h, r, picks){
  const when = r[h.indexOf("commence_time_utc")];
  const home = r[h.indexOf("home_team")];
  const away = r[h.indexOf("away_team")];
  const spr  = r[h.indexOf("spread_home")] || "";
  const tot  = r[h.indexOf("total")] || "";
  const key  = kOf(r,h);

  const el = document.createElement("article");
  el.className = "card";
  el.innerHTML = `
    <div class="top">
      <div>
        <div class="match">${away} @ ${home}</div>
        <div class="when">${when}</div>
      </div>
    </div>
    <div class="line">
      <span class="pill">Home spread: <b>${spr}</b></span>
      <span class="pill">Total: <b>${tot}</b></span>
    </div>

    <div class="lane">
      <div class="name mat">Mat</div>
      <div class="btnrow" data-user="mat"></div>

      <div class="name nikki">Nikki</div>
      <div class="btnrow" data-user="nikki"></div>
    </div>

    <div class="footer small"><span>${key}</span></div>
  `;

  const options = [
    {label:"Home", type:"spread", side:"home"},
    {label:"Away", type:"spread", side:"away"},
    {label:"Over", type:"total",  side:"over"},
    {label:"Under",type:"total",  side:"under"},
  ];

  ["mat","nikki"].forEach(user=>{
    const row = el.querySelector(`.btnrow[data-user="${user}"]`);
    const colorClass = (user==="mat") ? "mat" : "nikki";
    options.forEach(opt=>{
      const b = document.createElement("button");
      b.className = "pickbtn";
      b.textContent = opt.label;
      const current = (picks[user]||{})[key];
      if(current && current.type===opt.type && current.side===opt.side){
        b.classList.add("active", colorClass);
      }
      b.onclick = ()=>{
        // toggle selection: if same pick clicked again, clear it
        const all = loadPicks();
        const cur = (all[user]||{})[key];
        if(cur && cur.type===opt.type && cur.side===opt.side){
          delete all[user][key];
        }else{
          all[user] = all[user] || {};
          all[user][key] = { type: opt.type, side: opt.side };
        }
        savePicks(all);
        // refresh buttons
        row.querySelectorAll(".pickbtn").forEach(x=>x.classList.remove("active","mat","nikki"));
        const newCur = (all[user]||{})[key];
        if(newCur){
          const matchBtn = Array.from(row.children).find(btn=>{
            const lbl = btn.textContent.toLowerCase();
            return (newCur.type==="spread" && (lbl==="home"||lbl==="away") && lbl===newCur.side) ||
                   (newCur.type==="total"  && (lbl==="over"||lbl==="under") && lbl===newCur.side);
          });
          if(matchBtn) matchBtn.classList.add("active", colorClass);
        }
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
  rows.forEach(r=> wrap.appendChild(gameCard(h, r, picks)) );
}

// ---------- issue payload ----------
function openIssue(){
  const all = loadPicks();
  // combined view: { gameKey: { mat:{...}?, nikki:{...}? } }
  const combined = {};
  for(const [u, bag] of Object.entries(all)){
    for(const [k, v] of Object.entries(bag)){
      combined[k] = combined[k] || {};
      combined[k][u] = v;
    }
  }
  const season = window._season || new Date().getFullYear();
  const week   = window._week   || "01";
  const title  = encodeURIComponent(`Nikki and Mat’s NFL Picks — ${season} WK${String(week).padStart(2,"0")}`);
  const body   = encodeURIComponent(`Paste (do not edit):\n\n\`\`\`json\n${JSON.stringify(combined, null, 2)}\n\`\`\`\n`);
  window.open(`https://github.com/Clownworldenjoyer76/bet-duel/issues/new?title=${title}&body=${body}`, "_blank");
}

function clearPicks(){
  localStorage.removeItem(LS_MAT);
  localStorage.removeItem(LS_NIK);
  // re-render to clear highlights
  load();
}

// ---------- load ----------
async function load(){
  try{
    const txt = await fetchCSV(CSV_URL);
    const { hdr, rows } = parseCSV(txt);
    const cons = onlyConsensus(rows, hdr);
    render(hdr, cons);
    if(rows.length){
      const s = rows[0][hdr.indexOf("season")];
      const w = rows[0][hdr.indexOf("week")];
      window._season = s;
      window._week = w;
      const label = document.getElementById("weeklabel");
      if(label) label.textContent = `Season ${s} • Week ${w}`;
    }
  }catch(e){
    document.getElementById("empty").hidden = false;
    document.getElementById("empty").textContent = "No latest.csv available.";
  }
}

document.getElementById("openIssue").onclick = openIssue;
document.getElementById("clear").onclick = clearPicks;

load();
