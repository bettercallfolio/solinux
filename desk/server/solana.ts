// The Solana side of the desk: which tools are installed, the command-line configuration,
// keypair files, the local test validator, and a pass-through for RPC requests.

import { execFile, spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const HOME = os.homedir();
const CONFIG_DIR = path.join(HOME, ".config", "solana");
const CLI_CONFIG = path.join(CONFIG_DIR, "cli", "config.yml");
const STATE = path.join(HOME, ".local", "state", "solinux");
const LEDGER = path.join(HOME, ".local", "share", "solinux", "test-ledger");
const VALIDATOR_STATE = path.join(STATE, "validator.json");
const VALIDATOR_OUT = path.join(STATE, "validator.out");

// ---------------------------------------------------------------- base58

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function base58(bytes: Uint8Array): string {
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  const digits: number[] = [];
  for (const byte of bytes) {
    let carry = byte;
    for (let i = 0; i < digits.length; i++) {
      carry += digits[i]! << 8;
      digits[i] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry) { digits.push(carry % 58); carry = (carry / 58) | 0; }
  }
  let out = "1".repeat(zeros);
  for (let i = digits.length - 1; i >= 0; i--) out += ALPHABET[digits[i]!];
  return out;
}

// ---------------------------------------------------------------- tools

export interface Tool { name: string; version: string | null; path: string | null }

const TOOLS: [string, string, string[]][] = [
  ["solana", "solana", ["--version"]],
  ["solana-test-validator", "solana-test-validator", ["--version"]],
  ["anchor", "anchor", ["--version"]],
  ["cargo", "cargo", ["--version"]],
  ["rustc", "rustc", ["--version"]],
  ["node", "node", ["--version"]],
  ["git", "git", ["--version"]],
  ["chainboot", "chainboot", ["version"]],
];

function run(cmd: string, args: string[], timeout = 8000): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ ok: !err, out: (stdout || "") + (err ? stderr || "" : "") });
    });
  });
}

function which(cmd: string): string | null {
  for (const dir of (process.env.PATH ?? "").split(":")) {
    const p = path.join(dir, cmd);
    try { fs.accessSync(p, fs.constants.X_OK); return p; } catch { /* not here */ }
  }
  return null;
}

let toolsCache: { at: number; tools: Tool[] } | null = null;

export async function tools(fresh = false): Promise<Tool[]> {
  if (!fresh && toolsCache && Date.now() - toolsCache.at < 60_000) return toolsCache.tools;
  const found = await Promise.all(TOOLS.map(async ([name, cmd, args]): Promise<Tool> => {
    const p = which(cmd);
    if (!p) return { name, version: null, path: null };
    const r = await run(p, args);
    const line = r.out.split("\n").find((l) => l.trim()) ?? "";
    const version = line.match(/v?(\d+\.\d+(\.\d+)?[\w.+-]*)/)?.[1] ?? (line.trim() || null);
    return { name, version: r.ok ? version : null, path: p };
  }));
  toolsCache = { at: Date.now(), tools: found };
  return found;
}

// ---------------------------------------------------------------- command-line configuration

export interface CliConfig { rpcUrl: string; keypairPath: string; commitment: string; exists: boolean }

const DEFAULTS: CliConfig = { rpcUrl: "https://api.mainnet-beta.solana.com", keypairPath: path.join(CONFIG_DIR, "id.json"), commitment: "confirmed", exists: false };

export function cliConfig(): CliConfig {
  let text = "";
  try { text = fs.readFileSync(CLI_CONFIG, "utf8"); } catch { return { ...DEFAULTS }; }
  const get = (key: string): string | undefined => {
    const m = text.match(new RegExp(`^${key}:\\s*(.*)$`, "m"));
    return m ? m[1]!.trim().replace(/^['"]|['"]$/g, "") : undefined;
  };
  return {
    rpcUrl: get("json_rpc_url") || DEFAULTS.rpcUrl,
    keypairPath: get("keypair_path") || DEFAULTS.keypairPath,
    commitment: get("commitment") || DEFAULTS.commitment,
    exists: true,
  };
}

/** Changes settings of the solana command-line tools, keeping everything else in their file. */
export function setCliConfig(change: { rpcUrl?: string; keypairPath?: string }): CliConfig {
  const now = cliConfig();
  let text = "";
  try { text = fs.readFileSync(CLI_CONFIG, "utf8"); } catch { /* a new file */ }
  if (!text.trim()) {
    text = `---\njson_rpc_url: ${now.rpcUrl}\nwebsocket_url: ''\nkeypair_path: ${now.keypairPath}\naddress_labels:\n  '11111111111111111111111111111111': System Program\ncommitment: ${now.commitment}\n`;
  }
  const put = (key: string, value: string) => {
    const line = `${key}: ${value}`;
    const re = new RegExp(`^${key}:.*$`, "m");
    text = re.test(text) ? text.replace(re, line) : text.replace(/\n*$/, `\n${line}\n`);
  };
  if (change.rpcUrl !== undefined) {
    if (!/^https?:\/\/\S+$/.test(change.rpcUrl)) throw new Error("an RPC address starts with http:// or https://");
    put("json_rpc_url", change.rpcUrl);
    put("websocket_url", "''");
  }
  if (change.keypairPath !== undefined) put("keypair_path", change.keypairPath);
  fs.mkdirSync(path.dirname(CLI_CONFIG), { recursive: true });
  fs.writeFileSync(CLI_CONFIG, text);
  return cliConfig();
}

export const CLUSTERS: Record<string, string> = {
  local: "http://127.0.0.1:8899",
  devnet: "https://api.devnet.solana.com",
  testnet: "https://api.testnet.solana.com",
  mainnet: "https://api.mainnet-beta.solana.com",
};

/** The RPC address behind a name the page uses: a cluster, "config" (the CLI's), or an address itself. */
export function rpcTarget(name: string): string {
  if (name === "config") return cliConfig().rpcUrl;
  if (CLUSTERS[name]) return name === "local" ? `http://127.0.0.1:${validatorStatus().port}` : CLUSTERS[name]!;
  if (/^https?:\/\//.test(name)) return name;
  throw new Error(`unknown cluster "${name}"`);
}

export async function rpcForward(name: string, body: string): Promise<{ status: number; body: string }> {
  const res = await fetch(rpcTarget(name), {
    method: "POST", headers: { "content-type": "application/json" }, body, signal: AbortSignal.timeout(30_000),
  });
  return { status: res.status, body: await res.text() };
}

// ---------------------------------------------------------------- keypairs

export interface Key { name: string; path: string; address: string; isDefault: boolean }

function readKey(file: string): Uint8Array | null {
  try {
    const st = fs.statSync(file);
    if (!st.isFile() || st.size > 1024) return null;
    const v = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!Array.isArray(v) || v.length !== 64 || !v.every((n) => Number.isInteger(n) && n >= 0 && n < 256)) return null;
    return Uint8Array.from(v);
  } catch { return null; }
}

export function keys(): Key[] {
  const current = cliConfig().keypairPath;
  const files = new Set<string>();
  try { for (const f of fs.readdirSync(CONFIG_DIR)) if (f.endsWith(".json")) files.add(path.join(CONFIG_DIR, f)); } catch { /* no directory yet */ }
  files.add(current);
  const out: Key[] = [];
  for (const file of files) {
    const k = readKey(file);
    // A keypair file is the 32-byte seed followed by the 32-byte public key: the address is the second half.
    if (k) out.push({ name: path.basename(file, ".json"), path: file, address: base58(k.subarray(32)), isDefault: file === current });
  }
  out.sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name));
  return out;
}

export function createKey(name: string): Key {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,40}$/.test(name)) throw new Error("a key name uses letters, digits, dot, dash and underscore");
  const file = path.join(CONFIG_DIR, `${name}.json`);
  if (fs.existsSync(file)) throw new Error(`a key named "${name}" already exists`);
  const pair = crypto.generateKeyPairSync("ed25519");
  const seed = pair.privateKey.export({ format: "der", type: "pkcs8" }).subarray(-32);
  const pub = pair.publicKey.export({ format: "der", type: "spki" }).subarray(-32);
  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, JSON.stringify([...seed, ...pub]), { mode: 0o600, flag: "wx" });
  // The first key becomes the one the command-line tools use.
  if (!readKey(cliConfig().keypairPath)) setCliConfig({ keypairPath: file });
  return keys().find((k) => k.path === file)!;
}

export function setDefaultKey(file: string): Key[] {
  if (!readKey(file)) throw new Error("that file is not a keypair");
  setCliConfig({ keypairPath: file });
  return keys();
}

/** A key is never deleted from here: it is moved aside, where it can be found again. */
export function retireKey(file: string): Key[] {
  if (!readKey(file) || path.dirname(file) !== CONFIG_DIR) throw new Error("that file is not a keypair of this list");
  const aside = path.join(CONFIG_DIR, "removed");
  fs.mkdirSync(aside, { recursive: true, mode: 0o700 });
  fs.renameSync(file, path.join(aside, `${path.basename(file, ".json")}.${Date.now()}.json`));
  return keys();
}

// ---------------------------------------------------------------- the local test validator

export interface ValidatorStatus {
  installed: boolean; running: boolean; pid: number | null; port: number; ledger: string;
  started: number | null; args: string[]; ledgerExists: boolean;
}

interface Saved { pid: number; port: number; ledger: string; started: number; args: string[] }

function saved(): Saved | null {
  try { return JSON.parse(fs.readFileSync(VALIDATOR_STATE, "utf8")) as Saved; } catch { return null; }
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return fs.readFileSync(`/proc/${pid}/comm`, "utf8").startsWith("solana-test-val");
  } catch { return false; }
}

export function validatorStatus(): ValidatorStatus {
  const s = saved();
  const running = !!s && alive(s.pid);
  const ledger = s?.ledger ?? LEDGER;
  return {
    installed: which("solana-test-validator") !== null,
    running, pid: running ? s!.pid : null, port: s?.port ?? 8899, ledger,
    started: running ? s!.started : null, args: s?.args ?? [], ledgerExists: fs.existsSync(ledger),
  };
}

export interface StartOptions { reset?: boolean; port?: number; cloneFrom?: string; clone?: string[]; slotsPerEpoch?: number; extra?: string[] }

export function startValidator(o: StartOptions): ValidatorStatus {
  const now = validatorStatus();
  if (!now.installed) throw new Error("solana-test-validator is not installed on this system");
  if (now.running) throw new Error("the local validator is already running");
  const port = Number.isInteger(o.port) && o.port! > 1023 && o.port! < 65536 ? o.port! : 8899;
  const args = ["--ledger", LEDGER, "--rpc-port", String(port)];
  if (o.reset) args.push("--reset");
  const clone = (o.clone ?? []).map((a) => a.trim()).filter(Boolean);
  for (const a of clone) if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a)) throw new Error(`"${a}" is not an address`);
  if (clone.length) {
    const from = o.cloneFrom && CLUSTERS[o.cloneFrom] ? CLUSTERS[o.cloneFrom]! : o.cloneFrom;
    if (!from || !/^https?:\/\//.test(from)) throw new Error("say which cluster the accounts are copied from");
    args.push("--url", from);
    // "maybe": an address may be a program or a plain account; the validator finds out.
    for (const a of clone) args.push("--maybe-clone", a);
  }
  if (o.slotsPerEpoch) args.push("--slots-per-epoch", String(Math.max(32, Math.floor(o.slotsPerEpoch))));
  for (const a of o.extra ?? []) args.push(String(a));

  fs.mkdirSync(STATE, { recursive: true });
  fs.mkdirSync(path.dirname(LEDGER), { recursive: true });
  const out = fs.openSync(VALIDATOR_OUT, "w");
  const child = spawn("solana-test-validator", args, { cwd: path.dirname(LEDGER), detached: true, stdio: ["ignore", out, out] });
  fs.closeSync(out);
  child.unref();
  if (!child.pid) throw new Error("the validator could not be started");
  const s: Saved = { pid: child.pid, port, ledger: LEDGER, started: Date.now(), args };
  fs.writeFileSync(VALIDATOR_STATE, JSON.stringify(s));
  return validatorStatus();
}

export async function stopValidator(): Promise<ValidatorStatus> {
  const s = saved();
  if (s && alive(s.pid)) {
    process.kill(s.pid, "SIGINT");
    for (let i = 0; i < 100 && alive(s.pid); i++) {
      await new Promise((r) => setTimeout(r, 100));
      if (i === 50) try { process.kill(s.pid, "SIGTERM"); } catch { /* already gone */ }
    }
    if (alive(s.pid)) try { process.kill(s.pid, "SIGKILL"); } catch { /* already gone */ }
  }
  return validatorStatus();
}

/** What the validator said when it started (and why it stopped, if it did). */
export function validatorOutput(max = 16 * 1024): string {
  try {
    const st = fs.statSync(VALIDATOR_OUT);
    const fd = fs.openSync(VALIDATOR_OUT, "r");
    const buf = Buffer.alloc(Math.min(max, st.size));
    fs.readSync(fd, buf, 0, buf.length, Math.max(0, st.size - buf.length));
    fs.closeSync(fd);
    return buf.toString("utf8");
  } catch { return ""; }
}

export function validatorLogFile(): string { return path.join(validatorStatus().ledger, "validator.log"); }

// ---------------------------------------------------------------- chainboot's RPC endpoints

// chainboot and pkg read the chain through the endpoints kept in chainboot's settings. The
// desktop shows them without their keys and changes them through chainboot itself.

const CHAINBOOT_CONFIG = path.join(process.env.CHAINBOOT_HOME ?? path.join(HOME, ".chainboot"), "config.json");

function masked(url: string): string {
  try { const u = new URL(url); return `${u.protocol}//${u.host}${u.pathname.length > 1 || u.search ? "/…" : ""}`; } catch { return "(not an address)"; }
}

export function chainEndpoints(): { installed: boolean; network: string; endpoints: { index: number; shown: string }[] } {
  let network = "devnet", urls: string[] = [];
  try {
    const c = JSON.parse(fs.readFileSync(CHAINBOOT_CONFIG, "utf8"));
    network = typeof c.cluster === "string" ? c.cluster : "devnet";
    urls = Array.isArray(c.rpcs?.[network]) ? c.rpcs[network] : [];
  } catch { /* no settings yet */ }
  return { installed: which("chainboot") !== null, network, endpoints: urls.map((u, index) => ({ index, shown: masked(u) })) };
}

export async function addChainEndpoint(url: string): Promise<string> {
  if (!/^https?:\/\/\S+$/.test(url)) throw new Error("an RPC address starts with http:// or https://");
  const r = await run("chainboot", ["rpc", "add", url], 30_000);
  if (!r.ok) throw new Error(r.out.trim().split("\n").pop() || "chainboot could not add the endpoint");
  return r.out.trim();
}

export async function removeChainEndpoint(index: number): Promise<void> {
  // by position, so that the address (with its key) never has to travel to the page
  const c = JSON.parse(fs.readFileSync(CHAINBOOT_CONFIG, "utf8"));
  const network = typeof c.cluster === "string" ? c.cluster : "devnet";
  const url = c.rpcs?.[network]?.[index];
  if (typeof url !== "string") throw new Error("that endpoint is no longer in the list");
  const r = await run("chainboot", ["rpc", "remove", url], 30_000);
  if (!r.ok) throw new Error(r.out.trim().split("\n").pop() || "chainboot could not remove the endpoint");
}
