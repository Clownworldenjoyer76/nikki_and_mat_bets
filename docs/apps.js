async function fetchCSV(url){ const r=await fetch(url,{cache:"no-store"}); if(!r.ok)throw new Error("CSV not found"); return r.text(); }
function parseCSV(txt){ const [h,...rows]=txt.trim().split("\n").map(l=>l.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)); return {hdr:h,rows}; }
function consensusOnly(rows,hdr){ return rows.filter(r=>r[hdr.indexOf("book")]==="CONSENSUS"); }
function key(row,h){ return `${row[h.indexOf("away_team")]}@${row[h.indexOf("home_team")]}_${row[h.indexOf("commence_time_utc")]}`; }

function renderTable(h,rows){
  const el=document.getElementById("table"); el.innerHTML="";
  const t=document.createElement("table");
  t.innerHTML=`<thead><tr><th>When (UTC)</th><th>Matchup</th><th>Home Spread</th><th>Total</th><th>Your Pick</th></tr></thead>`;
  const b=document.createElement("tbody");
  const picks=JSON.parse(localStorage.getItem("picks")||"{}");
  rows.forEach(r=>{
    const k=key(r,h);
    const tr=document.createElement("tr");
    const when=r[h.indexOf("commence_time_utc")];
    const matchup=`${r[h.indexOf("away_team")]} @ ${r[h.indexOf("home_team")]}`;
    const sh=r[h.indexOf("spread_home")]||"";
    const tot=r[h.indexOf("total")]||"";
    const pickCell=document.createElement("td");
    function save(p){ picks[k]=p; localStorage.setItem("picks",JSON.stringify(picks)); pickCell.textContent=JSON.stringify(picks[k]); }
    ["Home","Away","Over","Under"].forEach(label=>{
      const btn=document.createElement("button"); btn.textContent=label;
      btn.onclick=()=> label==="Home"||label==="Away" ? save({type:"spread",side:label.toLowerCase()})
                                                     : save({type:"total",side:label.toLowerCase()});
      pickCell.appendChild(btn);
    });
    tr.innerHTML=`<td>${when}</td><td>${matchup}</td><td>${sh}</td><td>${tot}</td>`;
    tr.appendChild(pickCell); b.appendChild(tr);
  });
  t.appendChild(b); el.appendChild(t);
}

async function loadWeek(){
  const season=document.getElementById("season").value;
  const week=String(document.getElementById("week").value).padStart(2,"0");
  const path=`../data/weekly/${season}_wk${week}_odds.csv`;
  const {hdr,rows}=parseCSV(await fetchCSV(path));
  renderTable(hdr, consensusOnly(rows,hdr));
}
document.getElementById("load").onclick=loadWeek;

document.getElementById("openIssue").onclick=()=>{
  const season=document.getElementById("season").value;
  const week=String(document.getElementById("week").value).padStart(2,"0");
  const picks=localStorage.getItem("picks")||"{}";
  const title=encodeURIComponent(`PICKS ${season} WK${week} (Mathew vs Wife)`);
  const body=encodeURIComponent(`Paste (do not edit) between the fences:\n\n\`\`\`json\n${picks}\n\`\`\`\n`);
  window.open(`https://github.com/YOUR_USER/YOUR_REPO/issues/new?title=${title}&body=${body}`,"_blank");
};
