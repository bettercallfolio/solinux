// The window manager of the desktop: windows that can be moved, resized, snapped to a half
// of the screen, maximized, minimized and closed. It knows nothing about what is inside a
// window; it hands out a body element and reports what happens to the window.

import { el, icon, store, emit } from "./core.js";

const MIN_W = 340, MIN_H = 220, SNAP = 14;
const desktop = () => document.getElementById("desktop");
const narrow = () => matchMedia("(max-width: 720px)").matches;

const windows = new Map();   // id -> Win
let zTop = 10;
let focused = null;
let preview = null;

export const allWindows = () => [...windows.values()];
export const focusedWindow = () => focused;
export const findWindow = (id) => windows.get(id) ?? null;

function area() { const d = desktop(); watchArea(d); const r = d.getBoundingClientRect(); return { w: r.width, h: r.height }; }

class Win {
  constructor(o) {
    this.id = o.id; this.app = o.app; this.title = o.title; this.iconNode = o.iconNode;
    this.onClose = o.onClose ?? (() => true);     // return false to keep the window open
    this.onState = o.onState ?? (() => {});       // "show" | "hide" | "focus" | "resize"
    this.state = "normal";                        // normal | max | left | right
    this.minimized = false;
    this.keep = o.keep ?? o.app;                  // the name its place is remembered under

    const saved = store.get(`win.${this.keep}`, null);
    const a = area();
    const n = windows.size;
    const w = Math.min(saved?.w ?? o.width ?? 900, a.w), h = Math.min(saved?.h ?? o.height ?? 600, a.h);
    this.w = Math.max(MIN_W, w); this.h = Math.max(MIN_H, h);
    this.x = saved?.x ?? Math.max(0, Math.round((a.w - this.w) / 2) + (n % 6) * 26 - 50);
    this.y = saved?.y ?? Math.max(0, Math.round((a.h - this.h) / 2.6) + (n % 6) * 26 - 20);
    // A new window starts where all of it can be seen.
    this.x = Math.max(0, Math.min(this.x, a.w - this.w)); this.y = Math.max(0, Math.min(this.y, a.h - this.h));
    this.fit();

    this.titleNode = el("span", { class: "win-title", text: o.title });
    this.body = el("div", { class: "win-body" });
    const btn = (cls, name, label, run) => el("button", { class: `win-btn ${cls}`, title: label, "aria-label": label, onclick: (e) => { e.stopPropagation(); run(); }, onpointerdown: (e) => e.stopPropagation() }, icon(name, 13));
    this.bar = el("header", { class: "win-bar" }, el("span", { class: "win-icon" }, o.iconNode?.cloneNode(true)), this.titleNode,
      el("div", { class: "win-buttons" },
        btn("min", "minus", "Minimize", () => this.minimize()),
        btn("max", "square", "Maximize", () => this.toggleMax()),
        btn("close", "close", "Close", () => this.close())));
    this.el = el("section", { class: "win opening", role: "dialog", "aria-label": o.title, tabIndex: -1 }, this.bar, this.body,
      ["n", "s", "e", "w", "ne", "nw", "se", "sw"].map((d) => el("i", { class: `rz rz-${d}`, data: { dir: d } })));
    this.el.addEventListener("pointerdown", () => this.focus(), true);
    this.bar.addEventListener("pointerdown", (e) => this.#drag(e));
    this.bar.addEventListener("dblclick", () => this.toggleMax());
    for (const h of this.el.querySelectorAll(".rz")) h.addEventListener("pointerdown", (e) => this.#resize(e, h.dataset.dir));
    desktop().append(this.el);
    windows.set(this.id, this);
    if (saved?.state && saved.state !== "normal") this.state = saved.state;
    this.apply();
    requestAnimationFrame(() => this.el.classList.remove("opening"));
    this.focus();
    emit("wm");
  }

  /** Keeps the window where a person can reach it. */
  fit() {
    const a = area();
    this.w = Math.max(MIN_W, Math.min(this.w, a.w)); this.h = Math.max(MIN_H, Math.min(this.h, a.h));
    this.x = Math.max(80 - this.w, Math.min(this.x, a.w - 80));
    this.y = Math.max(0, Math.min(this.y, a.h - 36));
  }

  apply(animate = false) {
    const a = area();
    let { x, y, w, h } = this;
    const state = narrow() ? "max" : this.state;
    if (state === "max") { x = 0; y = 0; w = a.w; h = a.h; }
    else if (state === "left") { x = 0; y = 0; w = Math.round(a.w / 2); h = a.h; }
    else if (state === "right") { x = Math.round(a.w / 2); y = 0; w = a.w - Math.round(a.w / 2); h = a.h; }
    if (animate) { this.el.classList.add("anim"); setTimeout(() => this.el.classList.remove("anim"), 190); }
    this.el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    this.el.style.width = `${w}px`; this.el.style.height = `${h}px`;
    this.el.dataset.state = state;
    this.el.classList.toggle("minimized", this.minimized);
    this.onState("resize");
  }

  remember() { store.set(`win.${this.keep}`, { x: this.x, y: this.y, w: this.w, h: this.h, state: this.state }); }

  setTitle(title) { this.title = title; this.titleNode.textContent = title; this.el.setAttribute("aria-label", title); emit("wm"); }

  focus() {
    if (this.minimized) { this.minimized = false; this.apply(); this.onState("show"); }
    if (focused === this) return;
    focused?.el.classList.remove("focused");
    focused = this;
    this.el.style.zIndex = String(++zTop);
    this.el.classList.add("focused");
    this.onState("focus");
    emit("wm");
  }

  minimize() {
    if (this.minimized) return;
    this.minimized = true;
    this.apply();
    this.onState("hide");
    if (focused === this) { focused = null; this.el.classList.remove("focused"); topWindow()?.focus(); }
    emit("wm");
  }

  toggleMax() { this.state = this.state === "max" ? "normal" : "max"; this.apply(true); this.remember(); }

  /** Asks the window to close. What it holds may refuse (an application with unsaved work). */
  close() { if (this.onClose() !== false) this.destroy(); }

  destroy() {
    if (!windows.has(this.id)) return;
    windows.delete(this.id);
    this.el.classList.add("closing");
    setTimeout(() => this.el.remove(), 140);
    if (focused === this) { focused = null; topWindow()?.focus(); }
    emit("wm");
  }

  #drag(e) {
    if (e.button !== 0 || narrow()) return;
    const start = { px: e.clientX, py: e.clientY, x: this.x, y: this.y };
    const r = desktop().getBoundingClientRect();
    let moved = false, snap = null, frame = 0, last = e;
    const move = (ev) => {
      last = ev;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const dx = last.clientX - start.px, dy = last.clientY - start.py;
        if (!moved && Math.hypot(dx, dy) < 5) return;
        if (!moved) {
          moved = true;
          document.body.classList.add("wm-busy");
          if (this.state !== "normal") {
            // Pulled out of a snapped place: back to its own size, under the pointer where it was grabbed.
            const now = this.el.getBoundingClientRect();
            const ratio = (start.px - now.left) / now.width;
            this.state = "normal";
            start.x = start.px - r.left - ratio * this.w; start.y = start.py - r.top - 16;
          }
        }
        this.x = Math.round(start.x + dx); this.y = Math.max(0, Math.round(start.y + dy));
        this.apply();
        const px = last.clientX - r.left, py = last.clientY - r.top;
        snap = py < SNAP ? "max" : px < SNAP ? "left" : px > r.width - SNAP ? "right" : null;
        showPreview(snap);
      });
    };
    const up = () => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up);
      cancelAnimationFrame(frame);
      document.body.classList.remove("wm-busy");
      showPreview(null);
      if (!moved) return;
      if (snap) { this.state = snap; this.x = start.x; this.y = start.y; this.apply(true); }
      else { this.fit(); this.apply(); }
      this.remember();
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up); window.addEventListener("pointercancel", up);
  }

  #resize(e, dir) {
    if (e.button !== 0 || narrow()) return;
    e.preventDefault(); e.stopPropagation();
    const now = this.el.getBoundingClientRect(), r = desktop().getBoundingClientRect();
    // Resizing a snapped or maximized window starts from what is on screen.
    this.state = "normal"; this.x = now.left - r.left; this.y = now.top - r.top; this.w = now.width; this.h = now.height;
    const s = { px: e.clientX, py: e.clientY, x: this.x, y: this.y, w: this.w, h: this.h };
    let frame = 0, last = e;
    document.body.classList.add("wm-busy");
    document.body.style.cursor = getComputedStyle(e.currentTarget).cursor;
    const move = (ev) => {
      last = ev;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const dx = last.clientX - s.px, dy = last.clientY - s.py;
        if (dir.includes("e")) this.w = Math.max(MIN_W, s.w + dx);
        if (dir.includes("s")) this.h = Math.max(MIN_H, s.h + dy);
        if (dir.includes("w")) { this.w = Math.max(MIN_W, s.w - dx); this.x = s.x + s.w - this.w; }
        if (dir.includes("n")) { this.h = Math.max(MIN_H, Math.min(s.h - dy, s.y + s.h)); this.y = s.y + s.h - this.h; }
        this.apply();
      });
    };
    const up = () => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up);
      cancelAnimationFrame(frame);
      document.body.classList.remove("wm-busy"); document.body.style.cursor = "";
      this.fit(); this.apply(); this.remember();
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up); window.addEventListener("pointercancel", up);
  }
}

function showPreview(kind) {
  if (!kind) { preview?.remove(); preview = null; return; }
  if (!preview) { preview = el("div", { class: "snap-preview" }); desktop().append(preview); }
  preview.dataset.kind = kind;
}

function topWindow() {
  let best = null;
  for (const w of windows.values()) if (!w.minimized && (!best || Number(w.el.style.zIndex) > Number(best.el.style.zIndex))) best = w;
  return best;
}

/** openWindow({ id, app, title, iconNode, width, height, onClose, onState }) -> Win (or the one already open) */
export function openWindow(o) {
  const have = windows.get(o.id);
  if (have) { have.focus(); return have; }
  return new Win(o);
}

/** Windows in the order they were last used, for switching between them. */
export function cycle(step = 1) {
  const list = allWindows().sort((a, b) => Number(b.el.style.zIndex) - Number(a.el.style.zIndex));
  if (list.length < 2) { list[0]?.focus(); return; }
  (step > 0 ? list[1] : list[list.length - 1]).focus();
}

let resizeTimer = 0;
const relayout = () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { for (const w of windows.values()) { w.fit(); w.apply(); } }, 60);
};
window.addEventListener("resize", relayout);
// The space for windows also changes without the page changing size: the touch keys take a
// strip of it, an on-screen keyboard takes more.
let watched = null;
function watchArea(node) {
  if (watched === node || typeof ResizeObserver !== "function") return;
  watched = node;
  let w = node.clientWidth, h = node.clientHeight;
  new ResizeObserver(() => { if (node.clientWidth !== w || node.clientHeight !== h) { w = node.clientWidth; h = node.clientHeight; relayout(); } }).observe(node);
}
