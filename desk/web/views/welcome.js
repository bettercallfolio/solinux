// Welcome: what a person sees the first time the desktop opens.

import { el, icon, session } from "../core.js";

export default {
  id: "welcome", title: "Welcome", icon: "info",
  create(root, { go }) {
    const card = (name, iconName, title, text) => el("button", { class: "welcome-card", onclick: () => go(name) }, icon(iconName, 22), el("b", { text: title }), el("span", { text }));
    const sys = session.hello?.sys;
    root.append(el("div", { class: "welcome" },
      el("div", { class: "welcome-head" }, el("div", { class: "logo big" }, el("i")),
        el("div", null, el("h2", { text: sys?.name === "Solinux" ? `Solinux ${sys.version}` : "The Solinux desktop" }),
          el("p", { class: "dim", text: "A Linux system for building on Solana. It runs on your computer; this is its desktop." }))),
      el("div", { class: "welcome-grid" },
        card("files", "files", "Files", "Your folders. A double click opens pictures, music, video, PDF and text."),
        card("terminal", "terminal", "Terminal", "A shell on the system. It stays open when you close this page."),
        card("software", "package", "Software", "Install applications. They appear in the launcher."),
        card("validator", "validator", "Local validator", "A Solana cluster of your own, for trying things."),
        card("wallets", "wallet", "Keys", "Make a key, fill it with test SOL, send."),
        card("explorer", "explorer", "Explorer", "Look at accounts, transactions and blocks.")),
      el("p", { class: "dim small welcome-foot" }, "The square at the top of the dock lists every application. ",
        el("kbd", { text: "Ctrl" }), " ", el("kbd", { text: "K" }), " finds anything by name. Windows snap to a half of the screen when you drag them to its edge.")));
    return {};
  },
};
