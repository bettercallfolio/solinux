// Talks to a running desk server the way the page does and checks the answers.
//   node test/smoke.mjs [http://127.0.0.1:7654] [token]
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const base = process.argv[2] ?? "http://127.0.0.1:7654";
const token = process.argv[3] ?? fs.readFileSync(path.join(os.homedir(), ".config/solinux/desk-token"), "utf8").trim();

const ws = new WebSocket(base.replace(/^http/, "ws") + "/ws?t=" + token);
ws.binaryType = "arraybuffer";
const waiting = new Map();
const events = [];
const output = new Map();
let nextId = 1;
ws.onmessage = (m) => {
  if (typeof m.data !== "string") {
    const b = Buffer.from(m.data);
    const id = b.readUInt32LE(0);
    output.set(id, (output.get(id) ?? "") + b.subarray(4).toString("utf8"));
    return;
  }
  const msg = JSON.parse(m.data);
  if (msg.ev) { events.push(msg); return; }
  const w = waiting.get(msg.id);
  waiting.delete(msg.id);
  if (msg.e !== undefined) w.reject(new Error(msg.e)); else w.resolve(msg.r);
};
const call = (m, p = {}) => new Promise((resolve, reject) => { const id = nextId++; waiting.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, m, p })); });
const type = (id, text) => { const t = Buffer.from(text); const b = Buffer.alloc(4 + t.length); b.writeUInt32LE(id, 0); t.copy(b, 4); ws.send(b); };
const until = async (what, test, ms = 8000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (test()) return; await new Promise((r) => setTimeout(r, 30)); }
  throw new Error("timed out waiting for " + what);
};

await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = () => reject(new Error("cannot connect to " + base)); });

const hello = await call("hello");
assert.equal(typeof hello.version, "string");
assert.ok(hello.sys.cores > 0 && hello.sys.memory > 0);
console.log("hello:", hello.sys.name, hello.sys.kernel, `${hello.sys.cores} cores`);

await call("sub", { topic: "sys" });
await until("system numbers", () => events.some((e) => e.ev === "sys"), 4000);
const stats = events.find((e) => e.ev === "sys").d;
assert.ok(stats.mem.total > 0 && stats.disk.total > 0 && stats.cpu >= 0 && stats.cpu <= 1);
await call("unsub", { topic: "sys" });
console.log("sys: cpu", (stats.cpu * 100).toFixed(1) + "%", "mem", Math.round(stats.mem.used / 2 ** 20), "MiB");

const t = await call("term.open", { cols: 90, rows: 20 });
await call("term.attach", { id: t.id });
type(t.id, "echo desk-$((6*7)); stty size\n");
await until("the shell's answer", () => /desk-42/.test(output.get(t.id) ?? "") && /20 90/.test(output.get(t.id) ?? ""));
await call("term.resize", { id: t.id, cols: 120, rows: 33 });
type(t.id, "stty size\n");
await until("the new size", () => /33 120/.test(output.get(t.id) ?? ""));
// a second look at the same terminal gets what was printed before
output.delete(t.id);
await call("term.detach", { id: t.id });
await call("term.attach", { id: t.id });
await until("the kept output", () => /desk-42/.test(output.get(t.id) ?? ""));
type(t.id, "exit 7\n");
await until("the exit event", () => events.some((e) => e.ev === "term.exit" && e.d.id === t.id && e.d.code === 7));
console.log("terminal: typed, resized, re-attached, exit code 7");

const job = await call("term.open", { argv: ["sh", "-c", "printf 'job says hi\\n'; exit 3"] });
await call("term.attach", { id: job.id });
await until("the job's end", () => events.some((e) => e.ev === "term.exit" && e.d.id === job.id && e.d.code === 3));
await until("the job's output", () => /job says hi/.test(output.get(job.id) ?? ""));
await call("term.close", { id: job.id });
console.log("job: output and exit code 3");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "desk-smoke-"));
await call("fs.mkdir", { path: path.join(dir, "a") });
const w = await call("fs.write", { path: path.join(dir, "a", "note.txt"), text: "hello\n" });
assert.equal((await call("fs.read", { path: w.path })).text, "hello\n");
await assert.rejects(call("fs.write", { path: w.path, text: "x", mtime: 1 }), /changed on disk/);
await call("fs.move", { from: w.path, to: path.join(dir, "a", "moved.txt") });
const listing = await call("fs.list", { path: path.join(dir, "a") });
assert.deepEqual(listing.entries.map((e) => e.name), ["moved.txt"]);
const up = await fetch(`${base}/api/file?path=${encodeURIComponent(path.join(dir, "up.bin"))}`, { method: "PUT", headers: { "x-desk-token": token }, body: Buffer.from([0, 1, 2, 3]) });
assert.equal(up.status, 200);
const down = await fetch(`${base}/api/file?path=${encodeURIComponent(path.join(dir, "up.bin"))}&t=${token}`);
assert.deepEqual([...new Uint8Array(await down.arrayBuffer())], [0, 1, 2, 3]);
assert.equal((await call("fs.read", { path: path.join(dir, "up.bin") })).binary, true);
await call("fs.remove", { path: dir });
assert.equal(fs.existsSync(dir), false);
await assert.rejects(call("fs.remove", { path: "/" }), /not removed/);
console.log("files: write, read, conflict, move, list, upload, download, remove");

assert.equal((await fetch(`${base}/api/file?path=/etc/hostname`)).status, 401);
assert.equal((await fetch(`${base}/api/rpc?c=local`, { method: "POST", headers: { "x-desk-token": token, origin: "http://evil.example" }, body: "{}" })).status, 401);
const bad = new WebSocket(base.replace(/^http/, "ws") + "/ws?t=wrong");
await new Promise((resolve) => { bad.onerror = resolve; bad.onopen = () => { throw new Error("a wrong token was accepted"); }; });
console.log("access: no token, another site's page and a wrong token are all refused");

const keys = await call("sol.keys");
const tools = await call("sol.tools");
const val = await call("val.status");
console.log("solana:", tools.filter((x) => x.version).map((x) => `${x.name} ${x.version}`).join(", ") || "no tools installed", "| keys:", keys.length, "| validator installed:", val.installed);

ws.close();
console.log("all checks passed");
