// Files: browse the system, and edit text files in place.

import { el, icon, call, attempt, dialog, confirmDialog, menu, toast, bytes, ago, copyText, fileUrl, store, emptyState, session, fill } from "../core.js";
import { opener } from "./everyday.js";

const IMAGES = /\.(png|jpe?g|gif|webp|svg|ico|bmp)$/i;
const join = (dir, name) => (dir === "/" ? `/${name}` : `${dir}/${name}`);
const modeText = (m) => [6, 3, 0].map((s) => ["---", "--x", "-w-", "-wx", "r--", "r-x", "rw-", "rwx"][(m >> s) & 7]).join("");

export default {
  id: "files", title: "Files", icon: "files",
  create(root, { go }) {
    let dir = store.get("files.dir", "~");
    let entries = [];
    let selected = null;        // name
    let showHidden = store.get("files.hidden", false);
    let editing = null;         // { path, mtime, text }

    // ---- frame
    const crumbs = el("div", { class: "crumbs" });
    const pathInput = el("input", { class: "path-input", type: "text", spellcheck: false, autocomplete: "off", hidden: true, "aria-label": "Path" });
    const hiddenBtn = el("button", { class: "tool", title: "Show hidden files", onclick: () => { showHidden = !showHidden; store.set("files.hidden", showHidden); paint(); } }, icon("eye", 16));
    const upload = el("input", { type: "file", multiple: true, hidden: true });
    const bar = el("div", { class: "toolbar" },
      el("button", { class: "tool", title: "Up (Backspace)", onclick: () => up() }, icon("up", 16)),
      el("button", { class: "tool", title: "Home", onclick: () => open("~") }, icon("home", 16)),
      el("div", { class: "pathbar", onclick: (e) => { if (e.target.closest("button")) return; editPath(); } }, crumbs, pathInput),
      el("button", { class: "tool", title: "Refresh", onclick: () => load() }, icon("refresh", 16)),
      hiddenBtn,
      el("span", { class: "gap" }),
      el("button", { class: "btn small", onclick: () => create("folder") }, icon("folder", 14), el("span", { class: "hide-narrow", text: "New folder" })),
      el("button", { class: "btn small", onclick: () => create("file") }, icon("file", 14), el("span", { class: "hide-narrow", text: "New file" })),
      el("button", { class: "btn small", onclick: () => upload.click() }, icon("upload", 14), el("span", { class: "hide-narrow", text: "Upload" })),
      el("button", { class: "btn small", title: "Open a terminal in this folder", onclick: () => go("terminal", { cwd: dir }) }, icon("terminal", 14)),
      upload);
    const body = el("tbody");
    const table = el("table", { class: "table files-table", tabIndex: 0 },
      el("thead", null, el("tr", null, el("th", { text: "Name" }), el("th", { class: "r", text: "Size" }), el("th", { class: "hide-narrow", text: "Changed" }), el("th", { class: "hide-narrow", text: "Rights" }), el("th"))),
      body);
    const listBox = el("div", { class: "files-list" }, table);
    const editor = el("div", { class: "editor", hidden: true });
    const split = el("div", { class: "files-split" }, listBox, editor);
    root.append(bar, split);

    // ---- listing
    async function load(keep = true) {
      const r = await attempt(() => call("fs.list", { path: dir }));
      if (!r) return false;
      dir = r.path; entries = r.entries;
      store.set("files.dir", dir);
      if (!keep || !entries.some((e) => e.name === selected)) selected = null;
      paint();
      return true;
    }
    async function open(path) {
      const before = dir;
      dir = path;
      if (!(await load(false))) dir = before;
      listBox.scrollTop = 0;
    }
    const up = () => { if (dir !== "/") open(dir.replace(/\/[^/]+\/?$/, "") || "/"); };
    const isDir = (e) => e.type === "dir" || e.dir === true;
    const visible = () => entries.filter((e) => showHidden || !e.name.startsWith("."));

    function paint() {
      hiddenBtn.classList.toggle("on", showHidden);
      const parts = dir.split("/").filter(Boolean);
      fill(crumbs, el("button", { onclick: () => open("/") }, "/"),
        ...parts.flatMap((p, i) => [i ? el("span", { class: "dim", text: "/" }) : null, el("button", { onclick: () => open("/" + parts.slice(0, i + 1).join("/")) }, p)]));
      const list = visible();
      fill(body, ...list.map((e) => {
        const row = el("tr", {
          class: e.name === selected ? "sel" : "", data: { name: e.name },
          onclick: () => select(e.name),
          ondblclick: () => activate(e),
          oncontextmenu: (ev) => { ev.preventDefault(); select(e.name); rowMenu({ x: ev.clientX, y: ev.clientY }, e); },
        },
          el("td", null, el("span", { class: `fname ${isDir(e) ? "dir" : ""}` }, icon(isDir(e) ? "folder" : e.type === "link" ? "link" : "file", 16), el("span", { text: e.name }), e.target && el("span", { class: "dim", text: ` → ${e.target}` }))),
          el("td", { class: "r mono dim", text: isDir(e) ? "" : bytes(e.size) }),
          el("td", { class: "dim hide-narrow", text: ago(e.mtime) }),
          el("td", { class: "mono dim hide-narrow", text: modeText(e.mode) }),
          el("td", { class: "r" }, el("button", { class: "tool tiny", title: "More", "aria-label": `More for ${e.name}`, onclick: (ev) => { ev.stopPropagation(); select(e.name); rowMenu(ev.currentTarget, e); } }, icon("more", 15))));
        return row;
      }));
      if (!list.length) body.append(el("tr", { class: "none" }, el("td", { colSpan: 5 }, emptyState("folder", "This folder is empty", entries.length ? "It only has hidden files." : null))));
    }
    function select(name) {
      selected = name;
      for (const tr of body.children) tr.classList.toggle("sel", tr.dataset.name === name);
    }
    // A double click opens a file with what suits it: pictures, music, video and PDF have applications of their own.
    function activate(e) {
      if (isDir(e)) open(join(dir, e.name));
      else if (opener(e.name)) go(opener(e.name), { path: join(dir, e.name) });
      else edit(join(dir, e.name));
    }
    const ARCHIVE = /\.(zip|tar|tgz|tar\.(gz|xz|bz2|zst)|txz|tbz2)$/i;
    // Packing and unpacking run as the commands they are, in a terminal, so nothing about them is hidden.
    function extract(e) {
      go("terminal", { cwd: dir, title: `unpack ${e.name}`, argv: /\.zip$/i.test(e.name) ? ["unzip", "-o", e.name] : ["tar", "-xvf", e.name] });
      setTimeout(load, 1500);
    }
    function compress(e) {
      go("terminal", { cwd: dir, title: `pack ${e.name}`, argv: ["tar", "-czvf", `${e.name}.tar.gz`, e.name] });
      setTimeout(load, 1500);
    }

    function rowMenu(anchor, e) {
      const path = join(dir, e.name);
      menu(anchor, [
        { label: "Open", icon: isDir(e) ? "folder" : "app", run: () => activate(e) },
        !isDir(e) && opener(e.name) && { label: "Open in the editor", icon: "edit", run: () => edit(path) },
        !isDir(e) && { label: "Open in Text", icon: "edit", run: () => go("text", { path }) },
        !isDir(e) && ARCHIVE.test(e.name) && { label: "Unpack here", icon: "package", run: () => extract(e) },
        { label: "Pack into an archive", icon: "package", run: () => compress(e) },
        isDir(e) && { label: "Terminal here", icon: "terminal", run: () => go("terminal", { cwd: path }) },
        !isDir(e) && { label: "Download", icon: "download", run: () => download(path) },
        { label: "Rename", icon: "edit", keys: "F2", run: () => rename(e) },
        { label: "Duplicate", icon: "copy", run: () => duplicate(e) },
        { label: "Copy path", icon: "link", run: () => copyText(path, "Path copied") },
        "-",
        { label: "Delete", icon: "trash", danger: true, keys: "Del", run: () => remove(e) },
      ].filter(Boolean));
    }

    function editPath() {
      crumbs.hidden = true; pathInput.hidden = false;
      pathInput.value = dir; pathInput.focus(); pathInput.select();
    }
    function leavePath() { pathInput.hidden = true; crumbs.hidden = false; }
    pathInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { const v = pathInput.value.trim(); leavePath(); if (v) open(v); }
      else if (e.key === "Escape") leavePath();
    });
    pathInput.addEventListener("blur", leavePath);

    // ---- changes
    async function create(kind) {
      const v = await dialog({ title: kind === "folder" ? "New folder" : "New file", fields: [{ name: "name", label: "Name", placeholder: kind === "folder" ? "my-project" : "notes.txt" }], ok: "Create" });
      const name = v?.name.trim();
      if (!name) return;
      if (name.includes("/")) { toast("A name cannot contain /", "bad"); return; }
      const made = await attempt(() => call(kind === "folder" ? "fs.mkdir" : "fs.touch", { path: join(dir, name) }));
      if (!made) return;
      selected = name;
      await load();
      if (kind === "file") edit(made.path);
    }
    async function rename(e) {
      const v = await dialog({ title: `Rename ${e.name}`, fields: [{ name: "name", label: "New name", value: e.name }], ok: "Rename" });
      const name = v?.name.trim();
      if (!name || name === e.name) return;
      if (await attempt(() => call("fs.move", { from: join(dir, e.name), to: name.startsWith("/") || name.startsWith("~") ? name : join(dir, name) }))) { selected = name; load(); }
    }
    async function duplicate(e) {
      const dot = e.name.lastIndexOf(".");
      const name = dot > 0 ? `${e.name.slice(0, dot)} copy${e.name.slice(dot)}` : `${e.name} copy`;
      if (await attempt(() => call("fs.copy", { from: join(dir, e.name), to: join(dir, name) }))) { selected = name; load(); }
    }
    async function remove(e) {
      const what = isDir(e) ? `the folder "${e.name}" and everything in it` : `"${e.name}"`;
      if (!(await confirmDialog("Delete", `Delete ${what}? This cannot be undone.`, "Delete", true))) return;
      if (await attempt(() => call("fs.remove", { path: join(dir, e.name) }), "Deleted")) {
        if (editing?.path === join(dir, e.name)) closeEditor(true);
        load();
      }
    }
    function download(path) {
      const a = el("a", { href: fileUrl(path), download: path.split("/").pop() });
      document.body.append(a); a.click(); a.remove();
    }
    async function sendFiles(list) {
      let done = 0;
      for (const f of list) {
        const target = join(dir, f.name);
        let replace = "";
        if (entries.some((e) => e.name === f.name)) {
          if (!(await confirmDialog("Replace", `"${f.name}" is already here. Replace it?`, "Replace", true))) continue;
          replace = "&replace=1";
        }
        const res = await fetch(`/api/file?path=${encodeURIComponent(target)}${replace}`, { method: "PUT", headers: { "x-desk-token": session.token }, body: f }).catch(() => null);
        if (res?.ok) done++; else toast(`${f.name} could not be uploaded`, "bad");
      }
      if (done) { toast(`Uploaded ${done} ${done === 1 ? "file" : "files"}`, "good"); load(); }
    }
    upload.addEventListener("change", () => { sendFiles([...upload.files]); upload.value = ""; });
    listBox.addEventListener("dragover", (e) => { e.preventDefault(); listBox.classList.add("drop"); });
    listBox.addEventListener("dragleave", () => listBox.classList.remove("drop"));
    listBox.addEventListener("drop", (e) => { e.preventDefault(); listBox.classList.remove("drop"); if (e.dataTransfer?.files.length) sendFiles([...e.dataTransfer.files]); });

    table.addEventListener("keydown", (e) => {
      const list = visible();
      const i = list.findIndex((x) => x.name === selected);
      const cur = list[i];
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const next = list[Math.max(0, Math.min(list.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))];
        if (next) { select(next.name); body.querySelector("tr.sel")?.scrollIntoView({ block: "nearest" }); }
      } else if (e.key === "Enter" && cur) activate(cur);
      else if (e.key === "Backspace") up();
      else if (e.key === "Delete" && cur) remove(cur);
      else if (e.key === "F2" && cur) rename(cur);
    });

    // ---- the editor
    const edName = el("b");
    const edState = el("span", { class: "dim small" });
    const edArea = el("textarea", { class: "mono", spellcheck: false, autocapitalize: "off", autocomplete: "off", wrap: "off", "aria-label": "File content" });
    const edOther = el("div", { class: "editor-other" });
    const saveBtn = el("button", { class: "btn small primary", onclick: () => save() }, icon("save", 14), "Save");
    editor.append(el("div", { class: "editor-head" }, icon("file", 15), edName, edState, el("span", { class: "gap" }), saveBtn,
      el("button", { class: "tool", title: "Download", onclick: () => editing && download(editing.path) }, icon("download", 15)),
      el("button", { class: "tool", title: "Close", onclick: () => closeEditor() }, icon("close", 15))), edArea, edOther);

    const dirty = () => editing?.text !== undefined && edArea.value !== editing.text;
    function paintEditor() {
      const d = dirty();
      saveBtn.disabled = !d;
      edName.textContent = editing ? editing.path.split("/").pop() + (d ? " •" : "") : "";
      const before = edArea.value.slice(0, edArea.selectionStart).split("\n");
      edState.textContent = editing?.text !== undefined ? `line ${before.length}, column ${before[before.length - 1].length + 1}` : "";
    }
    async function edit(path) {
      if (dirty() && !(await confirmDialog("Unsaved changes", `Close ${edName.textContent.replace(" •", "")} without saving?`, "Close without saving", true))) return;
      const r = await attempt(() => call("fs.read", { path }));
      if (!r) return;
      editing = { path: r.path, mtime: r.mtime, text: r.text };
      editor.hidden = false; split.classList.add("editing");
      const plain = r.text !== undefined;
      edArea.hidden = !plain; edOther.hidden = plain; saveBtn.hidden = !plain;
      if (plain) { edArea.value = r.text; edArea.scrollTop = 0; edArea.setSelectionRange(0, 0); edArea.focus(); }
      else if (IMAGES.test(r.path) && r.size < 20e6) fill(edOther, el("img", { src: fileUrl(r.path), alt: r.path }), el("p", { class: "dim", text: bytes(r.size) }));
      else fill(edOther, emptyState("file", r.tooBig ? "Too large to edit here" : "Not a text file", `${bytes(r.size)}. Download it, or open it with a program in the terminal.`,
        el("button", { class: "btn", onclick: () => download(r.path) }, icon("download", 14), "Download")));
      paintEditor();
    }
    async function save() {
      if (!editing || !dirty()) return;
      const text = edArea.value;
      const r = await attempt(() => call("fs.write", { path: editing.path, text, mtime: editing.mtime }), "Saved");
      if (!r) return;
      editing.text = text; editing.mtime = r.mtime;
      paintEditor(); load();
    }
    async function closeEditor(force = false) {
      if (!force && dirty() && !(await confirmDialog("Unsaved changes", "Close without saving?", "Close without saving", true))) return;
      editing = null; editor.hidden = true; split.classList.remove("editing");
      table.focus();
    }
    edArea.addEventListener("input", paintEditor);
    edArea.addEventListener("keyup", paintEditor);
    edArea.addEventListener("click", paintEditor);
    edArea.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); save(); }
      else if (e.key === "Tab" && !e.ctrlKey && !e.altKey) {
        // Tab types an indent instead of leaving the editor.
        e.preventDefault();
        document.execCommand("insertText", false, editing?.path.match(/(Makefile|\.mk|\.go)$/) ? "\t" : "  ") || edArea.setRangeText("  ", edArea.selectionStart, edArea.selectionEnd, "end");
        paintEditor();
      } else if (e.key === "Escape") closeEditor();
    });
    window.addEventListener("beforeunload", (e) => { if (dirty()) e.preventDefault(); });

    let first = true;
    return {
      async show(arg) {
        if (arg?.path) { await open(arg.path); }
        else if (first) await load(false);
        else load();
        first = false;
        if (arg?.file) edit(arg.file);
      },
    };
  },
};
