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

function hide(el, value) {
  if (el) {
    el.hidden = value;
  }
}

function on(id, handler) {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener("click", handler);
  }
}

function valueOf(id) {
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
  hide(loggedOutSection, true);
  hide(loggedInSection, true);
  hide(checkEmailSection, true);
  hide(recoverySection, false);
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
  hide(loggedOutSection, true);
  hide(loggedInSection, true);
  hide(recoverySection, true);
  hide(checkEmailSection, false);
  showMessage("");
  window.scrollTo(0, 0);
}

function showLoggedOut() {
  awaitingConfirmation = false;
  hide(checkEmailSection, true);
  hide(recoverySection, true);
  hide(loggedInSection, true);
  hide(loggedOutSection, false);
  showMessage("");
}

async function updatePage(session) {
  if (inRecovery) {
    return;
  }

  if (awaitingConfirmation && !session?.user) {
    return;
  }

  hide(recoverySection, true);
  hide(checkEmailSection, true);
  awaitingConfirmation = false;

  if (!session?.user) {
    hide(loggedOutSection, false);
    hide(loggedInSection, true);
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

  hide(loggedOutSection, true);
  hide(loggedInSection, false);
}

on("signupBtn", async () => {
  const displayName = valueOf("signupDisplayName").trim();
  const email = valueOf("signupEmail").trim();
  const password = valueOf("signupPassword");

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

on("backToAuthBtn", () => {
  showLoggedOut();
});

on("loginBtn", async () => {
  const email = valueOf("loginEmail").trim();
  const password = valueOf("loginPassword");

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

on("logoutBtn", async () => {
  const { error } = await client.auth.signOut();

  if (error) {
    showMessage(error.message, true);
    return;
  }

  showMessage("Logged out.");
  await updatePage(null);
});

on("resetBtn", async () => {
  const email = valueOf("resetEmail").trim();

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

on("updatePasswordBtn", async () => {
  const newPassword = valueOf("newPassword");
  const confirmPassword = valueOf("confirmPassword");

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
  hide(recoverySection, true);

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
