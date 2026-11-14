// Things more than one view can do.

import { call, rpc, toast, attempt, dialog } from "./core.js";
import { state, pulseNow, canAirdrop } from "./state.js";

/** Asks the cluster's faucet for test SOL. Works on localnet, devnet and testnet. */
export async function airdrop(address, amount = 2) {
  if (!canAirdrop()) { toast(`${state.cluster.name} gives away no SOL`, "bad"); return; }
  const lamports = Math.round(Number(amount) * 1e9);
  if (!(lamports > 0)) { toast("Say how much SOL", "bad"); return; }
  const sig = await attempt(() => rpc("requestAirdrop", [address, lamports]));
  if (!sig) return;
  toast(`Asked the faucet for ${amount} SOL`, "good");
  // The balance shows the airdrop once the transaction is confirmed.
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 700));
    const st = await rpc("getSignatureStatuses", [[sig]]).catch(() => null);
    const s = st?.value?.[0];
    if (s?.err) { toast("The airdrop failed on chain", "bad"); break; }
    if (s?.confirmationStatus === "confirmed" || s?.confirmationStatus === "finalized") break;
  }
  pulseNow();
  return sig;
}

export async function askAirdrop(address) {
  const v = await dialog({
    title: `Airdrop on ${state.cluster.name}`,
    fields: [{ name: "amount", label: "SOL", value: "2", type: "number", hint: state.cluster.name === "localnet" ? "Your own validator gives as much as you ask for." : "Public faucets give a few SOL at a time and may refuse when busy." }],
    ok: "Airdrop",
  });
  if (v) return airdrop(address, v.amount);
}

export const startValidator = (options = {}) => attempt(() => call("val.start", options), "The local validator is starting");
export const stopValidator = () => attempt(() => call("val.stop"), "The local validator stopped");
