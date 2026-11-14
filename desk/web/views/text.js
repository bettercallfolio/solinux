// Text: a plain editor for one text file at a time. Notes, configuration files, source code.

import { el, icon, call, attempt, dialog, confirmDialog, toast, fill, store } from "../core.js";

export default {
  id: "text", title: "Text", icon: "edit",
  create(root, { go }) {
    const name = el("b", { class: "ev-name" });
    const where = el("span", { class: "dim small mono ev-name" });
    const state = el("span", { class: "dim small" });
    const area = el("textarea", { class: "text-area mono", spellcheck: false, autocapitalize: "off", autocomplete: "off", wrap: store.get("text.wrap", true) ? "soft" : "off", placeholder: "Write here.", "aria-label": "Text" });
    const saveBtn = el("button", { class: "btn small primary", onclick: () => save() }, icon("save", 14), "Save");
    const wrapBtn = el("button", { class: "tool", title: "Wrap long lines", onclick: () => { const on = area.wrap === "off"; area.wrap = on ? "soft" : "off"; store.set("text.wrap", on); paint(); } }, icon("logs", 16));
    root.append(el("div", { class: "toolbar" },
      el("button", { class: "btn small", onclick: () => fresh() }, icon("plus", 14), "New"),
      el("button", { class: "btn small", onclick: () => openDialog() }, icon("folder", 14), "Open"),
      name, where, el("span", { class: "gap" }), state, wrapBtn, saveBtn), area);

    let doc = { path: null, mtime: undefined, text: "" };
    const dirty = () => area.value !== doc.text;

    function paint() {
      const d = dirty();
      name.textContent = (doc.path ? doc.path.split("/").pop() : "New text") + (d ? " •" : "");
      where.textContent = doc.path ? doc.path.replace(/\/[^/]+$/, "") : "";
      saveBtn.disabled = !d && !!doc.path;
      wrapBtn.classList.toggle("on", area.wrap !== "off");
      const before = area.value.slice(0, area.selectionStart).split("\n");
      const words = area.value.trim() ? area.value.trim().split(/\s+/).length : 0;
      state.textContent = `line ${before.length}, column ${before[before.length - 1].length + 1} · ${words} ${words === 1 ? "word" : "words"}`;
    }
    async function leave() {
      return !dirty() || confirmDialog("Unsaved changes", "What you wrote since the last save would be lost.", "Discard it", true);
    }
    async function fresh() {
      if (!(await leave())) return;
      doc = { path: null, mtime: undefined, text: "" }; area.value = ""; paint(); area.focus();
    }
    async function load(path) {
      if (!(await leave())) return;
      const r = await attempt(() => call("fs.read", { path }));
      if (!r) return;
      if (r.text === undefined) { toast(r.tooBig ? "That file is too large to edit here" : "That is not a text file", "bad"); return; }
      doc = { path: r.path, mtime: r.mtime, text: r.text };
      area.value = r.text; area.scrollTop = 0; area.setSelectionRange(0, 0); paint(); area.focus();
    }
    async function openDialog() {
      const v = await dialog({ title: "Open a text file", fields: [{ name: "path", label: "Path", value: doc.path ?? "~/", hint: "Or find it in Files and choose “Open in Text”." }], ok: "Open" });
      if (v?.path.trim()) load(v.path.trim());
    }
    async function save() {
      let path = doc.path;
      if (!path) {
        const v = await dialog({ title: "Save as", fields: [{ name: "path", label: "Path", value: "~/notes.txt" }], ok: "Save" });
        path = v?.path.trim();
        if (!path) return;
        const there = await call("fs.read", { path }).catch(() => null);
        if (there && !(await confirmDialog("Replace", `${path} already exists. Replace it?`, "Replace", true))) return;
        if (!there) { const made = await attempt(() => call("fs.touch", { path })); if (!made) return; }
      }
      const text = area.value;
      const r = await attempt(() => call("fs.write", { path, text, mtime: doc.path ? doc.mtime : undefined }), "Saved");
      if (!r) return;
      doc = { path: r.path, mtime: r.mtime, text };
      paint();
    }
    area.addEventListener("input", paint); area.addEventListener("keyup", paint); area.addEventListener("click", paint);
    area.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); save(); }
      else if (e.key === "Tab" && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        document.execCommand("insertText", false, "  ") || area.setRangeText("  ", area.selectionStart, area.selectionEnd, "end");
        paint();
      }
    });
    window.addEventListener("beforeunload", (e) => { if (dirty()) e.preventDefault(); });
    paint();
    return {
      show(arg) { if (arg?.path) load(arg.path); else area.focus(); },
      focus() { area.focus(); },
    };
  },
};
