// ---------- CONFIG ----------
const CSV_URL = "docs/data/weekly/latest.csv"; // schedule CSV served from /docs

// ---------- UTILS ----------
function normalizeTeamName(name){
  if(name === "Washington Commanders") return "Washington Redskins";
  return name;
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

// ✅ Robust consensus filter: accepts `is_consensus=1` OR `book="CONSENSUS"`
function onlyConsensus(rows, hdr){
  const iBook = hdr.indexOf("book");
  const iCons = hdr.indexOf("is_consensus");
  return rows.filter(r =>
    (iCons !== -1 && String(r[iCons]).trim() === "1") ||
    (iBook !== -1 && String(r[iBook]).trim().toUpperCase() === "CONSENSUS")
  );
}

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
  const w = ((parseInt(csvWeek,10) - base) % 18 + 18) % 18 + 1;
  return w;
}
function fmtSigned(n){
  if(n === "" || n === null || n === undefined) return "";
  const v = Number(n);
  if(Number.isNaN(v)) return String(n);
  return (v>0?`+${v}`:`${v}`);
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
  el.innerHTML = `
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
    <div class="lane"><div class="name mat">Mat</div><div class="btnrow" data-user="mat"></div></div>
    <div class="lane"><div class="name nikki">Nikki</div><div class="btnrow" data-user="nikki"></div></div>
  `;

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
        render(); // re-render
      };

      row.appendChild(b);
    });
  });

  return el;
}

async function render(){
  const txt = await fetchCSV(CSV_URL);
  const { hdr, rows } = parseCSV(txt);

  // ✅ Use consensus when available, otherwise gracefully fall back to all rows
  const consensus = onlyConsensus(rows, hdr);
  const source = consensus.length ? consensus : rows;
  if(!source.length) throw new Error("No rows found in latest.csv");

  const iWeek = hdr.indexOf("week");
  const wkVal = iWeek !== -1 ? source[0][iWeek] : "";
  const week = wkVal ? nflWeekLabel(wkVal) : "";
  document.getElementById("seasonWeek").textContent = week ? `NFL Week ${week}` : "NFL Schedule";

  const picksAll = loadPicks();
  const gamesDiv = document.getElementById("games");
  gamesDiv.innerHTML = "";
  source.forEach(r=>{
    gamesDiv.appendChild(card(hdr,r,picksAll));
  });
}

document.getElementById("clearBtn").onclick = ()=>{
  localStorage.removeItem(LS_MAT);
  localStorage.removeItem(LS_NIK);
  render();
};
document.getElementById("issueBtn").onclick = ()=>{
  alert("Submit Picks clicked (placeholder).");
};

render().catch(err=>{
  console.error(err);
  alert("Failed to load schedule CSV.");
});
