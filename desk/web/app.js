// The frame of the desk: the rail of views on the left, the bar on top, and the views
// themselves. A view is made the first time it is opened and then kept, so going back to
// it costs nothing and loses nothing.

import { $, el, icon, on, connect, session, menu, toast, short, sol, num, store, dialog, attempt, call, fill } from "./core.js";
import { state, setCluster, clusterName, refreshConfig } from "./state.js";
import { palette, registerCommands } from "./palette.js";
import home from "./views/home.js";
import terminal from "./views/terminal.js";
import files from "./views/files.js";
import validator from "./views/validator.js";
import explorer from "./views/explorer.js";
import wallets from "./views/wallets.js";
import settings from "./views/settings.js";

const VIEWS = [home, terminal, files, validator, explorer, wallets, settings];
const made = new Map();   // id -> { root, api }
let current = null;

// ---------------------------------------------------------------- the frame

const rail = $("#rail-views");
for (const v of VIEWS) {
  const b = el("button", { class: "rail-btn", id: `nav-${v.id}`, title: v.title, "aria-label": v.title, onclick: () => go(v.id) }, icon(v.icon, 21), el("span", { text: v.short ?? v.title }));
  (v.id === "settings" ? $("#rail-foot") : rail).append(b);
}

/** Opens a view. `arg` is passed to its show(), e.g. a path for Files or an address for Explorer. */
export function go(id, arg) {
  const view = VIEWS.find((v) => v.id === id) ?? VIEWS[0];
  if (current && current !== view.id) {
    const old = made.get(current);
    old.root.hidden = true;
    old.api.hide?.();
    $(`#nav-${current}`).classList.remove("on");
  }
  if (!made.has(view.id)) {
    const root = el("section", { class: `view view-${view.id}`, id: `view-${view.id}` });
    $("#views").append(root);
    made.set(view.id, { root, api: view.create(root, { go, applyTheme }) ?? {} });
  }
  const m = made.get(view.id);
  m.root.hidden = false;
  current = view.id;
  $(`#nav-${view.id}`).classList.add("on");
  $("#title").textContent = view.title;
  document.title = `${view.title} · Solinux`;
  if (location.hash.slice(2).split("/")[0] !== view.id) history.replaceState(null, "", `#/${view.id}`);
  store.set("view", view.id);
  m.api.show?.(arg);
}

// ---------------------------------------------------------------- the bar on top

const clusterBtn = $("#cluster");
const keyBtn = $("#key");

function paintBar() {
  const c = state.cluster;
  clusterBtn.className = `pill ${c.ok === true ? "good" : c.ok === false ? "bad" : ""}`;
  fill(clusterBtn, 
    el("i", { class: "dot" }),
    el("span", { text: c.name || "no cluster" }),
    c.ok === true && c.slot !== null ? el("span", { class: "dim mono", text: `slot ${num(c.slot)}` })
      : c.ok === false ? el("span", { class: "dim", text: c.name === "localnet" && !state.validator?.running ? "stopped" : "no answer" }) : null,
    icon("down", 13));
  const key = state.keys.find((k) => k.isDefault);
  fill(keyBtn, icon("wallet", 15),
    key ? el("span", { class: "mono", text: short(key.address) }) : el("span", { text: "no key" }),
    key && state.balance !== null && c.ok ? el("span", { class: "dim mono", text: `${sol(state.balance, 3)} SOL` }) : null);
}
on("state", paintBar);
on("pulse", paintBar);

clusterBtn.onclick = () => {
  const urls = state.config?.clusters ?? {};
  const pick = (url) => attempt(() => setCluster(url), `Now using ${clusterName(url)}`);
  menu(clusterBtn, [
    ...Object.entries(urls).map(([, url]) => ({ label: clusterName(url), icon: state.cluster.url === url ? "check" : null, run: () => pick(url) })),
    "-",
    {
      label: "Another RPC address…", icon: "link", run: async () => {
        const v = await dialog({ title: "Use another RPC address", fields: [{ name: "url", label: "Address", placeholder: "https://…", value: Object.values(urls).includes(state.cluster.url) ? "" : state.cluster.url, hint: "The solana command-line tools on this system will use it too." }], ok: "Use" });
        if (v?.url) pick(v.url.trim());
      },
    },
  ]);
};
keyBtn.onclick = () => go("wallets");

// ---------------------------------------------------------------- connection

const veil = $("#veil");
function showVeil(title, text, action) {
  fill(veil, el("div", { class: "veil-box" }, el("div", { class: "logo big" }, el("i")), el("h2", { text: title }), el("p", { text }), action));
  veil.hidden = false;
}
on("connected", (hello) => {
  veil.hidden = true;
  $("#host").textContent = hello.sys.hostname.split(".")[0];
  $("#host").title = hello.sys.hostname;
  $("#brand-name").textContent = hello.sys.name === "Solinux" ? "Solinux" : `Solinux Desk`;
  if (!current) go(location.hash.startsWith("#/") ? location.hash.slice(2).split("/")[0] : store.get("view", "home"));
});
let lostTimer = null;
on("disconnected", () => {
  // A blink (the server restarting, a laptop waking up) should not flash a message.
  clearTimeout(lostTimer);
  lostTimer = setTimeout(() => { if (!session.connected) showVeil("Connection lost", "The desk cannot reach the system. It keeps trying."); }, 1200);
});
on("unauthorized", () => {
  const input = el("input", { type: "password", placeholder: "access token", autocomplete: "off" });
  const form = el("form", { class: "token-form", onsubmit: (e) => { e.preventDefault(); try { localStorage.setItem("desk-token", input.value.trim()); } catch { /* ignore */ } location.reload(); } },
    input, el("button", { class: "btn primary", type: "submit" }, "Open"));
  showVeil("This desk asks for its token", "Open the address that solinux-desk printed when it started, or paste the token here. It is also in ~/.config/solinux/desk-token on the system.", form);
  input.focus();
});

// ---------------------------------------------------------------- keys

registerCommands(() => [
  ...VIEWS.map((v) => ({ title: `Go to ${v.title}`, icon: v.icon, run: () => go(v.id) })),
  { title: "New terminal", icon: "terminal", keys: "Ctrl+`", run: () => go("terminal", { fresh: true }) },
  ...Object.values(state.config?.clusters ?? {}).map((url) => ({ title: `Use ${clusterName(url)}`, icon: "net", run: () => attempt(() => setCluster(url), `Now using ${clusterName(url)}`) })),
  state.validator?.installed && (state.validator.running
    ? { title: "Stop the local validator", icon: "stop", run: () => attempt(() => call("val.stop"), "The local validator stopped") }
    : { title: "Start the local validator", icon: "play", run: () => attempt(() => call("val.start", {}), "The local validator is starting") }),
  { title: "Reload what the desk knows", icon: "refresh", run: () => attempt(() => refreshConfig(), "Reloaded") },
].filter(Boolean));

document.addEventListener("keydown", (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === "k") { e.preventDefault(); palette(); }
  else if (mod && e.key === "`") { e.preventDefault(); go("terminal", { fresh: true }); }
  else if (e.altKey && /^[1-7]$/.test(e.key)) { e.preventDefault(); go(VIEWS[Number(e.key) - 1].id); }
});
$("#palette-btn").onclick = () => palette();
window.addEventListener("hashchange", () => { const id = location.hash.slice(2).split("/")[0]; if (id && id !== current && VIEWS.some((v) => v.id === id)) go(id); });

// ---------------------------------------------------------------- theme

export function applyTheme(choice = store.get("theme", "auto")) {
  document.documentElement.dataset.theme = choice === "auto" ? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark") : choice;
  window.dispatchEvent(new Event("themechange"));
}
matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => applyTheme());
applyTheme();

window.addEventListener("error", (e) => { console.error(e.error ?? e.message); });
window.addEventListener("unhandledrejection", (e) => { toast(e.reason?.message ?? String(e.reason), "bad"); });

connect();
