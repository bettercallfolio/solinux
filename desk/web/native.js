// Windows of ordinary Linux applications. The application runs on the system on a display of
// its own; this module shows that display in a desktop window (through noVNC) and keeps the
// display the same size as the window.

import RFB from "./vendor/novnc/core/rfb.js";
import { el, icon, call, on, toast, session, attempt, menu } from "./core.js";
import { openWindow, findWindow, narrow } from "./wm.js";
import { registerSink, focusTouchInput, touchScreen } from "./touchkeys.js";

// X key symbols for the keys that have names
const KEYSYM = { Escape: 0xff1b, Tab: 0xff09, Enter: 0xff0d, Backspace: 0xff08, Delete: 0xffff, ArrowLeft: 0xff51, ArrowUp: 0xff52, ArrowRight: 0xff53, ArrowDown: 0xff54,
  Home: 0xff50, End: 0xff57, PageUp: 0xff55, PageDown: 0xff56, Insert: 0xff63, F1: 0xffbe, F2: 0xffbf, F3: 0xffc0, F4: 0xffc1, F5: 0xffc2, F6: 0xffc3, F7: 0xffc4, F8: 0xffc5, F9: 0xffc6, F10: 0xffc7, F11: 0xffc8, F12: 0xffc9 };
const CONTROL = 0xffe3, ALT = 0xffe9;
/** The X key symbol of a character. */
const symOf = (ch) => { const c = ch.codePointAt(0); return c < 0x100 ? c : 0x01000000 | c; };

/**
 * A window as a touchpad: a finger moves the pointer instead of pointing, the way a laptop's
 * pad does. A tap clicks, two fingers tapped click with the right button, two fingers moved
 * scroll, a tap followed at once by a touch that stays down drags. For small targets, which
 * a fingertip covers.
 */
function touchpad(stage) {
  const arrow = el("div", { class: "pad-cursor" });
  const layer = el("div", { class: "native-pad" }, arrow);
  let x = 0, y = 0, placed = false;
  const fingers = new Map();
  let moved = 0, started = 0, most = 0, lastTap = 0, dragging = false, wheel = 0;
  const canvas = () => stage.querySelector("canvas");
  const fire = (type, buttons, more = {}) => {
    const c = canvas();
    if (!c) return;
    const r = stage.getBoundingClientRect();
    const Kind = type === "wheel" ? WheelEvent : MouseEvent;
    c.dispatchEvent(new Kind(type, { bubbles: true, cancelable: true, clientX: r.left + x, clientY: r.top + y, buttons, ...more }));
  };
  const show = () => { arrow.style.transform = `translate(${x}px, ${y}px)`; };
  layer.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    layer.setPointerCapture(e.pointerId);
    if (!placed) { x = stage.clientWidth / 2; y = stage.clientHeight / 2; placed = true; show(); }
    if (!fingers.size) { moved = 0; started = e.timeStamp; most = 0; if (e.timeStamp - lastTap < 320) { dragging = true; fire("mousedown", 1); } }
    fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    most = Math.max(most, fingers.size);
  });
  layer.addEventListener("pointermove", (e) => {
    const f = fingers.get(e.pointerId);
    if (!f) return;
    const dx = e.clientX - f.x, dy = e.clientY - f.y;
    f.x = e.clientX; f.y = e.clientY;
    moved += Math.abs(dx) + Math.abs(dy);
    if (fingers.size >= 2) {
      // two fingers: the wheel (each finger reports the move, so half of it counts)
      wheel += dy / 2;
      if (Math.abs(wheel) >= 4) { fire("wheel", 0, { deltaY: -wheel * 3, deltaMode: 0 }); wheel = 0; }
      return;
    }
    // a little faster than the finger, and faster still for long strokes
    const speed = 1.3 + Math.min(1.2, Math.hypot(dx, dy) / 30);
    x = Math.max(0, Math.min(stage.clientWidth - 1, x + dx * speed));
    y = Math.max(0, Math.min(stage.clientHeight - 1, y + dy * speed));
    show();
    fire("mousemove", dragging ? 1 : 0);
  });
  const up = (e) => {
    if (!fingers.delete(e.pointerId) || fingers.size) return;
    if (dragging) { dragging = false; fire("mouseup", 0); lastTap = 0; return; }
    if (moved < 10 && e.timeStamp - started < 350) {
      const button = most >= 2 ? 2 : 1;
      fire("mousedown", button); fire("mouseup", 0);
      lastTap = most >= 2 ? 0 : e.timeStamp;
    }
  };
  layer.addEventListener("pointerup", up);
  layer.addEventListener("pointercancel", up);
  return layer;
}

const shown = new Map();   // session id -> { win, rfb }

/**
 * noVNC shows one pixel of the remote display per unit of the page, which is blurred on a
 * high-density screen. This asks for a display `density` times the size of the window and
 * shows it at 1/density: one remote pixel per pixel of the screen.
 *
 * On a small screen (a phone) the window is smaller than desktop applications are made for:
 * their toolbars and dialogs would be cut off. There the application gets a display with
 * room (at least ROOM_W by ROOM_H), of the window's proportions, and its picture is shown
 * smaller, so that all of it is in the window.
 */
const ROOM_W = 560, ROOM_H = 400, ROOM_MOST = 2;
/** How many times the window's size an application's display must be to have room. */
function room(w, h) {
  if (!narrow() || !w || !h) return 1;
  return Math.min(ROOM_MOST, Math.max(1, ROOM_W / w, ROOM_H / h));
}
class SharpRFB extends RFB {
  constructor(target, url, options, density) {
    super(target, url, options);
    this.density = density;
    this._screen.style.overflow = "hidden";   // the picture always fits: a scroll bar would only take room from it
  }
  // (the size the window gives, not the one on screen: a window that is just opening is
  // drawn a little smaller for a moment, and that must not become the display's size)
  _area() { return { w: this._screen.clientWidth, h: this._screen.clientHeight }; }
  _factor() { const s = this._area(); return (this.density ?? 1) * room(s.w, s.h); }
  _screenSize() { const s = this._area(); const k = this._factor(); return { w: Math.round(s.w * k), h: Math.round(s.h * k) }; }
  _updateScale() {
    const s = this._area();
    let scale = 1 / this._factor();
    // (a display that has not taken the size asked for, or cannot, is still shown whole)
    if (this._fbWidth && this._fbHeight && s.w && s.h) scale = Math.min(scale, s.w / this._fbWidth, s.h / this._fbHeight);
    this._display.scale = scale;
    this._fixScrollbars();
  }
  /**
   * On a touch screen a finger that moves scrolls, as it does everywhere else on a phone
   * (noVNC would press the mouse button and drag: text gets selected, the page stays).
   * Dragging is done in touchpad mode; a long press is still the right mouse button.
   */
  _handleGesture(ev) {
    if (ev.detail?.type !== "drag" || !touchScreen()) return super._handleGesture(ev);
    if (ev.type === "gesturestart" || !this._swipe) this._swipe = { x: ev.detail.clientX, y: ev.detail.clientY };
    const from = this._swipe;
    if (ev.type === "gestureend") this._swipe = null;
    return super._handleGesture({ type: ev.type, detail: { type: "twodrag", clientX: from.x, clientY: from.y, magnitudeX: ev.detail.clientX - from.x, magnitudeY: ev.detail.clientY - from.y } });
  }
}
/** The density an application draws with: the screen's, in quarter steps. */
const density = () => Math.max(1, Math.min(3, Math.round((window.devicePixelRatio || 1) * 4) / 4));
/**
 * The first size of an application's display (in units of the page) and its density. On a
 * small screen the window fills the desktop, and the display is larger than the window (see
 * room): the density is lowered by as much, in whole steps, so that the application draws
 * about as many pixels as the screen has.
 */
function firstSize() {
  if (!narrow()) return { width: Math.min(1100, Math.round(innerWidth * 0.62)), height: Math.min(760, Math.round(innerHeight * 0.66)), scale: density() };
  const r = document.getElementById("desktop").getBoundingClientRect();
  const w = r.width, h = Math.max(120, r.height - 38 - (document.body.classList.contains("has-touchbar") || !touchScreen() ? 0 : 53));
  const f = room(w, h);
  return { width: Math.round(w * f), height: Math.round(h * f), scale: Math.max(1, Math.min(3, Math.ceil((window.devicePixelRatio || 1) / f - 0.1))) };
}

/** The picture of an application's icon, or a drawn stand-in when it has none. */
export function appIcon(name, size = 20) {
  if (!name) return icon("app", size);
  const img = el("img", { class: "app-img", src: `/api/icon?name=${encodeURIComponent(name)}&t=${encodeURIComponent(session.token)}`, width: size, height: size, alt: "", draggable: false });
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

  // On a touch screen: the keys the on-screen keyboard lacks, the on-screen keyboard itself
  // (an application's picture cannot ask for it), and the window as a touchpad.
  let pad = null;
  const press = (sym, mods = {}) => {
    if (!rfb) return;
    if (mods.ctrl) rfb.sendKey(CONTROL, "ControlLeft", true);
    if (mods.alt) rfb.sendKey(ALT, "AltLeft", true);
    rfb.sendKey(sym, null);
    if (mods.alt) rfb.sendKey(ALT, "AltLeft", false);
    if (mods.ctrl) rfb.sendKey(CONTROL, "ControlLeft", false);
  };
  const padControl = {
    get on() { return !!pad; },
    toggle() { if (pad) { pad.remove(); pad = null; } else { pad = touchpad(stage); stage.append(pad); } },
  };
  registerSink(stage, {
    key(name, mods) { if (KEYSYM[name]) press(KEYSYM[name], mods); },
    text(chars, mods) { for (const ch of chars) press(symOf(ch), mods); },
    keyboard() { focusTouchInput(); },
    pad: padControl,
  });

  function connect() {
    if (!shown.has(s.id)) return;
    const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/vnc/${s.id}?t=${encodeURIComponent(session.token)}`;
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
on("app.closed", (e) => {
  if (e.silent === false) toast(`${e.name} ended without opening a window. If it works on a file, open one with it from Files (Open with).`, "bad");
  gone(e.id);
});

/** Starts an installed application (by the name of its .desktop file) and shows it. */
export async function launchApp(appId, name, file) {
  // (the first application of a session can take a while to come up: say that something is happening)
  const slow = setTimeout(() => toast(`Starting ${name ?? "the application"}…`), 1500);
  const s = await attempt(() => call("apps.launch", { app: appId, ...firstSize(), ...(file && { file }) }));
  clearTimeout(slow);
  if (s) show(s);
  else if (name) console.warn(`${name} did not start`);
}

export async function runCommand(command) {
  const s = await attempt(() => call("apps.launch", { command, ...(narrow() ? firstSize() : { width: 900, height: 600, scale: density() }) }));
  if (s) show(s);
}

/** After a reload: the applications that are still running get their windows back. */
export function restoreSessions(list) {
  const live = new Set(list.map((s) => s.id));
  for (const id of [...shown.keys()]) if (!live.has(id)) gone(id);
  for (const s of list) show(s);
}

export const nativeSessions = () => [...shown.entries()].map(([id, v]) => ({ id, win: v.win }));
