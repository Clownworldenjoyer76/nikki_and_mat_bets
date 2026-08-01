// docs/apps.js
// Supabase-backed weekly pick entry.

const client = window.supabaseClient;

// ---------- CONFIG ----------
const PRIMARY_CSV = "docs/data/weekly/latest.csv";
const CSV_CANDIDATES = [
  PRIMARY_CSV,
  "/nikki_and_mat_bets/docs/data/weekly/latest.csv",
  "data/weekly/latest.csv"
];

const PICKER_KEYS = ["mat", "nikki"];

const PICKER_LABELS = {
  mat: "Mat",
  nikki: "Nikki"
};

// ---------- STATE ----------
const state = {
  session: null,
  currentProfile: null,
  isMaster: false,

  profilesByPicker: {
    mat: null,
    nikki: null
  },

  scheduleHeader: [],
  scheduleRows: [],
  renderedGames: [],

  season: "",
  week: "",

  originalPicks: {
    mat: {},
    nikki: {}
  },

  draftPicks: {
    mat: {},
    nikki: {}
  }
};

// ---------- GENERAL HELPERS ----------
function normalizeTeamName(name) {
  if (name === "Washington Commanders") {
    return "Washington Redskins";
  }

  return name;
}

function canonicalTeamName(name) {
  const value = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

  if (
    value === "washington redskins" ||
    value === "washington commanders"
  ) {
    return "washington commanders";
  }

  return value;
}

async function fetchFirstAvailable(urls) {
  for (const path of urls) {
    const separator = path.includes("?") ? "&" : "?";
    const url = `${path}${separator}v=${Date.now()}`;

    try {
      const response = await fetch(url, {
        cache: "no-store"
      });

      if (response.ok) {
        return {
          txt: await response.text(),
          used: path
        };
      }
    } catch (_error) {
      // Try the next path.
    }
  }

  throw new Error(
    "Schedule CSV not found at: " + urls.join(" | ")
  );
}

function parseCSV(text) {
  const rows = text
    .trim()
    .split(/\r?\n/)
    .map(line =>
      line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
    );

  const header = rows.shift() || [];

  return {
    hdr: header.map(value =>
      value.replace(/^"|"$/g, "").trim()
    ),

    rows: rows.map(row =>
      row.map(value =>
        value.replace(/^"|"$/g, "").trim()
      )
    )
  };
}

function onlyConsensus(rows, header) {
  const bookIndex = header.indexOf("book");
  const consensusIndex =
    header.indexOf("is_consensus");

  return rows.filter(row => {
    const markedConsensus =
      consensusIndex !== -1 &&
      String(row[consensusIndex]).trim() === "1";

    const consensusBook =
      bookIndex !== -1 &&
      String(row[bookIndex])
        .trim()
        .toUpperCase() === "CONSENSUS";

    return markedConsensus || consensusBook;
  });
}

function cell(header, row, columnName) {
  const index = header.indexOf(columnName);

  if (index === -1) {
    return "";
  }

  return String(row[index] ?? "").trim();
}

function fmtDate(iso) {
  const date = new Date(iso);

  return date.toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  });
}

function nflWeekLabel(csvWeek) {
  const base = 36;

  return (
    ((parseInt(csvWeek, 10) - base) % 18 + 18) % 18 + 1
  );
}

function fmtSigned(number) {
  if (
    number === "" ||
    number === null ||
    number === undefined
  ) {
    return "";
  }

  const value = Number(number);

  if (Number.isNaN(value)) {
    return String(number);
  }

  return value > 0 ? `+${value}` : `${value}`;
}

function logoPath(team) {
  const cleaned = team
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const parts = cleaned.split(" ");
  const nickname =
    parts[parts.length - 1].toLowerCase();

  return `assets/logos/${nickname}.png`;
}

// ---------- PICK HELPERS ----------
function emptyPick() {
  return {
    spread: null,
    total: null
  };
}

function normalizePick(pick) {
  if (!pick || typeof pick !== "object") {
    return emptyPick();
  }

  return {
    spread: pick.spread ?? null,
    total: pick.total ?? null
  };
}

function copyPickMap(source) {
  const result = {};

  for (
    const [gameId, pick]
    of Object.entries(source || {})
  ) {
    result[gameId] = normalizePick(pick);
  }

  return result;
}

function picksEqual(left, right) {
  const first = normalizePick(left);
  const second = normalizePick(right);

  return (
    first.spread === second.spread &&
    first.total === second.total
  );
}

function isCompletePick(pick) {
  const normalized = normalizePick(pick);

  return Boolean(
    normalized.spread &&
    normalized.total
  );
}

function isKickoffInFuture(game) {
  const kickoff =
    new Date(game.kickoff_utc).getTime();

  return (
    Number.isFinite(kickoff) &&
    Date.now() < kickoff
  );
}

// ---------- SESSION AND PROFILES ----------
async function loadSessionAndProfiles() {
  const {
    data: { session },
    error: sessionError
  } = await client.auth.getSession();

  if (sessionError) {
    throw sessionError;
  }

  state.session = session;
  state.currentProfile = null;
  state.isMaster = false;

  state.profilesByPicker = {
    mat: null,
    nikki: null
  };

  if (!session?.user) {
    return;
  }

  const {
    data: profiles,
    error: profileError
  } = await client
    .from("profiles")
    .select("id, display_name, role, status");

  if (profileError) {
    throw profileError;
  }

  state.currentProfile =
    profiles.find(
      profile =>
        profile.id === session.user.id
    ) || null;

  state.isMaster =
    String(
      state.currentProfile?.role || ""
    ).toLowerCase() === "master";

  for (const profile of profiles) {
    const displayName = String(
      profile.display_name || ""
    )
      .trim()
      .toLowerCase();

    if (displayName === "mat") {
      state.profilesByPicker.mat = profile;
    }

    if (displayName === "nikki") {
      state.profilesByPicker.nikki = profile;
    }
  }
}

// ---------- SCHEDULE ----------
async function loadSchedule() {
  const { txt } =
    await fetchFirstAvailable(CSV_CANDIDATES);

  const { hdr, rows } = parseCSV(txt);

  const consensusRows =
    onlyConsensus(rows, hdr);

  const sourceRows =
    consensusRows.length
      ? consensusRows
      : rows;

  if (!sourceRows.length) {
    throw new Error(
      "No rows found in latest.csv."
    );
  }

  const season =
    cell(hdr, sourceRows[0], "season");

  const csvWeek =
    cell(hdr, sourceRows[0], "week");

  if (!season) {
    throw new Error(
      "latest.csv is missing the season value."
    );
  }

  state.scheduleHeader = hdr;
  state.scheduleRows = sourceRows;
  state.season = season;

  state.week = csvWeek
    ? String(nflWeekLabel(csvWeek)).padStart(2, "0")
    : "";

  const seasonWeek =
    document.getElementById("seasonWeek");

  seasonWeek.textContent =
    state.week
      ? `NFL Week ${Number(state.week)}`
      : "NFL Schedule";
}

// ---------- SUPABASE GAMES ----------
async function loadSupabaseGames() {
  const seasonNumber = Number(state.season);

  if (!Number.isInteger(seasonNumber)) {
    throw new Error(
      `Invalid season value in latest.csv: ${state.season}`
    );
  }

  const {
    data: games,
    error
  } = await client
    .from("games")
    .select(
      [
        "id",
        "espn_game_id",
        "season",
        "week",
        "away_team",
        "home_team",
        "kickoff_utc",
        "spread_home",
        "total",
        "status"
      ].join(", ")
    )
    .eq("season", seasonNumber)
    .order("kickoff_utc", {
      ascending: true
    });

  if (error) {
    throw error;
  }

  return games || [];
}

function matchScheduleRowToGame(
  header,
  row,
  databaseGames
) {
  const csvEspnId =
    cell(header, row, "espn_game_id");

  const csvGameId =
    cell(header, row, "game_id");

  if (csvEspnId) {
    const matchingEspnGames =
      databaseGames.filter(
        game =>
          String(game.espn_game_id || "") ===
          csvEspnId
      );

    if (matchingEspnGames.length === 1) {
      return matchingEspnGames[0];
    }
  }

  if (csvGameId) {
    const matchingGameIds =
      databaseGames.filter(game => {
        return (
          String(game.id) === csvGameId ||
          String(game.espn_game_id || "") ===
            csvGameId
        );
      });

    if (matchingGameIds.length === 1) {
      return matchingGameIds[0];
    }
  }

  const awayTeam = canonicalTeamName(
    cell(header, row, "away_team")
  );

  const homeTeam = canonicalTeamName(
    cell(header, row, "home_team")
  );

  const kickoffValue =
    cell(header, row, "commence_time_utc");

  const kickoffTime =
    new Date(kickoffValue).getTime();

  const exactMatches =
    databaseGames.filter(game => {
      return (
        canonicalTeamName(game.away_team) ===
          awayTeam &&
        canonicalTeamName(game.home_team) ===
          homeTeam &&
        new Date(game.kickoff_utc).getTime() ===
          kickoffTime
      );
    });

  if (exactMatches.length === 1) {
    return exactMatches[0];
  }

  return null;
}

function mapScheduleRowsToGames(databaseGames) {
  state.renderedGames =
    state.scheduleRows.map(row => {
      return {
        csvRow: row,

        game: matchScheduleRowToGame(
          state.scheduleHeader,
          row,
          databaseGames
        )
      };
    });
}

// ---------- LOAD SAVED PICKS ----------
async function loadExistingPicks() {
  state.originalPicks = {
    mat: {},
    nikki: {}
  };

  state.draftPicks = {
    mat: {},
    nikki: {}
  };

  if (!state.session?.user) {
    return;
  }

  const gameIds = state.renderedGames
    .map(entry => entry.game?.id)
    .filter(Boolean);

  const userIds = PICKER_KEYS
    .map(
      pickerKey =>
        state.profilesByPicker[pickerKey]?.id
    )
    .filter(Boolean);

  if (!gameIds.length || !userIds.length) {
    return;
  }

  const {
    data: picks,
    error
  } = await client
    .from("picks")
    .select(
      [
        "id",
        "user_id",
        "game_id",
        "spread_pick",
        "total_pick"
      ].join(", ")
    )
    .in("game_id", gameIds)
    .in("user_id", userIds);

  if (error) {
    throw error;
  }

  for (const row of picks || []) {
    const pickerKey =
      PICKER_KEYS.find(key => {
        return (
          state.profilesByPicker[key]?.id ===
          row.user_id
        );
      });

    if (!pickerKey) {
      continue;
    }

    state.originalPicks[pickerKey][row.game_id] = {
      spread: row.spread_pick,
      total: row.total_pick
    };
  }

  for (const pickerKey of PICKER_KEYS) {
    state.draftPicks[pickerKey] =
      copyPickMap(
        state.originalPicks[pickerKey]
      );
  }
}

// ---------- EDIT PERMISSIONS ----------
function editPermission(pickerKey, game) {
  if (!state.session?.user) {
    return {
      allowed: false,
      reason: "Log in before making picks."
    };
  }

  if (!state.currentProfile) {
    return {
      allowed: false,
      reason: "Your profile could not be loaded."
    };
  }

  if (state.currentProfile.status !== "ACTIVE") {
    return {
      allowed: false,
      reason: "This account is not active."
    };
  }

  const targetProfile =
    state.profilesByPicker[pickerKey];

  if (!targetProfile) {
    return {
      allowed: false,
      reason:
        `${PICKER_LABELS[pickerKey]} profile not found.`
    };
  }

  if (!game) {
    return {
      allowed: false,
      reason:
        "This schedule row has no matching Supabase game."
    };
  }

  if (state.isMaster) {
    return {
      allowed: true,
      reason: ""
    };
  }

  if (
    targetProfile.id !==
    state.currentProfile.id
  ) {
    return {
      allowed: false,
      reason:
        "Members can edit only their own picks."
    };
  }

  if (!isKickoffInFuture(game)) {
    return {
      allowed: false,
      reason: "This game has started."
    };
  }

  return {
    allowed: true,
    reason: ""
  };
}

// ---------- PICK BUTTONS ----------
function makePickButton({
  label,
  type,
  side,
  currentPick,
  color,
  pickerKey,
  game
}) {
  const button =
    document.createElement("button");

  const permission =
    editPermission(pickerKey, game);

  button.className = "pickbtn";
  button.type = "button";
  button.textContent = label;
  button.dataset.type = type;
  button.dataset.side = side;
  button.disabled = !permission.allowed;
  button.title = permission.reason;

  const spreadSelected =
    type === "spread" &&
    currentPick.spread === side;

  const totalSelected =
    type === "total" &&
    currentPick.total === side;

  if (spreadSelected || totalSelected) {
    button.classList.add(
      "active",
      color
    );
  }

  button.onclick = () => {
    const latestPermission =
      editPermission(pickerKey, game);

    if (!latestPermission.allowed) {
      alert(latestPermission.reason);
      return;
    }

    const gameId = game.id;

    const current = normalizePick(
      state.draftPicks[pickerKey][gameId]
    );

    if (type === "spread") {
      current.spread =
        current.spread === side
          ? null
          : side;
    } else {
      current.total =
        current.total === side
          ? null
          : side;
    }

    if (
      current.spread === null &&
      current.total === null
    ) {
      delete state.draftPicks[pickerKey][gameId];
    } else {
      state.draftPicks[pickerKey][gameId] =
        current;
    }

    renderCards();
  };

  return button;
}

// ---------- GAME CARD ----------
function card(header, csvRow, game) {
  const kickoff =
    cell(
      header,
      csvRow,
      "commence_time_utc"
    );

  const when = fmtDate(kickoff);

  const home = normalizeTeamName(
    cell(header, csvRow, "home_team")
  );

  const away = normalizeTeamName(
    cell(header, csvRow, "away_team")
  );

  const spreadHome =
    cell(header, csvRow, "spread_home");

  const total =
    cell(header, csvRow, "total");

  const spreadAway =
    spreadHome === ""
      ? ""
      : fmtSigned(-Number(spreadHome));

  const spreadHomeDisplay =
    fmtSigned(spreadHome);

  const element =
    document.createElement("article");

  element.className = "card";

  element.innerHTML = `
    <div class="matchgrid">
      <img
        class="team-logo"
        src="${logoPath(away)}"
        alt="${away} logo"
      >

      <div class="matchtext">
        <div class="team">${away}</div>
        <div class="at">@</div>
        <div class="team">${home}</div>
      </div>

      <img
        class="team-logo right"
        src="${logoPath(home)}"
        alt="${home} logo"
      >
    </div>

    <div
      class="when"
      style="text-align:center; margin-top:6px;"
    >
      ${when}
    </div>

    <div
      class="line"
      style="text-align:center; margin-top:6px;"
    >
      <span class="pill">
        Home spread:
        <b>${spreadHomeDisplay}</b>
      </span>

      <span
        class="pill"
        style="margin-left:8px;"
      >
        Total:
        <b>${total}</b>
      </span>
    </div>
  `;

  if (!game) {
    const warning =
      document.createElement("div");

    warning.className = "when";
    warning.style.textAlign = "center";
    warning.style.marginTop = "8px";

    warning.textContent =
      "No matching Supabase game. Picks cannot be saved.";

    element.appendChild(warning);
  }

  for (const pickerKey of PICKER_KEYS) {
    const section =
      document.createElement("div");

    section.style.marginTop = "10px";

    const nameDiv =
      document.createElement("div");

    nameDiv.className =
      `name ${pickerKey}`;

    nameDiv.textContent =
      PICKER_LABELS[pickerKey];

    nameDiv.style.textAlign = "center";
    nameDiv.style.fontWeight = "600";
    nameDiv.style.margin = "6px 0";

    section.appendChild(nameDiv);

    const grid =
      document.createElement("div");

    grid.className = "pick-grid";
    grid.style.display = "grid";
    grid.style.gridTemplateColumns =
      "1fr 1fr";
    grid.style.columnGap = "8px";
    grid.style.rowGap = "8px";
    grid.style.marginTop = "6px";

    const currentPick = game
      ? normalizePick(
          state.draftPicks[pickerKey][game.id]
        )
      : emptyPick();

    const color = pickerKey;

    const buttons = [
      makePickButton({
        label: `${away} ${spreadAway}`,
        type: "spread",
        side: "away",
        currentPick,
        color,
        pickerKey,
        game
      }),

      makePickButton({
        label: `Over ${total}`,
        type: "total",
        side: "over",
        currentPick,
        color,
        pickerKey,
        game
      }),

      makePickButton({
        label:
          `${home} ${spreadHomeDisplay}`,
        type: "spread",
        side: "home",
        currentPick,
        color,
        pickerKey,
        game
      }),

      makePickButton({
        label: `Under ${total}`,
        type: "total",
        side: "under",
        currentPick,
        color,
        pickerKey,
        game
      })
    ];

    for (const button of buttons) {
      grid.appendChild(button);
    }

    section.appendChild(grid);
    element.appendChild(section);
  }

  return element;
}

function neonDivider() {
  const divider =
    document.createElement("div");

  divider.className = "neon-divider";

  divider.setAttribute(
    "style",
    [
      "height:3px",
      "background:#39ff14",
      "margin:10px 0",
      "border-radius:2px",
      "box-shadow:0 0 8px #39ff14",
      "pointer-events:none"
    ].join(";")
  );

  return divider;
}

function renderCards() {
  const gamesDiv =
    document.getElementById("games");

  gamesDiv.innerHTML = "";

  state.renderedGames.forEach(
    (entry, index) => {
      gamesDiv.appendChild(
        card(
          state.scheduleHeader,
          entry.csvRow,
          entry.game
        )
      );

      if (
        index <
        state.renderedGames.length - 1
      ) {
        gamesDiv.appendChild(
          neonDivider()
        );
      }
    }
  );
}

// ---------- FIND CHANGES ----------
function changedRecords() {
  const upserts = [];

  const deletesByPicker = {
    mat: [],
    nikki: []
  };

  for (const pickerKey of PICKER_KEYS) {
    const targetProfile =
      state.profilesByPicker[pickerKey];

    if (!targetProfile) {
      continue;
    }

    for (
      const entry
      of state.renderedGames
    ) {
      const game = entry.game;

      if (!game) {
        continue;
      }

      const original =
        state.originalPicks[pickerKey][game.id] ||
        null;

      const draft =
        state.draftPicks[pickerKey][game.id] ||
        null;

      if (picksEqual(original, draft)) {
        continue;
      }

      const permission =
        editPermission(pickerKey, game);

      if (!permission.allowed) {
        throw new Error(
          [
            PICKER_LABELS[pickerKey],
            `${game.away_team} at ${game.home_team}`,
            permission.reason
          ].join(" — ")
        );
      }

      if (
        draft &&
        !isCompletePick(draft)
      ) {
        throw new Error(
          [
            PICKER_LABELS[pickerKey],
            "must select both spread and total for",
            `${game.away_team} at ${game.home_team}.`
          ].join(" ")
        );
      }

      if (!draft && original) {
        deletesByPicker[pickerKey].push(
          game.id
        );

        continue;
      }

      if (draft) {
        upserts.push({
          user_id: targetProfile.id,
          game_id: game.id,
          spread_pick: draft.spread,
          total_pick: draft.total
        });
      }
    }
  }

  return {
    upserts,
    deletesByPicker
  };
}

// ---------- SAVE PICKS ----------
async function submitPicks() {
  const {
    upserts,
    deletesByPicker
  } = changedRecords();

  const deleteCount =
    deletesByPicker.mat.length +
    deletesByPicker.nikki.length;

  if (
    !upserts.length &&
    !deleteCount
  ) {
    alert("No pick changes to save.");
    return;
  }

  if (upserts.length) {
    const { error } = await client
      .from("picks")
      .upsert(
        upserts,
        {
          onConflict: "user_id,game_id"
        }
      );

    if (error) {
      throw error;
    }
  }

  for (const pickerKey of PICKER_KEYS) {
    const gameIds =
      deletesByPicker[pickerKey];

    const targetProfile =
      state.profilesByPicker[pickerKey];

    if (
      !gameIds.length ||
      !targetProfile
    ) {
      continue;
    }

    const { error } = await client
      .from("picks")
      .delete()
      .eq(
        "user_id",
        targetProfile.id
      )
      .in("game_id", gameIds);

    if (error) {
      throw error;
    }
  }

  await loadExistingPicks();
  renderCards();

  alert("Picks saved.");
}

// ---------- CLEAR PICKS ----------
function clearEditablePicks() {
  let changed = false;

  for (const pickerKey of PICKER_KEYS) {
    for (
      const entry
      of state.renderedGames
    ) {
      const game = entry.game;

      if (!game) {
        continue;
      }

      const permission =
        editPermission(pickerKey, game);

      if (!permission.allowed) {
        continue;
      }

      if (
        state.draftPicks[pickerKey][game.id]
      ) {
        delete state
          .draftPicks[pickerKey][game.id];

        changed = true;
      }
    }
  }

  renderCards();

  if (changed) {
    alert(
      "Editable picks cleared on this page. Click Submit Picks to save the deletions."
    );
  } else {
    alert(
      "No editable picks were selected."
    );
  }
}

// ---------- LOAD PAGE ----------
async function loadPage() {
  await loadSessionAndProfiles();
  await loadSchedule();

  const databaseGames =
    await loadSupabaseGames();

  mapScheduleRowsToGames(databaseGames);

  await loadExistingPicks();

  renderCards();
}

// ---------- BUTTON EVENTS ----------
document
  .getElementById("clearBtn")
  .addEventListener(
    "click",
    () => {
      try {
        clearEditablePicks();
      } catch (error) {
        console.error(error);

        alert(
          "Error: " + error.message
        );
      }
    }
  );

document
  .getElementById("issueBtn")
  .addEventListener(
    "click",
    async () => {
      try {
        await submitPicks();
      } catch (error) {
        console.error(error);

        alert(
          "Error: " + error.message
        );
      }
    }
  );

// ---------- AUTH CHANGES ----------
client.auth.onAuthStateChange(() => {
  setTimeout(() => {
    loadPage().catch(error => {
      console.error(error);

      alert(
        "Failed to reload picks: " +
        error.message
      );
    });
  }, 0);
});

// ---------- START ----------
loadPage().catch(error => {
  console.error(error);

  alert(
    "Failed to load picks page: " +
    error.message
  );
});
