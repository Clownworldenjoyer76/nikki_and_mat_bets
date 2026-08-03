"use strict";

(() => {
  const client = window.supabaseClient;
  const CSV_URL = "data/weekly/latest.csv";

  const REGULAR_WEEKS = 18;

  const PLAYOFF_WEEKS = [
    { wk: 19, label: "WC" },
    { wk: 20, label: "DIV" },
    { wk: 21, label: "CONF" },
    { wk: 22, label: "SB" }
  ];

  async function fetchText(url) {
    const response = await fetch(url, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`Fetch failed: ${url} (${response.status})`);
    }

    return response.text();
  }

  function smartSplit(line) {
    const out = [];
    let cur = "";
    let inQ = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') inQ = !inQ;
      else if (ch === "," && !inQ) { out.push(cur); cur = ""; }
      else cur += ch;
    }

    out.push(cur);
    return out.map(s => s.replace(/^"|"$/g, ""));
  }

  function parseCSV(text) {
    const lines = text.trim().split("\n");
    const headers = smartSplit(lines[0]);

    return lines.slice(1).map(l => {
      const vals = smartSplit(l);
      const o = {};
      headers.forEach((h, i) => (o[h] = vals[i]));
      return o;
    });
  }

  async function loadSeason() {
    const rows = parseCSV(await fetchText(`${CSV_URL}?v=${Date.now()}`));

    for (const row of rows) {
      const season = String(row.season || "").trim();
      if (season) return season;
    }

    throw new Error("latest.csv contains no season value.");
  }

  async function loadProfiles() {
    const { data, error } = await client
      .from("profiles")
      .select("id, display_name");

    if (error) throw error;

    return (data || [])
      .slice()
      .sort((first, second) =>
        String(first.display_name || "").localeCompare(
          String(second.display_name || "")
        )
      );
  }

  async function loadGames(season) {
    const { data, error } = await client
      .from("games")
      .select("id, week")
      .eq("season", Number(season));

    if (error) throw error;

    const weekByGameId = new Map();

    for (const game of data || []) {
      weekByGameId.set(game.id, Number(game.week));
    }

    return weekByGameId;
  }

  async function loadGradedPicks(gameIds) {
    if (!gameIds.length) return [];

    const { data, error } = await client
      .from("picks")
      .select("user_id, game_id, spread_result, total_result")
      .in("game_id", gameIds);

    if (error) throw error;

    return data || [];
  }

  function blankRecord() {
    return { wS: 0, lS: 0, pS: 0, wT: 0, lT: 0, pT: 0 };
  }

  function tally(record, result, isSpread) {
    if (result === "W") isSpread ? record.wS++ : record.wT++;
    else if (result === "L") isSpread ? record.lS++ : record.lT++;
    else if (result === "P") isSpread ? record.pS++ : record.pT++;
  }

  function buildRecords(profiles, weekByGameId, picks) {
    const byUser = new Map();

    for (const profile of profiles) {
      byUser.set(profile.id, {
        overall: blankRecord(),
        byWeek: new Map()
      });
    }

    for (const pick of picks) {
      const entry = byUser.get(pick.user_id);
      if (!entry) continue;

      const week = weekByGameId.get(pick.game_id);
      if (!Number.isFinite(week)) continue;

      if (!entry.byWeek.has(week)) {
        entry.byWeek.set(week, blankRecord());
      }

      const weekRecord = entry.byWeek.get(week);

      tally(weekRecord, pick.spread_result, true);
      tally(entry.overall, pick.spread_result, true);

      tally(weekRecord, pick.total_result, false);
      tally(entry.overall, pick.total_result, false);
    }

    return byUser;
  }

  function fmt(w, l, p) {
    return p ? `${w}-${l}-${p}` : `${w}-${l}`;
  }

  function formatRecord(record) {
    if (!record) return { ats: "—", ou: "—" };

    return {
      ats: fmt(record.wS, record.lS, record.pS),
      ou: fmt(record.wT, record.lT, record.pT)
    };
  }

  function createElement(tagName, className = "", text = "") {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    if (text !== "") element.textContent = text;
    return element;
  }

  function addRow(tbody, label, ats, ou, cls = "") {
    const tr = createElement("tr", cls);
    tr.append(
      createElement("td", "", label),
      createElement("td", "", ats),
      createElement("td", "", ou)
    );
    tbody.appendChild(tr);
    return tr;
  }

  function buildCard(profile, seasonLabel, entry) {
    const card = createElement("article", "card");
    const inner = createElement("div", "card-inner");

    inner.appendChild(
      createElement("h1", "", profile.display_name || "Unknown account")
    );

    const wrap = createElement("div", "table-wrap");
    const table = createElement("table", "table compact");
    table.id = `recordsTable-${profile.id}`;

    const thead = createElement("thead");
    const headRow = createElement("tr");

    headRow.append(
      createElement("th", "", "Week"),
      createElement("th", "", "ATS"),
      createElement("th", "", "O/U")
    );

    thead.appendChild(headRow);

    const tbody = createElement("tbody");
    const rows = [];

    const overall = formatRecord(entry.overall);
    rows.push(addRow(tbody, seasonLabel, overall.ats, overall.ou, "year-row"));

    for (let wk = 1; wk <= REGULAR_WEEKS; wk++) {
      const rec = formatRecord(entry.byWeek.get(wk));
      rows.push(addRow(tbody, `Week ${wk}`, rec.ats, rec.ou));
    }

    for (const playoff of PLAYOFF_WEEKS) {
      const rec = formatRecord(entry.byWeek.get(playoff.wk));
      rows.push(addRow(tbody, playoff.label, rec.ats, rec.ou));
    }

    table.append(thead, tbody);
    wrap.appendChild(table);
    inner.appendChild(wrap);
    card.appendChild(inner);

    return { card, rows };
  }

  function parseWins(text) {
    if (!text || text === "—") return null;
    const wins = parseInt(text.split("-")[0], 10);
    return Number.isFinite(wins) ? wins : null;
  }

  function highlightWinners(rowsByProfile) {
    if (rowsByProfile.length < 2) return;

    const rowCount = Math.min(
      ...rowsByProfile.map(rows => rows.length)
    );

    for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
      for (const cellIndex of [1, 2]) {
        const cells = rowsByProfile.map(
          rows => rows[rowIndex].querySelectorAll("td")[cellIndex]
        );

        const wins = cells.map(cell => parseWins(cell.textContent));

        if (wins.some(value => value === null)) continue;

        const best = Math.max(...wins);

        cells.forEach((cell, index) => {
          if (wins[index] === best) {
            cell.style.outline = "2px solid lime";
          }
        });
      }
    }
  }

  function setSubtitle(season) {
    const el = document.getElementById("seasonWeek");
    if (el) el.textContent = `Season ${season} — ATS & O/U by Week`;
  }

  async function main() {
    const container = document.querySelector("main.two-up");
    if (!container) return;

    if (!client || typeof client.from !== "function") {
      console.error("Supabase client is not available.");
      return;
    }

    const seasonLabel = await loadSeason();

    const profiles = await loadProfiles();
    const weekByGameId = await loadGames(seasonLabel);

    const picks = await loadGradedPicks([...weekByGameId.keys()]);
    const recordsByUser = buildRecords(profiles, weekByGameId, picks);

    container.replaceChildren();

    const rowsByProfile = [];

    for (const profile of profiles) {
      const entry = recordsByUser.get(profile.id);

      const { card, rows } = buildCard(profile, seasonLabel, entry);

      container.appendChild(card);
      rowsByProfile.push(rows);
    }

    setSubtitle(seasonLabel);
    highlightWinners(rowsByProfile);
  }

  main().catch(error => {
    console.error(error);
  });
})();
