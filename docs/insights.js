"use strict";

(() => {
  const client = window.supabaseClient;

  const scopeLabel = document.getElementById("scopeLabel");
  const seasonButton = document.getElementById("scopeSeasonBtn");
  const lastWeekButton = document.getElementById("scopeLastWeekBtn");
  const weekButton = document.getElementById("scopeWeekBtn");
  const weekSelect = document.getElementById("weekSelect");
  const teamSelect = document.getElementById("teamSelect");
  const userSelect = document.getElementById("userSelect");
  const messageBox = document.getElementById("inMessage");

  const boxes = {
    ats: document.getElementById("atsByTeam"),
    fade: document.getElementById("fadeByTeam"),
    homeAway: document.getElementById("homeAway"),
    totalsTeam: document.getElementById("totalsByTeam"),
    totalsAll: document.getElementById("totalsOverall")
  };

  const state = {
    season: null,
    games: [],
    gamesById: new Map(),
    completedWeeks: [],
    profiles: [],
    profilesById: new Map(),
    picks: [],
    teams: [],
    scope: "season",
    chosenWeek: null,
    team: "",
    user: "all"
  };

  function assertReady() {
    const missing = [];

    if (!scopeLabel) missing.push("#scopeLabel");
    if (!seasonButton) missing.push("#scopeSeasonBtn");
    if (!lastWeekButton) missing.push("#scopeLastWeekBtn");
    if (!weekButton) missing.push("#scopeWeekBtn");
    if (!weekSelect) missing.push("#weekSelect");
    if (!teamSelect) missing.push("#teamSelect");
    if (!userSelect) missing.push("#userSelect");
    if (!messageBox) missing.push("#inMessage");
    if (!boxes.ats) missing.push("#atsByTeam");
    if (!boxes.fade) missing.push("#fadeByTeam");
    if (!boxes.homeAway) missing.push("#homeAway");
    if (!boxes.totalsTeam) missing.push("#totalsByTeam");
    if (!boxes.totalsAll) missing.push("#totalsOverall");

    if (missing.length) {
      throw new Error("Missing required page elements: " + missing.join(", "));
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

  function blank() {
    return { w: 0, l: 0, p: 0 };
  }

  function addResult(record, result) {
    if (result === "W") record.w += 1;
    else if (result === "L") record.l += 1;
    else if (result === "P") record.p += 1;
  }

  function games(record) {
    return record.w + record.l + record.p;
  }

  function winPct(record) {
    const decided = record.w + record.l;

    if (!decided) {
      return null;
    }

    return (record.w / decided) * 100;
  }

  function formatPct(value) {
    return value === null ? "—" : value.toFixed(1) + "%";
  }

  async function loadData() {
    const gamesResponse = await client
      .from("games")
      .select("id, season, week, home_team, away_team");

    if (gamesResponse.error) {
      throw gamesResponse.error;
    }

    const allGames = gamesResponse.data || [];

    if (!allGames.length) {
      state.season = null;
      return;
    }

    state.season = allGames.reduce(
      (highest, game) => (game.season > highest ? game.season : highest),
      allGames[0].season
    );

    state.games = allGames.filter((game) => game.season === state.season);
    state.gamesById = new Map(state.games.map((game) => [game.id, game]));

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

    const teamSet = new Set();

    for (const game of state.games) {
      teamSet.add(game.home_team);
      teamSet.add(game.away_team);
    }

    state.teams = [...teamSet].filter(Boolean).sort((a, b) => a.localeCompare(b));

    const profilesResponse = await client
      .from("profiles")
      .select("id, display_name, status")
      .eq("status", "active");

    if (profilesResponse.error) {
      throw profilesResponse.error;
    }

    state.profiles = (profilesResponse.data || []).sort((first, second) =>
      (first.display_name || "").localeCompare(second.display_name || "")
    );

    state.profilesById = new Map(
      state.profiles.map((profile) => [profile.id, profile])
    );

    const picksResponse = await client
      .from("picks")
      .select("user_id, game_id, spread_pick, total_pick, spread_result, total_result")
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

  function picksInScope() {
    const weeks = new Set(weeksInScope());

    const allowedGameIds = new Set(
      state.games
        .filter((game) => weeks.has(game.week))
        .map((game) => game.id)
    );

    return state.picks.filter((pick) => {
      if (!allowedGameIds.has(pick.game_id)) {
        return false;
      }

      if (state.user !== "all" && pick.user_id !== state.user) {
        return false;
      }

      if (!state.profilesById.has(pick.user_id)) {
        return false;
      }

      if (state.team) {
        const game = state.gamesById.get(pick.game_id);

        if (!game) {
          return false;
        }

        if (game.home_team !== state.team && game.away_team !== state.team) {
          return false;
        }
      }

      return true;
    });
  }

  function userName(userId) {
    const profile = state.profilesById.get(userId);
    return (profile && profile.display_name) || "(no name)";
  }

  function tally(picks, keyParts, resultOf) {
    const rows = new Map();

    for (const pick of picks) {
      const parts = keyParts(pick);

      if (!parts) {
        continue;
      }

      for (const part of parts) {
        const key = part.label + "\u0000" + pick.user_id;
        let row = rows.get(key);

        if (!row) {
          row = {
            label: part.label,
            userId: pick.user_id,
            record: blank()
          };

          rows.set(key, row);
        }

        addResult(row.record, resultOf(pick));
      }
    }

    return [...rows.values()]
      .filter((row) => games(row.record) > 0)
      .sort((first, second) => {
        if (second.record.w !== first.record.w) {
          return second.record.w - first.record.w;
        }

        if (first.label !== second.label) {
          return first.label.localeCompare(second.label);
        }

        return userName(first.userId).localeCompare(userName(second.userId));
      });
  }

  function renderTable(box, firstColumn, rows) {
    if (!rows.length) {
      box.replaceChildren(
        createElement("div", "lb-message", "Nothing to show.")
      );
      return;
    }

    const showUser = state.user === "all";

    const table = createElement("table");
    const head = createElement("thead");
    const headRow = createElement("tr");

    const labels = showUser
      ? [firstColumn, "Name", "W", "L", "P", "G", "Win %"]
      : [firstColumn, "W", "L", "P", "G", "Win %"];

    for (const label of labels) {
      headRow.appendChild(createElement("th", "", label));
    }

    head.appendChild(headRow);

    const body = createElement("tbody");

    for (const row of rows) {
      const line = createElement("tr");

      line.appendChild(createElement("td", "", row.label));

      if (showUser) {
        line.appendChild(createElement("td", "", userName(row.userId)));
      }

      line.appendChild(createElement("td", "", String(row.record.w)));
      line.appendChild(createElement("td", "", String(row.record.l)));
      line.appendChild(createElement("td", "", String(row.record.p)));
      line.appendChild(createElement("td", "", String(games(row.record))));
      line.appendChild(
        createElement("td", "", formatPct(winPct(row.record)))
      );

      body.appendChild(line);
    }

    table.append(head, body);

    box.replaceChildren(table);
  }

  function pickedTeam(pick) {
    const game = state.gamesById.get(pick.game_id);

    if (!game || !pick.spread_pick) {
      return null;
    }

    return pick.spread_pick === "home" ? game.home_team : game.away_team;
  }

  function fadedTeam(pick) {
    const game = state.gamesById.get(pick.game_id);

    if (!game || !pick.spread_pick) {
      return null;
    }

    return pick.spread_pick === "home" ? game.away_team : game.home_team;
  }

  function renderTables() {
    const picks = picksInScope();

    const spreadResult = (pick) => pick.spread_result;
    const totalResult = (pick) => pick.total_result;

    renderTable(
      boxes.ats,
      "Team",
      tally(
        picks,
        (pick) => {
          const team = pickedTeam(pick);
          return team ? [{ label: team }] : null;
        },
        spreadResult
      )
    );

    renderTable(
      boxes.fade,
      "Opponent",
      tally(
        picks,
        (pick) => {
          const team = fadedTeam(pick);
          return team ? [{ label: team }] : null;
        },
        spreadResult
      )
    );

    renderTable(
      boxes.homeAway,
      "Side",
      tally(
        picks,
        (pick) => {
          if (!pick.spread_pick) {
            return null;
          }

          return [{ label: pick.spread_pick === "home" ? "Home" : "Away" }];
        },
        spreadResult
      )
    );

    renderTable(
      boxes.totalsTeam,
      "Team",
      tally(
        picks,
        (pick) => {
          const game = state.gamesById.get(pick.game_id);

          if (!game || !pick.total_pick) {
            return null;
          }

          const side = pick.total_pick === "over" ? "Over" : "Under";

          return [
            { label: game.away_team + " — " + side },
            { label: game.home_team + " — " + side }
          ];
        },
        totalResult
      )
    );

    renderTable(
      boxes.totalsAll,
      "Side",
      tally(
        picks,
        (pick) => {
          if (!pick.total_pick) {
            return null;
          }

          return [{ label: pick.total_pick === "over" ? "Over" : "Under" }];
        },
        totalResult
      )
    );
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

  function fillTeamSelect() {
    teamSelect.replaceChildren();

    const all = document.createElement("option");
    all.value = "";
    all.textContent = "All Teams";
    teamSelect.appendChild(all);

    for (const team of state.teams) {
      const option = document.createElement("option");
      option.value = team;
      option.textContent = team;
      teamSelect.appendChild(option);
    }

    teamSelect.value = state.team;
  }

  function fillUserSelect() {
    userSelect.replaceChildren();

    const all = document.createElement("option");
    all.value = "all";
    all.textContent = "All Users";
    userSelect.appendChild(all);

    for (const profile of state.profiles) {
      const option = document.createElement("option");
      option.value = profile.id;
      option.textContent = profile.display_name || "(no name)";
      userSelect.appendChild(option);
    }

    userSelect.value = state.user;
  }

  function render() {
    renderControls();

    scopeLabel.textContent = scopeText();

    if (!state.season) {
      messageBox.textContent = "No games found.";
      Object.values(boxes).forEach((box) => box.replaceChildren());
      return;
    }

    if (!state.completedWeeks.length) {
      messageBox.textContent =
        "No completed weeks yet. A week counts as completed once every game in it has a final score.";
      Object.values(boxes).forEach((box) => box.replaceChildren());
      return;
    }

    messageBox.textContent = "";

    renderTables();
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

    teamSelect.addEventListener("change", () => {
      state.team = teamSelect.value;
      render();
    });

    userSelect.addEventListener("change", () => {
      state.user = userSelect.value;
      render();
    });
  }

  async function start() {
    assertReady();
    attachEvents();

    await loadData();

    fillWeekSelect();
    fillTeamSelect();
    fillUserSelect();
    render();
  }

  start().catch((error) => {
    console.error(error);

    if (messageBox) {
      messageBox.textContent = "Could not load insights: " + error.message;
    }
  });
})();
