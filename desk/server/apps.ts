// Graphical applications. The desk finds the applications installed on the system (their
// .desktop files) and runs each one on a private X display of its own (Xvnc), with a tiny
// window manager that makes the application fill it. The browser shows that display inside
// one of the desktop's windows. Nothing is emulated: the program runs natively, only its
// picture travels.

import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface App { id: string; name: string; comment: string; icon: string; exec: string; categories: string[]; terminal: boolean; file: string;
  /** The kinds of file it says it opens (MIME types), and whether its command takes a file at all. */
  mime: string[]; opensFiles: boolean }
export interface Session { id: number; app: string; name: string; icon: string; title: string; width: number; height: number; started: number; windows: number;
  /** How many pixels of the display one unit of the browser window gets (2 on a high-density screen). */
  scale: number }

interface Running extends Session { xvnc: ChildProcess; wm: ChildProcess | null; child: ChildProcess | null; ended: boolean; childGone: boolean; everHadWindow: boolean;
  /** True once someone asked for it to close. */
  asked: boolean }

const HERE = path.dirname(new URL(import.meta.url).pathname);
const APP_DIRS = [path.join(os.homedir(), ".local/share/applications"), "/usr/local/share/applications", "/usr/share/applications"];
const sessions = new Map<number, Running>();
let notify: (event: string, data: unknown) => void = () => {};
export function onAppEvent(fn: (event: string, data: unknown) => void): void { notify = fn; }

function which(cmd: string): string | null {
  if (cmd.includes("/")) return fs.existsSync(cmd) ? cmd : null;
  for (const dir of (process.env.PATH ?? "").split(":")) {
    const p = path.join(dir, cmd);
    try { fs.accessSync(p, fs.constants.X_OK); return p; } catch { /* not here */ }
  }
  return null;
}

function helper(name: string): string | null {
  for (const p of [path.join(HERE, "..", "bin", name), `/usr/lib/solinux/${name}`]) if (fs.existsSync(p)) return p;
  return which(name);
}

/** Whether this system can show graphical applications at all, and if not, what is missing. */
export function graphics(): { ready: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!which("Xvnc")) missing.push("Xvnc (the display server)");
  if (!helper("solinux-wm")) missing.push("solinux-wm");
  return { ready: missing.length === 0, missing };
}

// ---------------------------------------------------------------- installed applications

function parseDesktop(file: string): App | null {
  let text: string;
  try { text = fs.readFileSync(file, "utf8"); } catch { return null; }
  const entry: Record<string, string> = {};
  let inside = false;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("[")) { inside = line === "[Desktop Entry]"; continue; }
    if (!inside || !line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq > 0) entry[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  if (entry.Type !== "Application" || !entry.Exec || !entry.Name) return null;
  if (entry.NoDisplay === "true" || entry.Hidden === "true") return null;
  if (entry.TryExec && !which(entry.TryExec)) return null;
  if (entry.OnlyShowIn) return null;   // made for one particular desktop environment
  return {
    id: path.basename(file, ".desktop"), name: entry.Name, comment: entry.Comment ?? entry.GenericName ?? "",
    icon: entry.Icon ?? "", exec: entry.Exec, categories: (entry.Categories ?? "").split(";").filter(Boolean),
    terminal: entry.Terminal === "true", file,
    mime: (entry.MimeType ?? "").split(";").filter(Boolean), opensFiles: /%[fFuU]/.test(entry.Exec),
  };
}

let appCache: { at: number; apps: App[] } | null = null;

export function listApps(fresh = false): App[] {
  if (!fresh && appCache && Date.now() - appCache.at < 5000) return appCache.apps;
  const seen = new Map<string, App>();
  for (const dir of APP_DIRS) {
    let names: string[] = [];
    try { names = fs.readdirSync(dir); } catch { continue; }
    for (const n of names) {
      if (!n.endsWith(".desktop")) continue;
      const app = parseDesktop(path.join(dir, n));
      if (app && !seen.has(app.id)) seen.set(app.id, app);   // a user's own entry wins over the system's
    }
  }
  const apps = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  appCache = { at: Date.now(), apps };
  return apps;
}

const iconCache = new Map<string, string | null>();
const ICON_SIZES = ["scalable", "256x256", "128x128", "96x96", "64x64", "48x48", "32x32", "24x24", "22x22", "16x16"];

/** The picture file for an icon name of a .desktop file, or null. */
export function iconFile(name: string): string | null {
  if (!name || name.includes("\0")) return null;
  if (iconCache.has(name)) return iconCache.get(name)!;
  let found: string | null = null;
  const ok = (p: string) => /\.(svg|png)$/i.test(p) && fs.existsSync(p);
  if (name.startsWith("/")) found = ok(name) ? name : null;
  else {
    const roots = [path.join(os.homedir(), ".local/share/icons"), "/usr/local/share/icons", "/usr/share/icons"];
    const themes = ["hicolor", "Adwaita", "Yaru", "breeze", "gnome", "Humanity", "elementary"];
    search:
    for (const root of roots) for (const theme of themes) for (const size of ICON_SIZES) for (const group of ["apps", "categories", "devices", "places"]) for (const ext of ["svg", "png"]) {
      // themes arrange their folders as size/group or group/size
      for (const p of [path.join(root, theme, size, group, `${name}.${ext}`), path.join(root, theme, group, size.split("x")[0]!, `${name}.${ext}`)]) {
        if (ok(p)) { found = p; break search; }
      }
    }
    if (!found) for (const ext of ["svg", "png"]) { const p = `/usr/share/pixmaps/${name}.${ext}`; if (ok(p)) { found = p; break; } }
    if (!found && ok(`/usr/share/pixmaps/${name}`)) found = `/usr/share/pixmaps/${name}`;
  }
  iconCache.set(name, found);
  return found;
}

// ---------------------------------------------------------------- running them

const publicView = (s: Running): Session => ({ id: s.id, app: s.app, name: s.name, icon: s.icon, title: s.title, width: s.width, height: s.height, started: s.started, windows: s.windows, scale: s.scale });
export function listSessions(): Session[] { return [...sessions.values()].filter((s) => !s.ended).map(publicView); }
export function sessionPort(id: number): number | null { const s = sessions.get(id); return s && !s.ended ? 5900 + id : null; }

function freeDisplay(): number {
  for (let n = 20; n < 100; n++) {
    if (sessions.has(n) || fs.existsSync(`/tmp/.X11-unix/X${n}`) || fs.existsSync(`/tmp/.X${n}-lock`)) continue;
    return n;
  }
  throw new Error("too many graphical applications are open");
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const quote = (text: string) => `'${text.replace(/'/g, `'\\''`)}'`;

/**
 * The command of a .desktop file without its placeholders (%f, %U, …). With a file: the file
 * stands where the command wants one (or at the end, for a command that names no place).
 */
function command(exec: string, file?: string): string {
  let placed = false;
  const out = exec.replace(/%%/g, "\u0000").replace(/\s*%([a-zA-Z])/g, (_all, letter: string) => {
    if (file && !placed && "fFuU".includes(letter)) { placed = true; return ` ${quote(file)}`; }
    return "";
  }).replace(/\u0000/g, "%").trim();
  return file && !placed ? `${out} ${quote(file)}` : out;
}

export interface LaunchOptions { app?: string; command?: string; name?: string; width?: number; height?: number; scale?: number;
  /** A file for the application to open. */
  file?: string }

export async function launch(o: LaunchOptions): Promise<Session> {
  const g = graphics();
  if (!g.ready) throw new Error(`this system cannot show graphical applications yet: ${g.missing.join(", ")} missing`);
  const app = o.app ? listApps().find((a) => a.id === o.app) : null;
  if (o.app && !app) throw new Error(`no application "${o.app}" is installed`);
  let file: string | undefined;
  if (o.file !== undefined) {
    file = path.resolve(String(o.file));
    if (!app) throw new Error("say which application opens the file");
    if (!fs.existsSync(file)) throw new Error(`${file} does not exist`);
  }
  const cmd = app ? command(app.exec, file) : String(o.command ?? "").trim();
  if (!cmd) throw new Error("nothing to run");
  // On a high-density screen the application draws with more pixels (sharp text), not on a bigger area.
  const scale = Math.max(1, Math.min(3, Math.round((Number(o.scale) || 1) * 4) / 4));
  const width = Math.max(320, Math.min(7680, Math.floor((o.width ?? 1000) * scale))), height = Math.max(240, Math.min(4320, Math.floor((o.height ?? 700) * scale)));
  const id = freeDisplay();
  const display = `:${id}`;

  const xvnc = spawn("Xvnc", [display, "-geometry", `${width}x${height}`, "-depth", "24", "-dpi", String(Math.round(96 * scale)), "-SecurityTypes", "None", "-localhost",
    "-rfbport", String(5900 + id), "-AlwaysShared", "-AcceptSetDesktopSize", "-desktop", app?.name ?? o.name ?? cmd, "-nolisten", "tcp", "-FrameRate", "60"],
  { stdio: ["ignore", "ignore", "ignore"] });
  const s: Running = {
    id, app: app?.id ?? "", name: app?.name ?? o.name ?? cmd.split(/\s+/)[0]!, icon: app?.icon ?? "", title: app?.name ?? o.name ?? cmd,
    width, height, started: Date.now(), windows: 0, scale, xvnc, wm: null, child: null, ended: false, childGone: false, everHadWindow: false, asked: false,
  };
  sessions.set(id, s);
  xvnc.on("exit", () => end(s));
  xvnc.on("error", () => end(s));

  // The display is there when its socket is. Usually within a moment; on a machine whose files
  // are fetched from the chain as they are read, the first one of a session can take much longer.
  for (let i = 0; i < 1200 && !fs.existsSync(`/tmp/.X11-unix/X${id}`); i++) { if (s.ended) break; await wait(50); }
  if (s.ended || !fs.existsSync(`/tmp/.X11-unix/X${id}`)) { s.asked = true; end(s); throw new Error("the display for the application could not be started"); }

  const runtime = process.env.XDG_RUNTIME_DIR && fs.existsSync(process.env.XDG_RUNTIME_DIR) ? process.env.XDG_RUNTIME_DIR : fs.mkdtempSync(path.join(os.tmpdir(), "solinux-run-"));
  const env: NodeJS.ProcessEnv = { ...process.env, DISPLAY: display, GDK_BACKEND: "x11", QT_QPA_PLATFORM: "xcb", XDG_SESSION_TYPE: "x11", NO_AT_BRIDGE: "1", XDG_RUNTIME_DIR: runtime };
  delete env.WAYLAND_DISPLAY;
  if (scale >= 2) { env.GDK_SCALE = String(Math.floor(scale)); env.QT_SCALE_FACTOR = String(scale); env.XCURSOR_SIZE = String(24 * Math.floor(scale)); }

  const wm = spawn(helper("solinux-wm")!, [], { env, stdio: ["ignore", "pipe", "ignore"] });
  s.wm = wm;
  let pending = "";
  wm.stdout!.on("data", (chunk: Buffer) => {
    pending += chunk.toString("utf8");
    let nl: number;
    while ((nl = pending.indexOf("\n")) >= 0) {
      const line = pending.slice(0, nl); pending = pending.slice(nl + 1);
      if (line.startsWith("title ")) { s.title = line.slice(6) || s.name; notify("app.session", publicView(s)); }
      else if (line.startsWith("windows ")) {
        s.windows = Number(line.slice(8)) || 0;
        if (s.windows > 0) s.everHadWindow = true;
        notify("app.session", publicView(s));
        maybeEnd(s);
      }
    }
  });
  wm.on("exit", () => end(s));
  await wait(120);

  // A session bus, where the system has one to give: many applications expect it.
  const wrapped = which("dbus-run-session") ? `exec dbus-run-session -- ${cmd}` : `exec ${cmd}`;
  const child = spawn("sh", ["-c", wrapped], { env, cwd: os.homedir(), stdio: ["ignore", "ignore", "ignore"], detached: true });
  s.child = child;
  child.on("exit", () => { s.childGone = true; setTimeout(() => maybeEnd(s), 1500); });
  child.on("error", () => { s.childGone = true; maybeEnd(s); });
  notify("app.session", publicView(s));
  return publicView(s);
}

/** A session is over when its program has ended and no window of it is left. */
function maybeEnd(s: Running): void {
  if (s.ended) return;
  if (s.childGone && s.windows === 0) end(s);
  // A program that hands over to another process (and exits itself) keeps its windows: wait for those.
  else if (!s.childGone && s.everHadWindow && s.windows === 0) setTimeout(() => { if (!s.ended && s.windows === 0 && s.childGone) end(s); }, 3000);
}

function end(s: Running): void {
  if (s.ended) return;
  s.ended = true;
  sessions.delete(s.id);
  try { if (s.child?.pid) process.kill(-s.child.pid, "SIGTERM"); } catch { /* already gone */ }
  s.wm?.kill("SIGTERM");
  s.xvnc.kill("SIGTERM");
  setTimeout(() => { try { if (s.child?.pid) process.kill(-s.child.pid, "SIGKILL"); } catch { /* gone */ } s.xvnc.kill("SIGKILL"); }, 3000).unref();
  // (an application that ended at once without ever showing a window: the desktop says so)
  notify("app.closed", { id: s.id, name: s.name, silent: s.everHadWindow || s.asked });
}

/** Asks the application to close, the way clicking a window's close button does. It may answer with a question. */
export function closeSession(id: number, force = false): void {
  const s = sessions.get(id);
  if (!s) return;
  s.asked = true;
  if (force || s.windows === 0) { end(s); return; }
  spawn(helper("solinux-wm")!, ["--close"], { env: { ...process.env, DISPLAY: `:${id}` }, stdio: "ignore" });
}

export function closeAllSessions(): void { for (const s of [...sessions.values()]) end(s); }
