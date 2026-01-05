// ============ CONFIG ============
const OWNER  = "clownworldenjoyer76";
const REPO   = "nikki_and_mat_bets";
const BRANCH = "main";

// ============ CSV HELPERS ============
function parseCSV(text) {
  const lines = text.trim().split("\n");
  const headers = lines[0].split(",");
  return lines.slice(1).map(line => {
    const vals = line.split(",");
    const o = {};
    headers.forEach((h, i) => o[h] = vals[i] || "");
    return o;
  });
}

function toCSV(rows) {
  const headers = Object.keys(rows[0]);
  const body = rows.map(r => headers.map(h => r[h]).join(","));
  return [headers.join(","), ...body].join("\n");
}

// ============ STATE ============
let season, week, rows = [], filePath, fileSha = null;

// ============ LOAD ============
document.getElementById("loadBtn").onclick = async () => {
  season = document.getElementById("seasonInput").value;
  week   = document.getElementById("weekInput").value;

  if (!season || !week) {
    alert("Season and week are required");
    return;
  }

  const wk = String(week).padStart(2, "0");
  filePath = `docs/data/scores/${season}_wk${wk}_scores.csv`;

  const rawUrl = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/${filePath}`;
  const res = await fetch(rawUrl);
  if (!res.ok) {
    alert("Scores file not found");
    return;
  }

  rows = parseCSV(await res.text());

  const tbody = document.getElementById("scoresBody");
  tbody.innerHTML = "";

  rows.forEach((r, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.away_team} @ ${r.home_team}</td>
      <td><input type="number" data-i="${i}" data-f="away_score" value="${r.away_score}"></td>
      <td><input type="number" data-i="${i}" data-f="home_score" value="${r.home_score}"></td>
    `;
    tbody.appendChild(tr);
  });

  document.getElementById("scoresTable").style.display = "";
  document.getElementById("saveBtn").style.display = "";
};

// ============ SAVE ============
document.getElementById("saveBtn").onclick = async () => {
  document.querySelectorAll("input[data-i]").forEach(inp => {
    rows[inp.dataset.i][inp.dataset.f] = inp.value;
  });

  const csv = toCSV(rows);
  const content = btoa(unescape(encodeURIComponent(csv)));
  const token = prompt("GitHub token (contents:write)");

  if (!token) return;

  const metaRes = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/contents/${filePath}`,
    { headers: { Authorization: `token ${token}` } }
  );
  fileSha = (await metaRes.json()).sha;

  await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/contents/${filePath}`,
    {
      method: "PUT",
      headers: {
        Authorization: `token ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: `Update scores: ${season} wk${week}`,
        content,
        sha: fileSha,
        branch: BRANCH
      })
    }
  );

  alert("Scores saved");
};
