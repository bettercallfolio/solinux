#!/usr/bin/env node
// Solinux Desk: the graphical interface of a Solinux system, served to a browser.
//
//   solinux-desk [--port 7654] [--host 127.0.0.1] [--no-token] [--open]
//
// One small server: it hands out the page, and the page talks to it over a WebSocket.
// It runs as the user who started it; whoever holds the token can do what that user can.

import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { accept, type Conn } from "./ws.ts";
import { processes, sysInfo, sysStats } from "./sys.ts";
import * as term from "./term.ts";
import * as files from "./files.ts";
import * as sol from "./solana.ts";
import * as apps from "./apps.ts";
import * as packages from "./packages.ts";
import net from "node:net";

export const VERSION = "0.1.0";
const HERE = path.dirname(new URL(import.meta.url).pathname);
const WEB = path.join(HERE, "..", "web");

// ---------------------------------------------------------------- arguments

function option(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}
const flag = (name: string): boolean => process.argv.includes(`--${name}`);

if (flag("help") || flag("h")) {
  console.log(`Solinux Desk ${VERSION}: the graphical interface of this system, in a browser.

  solinux-desk [options]

  --port <number>   the port to listen on (default 7654)
  --host <address>  the address to listen on (default 127.0.0.1: this computer only)
  --no-token        do not ask for the access token (only sensible on 127.0.0.1)
  --help            this text

Open the address it prints. To use it from another computer, listen on 0.0.0.0 and keep
the token secret: whoever has it can do everything you can do on this system.`);
  process.exit(0);
}

const PORT = Number(option("port", process.env.SOLINUX_DESK_PORT ?? "7654"));
const HOST = option("host", process.env.SOLINUX_DESK_HOST ?? "127.0.0.1");
const TOKEN_FILE = path.join(os.homedir(), ".config", "solinux", "desk-token");

function loadToken(): string {
  if (flag("no-token")) return "";
  try {
    const t = fs.readFileSync(TOKEN_FILE, "utf8").trim();
    if (/^[0-9a-f]{32,}$/.test(t)) return t;
  } catch { /* first start */ }
  const t = crypto.randomBytes(24).toString("hex");
  fs.mkdirSync(path.dirname(TOKEN_FILE), { recursive: true, mode: 0o700 });
  fs.writeFileSync(TOKEN_FILE, t + "\n", { mode: 0o600 });
  return t;
}
const TOKEN = loadToken();

function tokenOk(given: unknown): boolean {
  if (!TOKEN) return true;
  if (typeof given !== "string" || given.length !== TOKEN.length) return false;
  return crypto.timingSafeEqual(Buffer.from(given), Buffer.from(TOKEN));
}

// ---------------------------------------------------------------- the methods the page can call

type Method = (p: any, conn: Conn) => unknown | Promise<unknown>;
const conns = new Set<Conn>();
const subs = new Map<Conn, Set<string>>();

function publish(topic: string, event: string, data: unknown): void {
  const text = JSON.stringify({ ev: event, d: data });
  for (const c of conns) if (subs.get(c)?.has(topic)) c.sendText(text);
}
function broadcast(event: string, data: unknown): void {
  const text = JSON.stringify({ ev: event, d: data });
  for (const c of conns) c.sendText(text);
}

term.onTermEvent(broadcast);
apps.onAppEvent(broadcast);

const methods: Record<string, Method> = {
  hello: async () => ({ version: VERSION, sys: sysInfo(), tools: await sol.tools(), token: !!TOKEN }),

  sub: (p, conn) => { subs.get(conn)!.add(String(p.topic)); pump(); return true; },
  unsub: (p, conn) => { subs.get(conn)!.delete(String(p.topic)); return true; },

  "sys.info": () => sysInfo(),
  "sys.processes": () => processes(40),

  "term.list": () => term.listTerms(),
  "term.open": (p) => term.openTerm({ cols: p.cols, rows: p.rows, cwd: p.cwd ? files.resolvePath(p.cwd) : undefined, argv: p.argv, title: p.title }),
  "term.attach": (p, conn) => term.attachTerm(Number(p.id), conn),
  "term.detach": (p, conn) => { term.detachTerm(Number(p.id), conn); return true; },
  "term.resize": (p) => { term.resizeTerm(Number(p.id), p.cols, p.rows); return true; },
  "term.rename": (p) => { term.renameTerm(Number(p.id), p.title); return true; },
  "term.close": (p) => { term.closeTerm(Number(p.id)); return true; },

  "fs.list": (p) => files.list(p.path),
  "fs.read": (p) => files.readText(p.path),
  "fs.write": (p) => files.writeText(p.path, String(p.text ?? ""), p.mtime),
  "fs.mkdir": (p) => files.makeDir(p.path),
  "fs.touch": (p) => files.makeFile(p.path),
  "fs.move": (p) => files.move(p.from, p.to),
  "fs.copy": (p) => files.copy(p.from, p.to),
  "fs.remove": (p) => { files.remove(p.path); return true; },

  "sol.tools": (p) => sol.tools(!!p?.fresh),
  "sol.config": () => ({ ...sol.cliConfig(), clusters: sol.CLUSTERS }),
  "sol.setConfig": (p) => sol.setCliConfig({ rpcUrl: p.rpcUrl, keypairPath: p.keypairPath }),
  "sol.keys": () => sol.keys(),
  "sol.createKey": (p) => sol.createKey(String(p.name ?? "")),
  "sol.setDefaultKey": (p) => sol.setDefaultKey(String(p.path)),
  "sol.retireKey": (p) => sol.retireKey(String(p.path)),

  "apps.list": (p) => ({ graphics: apps.graphics(), apps: apps.listApps(!!p?.fresh), sessions: apps.listSessions() }),
  "apps.launch": (p) => apps.launch({ app: p.app, command: p.command, name: p.name, width: p.width, height: p.height, scale: p.scale }),
  "apps.close": (p) => { apps.closeSession(Number(p.id), !!p.force); return true; },

  "pkg.list": () => packages.packages(),
  "pkg.command": (p) => packages.changeCommand(p.action, (p.names ?? []).map(String)),

  "chain.endpoints": () => sol.chainEndpoints(),
  "chain.addEndpoint": async (p) => { await sol.addChainEndpoint(String(p.url ?? "").trim()); return sol.chainEndpoints(); },
  "chain.removeEndpoint": async (p) => { await sol.removeChainEndpoint(Number(p.index)); return sol.chainEndpoints(); },

  "val.status": () => sol.validatorStatus(),
  "val.start": (p) => { const s = sol.startValidator(p ?? {}); broadcast("val.status", s); return s; },
  "val.stop": async () => { const s = await sol.stopValidator(); broadcast("val.status", s); return s; },
  "val.output": () => sol.validatorOutput(),
  "val.logFile": () => sol.validatorLogFile(),
};

// System numbers are measured once a second, and only while some page is looking.
let pumping: NodeJS.Timeout | null = null;
function pump(): void {
  if (pumping) return;
  const wanted = () => [...subs.values()].some((s) => s.has("sys"));
  if (!wanted()) return;
  sysStats();
  pumping = setInterval(() => {
    if (!wanted()) { clearInterval(pumping!); pumping = null; return; }
    publish("sys", "sys", sysStats());
  }, 1000);
}

function serve(conn: Conn): void {
  conns.add(conn);
  subs.set(conn, new Set());
  conn.onText = async (text) => {
    let msg: { id?: number; m?: string; p?: unknown };
    try { msg = JSON.parse(text); } catch { return; }
    const fn = typeof msg.m === "string" ? methods[msg.m] : undefined;
    if (!fn) { conn.sendJson({ id: msg.id, e: `the server has no method "${msg.m}"` }); return; }
    try {
      conn.sendJson({ id: msg.id, r: (await fn(msg.p ?? {}, conn)) ?? null });
    } catch (e) {
      conn.sendJson({ id: msg.id, e: e instanceof Error ? e.message : String(e) });
    }
  };
  // Binary messages are keystrokes: four bytes naming the terminal, then the bytes typed.
  conn.onBinary = (data) => { if (data.length > 4) term.inputTerm(data.readUInt32LE(0), data.subarray(4)); };
  conn.onClose = () => { conns.delete(conn); subs.delete(conn); term.detachAll(conn); };
}

// ---------------------------------------------------------------- HTTP

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".json": "application/json", ".png": "image/png",
  ".ico": "image/x-icon", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8",
};

/** The kinds of file the desktop shows itself, by the end of their name. Everything else is only ever downloaded. */
const SHOWN: Record<string, string> = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".avif": "image/avif",
  ".bmp": "image/bmp", ".ico": "image/x-icon", ".svg": "image/svg+xml",
  ".mp4": "video/mp4", ".m4v": "video/mp4", ".webm": "video/webm", ".mkv": "video/x-matroska", ".mov": "video/quicktime", ".ogv": "video/ogg",
  ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".oga": "audio/ogg", ".opus": "audio/ogg", ".wav": "audio/wav", ".flac": "audio/flac", ".m4a": "audio/mp4", ".aac": "audio/aac",
  ".pdf": "application/pdf",
};

function sendStatic(req: http.IncomingMessage, res: http.ServerResponse, urlPath: string): void {
  const rel = urlPath === "/" ? "index.html" : decodeURIComponent(urlPath.slice(1));
  const file = path.join(WEB, rel);
  if (!file.startsWith(WEB + path.sep) || rel.includes("\0")) { res.writeHead(403).end(); return; }
  let st: fs.Stats;
  try { st = fs.statSync(file); if (!st.isFile()) throw new Error("not a file"); } catch { res.writeHead(404, { "content-type": "text/plain" }).end("not found"); return; }
  const tag = `"${st.size}-${Math.floor(st.mtimeMs)}"`;
  const headers: Record<string, string> = {
    "content-type": TYPES[path.extname(file)] ?? "application/octet-stream",
    etag: tag, "cache-control": "no-cache", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer",
    "content-security-policy": "default-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data: blob:; media-src 'self' blob:; frame-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'self'",
  };
  if (req.headers["if-none-match"] === tag) { res.writeHead(304, headers).end(); return; }
  res.writeHead(200, { ...headers, "content-length": String(st.size) });
  fs.createReadStream(file).pipe(res);
}

function body(req: http.IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const parts: Buffer[] = [];
    let n = 0;
    req.on("data", (c: Buffer) => { n += c.length; if (n > limit) { reject(new Error("too large")); req.destroy(); } else parts.push(c); });
    req.on("end", () => resolve(Buffer.concat(parts)));
    req.on("error", reject);
  });
}

/** A page from another site must not be able to talk to this server through the visitor's browser. */
function sameSite(req: http.IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://desk");
  try {
    if (!url.pathname.startsWith("/api/")) {
      if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405).end(); return; }
      sendStatic(req, res, url.pathname);
      return;
    }
    if (url.pathname === "/api/ping") {
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ name: "solinux-desk", version: VERSION, token: !!TOKEN }));
      return;
    }
    if (!sameSite(req) || !tokenOk(req.headers["x-desk-token"] ?? url.searchParams.get("t"))) {
      res.writeHead(401, { "content-type": "application/json" }).end(JSON.stringify({ error: "the access token is missing or wrong" }));
      return;
    }
    if (url.pathname === "/api/icon" && req.method === "GET") {
      const file = apps.iconFile(url.searchParams.get("name") ?? "");
      if (!file) {
        // An application without a picture gets a plain one, so every icon address answers.
        res.writeHead(200, { "content-type": "image/svg+xml", "cache-control": "max-age=600" }).end('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#8b929a" stroke-width="1.5" stroke-linecap="round"><rect x="4" y="5" width="16" height="14" rx="2.5"/><path d="M4 9.500h16M7 7.300h.01M9.500 7.300h.01"/></svg>');
        return;
      }
      res.writeHead(200, { "content-type": file.endsWith(".svg") ? "image/svg+xml" : "image/png", "cache-control": "max-age=3600", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'" });
      fs.createReadStream(file).pipe(res);
      return;
    }
    if (url.pathname === "/api/rpc" && req.method === "POST") {
      const out = await sol.rpcForward(url.searchParams.get("c") ?? "config", (await body(req, 4 * 1024 * 1024)).toString("utf8"));
      res.writeHead(out.status, { "content-type": "application/json" }).end(out.body);
      return;
    }
    if (url.pathname === "/api/file" && req.method === "GET") {
      const file = files.resolvePath(url.searchParams.get("path") ?? "");
      const st = fs.statSync(file);
      if (!st.isFile()) throw new Error("that is not a file");
      // Shown inside the desktop (pictures, sound, video, PDF) or handed over as a download.
      const kind = url.searchParams.get("inline") === "1" ? SHOWN[path.extname(file).toLowerCase()] : undefined;
      const headers: Record<string, string> = {
        "content-type": kind ?? "application/octet-stream", "accept-ranges": "bytes", "x-content-type-options": "nosniff", "cache-control": "no-store",
        "content-disposition": `${kind ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(path.basename(file))}`,
      };
      // A picture made of markup (SVG) could carry a script: it is shown, but nothing in it may run.
      if (kind === "image/svg+xml") headers["content-security-policy"] = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
      const range = req.headers.range?.match(/^bytes=(\d*)-(\d*)$/);
      if (range && (range[1] || range[2])) {
        // Part of a file: how a player jumps to the middle of a long video.
        const start = range[1] ? Number(range[1]) : Math.max(0, st.size - Number(range[2]));
        const end = range[1] && range[2] ? Math.min(Number(range[2]), st.size - 1) : st.size - 1;
        if (start > end || start >= st.size) { res.writeHead(416, { "content-range": `bytes */${st.size}` }).end(); return; }
        res.writeHead(206, { ...headers, "content-range": `bytes ${start}-${end}/${st.size}`, "content-length": String(end - start + 1) });
        fs.createReadStream(file, { start, end }).pipe(res);
        return;
      }
      res.writeHead(200, { ...headers, "content-length": String(st.size) });
      fs.createReadStream(file).pipe(res);
      return;
    }
    if (url.pathname === "/api/file" && req.method === "PUT") {
      const file = files.resolvePath(url.searchParams.get("path") ?? "");
      if (fs.existsSync(file) && url.searchParams.get("replace") !== "1") throw new Error(`${path.basename(file)} already exists`);
      const tmp = `${file}.desk-${process.pid}.tmp`;
      const out = fs.createWriteStream(tmp);
      await new Promise<void>((resolve, reject) => { req.pipe(out); out.on("finish", () => resolve()); out.on("error", reject); req.on("error", reject); });
      fs.renameSync(tmp, file);
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ path: file }));
      return;
    }
    res.writeHead(404, { "content-type": "application/json" }).end(JSON.stringify({ error: "no such address" }));
  } catch (e) {
    if (!res.headersSent) res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
  }
});

/** Carries one application's display between its X server (a local TCP port) and the browser (a WebSocket). */
function bridge(req: http.IncomingMessage, socket: import("node:stream").Duplex, head: Buffer, id: number): void {
  const port = apps.sessionPort(id);
  if (!port) { socket.end("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n"); return; }
  const conn = accept(req, socket, head);
  if (!conn) return;
  const tcp = net.connect(port, "127.0.0.1");
  tcp.setNoDelay(true);
  (socket as net.Socket).setNoDelay?.(true);
  tcp.on("data", (chunk: Buffer) => {
    conn.sendBinary(chunk);
    // A browser that cannot keep up makes the display wait, instead of this server holding the pictures.
    if (conn.backlog > 8 * 1024 * 1024) { tcp.pause(); const t = setInterval(() => { if (conn.closed || conn.backlog < 1024 * 1024) { clearInterval(t); tcp.resume(); } }, 20); }
  });
  tcp.on("close", () => conn.close());
  tcp.on("error", () => conn.close());
  conn.onBinary = (data) => { tcp.write(data); };
  conn.onClose = () => tcp.destroy();
}

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url ?? "/", "http://desk");
  const vnc = url.pathname.match(/^\/vnc\/(\d+)$/);
  if ((url.pathname !== "/ws" && !vnc) || !sameSite(req) || !tokenOk(url.searchParams.get("t"))) {
    socket.end("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
    return;
  }
  if (vnc) { bridge(req, socket, head, Number(vnc[1])); return; }
  const conn = accept(req, socket, head);
  if (conn) serve(conn);
});

// Another program (or another Solinux machine on the same computer) may hold the port: the next
// free one is taken instead, unless a port was asked for by name.
let port = PORT;
const portGiven = process.argv.includes("--port") || !!process.env.SOLINUX_DESK_PORT;
const URL_FILE = path.join(os.homedir(), ".local", "state", "solinux", "desk.url");

server.on("error", (e: NodeJS.ErrnoException) => {
  if (e.code === "EADDRINUSE" && !portGiven && port < PORT + 20) { port++; server.listen(port, HOST); return; }
  console.error(e.code === "EADDRINUSE" ? `Port ${port} is already in use. Is the desktop already running? Try --port.` : `The desktop could not start: ${e.message}`);
  process.exit(1);
});

server.on("listening", () => {
  // --shown-host: the name to print when the address people open differs from where the server listens
  const shown = option("shown-host", HOST === "0.0.0.0" || HOST === "::" ? os.hostname() : HOST);
  const address = `http://${shown}:${port}/${TOKEN ? `#token=${TOKEN}` : ""}`;
  console.log(`Solinux Desk ${VERSION} is running. Open it here:\n\n  ${address}\n`);
  if (HOST !== "127.0.0.1" && HOST !== "localhost" && !TOKEN) console.log("Warning: anyone who can reach this address controls this system. Use the token.");
  // Where the desktop is, for whoever asks later (a new shell prints it).
  try { fs.mkdirSync(path.dirname(URL_FILE), { recursive: true }); fs.writeFileSync(URL_FILE, address + "\n", { mode: 0o600 }); } catch { /* a read-only home: the line above was the only notice */ }
});
server.listen(port, HOST);

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => { term.closeAllTerms(); apps.closeAllSessions(); try { fs.unlinkSync(URL_FILE); } catch { /* was never written */ } server.close(); setTimeout(() => process.exit(0), 200).unref(); });
}
