// The everyday applications of the desktop: a picture viewer, a player for music and video,
// a reader for PDF documents, and a calculator. They are drawn by the browser itself, so
// they open at once, and sound plays on the computer you sit at.

import { el, icon, call, fill, attempt, emptyState, bytes, session, toast } from "../core.js";

const IMAGE = /\.(png|jpe?g|gif|webp|avif|bmp|ico|svg)$/i;
const VIDEO = /\.(mp4|m4v|webm|mkv|mov|ogv)$/i;
const AUDIO = /\.(mp3|ogg|oga|opus|wav|flac|m4a|aac)$/i;
const PDF = /\.pdf$/i;

/** Which of the desktop's applications opens a file, by its name; null for "the editor, or nothing". */
export function opener(name) {
  if (IMAGE.test(name)) return "images";
  if (VIDEO.test(name) || AUDIO.test(name)) return "media";
  if (PDF.test(name)) return "documents";
  return null;
}

const shownUrl = (path) => `/api/file?path=${encodeURIComponent(path)}&inline=1&t=${session.token}`;
const dirOf = (path) => path.replace(/\/[^/]+$/, "") || "/";
const nameOf = (path) => path.split("/").pop();

/** The files next to `path` that `test` accepts, in the order the file manager shows them. */
async function siblings(path, test) {
  const r = await call("fs.list", { path: dirOf(path) }).catch(() => null);
  if (!r) return [path];
  const dir = r.path === "/" ? "" : r.path;
  const all = r.entries.filter((e) => e.type !== "dir" && test(e.name)).map((e) => `${dir}/${e.name}`);
  return all.includes(path) ? all : [path, ...all];
}

function pickFile(go, what) {
  return emptyState("files", `No ${what} is open`, "Open one from Files: a double click on it brings it here.",
    el("button", { class: "btn primary", onclick: () => go("files") }, icon("files", 15), "Open Files"));
}

// ---------------------------------------------------------------- pictures

export const images = {
  id: "images", title: "Images", icon: "image",
  create(root, { go }) {
    const name = el("b", { class: "ev-name" });
    const count = el("span", { class: "dim small" });
    const stage = el("div", { class: "ev-stage" });
    const img = el("img", { class: "ev-img", alt: "", draggable: false });
    const bar = el("div", { class: "toolbar" },
      el("button", { class: "tool", title: "Previous (←)", onclick: () => step(-1) }, icon("left", 16)),
      el("button", { class: "tool", title: "Next (→)", onclick: () => step(1) }, icon("chevron", 16)),
      name, count, el("span", { class: "gap" }),
      el("button", { class: "tool", title: "Smaller (-)", onclick: () => zoom(1 / 1.25) }, icon("minus", 16)),
      el("button", { class: "btn small", title: "Fit the window (0)", onclick: () => fit() }, "Fit"),
      el("button", { class: "tool", title: "Larger (+)", onclick: () => zoom(1.25) }, icon("plus", 16)),
      el("button", { class: "tool", title: "Show in Files", onclick: () => list[at] && go("files", { path: dirOf(list[at]) }) }, icon("folder", 16)));
    root.append(bar, stage);
    root.tabIndex = 0;

    let list = [], at = 0, scale = 1, fitted = true, x = 0, y = 0;
    function place() { img.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px) scale(${scale})`; }
    function fit() {
      fitted = true; x = 0; y = 0;
      const sw = stage.clientWidth - 24, sh = stage.clientHeight - 24;
      scale = img.naturalWidth ? Math.min(1, sw / img.naturalWidth, sh / img.naturalHeight) : 1;
      place();
    }
    function zoom(f, cx = 0, cy = 0) {
      fitted = false;
      const next = Math.max(0.05, Math.min(16, scale * f));
      // keep the point under the pointer where it is
      x = cx - (cx - x) * (next / scale); y = cy - (cy - y) * (next / scale);
      scale = next; place();
    }
    function paint() {
      if (!list.length) { fill(stage, pickFile(go, "picture")); name.textContent = ""; count.textContent = ""; return; }
      const path = list[at];
      name.textContent = nameOf(path);
      count.textContent = list.length > 1 ? `${at + 1} of ${list.length}` : "";
      if (img.parentNode !== stage) fill(stage, img);
      img.src = shownUrl(path);
    }
    function step(d) { if (list.length > 1) { at = (at + d + list.length) % list.length; paint(); } }
    img.addEventListener("load", () => { fit(); count.textContent = `${list.length > 1 ? `${at + 1} of ${list.length} · ` : ""}${img.naturalWidth} × ${img.naturalHeight}`; });
    img.addEventListener("error", () => toast(`${nameOf(list[at] ?? "")} cannot be shown as a picture`, "bad"));
    stage.addEventListener("wheel", (e) => {
      if (!list.length) return;
      e.preventDefault();
      const r = stage.getBoundingClientRect();
      zoom(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2);
    }, { passive: false });
    stage.addEventListener("pointerdown", (e) => {
      if (!list.length || e.button !== 0) return;
      const s = { px: e.clientX, py: e.clientY, x, y };
      stage.setPointerCapture(e.pointerId); stage.classList.add("grabbing");
      const move = (ev) => { x = s.x + ev.clientX - s.px; y = s.y + ev.clientY - s.py; fitted = false; place(); };
      const up = () => { stage.removeEventListener("pointermove", move); stage.removeEventListener("pointerup", up); stage.classList.remove("grabbing"); };
      stage.addEventListener("pointermove", move); stage.addEventListener("pointerup", up);
    });
    stage.addEventListener("dblclick", () => (fitted ? zoom(1 / scale) : fit()));
    root.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight") step(1); else if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "+" || e.key === "=") zoom(1.25); else if (e.key === "-") zoom(1 / 1.25); else if (e.key === "0") fit();
    });
    new ResizeObserver(() => { if (fitted) fit(); }).observe(stage);
    paint();
    return {
      async show(arg) {
        if (arg?.path) { list = await siblings(arg.path, (n) => IMAGE.test(n)); at = Math.max(0, list.indexOf(arg.path)); paint(); }
        root.focus();
      },
      focus() { root.focus(); },
    };
  },
};

// ---------------------------------------------------------------- music and video

export const media = {
  id: "media", title: "Media", icon: "play",
  create(root, { go }) {
    const stage = el("div", { class: "ev-stage dark" });
    const queue = el("div", { class: "ev-queue" });
    const player = el("video", { class: "ev-video", controls: true, preload: "metadata" });
    root.append(el("div", { class: "ev-media" }, stage, queue));
    let list = [], at = -1;

    function paint() {
      if (!list.length) { fill(stage, pickFile(go, "music or video")); fill(queue); return; }
      if (player.parentNode !== stage) fill(stage, player);
      fill(queue, list.map((p, i) => el("button", { class: i === at ? "on" : "", title: p, onclick: () => play(i) }, icon(AUDIO.test(p) ? "music" : "play", 14), el("span", { text: nameOf(p) }))));
    }
    function play(i) {
      at = i;
      const path = list[i];
      player.classList.toggle("audio", AUDIO.test(path));
      player.src = shownUrl(path);
      player.play().catch(() => { /* the browser wants a click first; the controls are there */ });
      paint();
    }
    player.addEventListener("ended", () => { if (at + 1 < list.length) play(at + 1); });
    player.addEventListener("error", () => { if (player.src) toast(`This browser cannot play ${nameOf(list[at] ?? "that file")}`, "bad"); });
    paint();
    return {
      async show(arg) {
        if (!arg?.path) return;
        list = await siblings(arg.path, (n) => VIDEO.test(n) || AUDIO.test(n));
        play(Math.max(0, list.indexOf(arg.path)));
      },
      hide() { player.pause(); },
    };
  },
};

// ---------------------------------------------------------------- documents

export const documents = {
  id: "documents", title: "Documents", icon: "file",
  create(root, { go }) {
    const name = el("b", { class: "ev-name" });
    const stage = el("div", { class: "ev-stage" });
    let path = null;
    root.append(el("div", { class: "toolbar" }, icon("file", 15), name, el("span", { class: "gap" }),
      el("button", { class: "tool", title: "Download", onclick: () => { if (path) { const a = el("a", { href: `/api/file?path=${encodeURIComponent(path)}&t=${session.token}`, download: nameOf(path) }); document.body.append(a); a.click(); a.remove(); } } }, icon("download", 16)),
      el("button", { class: "tool", title: "Show in Files", onclick: () => path && go("files", { path: dirOf(path) }) }, icon("folder", 16))), stage);
    fill(stage, pickFile(go, "document"));
    return {
      show(arg) {
        if (!arg?.path) return;
        path = arg.path; name.textContent = nameOf(path);
        // The browser's own PDF reader shows the pages: search, zoom and printing come with it.
        fill(stage, el("iframe", { class: "ev-frame", src: shownUrl(path), title: nameOf(path) }));
      },
    };
  },
};

// ---------------------------------------------------------------- calculator

/** Works out an expression with + - * / ^ %, brackets and a few functions. No eval: a small parser. */
export function calculate(text) {
  const src = text.replace(/\s+/g, "").replace(/×/g, "*").replace(/÷/g, "/").replace(/,/g, ".").replace(/π/g, "pi");
  let i = 0;
  const FUNCS = { sqrt: Math.sqrt, sin: Math.sin, cos: Math.cos, tan: Math.tan, ln: Math.log, log: Math.log10, abs: Math.abs, round: Math.round };
  const peek = () => src[i];
  function number() {
    const m = src.slice(i).match(/^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i);
    if (!m) throw new Error("a number is missing");
    i += m[0].length;
    return Number(m[0]);
  }
  function atom() {
    if (peek() === "(") { i++; const v = sum(); if (peek() !== ")") throw new Error("a bracket is not closed"); i++; return v; }
    if (peek() === "-") { i++; return -power(); }
    if (peek() === "+") { i++; return power(); }
    const word = src.slice(i).match(/^[a-z]+/i)?.[0];
    if (word) {
      i += word.length;
      if (word === "pi") return Math.PI;
      if (word === "e") return Math.E;
      const fn = FUNCS[word.toLowerCase()];
      if (!fn) throw new Error(`"${word}" is not known`);
      if (peek() !== "(") throw new Error(`${word} needs brackets`);
      return fn(atom());
    }
    return number();
  }
  function power() { const base = atom(); if (peek() === "^") { i++; return base ** power(); } return base; }
  function product() {
    let v = power();
    for (;;) {
      if (peek() === "*") { i++; v *= power(); }
      else if (peek() === "/") { i++; v /= power(); }
      else if (peek() === "%") { i++; if (i >= src.length || /[+\-*/)]/.test(peek())) v /= 100; else v %= power(); }
      else return v;
    }
  }
  function sum() {
    let v = product();
    for (;;) {
      if (peek() === "+") { i++; v += product(); }
      else if (peek() === "-") { i++; v -= product(); }
      else return v;
    }
  }
  if (!src) return null;
  const v = sum();
  if (i < src.length) throw new Error(`"${src[i]}" is not expected there`);
  if (!Number.isFinite(v)) throw new Error("that has no finite answer");
  return v;
}
const shownNumber = (v) => (Number.isInteger(v) && Math.abs(v) < 1e15 ? v.toLocaleString("en-US") : Number(v.toPrecision(12)).toString());

export const calculator = {
  id: "calculator", title: "Calculator", icon: "calc",
  create(root) {
    const input = el("input", { class: "calc-input mono", type: "text", inputMode: "decimal", autocomplete: "off", spellcheck: false, placeholder: "0", "aria-label": "Calculation" });
    const result = el("div", { class: "calc-result mono" });
    const tape = el("div", { class: "calc-tape" });
    const keys = ["7", "8", "9", "÷", "(", "4", "5", "6", "×", ")", "1", "2", "3", "-", "^", "0", ".", "%", "+", "="];
    const pad = el("div", { class: "calc-pad" },
      el("button", { class: "calc-key wide dim-key", onclick: () => { input.value = ""; live(); input.focus(); } }, "Clear"),
      el("button", { class: "calc-key dim-key", onclick: () => { input.value = input.value.slice(0, -1); live(); input.focus(); } }, "⌫"),
      el("button", { class: "calc-key dim-key", onclick: () => press("sqrt(") }, "√"),
      el("button", { class: "calc-key dim-key", onclick: () => press("π") }, "π"),
      keys.map((k) => el("button", { class: `calc-key ${k === "=" ? "equals" : /[0-9.]/.test(k) ? "" : "op"}`, onclick: () => (k === "=" ? enter() : press(k)) }, k)));
    root.append(el("div", { class: "calc" }, tape, input, result, pad));

    function press(k) {
      const a = input.selectionStart ?? input.value.length, b = input.selectionEnd ?? a;
      input.value = input.value.slice(0, a) + k + input.value.slice(b);
      input.focus(); input.setSelectionRange(a + k.length, a + k.length);
      live();
    }
    function live() {
      try { const v = calculate(input.value); result.textContent = v === null ? "" : `= ${shownNumber(v)}`; result.classList.remove("bad-text"); }
      catch { result.textContent = ""; }
    }
    function enter() {
      try {
        const v = calculate(input.value);
        if (v === null) return;
        tape.prepend(el("button", { class: "calc-line", title: "Use this result", onclick: () => press(String(v)) }, el("span", { class: "dim", text: input.value }), el("b", { class: "mono", text: shownNumber(v) })));
        while (tape.children.length > 30) tape.lastChild.remove();
        input.value = String(Number(v.toPrecision(12))); result.textContent = "";
      } catch (e) { result.textContent = e.message; result.classList.add("bad-text"); }
    }
    input.addEventListener("input", live);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === "=") { e.preventDefault(); enter(); } else if (e.key === "Escape") { input.value = ""; live(); } });
    return { show() { input.focus(); }, focus() { input.focus(); } };
  },
};
