// One terminal on the page: an xterm.js screen wired to a terminal on the server.
// Used by the Terminal view and by every panel that shows a running command.

import { Terminal } from "./vendor/xterm/xterm.mjs";
import { FitAddon } from "./vendor/xterm/addon-fit.mjs";
import { WebglAddon } from "./vendor/xterm/addon-webgl.mjs";
import { WebLinksAddon } from "./vendor/xterm/addon-web-links.mjs";
import { call, on, termSink, termInput, copyText, session } from "./core.js";

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function termTheme() {
  return {
    background: css("--term-bg"), foreground: css("--term-fg"), cursor: css("--accent"), cursorAccent: css("--term-bg"),
    selectionBackground: css("--term-select"),
    black: css("--t-black"), red: css("--t-red"), green: css("--t-green"), yellow: css("--t-yellow"),
    blue: css("--t-blue"), magenta: css("--t-magenta"), cyan: css("--t-cyan"), white: css("--t-white"),
    brightBlack: css("--t-bblack"), brightRed: css("--t-bred"), brightGreen: css("--t-bgreen"), brightYellow: css("--t-byellow"),
    brightBlue: css("--t-bblue"), brightMagenta: css("--t-bmagenta"), brightCyan: css("--t-bcyan"), brightWhite: css("--t-bwhite"),
  };
}

/**
 * Shows the server's terminal `id` inside `parent`.
 * Returns { term, fit(), focus(), dispose() }.
 */
export function termView(parent, id, { readOnly = false, fontSize = 13.5 } = {}) {
  const term = new Terminal({
    fontFamily: 'ui-monospace, "SF Mono", "JetBrains Mono", "Cascadia Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace',
    fontSize, lineHeight: 1.22, letterSpacing: 0, cursorBlink: !readOnly, cursorStyle: "bar", cursorWidth: 2,
    scrollback: 20000, allowProposedApi: true, macOptionIsMeta: true, disableStdin: readOnly,
    theme: termTheme(), drawBoldTextInBrightColors: false, minimumContrastRatio: 1,
  });
  const fitter = new FitAddon();
  term.loadAddon(fitter);
  term.loadAddon(new WebLinksAddon((e, uri) => window.open(uri, "_blank", "noopener")));
  term.open(parent);
  // Drawing with the graphics card keeps scrolling smooth; without it xterm draws to the page itself.
  try {
    const gl = new WebglAddon();
    gl.onContextLoss(() => gl.dispose());
    term.loadAddon(gl);
  } catch { /* no WebGL here */ }

  let lastCols = 0, lastRows = 0;
  function fit() {
    if (!parent.isConnected || parent.offsetParent === null || parent.clientWidth < 20) return;
    try { fitter.fit(); } catch { return; }
    if (term.cols !== lastCols || term.rows !== lastRows) {
      lastCols = term.cols; lastRows = term.rows;
      if (session.connected) call("term.resize", { id, cols: term.cols, rows: term.rows }).catch(() => {});
    }
  }
  let pending = 0;
  const watcher = new ResizeObserver(() => { cancelAnimationFrame(pending); pending = requestAnimationFrame(fit); });
  watcher.observe(parent);

  termSink(id, (bytes) => term.write(bytes));
  const attach = () => call("term.attach", { id }).then(() => { lastCols = 0; fit(); }).catch(() => {});
  attach();
  // After a lost connection the server sends again what the terminal printed: start from a clean screen.
  const offConnected = on("connected", () => { term.reset(); attach(); });
  const offTheme = () => { term.options.theme = termTheme(); };
  window.addEventListener("themechange", offTheme);

  if (!readOnly) {
    term.onData((d) => termInput(id, d));
    term.onBinary((d) => termInput(id, Uint8Array.from(d, (c) => c.charCodeAt(0))));
  }
  term.attachCustomKeyEventHandler((e) => {
    if (e.type !== "keydown") return true;
    const mod = e.ctrlKey || e.metaKey;
    // Ctrl+Shift+C copies, Ctrl+C with a selection copies too (and without one interrupts, as always).
    if (mod && (e.key === "C" || (e.key === "c" && term.hasSelection() && !e.shiftKey && e.metaKey))) { copyText(term.getSelection()); return false; }
    if (mod && e.shiftKey && e.key === "V") { navigator.clipboard?.readText().then((t) => t && term.paste(t)).catch(() => {}); return false; }
    // Keys that belong to the desk, not to the program in the terminal.
    if (mod && e.key === "`") return false;
    if (e.altKey && e.key === "`") return false;
    return true;
  });

  return {
    term, fit,
    focus: () => term.focus(),
    dispose() {
      watcher.disconnect();
      offConnected();
      window.removeEventListener("themechange", offTheme);
      termSink(id, null);
      if (session.connected) call("term.detach", { id }).catch(() => {});
      term.dispose();
    },
  };
}

/**
 * Runs a command on the system and shows what it prints in `parent`.
 * Returns { id, done: Promise<exit code>, close() }.
 */
export async function runJob(parent, argv, { cwd, title } = {}) {
  const info = await call("term.open", { argv, cwd, title, cols: 100, rows: 24 });
  const view = termView(parent, info.id, { readOnly: true, fontSize: 12.5 });
  let off = () => {};
  const done = new Promise((resolve) => {
    off = on("term.exit", (e) => { if (e.id === info.id) { off(); resolve(e.code); } });
    if (info.exited !== null) resolve(info.exited);
  });
  return {
    id: info.id, done, view,
    close() { off(); view.dispose(); call("term.close", { id: info.id }).catch(() => {}); },
  };
}
