"use strict";

(() => {
  const client = window.supabaseClient;
  const logoutButton = document.getElementById("logoutBtn");

  if (!logoutButton) {
    return;
  }

  if (!client?.auth) {
    return;
  }

  async function refresh() {
    const {
      data: { session },
      error
    } = await client.auth.getSession();

    if (error) {
      console.error(error);
      return;
    }

    logoutButton.hidden = !session?.user;
  }

  logoutButton.addEventListener("click", async () => {
    logoutButton.disabled = true;

    const { error } = await client.auth.signOut();

    logoutButton.disabled = false;

    if (error) {
      console.error(error);
      alert("Could not log out: " + error.message);
      return;
    }

    await refresh();
  });

  client.auth.onAuthStateChange(() => {
    setTimeout(() => {
      refresh().catch((error) => {
        console.error(error);
      });
    }, 0);
  });

  refresh().catch((error) => {
    console.error(error);
  });
})();
