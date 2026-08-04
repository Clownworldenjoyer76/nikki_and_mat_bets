const client = window.supabaseClient;

const loggedOutSection = document.getElementById("loggedOutSection");
const loggedInSection = document.getElementById("loggedInSection");
const recoverySection = document.getElementById("recoverySection");
const checkEmailSection = document.getElementById("checkEmailSection");
const checkEmailAddress = document.getElementById("checkEmailAddress");
const currentUser = document.getElementById("currentUser");
const authMessage = document.getElementById("authMessage");

let inRecovery = false;
let awaitingConfirmation = false;

function setHidden(el, value) {
  if (el) {
    el.hidden = value;
  }
}

function bindClick(id, handler) {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener("click", handler);
  }
}

function readField(id) {
  const el = document.getElementById(id);
  return el ? el.value : "";
}

function clearField(id) {
  const el = document.getElementById(id);
  if (el) {
    el.value = "";
  }
}

function showMessage(message, isError = false) {
  if (!authMessage) {
    return;
  }
  authMessage.textContent = message;
  authMessage.style.color = isError ? "red" : "";
}

function showRecovery() {
  if (!recoverySection) {
    showMessage("Open the password reset link again to set a new password.", true);
    return;
  }
  inRecovery = true;
  awaitingConfirmation = false;
  setHidden(loggedOutSection, true);
  setHidden(loggedInSection, true);
  setHidden(checkEmailSection, true);
  setHidden(recoverySection, false);
  showMessage("Enter a new password for your account.");
}

function showCheckEmail(email) {
  if (!checkEmailSection) {
    showMessage("Account created. Check your email to confirm the account.");
    return;
  }
  awaitingConfirmation = true;
  if (checkEmailAddress) {
    checkEmailAddress.textContent = email;
  }
  setHidden(loggedOutSection, true);
  setHidden(loggedInSection, true);
  setHidden(recoverySection, true);
  setHidden(checkEmailSection, false);
  showMessage("");
  window.scrollTo(0, 0);
}

function showLoggedOut() {
  awaitingConfirmation = false;
  setHidden(checkEmailSection, true);
  setHidden(recoverySection, true);
  setHidden(loggedInSection, true);
  setHidden(loggedOutSection, false);
  showMessage("");
}

async function updatePage(session) {
  if (inRecovery) {
    return;
  }

  if (awaitingConfirmation && !session?.user) {
    return;
  }

  setHidden(recoverySection, true);
  setHidden(checkEmailSection, true);
  awaitingConfirmation = false;

  if (!session?.user) {
    setHidden(loggedOutSection, false);
    setHidden(loggedInSection, true);
    if (currentUser) {
      currentUser.textContent = "";
    }
    return;
  }

  const { data: profile } = await client
    .from("profiles")
    .select("display_name")
    .eq("id", session.user.id)
    .single();

  if (currentUser) {
    currentUser.textContent =
      profile?.display_name || session.user.email || "Unknown user";
  }

  setHidden(loggedOutSection, true);
  setHidden(loggedInSection, false);
}

bindClick("signupBtn", async () => {
  const displayName = readField("signupDisplayName").trim();
  const email = readField("signupEmail").trim();
  const password = readField("signupPassword");

  if (!displayName || !email || !password) {
    showMessage("Enter a display name, email, and password.", true);
    return;
  }

  showMessage("Creating account...");

  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: {
      data: {
        display_name: displayName
      },
      emailRedirectTo: new URL("./auth.html", window.location.href).href
    }
  });

  if (error) {
    showMessage(error.message, true);
    return;
  }

  clearField("signupDisplayName");
  clearField("signupEmail");
  clearField("signupPassword");

  if (data.session) {
    showMessage("Account created and signed in.");
    await updatePage(data.session);
  } else {
    showCheckEmail(email);
  }
});

bindClick("backToAuthBtn", () => {
  showLoggedOut();
});

bindClick("loginBtn", async () => {
  const email = readField("loginEmail").trim();
  const password = readField("loginPassword");

  if (!email || !password) {
    showMessage("Enter your email and password.", true);
    return;
  }

  showMessage("Logging in...");

  const { data, error } = await client.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    showMessage(error.message, true);
    return;
  }

  showMessage("Logged in.");
  await updatePage(data.session);
});

bindClick("logoutBtn", async () => {
  const { error } = await client.auth.signOut();

  if (error) {
    showMessage(error.message, true);
    return;
  }

  showMessage("Logged out.");
  await updatePage(null);
});

bindClick("resetBtn", async () => {
  const email = readField("resetEmail").trim();

  if (!email) {
    showMessage("Enter your email address.", true);
    return;
  }

  showMessage("Sending reset email...");

  const { error } = await client.auth.resetPasswordForEmail(email, {
    redirectTo: new URL("./auth.html", window.location.href).href
  });

  if (error) {
    showMessage(error.message, true);
    return;
  }

  showMessage("Password reset email sent.");
});

bindClick("updatePasswordBtn", async () => {
  const newPassword = readField("newPassword");
  const confirmPassword = readField("confirmPassword");

  if (!newPassword || !confirmPassword) {
    showMessage("Enter and confirm your new password.", true);
    return;
  }

  if (newPassword !== confirmPassword) {
    showMessage("Passwords do not match.", true);
    return;
  }

  showMessage("Updating password...");

  const { error } = await client.auth.updateUser({
    password: newPassword
  });

  if (error) {
    showMessage(error.message, true);
    return;
  }

  clearField("newPassword");
  clearField("confirmPassword");

  inRecovery = false;
  setHidden(recoverySection, true);

  showMessage("Password updated. You are signed in.");

  const { data } = await client.auth.getSession();
  await updatePage(data.session);
});

client.auth.onAuthStateChange((event, session) => {
  if (event === "PASSWORD_RECOVERY") {
    showRecovery();
    return;
  }

  updatePage(session);
});

client.auth.getSession().then(({ data }) => {
  const hash = window.location.hash || "";
  const search = window.location.search || "";

  if (hash.includes("type=recovery") || search.includes("type=recovery")) {
    showRecovery();
    return;
  }

  updatePage(data.session);
});
