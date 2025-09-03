// ---------- CONFIG ----------
const CSV_URL = "data/weekly/latest.csv"; // served from /docs

// ---------- UTILS ----------
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

// ---------- STORAGE (two users) ----------
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

// ---------- RENDER ----------
function card(h, r, picks){
  const when = r[h.indexOf("commence_time_utc")];
  const home = r[h.indexOf("home_team")];
  const away = r[h.indexOf("away_team")];
  const spr  = r[h.indexOf("spread_home")] || "";
  const tot  = r[h.indexOf("total")] || "";
  const key  = keyOf(r,h);

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

  const opts = [
    {label:"Home", type:"spread", side:"home"},
    {label:"Away", type:"spread", side:"away"},
    {label:"Over", type:"total",  side:"over"},
    {label:"Under",type:"total",  side:"under"},
  ];

  ["mat","nikki"].forEach(user=>{
    const row = el.querySelector(`.btnrow[data-user="${user}"]`);
    const color = user==="mat" ? "mat" : "nikki";
    opts.forEach(o=>{
      const b = document.createElement("button");
      b.className = "pickbtn";
      b.textContent = o.label;

      const cur = (picks[user]||{})[key];
      if(cur && cur.type===o.type && cur.side===o.side){
        b.classList.add("active", color);
      }

      b.onclick = ()=>{
        const all = loadPicks();
        const existing = (all[user]||{})[key];
        if(existing && existing.type===o.type && existing.side===o.side){
          delete all[user][key];               // toggle off
        }else{
          all[user] = all[user] || {};
          all[user][key] = { type:o.type, side:o.side };
        }
        savePicks(all);

        // refresh highlight for this lane
        row.querySelectorAll(".pickbtn").forEach(x=>x.classList.remove("active","mat","nikki"));
        const now = (all[user]||{})[key];
        if(now){
          const btn = Array.from(row.children).find(btn=>{
            const lbl = btn.textContent.toLowerCase();
            return (now.type==="spread" && (lbl==="home"||lbl==="away") && lbl===now.side) ||
                   (now.type==="total"  && (lbl==="over"||lbl==="under") && lbl===now.side);
          });
          if(btn) btn.classList.add("active", color);
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
  rows.forEach(r => wrap.appendChild(card(h, r, picks)));
}

// ---------- ISSUE ----------
function openIssue(){
  const all = loadPicks();
  const combined = {};
  for(const [user, bag] of Object.entries(all)){
    for(const [k,v] of Object.entries(bag)){
      (combined[k] ||= {})[user] = v;
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
  load(); // re-render to clear highlights
}

// ---------- LOAD ----------
async function load(){
  try{
    const txt = await fetchCSV(CSV_URL);
    const { hdr, rows } = parseCSV(txt);
    const cons = onlyConsensus(rows, hdr);
    render(hdr, cons);

    if(rows.length){
      window._season = rows[0][hdr.indexOf("season")];
      window._week   = rows[0][hdr.indexOf("week")];
      const label = document.getElementById("weeklabel");
      if(label) label.textContent = `Season ${window._season} • Week ${window._week}`;
    }
  }catch(e){
    const empty = document.getElementById("empty");
    empty.hidden = false;
    empty.textContent = "No latest.csv available.";
  }
}

document.getElementById("openIssue").onclick = openIssue;
document.getElementById("clear").onclick = clearPicks;

load();
