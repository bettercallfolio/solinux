// Software: what can be installed on this system, and what is. Applications come first;
// every other package is one tab away. Installing runs `pkg`, and shows it running.

import { el, icon, call, attempt, fill, bytes, emptyState, confirmDialog, toast } from "../core.js";
import { runJob } from "../termview.js";
import { appIcon, launchApp } from "../native.js";

export default {
  id: "software", title: "Software", icon: "package",
  create(root) {
    const search = el("input", { type: "search", placeholder: "Search packages", spellcheck: false, autocomplete: "off", "aria-label": "Search packages" });
    const tabs = el("div", { class: "seg" });
    const list = el("div", { class: "pkg-list" });
    const where = el("span", { class: "dim small" });
    const jobBox = el("div", { class: "pkg-job", hidden: true });
    root.append(el("div", { class: "page" },
      el("div", { class: "pkg-head" }, el("div", { class: "search slim" }, icon("search", 16), search), tabs, el("span", { class: "gap" }), where),
      jobBox, list));

    let data = null, tab = "apps", busy = false, job = null;
    const TABS = [["apps", "Applications"], ["all", "Everything"], ["installed", "Installed"]];

    async function load() {
      const r = await attempt(() => call("pkg.list"));
      if (!r) return;
      data = r;
      paint();
    }

    function paint() {
      fill(tabs, TABS.map(([id, label]) => el("button", { class: id === tab ? "on" : "", onclick: () => { tab = id; paint(); } }, label)));
      if (!data) { fill(list, el("div", { class: "loading", text: "Asking the repository…" })); return; }
      if (!data.available) {
        where.textContent = "";
        fill(list, emptyState("package", "No repository to install from", data.reason));
        return;
      }
      where.textContent = `${data.packages.length} packages in "${data.repository}"`;
      const q = search.value.trim().toLowerCase();
      let rows = data.packages.filter((p) => !q || p.name.toLowerCase().includes(q) || p.summary.toLowerCase().includes(q) || (p.app?.name ?? "").toLowerCase().includes(q));
      if (tab === "apps") rows = rows.filter((p) => p.app);
      else if (tab === "installed") rows = rows.filter((p) => p.installedVersion);
      rows.sort((a, b) => (a.app?.name ?? a.name).localeCompare(b.app?.name ?? b.name));
      if (!rows.length) {
        fill(list, emptyState("package", q ? "Nothing matches" : tab === "apps" ? "The repository has no applications yet" : "Nothing here",
          tab === "apps" && !q ? "Applications are packages that bring a window of their own. Everything else is under Everything." : null));
        return;
      }
      fill(list, rows.map((p) => {
        const have = p.installedVersion;
        const newer = have && have !== p.version;
        return el("article", { class: "pkg" },
          el("span", { class: "pkg-icon" }, p.app ? (have ? appIcon(p.app.icon, 34) : icon("app", 26)) : icon("package", 24)),
          el("div", { class: "pkg-text" },
            el("b", { text: p.app?.name ?? p.name }), p.app && el("span", { class: "dim mono small", text: p.name }),
            el("p", { class: "dim", text: p.app?.comment || p.summary || "" }),
            el("span", { class: "dim small mono", text: `${p.version} · ${bytes(p.size)} to download, ${bytes(p.installed)} on disk${p.deps.length ? ` · needs ${p.deps.length} other${p.deps.length === 1 ? "" : "s"}` : ""}` })),
          el("div", { class: "pkg-actions" },
            have && p.app && el("button", { class: "btn small", onclick: () => launchApp(p.name, p.app.name) }, icon("play", 13), "Open"),
            newer && el("button", { class: "btn small primary", disabled: busy, onclick: () => change("install", p) }, `Update to ${p.version}`),
            !have && el("button", { class: "btn small primary", disabled: busy, onclick: () => change("install", p) }, icon("download", 13), "Install"),
            have && p.set !== "base" && el("button", { class: "btn small", disabled: busy, onclick: () => change("remove", p) }, "Remove"),
            have && p.set === "base" && el("span", { class: "tag", text: "part of the system" })));
      }));
    }

    async function change(action, p) {
      if (busy) return;
      if (action === "remove" && !(await confirmDialog(`Remove ${p.app?.name ?? p.name}`, "Its files are taken off this system. What you made with it stays.", "Remove", true))) return;
      busy = true; paint();
      const pane = el("div", { class: "job-term" });
      const status = el("span", { class: "dim small", text: "working…" });
      const closeBtn = el("button", { class: "btn small", text: "Hide", onclick: () => { job?.close(); job = null; jobBox.hidden = true; } });
      fill(jobBox, el("div", { class: "pkg-job-head" }, el("b", { text: `${action === "install" ? "Installing" : "Removing"} ${p.app?.name ?? p.name}` }), status, el("span", { class: "gap" }), closeBtn), pane);
      jobBox.hidden = false;
      try {
        const argv = await call("pkg.command", { action, names: [p.name] });
        job?.close();
        job = await runJob(pane, argv, { title: `pkg ${action} ${p.name}` });
        const code = await job.done;
        status.textContent = code === 0 ? "done" : `ended with code ${code}`;
        status.className = `small ${code === 0 ? "good-text" : "bad-text"}`;
        if (code === 0) toast(`${p.app?.name ?? p.name} ${action === "install" ? "installed" : "removed"}`, "good");
      } catch (e) {
        toast(e.message, "bad"); status.textContent = "failed";
      }
      busy = false;
      await load();
    }

    search.addEventListener("input", paint);
    paint();
    return { show() { load(); } };
  },
};
