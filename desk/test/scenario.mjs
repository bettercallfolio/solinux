// A whole working session on the desktop, in a headless browser: pick the local cluster,
// make a key, start the validator, airdrop, send, look the transaction up, edit a file,
// reload the page and find the terminal again, switch the theme. A picture is saved after
// every step, and the run fails loudly when something on the page is not as expected.
//
//   PLAYWRIGHT=/path/to/node_modules/playwright/index.mjs node test/scenario.mjs [out-dir] [base]
//
// It needs the Solana tools on the server's PATH and a desk server that is already running.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const { chromium } = await import(process.env.PLAYWRIGHT ?? "playwright");
const out = process.argv[2] ?? "scenario";
const base = process.argv[3] ?? "http://127.0.0.1:7654";
const token = process.argv[4] ?? fs.readFileSync(path.join(os.homedir(), ".config/solinux/desk-token"), "utf8").trim();
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 960 }, colorScheme: "dark" });
const page = await ctx.newPage();
const problems = [];
page.on("response", (r) => { if (r.status() >= 400) problems.push(`HTTP ${r.status()} ${r.url().replace(/[?&]t=[0-9a-f]+/, "")}`); });
page.on("console", (m) => { if (m.type() === "error") problems.push(`console: ${m.text()}`); });
page.on("pageerror", (e) => problems.push(`error: ${e.message}`));
let n = 0;
const shot = async (name) => { await page.screenshot({ path: path.join(out, `${String(++n).padStart(2, "0")}-${name}.png`) }); };
const step = async (name, fn) => {
  try { await fn(); await shot(name); console.log(`ok   ${name}`); }
  catch (e) {
    await shot(`FAILED-${name}`); console.log(`FAIL ${name}: ${e.message.split("\n")[0]}`); problems.push(`step ${name}: ${e.message.split("\n")[0]}`);
    await page.keyboard.press("Escape").catch(() => {});
  }
};
/** Brings one of the desktop's applications to the front (a click on the dock would hide it if it already is). */
const open = async (key) => {
  if (!(await page.locator(`.dock-btn[data-key=${key}].active`).count())) await page.click(`.dock-btn[data-key=${key}]`);
  await page.waitForSelector(`.win.focused .view-${key}`);
};

await page.goto(`${base}/#token=${token}`);
await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith("desk.win.") || k === "desk.session") localStorage.removeItem(k); });
await page.reload();
await page.waitForSelector(".win");

await step("cluster-localnet", async () => {
  await page.click("#cluster");
  await page.click(".menu button:has-text('localnet')");
  await page.waitForFunction(() => document.querySelector("#cluster").innerText.includes("localnet"));
});

await step("make-key", async () => {
  await open("wallets");
  await page.waitForTimeout(500);
  if (!(await page.locator(".key-card").count())) {
    await page.click(".view-wallets button:has-text('New key')");
    await page.fill(".dialog input[name=name]", "id");
    await page.click(".dialog button[type=submit]");
  }
  await page.waitForSelector(".key-card");
});

await step("start-validator", async () => {
  await open("validator");
  await page.waitForSelector(".val-head .btn");
  if (await page.locator(".val-head button:has-text('Stop')").count() === 0) await page.click(".val-head button.primary:has-text('Start')");
  await page.waitForSelector(".val-head .status.good", { timeout: 20000 });
  await page.waitForSelector(".stat-row .stat", { timeout: 60000 });
});

await step("validator-logs", async () => {
  await page.waitForTimeout(3000);
  await page.click(".card-logs .seg button:has-text('Start')");
  await page.waitForSelector(".log-stage .plain-log");
});

await step("airdrop", async () => {
  await open("wallets");
  await page.waitForSelector(".key-card button:has-text('Airdrop'):not([disabled])", { timeout: 20000 });
  const before = await page.locator(".key-card .balance b").first().innerText();
  await page.click(".key-card button:has-text('Airdrop')");
  await page.fill(".dialog input[name=amount]", "5");
  await page.click(".dialog button[type=submit]");
  await page.waitForFunction((b) => { const t = document.querySelector(".key-card .balance b")?.innerText ?? ""; return /^[0-9]/.test(t) && t !== b; }, before, { timeout: 30000 });
});

await step("send", async () => {
  await page.click(".key-card button:has-text('Send')");
  await page.fill(".dialog input[name=to]", "4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T");
  await page.fill(".dialog input[name=amount]", "0.25");
  await page.click(".dialog button[type=submit]");
  await page.waitForFunction(() => document.querySelector(".dialog.wide .dialog-buttons span")?.innerText === "finished", null, { timeout: 40000 });
});
await page.click(".dialog.wide button:has-text('Close')").catch(() => {});

await step("explorer-feed", async () => {
  await open("explorer");
  await page.waitForSelector("#feed table tr.click", { timeout: 20000 });
});
await step("explorer-transaction", async () => {
  await page.click("#feed table tr.click >> nth=0");
  await page.waitForSelector(".explorer-out .card h2:has-text('Transaction')", { timeout: 15000 });
  await page.waitForSelector(".ix");
});
await step("explorer-account", async () => {
  await page.click(".explorer-out .facts .addr .link >> nth=0");
  await page.waitForSelector(".explorer-out .card h2:has-text('Wallet')", { timeout: 15000 });
});

await step("system", async () => {
  await open("home");
  await page.waitForTimeout(4000);
  const key = await page.locator(".key-body .balance b").first().innerText();
  if (!/^[0-9]/.test(key)) throw new Error(`System shows the balance "${key}"`);
});

// What is on the system's disk is asked of the desktop itself, so that the test also runs
// against a desktop on another system (a machine, a virtual machine).
const desk = (method, params) => page.evaluate(async ([m, p]) => (await import("/core.js")).call(m, p), [method, params]);
const scenarioFile = async () => `${(await desk("fs.list", { path: "~" })).path}/desk-scenario.rs`;

await step("files-editor", async () => {
  await desk("fs.remove", { path: await scenarioFile() }).catch(() => {});   // left by a run that did not finish
  await open("files");
  await page.waitForSelector(".files-table tbody tr");
  await page.click(".view-files button:has-text('New file')");
  await page.fill(".dialog input[name=name]", "desk-scenario.rs");
  await page.click(".dialog button[type=submit]");
  await page.waitForSelector(".editor textarea");
  await page.fill(".editor textarea", "fn main() {\n    println!(\"gm from Solinux\");\n}\n");
  await page.keyboard.press("Control+s");
  await page.waitForFunction(() => document.querySelector(".editor-head .btn.primary").disabled, null, { timeout: 5000 });
  const saved = await desk("fs.read", { path: await scenarioFile() });
  if (!String(saved.text ?? saved).includes("gm from Solinux")) throw new Error("the file on disk does not have what was typed");
});
await step("files-delete", async () => {
  await page.click(".editor-head .tool[title=Close]");
  await page.click("tr[data-name='desk-scenario.rs']", { button: "right" });
  await page.click(".menu button:has-text('Delete')");
  await page.click(".dialog button.danger");
  await page.waitForFunction(() => !document.querySelector("tr[data-name='desk-scenario.rs']"));
  if (await desk("fs.read", { path: await scenarioFile() }).then(() => true, () => false)) throw new Error("the file is still on disk");
});

await step("terminal-reload", async () => {
  await open("terminal");
  await page.waitForSelector(".term-pane .xterm");
  await page.waitForTimeout(700);
  const tabsBefore = await page.locator(".tab").count();
  await page.keyboard.type("echo survives-$((40+2))\n");
  await page.waitForTimeout(600);
  await page.reload();
  await page.waitForSelector(".term-pane .xterm", { timeout: 10000 });
  await page.waitForTimeout(1200);
  const tabs = await page.locator(".tab").count();
  if (tabs !== tabsBefore) throw new Error(`the page had ${tabsBefore} terminal tab(s) before the reload and has ${tabs} after`);
  const wins = await page.locator(".win").count();
  if (wins < 5) throw new Error(`only ${wins} windows came back after the reload`);
});

await step("window-snap-and-maximize", async () => {
  const bar = await page.locator(".win.focused .win-bar").boundingBox();
  await page.mouse.move(bar.x + 150, bar.y + 12); await page.mouse.down();
  await page.mouse.move(bar.x + 200, bar.y + 80, { steps: 4 }); await page.mouse.move(64, 400, { steps: 10 });
  await page.mouse.up(); await page.waitForTimeout(350);
  if (await page.locator(".win.focused").getAttribute("data-state") !== "left") throw new Error("dragging to the left edge did not snap the window");
  await page.dblclick(".win.focused .win-title"); await page.waitForTimeout(350);
  if (await page.locator(".win.focused").getAttribute("data-state") !== "max") throw new Error("a double click on the title did not maximize the window");
  await page.dblclick(".win.focused .win-title"); await page.waitForTimeout(250);
});

// A program from nothing to the local cluster: only where the tools that build programs are installed.
const tools = await desk("sol.tools", {});
if (tools.some((t) => t.name === "cargo" && t.version)) {
  const projectDir = `${(await desk("fs.list", { path: "~" })).path}/projects/gm-scenario`;
  await step("program-create", async () => {
    await desk("fs.remove", { path: projectDir }).catch(() => {});   // left by a run that did not finish
    await open("programs");
    await page.click(".proj-side-head .tool[title='New project']");
    await page.fill(".dialog input[name=name]", "gm-scenario");
    await page.selectOption(".dialog select[name=kind]", "rust");
    await page.click(".dialog button[type=submit]");
    await page.waitForSelector(".proj-head h2:has-text('gm-scenario')");
  });
  await step("program-build", async () => {
    await page.click(".proj-head button:has-text('Build')");
    // (the first build on a system also fetches Solana's platform tools)
    await page.waitForFunction(() => /finished|ended/.test(document.querySelector(".proj-job header span")?.textContent ?? ""), null, { timeout: 600000 });
    const status = await page.locator(".proj-job header span").innerText();
    if (!/finished/.test(status)) throw new Error(`the build ${status}`);
    await page.waitForSelector(".view-programs table tbody tr");
  });
  await step("program-deploy", async () => {
    await page.click(".proj-head button:has-text('Deploy')");
    await page.waitForFunction(() => /finished|ended/.test(document.querySelector(".proj-job header span")?.textContent ?? ""), null, { timeout: 180000 });
    const status = await page.locator(".proj-job header span").innerText();
    if (!/finished/.test(status)) throw new Error(`the deploy ${status}`);
    await page.waitForSelector(".view-programs table .tag.good:has-text('deployed')", { timeout: 30000 });
  });
  await desk("fs.remove", { path: projectDir }).catch(() => {});
}

await step("settings-light", async () => {
  await open("settings");
  await page.click(".view-settings .seg button:has-text('Light')");
  await page.waitForTimeout(500);
});
await page.click(".view-settings .seg button:has-text('Automatic')");

await browser.close();
console.log(problems.length ? `\n${problems.length} problem(s):\n${problems.join("\n")}` : "\nno problems");
process.exit(problems.length ? 1 : 0);
