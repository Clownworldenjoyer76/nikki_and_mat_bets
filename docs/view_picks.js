"use strict";

(() => {
  const client = window.supabaseClient;

  const userSelect = document.getElementById("userSelect");
  const seasonSelect = document.getElementById("seasonSelect");
  const weekSelect = document.getElementById("weekSelect");
  const scopeLabel = document.getElementById("scopeLabel");
  const messageBox = document.getElementById("vpMessage");
  const tableBox = document.getElementById("vpTable");

  const state = {
    profiles: [],
    games: [],
    picks: [],
    selectedUserId: "",
    selectedSeason: "",
    selectedWeek: "all"
  };

  function assertReady() {
    const missing = [];

    if (!userSelect) missing.push("#userSelect");
    if (!seasonSelect) missing.push("#seasonSelect");
    if (!weekSelect) missing.push("#weekSelect");
    if (!scopeLabel) missing.push("#scopeLabel");
    if (!messageBox) missing.push("#vpMessage");
    if (!tableBox) missing.push("#vpTable");

    if (missing.length) {
      throw new Error("Missing required page elements: " + missing.join(", "));
    }

    if (!client || typeof client.from !== "function") {
      throw new Error("Supabase client is not available.");
    }
  }

  function createElement(tagName, className = "", text = "") {
    const element = document.createElement(tagName);

    if (className) element.className = className;
    if (text !== "") element.textContent = text;

    return element;
  }

  function selectedProfile() {
    return state.profiles.find(
      (profile) => profile.id === state.selectedUserId
    ) || null;
  }

  function formatSpread(value) {
    if (value === null || value === undefined || value === "") return "—";

    const number = Number(value);

    if (!Number.isFinite(number)) return String(value);

    return number > 0 ? "+" + number : String(number);
  }

  function formatTotal(value) {
    if (value === null || value === undefined || value === "") return "—";
    return String(value);
  }

  function spreadPickText(pick, game) {
    if (pick.spread_pick === "home") {
      return game.home_team + " " + formatSpread(game.spread_home);
    }

    if (pick.spread_pick === "away") {
      const awaySpread =
        game.spread_home === null || game.spread_home === undefined
          ? null
          : -Number(game.spread_home);

      return game.away_team + " " + formatSpread(awaySpread);
    }

    return "—";
  }

  function totalPickText(pick, game) {
    if (pick.total_pick === "over") return "Over " + formatTotal(game.total);
    if (pick.total_pick === "under") return "Under " + formatTotal(game.total);
    return "—";
  }

  function resultText(value) {
    if (value === "W") return "W";
    if (value === "L") return "L";
    if (value === "P") return "P";
    return "—";
  }

  function fillUserSelect() {
    userSelect.replaceChildren();

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Select a user";
    userSelect.appendChild(placeholder);

    for (const profile of state.profiles) {
      const option = document.createElement("option");
      option.value = profile.id;
      option.textContent = profile.display_name || "(no name)";
      userSelect.appendChild(option);
    }
  }

  function fillSeasonSelect() {
    const seasons = [...new Set(state.games.map((game) => game.season))]
      .sort((a, b) => b - a);

    seasonSelect.replaceChildren();

    for (const season of seasons) {
      const option = document.createElement("option");
      option.value = String(season);
      option.textContent = String(season);
      seasonSelect.appendChild(option);
    }

    if (seasons.length) {
      if (!seasons.map(String).includes(state.selectedSeason)) {
        state.selectedSeason = String(seasons[0]);
      }

      seasonSelect.value = state.selectedSeason;
      seasonSelect.disabled = false;
    } else {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "Season";
      seasonSelect.appendChild(option);
      state.selectedSeason = "";
      seasonSelect.disabled = true;
    }

    fillWeekSelect();
  }

  function fillWeekSelect() {
    const season = Number(state.selectedSeason);

    const weeks = [...new Set(
      state.games
        .filter((game) => game.season === season)
        .map((game) => game.week)
    )].sort((a, b) => a - b);

    weekSelect.replaceChildren();

    const all = document.createElement("option");
    all.value = "all";
    all.textContent = "All Weeks";
    weekSelect.appendChild(all);

    for (const week of weeks) {
      const option = document.createElement("option");
      option.value = String(week);
      option.textContent = "Week " + week;
      weekSelect.appendChild(option);
    }

    if (
      state.selectedWeek !== "all" &&
      !weeks.map(String).includes(state.selectedWeek)
    ) {
      state.selectedWeek = "all";
    }

    weekSelect.value = state.selectedWeek;
    weekSelect.disabled = !state.selectedSeason;
  }

  async function loadInitialData() {
    const profilesResponse = await client
      .from("profiles")
      .select("id, display_name, status")
      .eq("status", "active")
      .order("display_name", { ascending: true });

    if (profilesResponse.error) throw profilesResponse.error;

    state.profiles = profilesResponse.data || [];

    const gamesResponse = await client
      .from("games")
      .select(
        "id, season, week, away_team, home_team, kickoff_utc, spread_home, total, status"
      )
      .order("season", { ascending: false })
      .order("week", { ascending: true })
      .order("kickoff_utc", { ascending: true });

    if (gamesResponse.error) throw gamesResponse.error;

    state.games = gamesResponse.data || [];

    fillUserSelect();
    fillSeasonSelect();
  }

  async function loadSelectedUserPicks() {
    state.picks = [];

    if (!state.selectedUserId) {
      render();
      return;
    }

    messageBox.textContent = "Loading picks…";
    tableBox.replaceChildren();

    const picksResponse = await client
      .from("picks")
      .select(
        "id, user_id, game_id, spread_pick, total_pick, spread_result, total_result, created_at, updated_at"
      )
      .eq("user_id", state.selectedUserId);

    if (picksResponse.error) throw picksResponse.error;

    state.picks = picksResponse.data || [];
    render();
  }

  function rowsInScope() {
    if (!state.selectedUserId || !state.selectedSeason) return [];

    const gamesById = new Map(state.games.map((game) => [game.id, game]));
    const season = Number(state.selectedSeason);
    const rows = [];

    for (const pick of state.picks) {
      const game = gamesById.get(pick.game_id);

      if (!game || game.season !== season) continue;

      if (
        state.selectedWeek !== "all" &&
        game.week !== Number(state.selectedWeek)
      ) {
        continue;
      }

      rows.push({ pick, game });
    }

    rows.sort((a, b) => {
      if (a.game.week !== b.game.week) return a.game.week - b.game.week;
      return new Date(a.game.kickoff_utc) - new Date(b.game.kickoff_utc);
    });

    return rows;
  }

  function renderTable(rows) {
    const table = createElement("table");
    const head = createElement("thead");
    const headRow = createElement("tr");

    for (const label of [
      "Week",
      "Matchup",
      "Spread Pick",
      "ATS",
      "Total Pick",
      "O/U"
    ]) {
      headRow.appendChild(createElement("th", "", label));
    }

    head.appendChild(headRow);

    const body = createElement("tbody");

    for (const row of rows) {
      const line = createElement("tr");
      const matchup = row.game.away_team + " @ " + row.game.home_team;

      line.appendChild(createElement("td", "", String(row.game.week)));
      line.appendChild(createElement("td", "", matchup));
      line.appendChild(
        createElement("td", "", spreadPickText(row.pick, row.game))
      );
      line.appendChild(
        createElement("td", "", resultText(row.pick.spread_result))
      );
      line.appendChild(
        createElement("td", "", totalPickText(row.pick, row.game))
      );
      line.appendChild(
        createElement("td", "", resultText(row.pick.total_result))
      );

      body.appendChild(line);
    }

    table.append(head, body);
    tableBox.replaceChildren(table);
  }

  function render() {
    const profile = selectedProfile();

    if (!profile) {
      scopeLabel.textContent = "Select a user";
      messageBox.textContent = "";
      tableBox.replaceChildren();
      return;
    }

    let label = profile.display_name || "(no name)";

    if (state.selectedSeason) label += " — " + state.selectedSeason;
    if (state.selectedWeek !== "all") {
      label += " — Week " + state.selectedWeek;
    }

    scopeLabel.textContent = label;

    const rows = rowsInScope();

    if (!rows.length) {
      messageBox.textContent = "No picks found for this selection.";
      tableBox.replaceChildren();
      return;
    }

    messageBox.textContent = "";
    renderTable(rows);
  }

  function attachEvents() {
    userSelect.addEventListener("change", async () => {
      state.selectedUserId = userSelect.value;

      try {
        await loadSelectedUserPicks();
      } catch (error) {
        console.error(error);
        messageBox.textContent = "Could not load picks: " + error.message;
        tableBox.replaceChildren();
      }
    });

    seasonSelect.addEventListener("change", () => {
      state.selectedSeason = seasonSelect.value;
      state.selectedWeek = "all";
      fillWeekSelect();
      render();
    });

    weekSelect.addEventListener("change", () => {
      state.selectedWeek = weekSelect.value;
      render();
    });
  }

  async function start() {
    assertReady();
    attachEvents();
    await loadInitialData();
    render();
  }

  start().catch((error) => {
    console.error(error);

    if (messageBox) {
      messageBox.textContent = "Could not load the page: " + error.message;
    }
  });
})();
