// Explorer: look at an account, a transaction or a block of the cluster the system is set to.

import { el, icon, rpc, on, num, sol, short, ago, copyable, facts, emptyState, bytes, every, fill } from "../core.js";
import { state, isLocal } from "../state.js";

const ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const SIGNATURE = /^[1-9A-HJ-NP-Za-km-z]{85,90}$/;

const KNOWN = {
  "11111111111111111111111111111111": "System Program",
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA": "Token Program",
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb": "Token-2022 Program",
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL": "Associated Token Program",
  "ComputeBudget111111111111111111111111111111": "Compute Budget",
  "Vote111111111111111111111111111111111111111": "Vote Program",
  "Stake11111111111111111111111111111111111111": "Stake Program",
  "BPFLoaderUpgradeab1e11111111111111111111111": "Upgradeable Loader",
  "BPFLoader2111111111111111111111111111111111": "BPF Loader 2",
  "LoaderV411111111111111111111111111111111111": "Loader v4",
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr": "Memo Program",
  "noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV": "Noop Program",
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s": "Metaplex Token Metadata",
  "Sysvar1111111111111111111111111111111111111": "Sysvar",
  "AddressLookupTab1e1111111111111111111111111": "Address Lookup Table",
};
const nameOf = (address) => KNOWN[address] ?? null;

/** A tree of any JSON value, folded where it gets deep. */
function jsonTree(value, depth = 0) {
  if (value === null || typeof value !== "object") {
    const cls = value === null ? "j-null" : typeof value;
    return el("span", { class: `j-${cls}`, text: typeof value === "string" ? JSON.stringify(value) : String(value) });
  }
  const isArray = Array.isArray(value);
  const keys = Object.keys(value);
  if (!keys.length) return el("span", { class: "dim", text: isArray ? "[]" : "{}" });
  const d = el("details", { class: "j", open: depth < 2 });
  d.append(el("summary", { text: isArray ? `[${keys.length}]` : `{${keys.length}}` }));
  let filled = false;
  const fill = () => {
    if (filled) return; filled = true;
    d.append(el("div", { class: "j-body" }, keys.map((k) => el("div", null, el("span", { class: "j-key", text: isArray ? `${k}: ` : `${k}: ` }), jsonTree(value[k], depth + 1)))));
  };
  if (d.open) fill(); else d.addEventListener("toggle", fill, { once: true });
  return d;
}

function hexDump(base64, limit = 1024) {
  const raw = atob(base64);
  const lines = [];
  for (let off = 0; off < Math.min(raw.length, limit); off += 16) {
    const chunk = raw.slice(off, off + 16);
    const hex = [...chunk].map((c) => c.charCodeAt(0).toString(16).padStart(2, "0"));
    const text = [...chunk].map((c) => (c >= " " && c <= "~" ? c : "·")).join("");
    lines.push(`${off.toString(16).padStart(6, "0")}  ${hex.slice(0, 8).join(" ").padEnd(23)}  ${hex.slice(8).join(" ").padEnd(23)}  ${text}`);
  }
  if (raw.length > limit) lines.push(`… ${num(raw.length - limit)} more bytes`);
  return el("pre", { class: "hex", text: lines.join("\n") });
}

export default {
  id: "explorer", title: "Explorer", icon: "explorer",
  create(root, { go }) {
    const input = el("input", { type: "search", placeholder: "Address, transaction signature or slot", spellcheck: false, autocomplete: "off", "aria-label": "Search the cluster" });
    const form = el("form", { class: "search", onsubmit: (e) => { e.preventDefault(); look(input.value.trim()); } }, icon("search", 17), input, el("button", { class: "btn primary", type: "submit" }, "Look up"));
    const where = el("span", { class: "dim small" });
    const out = el("div", { class: "explorer-out" });
    root.append(el("div", { class: "page" }, el("div", { class: "search-row" }, form, where), out));

    let shown = false, token = 0, mode = "recent";
    const trail = [];

    const addr = (a, n = 0) => el("span", { class: "addr" }, el("button", { class: "link mono", title: a, onclick: () => look(a) }, n ? short(a, n) : a), nameOf(a) && el("span", { class: "tag", text: nameOf(a) }));
    const loading = (what) => fill(out, el("div", { class: "loading", text: `Reading ${what}…` }));
    const problem = (e) => fill(out, emptyState("warn", "That did not work", e.message ?? String(e)));

    async function look(q, push = true) {
      if (!q) { recent(); return; }
      input.value = q;
      if (push) trail.push(q);
      mode = "item";
      const my = ++token;
      try {
        if (/^\d+$/.test(q)) { loading("the block"); const b = await rpc("getBlock", [Number(q), { encoding: "json", transactionDetails: "accounts", maxSupportedTransactionVersion: 0, rewards: false }]); if (my === token) block(Number(q), b); }
        else if (SIGNATURE.test(q)) { loading("the transaction"); const t = await rpc("getTransaction", [q, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0, commitment: "confirmed" }]); if (my === token) transaction(q, t); }
        else if (ADDRESS.test(q)) {
          loading("the account");
          const [info, sigs] = await Promise.all([
            rpc("getAccountInfo", [q, { encoding: "jsonParsed", commitment: "confirmed" }]),
            rpc("getSignaturesForAddress", [q, { limit: 25 }]).catch(() => []),
          ]);
          if (my === token) account(q, info.value, sigs);
        } else fill(out, emptyState("search", "Not an address, a signature or a slot", "An address has 32 to 44 characters, a transaction signature about 88, a slot is a number."));
      } catch (e) { if (my === token) problem(e); }
    }

    function sigRows(sigs) {
      return el("table", { class: "table" }, el("thead", null, el("tr", null, el("th", { text: "Transaction" }), el("th", { text: "Result" }), el("th", { class: "r", text: "Slot" }), el("th", { class: "r", text: "When" }))),
        el("tbody", null, sigs.map((s) => el("tr", { class: "click", onclick: () => look(s.signature) },
          el("td", null, el("span", { class: "mono", text: short(s.signature, 10) })),
          el("td", null, el("span", { class: `tag ${s.err ? "bad" : "good"}`, text: s.err ? "failed" : "success" })),
          el("td", { class: "r mono dim", text: num(s.slot) }),
          el("td", { class: "r dim", text: s.blockTime ? ago(s.blockTime * 1000) : "" })))));
    }

    function account(address, info, sigs) {
      if (!info) {
        fill(out, el("section", { class: "card" }, el("header", null, el("h2", { text: "Account" })),
          facts([["Address", copyable(address)], ["State", `Nothing is stored at this address on ${state.cluster.name}, and it holds no SOL.`]])),
          sigs.length ? el("section", { class: "card" }, el("header", null, el("h2", { text: "Transactions" })), sigRows(sigs)) : null);
        return;
      }
      const parsed = !Array.isArray(info.data) ? info.data : null;
      const kind = info.executable ? "Program" : parsed ? `${parsed.program} ${parsed.parsed?.type ?? ""}`.trim() : info.owner === "11111111111111111111111111111111" ? "Wallet" : "Account";
      fill(out, 
        el("section", { class: "card" }, el("header", null, el("h2", { text: kind }), nameOf(address) && el("span", { class: "tag", text: nameOf(address) })),
          facts([
            ["Address", copyable(address)],
            ["Balance", `${sol(info.lamports, 9)} SOL`],
            ["Owner", addr(info.owner)],
            ["Data", `${num(info.space ?? 0)} bytes`],
            info.executable && ["Executable", "yes"],
          ])),
        parsed ? el("section", { class: "card" }, el("header", null, el("h2", { text: "Content" })), el("div", { class: "json" }, jsonTree(parsed.parsed)))
          : info.data?.[0] ? el("section", { class: "card" }, el("header", null, el("h2", { text: "Data" })), hexDump(info.data[0])) : null,
        el("section", { class: "card" }, el("header", null, el("h2", { text: "Transactions" })),
          sigs.length ? sigRows(sigs) : el("p", { class: "dim", text: "No transaction mentions this address (as far as this endpoint remembers)." })));
    }

    function transaction(signature, t) {
      if (!t) { fill(out, emptyState("search", "No such transaction", `${state.cluster.name} does not know this signature. It may be on another cluster, or too old for this endpoint.`)); return; }
      const msg = t.transaction.message, meta = t.meta ?? {};
      const keys = msg.accountKeys.map((k) => (typeof k === "string" ? { pubkey: k } : k));
      const changes = keys.map((k, i) => ({ k, d: (meta.postBalances?.[i] ?? 0) - (meta.preBalances?.[i] ?? 0) })).filter((x) => x.d !== 0);
      fill(out, 
        el("section", { class: "card" }, el("header", null, el("h2", { text: "Transaction" }), el("span", { class: `tag ${meta.err ? "bad" : "good"}`, text: meta.err ? "failed" : "success" })),
          facts([
            ["Signature", copyable(signature, short(signature, 16))],
            ["Slot", el("button", { class: "link mono", onclick: () => look(String(t.slot)) }, num(t.slot))],
            ["When", t.blockTime ? `${new Date(t.blockTime * 1000).toLocaleString()} (${ago(t.blockTime * 1000)})` : "-"],
            ["Fee", `${sol(meta.fee, 9)} SOL`],
            ["Paid by", addr(keys[0].pubkey)],
            meta.computeUnitsConsumed !== undefined && ["Compute units", num(meta.computeUnitsConsumed)],
            meta.err && ["Error", el("code", { class: "wrap", text: JSON.stringify(meta.err) })],
          ])),
        el("section", { class: "card" }, el("header", null, el("h2", { text: `Instructions (${msg.instructions.length})` })),
          el("div", { class: "ix-list" }, msg.instructions.map((ix, i) => el("div", { class: "ix" },
            el("div", { class: "ix-head" }, el("span", { class: "ix-n mono", text: `#${i + 1}` }), addr(ix.programId, 6), ix.parsed?.type && el("span", { class: "tag", text: ix.parsed.type })),
            ix.parsed ? el("div", { class: "json" }, jsonTree(ix.parsed.info ?? ix.parsed, 1))
              : el("div", { class: "ix-raw" }, el("div", { class: "dim small", text: "Accounts" }), el("div", { class: "ix-accounts" }, (ix.accounts ?? []).map((a) => addr(a, 6))),
                el("div", { class: "dim small", text: "Data (base58)" }), el("code", { class: "wrap", text: ix.data || "(none)" })))))),
        changes.length ? el("section", { class: "card" }, el("header", null, el("h2", { text: "SOL moved" })),
          el("table", { class: "table" }, el("tbody", null, changes.map(({ k, d }) => el("tr", null, el("td", null, addr(k.pubkey, 8)), el("td", { class: `r mono ${d > 0 ? "plus" : "minus"}`, text: `${d > 0 ? "+" : ""}${sol(d, 9)}` })))))) : null,
        meta.logMessages?.length ? el("section", { class: "card" }, el("header", null, el("h2", { text: "Program log" })), el("pre", { class: "plain-log", text: meta.logMessages.join("\n") })) : null);
    }

    function block(slot, b) {
      if (!b) { fill(out, emptyState("box", "No block at this slot", "The slot was skipped, or this endpoint no longer keeps it.")); return; }
      const txs = b.transactions ?? [];
      const isVote = (t) => t.transaction.accountKeys.some((k) => (k.pubkey ?? k) === "Vote111111111111111111111111111111111111111");
      const mine = txs.filter((t) => !isVote(t));
      fill(out, 
        el("section", { class: "card" }, el("header", null, el("h2", { text: `Block ${num(slot)}` })),
          facts([
            ["Blockhash", copyable(b.blockhash)],
            ["Parent", el("button", { class: "link mono", onclick: () => look(String(b.parentSlot)) }, num(b.parentSlot))],
            ["Height", num(b.blockHeight)],
            ["When", b.blockTime ? `${new Date(b.blockTime * 1000).toLocaleString()} (${ago(b.blockTime * 1000)})` : "-"],
            ["Transactions", `${num(txs.length)} (${num(txs.length - mine.length)} of them votes)`],
          ])),
        el("section", { class: "card" }, el("header", null, el("h2", { text: "Transactions without votes" })),
          mine.length ? sigRows(mine.slice(0, 100).map((t) => ({ signature: t.transaction.signatures[0], err: t.meta?.err, slot, blockTime: b.blockTime })))
            : el("p", { class: "dim", text: "Only votes in this block." })));
    }

    // The front page: on a local validator, what just happened; elsewhere, where to start.
    let lastSeen = 0;
    const feed = [];
    async function recent() {
      mode = "recent"; token++;
      input.value = "";
      const key = state.keys.find((k) => k.isDefault);
      const tips = el("section", { class: "card" }, el("header", null, el("h2", { text: "Look something up" })),
        el("p", { class: "dim", text: "Paste an address, a transaction signature or a slot number above." }),
        el("div", { class: "row wrap" },
          key && el("button", { class: "btn", onclick: () => look(key.address) }, icon("key", 14), `Your key (${short(key.address)})`),
          el("button", { class: "btn", onclick: () => look("11111111111111111111111111111111") }, "System Program"),
          el("button", { class: "btn", onclick: () => look("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA") }, "Token Program"),
          state.cluster.slot !== null && el("button", { class: "btn", onclick: () => look(String(state.cluster.slot)) }, `Latest block (${num(state.cluster.slot)})`)));
      const live = el("section", { class: "card", hidden: !isLocal() }, el("header", null, el("h2", { text: "Just now on your validator" }), el("span", { class: "dim small", text: "votes are left out" })), el("div", { id: "feed" }));
      fill(out, tips, live);
      paintFeed();
    }
    function paintFeed() {
      const box = out.querySelector("#feed");
      if (!box) return;
      fill(box, feed.length ? sigRows(feed) : el("p", { class: "dim", text: state.validator?.running ? "No transaction yet. Send one (an airdrop will do) and it shows up here." : "The local validator is not running." }));
    }
    every(2000, async () => {
      if (mode !== "recent" || !isLocal() || !state.cluster.ok) return;
      const tip = await rpc("getSlot", [{ commitment: "confirmed" }]);
      if (tip < lastSeen) { lastSeen = 0; feed.length = 0; }   // the ledger was started over
      const from = Math.max(lastSeen + 1, tip - 12);
      if (from > tip) return;
      const slots = await rpc("getBlocks", [from, tip, { commitment: "confirmed" }]);
      for (const slot of slots) {
        const b = await rpc("getBlock", [slot, { encoding: "json", transactionDetails: "accounts", maxSupportedTransactionVersion: 0, rewards: false, commitment: "confirmed" }]).catch(() => null);
        for (const t of b?.transactions ?? []) {
          if (t.transaction.accountKeys.some((k) => (k.pubkey ?? k) === "Vote111111111111111111111111111111111111111")) continue;
          feed.unshift({ signature: t.transaction.signatures[0], err: t.meta?.err, slot, blockTime: b.blockTime });
        }
      }
      lastSeen = tip;
      feed.length = Math.min(feed.length, 30);
      paintFeed();
    }, () => shown);

    function paintWhere() { where.textContent = state.cluster.name ? `on ${state.cluster.name}` : ""; }
    on("state", () => { paintWhere(); if (mode === "recent" && shown) { feed.length = 0; lastSeen = 0; recent(); } });
    paintWhere();

    return {
      show(arg) {
        shown = true;
        if (arg?.query) look(arg.query);
        else if (mode === "recent") recent();
      },
      hide() { shown = false; },
    };
  },
};
