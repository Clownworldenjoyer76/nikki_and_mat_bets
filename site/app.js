async function fetchCSV(url){
  const res = await fetch(url, {cache:"no-store"});
  if(!res.ok) throw new Error("CSV not found");
  return await res.text();
}
function parseCSV(txt){
  const [hdr,...rows]=txt.trim().split("\n").map(l=>l.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/));
  return {hdr, rows};
}
function toKey(row, hdr){ // game key
  const iH=hdr.indexOf("home_team"), iA=hdr.indexOf("away_team"), iT=hdr.indexOf("commence_time_utc");
  return `${row[iA]}@${row[iH]}_${row[iT]}`;
}
function consensusOnly(rows, hdr){
  const iBook = hdr.indexOf("book");
  return rows.filter(r => r[iBook]==="CONSENSUS");
}

function renderTable(hdr, rows){
  const iH=hdr.indexOf("home_team"), iA=hdr.indexOf("away_team"),
        iS=hdr.indexOf("spread_home"), iTot=hdr.indexOf("total"),
        iT=hdr.indexOf("commence_time_utc");
  const el = document.getElementById("table");
  el.innerHTML = "";
  const table = document.createElement("table");
  const thead = document.createElement("thead");
  thead.innerHTML = `<tr><th>When (UTC)</th><th>Matchup</th><th>Home Spread</th><th>Total</th><th>Your Pick</th></tr>`;
  table.appendChild(thead);
  const tbody = document.createElement("tbody");
  const picks = JSON.parse(localStorage.getItem("picks")||"{}");

  rows.forEach(r=>{
    const k = toKey(r, hdr);
    const tr = document.createElement("tr");
    const pickCell = document.createElement("td");

    const btnHome = document.createElement("button");
    btnHome.textContent = "Home";
    btnHome.onclick=()=>{picks[k]={type:"spread", side:"home"}; save();};

    const btnAway = document.createElement("button");
    btnAway.textContent = "Away";
    btnAway.onclick=()=>{picks[k]={type:"spread", side:"away"}; save();};

    const btnOver = document.createElement("button");
    btnOver.textContent = "Over";
    btnOver.onclick=()=>{picks[k]={type:"total", side:"over"}; save();};

    const btnUnder = document.createElement("button");
    btnUnder.textContent = "Under";
    btnUnder.onclick=()=>{picks[k]={type:"total", side:"under"}; save();};

    function save(){ localStorage.setItem("picks", JSON.stringify(picks)); pickCell.textContent = JSON.stringify(picks[k]); }

    tr.innerHTML = `<td>${r[iT]}</td><td>${r[iA]} @ ${r[iH]}</td><td>${r[iS]||""}</td><td>${r[iTot]||""}</td>`;
    pickCell.append(btnHome, btnAway, btnOver, btnUnder);
    tr.appendChild(pickCell);
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  el.appendChild(table);
}

async function loadWeek(){
  const season = document.getElementById("season").value;
  const week = String(document.getElementById("week").value).padStart(2,"0");
  const path = `../data/weekly/${season}_wk${week}_odds.csv`;
  const {hdr, rows} = parseCSV(await fetchCSV(path));
  const cons = consensusOnly(rows, hdr);
  renderTable(hdr, cons);
}

document.getElementById("load").onclick = loadWeek;

// Build “Open GitHub Issue” with picks JSON embedded
document.getElementById("openIssue").onclick = ()=>{
  const season = document.getElementById("season").value;
  const week = String(document.getElementById("week").value).padStart(2,"0");
  const picks = localStorage.getItem("picks")||"{}";
  const title = encodeURIComponent(`PICKS ${season} WK${week} (Mathew vs Wife)`);
  const body = encodeURIComponent(`Paste do not edit below:\n\n\`\`\`json\n${picks}\n\`\`\`\n`);
  // Replace YOUR_USER and REPO below once you name the repo
  const url = `https://github.com/YOUR_USER/bet-duel/issues/new?title=${title}&body=${body}`;
  window.open(url, "_blank");
};
