// Settings: how the desk looks, what the system is set to, and what is installed.

import { el, icon, call, on, attempt, store, facts, copyable, session, bytes, fill } from "../core.js";
import { state, setCluster, clusterName, refreshConfig } from "../state.js";

export default {
  id: "settings", title: "Settings", icon: "settings",
  create(root, { applyTheme, go }) {
    const look = el("section", { class: "card" });
    const cluster = el("section", { class: "card" });
    const system = el("section", { class: "card" });
    const tools = el("section", { class: "card" });
    const about = el("section", { class: "card" });
    root.append(el("div", { class: "page narrow" }, look, cluster, system, tools, about));

    function paintLook() {
      const now = store.get("theme", "auto");
      fill(look, el("header", null, el("h2", { text: "Appearance" })),
        el("div", { class: "setting" }, el("div", null, el("b", { text: "Theme" }), el("p", { class: "dim small", text: "Automatic follows your computer." })),
          el("div", { class: "seg" }, [["auto", "Automatic"], ["dark", "Dark"], ["light", "Light"]].map(([v, label]) =>
            el("button", { class: v === now ? "on" : "", onclick: () => { store.set("theme", v); applyTheme(v); paintLook(); } }, label)))));
    }

    function paintCluster() {
      const c = state.config;
      if (!c) return;
      const input = el("input", { type: "text", value: c.rpcUrl, spellcheck: false, autocomplete: "off", "aria-label": "RPC address" });
      fill(cluster, el("header", null, el("h2", { text: "Solana" })),
        el("div", { class: "setting" }, el("div", null, el("b", { text: "Cluster" }), el("p", { class: "dim small", text: "The desk and the solana command-line tools share this setting (solana config)." })),
          el("div", { class: "seg" }, Object.values(c.clusters).map((url) => el("button", { class: url === c.rpcUrl ? "on" : "", onclick: () => attempt(() => setCluster(url)) }, clusterName(url))))),
        el("form", { class: "setting", onsubmit: (e) => { e.preventDefault(); attempt(() => setCluster(input.value.trim()), "Saved"); } },
          el("div", null, el("b", { text: "RPC address" }), el("p", { class: "dim small", text: "Your own endpoint is faster and more patient than the public ones." })),
          el("div", { class: "row grow" }, input, el("button", { class: "btn", type: "submit" }, "Save"))),
        el("div", { class: "setting" }, el("div", null, el("b", { text: "Key in use" }), el("p", { class: "dim small mono", text: c.keypairPath })),
          el("button", { class: "btn", onclick: () => go("wallets") }, "Keys")));
    }

    function paintSystem() {
      const s = session.hello?.sys;
      if (!s) return;
      fill(system, el("header", null, el("h2", { text: "This system" })), facts([
        ["System", `${s.name} ${s.version}`.trim()],
        ["Name", s.hostname],
        ["Kernel", `Linux ${s.kernel} (${s.arch})`],
        ["Processor", `${s.cores} × ${s.cpu}`],
        ["Memory", bytes(s.memory)],
        ["Signed in as", `${s.user} (${s.home})`],
        ["Runs as", s.booted ? "a booted system with its own kernel" : "a machine on the kernel of its host"],
        ["Desk", `version ${session.hello.version}, at ${location.host}`],
        ["Access", session.hello.token ? "asks for the token in ~/.config/solinux/desk-token" : "open to everyone who can reach this address"],
      ]));
    }

    function paintTools() {
      fill(tools, el("header", null, el("h2", { text: "Installed tools" }),
        el("button", { class: "link", onclick: async () => { state.tools = (await attempt(() => call("sol.tools", { fresh: true }))) ?? state.tools; paintTools(); } }, icon("refresh", 13), "Look again")),
        el("table", { class: "table" }, el("tbody", null, state.tools.map((t) => el("tr", null,
          el("td", null, el("span", { class: `tool-row inline ${t.version ? "" : "missing"}` }, el("i", { class: "dot" }), el("span", { text: t.name }))),
          el("td", { class: "mono", text: t.version ?? "not installed" }),
          el("td", { class: "mono dim", text: t.path ?? "" }))))));
    }

    about.append(el("header", null, el("h2", { text: "About" })),
      el("p", null, "Solinux is a Linux system built from source for people who build on Solana. This desk is its graphical interface: it runs on the system and is shown by your browser."),
      el("p", { class: "dim small" }, "The terminal on these pages is xterm.js (MIT). Everything else here is part of Solinux (MIT). ",
        el("a", { href: "https://chainboot.dev", target: "_blank", rel: "noopener" }, "chainboot.dev")));

    on("state", () => { paintCluster(); paintTools(); });
    on("connected", paintSystem);
    paintLook(); paintCluster(); paintSystem(); paintTools();
    return { show() { refreshConfig().catch(() => {}); } };
  },
};
