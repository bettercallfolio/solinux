// Terminals, in tabs. They live on the system, not in this page: reload the page, or open
// the desk somewhere else, and they are still there with their history.

import { el, icon, call, on, attempt, dialog, session, emptyState } from "../core.js";
import { termView } from "../termview.js";

export default {
  id: "terminal", title: "Terminal", icon: "terminal",
  create(root) {
    const tabs = el("div", { class: "tabs", role: "tablist" });
    const add = el("button", { class: "tab-add", title: "New terminal (Ctrl+`)", "aria-label": "New terminal", onclick: () => open() }, icon("plus", 16));
    const stage = el("div", { class: "term-stage" });
    root.append(el("div", { class: "tabbar" }, tabs, add), stage);

    const open_ = new Map();   // id -> { info, tab, pane, view }
    let active = null;
    let visible = false;
    let loaded = false;

    function label(info) {
      if (info.exited !== null && info.exited !== undefined) return `${info.title} (ended: ${info.exited})`;
      return info.title;
    }

    function addTab(info) {
      if (open_.has(info.id)) { open_.get(info.id).info = info; paintTab(info.id); return; }
      const pane = el("div", { class: "term-pane", hidden: true });
      stage.append(pane);
      const name = el("span", { class: "tab-name" });
      const tab = el("div", {
        class: "tab", role: "tab", tabIndex: 0,
        onclick: () => select(info.id),
        ondblclick: () => rename(info.id),
        onauxclick: (e) => { if (e.button === 1) close(info.id); },
        onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") select(info.id); },
      }, icon(info.job ? "logs" : "terminal", 14), name,
        el("button", { class: "tab-close", title: "Close", "aria-label": "Close terminal", onclick: (e) => { e.stopPropagation(); close(info.id); } }, icon("close", 12)));
      tabs.append(tab);
      open_.set(info.id, { info, tab, pane, view: termView(pane, info.id), name });
      paintTab(info.id);
    }
    function paintTab(id) {
      const t = open_.get(id);
      if (!t) return;
      t.name.textContent = label(t.info);
      t.tab.title = `${t.info.title}\n${t.info.cwd}`;
      t.tab.classList.toggle("ended", t.info.exited !== null && t.info.exited !== undefined);
    }

    function select(id) {
      if (!open_.has(id)) return;
      active = id;
      for (const [tid, t] of open_) {
        const on_ = tid === id;
        t.pane.hidden = !on_;
        t.tab.classList.toggle("on", on_);
        t.tab.setAttribute("aria-selected", on_);
      }
      const t = open_.get(id);
      requestAnimationFrame(() => { t.view.fit(); if (visible) t.view.focus(); });
      t.tab.scrollIntoView({ block: "nearest", inline: "nearest" });
      placeholder();
    }

    function drop(id) {
      const t = open_.get(id);
      if (!t) return;
      const order = [...open_.keys()];
      const next = order[order.indexOf(id) + 1] ?? order[order.indexOf(id) - 1] ?? null;
      t.view.dispose(); t.tab.remove(); t.pane.remove();
      open_.delete(id);
      if (active === id) { active = null; if (next !== null) select(next); }
      placeholder();
    }

    async function open(options = {}) {
      const info = await attempt(() => call("term.open", { cols: 100, rows: 30, ...options }));
      if (!info) return;
      addTab(info);
      select(info.id);
    }
    function close(id) {
      drop(id);
      call("term.close", { id }).catch(() => {});
    }
    async function rename(id) {
      const t = open_.get(id);
      const v = await dialog({ title: "Name this terminal", fields: [{ name: "title", label: "Name", value: t.info.title }], ok: "Rename" });
      if (v?.title.trim()) call("term.rename", { id, title: v.title.trim() });
    }

    const none = emptyState("terminal", "No terminal is open", "A terminal runs on the system and stays there when you close this page.",
      el("button", { class: "btn primary", onclick: () => open() }, icon("plus", 15), "New terminal"));
    none.hidden = true;
    stage.append(none);
    function placeholder() { none.hidden = open_.size > 0; }

    async function load() {
      const list = await call("term.list").catch(() => []);
      const known = new Set(list.map((t) => t.id));
      for (const id of [...open_.keys()]) if (!known.has(id)) drop(id);
      for (const info of list) if (!info.job) addTab(info);
      loaded = true;
      if (active === null && open_.size) select([...open_.keys()][0]);
      placeholder();
    }
    on("connected", () => { if (loaded) load(); });
    on("term.open", (info) => { if (open_.has(info.id)) { open_.get(info.id).info = info; paintTab(info.id); } });
    on("term.exit", (e) => {
      const t = open_.get(e.id);
      if (!t) return;
      // A shell that ended closes its tab, like a terminal window. A command's output stays to be read.
      if (t.info.job) { t.info.exited = e.code; paintTab(e.id); } else drop(e.id);
    });
    on("term.closed", (e) => drop(e.id));

    return {
      async show(arg) {
        visible = true;
        if (!loaded && session.connected) await load();
        if (arg?.argv) await open({ argv: arg.argv, cwd: arg.cwd, title: arg.title });
        else if (arg?.fresh || arg?.cwd) await open({ cwd: arg.cwd });
        else if (!open_.size) await open();
        if (active !== null) select(active);
      },
      hide() { visible = false; },
    };
  },
};
