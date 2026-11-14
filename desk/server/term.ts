// Terminals. Each one is a program running on its own pseudo-terminal (through the small
// solinux-pty helper). Terminals belong to the server, not to a browser tab: a page that
// reloads or reconnects finds them again, with what they printed last.

import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Writable } from "node:stream";
import type { Conn } from "./ws.ts";

const KEEP = 512 * 1024;          // bytes of output kept for a page that attaches later
const HIGH_WATER = 4 * 1024 * 1024; // a browser this far behind makes the program wait

export interface TermInfo { id: number; title: string; cols: number; rows: number; cwd: string; job: boolean; exited: number | null }

interface Term extends TermInfo {
  child: ChildProcess;
  control: Writable;
  kept: Buffer[];
  keptLen: number;
  viewers: Set<Conn>;
  paused: boolean;
}

const terms = new Map<number, Term>();
let nextId = 1;
let notify: (event: string, data: unknown) => void = () => {};

export function onTermEvent(fn: (event: string, data: unknown) => void): void { notify = fn; }

function helper(): string {
  const here = path.dirname(new URL(import.meta.url).pathname);
  for (const p of [process.env.SOLINUX_PTY, path.join(here, "..", "bin", "solinux-pty"), "/usr/lib/solinux/solinux-pty"]) {
    if (p && fs.existsSync(p)) return p;
  }
  throw new Error("the terminal helper solinux-pty was not found");
}

const info = (t: Term): TermInfo => ({ id: t.id, title: t.title, cols: t.cols, rows: t.rows, cwd: t.cwd, job: t.job, exited: t.exited });

export function listTerms(): TermInfo[] { return [...terms.values()].map(info); }

export interface OpenOptions { cols?: number; rows?: number; cwd?: string; argv?: string[]; title?: string; env?: Record<string, string> }

export function openTerm(o: OpenOptions): TermInfo {
  const cols = clamp(o.cols ?? 100, 2, 1000), rows = clamp(o.rows ?? 30, 2, 1000);
  let cwd = o.cwd && fs.existsSync(o.cwd) ? o.cwd : os.homedir();
  try { if (!fs.statSync(cwd).isDirectory()) cwd = os.homedir(); } catch { cwd = "/"; }
  const shell = process.env.SHELL && fs.existsSync(process.env.SHELL) ? process.env.SHELL : "/bin/bash";
  const job = !!o.argv?.length;
  const argv = job ? o.argv! : [shell, "-l"];
  const child = spawn(helper(), [String(cols), String(rows), ...argv], {
    cwd,
    env: { ...process.env, TERM: "xterm-256color", COLORTERM: "truecolor", LANG: process.env.LANG ?? "C.UTF-8", SOLINUX_DESK: "1", ...o.env },
    stdio: ["pipe", "pipe", "inherit", "pipe"],
  });
  const t: Term = {
    id: nextId++, title: o.title ?? (job ? argv.join(" ") : path.basename(shell)), cols, rows, cwd, job, exited: null,
    child, control: child.stdio[3] as Writable, kept: [], keptLen: 0, viewers: new Set(), paused: false,
  };
  terms.set(t.id, t);
  child.stdin!.on("error", () => {});
  t.control.on("error", () => {});

  child.stdout!.on("data", (chunk: Buffer) => {
    t.kept.push(chunk); t.keptLen += chunk.length;
    while (t.keptLen > KEEP && t.kept.length > 1) t.keptLen -= t.kept.shift()!.length;
    const frame = packet(t.id, chunk);
    let behind = false;
    for (const c of t.viewers) { c.sendBinary(frame); if (c.backlog > HIGH_WATER) behind = true; }
    if (behind && !t.paused) {
      // The browser cannot keep up (a program printing megabytes): let the program wait, not our memory grow.
      t.paused = true; child.stdout!.pause();
      const again = setInterval(() => {
        if ([...t.viewers].every((c) => c.closed || c.backlog < HIGH_WATER / 4)) { clearInterval(again); t.paused = false; child.stdout!.resume(); }
      }, 50);
    }
  });
  const ended = (code: number | null) => {
    if (t.exited !== null) return;
    t.exited = code ?? 1;
    notify("term.exit", { id: t.id, code: t.exited });
    // A shell that ended is forgotten. A job stays until someone has read what it printed.
    if (!t.job) terms.delete(t.id);
  };
  child.on("exit", (code, signal) => ended(code ?? (signal ? 128 : 1)));
  child.on("error", (e) => { t.kept.push(Buffer.from(`\r\n${e.message}\r\n`)); ended(127); });
  notify("term.open", info(t));
  return info(t);
}

function clamp(n: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, Math.floor(Number(n)) || lo)); }

function packet(id: number, data: Uint8Array): Buffer {
  const out = Buffer.allocUnsafe(4 + data.length);
  out.writeUInt32LE(id, 0);
  out.set(data, 4);
  return out;
}

/** Shows a terminal to a connection: first what it printed so far, then everything new. */
export function attachTerm(id: number, conn: Conn): TermInfo {
  const t = terms.get(id);
  if (!t) throw new Error("that terminal no longer exists");
  if (t.keptLen) conn.sendBinary(packet(id, Buffer.concat(t.kept)));
  t.viewers.add(conn);
  return info(t);
}

export function detachTerm(id: number, conn: Conn): void { terms.get(id)?.viewers.delete(conn); }
export function detachAll(conn: Conn): void { for (const t of terms.values()) t.viewers.delete(conn); }

export function inputTerm(id: number, data: Uint8Array): void {
  const t = terms.get(id);
  if (t && t.exited === null) t.child.stdin!.write(data);
}

export function resizeTerm(id: number, cols: number, rows: number): void {
  const t = terms.get(id);
  if (!t || t.exited !== null) return;
  t.cols = clamp(cols, 2, 1000); t.rows = clamp(rows, 2, 1000);
  t.control.write(`${t.cols} ${t.rows}\n`);
}

export function renameTerm(id: number, title: string): void {
  const t = terms.get(id);
  if (t) { t.title = String(title).slice(0, 80); notify("term.open", info(t)); }
}

export function closeTerm(id: number): void {
  const t = terms.get(id);
  if (!t) return;
  terms.delete(id);
  if (t.exited === null) { t.child.stdin!.end(); setTimeout(() => t.child.kill("SIGKILL"), 2000).unref(); }
  notify("term.closed", { id });
}

export function closeAllTerms(): void { for (const id of [...terms.keys()]) closeTerm(id); }
