// ================= CONFIG =================
const OWNER  = "YOUR_GITHUB_USERNAME";
const REPO   = "YOUR_REPO_NAME";
const BRANCH = "main";

// ================= HELPERS =================
function getParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function parseCSV(text) {
  const lines = text.trim().split("\n");
  const headers = lines[0].split(",");
  return lines.slice(1).map(line => {
    const values = line.split(",");
    const row = {};
    headers.forEach((h, i) => row[h] = values[i] || "");
    return row;
  });
}

function toCSV(rows) {
  const headers = Object.keys(rows[0]);
  const body = rows.map(r => headers.map(h => r[h]).join(","));
  return [headers.join(","), ...body].join("\n");
}

// ================= LOAD CONTEXT =================
const season = getParam("season");
const week   = getParam("week");

if (!season || !week) {
  alert("Missing season or week in URL");
  throw new Error("Missing parameters");
}

const paddedWeek = String(week).padStart(2, "0");
const filePath = `docs/data/scores/${season}_wk${paddedWeek}_scores.csv`;

document.getElementById("pageTitle").textContent =
  `Season ${season} — Week ${week} Score Entry`;

let rows = [];
let fileSha = null;

// ================= LOAD CSV =================
async function loadScores() {
  const rawUrl = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/${filePath}`;
  const res = await fetch(rawUrl);
  if (!res.ok) {
    alert("Unable to load scores CSV");
    throw new Error("Fetch failed");
  }

  const text = await res.text();
  rows = parseCSV(text);

  const tbody = document.getElementById("scoresBody");
  tbody.innerHTML = "";

  rows.forEach((r, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.away_team} @ ${r.home_team}</td>
      <td><input data-i="${idx}" data-f="away_score" value="${r.away_score}"></td>
      <td><input data-i="${idx}" data-f="home_score" value="${r.home_score}"></td>
    `;
    tbody.appendChild(tr);
  });
}

// ================= SAVE CSV =================
document.getElementById("saveBtn").addEventListener("click", async () => {
  document.querySelectorAll("input").forEach(input => {
    const i = input.dataset.i;
    const f = input.dataset.f;
    rows[i][f] = input.value;
  });

  const csv = toCSV(rows);
  const encoded = btoa(unescape(encodeURIComponent(csv)));

  const token = prompt("Enter GitHub token (contents:write)");

  if (!token) {
    alert("Token required");
    return;
  }

  const metaRes = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/contents/${filePath}`,
    { headers: { Authorization: `token ${token}` } }
  );

  const meta = await metaRes.json();
  fileSha = meta.sha;

  await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/contents/${filePath}`,
    {
      method: "PUT",
      headers: {
        Authorization: `token ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: `Update scores for ${season} wk${week}`,
        content: encoded,
        sha: fileSha,
        branch: BRANCH
      })
    }
  );

  alert("Scores saved successfully");
});

// ================= INIT =================
loadScores();
