// ---- config ----
const OWNER = "YOUR_GITHUB_USERNAME";
const REPO  = "YOUR_REPO_NAME";
const BRANCH = "main";

// ---- helpers ----
function qs(name) {
  return new URLSearchParams(window.location.search).get(name);
}

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
  const lines = [
    headers.join(","),
    ...rows.map(r => headers.map(h => r[h]).join(","))
  ];
  return lines.join("\n");
}
