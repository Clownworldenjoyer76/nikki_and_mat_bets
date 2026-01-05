// docs/score_entry.js

// ====== CONFIG ======
const OWNER = "clownworldenjoyer76";
const REPO = "nikki_and_mat_bets";
const BRANCH = "main";

// IMPORTANT:
// We load the CSV from GitHub Pages (same origin) so it always works from Pages.
function pagesCsvUrl(filePath) {
  // location.origin = https://clownworldenjoyer76.github.io
  return `${location.origin}/${REPO}/${filePath}`;
}

function apiContentsUrl(filePath) {
  return `https://api.github.com/repos/${OWNER}/${REPO}/contents/${filePath}`;
}

// ====== CSV HELPERS (simple, no quotes support) ======
function parseCSV(text) {
  const lines = text.replace(/\r\n/g, "\n").trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim());
  return lines.slice(1).map(line => {
    const vals = line.split(",");
    const row = {};
    headers.forEach((h, i) => {
      row[h] = (vals[i] ?? "").trim();
    });
    return row;
  });
}

function toCSV(rows, headers) {
  const head = headers.join(",");
  const body = rows.map(r => headers.map(h => (r[h] ?? "")).join(","));
  return [head, ...body].join("\n");
}

function b64EncodeUtf8(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

// ====== UI STATE ======
let season = "";
let week = "";
let filePath = "";
let rows = [];
let headers = [];
let lastSha = null;

// Elements
const seasonInput = document.getElementById("seasonInput");
const weekInput = document.getElementById("weekInput");
const loadBtn = document.getElementById("loadBtn");
const saveBtn = document.getElementById("saveBtn");
const table = document.getElementById("scoresTable");
const tbody = document.getElementById("scoresBody");

// ====== LOAD GAMES ======
async function loadGames() {
  season = (seasonInput?.value || "").trim();
  week = (weekInput?.value || "").trim();

  if (!season || !week) {
    alert("Season and week are required");
    return;
  }

  const wk = String(parseInt(week, 10)).padStart(2, "0");
  if (wk === "NaN") {
    alert("Week must be a number");
    return;
  }

  filePath = `docs/data/scores/${season}_wk${wk}_scores.csv`;

  const url = pagesCsvUrl(filePath);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    alert(`Scores CSV not found:\n${filePath}`);
    return;
  }

  const text = await res.text();
  const lines = text.replace(/\r\n/g, "\n").trim().split("\n");
  if (lines.length === 0) {
    alert("Scores CSV is empty");
    return;
  }

  headers = lines[0].split(",").map(h => h.trim());
  rows = parseCSV(text);

  // Render rows
  tbody.innerHTML = "";
  rows.forEach((r, i) => {
    const away = r.away_team ?? "";
    const home = r.home_team ?? "";
    const awayScore = r.away_score ?? "";
    const homeScore = r.home_score ?? "";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${away} @ ${home}</td>
      <td><input type="number" inputmode="numeric" data-i="${i}" data-f="away_score" value="${awayScore}"></td>
      <td><input type="number" inputmode="numeric" data-i="${i}" data-f="home_score" value="${homeScore}"></td>
    `;
    tbody.appendChild(tr);
  });

  table.style.display = "";
  saveBtn.style.display = "";
}

// ====== SAVE SCORES (commit to repo) ======
async function saveScores() {
  if (!filePath || rows.length === 0) {
    alert("Load games first.");
    return;
  }

  // Pull input values back into rows
  document.querySelectorAll('input[data-i][data-f]').forEach(inp => {
    const i = parseInt(inp.dataset.i, 10);
    const f = inp.dataset.f;
    if (!Number.isFinite(i) || !rows[i]) return;
    rows[i][f] = (inp.value ?? "").toString().trim();
  });

  const csv = toCSV(rows, headers);
  const content = b64EncodeUtf8(csv);

  const token = prompt("Enter GitHub token (contents:write)");
  if (!token) return;

  // Get SHA for the file (required by GitHub API)
  const metaRes = await fetch(apiContentsUrl(filePath), {
    headers: { Authorization: `token ${token}` }
  });

  if (!metaRes.ok) {
    alert("Could not read file metadata (token/permissions/path problem).");
    return;
  }

  const meta = await metaRes.json();
  lastSha = meta.sha;

  // Write updated content
  const putRes = await fetch(apiContentsUrl(filePath), {
    method: "PUT",
    headers: {
      Authorization: `token ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message: `Update scores: ${season} wk${week}`,
      content,
      sha: lastSha,
      branch: BRANCH
    })
  });

  if (!putRes.ok) {
    const err = await putRes.text().catch(() => "");
    alert("Save failed.\n" + err);
    return;
  }

  alert("Scores saved.");
}

// ====== WIRE UP BUTTONS ======
if (loadBtn) loadBtn.addEventListener("click", loadGames);
if (saveBtn) saveBtn.addEventListener("click", saveScores);
