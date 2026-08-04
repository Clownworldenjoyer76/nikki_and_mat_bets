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

function showMessage(message, isError = false) {
  authMessage.textContent = message;
  authMessage.style.color = isError ? "red" : "";
}

function showRecovery() {
  inRecovery = true;
  awaitingConfirmation = false;
  loggedOutSection.hidden = true;
  loggedInSection.hidden = true;
  checkEmailSection.hidden = true;
  recoverySection.hidden = false;
  showMessage("Enter a new password for your account.");
}

function showCheckEmail(email) {
  awaitingConfirmation = true;
  checkEmailAddress.textContent = email;
  loggedOutSection.hidden = true;
  loggedInSection.hidden = true;
  recoverySection.hidden = true;
  checkEmailSection.hidden = false;
  showMessage("");
  window.scrollTo(0, 0);
}

function showLoggedOut() {
  awaitingConfirmation = false;
  checkEmailSection.hidden = true;
  recoverySection.hidden = true;
  loggedInSection.hidden = true;
  loggedOutSection.hidden = false;
  showMessage("");
}

async function updatePage(session) {
  if (inRecovery) {
    return;
  }

  if (awaitingConfirmation && !session?.user) {
    return;
  }

  recoverySection.hidden = true;
  checkEmailSection.hidden = true;
  awaitingConfirmation = false;

  if (!session?.user) {
    loggedOutSection.hidden = false;
    loggedInSection.hidden = true;
    currentUser.textContent = "";
    return;
  }

  const { data: profile } = await client
    .from("profiles")
    .select("display_name")
    .eq("id", session.user.id)
    .single();

  currentUser.textContent =
    profile?.display_name || session.user.email || "Unknown user";

  loggedOutSection.hidden = true;
  loggedInSection.hidden = false;
}

document.getElementById("signupBtn").addEventListener("click", async () => {
  const displayName = document
    .getElementById("signupDisplayName")
    .value.trim();

  const email = document
    .getElementById("signupEmail")
    .value.trim();

  const password = document.getElementById("signupPassword").value;

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

  document.getElementById("signupDisplayName").value = "";
  document.getElementById("signupEmail").value = "";
  document.getElementById("signupPassword").value = "";

  if (data.session) {
    showMessage("Account created and signed in.");
    await updatePage(data.session);
  } else {
    showCheckEmail(email);
  }
});

document.getElementById("backToAuthBtn").addEventListener("click", () => {
  showLoggedOut();
});

document.getElementById("loginBtn").addEventListener("click", async () => {
  const email = document
    .getElementById("loginEmail")
    .value.trim();

  const password = document.getElementById("loginPassword").value;

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

document.getElementById("logoutBtn").addEventListener("click", async () => {
  const { error } = await client.auth.signOut();

  if (error) {
    showMessage(error.message, true);
    return;
  }

  showMessage("Logged out.");
  await updatePage(null);
});

document.getElementById("resetBtn").addEventListener("click", async () => {
  const email = document
    .getElementById("resetEmail")
    .value.trim();

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

document
  .getElementById("updatePasswordBtn")
  .addEventListener("click", async () => {
    const newPassword = document.getElementById("newPassword").value;
    const confirmPassword = document.getElementById("confirmPassword").value;

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

    document.getElementById("newPassword").value = "";
    document.getElementById("confirmPassword").value = "";

    inRecovery = false;
    recoverySection.hidden = true;

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
