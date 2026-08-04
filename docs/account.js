"use strict";

(() => {
  const client = window.supabaseClient;

  const state = {
    session: null,
    profile: null,
    busy: false
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function setHidden(el, value) {
    if (el) {
      el.hidden = value;
    }
  }

  function setText(el, value) {
    if (el) {
      el.textContent = value;
    }
  }

  function bindClick(id, handler) {
    const el = byId(id);

    if (el) {
      el.addEventListener("click", handler);
    }
  }

  function readField(id) {
    const el = byId(id);
    return el ? el.value : "";
  }

  function clearField(id) {
    const el = byId(id);

    if (el) {
      el.value = "";
    }
  }

  function sectionMessage(id, message, isError = false) {
    const el = byId(id);

    if (!el) {
      return;
    }

    el.textContent = message;
    el.classList.toggle("is-error", Boolean(isError));
    el.classList.toggle("is-ok", Boolean(message) && !isError);
  }

  function pageMessage(message, isError = false) {
    const el = byId("accountMessage");

    if (!el) {
      return;
    }

    el.textContent = message;
    el.style.color = isError ? "red" : "";
  }

  function setBusy(value) {
    state.busy = value;

    for (const id of [
      "saveProfileBtn",
      "changeEmailBtn",
      "changePasswordBtn",
      "signOutBtn"
    ]) {
      const el = byId(id);

      if (el) {
        el.disabled = value;
      }
    }
  }

  function formatDate(iso) {
    if (!iso) {
      return "Unknown";
    }

    const date = new Date(iso);

    if (Number.isNaN(date.getTime())) {
      return "Unknown";
    }

    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric"
    });
  }

  function showSignedOut() {
    setHidden(byId("signedOutSection"), false);
    setHidden(byId("profileSection"), true);
    setHidden(byId("emailSection"), true);
    setHidden(byId("passwordSection"), true);
    setHidden(byId("accountSection"), true);
  }

  function showSignedIn() {
    setHidden(byId("signedOutSection"), true);
    setHidden(byId("profileSection"), false);
    setHidden(byId("emailSection"), false);
    setHidden(byId("passwordSection"), false);
    setHidden(byId("accountSection"), false);
  }

  function updateBioCount() {
    const input = byId("bioInput");
    const counter = byId("bioCount");

    if (input && counter) {
      counter.textContent = String(input.value.length);
    }
  }

  function fillForm() {
    const displayNameInput = byId("displayNameInput");
    const bioInput = byId("bioInput");

    if (displayNameInput) {
      displayNameInput.value = state.profile?.display_name || "";
    }

    if (bioInput) {
      bioInput.value = state.profile?.bio || "";
    }

    updateBioCount();

    setText(byId("currentEmail"), state.session?.user?.email || "Unknown");
    setText(byId("accountRole"), state.profile?.role || "Unknown");
    setText(byId("accountStatus"), state.profile?.status || "Unknown");
    setText(
      byId("accountCreated"),
      formatDate(state.profile?.created_at || state.session?.user?.created_at)
    );
  }

  async function loadPage() {
    const { data, error } = await client.auth.getSession();

    if (error) {
      pageMessage(error.message, true);
      showSignedOut();
      return;
    }

    state.session = data.session;

    if (!state.session?.user) {
      state.profile = null;
      showSignedOut();
      return;
    }

    const profileResult = await client
      .from("profiles")
      .select("id, display_name, bio, role, status, created_at")
      .eq("id", state.session.user.id)
      .single();

    if (profileResult.error) {
      pageMessage(
        `Could not load your profile: ${profileResult.error.message}`,
        true
      );

      showSignedOut();
      return;
    }

    state.profile = profileResult.data;

    pageMessage("");
    fillForm();
    showSignedIn();
  }

  bindClick("goToSignInBtn", () => {
    window.location.href = "./auth.html";
  });

  const bioInput = byId("bioInput");

  if (bioInput) {
    bioInput.addEventListener("input", updateBioCount);
  }

  bindClick("saveProfileBtn", async () => {
    if (state.busy || !state.session?.user) {
      return;
    }

    const displayName = readField("displayNameInput").trim();
    const bio = readField("bioInput").trim();

    if (!displayName) {
      sectionMessage("profileMessage", "Display name cannot be empty.", true);
      return;
    }

    setBusy(true);
    sectionMessage("profileMessage", "Saving...");

    const { data, error } = await client
      .from("profiles")
      .update({
        display_name: displayName,
        bio: bio || null,
        updated_at: new Date().toISOString()
      })
      .eq("id", state.session.user.id)
      .select("id, display_name, bio, role, status, created_at")
      .single();

    setBusy(false);

    if (error) {
      sectionMessage("profileMessage", error.message, true);
      return;
    }

    state.profile = data;
    fillForm();
    sectionMessage("profileMessage", "Profile saved.");
  });

  bindClick("changeEmailBtn", async () => {
    if (state.busy || !state.session?.user) {
      return;
    }

    const newEmail = readField("newEmailInput").trim();

    if (!newEmail) {
      sectionMessage("emailMessage", "Enter a new email address.", true);
      return;
    }

    if (newEmail.toLowerCase() === (state.session.user.email || "").toLowerCase()) {
      sectionMessage("emailMessage", "That is already your email address.", true);
      return;
    }

    setBusy(true);
    sectionMessage("emailMessage", "Sending confirmation...");

    const { error } = await client.auth.updateUser(
      { email: newEmail },
      { emailRedirectTo: new URL("./account.html", window.location.href).href }
    );

    setBusy(false);

    if (error) {
      sectionMessage("emailMessage", error.message, true);
      return;
    }

    clearField("newEmailInput");

    sectionMessage(
      "emailMessage",
      `Confirmation sent to ${newEmail}. Click the link to finish the change.`
    );
  });

  bindClick("changePasswordBtn", async () => {
    if (state.busy || !state.session?.user) {
      return;
    }

    const newPassword = readField("newPasswordInput");
    const confirmPassword = readField("confirmPasswordInput");

    if (!newPassword || !confirmPassword) {
      sectionMessage("passwordMessage", "Enter and confirm your new password.", true);
      return;
    }

    if (newPassword !== confirmPassword) {
      sectionMessage("passwordMessage", "Passwords do not match.", true);
      return;
    }

    setBusy(true);
    sectionMessage("passwordMessage", "Updating password...");

    const { error } = await client.auth.updateUser({ password: newPassword });

    setBusy(false);

    if (error) {
      sectionMessage("passwordMessage", error.message, true);
      return;
    }

    clearField("newPasswordInput");
    clearField("confirmPasswordInput");

    sectionMessage("passwordMessage", "Password updated.");
  });

  bindClick("signOutBtn", async () => {
    if (state.busy) {
      return;
    }

    setBusy(true);

    const { error } = await client.auth.signOut();

    setBusy(false);

    if (error) {
      pageMessage(error.message, true);
      return;
    }

    state.session = null;
    state.profile = null;

    pageMessage("Signed out.");
    showSignedOut();
  });

  client.auth.onAuthStateChange((event) => {
    if (!["SIGNED_IN", "SIGNED_OUT", "USER_UPDATED", "TOKEN_REFRESHED"].includes(event)) {
      return;
    }

    loadPage().catch((error) => {
      pageMessage(error.message, true);
    });
  });

  loadPage().catch((error) => {
    pageMessage(error.message, true);
  });
})();
