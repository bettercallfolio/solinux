// The local test validator: a whole Solana cluster on this system, for trying things.

import { el, icon, call, on, rpc, dialog, attempt, duration, num, sol, copyable, facts, emptyState, every, confirmDialog, toast, fill } from "../core.js";
import { state, setCluster, isLocal } from "../state.js";
import { startValidator, stopValidator } from "../actions.js";
import { runJob } from "../termview.js";

export default {
  id: "validator", title: "Local validator", short: "Validator", icon: "validator",
  create(root, { go }) {
    const head = el("div", { class: "val-head" });
    const numbers = el("div", { class: "stat-row" });
    const details = el("div", { class: "card" });
    const logTabs = el("div", { class: "seg" });
    const logStage = el("div", { class: "log-stage" });
    const logsCard = el("section", { class: "card card-logs" }, el("header", null, el("h2", { text: "Logs" }), logTabs), logStage);
    root.append(el("div", { class: "page" }, head, numbers, el("div", { class: "val-grid" }, details, logsCard)));

    let shown = false;
    let live = null;          // numbers read from the validator itself
    let job = null;           // the command whose output the log panel shows
    let logKind = "programs";

    const stat = (label, value, sub) => el("div", { class: "stat" }, el("span", { class: "dim", text: label }), el("b", { class: "mono", text: value }), sub && el("small", { class: "dim", text: sub }));

    function paint() {
      const v = state.validator;
      if (!v) return;
      if (!v.installed) {
        fill(head, emptyState("validator", "The Solana tools are not installed here",
          "The local validator comes with them (solana-test-validator). On Solinux they are part of the system; on another system, install the Solana command-line tools and reload."));
        fill(numbers, ); details.hidden = true; logsCard.hidden = true;
        return;
      }
      details.hidden = false; logsCard.hidden = false;
      const url = `http://127.0.0.1:${v.port}`;
      fill(head, 
        el("div", { class: `status big ${v.running ? "good" : ""}` }, el("i", { class: "dot" }),
          el("div", null, el("b", { text: v.running ? "Running" : "Stopped" }),
            el("span", { class: "dim", text: v.running ? `for ${duration((Date.now() - v.started) / 1000)}, process ${v.pid}` : v.ledgerExists ? "Its ledger is kept; starting continues from it." : "Nothing has been run yet." }))),
        el("div", { class: "row" },
          v.running
            ? [el("button", { class: "btn", onclick: stopValidator }, icon("stop", 14), "Stop"),
              el("button", { class: "btn", onclick: restartFresh }, icon("refresh", 14), "Start over")]
            : [el("button", { class: "btn primary", onclick: () => startValidator() }, icon("play", 14), "Start"),
              el("button", { class: "btn", onclick: startWith }, icon("settings", 14), "Start with…")],
          v.running && !isLocal() && el("button", { class: "btn primary", onclick: () => attempt(() => setCluster(url), "The system now talks to the local validator") }, icon("net", 14), "Use it for this system")));

      const s = live;
      fill(numbers, ...(v.running && s ? [
        stat("Slot", num(s.slot), `epoch ${s.epoch}`),
        stat("Transactions", num(s.txCount), s.tps !== null ? `${s.tps.toFixed(1)} a second` : null),
        stat("Block height", num(s.height)),
        stat("Version", s.version ?? "-", "Agave"),
      ] : []));

      fill(details, el("header", null, el("h2", { text: "Details" })), facts([
        ["RPC address", copyable(url)],
        ["WebSocket", copyable(`ws://127.0.0.1:${v.port + 1}`)],
        ["Ledger", el("button", { class: "link mono", onclick: () => go("files", { path: v.ledger }) }, v.ledger)],
        v.running && s?.identity && ["Identity", copyable(s.identity)],
        v.running && s?.identityBalance !== undefined && ["Identity holds", `${sol(s.identityBalance, 0)} SOL`],
        v.args.length && ["Started as", el("code", { class: "wrap", text: `solana-test-validator ${v.args.join(" ")}` })],
      ]),
        !v.running && el("p", { class: "dim small", text: "A local validator is a complete Solana cluster with one node. Transactions are free, the faucet never runs dry, and nothing leaves this computer." }));
    }

    async function startWith() {
      const v = await dialog({
        title: "Start the local validator",
        fields: [
          { name: "reset", type: "checkbox", label: "Start from an empty ledger", value: !state.validator.ledgerExists },
          { name: "cloneFrom", type: "select", label: "Copy accounts and programs from", value: "mainnet", options: [{ value: "mainnet", label: "mainnet" }, { value: "devnet", label: "devnet" }, { value: "testnet", label: "testnet" }] },
          { name: "clone", type: "textarea", label: "Addresses to copy", rows: 3, placeholder: "one address per line", hint: "Programs and accounts you want to have locally, as they are on that cluster right now. Copying needs an empty ledger." },
          { name: "port", label: "RPC port", value: String(state.validator.port || 8899), type: "number" },
        ],
        ok: "Start",
      });
      if (!v) return;
      const clone = v.clone.split(/\s+/).filter(Boolean);
      startValidator({ reset: v.reset || clone.length > 0, clone, cloneFrom: v.cloneFrom, port: Number(v.port) });
    }
    async function restartFresh() {
      if (!(await confirmDialog("Start over", "Stop the validator and start it again from an empty ledger? Every account and program on it is lost.", "Start over", true))) return;
      if (await stopValidator()) startValidator({ reset: true });
    }

    // ---- logs: a command on the system whose output is shown here
    const KINDS = {
      programs: { label: "Programs", hint: "What programs print while transactions run (solana logs).", argv: () => ["solana", "logs", "--url", `http://127.0.0.1:${state.validator.port}`] },
      validator: { label: "Validator", hint: "The validator's own log.", argv: () => ["tail", "-n", "200", "-F", `${state.validator.ledger}/validator.log`] },
      start: { label: "Start", hint: "What the validator said when it started." },
    };
    function paintLogTabs() {
      fill(logTabs, ...Object.entries(KINDS).map(([k, d]) => el("button", { class: k === logKind ? "on" : "", title: d.hint, onclick: () => { logKind = k; showLogs(); } }, d.label)));
    }
    async function showLogs() {
      paintLogTabs();
      job?.close(); job = null;
      const v = state.validator;
      if (!shown || !v?.installed) return;
      if (logKind === "start") {
        const text = await call("val.output").catch(() => "");
        fill(logStage, el("pre", { class: "plain-log", text: text.trim() || "Nothing yet." }));
        return;
      }
      if (!v.running) { fill(logStage, el("div", { class: "log-none dim", text: "Start the validator to see its logs." })); return; }
      const pane = el("div", { class: "log-term" });
      fill(logStage, pane);
      const kind = logKind;
      job = await runJob(pane, KINDS[kind].argv(), { title: `logs: ${kind}` }).catch((e) => { toast(e.message, "bad"); return null; });
    }

    every(1500, async () => {
      const v = state.validator;
      if (!v?.running) { if (live) { live = null; paint(); } return; }
      const c = "local";
      try {
        const [epoch, txCount, version, identity, perf] = await Promise.all([
          rpc("getEpochInfo", [{ commitment: "confirmed" }], c), rpc("getTransactionCount", [{ commitment: "confirmed" }], c),
          rpc("getVersion", [], c), rpc("getIdentity", [], c), rpc("getRecentPerformanceSamples", [1], c).catch(() => []),
        ]);
        const identityBalance = (await rpc("getBalance", [identity.identity], c)).value;
        const p = perf[0];
        live = {
          slot: epoch.absoluteSlot, epoch: epoch.epoch, height: epoch.blockHeight, txCount,
          version: version["solana-core"], identity: identity.identity, identityBalance,
          tps: p && p.samplePeriodSecs ? p.numTransactions / p.samplePeriodSecs : null,
        };
      } catch { live = null; }
      paint();
    }, () => shown);

    let wasRunning = null;
    on("state", () => {
      paint();
      const running = !!state.validator?.running;
      if (wasRunning !== running) { wasRunning = running; if (shown) setTimeout(showLogs, running ? 1500 : 0); }
    });
    paint(); paintLogTabs();

    return {
      show() { shown = true; paint(); showLogs(); },
      hide() { shown = false; job?.close(); job = null; },
    };
  },
};
