// Home: the system and its Solana tools at a glance.

import { el, icon, on, call, subscribe, bytes, duration, num, sol, short, copyable, every, session, fill } from "../core.js";
import { state, defaultKey, canAirdrop, isLocal } from "../state.js";
import { askAirdrop, startValidator, stopValidator } from "../actions.js";

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** A small line of the last minute, drawn on a canvas. */
function sparkline(canvas, values, max = 1) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
  const g = canvas.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  if (values.length < 2) return;
  const n = 60, step = w / (n - 1), pad = 2;
  const y = (v) => h - pad - Math.min(1, v / max) * (h - 2 * pad);
  const x0 = w - (values.length - 1) * step;
  g.beginPath();
  values.forEach((v, i) => { const x = x0 + i * step; if (i) g.lineTo(x, y(v)); else g.moveTo(x, y(v)); });
  g.strokeStyle = css("--accent"); g.lineWidth = 1.6; g.lineJoin = "round"; g.stroke();
  g.lineTo(w, h); g.lineTo(x0, h); g.closePath();
  const fill = g.createLinearGradient(0, 0, 0, h);
  fill.addColorStop(0, css("--accent-soft")); fill.addColorStop(1, "transparent");
  g.fillStyle = fill; g.fill();
}

function meter(label, iconName) {
  const value = el("b", { class: "mono" });
  const note = el("span", { class: "dim" });
  const bar = el("i");
  const node = el("div", { class: "meter" }, el("div", { class: "meter-head" }, icon(iconName, 15), el("span", { text: label }), value), el("div", { class: "meter-bar" }, bar), note);
  return { node, set(fraction, text, sub) { bar.style.width = `${Math.max(0, Math.min(1, fraction)) * 100}%`; bar.classList.toggle("high", fraction > 0.9); value.textContent = text; note.textContent = sub ?? ""; } };
}

export default {
  id: "home", title: "Home", icon: "home",
  create(root, { go }) {
    // ---- system
    const sysTitle = el("h2");
    const sysFacts = el("div", { class: "sys-facts dim" });
    const cpuValue = el("b", { class: "mono big" });
    const cpuCanvas = el("canvas", { class: "spark" });
    const loadNote = el("span", { class: "dim" });
    const mem = meter("Memory", "memory"), disk = meter("Disk", "disk");
    const netNote = el("div", { class: "net mono dim" });
    const system = el("section", { class: "card card-system" },
      el("header", null, sysTitle, sysFacts),
      el("div", { class: "cpu" }, el("div", { class: "cpu-head" }, icon("cpu", 15), el("span", { text: "Processor" }), cpuValue, loadNote), cpuCanvas),
      el("div", { class: "meters" }, mem.node, disk.node),
      netNote);

    // ---- solana tools
    const toolList = el("div", { class: "tools" });
    const tools = el("section", { class: "card" }, el("header", null, el("h2", { text: "Solana tools" })), toolList);

    // ---- local validator
    const valState = el("div", { class: "val-state" });
    const valButtons = el("div", { class: "row" });
    const validator = el("section", { class: "card" }, el("header", null, el("h2", { text: "Local validator" }),
      el("button", { class: "link", onclick: () => go("validator") }, "Open", icon("chevron", 13))), valState, valButtons);

    // ---- key
    const keyBody = el("div", { class: "key-body" });
    const wallet = el("section", { class: "card" }, el("header", null, el("h2", { text: "Key" }),
      el("button", { class: "link", onclick: () => go("wallets") }, "All keys", icon("chevron", 13))), keyBody);

    // ---- start here
    const quick = el("section", { class: "card" }, el("header", null, el("h2", { text: "Start here" })),
      el("div", { class: "quick" },
        el("button", { onclick: () => go("terminal", { fresh: true }) }, icon("terminal", 20), el("b", { text: "Terminal" }), el("span", { text: "A shell on this system" })),
        el("button", { onclick: () => go("files") }, icon("files", 20), el("b", { text: "Files" }), el("span", { text: "Browse and edit" })),
        el("button", { onclick: () => go("explorer") }, icon("explorer", 20), el("b", { text: "Explorer" }), el("span", { text: "Accounts and transactions" })),
        el("button", { onclick: () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true })) }, icon("command", 20), el("b", { text: "Commands" }), el("span", { text: "Ctrl+K finds anything" }))));

    // ---- processes
    const procBody = el("tbody");
    const procs = el("section", { class: "card card-procs" }, el("header", null, el("h2", { text: "Busiest programs" })),
      el("table", { class: "table compact" }, el("thead", null, el("tr", null, el("th", { text: "Program" }), el("th", { class: "r", text: "CPU" }), el("th", { class: "r", text: "Memory" }))), procBody));

    root.append(el("div", { class: "home-grid" }, system, validator, wallet, tools, quick, procs));

    // ---- painting
    const history = [];
    function paintSys(s) {
      history.push(s.cpu); if (history.length > 60) history.shift();
      cpuValue.textContent = `${Math.round(s.cpu * 100)}%`;
      loadNote.textContent = `load ${s.load.map((l) => l.toFixed(2)).join("  ")}`;
      sparkline(cpuCanvas, history);
      mem.set(s.mem.used / s.mem.total, bytes(s.mem.used), `of ${bytes(s.mem.total)}`);
      disk.set(s.disk.used / s.disk.total, bytes(s.disk.used), `of ${bytes(s.disk.total)}`);
      fill(netNote, icon("net", 14), `↓ ${bytes(s.net.rx)}/s   ↑ ${bytes(s.net.tx)}/s`, el("span", { class: "sp" }), `up ${duration(s.uptime)}`);
    }
    function paintInfo() {
      const sys = session.hello?.sys;
      if (!sys) return;
      sysTitle.textContent = `${sys.name}${sys.version ? " " + sys.version : ""}`;
      fill(sysFacts, 
        el("span", { text: `Linux ${sys.kernel}` }), el("span", { text: `${sys.cores} × ${sys.cpu}` }),
        el("span", { text: sys.booted ? "booted system" : "runs on the host's kernel" }));
    }
    function paintTools() {
      fill(toolList, ...state.tools.map((t) => el("div", { class: `tool-row ${t.version ? "" : "missing"}`, title: t.path ?? "not installed" },
        el("i", { class: "dot" }), el("span", { text: t.name }), el("span", { class: "mono dim", text: t.version ?? "not installed" }))));
    }
    function paintValidator() {
      const v = state.validator;
      if (!v) return;
      if (!v.installed) {
        fill(valState, el("p", { class: "dim", text: "solana-test-validator is not installed on this system." }));
        fill(valButtons, );
        return;
      }
      const up = v.running && isLocal() && state.cluster.ok;
      fill(valState, 
        el("div", { class: `status ${v.running ? "good" : ""}` }, el("i", { class: "dot" }), el("b", { text: v.running ? "Running" : "Stopped" }),
          v.running && el("span", { class: "dim", text: `for ${duration((Date.now() - v.started) / 1000)}` })),
        v.running && el("div", { class: "dim mono small", text: `http://127.0.0.1:${v.port}` }),
        up && el("div", { class: "dim small", text: `slot ${num(state.cluster.slot)} · Agave ${state.cluster.version ?? ""}` }),
        v.running && !isLocal() && el("div", { class: "dim small", text: `The system is set to ${state.cluster.name}, not to this validator.` }));
      fill(valButtons, v.running
        ? el("button", { class: "btn", onclick: stopValidator }, icon("stop", 14), "Stop")
        : el("button", { class: "btn primary", onclick: () => startValidator() }, icon("play", 14), "Start"));
    }
    function paintKey() {
      const k = defaultKey();
      if (!k) {
        fill(keyBody, el("p", { class: "dim", text: "This system has no key yet. A key is an address on Solana and the right to sign for it." }),
          el("button", { class: "btn primary", onclick: () => go("wallets", { create: true }) }, icon("plus", 14), "Make a key"));
        return;
      }
      fill(keyBody, 
        el("div", { class: "balance" }, el("b", { class: "mono", text: state.cluster.ok && state.balance !== null ? sol(state.balance) : "-" }), el("span", { text: "SOL" }),
          el("span", { class: "dim small", text: `on ${state.cluster.name}` })),
        el("div", { class: "row" }, el("span", { class: "dim", text: k.name }), copyable(k.address, short(k.address, 6))),
        el("div", { class: "row" },
          canAirdrop() && el("button", { class: "btn", disabled: !state.cluster.ok, onclick: () => askAirdrop(k.address) }, icon("drop", 14), "Airdrop"),
          el("button", { class: "btn", onclick: () => go("explorer", { query: k.address }) }, icon("explorer", 14), "Look up")));
    }

    on("sys", paintSys);
    on("connected", () => { paintInfo(); paintTools(); });
    on("state", () => { paintTools(); paintValidator(); paintKey(); });
    on("pulse", () => { paintValidator(); paintKey(); });
    window.addEventListener("themechange", () => sparkline(cpuCanvas, history));
    paintInfo(); paintTools(); paintValidator(); paintKey();

    let shown = false;
    every(3000, async () => {
      const list = await call("sys.processes");
      fill(procBody, ...list.slice(0, 7).map((p) => el("tr", { title: p.cmd },
        el("td", null, el("span", { class: "mono", text: p.name })),
        el("td", { class: "r mono", text: `${(p.cpu * 100).toFixed(p.cpu >= 0.1 ? 0 : 1)}%` }),
        el("td", { class: "r mono dim", text: bytes(p.mem) }))));
    }, () => shown);

    return {
      show() { shown = true; subscribe("sys"); },
      hide() { shown = false; },
    };
  },
};
