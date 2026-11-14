#!/usr/bin/env node
// Puts the package repository on chain.
//
//   publish-repo.mjs --keypair <file> [--sets apps | --packages a,b] [--name main] [--network devnet] [--yes]
//
// Every archive of the chosen sets is stored with chainboot (once: what is already on chain
// is not sent again), then the index, then a pointer that names the newest index. `pkg`
// with "repo = chain:<address of the keypair>" installs from it.
//
// It shows what the upload costs and asks before sending anything.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const sdk = await import(path.join(here, "..", "pkg", "vendor", "chainboot-sdk.mjs"));

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] ? args[i + 1] : fallback; };
const WORK = process.env.WORK ?? path.join(os.homedir(), "build");
const repoDir = path.join(WORK, "repo");
const keyFile = opt("keypair", process.env.CHAINBOOT_KEYPAIR);
const sets = opt("sets", "apps").split(",");
const name = opt("name", "main");
const network = opt("network", "devnet");
if (!keyFile) { console.error("say which key publishes: --keypair <file>"); process.exit(1); }

const key = sdk.Keypair.fromFile(keyFile);
const config = JSON.parse(fs.readFileSync(path.join(process.env.CHAINBOOT_HOME ?? path.join(os.homedir(), ".chainboot"), "config.json"), "utf8"));
const urls = process.env.CHAINBOOT_RPC ? process.env.CHAINBOOT_RPC.split(",") : config.rpcs?.[network] ?? [];
if (!urls.length) { console.error(`no RPC endpoint for ${network}: chainboot rpc add <address>`); process.exit(1); }

const index = JSON.parse(fs.readFileSync(path.join(repoDir, "index.json"), "utf8"));
const statePath = path.join(repoDir, `published-${network}.json`);
const state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, "utf8")) : {};   // sha256 -> ref
const only = opt("packages", "");   // instead of whole sets: --packages a,b,c
const chosen = Object.entries(index.packages).filter(([pkg, p]) => (only ? only.split(",").includes(pkg) : sets.includes(p.set) || sets.includes("all")));
if (!chosen.length) { console.error(`the repository in ${repoDir} has no package in ${sets.join(", ")}`); process.exit(1); }

const todo = chosen.filter(([, p]) => !state[p.sha256]);
const bytes = todo.reduce((n, [, p]) => n + p.size, 0);
const plan = todo.reduce((acc, [, p]) => { const x = sdk.ChainStore.plan(p.size); return { tx: acc.tx + x.transactions, fee: acc.fee + x.feeLamports }; }, { tx: 0, fee: 0 });
console.log(`Repository "${name}" of ${sdk.b58encode(key.publicKey)} on ${network}`);
console.log(`${chosen.length} packages (${sets.join(", ")}); ${todo.length} of them are not on chain yet: ${(bytes / 1e6).toFixed(1)} MB, about ${plan.tx} transactions, ${(plan.fee / 1e9).toFixed(4)} SOL in fees.`);
if (!args.includes("--yes")) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((r) => rl.question("Send? [y/N] ", r));
  rl.close();
  if (!/^y/i.test(answer.trim())) { console.log("Nothing was sent."); process.exit(0); }
}

const pool = new sdk.RpcPool(urls);
await pool.probe(sdk.GENESIS[network]);
const store = new sdk.ChainStore(pool);
const journalDir = path.join(repoDir, "journal");

for (const [pkg, p] of todo) {
  const data = fs.readFileSync(path.join(repoDir, p.file));
  let last = 0;
  const ref = await store.put(key, data, { journalDir, onProgress: (g) => { const now = Date.now(); if (now - last > 1000) { last = now; process.stdout.write(`\r${pkg}: ${g.phase} ${g.done}/${g.total}   `); } } });
  process.stdout.write(`\r\x1b[K${pkg} ${p.version}: ${ref.sig}\n`);
  state[p.sha256] = ref;
  fs.writeFileSync(statePath, JSON.stringify(state, null, 1));   // after every package: an interrupted run loses nothing
}

const onChain = { format: 1, name: index.name, updated: new Date().toISOString(), packages: Object.fromEntries(chosen.map(([pkg, p]) => [pkg, { ...p, ref: state[p.sha256] }])) };
const indexRef = await store.put(key, Buffer.from(JSON.stringify(onChain)), { journalDir });
const tag = sdk.tagAddress("solinux-pkg", key.publicKey, name);
await store.putPointer(key, tag, Buffer.from(JSON.stringify({ index: indexRef })));
fs.writeFileSync(path.join(repoDir, `index-${network}.json`), JSON.stringify(onChain, null, 1));
console.log(`index: ${indexRef.sig}\nThe repository is on chain. Use it with:  repo = chain:${sdk.b58encode(key.publicKey)}${name === "main" ? "" : "/" + name}`);
process.exit(0);
