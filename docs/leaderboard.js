"use strict";

(() => {
  const client = window.supabaseClient;

  const scopeLabel = document.getElementById("scopeLabel");
  const seasonButton = document.getElementById("scopeSeasonBtn");
  const lastWeekButton = document.getElementById("scopeLastWeekBtn");
  const weekButton = document.getElementById("scopeWeekBtn");
  const weekSelect = document.getElementById("weekSelect");
  const messageBox = document.getElementById("lbMessage");
  const tableBox = document.getElementById("lbTable");

  const state = {
    season: null,
    games: [],
    completedWeeks: [],
    profiles: [],
    picks: [],
    scope: "season",
    chosenWeek: null
  };

  function assertReady() {
    const missing = [];

    if (!scopeLabel) missing.push("#scopeLabel");
    if (!seasonButton) missing.push("#scopeSeasonBtn");
    if (!lastWeekButton) missing.push("#scopeLastWeekBtn");
    if (!weekButton) missing.push("#scopeWeekBtn");
    if (!weekSelect) missing.push("#weekSelect");
    if (!messageBox) missing.push("#lbMessage");
    if (!tableBox) missing.push("#lbTable");

    if (missing.length) {
      throw new Error(
        "Missing required page elements: " + missing.join(", ")
      );
    }

    if (!client || typeof client.from !== "function") {
      throw new Error("Supabase client is not available.");
    }
  }

  function createElement(tagName, className = "", text = "") {
    const element = document.createElement(tagName);

    if (className) {
      element.className = className;
    }

    if (text !== "") {
      element.textContent = text;
    }

    return element;
  }

  async function loadData() {
    const gamesResponse = await client
      .from("games")
      .select("id, season, week");

    if (gamesResponse.error) {
      throw gamesResponse.error;
    }

    const allGames = gamesResponse.data || [];

    if (!allGames.length) {
      state.season = null;
      state.games = [];
      state.completedWeeks = [];
      state.profiles = [];
      state.picks = [];
      return;
    }

    state.season = allGames.reduce(
      (highest, game) => (game.season > highest ? game.season : highest),
      allGames[0].season
    );

    state.games = allGames.filter((game) => game.season === state.season);

    const gameIds = state.games.map((game) => game.id);

    const scoresResponse = await client
      .from("scores")
      .select("game_id")
      .in("game_id", gameIds);

    if (scoresResponse.error) {
      throw scoresResponse.error;
    }

    const scoredGameIds = new Set(
      (scoresResponse.data || []).map((row) => row.game_id)
    );

    const weekTotals = new Map();

    for (const game of state.games) {
      const counts = weekTotals.get(game.week) || { total: 0, scored: 0 };
      counts.total += 1;

      if (scoredGameIds.has(game.id)) {
        counts.scored += 1;
      }

      weekTotals.set(game.week, counts);
    }

    state.completedWeeks = [...weekTotals.entries()]
      .filter(([, counts]) => counts.total > 0 && counts.total === counts.scored)
      .map(([week]) => week)
      .sort((first, second) => first - second);

    const profilesResponse = await client
      .from("profiles")
      .select("id, display_name, profile_image, status")
      .eq("status", "active");

    if (profilesResponse.error) {
      throw profilesResponse.error;
    }

    state.profiles = profilesResponse.data || [];

    const picksResponse = await client
      .from("picks")
      .select("user_id, game_id, spread_result, total_result")
      .in("game_id", gameIds);

    if (picksResponse.error) {
      throw picksResponse.error;
    }

    state.picks = picksResponse.data || [];
  }

  function weeksInScope() {
    if (state.scope === "season") {
      return state.completedWeeks;
    }

    if (state.scope === "lastweek") {
      const last = state.completedWeeks[state.completedWeeks.length - 1];
      return last === undefined ? [] : [last];
    }

    return state.chosenWeek === null ? [] : [state.chosenWeek];
  }

  function scopeText() {
    if (!state.season) {
      return "";
    }

    const weeks = weeksInScope();

    if (state.scope === "season") {
      return state.season + " Season";
    }

    if (!weeks.length) {
      return state.season + " — no completed week";
    }

    return state.season + " — Week " + weeks[0];
  }

  function buildRows() {
    const weeks = new Set(weeksInScope());

    const gameIdsInScope = new Set(
      state.games
        .filter((game) => weeks.has(game.week))
        .map((game) => game.id)
    );

    const totals = new Map();

    for (const profile of state.profiles) {
      totals.set(profile.id, {
        profile,
        spread: { w: 0, l: 0, p: 0 },
        total: { w: 0, l: 0, p: 0 }
      });
    }

    for (const pick of state.picks) {
      if (!gameIdsInScope.has(pick.game_id)) {
        continue;
      }

      const row = totals.get(pick.user_id);

      if (!row) {
        continue;
      }

      if (pick.spread_result === "W") row.spread.w += 1;
      else if (pick.spread_result === "L") row.spread.l += 1;
      else if (pick.spread_result === "P") row.spread.p += 1;

      if (pick.total_result === "W") row.total.w += 1;
      else if (pick.total_result === "L") row.total.l += 1;
      else if (pick.total_result === "P") row.total.p += 1;
    }

    const rows = [...totals.values()].map((row) => {
      const combined = {
        w: row.spread.w + row.total.w,
        l: row.spread.l + row.total.l,
        p: row.spread.p + row.total.p
      };

      return { ...row, combined };
    });

    rows.sort((first, second) => {
      if (second.combined.w !== first.combined.w) {
        return second.combined.w - first.combined.w;
      }

      return (first.profile.display_name || "").localeCompare(
        second.profile.display_name || ""
      );
    });

    return rows;
  }

  function formatRecord(record) {
    return record.w + "-" + record.l + "-" + record.p;
  }

  function imagePath(profile) {
    const file = profile.profile_image;

    if (!file) {
      return null;
    }

    if (file.includes("/")) {
      return file;
    }

    return "assets/profile_image/" + file;
  }

  function nameCell(profile) {
    const cell = createElement("td");
    const holder = createElement("div", "lb-name");
    const source = imagePath(profile);

    if (source) {
      const image = createElement("img", "lb-avatar");
      image.src = source;
      image.alt = "";
      holder.appendChild(image);
    } else {
      holder.appendChild(createElement("span", "lb-avatar lb-avatar-empty"));
    }

    holder.appendChild(
      createElement("span", "", profile.display_name || "(no name)")
    );

    cell.appendChild(holder);

    return cell;
  }

  function renderTable(rows) {
    const table = createElement("table");
    const head = createElement("thead");
    const headRow = createElement("tr");

    for (const label of ["#", "Name", "ATS", "O/U", "Total"]) {
      headRow.appendChild(createElement("th", "", label));
    }

    head.appendChild(headRow);

    const body = createElement("tbody");

    rows.forEach((row, index) => {
      const line = createElement("tr");

      line.appendChild(createElement("td", "", String(index + 1)));
      line.appendChild(nameCell(row.profile));
      line.appendChild(createElement("td", "", formatRecord(row.spread)));
      line.appendChild(createElement("td", "", formatRecord(row.total)));
      line.appendChild(createElement("td", "", formatRecord(row.combined)));

      body.appendChild(line);
    });

    table.append(head, body);

    tableBox.replaceChildren(table);
  }

  function renderControls() {
    for (const button of [seasonButton, lastWeekButton, weekButton]) {
      button.classList.remove("primary");
    }

    if (state.scope === "season") {
      seasonButton.classList.add("primary");
    } else if (state.scope === "lastweek") {
      lastWeekButton.classList.add("primary");
    } else {
      weekButton.classList.add("primary");
    }

    const last = state.completedWeeks[state.completedWeeks.length - 1];

    lastWeekButton.textContent =
      last === undefined ? "Last Week" : "Last Week (Week " + last + ")";

    lastWeekButton.disabled = last === undefined;
    weekButton.disabled = !state.completedWeeks.length;

    weekSelect.hidden = state.scope !== "week";
  }

  function fillWeekSelect() {
    weekSelect.replaceChildren();

    for (const week of state.completedWeeks) {
      const option = document.createElement("option");
      option.value = String(week);
      option.textContent = "Week " + week;
      weekSelect.appendChild(option);
    }

    if (state.chosenWeek !== null) {
      weekSelect.value = String(state.chosenWeek);
    }
  }

  function render() {
    renderControls();

    scopeLabel.textContent = scopeText();

    if (!state.season) {
      messageBox.textContent = "No games found.";
      tableBox.replaceChildren();
      return;
    }

    if (!state.completedWeeks.length) {
      messageBox.textContent =
        "No completed weeks yet. A week counts as completed once every game in it has a final score.";
      tableBox.replaceChildren();
      return;
    }

    if (!state.profiles.length) {
      messageBox.textContent = "No active accounts to show.";
      tableBox.replaceChildren();
      return;
    }

    messageBox.textContent = "";

    renderTable(buildRows());
  }

  function attachEvents() {
    seasonButton.addEventListener("click", () => {
      state.scope = "season";
      render();
    });

    lastWeekButton.addEventListener("click", () => {
      state.scope = "lastweek";
      render();
    });

    weekButton.addEventListener("click", () => {
      state.scope = "week";

      if (state.chosenWeek === null && state.completedWeeks.length) {
        state.chosenWeek =
          state.completedWeeks[state.completedWeeks.length - 1];
      }

      fillWeekSelect();
      render();
    });

    weekSelect.addEventListener("change", () => {
      state.chosenWeek = Number(weekSelect.value);
      render();
    });
  }

  async function start() {
    assertReady();
    attachEvents();

    await loadData();

    fillWeekSelect();
    render();
  }

  start().catch((error) => {
    console.error(error);

    if (messageBox) {
      messageBox.textContent = "Could not load the leaderboard: " + error.message;
    }
  });
})();
