// docs/score_entry.js

// ====== CONFIG ======
const OWNER = "clownworldenjoyer76";
const REPO = "nikki_and_mat_bets";
const BRANCH = "main";

// ====== TEAM ABBREVIATIONS (DISPLAY ONLY) ======
const TEAM_ABBR = {
  "Arizona Cardinals": "ARI",
  "Atlanta Falcons": "ATL",
  "Baltimore Ravens": "BAL",
  "Buffalo Bills": "BUF",
  "Carolina Panthers": "CAR",
  "Chicago Bears": "CHI",
  "Cincinnati Bengals": "CIN",
  "Cleveland Browns": "CLE",
  "Dallas Cowboys": "DAL",
  "Denver Broncos": "DEN",
  "Detroit Lions": "DET",
  "Green Bay Packers": "GB",
  "Houston Texans": "HOU",
  "Indianapolis Colts": "IND",
  "Jacksonville Jaguars": "JAX",
  "Kansas City Chiefs": "KC",
  "Las Vegas Raiders": "LV",
  "Los Angeles Chargers": "LAC",
  "Los Angeles Rams": "LAR",
  "Miami Dolphins": "MIA",
  "Minnesota Vikings": "MIN",
  "New England Patriots": "NE",
  "New Orleans Saints": "NO",
  "New York Giants": "NYG",
  "New York Jets": "NYJ",
  "Philadelphia Eagles": "PHI",
  "Pittsburgh Steelers": "PIT",
  "San Francisco 49ers": "SF",
  "Seattle Seahawks": "SEA",
  "Tampa Bay Buccaneers": "TB",
  "Tennessee Titans": "TEN",
  "Washington Commanders": "WAS"
};

// ====== HELPERS ======
function pagesCsvUrl(filePath) {
  return `${location.origin}/${REPO}/${filePath}`;
}

function apiContentsUrl(filePath) {
  return `https://api.github.com/repos/${OWNER}/${REPO}/contents/${filePath}`;
}

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

// ====== STATE ======
let season = "";
let week = "";
let filePath = "";
let rows = [];
let headers = [];
let lastSha = null;

// ====== ELEMENTS ======
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

  const res = await fetch(pagesCsvUrl(filePath), { cache: "no-store" });
  if (!res.ok) {
    alert(`Scores CSV not found:\n${filePath}`);
    return;
  }

  const text = await res.text();
  const lines = text.replace(/\r\n/g, "\n").trim().split("\n");
  headers = lines[0].split(",").map(h => h.trim());
  rows = parseCSV(text);

  tbody.innerHTML = "";

  rows.forEach((r, i) => {
    const away = TEAM_ABBR[r.away_team] || r.away_team || "";
    const home = TEAM_ABBR[r.home_team] || r.home_team || "";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${away} @ ${home}</td>
      <td><input type="number" inputmode="numeric" data-i="${i}" data-f="away_score" value="${r.away_score ?? ""}"></td>
      <td><input type="number" inputmode="numeric" data-i="${i}" data-f="home_score" value="${r.home_score ?? ""}"></td>
    `;
    tbody.appendChild(tr);
  });

  table.style.display = "";
  saveBtn.style.display = "";
}

// ====== SAVE SCORES ======
async function saveScores() {
  if (!filePath || rows.length === 0) {
    alert("Load games first.");
    return;
  }

  document.querySelectorAll('input[data-i][data-f]').forEach(inp => {
    const i = parseInt(inp.dataset.i, 10);
    const f = inp.dataset.f;
    if (Number.isFinite(i) && rows[i]) {
      rows[i][f] = (inp.value ?? "").toString().trim();
    }
  });

  const csv = toCSV(rows, headers);
  const content = b64EncodeUtf8(csv);
  const token = prompt("Enter GitHub token (contents:write)");
  if (!token) return;

  const metaRes = await fetch(apiContentsUrl(filePath), {
    headers: { Authorization: `token ${token}` }
  });
  if (!metaRes.ok) {
    alert("Could not read file metadata.");
    return;
  }

  lastSha = (await metaRes.json()).sha;

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
    alert("Save failed.");
    return;
  }

  alert("Scores saved.");
}

// ====== EVENTS ======
if (loadBtn) loadBtn.addEventListener("click", loadGames);
if (saveBtn) saveBtn.addEventListener("click", saveScores);
