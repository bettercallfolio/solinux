// The parts every view uses: the connection to the server, small helpers for building
// the page, and the shared pieces of interface (messages, dialogs, menus).

// ---------------------------------------------------------------- building elements

/** el("div", { class: "x", onclick: fn }, child, "text", ...) */
export function el(tag, props, ...children) {
  const node = document.createElement(tag);
  if (props && (props instanceof Node || typeof props !== "object" || Array.isArray(props))) { children.unshift(props); props = null; }
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k === "html") node.innerHTML = v;
    else if (k === "style" && typeof v === "object") {
      // custom properties (--tint) can only be set by name
      for (const [name, value] of Object.entries(v)) { if (name.startsWith("--")) node.style.setProperty(name, value); else node.style[name] = value; }
    }
    else if (k === "data") Object.assign(node.dataset, v);
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else if (k in node && k !== "list" && k !== "form") node[k] = v;
    else node.setAttribute(k, v === true ? "" : v);
  }
  add(node, children);
  return node;
}
function add(node, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}
export const $ = (sel, root = document) => root.querySelector(sel);

/** Replaces what is inside a node. Unlike replaceChildren, it leaves out null, undefined and false. */
export function fill(node, ...children) {
  const next = [];
  for (const c of children.flat(Infinity)) if (c !== null && c !== undefined && c !== false) next.push(c instanceof Node ? c : document.createTextNode(String(c)));
  node.replaceChildren(...next);
  return node;
}

/** An icon by name. The drawings are in icons.js. */
import { ICONS } from "./icons.js";
export function icon(name, size = 18) {
  const span = document.createElement("span");
  span.className = "icon";
  span.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] ?? ""}</svg>`;
  return span;
}

// ---------------------------------------------------------------- words for numbers

export function bytes(n) {
  if (!Number.isFinite(n)) return "-";
  const units = ["B", "kB", "MB", "GB", "TB"];
  let i = 0;
  while (n >= 1000 && i < units.length - 1) { n /= 1000; i++; }
  return `${n >= 100 || i === 0 ? Math.round(n) : n.toFixed(1)} ${units[i]}`;
}
export function duration(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (d) return `${d} d ${h} h`;
  if (h) return `${h} h ${m} min`;
  if (m) return `${m} min ${s % 60} s`;
  return `${s} s`;
}
export function ago(ms) {
  const s = (Date.now() - ms) / 1000;
  if (s < 5) return "just now";
  if (s < 60) return `${Math.floor(s)} s ago`;
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(ms).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
export const num = (n) => (Number.isFinite(Number(n)) ? Number(n).toLocaleString("en-US") : "-");
export function sol(lamports, digits = 4) {
  if (lamports === null || lamports === undefined) return "-";
  const v = Number(lamports) / 1e9;
  return v.toLocaleString("en-US", { minimumFractionDigits: v === 0 ? 0 : Math.min(2, digits), maximumFractionDigits: digits });
}
export const short = (s, n = 4) => (s && s.length > n * 2 + 1 ? `${s.slice(0, n)}…${s.slice(-n)}` : s ?? "");

// ---------------------------------------------------------------- the connection

const listeners = new Map();   // event name -> set of functions
export function on(event, fn) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(fn);
  return () => listeners.get(event)?.delete(fn);
}
export function emit(event, data) { for (const fn of listeners.get(event) ?? []) { try { fn(data); } catch (e) { console.error(e); } } }

export const session = { token: "", connected: false, hello: null };

function readToken() {
  const m = location.hash.match(/token=([0-9a-f]+)/);
  if (m) {
    try { localStorage.setItem("desk-token", m[1]); } catch { /* storage may be off */ }
    history.replaceState(null, "", location.pathname + location.hash.replace(/#?token=[0-9a-f]+/, "") );
    return m[1];
  }
  try { return localStorage.getItem("desk-token") ?? ""; } catch { return ""; }
}

let ws = null;
let nextId = 1;
const waiting = new Map();
const topics = new Set();
const termSinks = new Map();   // terminal id -> function(bytes)
let retry = 0;

export function connect() {
  session.token = readToken();
  open();
}

function open() {
  const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws?t=${session.token}`;
  ws = new WebSocket(url);
  ws.binaryType = "arraybuffer";
  let opened = false;
  ws.onopen = async () => {
    opened = true; retry = 0;
    try {
      session.hello = await call("hello", { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
      for (const t of topics) call("sub", { topic: t }).catch(() => {});
      session.connected = true;
      emit("connected", session.hello);
    } catch (e) { console.error(e); }
  };
  ws.onmessage = (m) => {
    if (typeof m.data !== "string") {
      const id = new DataView(m.data).getUint32(0, true);
      termSinks.get(id)?.(new Uint8Array(m.data, 4));
      return;
    }
    const msg = JSON.parse(m.data);
    if (msg.ev) { emit(msg.ev, msg.d); return; }
    const w = waiting.get(msg.id);
    if (!w) return;
    waiting.delete(msg.id);
    if (msg.e !== undefined) w.reject(new Error(msg.e)); else w.resolve(msg.r);
  };
  ws.onclose = () => {
    const was = session.connected;
    session.connected = false;
    for (const w of waiting.values()) w.reject(new Error("the connection to the system was lost"));
    waiting.clear();
    if (was) emit("disconnected");
    // A socket that never opened usually means the token is wrong; ask the server which it is.
    if (!opened) {
      fetch("/api/ping").then((r) => r.json()).then((p) => { if (p.token) emit("unauthorized"); }).catch(() => {});
    }
    retry = Math.min(retry + 1, 8);
    setTimeout(open, opened ? 400 : 300 * retry);
  };
}

/** Asks the server to do something and waits for its answer. */
export function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) { reject(new Error("not connected to the system")); return; }
    const id = nextId++;
    waiting.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, m: method, p: params }));
  });
}

/** Asks for a stream of events ("sys") for as long as the page lives; survives reconnects. */
export function subscribe(topic) {
  if (topics.has(topic)) return;
  topics.add(topic);
  if (session.connected) call("sub", { topic }).catch(() => {});
}
export function unsubscribe(topic) {
  if (!topics.delete(topic)) return;
  if (session.connected) call("unsub", { topic }).catch(() => {});
}

export function termSink(id, fn) { if (fn) termSinks.set(id, fn); else termSinks.delete(id); }
export function termInput(id, data) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const body = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const out = new Uint8Array(4 + body.length);
  new DataView(out.buffer).setUint32(0, id, true);
  out.set(body, 4);
  ws.send(out);
}

/** A JSON-RPC request to the Solana cluster the system is set to (or the one named). */
export async function rpc(method, params = [], cluster = "config") {
  const res = await fetch(`/api/rpc?c=${encodeURIComponent(cluster)}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-desk-token": session.token },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const data = await res.json().catch(() => null);
  if (!data) throw new Error(`the cluster did not answer (HTTP ${res.status})`);
  if (data.error) throw new Error(data.error.message ?? data.error);
  return data.result;
}

export const fileUrl = (path) => `/api/file?path=${encodeURIComponent(path)}&t=${session.token}`;

// ---------------------------------------------------------------- messages

let toastBox = null;
export function toast(text, kind = "") {
  if (!toastBox) { toastBox = el("div", { class: "toasts", role: "status", "aria-live": "polite" }); document.body.append(toastBox); }
  const t = el("div", { class: `toast ${kind}` }, text);
  toastBox.append(t);
  requestAnimationFrame(() => t.classList.add("in"));
  setTimeout(() => { t.classList.remove("in"); setTimeout(() => t.remove(), 250); }, kind === "bad" ? 6000 : 2600);
}
/** Runs something that may fail and says so if it does. Returns the result, or undefined. */
export async function attempt(work, okText) {
  try {
    const r = await work();
    if (okText) toast(okText, "good");
    return r;
  } catch (e) {
    toast(e.message || String(e), "bad");
    return undefined;
  }
}

export async function copyText(text, what = "Copied") {
  try { await navigator.clipboard.writeText(text); toast(what, "good"); }
  catch {
    const t = el("textarea", { value: text, style: { position: "fixed", opacity: "0" } });
    document.body.append(t); t.select();
    try { document.execCommand("copy"); toast(what, "good"); } catch { toast("Copying is not allowed here", "bad"); }
    t.remove();
  }
}

// ---------------------------------------------------------------- dialogs

/**
 * dialog({ title, body, fields, ok, danger }) -> the values of the fields, or null when cancelled.
 * fields: [{ name, label, value, placeholder, type, hint, options }]
 */
export function dialog({ title, body, fields = [], ok = "OK", cancel = "Cancel", danger = false }) {
  return new Promise((resolve) => {
    const inputs = {};
    const form = el("form", { class: "dialog", role: "dialog", "aria-modal": "true", "aria-label": title },
      el("h2", { text: title }),
      body && el("div", { class: "dialog-body" }, body),
      fields.map((f) => {
        const input = f.type === "select"
          ? el("select", { name: f.name }, f.options.map((o) => el("option", { value: o.value ?? o, text: o.label ?? o, selected: (o.value ?? o) === f.value })))
          : f.type === "textarea"
            ? el("textarea", { name: f.name, value: f.value ?? "", placeholder: f.placeholder ?? "", rows: f.rows ?? 4, spellcheck: false })
            : f.type === "checkbox"
              ? el("input", { type: "checkbox", name: f.name, checked: !!f.value })
              : el("input", { type: f.type ?? "text", name: f.name, value: f.value ?? "", placeholder: f.placeholder ?? "", autocomplete: "off", spellcheck: false, step: f.type === "number" ? (f.step ?? "any") : null, min: f.type === "number" ? (f.min ?? "0") : null });
        inputs[f.name] = input;
        return el("label", { class: f.type === "checkbox" ? "field check" : "field" },
          f.type === "checkbox" ? [input, el("span", { text: f.label })] : [el("span", { text: f.label }), input],
          f.hint && el("small", { text: f.hint }));
      }),
      el("div", { class: "dialog-buttons" },
        cancel && el("button", { type: "button", class: "btn", onclick: () => done(null) }, cancel),
        el("button", { type: "submit", class: `btn ${danger ? "danger" : "primary"}` }, ok)));
    const shade = el("div", { class: "shade", onmousedown: (e) => { if (e.target === shade) done(null); } }, form);
    function done(value) {
      document.removeEventListener("keydown", key, true);
      shade.classList.remove("in");
      // While it fades it is no longer a dialog: nothing can be typed into it or found in it.
      shade.inert = true; form.classList.add("closing"); form.removeAttribute("role");
      for (const input of form.querySelectorAll("input, select, textarea, button")) input.disabled = true;
      setTimeout(() => shade.remove(), 150);
      resolve(value);
    }
    function key(e) { if (e.key === "Escape") { e.stopPropagation(); done(null); } }
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const values = {};
      for (const [name, input] of Object.entries(inputs)) values[name] = input.type === "checkbox" ? input.checked : input.value;
      done(values);
    });
    document.addEventListener("keydown", key, true);
    document.body.append(shade);
    requestAnimationFrame(() => {
      shade.classList.add("in");
      (Object.values(inputs)[0] ?? form.querySelector("button[type=submit]")).focus();
      Object.values(inputs)[0]?.select?.();
    });
  });
}
export const confirmDialog = (title, body, ok = "OK", danger = false) => dialog({ title, body, ok, danger }).then((v) => v !== null);

// ---------------------------------------------------------------- menus

let openMenu = null;
/** A small menu at a point or under an element. items: [{ label, icon, run, danger } | "-"] */
export function menu(anchor, items) {
  closeMenu();
  const box = el("div", { class: "menu", role: "menu" }, items.map((it) => it === "-"
    ? el("hr")
    : el("button", { class: it.danger ? "danger" : "", role: "menuitem", onclick: () => { closeMenu(); it.run(); } }, it.icon && icon(it.icon, 15), el("span", { text: it.label }), it.keys && el("kbd", { text: it.keys }))));
  document.body.append(box);
  const r = anchor instanceof Element ? anchor.getBoundingClientRect() : { left: anchor.x, bottom: anchor.y, top: anchor.y, right: anchor.x };
  const w = box.offsetWidth, h = box.offsetHeight;
  box.style.left = `${Math.max(8, Math.min(r.left, innerWidth - w - 8))}px`;
  box.style.top = `${r.bottom + h + 8 > innerHeight ? Math.max(8, r.top - h - 4) : r.bottom + 4}px`;
  openMenu = box;
  setTimeout(() => {
    document.addEventListener("mousedown", away, true);
    document.addEventListener("keydown", esc, true);
  });
  box.querySelector("button")?.focus();
}
function away(e) { if (openMenu && !openMenu.contains(e.target)) closeMenu(); }
function esc(e) {
  if (!openMenu) return;
  if (e.key === "Escape") { e.stopPropagation(); closeMenu(); }
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    const buttons = [...openMenu.querySelectorAll("button")];
    const i = buttons.indexOf(document.activeElement);
    buttons[(i + (e.key === "ArrowDown" ? 1 : buttons.length - 1)) % buttons.length]?.focus();
  }
}
export function closeMenu() {
  if (!openMenu) return;
  openMenu.remove(); openMenu = null;
  document.removeEventListener("mousedown", away, true);
  document.removeEventListener("keydown", esc, true);
}

// ---------------------------------------------------------------- small pieces

/** A line of keys and values, as used in every detail panel. */
export function facts(pairs) {
  return el("dl", { class: "facts" }, pairs.filter(Boolean).map(([k, v]) => [el("dt", { text: k }), el("dd", null, v ?? "-")]));
}

/** An address or signature that can be copied with one click. */
export function copyable(text, shown = text, cls = "") {
  return el("button", { class: `copyable ${cls}`, title: "Copy", onclick: (e) => { e.stopPropagation(); copyText(text); } }, el("span", { class: "mono", text: shown }), icon("copy", 13));
}

export function emptyState(iconName, title, text, action) {
  return el("div", { class: "empty" }, icon(iconName, 34), el("h3", { text: title }), text && el("p", null, text), action);
}

/** Calls fn now and then every `ms`, but only while the page is visible and `active()` says so. */
export function every(ms, fn, active = () => true) {
  let busy = false;
  const tick = async () => {
    if (busy || document.hidden || !session.connected || !active()) return;
    busy = true;
    try { await fn(); } catch { /* the next round will try again */ } finally { busy = false; }
  };
  const timer = setInterval(tick, ms);
  tick();
  return { stop: () => clearInterval(timer), now: tick };
}

export const store = {
  get(key, fallback) { try { const v = localStorage.getItem(`desk.${key}`); return v === null ? fallback : JSON.parse(v); } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(`desk.${key}`, JSON.stringify(value)); } catch { /* storage may be off */ } },
};
