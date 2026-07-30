const client = window.supabaseClient;

const loggedOutSection = document.getElementById("loggedOutSection");
const loggedInSection = document.getElementById("loggedInSection");
const currentUser = document.getElementById("currentUser");
const authMessage = document.getElementById("authMessage");

function showMessage(message, isError = false) {
  authMessage.textContent = message;
  authMessage.style.color = isError ? "red" : "";
}

async function updatePage(session) {
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

  if (data.session) {
    showMessage("Account created and signed in.");
    await updatePage(data.session);
  } else {
    showMessage("Account created. Check your email to confirm the account.");
  }
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

client.auth.onAuthStateChange((_event, session) => {
  updatePage(session);
});

client.auth.getSession().then(({ data }) => {
  updatePage(data.session);
});
