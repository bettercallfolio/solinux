// Programs: the Solana programs you are writing. Make a project, build it, test it, deploy
// it to the cluster the system is set to, and see whether it is there.

import { el, icon, call, rpc, on, attempt, dialog, fill, bytes, ago, short, copyable, emptyState, toast, confirmDialog } from "../core.js";
import { state } from "../state.js";
import { runJob } from "../termview.js";

export default {
  id: "programs", title: "Programs", icon: "code",
  create(root, { go }) {
    const list = el("div", { class: "proj-list" });
    const detail = el("div", { class: "proj-detail" });
    root.append(el("div", { class: "proj" },
      el("aside", { class: "proj-side" },
        el("div", { class: "proj-side-head" }, el("b", { text: "Projects" }), el("button", { class: "tool", title: "New project", "aria-label": "New project", onclick: () => create() }, icon("plus", 16))),
        list),
      detail));

    let data = { root: "~/projects", projects: [] }, picked = null, job = null, busy = false, onChain = new Map();
    const tool = (name) => state.tools.find((t) => t.name === name)?.version ?? null;

    async function load() {
      const r = await attempt(() => call("proj.list"));
      if (!r) return;
      data = r;
      if (!data.projects.some((p) => p.path === picked)) picked = data.projects[0]?.path ?? null;
      paint(); check();
    }

    /** Asks the cluster which of the built programs are deployed on it. */
    async function check() {
      const p = data.projects.find((x) => x.path === picked);
      const addresses = (p?.programs ?? []).map((b) => b.address).filter(Boolean);
      if (!addresses.length || !state.cluster.ok) return;
      const r = await rpc("getMultipleAccounts", [addresses, { commitment: "confirmed", dataSlice: { offset: 0, length: 0 } }]).catch(() => null);
      if (!r) return;
      addresses.forEach((a, i) => onChain.set(`${state.cluster.url} ${a}`, !!r.value[i]?.executable));
      paintDetail();
    }

    function paint() {
      fill(list, data.projects.length ? data.projects.map((p) => el("button", { class: p.path === picked ? "on" : "", onclick: () => { picked = p.path; paint(); check(); } },
        icon("code", 15), el("span", { text: p.name }), el("span", { class: "tag", text: p.kind === "anchor" ? "Anchor" : "Rust" })))
        : el("p", { class: "dim small proj-none", text: "No project yet." }));
      paintDetail();
    }

    function paintDetail() {
      const p = data.projects.find((x) => x.path === picked);
      if (!p) {
        const cargo = tool("cargo");
        fill(detail, emptyState("code", "Write a Solana program",
          cargo ? `Projects live in ${data.root}. A new one is ready to build.` : "The tools that build programs (Rust, cargo build-sbf) are not installed on this system. On Solinux they are part of it.",
          el("button", { class: "btn primary", onclick: () => create() }, icon("plus", 15), "New project")));
        return;
      }
      const act = (label, iconName, action, primary) => el("button", { class: `btn ${primary ? "primary" : ""}`, disabled: busy, onclick: () => run(action, p) }, icon(iconName, 14), label);
      fill(detail,
        el("div", { class: "proj-head" },
          el("div", null, el("h2", { text: p.name }), el("button", { class: "link mono small", onclick: () => go("files", { path: p.path }) }, p.path)),
          el("div", { class: "row wrap" },
            act("Build", "box", "build", true), act("Test", "check", "test"), act(`Deploy to ${state.cluster.name || "the cluster"}`, "upload", "deploy"),
            el("button", { class: "tool", title: "Terminal in this project", onclick: () => go("terminal", { cwd: p.path }) }, icon("terminal", 16)))),
        el("section", { class: "card" }, el("header", null, el("h2", { text: "Built programs" })),
          p.programs.length ? el("table", { class: "table" },
            el("thead", null, el("tr", null, el("th", { text: "Program" }), el("th", { text: "Address" }), el("th", { class: "r", text: "Size" }), el("th", { text: "Built" }), el("th", { text: `On ${state.cluster.name}` }), el("th"))),
            el("tbody", null, p.programs.map((b) => {
              const there = b.address ? onChain.get(`${state.cluster.url} ${b.address}`) : undefined;
              return el("tr", null,
                el("td", null, el("b", { text: b.name })),
                el("td", null, b.address ? copyable(b.address, short(b.address, 6)) : el("span", { class: "dim", text: "no key yet" })),
                el("td", { class: "r mono dim", text: bytes(b.size) }),
                el("td", { class: "dim", text: ago(b.built) }),
                el("td", null, there === undefined ? el("span", { class: "dim", text: "-" }) : el("span", { class: `tag ${there ? "good" : ""}`, text: there ? "deployed" : "not deployed" })),
                el("td", { class: "r" }, el("div", { class: "row" },
                  b.address && there && el("button", { class: "btn small", onclick: () => go("explorer", { query: b.address }) }, "Look up"),
                  b.idl && el("button", { class: "btn small", onclick: () => go("text", { path: b.idl }) }, "IDL"))));
            })))
            : el("p", { class: "dim", text: "Nothing is built yet. Build the project and its programs appear here." })),
        el("section", { class: "card proj-job", hidden: !job },
          el("header", null, el("h2", { text: job?.title ?? "" }), el("span", { class: job?.cls ?? "dim small", text: job?.status ?? "" })),
          job?.pane));
    }

    async function run(action, p) {
      if (busy) return;
      if (action === "deploy" && state.cluster.name === "mainnet" && !(await confirmDialog("This is mainnet", "Deploying costs real SOL. Go on?", "Deploy", true))) return;
      const cmd = await attempt(() => call("proj.command", { action, path: p.path }));
      if (!cmd) return;
      busy = true;
      job?.handle?.close();
      const pane = el("div", { class: "job-term tall" });
      job = { title: `$ ${cmd.argv.join(" ")}`, status: "running…", cls: "dim small", pane, handle: null };
      paintDetail();
      try {
        job.handle = await runJob(pane, cmd.argv, { cwd: cmd.cwd, title: `${action} ${p.name}` });
        const code = await job.handle.done;
        job.status = code === 0 ? "finished" : `ended with code ${code}`;
        job.cls = `small ${code === 0 ? "good-text" : "bad-text"}`;
        if (code === 0) toast(`${p.name}: ${action} finished`, "good");
      } catch (e) { job.status = e.message; job.cls = "small bad-text"; }
      busy = false;
      await load();
    }

    async function create() {
      const anchor = tool("anchor"), cargo = tool("cargo");
      if (!anchor && !cargo) { toast("Rust and Anchor are not installed on this system", "bad"); return; }
      const kinds = [anchor && { value: "anchor", label: "Anchor (the usual framework)" }, cargo && { value: "rust", label: "Plain Rust (the smallest program)" }].filter(Boolean);
      const v = await dialog({ title: "New project", fields: [
        { name: "name", label: "Name", placeholder: "hello", hint: `It becomes a folder in ${data.root}.` },
        { name: "kind", label: "Kind", type: "select", value: kinds[0].value, options: kinds },
      ], ok: "Create" });
      const name = v?.name.trim();
      if (!name) return;
      if (v.kind === "rust") {
        const p = await attempt(() => call("proj.create", { name }), "Project created");
        if (p) { picked = p.path; await load(); }
        return;
      }
      const cmd = await attempt(() => call("proj.command", { action: "init", name }));
      if (!cmd) return;
      busy = true;
      const pane = el("div", { class: "job-term tall" });
      job = { title: `$ ${cmd.argv.join(" ")}`, status: "running…", cls: "dim small", pane, handle: null };
      fill(detail, el("section", { class: "card proj-job" }, el("header", null, el("h2", { text: job.title })), pane));
      job.handle = await runJob(pane, cmd.argv, { cwd: cmd.cwd, title: `anchor init ${name}` }).catch(() => null);
      await job.handle?.done;
      busy = false; job = null;
      await load();
      picked = data.projects.find((p) => p.name === name)?.path ?? picked;
      paint();
    }

    on("state", () => { if (shown) { paintDetail(); check(); } });
    let shown = false;
    paint();
    return { show() { shown = true; load(); }, hide() { shown = false; } };
  },
};
