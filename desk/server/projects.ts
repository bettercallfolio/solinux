// Program projects: the folders under ~/projects that hold a Solana program (an Anchor
// workspace or a plain Rust program), what they have built, and the commands that build,
// test and deploy them. The desktop runs those commands in a terminal the person can watch.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { base58, cliConfig } from "./solana.ts";

export const PROJECTS = path.join(os.homedir(), "projects");

export interface Built { name: string; file: string; size: number; built: number; address: string | null; idl: string | null }
export interface Project { name: string; path: string; kind: "anchor" | "rust"; programs: Built[] }

function programAddress(keypairFile: string): string | null {
  try {
    const v = JSON.parse(fs.readFileSync(keypairFile, "utf8"));
    return Array.isArray(v) && v.length === 64 ? base58(Uint8Array.from(v).subarray(32)) : null;
  } catch { return null; }
}

function built(dir: string): Built[] {
  const deploy = path.join(dir, "target", "deploy");
  let names: string[] = [];
  try { names = fs.readdirSync(deploy); } catch { return []; }
  return names.filter((n) => n.endsWith(".so")).map((n) => {
    const base = n.slice(0, -3), file = path.join(deploy, n), st = fs.statSync(file);
    const idl = path.join(dir, "target", "idl", `${base}.json`);
    return { name: base, file, size: st.size, built: st.mtimeMs, address: programAddress(path.join(deploy, `${base}-keypair.json`)), idl: fs.existsSync(idl) ? idl : null };
  });
}

export function listProjects(): { root: string; projects: Project[] } {
  const projects: Project[] = [];
  let names: string[] = [];
  try { names = fs.readdirSync(PROJECTS); } catch { /* the folder is made with the first project */ }
  for (const name of names.sort((a, b) => a.localeCompare(b))) {
    const dir = path.join(PROJECTS, name);
    try { if (!fs.statSync(dir).isDirectory()) continue; } catch { continue; }
    const kind = fs.existsSync(path.join(dir, "Anchor.toml")) ? "anchor" : fs.existsSync(path.join(dir, "Cargo.toml")) ? "rust" : null;
    if (kind) projects.push({ name, path: dir, kind, programs: built(dir) });
  }
  return { root: PROJECTS, projects };
}

const NAME = /^[a-z][a-z0-9_-]{0,40}$/;

/**
 * The newest release of a crate, as "major.minor" (asked of crates.io), or "*" when it cannot
 * be asked: the crates Solana programs are written with have version numbers of their own,
 * apart from the tools'.
 */
async function newestCrate(crate: string): Promise<string> {
  try {
    const dir = crate.length <= 3 ? `${crate.length}` : `${crate.slice(0, 2)}/${crate.slice(2, 4)}`;
    const res = await fetch(`https://index.crates.io/${dir}/${crate}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return "*";
    const versions = (await res.text()).split("\n").filter(Boolean).map((l) => JSON.parse(l) as { vers: string; yanked: boolean })
      .filter((v) => !v.yanked && /^\d+\.\d+\.\d+$/.test(v.vers)).map((v) => v.vers.split(".").map(Number));
    versions.sort((x, y) => x[0]! - y[0]! || x[1]! - y[1]! || x[2]! - y[2]!);
    const top = versions.at(-1);
    return top ? `${top[0]}.${top[1]}` : "*";
  } catch { return "*"; }
}

/** A new plain Rust program: the smallest one that builds and can be called. */
export async function createRustProject(name: string): Promise<Project> {
  if (!NAME.test(name)) throw new Error("a project name starts with a letter and uses small letters, digits, - and _");
  const dir = path.join(PROJECTS, name);
  if (fs.existsSync(dir)) throw new Error(`${name} already exists`);
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  const crate = name.replace(/-/g, "_");
  const dep = await newestCrate("solana-program");
  fs.writeFileSync(path.join(dir, "Cargo.toml"), `[package]
name = "${name}"
version = "0.1.0"
edition = "2021"

[lib]
name = "${crate}"
crate-type = ["cdylib", "lib"]

[dependencies]
solana-program = "${dep}"
`);
  fs.writeFileSync(path.join(dir, "src", "lib.rs"), `use solana_program::{
    account_info::AccountInfo, entrypoint, entrypoint::ProgramResult, msg, pubkey::Pubkey,
};

entrypoint!(process_instruction);

/// Every transaction that names this program arrives here.
pub fn process_instruction(program_id: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    msg!("gm from {}: {} accounts, {} bytes of data", program_id, accounts.len(), data.len());
    Ok(())
}
`);
  fs.writeFileSync(path.join(dir, ".gitignore"), "target/\n");
  return { name, path: dir, kind: "rust", programs: [] };
}

export type Action = "build" | "test" | "deploy" | "init";

/** The command for an action on a project, as the person would type it. */
export function projectCommand(action: Action, projectPath: string, extra: { program?: string; name?: string } = {}): { argv: string[]; cwd: string } {
  const url = cliConfig().rpcUrl;
  if (action === "init") {
    if (!NAME.test(extra.name ?? "")) throw new Error("a project name starts with a letter and uses small letters, digits, - and _");
    fs.mkdirSync(PROJECTS, { recursive: true });
    return { argv: ["anchor", "init", extra.name!], cwd: PROJECTS };
  }
  const dir = path.resolve(projectPath);
  if (path.dirname(dir) !== PROJECTS || !fs.existsSync(dir)) throw new Error("that is not a project of this list");
  const anchor = fs.existsSync(path.join(dir, "Anchor.toml"));
  if (action === "build") return { argv: anchor ? ["anchor", "build"] : ["cargo", "build-sbf"], cwd: dir };
  if (action === "test") return { argv: anchor ? ["anchor", "test", "--skip-local-validator", "--provider.cluster", url] : ["cargo", "test-sbf"], cwd: dir };
  // deploy
  if (anchor) return { argv: ["anchor", "deploy", "--provider.cluster", url], cwd: dir };
  const programs = built(dir);
  const p = programs.find((x) => x.name === extra.program) ?? programs[0];
  if (!p) throw new Error("nothing is built yet: build the project first");
  const keypair = path.join(dir, "target", "deploy", `${p.name}-keypair.json`);
  return { argv: ["solana", "program", "deploy", p.file, "--url", url, ...(fs.existsSync(keypair) ? ["--program-id", keypair] : [])], cwd: dir };
}
