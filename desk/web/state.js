// What several views need to know at once: which cluster the system is set to, which key
// it uses, whether the local validator runs. Kept in one place and refreshed in one place.

import { call, rpc, emit, on, every, session } from "./core.js";

export const state = {
  config: null,        // { rpcUrl, keypairPath, commitment, clusters }
  keys: [],            // [{ name, path, address, isDefault }]
  validator: null,     // { installed, running, pid, port, ledger, started, args }
  tools: [],
  cluster: { name: "", url: "", ok: null, slot: null, version: null },
  balance: null,       // lamports of the default key on the current cluster
};

const NAMES = { local: "localnet", devnet: "devnet", testnet: "testnet", mainnet: "mainnet" };

/** A cluster's short name for an RPC address, or its host when it is none of the known ones. */
export function clusterName(url) {
  if (!url) return "";
  for (const [key, u] of Object.entries(state.config?.clusters ?? {})) if (u === url) return NAMES[key];
  try {
    const u = new URL(url);
    if (["127.0.0.1", "localhost", "[::1]"].includes(u.hostname)) return "localnet";
    return u.hostname;
  } catch { return url; }
}
export const isLocal = () => state.cluster.name === "localnet";
/** Clusters that give away test SOL. */
export const canAirdrop = () => ["localnet", "devnet", "testnet"].includes(state.cluster.name);

export const defaultKey = () => state.keys.find((k) => k.isDefault) ?? null;

export async function refreshConfig() {
  const [config, keys, validator] = await Promise.all([call("sol.config"), call("sol.keys"), call("val.status")]);
  state.config = config; state.keys = keys; state.validator = validator;
  const name = clusterName(config.rpcUrl);
  if (state.cluster.url !== config.rpcUrl) state.cluster = { name, url: config.rpcUrl, ok: null, slot: null, version: null };
  emit("state");
  pulse.now();
}

export async function setCluster(url) {
  await call("sol.setConfig", { rpcUrl: url });
  state.balance = null;
  await refreshConfig();
}

// The cluster's pulse: is it there, which slot is it at, what does our key hold.
const pulse = every(2500, async () => {
  if (!state.config) return;
  const before = JSON.stringify([state.cluster, state.balance]);
  try {
    const slot = await rpc("getSlot", [{ commitment: "confirmed" }]);
    state.cluster.ok = true; state.cluster.slot = slot;
    if (!state.cluster.version) state.cluster.version = (await rpc("getVersion"))["solana-core"];
    const key = defaultKey();
    state.balance = key ? (await rpc("getBalance", [key.address, { commitment: "confirmed" }])).value : null;
  } catch {
    state.cluster.ok = false; state.cluster.slot = null; state.cluster.version = null;
  }
  if (JSON.stringify([state.cluster, state.balance]) !== before) emit("pulse");
});

on("connected", (hello) => { state.tools = hello.tools; refreshConfig().catch(() => {}); });
on("val.status", (v) => { state.validator = v; state.cluster.ok = null; emit("state"); setTimeout(() => pulse.now(), 600); });
export const pulseNow = () => pulse.now();
export { session };
