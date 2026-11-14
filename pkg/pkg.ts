#!/usr/bin/env node
// pkg: Solinux's package manager.
//
// A package is one archive of files plus a line in the repository's index: its version, what
// it needs, its size and its SHA-256. Installing means: fetch the archive, check the hash,
// unpack it over /, and remember which files it brought. Removing means: take away exactly
// those files (the ones no other package also owns).
//
//   pkg list                 what is installed
//   pkg available            what the repository offers
//   pkg search <words>       look for a package
//   pkg info <name>          everything about one package
//   pkg install <name>...    install packages and what they need
//   pkg remove <name>...     remove packages
//   pkg upgrade              bring installed packages to the repository's versions
//   pkg files <name>         the files of an installed package
//   pkg owner <path>         which package a file belongs to
//
// Options: --json (one JSON object per line, for programs), --yes (do not ask),
// --repo <address> (instead of the one in /etc/solinux/pkg.conf), --root <dir> (act on a
// system mounted there, default /).

import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";

// ---------------------------------------------------------------- arguments

const argv = process.argv.slice(2);
function take(flag: string): boolean { const i = argv.indexOf(flag); if (i < 0) return false; argv.splice(i, 1); return true; }
function takeValue(flag: string): string | null {
  const i = argv.indexOf(flag);
  if (i < 0) return null;
  const v = argv[i + 1];
  if (v === undefined) fail(`${flag} needs a value`);
  argv.splice(i, 2);
  return v!;
}
const JSON_OUT = take("--json");
const YES = take("--yes") || take("-y");
const FORCE = take("--force");
const ROOT = path.resolve(takeValue("--root") ?? "/");
const repoArg = takeValue("--repo");
const command = argv.shift() ?? "help";

const DB = path.join(ROOT, "var/lib/solinux/pkg");
const CACHE = path.join(ROOT, "var/cache/solinux/pkg");
const CONF = path.join(ROOT, "etc/solinux/pkg.conf");

function fail(message: string): never {
  if (JSON_OUT) console.log(JSON.stringify({ event: "error", message }));
  else console.error(`pkg: ${message}`);
  process.exit(1);
}
function say(text: string, event?: Record<string, unknown>): void {
  if (JSON_OUT) { if (event) console.log(JSON.stringify(event)); } else console.log(text);
}
const size = (n: number): string => (n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : n >= 1e3 ? `${Math.round(n / 1e3)} kB` : `${n} B`);

// ---------------------------------------------------------------- the repository

interface Ref { sig: string; size: number; sha256: string }
interface Package {
  version: string; summary: string; file: string; size: number; installed: number; sha256: string;
  deps: string[]; set: string; app?: { name: string; icon: string; comment: string };
  /** Where the archive is on chain (repositories on chain only). */
  ref?: Ref;
}
interface Index { format: number; name: string; updated: string; packages: Record<string, Package> }

function repoAddress(): string {
  if (repoArg) return repoArg;
  if (process.env.SOLINUX_REPO) return process.env.SOLINUX_REPO;
  try {
    const m = fs.readFileSync(CONF, "utf8").match(/^\s*repo\s*=\s*(\S+)/m);
    if (m) return m[1]!;
  } catch { /* no settings file */ }
  fail(`no repository is set. Put "repo = <address>" into ${CONF}, or give --repo <address>.`);
}

const isUrl = (s: string): boolean => /^https?:\/\//.test(s);
const isChain = (s: string): boolean => s.startsWith("chain:");

function setting(key: string): string | null {
  try { return fs.readFileSync(CONF, "utf8").match(new RegExp(`^\\s*${key}\\s*=\\s*(\\S+)`, "m"))?.[1] ?? null; } catch { return null; }
}

// ---- a repository on chain: the index and every archive are files stored with chainboot.
// A pointer that only the publisher's key can move names the newest index. Everything read
// is checked against the publisher's signature and the SHA-256 the index gives.

interface Chain { store: any; publisher: Uint8Array; cache: string; index: Ref }
let chainOpen: Promise<Chain> | null = null;

function rpcEndpoints(network: string): string[] {
  if (process.env.CHAINBOOT_RPC) return process.env.CHAINBOOT_RPC.split(",").map((u) => u.trim()).filter(Boolean);
  const home = process.env.CHAINBOOT_HOME ?? path.join(process.env.HOME ?? "/root", ".chainboot");
  // this system's own endpoints, or, in a machine that chainboot started, the endpoints of the
  // person who runs it (chainboot puts them in /run/chainboot/config.json)
  for (const file of [path.join(home, "config.json"), "/run/chainboot/config.json"]) {
    try {
      const urls = (JSON.parse(fs.readFileSync(file, "utf8")).rpcs?.[network] ?? []).filter((u: unknown) => typeof u === "string");
      if (urls.length) return urls;
    } catch { /* no such file */ }
  }
  return [];
}

function chain(repo: string): Promise<Chain> {
  chainOpen ??= (async () => {
    const [address, name = "main"] = repo.slice("chain:".length).split("/");
    const network = process.env.SOLINUX_NETWORK ?? setting("network") ?? "devnet";
    let urls = rpcEndpoints(network);
    if (!urls.length) {
      // No endpoint of your own: the network's public one works, slowly (it allows few requests).
      const open: Record<string, string> = { devnet: "https://api.devnet.solana.com", testnet: "https://api.testnet.solana.com", "mainnet-beta": "https://api.mainnet-beta.solana.com" };
      if (!open[network]) fail(`a repository on chain is read through RPC endpoints, and none is set for ${network}. Add one: chainboot rpc add <address>`);
      urls = [open[network]!];
      if (!JSON_OUT) console.error(`pkg: reading ${network} through its public endpoint, which is slow. Your own is much faster: chainboot rpc add <address>`);
    }
    const sdk = await import(new URL("./vendor/chainboot-sdk.mjs", import.meta.url).href);
    const genesis = sdk.GENESIS[network];
    if (!genesis) fail(`pkg does not know the network "${network}" (devnet, testnet, mainnet-beta)`);
    let publisher: Uint8Array;
    try { publisher = sdk.addressToBytes(address); } catch { fail(`"${address}" is not a publisher address`); }
    const pool = new sdk.RpcPool(urls);
    await pool.probe(genesis);
    const store = new sdk.ChainStore(pool);
    const record = await store.getPointer(sdk.tagAddress("solinux-pkg", publisher, name), [publisher]);
    if (!record) fail(`${address} has published no package repository "${name}" on ${network}`);
    let index: Ref;
    try { index = JSON.parse(record.payload.toString("utf8")).index; } catch { fail("the repository's pointer is not in a format this pkg understands"); }
    if (!index || typeof index.sig !== "string" || !/^[0-9a-f]{64}$/.test(index.sha256 ?? "")) fail("the repository's pointer names no index");
    // Looking (as an ordinary user) must work too: without the right to write the system's cache, a temporary one serves.
    let cache = path.join(CACHE, "objects");
    try { fs.mkdirSync(cache, { recursive: true }); fs.accessSync(cache, fs.constants.W_OK); }
    catch { cache = path.join(os.tmpdir(), `solinux-pkg-${process.getuid?.() ?? 0}`); fs.mkdirSync(cache, { recursive: true }); }
    return { store, publisher, cache, index };
  })();
  return chainOpen;
}

async function chainGet(repo: string, ref: Ref, onProgress?: (done: number, total: number) => void): Promise<Buffer> {
  const c = await chain(repo);
  return Buffer.from(await c.store.get(ref, { signers: [c.publisher], cacheDir: c.cache, onProgress: (p: { bytes: number; size: number }) => onProgress?.(p.bytes, p.size) }));
}

/** Reads one file of the repository: from a web address or from a directory. */
async function fetchFile(repo: string, name: string, onProgress?: (done: number, total: number) => void, ref?: Ref): Promise<Buffer> {
  if (isChain(repo)) {
    if (name === "index.json") return chainGet(repo, (await chain(repo)).index);
    if (!ref) throw new Error(`the index does not say where ${name} is on chain`);
    return chainGet(repo, ref, onProgress);
  }
  if (!isUrl(repo)) {
    const p = path.join(repo.replace(/^file:\/\//, ""), name);
    if (!fs.existsSync(p)) throw new Error(`the repository ${repo} has no ${name}`);
    return fs.readFileSync(p);
  }
  const res = await fetch(`${repo.replace(/\/$/, "")}/${name}`, { signal: AbortSignal.timeout(600_000) });
  if (!res.ok) throw new Error(`the repository answered ${res.status} for ${name}`);
  const total = Number(res.headers.get("content-length") ?? 0);
  const parts: Buffer[] = [];
  let done = 0;
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    parts.push(Buffer.from(chunk)); done += chunk.length;
    onProgress?.(done, total);
  }
  return Buffer.concat(parts);
}

let indexCache: Index | null = null;
async function index(): Promise<Index> {
  if (indexCache) return indexCache;
  const repo = repoAddress();
  let data: Index;
  try { data = JSON.parse((await fetchFile(repo, "index.json")).toString("utf8")) as Index; }
  catch (e) { fail(`the repository's index could not be read: ${(e as Error).message}`); }
  if (data.format !== 1 || typeof data.packages !== "object") fail("the repository's index is not in a format this pkg understands");
  for (const [name, p] of Object.entries(data.packages)) {
    if (!/^[a-z0-9][a-z0-9+._-]*$/i.test(name) || !/^[0-9a-f]{64}$/.test(p.sha256 ?? "") || typeof p.file !== "string" || p.file.includes("/") || !Array.isArray(p.deps)) {
      fail(`the repository's index has an entry that cannot be trusted: ${name}`);
    }
  }
  indexCache = data;
  return data;
}

// ---------------------------------------------------------------- what is installed

interface Installed { version: string; files: string[]; set: string }

function installed(): Map<string, Installed> {
  const out = new Map<string, Installed>();
  let names: string[] = [];
  try { names = fs.readdirSync(DB); } catch { return out; }
  for (const name of names) {
    const dir = path.join(DB, name);
    try {
      const version = fs.readFileSync(path.join(dir, "version"), "utf8").trim();
      const files = fs.readFileSync(path.join(dir, "files"), "utf8").split("\n").filter(Boolean);
      let set = "base";
      try { set = fs.readFileSync(path.join(dir, "set"), "utf8").trim() || "base"; } catch { /* packages of the first image have no set file */ }
      out.set(name, { version, files, set });
    } catch { /* not a package record */ }
  }
  return out;
}

// ---------------------------------------------------------------- installing

function needRoot(): void {
  if (process.getuid?.() !== 0) fail("this changes the system: run it as root (sudo pkg ...)");
}

async function ask(question: string): Promise<boolean> {
  if (YES || JSON_OUT) return true;
  if (!process.stdin.isTTY) fail(`${question} Give --yes to go ahead without being asked.`);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer: string = await new Promise((r) => rl.question(`${question} [Y/n] `, r));
  rl.close();
  return answer.trim() === "" || /^y/i.test(answer.trim());
}

/** The packages to install for these names, in an order where everything comes after what it needs. */
function plan(idx: Index, have: Map<string, Installed>, names: string[]): string[] {
  const order: string[] = [];
  const state = new Map<string, "visiting" | "done">();
  const visit = (name: string, wantedBy: string | null) => {
    const p = idx.packages[name];
    // A repository need not carry what every Solinux already has: something needed that is installed is fine as it is.
    if (!p && wantedBy && have.has(name)) return;
    if (!p) fail(wantedBy ? `${wantedBy} needs ${name}, which is not installed and which the repository does not have` : `the repository has no package "${name}"`);
    if (state.get(name) === "done") return;
    if (state.get(name) === "visiting") return;   // two packages that need each other: either order works
    state.set(name, "visiting");
    for (const d of p.deps) visit(d, name);
    state.set(name, "done");
    if (have.get(name)?.version !== p.version) order.push(name);
  };
  for (const n of names) visit(n, null);
  return order;
}

function run(cmd: string, args: string[]): boolean {
  const r = spawnSync(cmd, args, { stdio: ["ignore", "ignore", "pipe"], encoding: "utf8" });
  if (r.error && !JSON_OUT) console.error(`pkg: could not start ${cmd}: ${r.error.message}`);
  return r.status === 0;
}
function has(cmd: string): boolean {
  return ["usr/bin", "usr/sbin"].some((d) => fs.existsSync(path.join(ROOT, d, cmd)));
}
/** Runs a program of the system being changed (inside --root when that is not /). */
function inRoot(cmd: string, args: string[]): void {
  if (!has(cmd)) return;
  if (ROOT === "/") run(cmd, args); else run("chroot", [ROOT, cmd, ...args]);
}

/**
 * The lists some programs keep about what is installed, brought up to date after a change
 * (or all of them, for "pkg refresh": a system that was just put together has none yet).
 */
function refresh(changed: string[] | null): void {
  const touched = (re: RegExp) => changed === null || changed.some((f) => re.test(f));
  if (touched(/^usr\/lib\/.*\.so/)) inRoot("ldconfig", []);
  if (touched(/^usr\/share\/glib-2\.0\/schemas\//)) inRoot("glib-compile-schemas", ["/usr/share/glib-2.0/schemas"]);
  if (touched(/^usr\/share\/mime\/packages\//)) inRoot("update-mime-database", ["/usr/share/mime"]);
  if (touched(/^usr\/share\/fonts\//)) inRoot("fc-cache", ["-f"]);
  let themes: string[];
  if (changed === null) { try { themes = fs.readdirSync(path.join(ROOT, "usr/share/icons")).filter((t) => fs.existsSync(path.join(ROOT, "usr/share/icons", t, "index.theme"))); } catch { themes = []; } }
  else themes = [...new Set(changed.map((f) => f.match(/^usr\/share\/icons\/([^/]+)\//)?.[1]).filter(Boolean) as string[])];
  for (const t of themes) inRoot("gtk-update-icon-cache", ["-q", "-f", "-t", `/usr/share/icons/${t}`]);
  if (touched(/^usr\/lib\/gdk-pixbuf-2\.0\//) && has("gdk-pixbuf-query-loaders")) inRoot("gdk-pixbuf-query-loaders", ["--update-cache"]);
  if (touched(/^usr\/lib\/gtk-3\.0\//) && has("gtk-query-immodules-3.0")) inRoot("gtk-query-immodules-3.0", ["--update-cache"]);
  if (touched(/^(usr\/lib|etc)\/systemd\/system\//) && ROOT === "/" && fs.existsSync("/run/systemd/system")) run("systemctl", ["daemon-reload"]);
}

async function install(names: string[]): Promise<void> {
  if (!names.length) fail("say which package to install");
  needRoot();
  const idx = await index();
  const have = installed();
  const order = plan(idx, have, names);
  if (!order.length) { say(`${names.join(", ")}: already installed, nothing to do.`, { event: "done", installed: [] }); return; }
  const download = order.reduce((n, p) => n + idx.packages[p]!.size, 0), disk = order.reduce((n, p) => n + idx.packages[p]!.installed, 0);
  say(`To install: ${order.map((n) => `${n} ${idx.packages[n]!.version}`).join(", ")}`, { event: "plan", packages: order, download, disk });
  say(`Download ${size(download)}, on disk ${size(disk)}.`);
  if (!(await ask("Go ahead?"))) { say("Nothing was changed."); return; }

  fs.mkdirSync(CACHE, { recursive: true });
  const repo = repoAddress();
  const changed: string[] = [];
  for (const name of order) {
    const p = idx.packages[name]!;
    const archive = path.join(CACHE, p.file);
    let data: Buffer | null = null;
    if (fs.existsSync(archive)) {
      const cached = fs.readFileSync(archive);
      if (crypto.createHash("sha256").update(cached).digest("hex") === p.sha256) data = cached;
    }
    if (!data) {
      let last = 0;
      data = await fetchFile(repo, p.file, (done, total) => {
        const now = Date.now();
        if (now - last < 150 && done < total) return;
        last = now;
        if (JSON_OUT) console.log(JSON.stringify({ event: "download", name, done, total: total || p.size }));
        else if (process.stdout.isTTY) process.stdout.write(`\r${name}: ${size(done)} of ${size(total || p.size)}   `);
      }, p.ref).catch((e) => fail(`${name} could not be fetched: ${(e as Error).message}`));
      if (!JSON_OUT && process.stdout.isTTY) process.stdout.write("\r\x1b[K");
      // What arrives must be exactly what the index describes; otherwise nothing of it touches the system.
      if (crypto.createHash("sha256").update(data).digest("hex") !== p.sha256) fail(`${name}: the archive does not match the hash in the index. Nothing of it was installed.`);
      fs.writeFileSync(archive, data);
    }
    say(`Installing ${name} ${p.version}`, { event: "install", name, version: p.version });
    // The names in the archive, before anything is unpacked: they become the record of this package.
    const listing = spawnSync("tar", ["-tf", archive], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
    if (listing.status !== 0) fail(`${name}: the archive cannot be read`);
    const files = listing.stdout.split("\n").map((l) => l.replace(/^\.\//, "").replace(/\/$/, "")).filter((l) => l && l !== ".");
    if (files.some((f) => f.startsWith("/") || f.split("/").includes(".."))) fail(`${name}: the archive names a path outside the system. Nothing of it was installed.`);
    const before = have.get(name)?.files ?? [];
    const un = spawnSync("tar", ["-C", ROOT, "--keep-directory-symlink", "--numeric-owner", "-xpf", archive], { encoding: "utf8" });
    if (un.status !== 0) fail(`${name}: unpacking failed: ${un.stderr.trim().split("\n").pop()}`);
    // An upgrade: what the old version had and the new one does not is taken away.
    const now = new Set(files);
    removeFiles(before.filter((f) => !now.has(f)), ownership(name));
    const dir = path.join(DB, name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "files"), files.join("\n") + "\n");
    fs.writeFileSync(path.join(dir, "version"), p.version + "\n");
    fs.writeFileSync(path.join(dir, "set"), p.set + "\n");
    changed.push(...files, ...before);
  }
  refresh(changed);
  say(`Done: ${order.length} ${order.length === 1 ? "package" : "packages"} installed.`, { event: "done", installed: order });
}

// ---------------------------------------------------------------- removing

/** Every path that some installed package other than `except` owns. */
function ownership(except: string): Set<string> {
  const owned = new Set<string>();
  for (const [name, p] of installed()) if (name !== except) for (const f of p.files) owned.add(f);
  return owned;
}

function removeFiles(files: string[], ownedByOthers: Set<string>): void {
  // Deepest paths first, so that directories are empty by the time their turn comes.
  for (const f of [...files].sort((a, b) => b.length - a.length)) {
    if (ownedByOthers.has(f)) continue;
    const p = path.join(ROOT, f);
    try {
      const st = fs.lstatSync(p);
      if (st.isDirectory()) { try { fs.rmdirSync(p); } catch { /* still holds something that is not ours */ } }
      else fs.unlinkSync(p);
    } catch { /* already gone */ }
  }
}

async function remove(names: string[]): Promise<void> {
  if (!names.length) fail("say which package to remove");
  needRoot();
  const have = installed();
  let idx: Index | null = null;
  try { idx = await index(); } catch { /* removing works without a repository */ }
  for (const name of names) {
    const p = have.get(name);
    if (!p) fail(`${name} is not installed`);
    if (p.set === "base" && !FORCE) fail(`${name} is part of the base system. Removing it would break the system (--force removes it anyway).`);
    const needers = [...have.keys()].filter((other) => !names.includes(other) && idx?.packages[other]?.deps.includes(name));
    if (needers.length && !FORCE) fail(`${name} is needed by ${needers.join(", ")}. Remove ${needers.length === 1 ? "it" : "them"} first (or give --force).`);
  }
  say(`To remove: ${names.join(", ")}`, { event: "plan", remove: names });
  if (!(await ask("Go ahead?"))) { say("Nothing was changed."); return; }
  const changed: string[] = [];
  for (const name of names) {
    const p = have.get(name)!;
    say(`Removing ${name}`, { event: "remove", name });
    removeFiles(p.files, ownership(name));
    fs.rmSync(path.join(DB, name), { recursive: true });
    changed.push(...p.files);
  }
  refresh(changed);
  say(`Done: ${names.length} ${names.length === 1 ? "package" : "packages"} removed.`, { event: "done", removed: names });
}

// ---------------------------------------------------------------- looking

async function available(query: string[]): Promise<void> {
  const idx = await index();
  const have = installed();
  const words = query.map((w) => w.toLowerCase());
  const rows = Object.entries(idx.packages)
    .filter(([name, p]) => words.every((w) => name.toLowerCase().includes(w) || p.summary.toLowerCase().includes(w) || (p.app?.name ?? "").toLowerCase().includes(w)))
    .sort(([a], [b]) => a.localeCompare(b));
  if (JSON_OUT) {
    console.log(JSON.stringify({ event: "packages", repository: idx.name, updated: idx.updated, packages: rows.map(([name, p]) => ({ name, ...p, installedVersion: have.get(name)?.version ?? null })) }));
    return;
  }
  if (!rows.length) { console.log("Nothing matches."); return; }
  const w = Math.max(...rows.map(([n]) => n.length));
  for (const [name, p] of rows) {
    const mark = have.get(name)?.version === p.version ? "installed" : have.has(name) ? `installed ${have.get(name)!.version}` : "";
    console.log(`${name.padEnd(w)}  ${p.version.padEnd(12)}  ${size(p.size).padStart(8)}  ${p.summary}${mark ? `  [${mark}]` : ""}`);
  }
}

function list(): void {
  const have = [...installed()].sort(([a], [b]) => a.localeCompare(b));
  if (JSON_OUT) { console.log(JSON.stringify({ event: "installed", packages: have.map(([name, p]) => ({ name, version: p.version, set: p.set, files: p.files.length })) })); return; }
  const w = Math.max(4, ...have.map(([n]) => n.length));
  for (const [name, p] of have) console.log(`${name.padEnd(w)}  ${p.version}`);
  console.log(`\n${have.length} packages installed.`);
}

async function info(name: string | undefined): Promise<void> {
  if (!name) fail("say which package");
  const have = installed().get(name);
  let p: Package | undefined;
  try { p = (await index()).packages[name]; } catch { /* without a repository there is still the local record */ }
  if (!have && !p) fail(`no package "${name}" is installed or offered`);
  if (JSON_OUT) { console.log(JSON.stringify({ event: "info", name, installed: have ? { version: have.version, files: have.files.length, set: have.set } : null, offered: p ?? null })); return; }
  console.log(`${name}${p?.summary ? `: ${p.summary}` : ""}`);
  console.log(`  installed:  ${have ? `${have.version} (${have.files.length} files)` : "no"}`);
  if (p) {
    console.log(`  offered:    ${p.version}, download ${size(p.size)}, on disk ${size(p.installed)}`);
    console.log(`  needs:      ${p.deps.length ? p.deps.join(", ") : "nothing else"}`);
    if (p.app) console.log(`  shows up as: ${p.app.name} (in the desktop's applications)`);
  }
}

async function upgrade(): Promise<void> {
  const idx = await index();
  const have = installed();
  const old = [...have].filter(([name, p]) => idx.packages[name] && idx.packages[name]!.version !== p.version).map(([name]) => name);
  if (!old.length) { say("Everything installed is at the repository's version.", { event: "done", installed: [] }); return; }
  await install(old);
}

const HELP = `pkg: Solinux's package manager

  pkg list                 what is installed
  pkg available            what the repository offers
  pkg search <words>       look for a package
  pkg info <name>          everything about one package
  pkg install <name>...    install packages and what they need
  pkg remove <name>...     remove packages
  pkg upgrade              bring installed packages to the repository's versions
  pkg files <name>         the files of an installed package
  pkg owner <path>         which package a file belongs to

Options: --yes (do not ask), --json (for programs), --repo <address>, --root <dir>, --force.
The repository is named in /etc/solinux/pkg.conf.`;

switch (command) {
  case "list": list(); break;
  case "available": await available([]); break;
  case "search": await available(argv); break;
  case "info": await info(argv[0]); break;
  case "install": case "add": await install(argv); break;
  case "remove": case "rm": await remove(argv); break;
  case "upgrade": await upgrade(); break;
  case "refresh": refresh(null); break;   // (used when a system is put together; harmless at any time)
  case "files": {
    const p = installed().get(argv[0] ?? "");
    if (!p) fail(`${argv[0] ?? "that"} is not installed`);
    console.log(p.files.map((f) => `/${f}`).join("\n"));
    break;
  }
  case "owner": {
    const want = path.resolve(argv[0] ?? "").replace(/^\//, "");
    const owners = [...installed()].filter(([, p]) => p.files.includes(want)).map(([n]) => n);
    if (!owners.length) fail(`no package owns /${want}`);
    console.log(owners.join("\n"));
    break;
  }
  case "help": case "--help": case "-h": console.log(HELP); break;
  default: fail(`there is no command "${command}". Try: pkg help`);
}
