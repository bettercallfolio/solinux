// The file manager's side on the system: list, read, write, move, remove.
// The desk runs as the user who started it and can do what that user can do; nothing more.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEXT_LIMIT = 2 * 1024 * 1024;

/** "~" and relative paths, as a person would type them, to an absolute path. */
export function resolvePath(p: string): string {
  let s = String(p ?? "").trim() || "~";
  if (s === "~" || s.startsWith("~/")) s = path.join(os.homedir(), s.slice(1));
  return path.resolve(os.homedir(), s);
}

export interface Entry { name: string; type: "dir" | "file" | "link" | "other"; size: number; mtime: number; mode: number; target?: string; dir?: boolean }

export function list(dir: string): { path: string; parent: string | null; entries: Entry[] } {
  const abs = resolvePath(dir);
  const entries: Entry[] = [];
  for (const d of fs.readdirSync(abs, { withFileTypes: true })) {
    const full = path.join(abs, d.name);
    let st: fs.Stats;
    try { st = fs.lstatSync(full); } catch { continue; }
    const e: Entry = {
      name: d.name,
      type: st.isDirectory() ? "dir" : st.isSymbolicLink() ? "link" : st.isFile() ? "file" : "other",
      size: st.size, mtime: st.mtimeMs, mode: st.mode & 0o7777,
    };
    if (e.type === "link") {
      try { e.target = fs.readlinkSync(full); e.dir = fs.statSync(full).isDirectory(); } catch { /* a link to nothing */ }
    }
    entries.push(e);
  }
  const isDir = (e: Entry) => e.type === "dir" || e.dir === true;
  entries.sort((a, b) => Number(isDir(b)) - Number(isDir(a)) || a.name.localeCompare(b.name, undefined, { numeric: true }));
  return { path: abs, parent: abs === "/" ? null : path.dirname(abs), entries };
}

export function readText(file: string): { path: string; size: number; mtime: number; text?: string; binary?: boolean; tooBig?: boolean } {
  const abs = resolvePath(file);
  const st = fs.statSync(abs);
  if (!st.isFile()) throw new Error("that is not a file");
  const head = { path: abs, size: st.size, mtime: st.mtimeMs };
  if (st.size > TEXT_LIMIT) return { ...head, tooBig: true };
  const data = fs.readFileSync(abs);
  if (data.subarray(0, 8192).includes(0)) return { ...head, binary: true };
  return { ...head, text: data.toString("utf8") };
}

/** Writes a text file in one step: readers see the old content or the new one, never half. */
export function writeText(file: string, text: string, expectMtime?: number): { path: string; mtime: number } {
  const abs = resolvePath(file);
  let mode = 0o644;
  try {
    const st = fs.statSync(abs);
    mode = st.mode & 0o7777;
    if (expectMtime !== undefined && Math.abs(st.mtimeMs - expectMtime) > 1) throw new Error("the file changed on disk since it was opened");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  const tmp = `${abs}.desk-${process.pid}.tmp`;
  fs.writeFileSync(tmp, text, { mode });
  fs.renameSync(tmp, abs);
  return { path: abs, mtime: fs.statSync(abs).mtimeMs };
}

export function makeDir(dir: string): { path: string } {
  const abs = resolvePath(dir);
  fs.mkdirSync(abs, { recursive: false });
  return { path: abs };
}

export function makeFile(file: string): { path: string } {
  const abs = resolvePath(file);
  fs.closeSync(fs.openSync(abs, "wx"));
  return { path: abs };
}

export function move(from: string, to: string): { path: string } {
  const a = resolvePath(from), b = resolvePath(to);
  if (fs.existsSync(b)) throw new Error(`${path.basename(b)} already exists`);
  fs.renameSync(a, b);
  return { path: b };
}

export function copy(from: string, to: string): { path: string } {
  const a = resolvePath(from), b = resolvePath(to);
  if (fs.existsSync(b)) throw new Error(`${path.basename(b)} already exists`);
  fs.cpSync(a, b, { recursive: true, verbatimSymlinks: true });
  return { path: b };
}

export function remove(target: string): void {
  const abs = resolvePath(target);
  // Never the root of the system or the whole home directory by one click.
  if (abs === "/" || abs === os.homedir() || path.dirname(abs) === "/") throw new Error(`${abs} is not removed from here; use a terminal if you mean it`);
  fs.rmSync(abs, { recursive: true });
}
