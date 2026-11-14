// The command palette (Ctrl+K): everything the desk can do, found by typing a few letters.

import { el, icon, fill } from "./core.js";

const sources = [];
/** A function that returns the commands available right now: [{ title, icon, keys, run }] */
export function registerCommands(fn) { sources.push(fn); }

let open = null;

function score(text, query) {
  // Letters of the query in order; earlier and closer together is better.
  const t = text.toLowerCase();
  let at = -1, total = 0;
  for (const ch of query) {
    const i = t.indexOf(ch, at + 1);
    if (i < 0) return -1;
    total += i - at - 1 + (i === 0 || t[i - 1] === " " ? -2 : 0);
    at = i;
  }
  return total;
}

export function palette() {
  if (open) { close(); return; }
  const all = sources.flatMap((fn) => fn());
  const input = el("input", { type: "text", placeholder: "Type a command…", autocomplete: "off", spellcheck: false, "aria-label": "Command" });
  const list = el("div", { class: "palette-list", role: "listbox" });
  const box = el("div", { class: "palette" }, el("div", { class: "palette-input" }, icon("search", 16), input), list);
  const shade = el("div", { class: "shade top", onmousedown: (e) => { if (e.target === shade) close(); } }, box);
  let shown = [], at = 0;

  function paint() {
    const q = input.value.trim().toLowerCase().replace(/\s+/g, "");
    shown = (q ? all.map((c) => ({ c, s: score(c.title, q) })).filter((x) => x.s >= 0).sort((a, b) => a.s - b.s).map((x) => x.c) : all).slice(0, 12);
    at = Math.min(at, Math.max(0, shown.length - 1));
    fill(list, ...(shown.length ? shown.map((c, i) => el("button", {
      class: i === at ? "on" : "", role: "option", "aria-selected": i === at,
      onmouseenter: () => { at = i; mark(); }, onclick: () => run(c),
    }, icon(c.icon ?? "chevron", 16), el("span", { text: c.title }), c.keys && el("kbd", { text: c.keys }))) : [el("div", { class: "palette-none", text: "Nothing matches." })]));
  }
  function mark() { [...list.children].forEach((b, i) => b.classList?.toggle("on", i === at)); }
  function run(c) { close(); c.run(); }

  input.addEventListener("input", () => { at = 0; paint(); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); at = (at + 1) % Math.max(1, shown.length); mark(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); at = (at + shown.length - 1) % Math.max(1, shown.length); mark(); }
    else if (e.key === "Enter") { e.preventDefault(); if (shown[at]) run(shown[at]); }
    else if (e.key === "Escape") { e.preventDefault(); close(); }
  });
  document.body.append(shade);
  open = shade;
  paint();
  input.focus();   // (at once: what is typed right away must land here)
  requestAnimationFrame(() => shade.classList.add("in"));
}

function close() {
  if (!open) return;
  const s = open; open = null;
  s.classList.remove("in");
  setTimeout(() => s.remove(), 120);
}
