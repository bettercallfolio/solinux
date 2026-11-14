// The desktop: a panel on top, a dock on the left, and windows. The desktop's own
// applications (terminal, files, validator, …) are made the first time they are opened and
// then kept, so closing and reopening one loses nothing. Ordinary Linux applications get
// windows too (native.js).

import { $, el, icon, on, connect, session, menu, toast, short, sol, num, store, dialog, attempt, call, fill } from "./core.js";
import { state, setCluster, clusterName, refreshConfig } from "./state.js";
import { palette, registerCommands } from "./palette.js";
import { openWindow, findWindow, allWindows, focusedWindow, cycle } from "./wm.js";
import { launchApp, runCommand, restoreSessions, nativeSessions, appIcon } from "./native.js";
import home from "./views/home.js";
import terminal from "./views/terminal.js";
import files from "./views/files.js";
import validator from "./views/validator.js";
import explorer from "./views/explorer.js";
import wallets from "./views/wallets.js";
import software from "./views/software.js";
import { images, media, documents, calculator } from "./views/everyday.js";
import text from "./views/text.js";
import welcome from "./views/welcome.js";
import settings from "./views/settings.js";

// The desktop's own applications. `tint` colours the icon; w and h are the first size of the window.
const APPS = [
  { ...terminal, tint: "#86c7a4", w: 900, h: 560 },
  { ...files, tint: "#8fb4d9", w: 980, h: 620 },
  { ...home, title: "System", icon: "monitor", tint: "#b5a3d6", w: 1120, h: 720 },
  { ...validator, tint: "#d9b676", w: 1080, h: 700 },
  { ...explorer, tint: "#7fc7c9", w: 1000, h: 700 },
  { ...wallets, tint: "#e5a98f", w: 900, h: 600 },
  { ...software, tint: "#c9a7e0", w: 940, h: 660 },
  // Everyday applications: in the launcher, and in the dock while they are open.
  { ...welcome, tint: "#86c7a4", w: 760, h: 560, extra: true },
  { ...text, tint: "#d7dbdf", w: 820, h: 620, extra: true },
  { ...images, tint: "#8fd0a8", w: 900, h: 640, extra: true },
  { ...media, tint: "#e5a98f", w: 900, h: 600, extra: true },
  { ...documents, tint: "#d9b676", w: 900, h: 760, extra: true },
  { ...calculator, tint: "#9fb8e8", w: 340, h: 520, extra: true },
  { ...settings, tint: "#9aa3ad", w: 820, h: 680 },
];
const made = new Map();   // id -> { root, api }

function tile(app, size = 22) {
  return el("span", { class: "tile", style: { "--tint": app.tint } }, icon(app.icon, size));
}

/** Opens one of the desktop's applications, or brings it to the front. `arg` goes to the application. */
export function go(id, arg) {
  const app = APPS.find((a) => a.id === id) ?? APPS[0];
  let m = made.get(app.id);
  if (!m) {
    const root = el("div", { class: `view view-${app.id}` });
    m = { root, api: {} };
    made.set(app.id, m);
    m.api = app.create(root, { go, applyTheme }) ?? {};
  }
  const winId = `app-${app.id}`;
  let win = findWindow(winId);
  if (!win) {
    win = openWindow({
      id: winId, app: app.id, title: app.title, iconNode: tile(app, 13), width: app.w, height: app.h,
      onClose: () => { m.api.hide?.(); queueMicrotask(saveSession); return true; },
      onState: (what) => {
        if (what === "hide") m.api.hide?.();
        else if (what === "show") m.api.show?.();
        else if (what === "focus") m.api.focus?.();
      },
    });
    win.body.append(m.root);
  } else win.focus();
  m.api.show?.(arg);
  saveSession();
}

// ---------------------------------------------------------------- remembering what was open

let restoring = false;
function saveSession() {
  if (restoring) return;
  const open = allWindows().filter((w) => w.id.startsWith("app-")).sort((a, b) => Number(a.el.style.zIndex) - Number(b.el.style.zIndex)).map((w) => w.app);
  store.set("session", open);
}
function restoreSession() {
  restoring = true;
  const open = store.get("session", null);
  // The very first time: a few words about where things are.
  for (const id of open ?? ["welcome"]) if (APPS.some((a) => a.id === id)) go(id);
  restoring = false;
}

// ---------------------------------------------------------------- the dock

const dock = $("#dock");
function dockButton({ key, title, node, running, active, onclick, onmenu }) {
  return el("button", { class: `dock-btn ${running ? "running" : ""} ${active ? "active" : ""}`, title, "aria-label": title, data: { key }, onclick, oncontextmenu: onmenu && ((e) => { e.preventDefault(); onmenu(e.currentTarget); }) }, node, el("i", { class: "dock-dot" }));
}
function paintDock() {
  const focus = focusedWindow();
  const toggle = (win, open) => { if (!win) open(); else if (focus === win && !win.minimized) win.minimize(); else win.focus(); };
  fill(dock,
    el("button", { class: "dock-btn launcher-btn", title: "Applications", "aria-label": "Applications", onclick: () => launcher() }, el("span", { class: "tile plain" }, icon("grid", 22))),
    el("hr"),
    APPS.filter((a) => a.id !== "settings" && (!a.extra || findWindow(`app-${a.id}`))).map((a) => {
      const win = findWindow(`app-${a.id}`);
      return dockButton({
        key: a.id, title: a.title, node: tile(a), running: !!win, active: !!win && focus === win,
        onclick: () => toggle(win, () => go(a.id)),
        onmenu: (anchor) => menu(anchor, [
          { label: win ? "Show" : "Open", icon: "app", run: () => go(a.id) },
          a.id === "terminal" && { label: "New terminal", icon: "plus", run: () => go("terminal", { fresh: true }) },
          win && "-", win && { label: "Close", icon: "close", run: () => win.close() },
        ].filter(Boolean)),
      });
    }),
    nativeSessions().length ? el("hr") : null,
    nativeSessions().map(({ id, win }) => dockButton({
      key: `native-${id}`, title: win.title, node: el("span", { class: "tile native" }, win.iconNode?.cloneNode(true) ?? icon("app", 22)), running: true, active: focus === win,
      onclick: () => toggle(win, () => {}),
      onmenu: (anchor) => menu(anchor, [{ label: "Close", icon: "close", run: () => win.close() }, { label: "Force quit", icon: "trash", danger: true, run: () => call("apps.close", { id, force: true }) }]),
    })),
    el("span", { class: "gap" }),
    (() => {
      const a = APPS.find((x) => x.id === "settings"), win = findWindow("app-settings");
      return dockButton({ key: "settings", title: a.title, node: tile(a), running: !!win, active: !!win && focus === win, onclick: () => toggle(win, () => go("settings")) });
    })());
  for (const img of dock.querySelectorAll(".tile.native img")) { img.width = 26; img.height = 26; }
}

// ---------------------------------------------------------------- the panel

const clusterBtn = $("#cluster"), keyBtn = $("#key"), clock = $("#clock"), titleNode = $("#title");
function paintPanel() {
  const c = state.cluster;
  clusterBtn.className = `pill ${c.ok === true ? "good" : c.ok === false ? "bad" : ""}`;
  fill(clusterBtn, el("i", { class: "dot" }), el("span", { text: c.name || "no cluster" }),
    c.ok === true && c.slot !== null ? el("span", { class: "dim mono hide-narrow", text: `slot ${num(c.slot)}` })
      : c.ok === false ? el("span", { class: "dim hide-narrow", text: c.name === "localnet" && !state.validator?.running ? "stopped" : "no answer" }) : null,
    icon("down", 12));
  const key = state.keys.find((k) => k.isDefault);
  fill(keyBtn, icon("wallet", 14), key ? el("span", { class: "mono", text: short(key.address) }) : el("span", { text: "no key" }),
    key && state.balance !== null && c.ok ? el("span", { class: "dim mono hide-narrow", text: `${sol(state.balance, 3)} SOL` }) : null);
}
function paintClock() {
  const d = new Date();
  clock.textContent = d.toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" });
  clock.title = d.toLocaleString(undefined, { dateStyle: "full", timeStyle: "short" });
}
setInterval(paintClock, 5000); paintClock();
on("state", paintPanel); on("pulse", paintPanel);
on("wm", () => { titleNode.textContent = focusedWindow()?.title ?? ""; document.title = focusedWindow() ? `${focusedWindow().title} · Solinux` : "Solinux"; paintDock(); });

clusterBtn.onclick = () => {
  const urls = state.config?.clusters ?? {};
  const pick = (url) => attempt(() => setCluster(url), `Now using ${clusterName(url)}`);
  menu(clusterBtn, [
    ...Object.values(urls).map((url) => ({ label: clusterName(url), icon: state.cluster.url === url ? "check" : null, run: () => pick(url) })),
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
$("#brand").onclick = () => launcher();
$("#palette-btn").onclick = () => palette();

// ---------------------------------------------------------------- the launcher: every application, found by typing

let launcherOpen = null;
async function launcher() {
  if (launcherOpen) { closeLauncher(); return; }
  const input = el("input", { type: "search", placeholder: "Search applications", autocomplete: "off", spellcheck: false, "aria-label": "Search applications" });
  const grid = el("div", { class: "launch-grid" });
  const note = el("p", { class: "launch-note dim" });
  const box = el("div", { class: "launcher", onmousedown: (e) => { if (e.target === box || e.target === grid) closeLauncher(); } },
    el("div", { class: "launch-search" }, icon("search", 18), input), grid, note);
  document.body.append(box);
  launcherOpen = box;
  requestAnimationFrame(() => { box.classList.add("in"); input.focus(); });

  let native = [], graphics = { ready: true, missing: [] }, at = 0, shown = [];
  const items = () => [
    ...APPS.map((a) => ({ name: a.title, hint: "", node: () => tile(a, 30), run: () => go(a.id) })),
    ...native.map((a) => ({ name: a.name, hint: a.comment, node: () => el("span", { class: "tile native big" }, appIcon(a.icon, 44)), run: () => (a.terminal ? go("terminal", { argv: ["sh", "-c", a.exec.replace(/\s*%[a-zA-Z]/g, "")], title: a.name }) : launchApp(a.id, a.name)) })),
  ];
  const paintMark = () => [...grid.children].forEach((b, n) => b.classList.toggle("on", n === at && input.value.trim() !== ""));
  function paint() {
    const q = input.value.trim().toLowerCase();
    shown = items().filter((i) => !q || i.name.toLowerCase().includes(q) || i.hint.toLowerCase().includes(q));
    at = Math.min(at, Math.max(0, shown.length - 1));
    fill(grid, shown.map((i) => el("button", { class: "launch-item", title: i.hint || i.name, onclick: () => { closeLauncher(); i.run(); } }, i.node(), el("span", { text: i.name }))));
    paintMark();
    note.textContent = !shown.length ? "No application matches."
      : !graphics.ready ? `Graphical applications cannot be shown on this system yet (${graphics.missing.join(", ")} missing).`
        : !native.length ? "No graphical application is installed yet. Install one and it appears here." : "";
  }
  input.addEventListener("input", () => { at = 0; paint(); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeLauncher();
    else if (e.key === "Enter" && shown[at]) { e.preventDefault(); const i = shown[at]; closeLauncher(); i.run(); }   // (the key must not also reach the application that opens)
    else if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); at = (at + 1) % Math.max(1, shown.length); grid.children[at]?.classList.add("on"); [...grid.children].forEach((b, n) => b.classList.toggle("on", n === at)); }
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); at = (at + shown.length - 1) % Math.max(1, shown.length); [...grid.children].forEach((b, n) => b.classList.toggle("on", n === at)); }
  });
  paint();
  const r = await call("apps.list", { fresh: true }).catch(() => null);
  if (r && launcherOpen === box) { native = r.apps; graphics = r.graphics; paint(); }
}
function closeLauncher() {
  if (!launcherOpen) return;
  const b = launcherOpen; launcherOpen = null;
  b.classList.remove("in");
  setTimeout(() => b.remove(), 140);
}

// ---------------------------------------------------------------- the desktop itself

$("#desktop").addEventListener("contextmenu", (e) => {
  if (e.target !== e.currentTarget) return;
  e.preventDefault();
  menu({ x: e.clientX, y: e.clientY }, [
    { label: "New terminal", icon: "terminal", run: () => go("terminal", { fresh: true }) },
    { label: "Files", icon: "files", run: () => go("files") },
    { label: "Applications", icon: "grid", run: () => launcher() },
    "-",
    { label: "Settings", icon: "settings", run: () => go("settings") },
  ]);
});

// ---------------------------------------------------------------- connection

const veil = $("#veil");
function showVeil(title, text, action) {
  fill(veil, el("div", { class: "veil-box" }, el("div", { class: "logo big" }, el("i")), el("h2", { text: title }), el("p", { text }), action));
  veil.hidden = false;
}
let started = false;
on("connected", async (hello) => {
  veil.hidden = true;
  $("#host").textContent = hello.sys.hostname.split(".")[0];
  $("#host").title = hello.sys.hostname;
  if (!started) { started = true; restoreSession(); paintDock(); }
  const r = await call("apps.list").catch(() => null);
  if (r) restoreSessions(r.sessions);
});
let lostTimer = null;
on("disconnected", () => {
  // A blink (the server restarting, a laptop waking up) should not flash a message.
  clearTimeout(lostTimer);
  lostTimer = setTimeout(() => { if (!session.connected) showVeil("Connection lost", "The desktop cannot reach the system. It keeps trying."); }, 1200);
});
on("unauthorized", () => {
  const input = el("input", { type: "password", placeholder: "access token", autocomplete: "off" });
  const form = el("form", { class: "token-form", onsubmit: (e) => { e.preventDefault(); try { localStorage.setItem("desk-token", input.value.trim()); } catch { /* ignore */ } location.reload(); } },
    input, el("button", { class: "btn primary", type: "submit" }, "Open"));
  showVeil("This desktop asks for its token", "Open the address that solinux-desk printed when it started, or paste the token here. It is also in ~/.config/solinux/desk-token on the system.", form);
  input.focus();
});

// ---------------------------------------------------------------- commands and keys

registerCommands(() => [
  ...APPS.map((a) => ({ title: `Open ${a.title}`, icon: a.icon, run: () => go(a.id) })),
  { title: "New terminal", icon: "terminal", keys: "Ctrl+`", run: () => go("terminal", { fresh: true }) },
  { title: "Applications", icon: "grid", run: () => launcher() },
  { title: "Switch to the next window", icon: "app", keys: "Alt+`", run: () => cycle(1) },
  {
    title: "Run a graphical program…", icon: "play", run: async () => {
      const v = await dialog({ title: "Run a graphical program", fields: [{ name: "command", label: "Command", placeholder: "xterm", hint: "It opens in a window of its own." }], ok: "Run" });
      if (v?.command.trim()) runCommand(v.command.trim());
    },
  },
  ...Object.values(state.config?.clusters ?? {}).map((url) => ({ title: `Use ${clusterName(url)}`, icon: "net", run: () => attempt(() => setCluster(url), `Now using ${clusterName(url)}`) })),
  state.validator?.installed && (state.validator.running
    ? { title: "Stop the local validator", icon: "stop", run: () => attempt(() => call("val.stop"), "The local validator stopped") }
    : { title: "Start the local validator", icon: "play", run: () => attempt(() => call("val.start", {}), "The local validator is starting") }),
  { title: "Reload what the desktop knows", icon: "refresh", run: () => attempt(() => refreshConfig(), "Reloaded") },
].filter(Boolean));

// Keys that belong to the desktop are taken before the window under them sees them.
window.addEventListener("keydown", (e) => {
  const mod = e.ctrlKey || e.metaKey;
  const inProgram = e.target instanceof Element && e.target.closest(".xterm, .native-stage");
  let mine = true;
  if (mod && e.shiftKey && e.code === "Space") palette();
  else if (mod && !e.shiftKey && e.key.toLowerCase() === "k" && !inProgram) palette();
  else if (mod && e.key === "`") go("terminal", { fresh: true });
  else if (e.altKey && e.key === "`") cycle(1);
  else if (e.key === "Escape" && launcherOpen) closeLauncher();
  else mine = false;
  if (mine) { e.preventDefault(); e.stopPropagation(); }
}, true);

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
