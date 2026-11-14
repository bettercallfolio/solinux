// Windows of ordinary Linux applications. The application runs on the system on a display of
// its own; this module shows that display in a desktop window (through noVNC) and keeps the
// display the same size as the window.

import RFB from "./vendor/novnc/core/rfb.js";
import { el, icon, call, on, toast, session, attempt, menu } from "./core.js";
import { openWindow, findWindow } from "./wm.js";

const shown = new Map();   // session id -> { win, rfb }

/**
 * noVNC shows one pixel of the remote display per unit of the page, which is blurred on a
 * high-density screen. This asks for a display `density` times the size of the window and
 * shows it at 1/density: one remote pixel per pixel of the screen.
 */
class SharpRFB extends RFB {
  constructor(target, url, options, density) { super(target, url, options); this.density = density; }
  _screenSize() { const s = super._screenSize(); const d = this.density ?? 1; return { w: Math.round(s.w * d), h: Math.round(s.h * d) }; }
  _updateScale() { this._display.scale = 1 / (this.density ?? 1); this._fixScrollbars(); }
}
const density = () => Math.max(1, Math.min(3, Math.round((window.devicePixelRatio || 1) * 4) / 4));

/** The picture of an application's icon, or a drawn stand-in when it has none. */
export function appIcon(name, size = 20) {
  if (!name) return icon("app", size);
  const img = el("img", { class: "app-img", src: `/api/icon?name=${encodeURIComponent(name)}&t=${session.token}`, width: size, height: size, alt: "", draggable: false });
  const box = el("span", { class: "icon" }, img);
  img.addEventListener("error", () => box.replaceChildren(...icon("app", size).childNodes), { once: true });
  return box;
}

function show(s) {
  if (shown.has(s.id)) { const have = shown.get(s.id); if (s.title && have.win.title !== s.title) have.win.setTitle(s.title); return have.win; }
  const stage = el("div", { class: "native-stage" });
  const note = el("div", { class: "native-note", text: "Starting…" });
  let rfb = null, closing = 0;

  const win = openWindow({
    id: `native-${s.id}`, app: `native:${s.app || s.name}`, keep: `native:${s.app || s.name}`, title: s.title || s.name, iconNode: appIcon(s.icon, 16),
    width: Math.round(s.width / (s.scale || 1)), height: Math.round(s.height / (s.scale || 1)) + 38,
    onClose() {
      // The application decides: it may first ask about unsaved work. The window goes when the application has gone.
      call("apps.close", { id: s.id }).catch(() => {});
      clearTimeout(closing);
      closing = setTimeout(() => {
        if (!shown.has(s.id)) return;
        toast(`${s.name} is still open. It may be asking you something.`);
        forceBtn.hidden = false;
      }, 3500);
      return false;
    },
    onState(what) { if (what === "focus") rfb?.focus(); },
  });
  const forceBtn = el("button", { class: "win-btn force", title: "Force quit", hidden: true, onpointerdown: (e) => e.stopPropagation(), onclick: (e) => { e.stopPropagation(); call("apps.close", { id: s.id, force: true }).catch(() => {}); } }, icon("trash", 13));
  win.bar.querySelector(".win-buttons").prepend(forceBtn);
  win.bar.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    menu({ x: e.clientX, y: e.clientY }, [
      { label: "Close", icon: "close", run: () => win.close() },
      { label: "Force quit", icon: "trash", danger: true, run: () => call("apps.close", { id: s.id, force: true }).catch(() => {}) },
    ]);
  });
  win.body.classList.add("native");
  win.body.append(stage, note);

  function connect() {
    if (!shown.has(s.id)) return;
    const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/vnc/${s.id}?t=${session.token}`;
    rfb = new SharpRFB(stage, url, { shared: true }, s.scale || 1);
    rfb.resizeSession = true;      // the display follows the size of this window
    rfb.scaleViewport = false;
    rfb.clipViewport = false;
    rfb.focusOnClick = true;
    rfb.qualityLevel = 9; rfb.compressionLevel = 1;   // the server is usually this very computer: spend bandwidth, not time
    rfb.background = "transparent";
    rfb.addEventListener("connect", () => { note.hidden = true; if (findWindow(win.id) && !win.minimized) rfb.focus(); });
    rfb.addEventListener("disconnect", () => {
      rfb = null;
      if (!shown.has(s.id)) return;
      note.hidden = false; note.textContent = "Reconnecting…";
      setTimeout(connect, 600);
    });
    // What is copied inside the application lands on this computer's clipboard.
    rfb.addEventListener("clipboard", (e) => { navigator.clipboard?.writeText(e.detail.text).catch(() => {}); });
    shown.get(s.id).rfb = rfb;
  }
  // And what is on this computer's clipboard can be pasted inside the application.
  win.el.addEventListener("focusin", () => {
    navigator.clipboard?.readText?.().then((t) => { if (t && rfb) rfb.clipboardPasteFrom(t); }).catch(() => {});
  });

  shown.set(s.id, { win, rfb: null });
  connect();
  return win;
}

function gone(id) {
  const have = shown.get(id);
  if (!have) return;
  shown.delete(id);
  try { have.rfb?.disconnect(); } catch { /* already closed */ }
  have.win.destroy();
}

on("app.session", (s) => show(s));
on("app.closed", (e) => gone(e.id));

/** Starts an installed application (by the name of its .desktop file) and shows it. */
export async function launchApp(appId, name) {
  const w = Math.min(1100, Math.round(innerWidth * 0.62)), h = Math.min(760, Math.round(innerHeight * 0.66));
  const s = await attempt(() => call("apps.launch", { app: appId, width: w, height: h, scale: density() }));
  if (s) show(s);
  else if (name) console.warn(`${name} did not start`);
}

export async function runCommand(command) {
  const s = await attempt(() => call("apps.launch", { command, width: 900, height: 600, scale: density() }));
  if (s) show(s);
}

/** After a reload: the applications that are still running get their windows back. */
export function restoreSessions(list) {
  const live = new Set(list.map((s) => s.id));
  for (const id of [...shown.keys()]) if (!live.has(id)) gone(id);
  for (const s of list) show(s);
}

export const nativeSessions = () => [...shown.entries()].map(([id, v]) => ({ id, win: v.win }));
