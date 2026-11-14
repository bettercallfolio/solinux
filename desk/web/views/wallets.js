// Keys: the keypair files of this system, what they hold, and the everyday things done with them.

import { el, icon, call, rpc, on, attempt, dialog, confirmDialog, menu, sol, short, num, copyable, emptyState, toast, every, fill } from "../core.js";
import { state, refreshConfig, canAirdrop, pulseNow } from "../state.js";
import { askAirdrop } from "../actions.js";
import { runJob } from "../termview.js";

const TOKEN_PROGRAMS = ["TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"];

/** Runs a command and shows what it prints in a window that stays until it is closed. */
async function commandWindow(title, argv, note) {
  const pane = el("div", { class: "job-term" });
  const status = el("span", { class: "dim small", text: "running…" });
  const closeBtn = el("button", { class: "btn", text: "Close" });
  const box = el("div", { class: "dialog wide" }, el("h2", { text: title }), note && el("p", { class: "dim small", text: note }),
    el("code", { class: "wrap cmd", text: `$ ${argv.map((a) => (/[\s"']/.test(a) ? JSON.stringify(a) : a)).join(" ")}` }), pane,
    el("div", { class: "dialog-buttons" }, status, el("span", { class: "gap" }), closeBtn));
  const shade = el("div", { class: "shade in" }, box);
  document.body.append(shade);
  const job = await runJob(pane, argv, { title }).catch((e) => { toast(e.message, "bad"); return null; });
  const done = job ? job.done.then((code) => { status.textContent = code === 0 ? "finished" : `ended with code ${code}`; status.className = `small ${code === 0 ? "good-text" : "bad-text"}`; return code; }) : Promise.resolve(1);
  closeBtn.onclick = () => { job?.close(); shade.remove(); };
  return done;
}

export default {
  id: "wallets", title: "Keys", icon: "wallet",
  create(root, { go }) {
    const list = el("div", { class: "key-list" });
    const tokensCard = el("section", { class: "card", hidden: true });
    root.append(el("div", { class: "page" },
      el("div", { class: "page-head" },
        el("p", { class: "dim", text: "A key is a file on this system. Its address is public; whoever has the file can spend what the address holds." }),
        el("button", { class: "btn primary", onclick: () => create() }, icon("plus", 15), "New key")),
      list, tokensCard));

    let shown = false;
    let balances = new Map();   // address -> lamports
    let picked = null;          // address whose tokens are shown

    function paint() {
      const hasSolana = state.tools.some((t) => t.name === "solana" && t.version);
      if (!state.keys.length) {
        fill(list, emptyState("key", "No key on this system yet", "Make one to have an address on Solana. On localnet and devnet you can fill it with test SOL right away.",
          el("button", { class: "btn primary", onclick: () => create() }, icon("plus", 15), "Make a key")));
        tokensCard.hidden = true;
        return;
      }
      fill(list, ...state.keys.map((k) => {
        const bal = balances.get(k.address);
        return el("article", { class: `key-card ${k.isDefault ? "default" : ""} ${picked === k.address ? "picked" : ""}`, onclick: () => pick(k.address) },
          el("div", { class: "key-main" },
            el("div", { class: "key-name" }, icon("key", 16), el("b", { text: k.name }), k.isDefault && el("span", { class: "tag good", text: "in use" })),
            copyable(k.address, k.address, "key-address"),
            el("div", { class: "dim small mono", text: k.path })),
          el("div", { class: "key-side" },
            el("div", { class: "balance" }, el("b", { class: "mono", text: state.cluster.ok && bal !== undefined ? sol(bal) : "-" }), el("span", { text: "SOL" })),
            el("div", { class: "row" },
              canAirdrop() && el("button", { class: "btn small", disabled: !state.cluster.ok, onclick: (e) => { e.stopPropagation(); askAirdrop(k.address).then(load); } }, icon("drop", 13), "Airdrop"),
              hasSolana && el("button", { class: "btn small", disabled: !state.cluster.ok, onclick: (e) => { e.stopPropagation(); send(k); } }, icon("send", 13), "Send"),
              el("button", { class: "tool", title: "More", "aria-label": `More for ${k.name}`, onclick: (e) => { e.stopPropagation(); more(e.currentTarget, k); } }, icon("more", 16)))));
      }));
    }

    function more(anchor, k) {
      menu(anchor, [
        !k.isDefault && { label: "Use this key", icon: "check", run: () => attempt(() => call("sol.setDefaultKey", { path: k.path }).then(refreshConfig), `The system now signs with ${k.name}`) },
        { label: "Look up in the explorer", icon: "explorer", run: () => go("explorer", { query: k.address }) },
        { label: "Show the file", icon: "files", run: () => go("files", { path: k.path.replace(/\/[^/]+$/, "") }) },
        "-",
        { label: "Remove from this list", icon: "trash", danger: true, run: () => retire(k) },
      ].filter(Boolean));
    }

    async function create() {
      const v = await dialog({
        title: "New key", fields: [{ name: "name", label: "Name", value: state.keys.length ? "" : "id", placeholder: "dev", hint: "The key is a new file in ~/.config/solana. It has no recovery phrase: keep a copy of the file if it will ever hold something of value." }], ok: "Create",
      });
      if (!v?.name.trim()) return;
      const k = await attempt(() => call("sol.createKey", { name: v.name.trim() }), "Key created");
      if (k) { picked = k.address; await refreshConfig(); load(); }
    }
    async function retire(k) {
      if (!(await confirmDialog(`Remove ${k.name}`, `The key file is not destroyed: it is moved to ~/.config/solana/removed. ${balances.get(k.address) ? `It still holds ${sol(balances.get(k.address))} SOL on ${state.cluster.name}.` : ""}`, "Remove", true))) return;
      if (await attempt(() => call("sol.retireKey", { path: k.path }), "Moved to ~/.config/solana/removed")) refreshConfig();
    }
    async function send(k) {
      const v = await dialog({
        title: `Send SOL from ${k.name}`,
        fields: [{ name: "to", label: "To address", placeholder: "recipient address" }, { name: "amount", label: "SOL", type: "number", placeholder: "0.1" }],
        ok: "Send",
      });
      if (!v) return;
      const to = v.to.trim(), amount = Number(v.amount);
      if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(to)) { toast("That is not an address", "bad"); return; }
      if (!(amount > 0)) { toast("Say how much SOL", "bad"); return; }
      if (state.cluster.name === "mainnet" && !(await confirmDialog("This is mainnet", `Send ${amount} real SOL to ${short(to, 6)}?`, "Send", true))) return;
      await commandWindow(`Send ${amount} SOL`, ["solana", "transfer", "--from", k.path, "--fee-payer", k.path, "--url", state.cluster.url, "--allow-unfunded-recipient", to, String(amount)],
        "This is the command the desk runs for you. It works the same in a terminal.");
      load(); pulseNow();
    }

    async function load() {
      if (!state.keys.length || !state.cluster.ok) { paint(); return; }
      try {
        const r = await rpc("getMultipleAccounts", [state.keys.map((k) => k.address), { commitment: "confirmed", dataSlice: { offset: 0, length: 0 } }]);
        balances = new Map(state.keys.map((k, i) => [k.address, r.value[i]?.lamports ?? 0]));
      } catch { /* the cluster did not answer; the next round asks again */ }
      paint();
    }

    async function pick(address) {
      picked = address;
      paint();
      tokens();
    }
    async function tokens() {
      const k = state.keys.find((x) => x.address === picked);
      if (!k || !state.cluster.ok) { tokensCard.hidden = true; return; }
      const mine = picked;
      const found = [];
      for (const program of TOKEN_PROGRAMS) {
        const r = await rpc("getTokenAccountsByOwner", [k.address, { programId: program }, { encoding: "jsonParsed", commitment: "confirmed" }]).catch(() => null);
        for (const a of r?.value ?? []) found.push({ account: a.pubkey, ...a.account.data.parsed.info, program });
      }
      if (mine !== picked) return;
      tokensCard.hidden = false;
      fill(tokensCard, el("header", null, el("h2", { text: `Tokens of ${k.name}` }), el("span", { class: "dim small", text: `on ${state.cluster.name}` })),
        found.length ? el("table", { class: "table" },
          el("thead", null, el("tr", null, el("th", { text: "Token (mint)" }), el("th", { text: "Token account" }), el("th", { class: "r", text: "Amount" }))),
          el("tbody", null, found.map((t) => el("tr", { class: "click", onclick: () => go("explorer", { query: t.account }) },
            el("td", null, el("span", { class: "mono", text: short(t.mint, 8) }), t.program === TOKEN_PROGRAMS[1] && el("span", { class: "tag", text: "Token-2022" })),
            el("td", null, el("span", { class: "mono dim", text: short(t.account, 8) })),
            el("td", { class: "r mono", text: t.tokenAmount?.uiAmountString ?? num(t.tokenAmount?.amount) })))))
          : el("p", { class: "dim", text: "This key holds no tokens here." }));
    }

    on("state", () => { if (!state.keys.some((k) => k.address === picked)) picked = state.keys.find((k) => k.isDefault)?.address ?? null; paint(); if (shown) { load(); tokens(); } });
    every(5000, load, () => shown);
    paint();

    return {
      show(arg) { shown = true; if (!picked) picked = state.keys.find((k) => k.isDefault)?.address ?? null; load(); tokens(); if (arg?.create) create(); },
      hide() { shown = false; },
    };
  },
};
