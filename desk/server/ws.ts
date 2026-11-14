// A small WebSocket server side (RFC 6455): enough for one browser page talking to one
// local server. Text frames carry JSON, binary frames carry terminal bytes.

import crypto from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const MAX_MESSAGE = 32 * 1024 * 1024;

export class Conn {
  socket: Duplex;
  onText: (text: string) => void = () => {};
  onBinary: (data: Buffer) => void = () => {};
  onClose: () => void = () => {};
  closed = false;
  #buf: Buffer = Buffer.alloc(0);
  #parts: Buffer[] = [];
  #partsOp = 0;
  #partsLen = 0;

  constructor(socket: Duplex) {
    this.socket = socket;
    socket.on("data", (chunk: Buffer) => this.#feed(chunk));
    socket.on("close", () => this.#end());
    socket.on("error", () => this.#end());
  }

  /** Bytes accepted but not yet written to the network. */
  get backlog(): number { return this.socket.writableLength; }

  sendText(text: string): void { this.#frame(0x1, Buffer.from(text, "utf8")); }
  sendBinary(data: Uint8Array): void { this.#frame(0x2, data); }
  sendJson(value: unknown): void { this.sendText(JSON.stringify(value)); }

  close(code = 1000): void {
    if (this.closed) return;
    const body = Buffer.alloc(2);
    body.writeUInt16BE(code, 0);
    this.#frame(0x8, body);
    this.socket.end();
    this.#end();
  }

  #end(): void {
    if (this.closed) return;
    this.closed = true;
    this.socket.destroy();
    this.onClose();
  }

  #frame(op: number, payload: Uint8Array): void {
    if (this.closed) return;
    const n = payload.length;
    let head: Buffer;
    if (n < 126) { head = Buffer.alloc(2); head[1] = n; }
    else if (n < 65536) { head = Buffer.alloc(4); head[1] = 126; head.writeUInt16BE(n, 2); }
    else { head = Buffer.alloc(10); head[1] = 127; head.writeBigUInt64BE(BigInt(n), 2); }
    head[0] = 0x80 | op;
    this.socket.write(head);
    this.socket.write(payload);
  }

  #feed(chunk: Buffer): void {
    this.#buf = this.#buf.length ? Buffer.concat([this.#buf, chunk]) : chunk;
    for (;;) {
      const b = this.#buf;
      if (b.length < 2) return;
      const fin = (b[0]! & 0x80) !== 0;
      const op = b[0]! & 0x0f;
      const masked = (b[1]! & 0x80) !== 0;
      let len = b[1]! & 0x7f;
      let at = 2;
      if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); at = 4; }
      else if (len === 127) {
        if (b.length < 10) return;
        const big = b.readBigUInt64BE(2);
        if (big > BigInt(MAX_MESSAGE)) { this.close(1009); return; }
        len = Number(big); at = 10;
      }
      // A browser always masks what it sends; anything else is not a browser.
      if (!masked || len > MAX_MESSAGE) { this.close(1002); return; }
      if (b.length < at + 4 + len) return;
      const mask = b.subarray(at, at + 4);
      const data = Buffer.allocUnsafe(len);
      for (let i = 0; i < len; i++) data[i] = b[at + 4 + i]! ^ mask[i & 3]!;
      this.#buf = b.subarray(at + 4 + len);

      if (op === 0x8) { this.close(); return; }
      if (op === 0x9) { this.#frame(0xa, data); continue; }
      if (op === 0xa) continue;
      if (op === 0x1 || op === 0x2) { this.#parts = [data]; this.#partsOp = op; this.#partsLen = len; }
      else if (op === 0x0 && this.#partsOp) {
        this.#parts.push(data); this.#partsLen += len;
        if (this.#partsLen > MAX_MESSAGE) { this.close(1009); return; }
      } else { this.close(1002); return; }
      if (!fin) continue;
      const whole = this.#parts.length === 1 ? this.#parts[0]! : Buffer.concat(this.#parts);
      const kind = this.#partsOp;
      this.#parts = []; this.#partsOp = 0; this.#partsLen = 0;
      try {
        if (kind === 0x1) this.onText(whole.toString("utf8")); else this.onBinary(whole);
      } catch (e) {
        console.error("desk: a message handler failed:", e);
      }
    }
  }
}

/** Answers a WebSocket upgrade request. Returns null (and closes the socket) when it is not one. */
export function accept(req: IncomingMessage, socket: Duplex, head: Buffer): Conn | null {
  const key = req.headers["sec-websocket-key"];
  if (req.headers.upgrade?.toLowerCase() !== "websocket" || typeof key !== "string") {
    socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
    return null;
  }
  const answer = crypto.createHash("sha1").update(key + GUID).digest("base64");
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${answer}\r\n\r\n`);
  const conn = new Conn(socket);
  if (head.length) socket.emit("data", head);
  return conn;
}
