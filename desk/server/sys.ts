// What the computer is and how busy it is, read from /proc and friends.

import fs from "node:fs";
import os from "node:os";

const read = (file: string): string => { try { return fs.readFileSync(file, "utf8"); } catch { return ""; } };

export interface SysInfo {
  name: string; version: string; hostname: string; kernel: string; arch: string;
  cpu: string; cores: number; memory: number; user: string; home: string; booted: boolean; machine: string;
}

/** Facts that do not change while the system runs. */
export function sysInfo(): SysInfo {
  const release: Record<string, string> = {};
  for (const line of read("/etc/os-release").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) release[m[1]!] = m[2]!.replace(/^"|"$/g, "");
  }
  const cpu = read("/proc/cpuinfo").match(/^model name\s*:\s*(.+)$/m)?.[1] ?? os.cpus()[0]?.model ?? "unknown";
  // A chainboot machine shares the kernel of the computer it runs on; a booted system has its own.
  const first = read("/proc/1/comm").trim();
  return {
    name: release.NAME ?? "Linux",
    version: release.VERSION_ID ?? release.VERSION ?? "",
    hostname: os.hostname(),
    kernel: os.release(),
    arch: os.arch(),
    cpu: cpu.replace(/\s+/g, " "),
    cores: os.cpus().length,
    memory: os.totalmem(),
    user: os.userInfo().username,
    home: os.homedir(),
    booted: first === "systemd" || first === "init",
    machine: process.env.container ?? "",
  };
}

export interface SysStats {
  t: number; cpu: number; cores: number[]; load: number[];
  mem: { total: number; used: number; cached: number; swapTotal: number; swapUsed: number };
  disk: { total: number; used: number };
  net: { rx: number; tx: number };
  uptime: number; procs: number;
}

interface CpuTimes { idle: number; total: number }
let lastCpu: CpuTimes[] = [];
let lastNet = { rx: 0, tx: 0, t: 0 };

function cpuTimes(): CpuTimes[] {
  const out: CpuTimes[] = [];
  for (const line of read("/proc/stat").split("\n")) {
    if (!line.startsWith("cpu")) break;
    const n = line.trim().split(/\s+/).slice(1).map(Number);
    const idle = (n[3] ?? 0) + (n[4] ?? 0);
    out.push({ idle, total: n.slice(0, 8).reduce((a, b) => a + b, 0) });
  }
  return out;
}

/** How busy the computer is right now. CPU and network are measured since the previous call. */
export function sysStats(): SysStats {
  const now = cpuTimes();
  const use = now.map((c, i) => {
    const p = lastCpu[i];
    if (!p || c.total === p.total) return 0;
    return Math.max(0, Math.min(1, 1 - (c.idle - p.idle) / (c.total - p.total)));
  });
  lastCpu = now;

  const mem: Record<string, number> = {};
  for (const line of read("/proc/meminfo").split("\n")) {
    const m = line.match(/^(\w+):\s+(\d+)/);
    if (m) mem[m[1]!] = Number(m[2]) * 1024;
  }
  const total = mem.MemTotal ?? 0;
  const available = mem.MemAvailable ?? mem.MemFree ?? 0;

  let rx = 0, tx = 0;
  for (const line of read("/proc/net/dev").split("\n").slice(2)) {
    const [name, rest] = line.split(":");
    if (!rest || name!.trim() === "lo") continue;
    const n = rest.trim().split(/\s+/).map(Number);
    rx += n[0] ?? 0; tx += n[8] ?? 0;
  }
  const t = Date.now();
  const dt = lastNet.t ? (t - lastNet.t) / 1000 : 0;
  const net = dt > 0 ? { rx: Math.max(0, (rx - lastNet.rx) / dt), tx: Math.max(0, (tx - lastNet.tx) / dt) } : { rx: 0, tx: 0 };
  lastNet = { rx, tx, t };

  let disk = { total: 0, used: 0 };
  try {
    const s = fs.statfsSync("/");
    disk = { total: s.blocks * s.bsize, used: (s.blocks - s.bavail) * s.bsize };
  } catch { /* a file system that cannot be asked */ }

  const load = read("/proc/loadavg").split(" ");
  return {
    t,
    cpu: use[0] ?? 0,
    cores: use.slice(1),
    load: load.slice(0, 3).map(Number),
    mem: {
      total, used: total - available, cached: (mem.Cached ?? 0) + (mem.Buffers ?? 0),
      swapTotal: mem.SwapTotal ?? 0, swapUsed: (mem.SwapTotal ?? 0) - (mem.SwapFree ?? 0),
    },
    disk, net,
    uptime: Number(read("/proc/uptime").split(" ")[0] ?? 0),
    procs: Number(load[3]?.split("/")[1] ?? 0),
  };
}

export interface Proc { pid: number; name: string; cpu: number; mem: number; user: number; cmd: string }
let lastProc = new Map<number, number>();
let lastProcT = 0;

/** The busiest processes. CPU is measured since the previous call. */
export function processes(limit = 30): Proc[] {
  const hz = 100, page = 4096;
  const t = Date.now();
  const dt = lastProcT ? (t - lastProcT) / 1000 : 0;
  const seen = new Map<number, number>();
  const out: Proc[] = [];
  let dirs: string[] = [];
  try { dirs = fs.readdirSync("/proc"); } catch { return []; }
  for (const d of dirs) {
    if (!/^\d+$/.test(d)) continue;
    const pid = Number(d);
    const stat = read(`/proc/${d}/stat`);
    const close = stat.lastIndexOf(")");
    if (close < 0) continue;
    const name = stat.slice(stat.indexOf("(") + 1, close);
    const f = stat.slice(close + 2).split(" ");
    const ticks = Number(f[11]) + Number(f[12]);
    const rss = Number(f[21]) * page;
    seen.set(pid, ticks);
    const before = lastProc.get(pid);
    const cpu = dt > 0 && before !== undefined ? (ticks - before) / hz / dt : 0;
    let user = 0;
    try { user = fs.statSync(`/proc/${d}`).uid; } catch { /* gone */ }
    const cmd = read(`/proc/${d}/cmdline`).replace(/\0/g, " ").trim();
    out.push({ pid, name, cpu, mem: rss, user, cmd: cmd || `[${name}]` });
  }
  lastProc = seen; lastProcT = t;
  out.sort((a, b) => b.cpu - a.cpu || b.mem - a.mem);
  return out.slice(0, limit);
}
