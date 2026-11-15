// Touch keys: what a phone or a tablet lacks for a terminal and for desktop applications.
//
// A bar above the dock (and above the on-screen keyboard when that is open) with the keys an
// on-screen keyboard does not have (Esc, Tab, Ctrl, Alt, the arrows), a button that brings
// the on-screen keyboard up, and for desktop applications a button that turns the window
// into a touchpad. It shows when the screen is a touch screen and a window that takes keys
// has the focus; Settings can turn it on or off for good.
//
// Windows say how they take keys by registering a sink:
//   key(name, mods)     a named key: "Escape", "Tab", "ArrowUp", "Enter", "Backspace", ...
//   text(string, mods)  typed characters
//   keyboard()          bring the on-screen keyboard up (the sink decides how)
//   pad?: { on, toggle() }   for windows that can act as a touchpad
// mods is { ctrl, alt }: Ctrl and Alt on the bar stay down for the next key only.
import { el, on, store } from "./core.js";
import { focusedWindow } from "./wm.js";

const sinks = new Map();   // an element inside a window -> its sink
const mods = { ctrl: false, alt: false };
let bar = null, input = null, current = null;

export const touchScreen = () => matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
/** "auto" (on a touch screen), "on" or "off". */
export const touchKeysSetting = () => store.get("touchkeys", "auto");
export function setTouchKeys(value) { store.set("touchkeys", value); refresh(); }
const wanted = () => { const s = touchKeysSetting(); return s === "on" || (s === "auto" && touchScreen()); };

/** A window's content says how it takes keys. Returns a function that takes the registration back. */
export function registerSink(node, sink) {
  sinks.set(node, sink);
  refresh();
  return () => { sinks.delete(node); refresh(); };
}

/** The modifiers that are held on the bar, taken (they apply to one key). */
export function takeMods() {
  const m = { ...mods };
  if (mods.ctrl || mods.alt) { mods.ctrl = mods.alt = false; paint(); }
  return m;
}

/**
 * For terminals: what was typed, with the bar's Ctrl or Alt applied to it (Ctrl+c is the
 * character 3, Alt puts Escape in front).
 */
export function withMods(data) {
  if (!mods.ctrl && !mods.alt) return data;
  const m = takeMods();
  let out = data;
  if (m.ctrl && data.length === 1) {
    const c = data.toLowerCase().charCodeAt(0);
    if (c >= 97 && c <= 122) out = String.fromCharCode(c - 96);
    else if (data === " " || data === "@") out = "\x00";
    else if (data === "[") out = "\x1b"; else if (data === "\\") out = "\x1c"; else if (data === "]") out = "\x1d";
  }
  return m.alt ? `\x1b${out}` : out;
}

function sinkOfFocused() {
  // (the launcher or a dialog is in front: keys are not for the window behind it)
  if (document.querySelector("body > .launcher, body > .shade")) return null;
  const w = focusedWindow();
  if (!w || w.minimized) return null;
  for (const [node, sink] of sinks) if (w.el.contains(node) && node.offsetParent !== null) return sink;
  return null;
}

const KEYS = [
  ["esc", "Esc", "Escape"], ["tab", "Tab", "Tab"], ["ctrl", "Ctrl", null], ["alt", "Alt", null],
  ["left", "←", "ArrowLeft"], ["down", "↓", "ArrowDown"], ["up", "↑", "ArrowUp"], ["right", "→", "ArrowRight"],
  ["home", "Home", "Home"], ["end", "End", "End"], ["pgup", "PgUp", "PageUp"], ["pgdn", "PgDn", "PageDown"],
  ["pipe", "|", "|"], ["slash", "/", "/"], ["dash", "-", "-"], ["tilde", "~", "~"],
];

function build() {
  // What the on-screen keyboard types into when a desktop application has the focus. It always
  // holds one character, so that Backspace has something to delete and says so.
  input = el("input", { class: "touch-input", type: "text", value: " ", autocapitalize: "off", autocomplete: "off", autocorrect: "off", spellcheck: false, "aria-label": "Keyboard for the application", tabIndex: -1 });
  input.addEventListener("beforeinput", (e) => {
    if (!current) return;
    if (e.inputType === "deleteContentBackward") { e.preventDefault(); current.key("Backspace", takeMods()); }
    else if (e.inputType === "insertLineBreak" || e.inputType === "insertParagraph") { e.preventDefault(); current.key("Enter", takeMods()); }
    else if (e.inputType?.startsWith("insert") && e.data) { e.preventDefault(); current.text(e.data, takeMods()); }
  });
  input.addEventListener("keydown", (e) => {
    if (!current || e.isComposing || e.key === "Unidentified" || e.key === "Process") return;
    if (e.key.length > 1 && !["Shift", "Control", "Alt", "Meta", "Dead", "CapsLock"].includes(e.key)) { e.preventDefault(); current.key(e.key, takeMods()); }
  });
  input.addEventListener("input", () => { input.value = " "; });

  const button = (cls, label, run, title) => el("button", { class: `tk ${cls}`, type: "button", title: title ?? label, "aria-label": title ?? label,
    // (pointerdown, and no focus change: the on-screen keyboard must stay where it is)
    onpointerdown: (e) => { e.preventDefault(); run(); } }, label);
  bar = el("div", { class: "touchbar", hidden: true, role: "toolbar", "aria-label": "Keys" },
    button("kbd", "abc", () => current?.keyboard(), "Keyboard"),
    button("pad", "pad", () => { current?.pad?.toggle(); paint(); }, "Use the window as a touchpad"),
    el("div", { class: "tk-scroll" }, KEYS.map(([id, label, key]) => button(id, label, () => {
      if (!current) return;
      if (id === "ctrl" || id === "alt") { mods[id] = !mods[id]; paint(); return; }
      if (key.length === 1) current.text(key, takeMods()); else current.key(key, takeMods());
    }))),
    input);
  document.body.append(bar);
  // The bar sits on the dock; when the on-screen keyboard covers the bottom of the page, on that.
  const place = () => {
    // (on a narrow screen the dock lies along the bottom: the bar sits on it, however tall it is)
    const dock = document.getElementById("dock");
    const below = dock && matchMedia("(max-width: 720px)").matches && dock.offsetParent !== null ? dock.offsetHeight : 0;
    bar.style.setProperty("--dock-below", `${below}px`);
    const vv = window.visualViewport;
    const covered = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
    // (the page itself makes room too: what is typed must not be hidden behind the keyboard)
    document.documentElement.style.setProperty("--kbd", `${Math.round(covered)}px`);
    document.documentElement.classList.toggle("kbd-open", covered > 80);
  };
  window.visualViewport?.addEventListener("resize", place);
  window.visualViewport?.addEventListener("scroll", place);
  window.addEventListener("resize", place);
  placeBar = place;
  place();
}
let placeBar = () => {};

function paint() {
  if (!bar) return;
  bar.querySelector(".tk.ctrl").classList.toggle("on", mods.ctrl);
  bar.querySelector(".tk.alt").classList.toggle("on", mods.alt);
  const pad = bar.querySelector(".tk.pad");
  pad.hidden = !current?.pad;
  pad.classList.toggle("on", !!current?.pad?.on);
}

function refresh() {
  const sink = wanted() ? sinkOfFocused() : null;
  if (!sink && !bar) return;
  if (!bar) build();
  current = sink;
  bar.hidden = !sink;
  document.body.classList.toggle("has-touchbar", !!sink);
  placeBar();
  paint();
}

/** The field the on-screen keyboard types into, for sinks that have none of their own. */
export function focusTouchInput() { if (!bar) build(); input.value = " "; input.focus({ preventScroll: true }); }

on("wm", () => queueMicrotask(refresh));
// (the launcher and dialogs come and go as children of the page)
new MutationObserver(() => queueMicrotask(refresh)).observe(document.body, { childList: true });
window.addEventListener("resize", refresh);
