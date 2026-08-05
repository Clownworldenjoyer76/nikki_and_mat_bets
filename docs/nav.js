"use strict";

/* ============================================================
   SITE NAV — edit NAV_LINKS only. Every page that includes
   nav.js and has <div id="navbar"></div> picks up changes here.
   ============================================================ */

const NAV_LINKS = [
  { href: "./index.html",       label: "\u{1F3E0} Home" },
  { href: "./account.html",     label: "\u{1F464} Account" },
  { href: "./make_picks.html",  label: "\u{1F3C8} Picks" },
  { href: "./leaderboard.html", label: "\u{1F3C6} Leaderboard" },
  { href: "./insights.html",    label: "\u{1F4D0} Insights" }
];

(() => {
  const mount = document.getElementById("navbar");

  if (!mount) {
    return;
  }

  const bar = document.createElement("div");
  bar.className = "bar";

  const nav = document.createElement("nav");

  const here = window.location.pathname
    .split("/")
    .pop()
    .toLowerCase();

  for (const link of NAV_LINKS) {
    const anchor = document.createElement("a");
    anchor.href = link.href;
    anchor.textContent = link.label;

    const target = link.href
      .split("/")
      .pop()
      .toLowerCase();

    if (target === here || (here === "" && target === "index.html")) {
      anchor.setAttribute("aria-current", "page");
    }

    nav.appendChild(anchor);
  }

  bar.appendChild(nav);
  mount.replaceChildren(bar);
})();
