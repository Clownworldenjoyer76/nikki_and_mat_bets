"use strict";

(() => {
  const client = window.supabaseClient;
  const CSV_URL = "./data/weekly/latest.csv";

  const REQUIRED_HEADERS = [
    "season",
    "week",
    "game_id",
    "commence_time_utc",
    "home_team",
    "away_team",
    "spread_home",
    "spread_away",
    "total",
    "total_over",
    "total_under",
    "is_consensus"
  ];

  const state = {
    session: null,
    profile: null,
    schedule: [],
    originalPicks: {},
    draftPicks: {},
    saving: false
  };

  const gamesContainer = document.getElementById("games");
  const seasonWeekElement = document.getElementById("seasonWeek");
  const pageTitleElement = document.getElementById("pageTitle");
  const clearButton = document.getElementById("clearBtn");
  const submitButton = document.getElementById("issueBtn");
  const actionBar = document.getElementById("actionbar");

  function assertReady() {
    const missing = [];

    if (!gamesContainer) missing.push("#games");
    if (!seasonWeekElement) missing.push("#seasonWeek");
    if (!pageTitleElement) missing.push("#pageTitle");
    if (!clearButton) missing.push("#clearBtn");
    if (!submitButton) missing.push("#issueBtn");

    if (missing.length) {
      throw new Error(
        `Missing required page element${
          missing.length === 1 ? "" : "s"
        }: ${missing.join(", ")}`
      );
    }

    if (!client?.auth || typeof client.from !== "function") {
      throw new Error("Supabase client is not available.");
    }
  }

  function parseCSV(text) {
    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;

    for (let index = 0; index < text.length; index += 1) {
      const character = text[index];

      if (quoted) {
        if (character === '"') {
          if (text[index + 1] === '"') {
            field += '"';
            index += 1;
          } else {
            quoted = false;
          }
        } else {
          field += character;
        }
        continue;
      }

      if (character === '"') {
        quoted = true;
      } else if (character === ",") {
        row.push(field);
        field = "";
      } else if (character === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else if (character !== "\r") {
        field += character;
      }
    }

    if (quoted) {
      throw new Error("latest.csv contains an unterminated quoted field.");
    }

    if (field.length || row.length) {
      row.push(field);
      rows.push(row);
    }

    if (!rows.length) {
      throw new Error("latest.csv is empty.");
    }

    const headers = rows.shift().map((value) => value.trim());

    if (new Set(headers).size !== headers.length) {
      throw new Error("latest.csv contains duplicate headers.");
    }

    return rows
      .filter((values) => values.some((value) => value !== ""))
      .map((values, rowIndex) => {
        if (values.length !== headers.length) {
          throw new Error(
            `latest.csv row ${rowIndex + 2} has ${values.length} fields; expected ${headers.length}.`
          );
        }

        return Object.fromEntries(
          headers.map((header, columnIndex) => [
            header,
            values[columnIndex].trim()
          ])
        );
      });
  }

  function validateScheduleRows(rows) {
    if (!rows.length) {
      throw new Error("latest.csv contains no data rows.");
    }

    const headers = Object.keys(rows[0]);

    const missingHeaders = REQUIRED_HEADERS.filter(
      (header) => !headers.includes(header)
    );

    if (missingHeaders.length) {
      throw new Error(
        `latest.csv is missing required header${
          missingHeaders.length === 1 ? "" : "s"
        }: ${missingHeaders.join(", ")}`
      );
    }

    const consensusRows = rows.filter((row) => row.is_consensus === "1");

    if (!consensusRows.length) {
      throw new Error("latest.csv contains no consensus rows.");
    }

    const seenGameIds = new Set();

    const schedule = consensusRows.map((row, index) => {
      const rowNumber = index + 2;
      const season = Number(row.season);
      const week = Number(row.week);
      const kickoff = new Date(row.commence_time_utc);

      if (!Number.isInteger(season)) {
        throw new Error(`latest.csv row ${rowNumber} has an invalid season.`);
      }

      if (!Number.isInteger(week) || week < 1 || week > 22) {
        throw new Error(`latest.csv row ${rowNumber} has an invalid week.`);
      }

      if (!row.game_id) {
        throw new Error(`latest.csv row ${rowNumber} has a blank game_id.`);
      }

      if (seenGameIds.has(row.game_id)) {
        throw new Error(
          `latest.csv contains duplicate consensus game_id: ${row.game_id}`
        );
      }

      seenGameIds.add(row.game_id);

      if (!row.home_team || !row.away_team) {
        throw new Error(`latest.csv row ${rowNumber} has a blank team name.`);
      }

      if (row.home_team === row.away_team) {
        throw new Error(
          `latest.csv row ${rowNumber} has the same home and away team.`
        );
      }

      if (Number.isNaN(kickoff.getTime())) {
        throw new Error(
          `latest.csv row ${rowNumber} has an invalid commence_time_utc.`
        );
      }

      for (const column of [
        "spread_home",
        "spread_away",
        "total",
        "total_over",
        "total_under"
      ]) {
        if (row[column] === "" || Number.isNaN(Number(row[column]))) {
          throw new Error(
            `latest.csv row ${rowNumber} has an invalid ${column}.`
          );
        }
      }

      return {
        csvGameId: row.game_id,
        season,
        week,
        kickoffUtc: kickoff.toISOString(),
        homeTeam: row.home_team,
        awayTeam: row.away_team,
        spreadHome: row.spread_home,
        spreadAway: row.spread_away,
        total: row.total,
        totalOver: row.total_over,
        totalUnder: row.total_under,
        game: null
      };
    });

    const { season, week } = schedule[0];

    if (
      schedule.some((game) => game.season !== season || game.week !== week)
    ) {
      throw new Error(
        "latest.csv consensus rows contain more than one season or week."
      );
    }

    return schedule;
  }

  async function loadSchedule() {
    const response = await fetch(`${CSV_URL}?v=${Date.now()}`, {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`Could not load ${CSV_URL}: HTTP ${response.status}`);
    }

    const text = await response.text();

    state.schedule = validateScheduleRows(parseCSV(text));

    seasonWeekElement.textContent = `NFL Week ${state.schedule[0].week}`;
  }

  async function loadAndMatchGames() {
    const csvGameIds = state.schedule.map((item) => item.csvGameId);

    const { data, error } = await client
      .from("games")
      .select("id, game_id, kickoff_utc")
      .in("game_id", csvGameIds);

    if (error) {
      throw error;
    }

    const gamesByGameId = new Map();

    for (const game of data || []) {
      if (gamesByGameId.has(game.game_id)) {
        throw new Error(
          `Supabase contains duplicate games.game_id: ${game.game_id}`
        );
      }

      gamesByGameId.set(game.game_id, game);
    }

    state.schedule = state.schedule.map((item) => ({
      ...item,
      game: gamesByGameId.get(item.csvGameId) || null
    }));
  }

  async function loadSessionAndProfile() {
    const {
      data: { session },
      error: sessionError
    } = await client.auth.getSession();

    if (sessionError) {
      throw sessionError;
    }

    state.session = session;
    state.profile = null;

    if (!session?.user) {
      return;
    }

    const { data, error } = await client
      .from("profiles")
      .select("id, display_name, role, status")
      .eq("id", session.user.id)
      .single();

    if (error) {
      throw error;
    }

    state.profile = data;
  }

  function updateTitle() {
    const name = state.profile?.display_name;

    pageTitleElement.textContent = name
      ? `${name} NFL Picks`
      : "NFL Picks";
  }

  function blankPick() {
    return { spread: null, total: null };
  }

  function normalizePick(pick) {
    if (!pick) {
      return blankPick();
    }

    return {
      spread: pick.spread ?? null,
      total: pick.total ?? null
    };
  }

  function clonePickMap(picks) {
    return Object.fromEntries(
      Object.entries(picks || {}).map(([gameId, pick]) => [
        gameId,
        normalizePick(pick)
      ])
    );
  }

  async function loadExistingPicks() {
    state.originalPicks = {};
    state.draftPicks = {};

    if (!state.session?.user) {
      return;
    }

    const gameIds = state.schedule
      .map((item) => item.game?.id)
      .filter(Boolean);

    if (!gameIds.length) {
      return;
    }

    const { data, error } = await client
      .from("picks")
      .select("game_id, spread_pick, total_pick")
      .eq("user_id", state.session.user.id)
      .in("game_id", gameIds);

    if (error) {
      throw error;
    }

    for (const pick of data || []) {
      state.originalPicks[pick.game_id] = {
        spread: pick.spread_pick,
        total: pick.total_pick
      };
    }

    state.draftPicks = clonePickMap(state.originalPicks);
  }

  function isMaster() {
    return state.profile?.role === "master";
  }

  function canEdit(scheduleGame) {
    if (!state.session?.user) {
      return { allowed: false, reason: "Log in before making picks." };
    }

    if (!state.profile) {
      return {
        allowed: false,
        reason: "The signed-in profile is unavailable."
      };
    }

    if (state.profile.status !== "active") {
      return { allowed: false, reason: "This account is not active." };
    }

    if (!scheduleGame.game) {
      return {
        allowed: false,
        reason:
          "This CSV game does not exactly match a Supabase games row."
      };
    }

    if (isMaster()) {
      return { allowed: true, reason: "" };
    }

    const kickoffTime = new Date(scheduleGame.game.kickoff_utc).getTime();

    if (Date.now() >= kickoffTime) {
      return { allowed: false, reason: "This game has started." };
    }

    return { allowed: true, reason: "" };
  }

  function picksEqual(firstPick, secondPick) {
    const first = normalizePick(firstPick);
    const second = normalizePick(secondPick);

    return first.spread === second.spread && first.total === second.total;
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

  function formatDate(iso) {
    return new Date(iso).toLocaleString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true
    });
  }

  function logoPath(team) {
    const cleaned = team
      .replace(/[^A-Za-z0-9 ]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const parts = cleaned.split(" ");
    const nickname = parts[parts.length - 1].toLowerCase();

    return `assets/logos/${nickname}.png`;
  }

  function markActive(button) {
    button.style.backgroundColor = "#39ff14";
    button.style.backgroundImage = "none";
    button.style.borderColor = "#39ff14";
    button.style.color = "#000";
    button.style.boxShadow = "0 0 14px rgba(57, 255, 20, 0.8)";
    button.style.transform = "translateY(-2px)";
  }

  function createPickButton({ label, type, value, scheduleGame, currentPick }) {
    const button = createElement("button", "pickbtn", label);
    const permission = canEdit(scheduleGame);

    button.type = "button";
    button.dataset.type = type;
    button.dataset.side = value;
    button.disabled = state.saving || !permission.allowed;
    button.title = permission.reason;

    if (
      (type === "spread" && currentPick.spread === value) ||
      (type === "total" && currentPick.total === value)
    ) {
      button.classList.add("active");
      markActive(button);
    }

    button.addEventListener("click", () => {
      const latestPermission = canEdit(scheduleGame);

      if (!latestPermission.allowed) {
        alert(latestPermission.reason);
        return;
      }

      const gameId = scheduleGame.game.id;
      const current = normalizePick(state.draftPicks[gameId]);

      if (type === "spread") {
        current.spread = current.spread === value ? null : value;
      } else {
        current.total = current.total === value ? null : value;
      }

      if (current.spread === null && current.total === null) {
        delete state.draftPicks[gameId];
      } else {
        state.draftPicks[gameId] = current;
      }

      render();
    });

    return button;
  }

  function createGameCard(scheduleGame) {
    const card = createElement("article", "card");
    const matchup = createElement("div", "matchgrid");

    const awayLogo = createElement("img", "team-logo");
    awayLogo.src = logoPath(scheduleGame.awayTeam);
    awayLogo.alt = `${scheduleGame.awayTeam} logo`;

    const matchupText = createElement("div", "matchtext");

    matchupText.append(
      createElement("div", "team", scheduleGame.awayTeam),
      createElement("div", "at", "@"),
      createElement("div", "team", scheduleGame.homeTeam)
    );

    const homeLogo = createElement("img", "team-logo right");
    homeLogo.src = logoPath(scheduleGame.homeTeam);
    homeLogo.alt = `${scheduleGame.homeTeam} logo`;

    matchup.append(awayLogo, matchupText, homeLogo);

    const when = createElement(
      "div",
      "when",
      formatDate(scheduleGame.kickoffUtc)
    );

    when.style.textAlign = "center";
    when.style.marginTop = "6px";

    card.append(matchup, when);

    if (!scheduleGame.game) {
      const warning = createElement(
        "div",
        "when",
        "No exact matching Supabase game. Picks cannot be saved for this game."
      );

      warning.style.textAlign = "center";
      warning.style.marginTop = "8px";

      card.appendChild(warning);
    }

    const grid = createElement("div", "pick-grid");
    grid.style.display = "grid";
    grid.style.gridTemplateColumns = "1fr 1fr";
    grid.style.columnGap = "8px";
    grid.style.rowGap = "8px";
    grid.style.marginTop = "10px";

    const currentPick = scheduleGame.game
      ? normalizePick(state.draftPicks[scheduleGame.game.id])
      : blankPick();

    grid.append(
      createPickButton({
        label: `${scheduleGame.awayTeam} ${scheduleGame.spreadAway}`,
        type: "spread",
        value: "away",
        scheduleGame,
        currentPick
      }),
      createPickButton({
        label: `Over ${scheduleGame.totalOver}`,
        type: "total",
        value: "over",
        scheduleGame,
        currentPick
      }),
      createPickButton({
        label: `${scheduleGame.homeTeam} ${scheduleGame.spreadHome}`,
        type: "spread",
        value: "home",
        scheduleGame,
        currentPick
      }),
      createPickButton({
        label: `Under ${scheduleGame.totalUnder}`,
        type: "total",
        value: "under",
        scheduleGame,
        currentPick
      })
    );

    card.appendChild(grid);

    return card;
  }

  function createDivider() {
    return createElement("div", "neon-divider");
  }

  function updateButtons() {
    clearButton.disabled = state.saving;
    submitButton.disabled = state.saving;

    submitButton.textContent = state.saving ? "Saving…" : "Submit Picks";
  }

  function renderSignedOut() {
    if (actionBar) {
      actionBar.hidden = true;
    }

    const panel = createElement("section", "signin-panel");
    panel.style.textAlign = "center";
    panel.style.margin = "24px auto";
    panel.style.maxWidth = "460px";
    panel.style.padding = "28px 20px";
    panel.style.border = "1px solid rgba(57,255,20,.35)";
    panel.style.borderRadius = "14px";
    panel.style.background = "#0d0d0d";
    panel.style.boxShadow = "0 0 24px rgba(57,255,20,.14)";

    const heading = createElement("h2", "", "Sign in to make picks");
    heading.style.color = "#39ff14";
    heading.style.letterSpacing = "2px";
    heading.style.textTransform = "uppercase";
    heading.style.fontSize = "1.1rem";
    heading.style.margin = "0 0 14px";
    heading.style.textShadow = "0 0 8px #39ff14";

    const body = createElement(
      "p",
      "",
      "You need an account to select and submit picks."
    );

    body.style.color = "#bbb";
    body.style.margin = "0 0 20px";

    const link = createElement("a", "btn primary", "Go to sign in");
    link.href = "./auth.html";
    link.style.display = "inline-block";
    link.style.textDecoration = "none";

    panel.append(heading, body, link);

    gamesContainer.replaceChildren(panel);
  }

  function render() {
    if (!state.session?.user) {
      renderSignedOut();
      return;
    }

    if (actionBar) {
      actionBar.hidden = false;
    }

    gamesContainer.replaceChildren();

    state.schedule.forEach((scheduleGame, index) => {
      gamesContainer.appendChild(createGameCard(scheduleGame));

      if (index < state.schedule.length - 1) {
        gamesContainer.appendChild(createDivider());
      }
    });

    updateButtons();
  }

  function collectChanges() {
    const upserts = [];
    const deletes = [];

    for (const scheduleGame of state.schedule) {
      if (!scheduleGame.game) {
        continue;
      }

      const gameId = scheduleGame.game.id;
      const original = state.originalPicks[gameId] || null;
      const draft = state.draftPicks[gameId] || null;

      if (picksEqual(original, draft)) {
        continue;
      }

      const permission = canEdit(scheduleGame);

      if (!permission.allowed) {
        throw new Error(
          `${scheduleGame.awayTeam} at ${scheduleGame.homeTeam}: ${permission.reason}`
        );
      }

      if (draft && (!draft.spread || !draft.total)) {
        throw new Error(
          `Select both spread and total for ${scheduleGame.awayTeam} at ${scheduleGame.homeTeam}.`
        );
      }

      if (!draft && original) {
        deletes.push({ gameId });
      } else if (draft) {
        upserts.push({
          user_id: state.session.user.id,
          game_id: gameId,
          spread_pick: draft.spread,
          total_pick: draft.total
        });
      }
    }

    return { upserts, deletes };
  }

  async function submitPicks() {
    if (state.saving) {
      return;
    }

    const { upserts, deletes } = collectChanges();

    if (!upserts.length && !deletes.length) {
      alert("No pick changes to save.");
      return;
    }

    state.saving = true;
    updateButtons();

    try {
      if (upserts.length) {
        const { error } = await client
          .from("picks")
          .upsert(upserts, { onConflict: "user_id,game_id" });

        if (error) {
          throw error;
        }
      }

      for (const deletion of deletes) {
        const { error } = await client
          .from("picks")
          .delete()
          .eq("user_id", state.session.user.id)
          .eq("game_id", deletion.gameId);

        if (error) {
          throw error;
        }
      }

      await loadExistingPicks();

      alert("Picks saved.");
    } catch (error) {
      try {
        await loadExistingPicks();
      } catch (reloadError) {
        console.error(reloadError);
      }

      throw error;
    } finally {
      state.saving = false;
      render();
    }
  }

  function clearEditablePicks() {
    let changed = false;

    for (const scheduleGame of state.schedule) {
      if (!scheduleGame.game || !canEdit(scheduleGame).allowed) {
        continue;
      }

      const gameId = scheduleGame.game.id;

      if (state.draftPicks[gameId]) {
        delete state.draftPicks[gameId];
        changed = true;
      }
    }

    render();

    alert(
      changed
        ? "Editable picks cleared. Click Submit Picks to save the deletions."
        : "No editable picks were selected."
    );
  }

  async function loadPage() {
    await loadSessionAndProfile();

    updateTitle();

    if (!state.session?.user) {
      seasonWeekElement.textContent = "";
      renderSignedOut();
      return;
    }

    await loadSchedule();
    await loadAndMatchGames();
    await loadExistingPicks();

    render();
  }

  function reportError(prefix, error) {
    console.error(error);
    alert(`${prefix}: ${error.message}`);
  }

  async function start() {
    assertReady();

    clearButton.addEventListener("click", () => {
      if (!state.saving) {
        clearEditablePicks();
      }
    });

    submitButton.addEventListener("click", () => {
      submitPicks().catch((error) => {
        reportError("Could not save picks", error);
      });
    });

    client.auth.onAuthStateChange((event) => {
      if (!["SIGNED_IN", "SIGNED_OUT", "USER_UPDATED"].includes(event)) {
        return;
      }

      setTimeout(() => {
        loadPage().catch((error) => {
          reportError("Could not reload the Picks page", error);
        });
      }, 0);
    });

    await loadPage();
  }

  start().catch((error) => {
    reportError("Could not load the Picks page", error);
  });
})();
