// The Software application's side on the system: it asks `pkg`, Solinux's package manager,
// what is installed and what the repository offers. Installing and removing are not done
// here: the desktop runs the pkg command in a terminal the person can watch.

import { execFile } from "node:child_process";
import fs from "node:fs";

/** How pkg is started. SOLINUX_PKG replaces it (for trying the desk on a system that is not Solinux). */
export function pkgCommand(): string[] | null {
  const custom = process.env.SOLINUX_PKG?.trim();
  if (custom) return custom.split(/\s+/);
  for (const p of ["/usr/bin/pkg", "/usr/local/bin/pkg"]) if (fs.existsSync(p)) return [p];
  return null;
}

function run(args: string[], timeout = 60_000): Promise<{ ok: boolean; out: string; err: string }> {
  const cmd = pkgCommand();
  if (!cmd) return Promise.resolve({ ok: false, out: "", err: "pkg is not installed on this system" });
  return new Promise((resolve) => {
    execFile(cmd[0]!, [...cmd.slice(1), "--json", ...args], { timeout, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ ok: !err, out: stdout ?? "", err: stderr ?? "" });
    });
  });
}

function lastEvent(out: string, event: string): any | null {
  for (const line of out.trim().split("\n").reverse()) {
    try { const v = JSON.parse(line); if (v.event === event) return v; if (v.event === "error") return v; } catch { /* not a line of ours */ }
  }
  return null;
}

export interface Offered {
  name: string; version: string; summary: string; size: number; installed: number; deps: string[]; set: string;
  app?: { name: string; icon: string; comment: string }; installedVersion: string | null;
}

export async function packages(): Promise<{ available: boolean; reason?: string; repository?: string; updated?: string; packages: Offered[]; installedOnly: { name: string; version: string }[] }> {
  if (!pkgCommand()) return { available: false, reason: "This system has no package manager (pkg). On Solinux it is part of the system.", packages: [], installedOnly: [] };
  const [offer, have] = await Promise.all([run(["available"]), run(["list"])]);
  const installed = lastEvent(have.out, "installed");
  const mine: { name: string; version: string }[] = installed?.packages ?? [];
  const offered = lastEvent(offer.out, "packages");
  if (!offered || offered.event === "error") {
    return { available: false, reason: offered?.message ?? (offer.err.trim() || "The repository could not be read."), packages: [], installedOnly: mine };
  }
  const names = new Set<string>(offered.packages.map((p: Offered) => p.name));
  return { available: true, repository: offered.repository, updated: offered.updated, packages: offered.packages, installedOnly: mine.filter((p) => !names.has(p.name)) };
}

/** The command the desktop runs (in a terminal) to install or remove packages. */
export function changeCommand(action: "install" | "remove" | "upgrade", names: string[]): string[] {
  const cmd = pkgCommand();
  if (!cmd) throw new Error("pkg is not installed on this system");
  for (const n of names) if (!/^[A-Za-z0-9][A-Za-z0-9+._-]*$/.test(n)) throw new Error(`"${n}" is not a package name`);
  return [...cmd, action, ...names, "--yes"];
}
