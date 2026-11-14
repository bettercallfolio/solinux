// src/solana/keys.ts
import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto";
import fs from "node:fs";

// src/util/base58.ts
var ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
var INDEX = new Int8Array(128).fill(-1);
for (let i = 0; i < ALPHABET.length; i++) INDEX[ALPHABET.charCodeAt(i)] = i;
function b58encode(bytes) {
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  const digits = [];
  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = carry / 58 | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = carry / 58 | 0;
    }
  }
  let out = "1".repeat(zeros);
  for (let i = digits.length - 1; i >= 0; i--) out += ALPHABET[digits[i]];
  return out;
}
function b58decode(text) {
  let zeros = 0;
  while (zeros < text.length && text[zeros] === "1") zeros++;
  const bytes = [];
  for (let i = zeros; i < text.length; i++) {
    const code = text.charCodeAt(i);
    let carry = code < 128 ? INDEX[code] : -1;
    if (carry < 0) throw new Error(`invalid base58 character "${text[i]}"`);
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 255;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 255);
      carry >>= 8;
    }
  }
  const out = Buffer.alloc(zeros + bytes.length);
  for (let i = 0; i < bytes.length; i++) out[zeros + bytes.length - 1 - i] = bytes[i];
  return out;
}
function b58decodeFixed(text, len, what = "value") {
  if (typeof text !== "string" || text.length > Math.ceil(len * 1.38) + 1) throw new Error(`${what} must be ${len} bytes`);
  const b = b58decode(text);
  if (b.length !== len) throw new Error(`${what} must be ${len} bytes, got ${b.length}`);
  return b;
}

// src/solana/keys.ts
var PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");
var SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
var Keypair = class _Keypair {
  seed;
  publicKey;
  #key;
  constructor(seed) {
    if (seed.length !== 32) throw new Error("ed25519 seed must be 32 bytes");
    this.seed = Buffer.from(seed);
    this.#key = createPrivateKey({ key: Buffer.concat([PKCS8_PREFIX, this.seed]), format: "der", type: "pkcs8" });
    this.publicKey = Buffer.from(createPublicKey(this.#key).export({ format: "der", type: "spki" }).subarray(-32));
  }
  static fromSeed(seed) {
    return new _Keypair(seed);
  }
  /** 64-byte Solana secret key: 32-byte seed followed by the 32-byte public key. */
  static fromSecretKey(secret) {
    if (secret.length !== 64) throw new Error("secret key must be 64 bytes");
    const kp = new _Keypair(secret.subarray(0, 32));
    if (!kp.publicKey.equals(Buffer.from(secret.subarray(32)))) throw new Error("secret key is corrupt: public half does not match");
    return kp;
  }
  /** Reads the JSON array format written by `solana-keygen`. */
  static fromFile(path9) {
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(path9, "utf8"));
    } catch (e) {
      throw new Error(`cannot read keypair file ${path9}: ${e.message}`);
    }
    if (!Array.isArray(parsed) || parsed.length !== 64 || !parsed.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
      throw new Error(`${path9} is not a Solana keypair file (expected a JSON array of 64 numbers)`);
    }
    return _Keypair.fromSecretKey(Uint8Array.from(parsed));
  }
  static generate() {
    const { privateKey } = generateKeyPairSync("ed25519");
    return new _Keypair(privateKey.export({ format: "der", type: "pkcs8" }).subarray(-32));
  }
  get address() {
    return b58encode(this.publicKey);
  }
  secretKey() {
    return Buffer.concat([this.seed, this.publicKey]);
  }
  sign(message) {
    return sign(null, message, this.#key);
  }
};
var spkiCache = /* @__PURE__ */ new Map();
function verifySignature(publicKey, message, signature) {
  if (publicKey.length !== 32 || signature.length !== 64) return false;
  const id2 = Buffer.from(publicKey).toString("latin1");
  let key2 = spkiCache.get(id2);
  if (!key2) {
    try {
      key2 = createPublicKey({ key: Buffer.concat([SPKI_PREFIX, publicKey]), format: "der", type: "spki" });
    } catch {
      return false;
    }
    if (spkiCache.size > 256) spkiCache.clear();
    spkiCache.set(id2, key2);
  }
  try {
    return verify(null, message, key2, signature);
  } catch {
    return false;
  }
}
function addressToBytes(address) {
  return b58decodeFixed(address, 32, "address");
}

// src/util/bytes.ts
import { createHash } from "node:crypto";
function sha256(data) {
  return createHash("sha256").update(data).digest();
}
function toHex(b) {
  return Buffer.from(b.buffer, b.byteOffset, b.byteLength).toString("hex");
}
function concat(parts) {
  return Buffer.concat(parts);
}
function equal(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
function encodeShortU16(n) {
  if (!Number.isInteger(n) || n < 0 || n > 65535) throw new Error(`shortvec out of range: ${n}`);
  const out = [];
  for (; ; ) {
    const low = n & 127;
    n >>= 7;
    if (n === 0) {
      out.push(low);
      return out;
    }
    out.push(low | 128);
  }
}
function decodeShortU16(buf, at) {
  let value = 0;
  for (let i = 0; i < 3; i++) {
    const byte = buf[at + i];
    if (byte === void 0) throw new Error("shortvec: truncated");
    value |= (byte & 127) << 7 * i;
    if ((byte & 128) === 0) return { value, next: at + i + 1 };
  }
  throw new Error("shortvec: too long");
}
function u64le(n) {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(n));
  return b;
}
function u32le(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n);
  return b;
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// src/solana/tx.ts
var MAX_TX_SIZE_LEGACY = 1232;
var MAX_TX_SIZE_V1 = 4096;
var V1_PREFIX = 129;
var SYSTEM_PROGRAM = b58decodeFixed("11111111111111111111111111111111", 32);
var COMPUTE_BUDGET_PROGRAM = b58decodeFixed("ComputeBudget111111111111111111111111111111", 32);
var NOOP_PROGRAM = b58decodeFixed("noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV", 32);
var MEMO_PROGRAM = b58decodeFixed("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr", 32);
var id = (k) => Buffer.from(k.buffer, k.byteOffset, k.byteLength).toString("latin1");
function orderAccounts(payer, instructions) {
  const metas = /* @__PURE__ */ new Map();
  const add = (m) => {
    const old = metas.get(id(m.pubkey));
    if (old) {
      old.isSigner ||= m.isSigner;
      old.isWritable ||= m.isWritable;
    } else metas.set(id(m.pubkey), { pubkey: m.pubkey, isSigner: m.isSigner, isWritable: m.isWritable });
  };
  add({ pubkey: payer, isSigner: true, isWritable: true });
  for (const ix of instructions) {
    for (const k of ix.keys) add(k);
    add({ pubkey: ix.programId, isSigner: false, isWritable: false });
  }
  const rank = (m) => (m.isSigner ? 0 : 2) + (m.isWritable ? 0 : 1);
  const ordered = [...metas.values()].map((m, i) => ({ m, i })).sort((a, b) => rank(a.m) - rank(b.m) || a.i - b.i).map((x) => x.m);
  if (ordered.length > 64) throw new Error("a transaction can reference at most 64 accounts");
  return {
    keys: ordered.map((m) => m.pubkey),
    index: new Map(ordered.map((m, i) => [id(m.pubkey), i])),
    header: [ordered.filter((m) => m.isSigner).length, ordered.filter((m) => m.isSigner && !m.isWritable).length, ordered.filter((m) => !m.isSigner && !m.isWritable).length]
  };
}
function compileMessage(payer, instructions, recentBlockhash) {
  if (recentBlockhash.length !== 32) throw new Error("blockhash must be 32 bytes");
  const o = orderAccounts(payer, instructions);
  const parts = [Uint8Array.from(o.header), Uint8Array.from(encodeShortU16(o.keys.length)), ...o.keys, recentBlockhash, Uint8Array.from(encodeShortU16(instructions.length))];
  for (const ix of instructions) {
    parts.push(
      Uint8Array.of(o.index.get(id(ix.programId))),
      Uint8Array.from(encodeShortU16(ix.keys.length)),
      Uint8Array.from(ix.keys.map((k) => o.index.get(id(k.pubkey)))),
      Uint8Array.from(encodeShortU16(ix.data.length)),
      ix.data
    );
  }
  return concat(parts);
}
function compileMessageV1(payer, instructions, recentBlockhash, config = {}) {
  if (recentBlockhash.length !== 32) throw new Error("blockhash must be 32 bytes");
  if (instructions.length > 64) throw new Error("a transaction can hold at most 64 instructions");
  const o = orderAccounts(payer, instructions);
  let mask = 0;
  const values = [];
  if (config.priorityFeeLamports !== void 0 && BigInt(config.priorityFeeLamports) > 0n) {
    mask |= 3;
    values.push(u64le(config.priorityFeeLamports));
  }
  if (config.computeUnitLimit !== void 0) {
    mask |= 1 << 2;
    values.push(u32le(config.computeUnitLimit));
  }
  if (config.loadedAccountsDataSizeLimit !== void 0) {
    mask |= 1 << 3;
    values.push(u32le(config.loadedAccountsDataSizeLimit));
  }
  if (config.heapSize !== void 0) {
    mask |= 1 << 4;
    values.push(u32le(config.heapSize));
  }
  const headers = [], payloads = [];
  for (const ix of instructions) {
    if (ix.keys.length > 255 || ix.data.length > 65535) throw new Error("instruction too large");
    const h = Buffer.alloc(4);
    h[0] = o.index.get(id(ix.programId));
    h[1] = ix.keys.length;
    h.writeUInt16LE(ix.data.length, 2);
    headers.push(h);
    payloads.push(Uint8Array.from(ix.keys.map((k) => o.index.get(id(k.pubkey)))), ix.data);
  }
  return concat([Uint8Array.of(V1_PREFIX, ...o.header), u32le(mask), recentBlockhash, Uint8Array.of(instructions.length, o.keys.length), ...o.keys, ...values, ...headers, ...payloads]);
}
function buildTransaction(payer, instructions, recentBlockhash, opts = {}) {
  const version = opts.version ?? 1;
  const message = version === 1 ? compileMessageV1(payer.publicKey, instructions, recentBlockhash, opts.config) : compileMessage(payer.publicKey, instructions, recentBlockhash);
  const parsed = version === 1 ? parseMessageV1(message) : parseMessage(message);
  const byKey = new Map([payer, ...opts.extraSigners ?? []].map((k) => [k.address, k]));
  const sigs = [];
  for (let i = 0; i < parsed.header.numSigners; i++) {
    const signer = byKey.get(b58encode(parsed.accountKeys[i]));
    if (!signer) throw new Error(`missing signer for ${b58encode(parsed.accountKeys[i])}`);
    sigs.push(signer.sign(message));
  }
  const raw = version === 1 ? concat([message, ...sigs]) : concat([Uint8Array.from(encodeShortU16(sigs.length)), ...sigs, message]);
  const limit = version === 1 ? MAX_TX_SIZE_V1 : MAX_TX_SIZE_LEGACY;
  if (raw.length > limit) throw new Error(`transaction is ${raw.length} bytes, the limit is ${limit}`);
  return { signature: b58encode(sigs[0]), signatureBytes: sigs[0], raw };
}
function view(b) {
  return Buffer.from(b.buffer, b.byteOffset, b.byteLength);
}
function parseMessage(message) {
  const buf = view(message);
  if (buf.length < 3) throw new Error("message truncated");
  if (buf[0] & 128) throw new Error("v0 transactions are not supported here");
  const header2 = { numSigners: buf[0], numReadonlySigned: buf[1], numReadonlyUnsigned: buf[2] };
  let at = 3;
  const need = (n) => {
    if (at + n > buf.length) throw new Error("message truncated");
  };
  const short = () => {
    const r = decodeShortU16(buf, at);
    at = r.next;
    return r.value;
  };
  const nKeys = short();
  const accountKeys = [];
  for (let i = 0; i < nKeys; i++) {
    need(32);
    accountKeys.push(buf.subarray(at, at + 32));
    at += 32;
  }
  need(32);
  const recentBlockhash = buf.subarray(at, at + 32);
  at += 32;
  const nIx = short();
  const instructions = [];
  for (let i = 0; i < nIx; i++) {
    need(1);
    const programIndex = buf[at++];
    const nAcc = short();
    need(nAcc);
    const accIdx = [...buf.subarray(at, at + nAcc)];
    at += nAcc;
    const dataLen = short();
    need(dataLen);
    const data = buf.subarray(at, at + dataLen);
    at += dataLen;
    const programId = accountKeys[programIndex];
    if (!programId || accIdx.some((x) => x >= nKeys)) throw new Error("instruction references a missing account");
    instructions.push({ programId, accounts: accIdx.map((x) => accountKeys[x]), data });
  }
  if (at !== buf.length) throw new Error("trailing bytes after message");
  if (header2.numSigners > nKeys || header2.numSigners < 1) throw new Error("bad signer count");
  return { version: "legacy", header: header2, accountKeys, recentBlockhash, instructions };
}
function parseV1(buf) {
  if (buf.length < 42 || buf[0] !== V1_PREFIX) throw new Error("not a v1 transaction");
  const header2 = { numSigners: buf[1], numReadonlySigned: buf[2], numReadonlyUnsigned: buf[3] };
  const configMask = buf.readUInt32LE(4);
  const recentBlockhash = buf.subarray(8, 40);
  const nIx = buf[40], nKeys = buf[41];
  let at = 42;
  const need = (n) => {
    if (at + n > buf.length) throw new Error("transaction truncated");
  };
  if (nIx > 64 || nKeys > 64 || header2.numSigners < 1 || header2.numSigners > 12) throw new Error("transaction breaks the v1 limits");
  if (header2.numReadonlySigned >= header2.numSigners || nKeys < header2.numSigners + header2.numReadonlyUnsigned) throw new Error("bad v1 header");
  const accountKeys = [];
  for (let i = 0; i < nKeys; i++) {
    need(32);
    accountKeys.push(buf.subarray(at, at + 32));
    at += 32;
  }
  let bits = 0;
  for (let m = configMask; m; m >>>= 1) bits += m & 1;
  need(bits * 4);
  at += bits * 4;
  const heads = [];
  for (let i = 0; i < nIx; i++) {
    need(4);
    heads.push([buf[at], buf[at + 1], buf.readUInt16LE(at + 2)]);
    at += 4;
  }
  const instructions = [];
  for (const [program, nAcc, dataLen] of heads) {
    need(nAcc + dataLen);
    const accIdx = [...buf.subarray(at, at + nAcc)];
    at += nAcc;
    const data = buf.subarray(at, at + dataLen);
    at += dataLen;
    const programId = accountKeys[program];
    if (!programId || accIdx.some((x) => x >= nKeys)) throw new Error("instruction references a missing account");
    instructions.push({ programId, accounts: accIdx.map((x) => accountKeys[x]), data });
  }
  return { msg: { version: 1, header: header2, accountKeys, recentBlockhash, instructions, configMask }, end: at };
}
function parseMessageV1(message) {
  const buf = view(message);
  const { msg, end } = parseV1(buf);
  if (end !== buf.length) throw new Error("trailing bytes after message");
  return msg;
}
function parseTransaction(raw) {
  const buf = view(raw);
  if (buf[0] === V1_PREFIX) {
    if (buf.length > MAX_TX_SIZE_V1) throw new Error("transaction too large");
    const { msg, end } = parseV1(buf);
    const n2 = msg.header.numSigners;
    if (buf.length !== end + 64 * n2) throw new Error("signature count does not match message header");
    const signatures2 = [];
    for (let i = 0; i < n2; i++) signatures2.push(buf.subarray(end + 64 * i, end + 64 * i + 64));
    return { ...msg, signatures: signatures2, message: buf.subarray(0, end) };
  }
  const n = decodeShortU16(buf, 0);
  let at = n.next;
  const signatures = [];
  for (let i = 0; i < n.value; i++) {
    if (at + 64 > buf.length) throw new Error("transaction truncated");
    signatures.push(buf.subarray(at, at + 64));
    at += 64;
  }
  const message = buf.subarray(at);
  const parsed = parseMessage(message);
  if (signatures.length !== parsed.header.numSigners) throw new Error("signature count does not match message header");
  return { ...parsed, signatures, message };
}
function verifyPayerSignature(tx) {
  const payer = tx.accountKeys[0], sig = tx.signatures[0];
  return !!payer && !!sig && verifySignature(payer, tx.message, sig);
}
function noopInstruction(data, readonlyAccounts = []) {
  return { programId: NOOP_PROGRAM, keys: readonlyAccounts.map((pubkey) => ({ pubkey, isSigner: false, isWritable: false })), data };
}
function dataInstructions(carrier, payer, data, tags = []) {
  if (carrier === "noop") return [noopInstruction(data, tags)];
  return [
    { programId: MEMO_PROGRAM, keys: [], data: Buffer.from(Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString("base64"), "ascii") },
    ...tags.map((tag) => transferInstruction(payer, tag, 0))
  ];
}
function carriedData(programId, data, magic) {
  const is = (program) => program.every((b, i) => b === programId[i]);
  if (is(NOOP_PROGRAM)) return data.length >= 2 && data[0] === magic ? data : null;
  if (!is(MEMO_PROGRAM) || data.length < 4) return null;
  const text = Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString("latin1");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(text)) return null;
  const raw = Buffer.from(text, "base64");
  return raw.length >= 2 && raw[0] === magic ? raw : null;
}
function transferInstruction(from, to, lamports) {
  return {
    programId: SYSTEM_PROGRAM,
    keys: [{ pubkey: from, isSigner: true, isWritable: true }, { pubkey: to, isSigner: false, isWritable: true }],
    data: concat([u32le(2), u64le(lamports)])
  };
}
function computeBudgetInstructions(unitLimit, microLamportsPerUnit) {
  return [
    { programId: COMPUTE_BUDGET_PROGRAM, keys: [], data: concat([Uint8Array.of(2), u32le(unitLimit)]) },
    { programId: COMPUTE_BUDGET_PROGRAM, keys: [], data: concat([Uint8Array.of(3), u64le(microLamportsPerUnit)]) }
  ];
}
var NOOP_COMPUTE_UNITS = 2e4;
var MEMO_UNITS_PER_CHAR = 500;
var NOOP_LOADED_BYTES = 256 * 1024;
function noopCapacity(opts = {}) {
  const ro = opts.readonlyAccounts ?? 0;
  if (opts.carrier === "memo") {
    const accounts2 = 3 + (ro ? 1 + ro : 0);
    const budget2 = 1 + 1 + 1 + 5 + (opts.priorityFee ? 1 + 1 + 1 + 9 : 0);
    const text = MAX_TX_SIZE_LEGACY - (1 + 64 + 3 + 1 + 32 * accounts2 + 32 + 1 + budget2 + (1 + 1 + 2) + ro * (1 + 1 + 2 + 1 + 12));
    return Math.floor(text / 4) * 3;
  }
  if ((opts.version ?? 1) === 1) {
    const config = 8 + (opts.priorityFee ? 8 : 0);
    return MAX_TX_SIZE_V1 - (1 + 3 + 4 + 32 + 1 + 1 + 32 * (2 + ro) + config + 4 + ro + 64);
  }
  const accounts = 2 + ro + (opts.priorityFee ? 1 : 0);
  const budget = opts.priorityFee ? 1 + 1 + 1 + 5 + (1 + 1 + 1 + 9) : 0;
  return MAX_TX_SIZE_LEGACY - (1 + 64 + 3 + 1 + 32 * accounts + 32 + 1 + budget + 1 + 1 + ro + 2);
}
function buildNoopTransaction(payer, data, recentBlockhash, opts = {}) {
  const version = opts.version ?? 1;
  const fee = opts.priorityFeeLamports ?? 0;
  if (opts.carrier === "memo") {
    const ixs = dataInstructions("memo", payer.publicKey, data, opts.readonlyAccounts);
    const units = Math.min(14e5, 2e4 + ixs[0].data.length * MEMO_UNITS_PER_CHAR);
    const budget2 = computeBudgetInstructions(units, fee > 0 ? Math.ceil(fee * 1e6 / units) : 0);
    return buildTransaction(payer, [...fee > 0 ? budget2 : budget2.slice(0, 1), ...ixs], recentBlockhash, { version: "legacy" });
  }
  if (version === 1) {
    return buildTransaction(payer, [noopInstruction(data, opts.readonlyAccounts)], recentBlockhash, {
      version: 1,
      config: { computeUnitLimit: NOOP_COMPUTE_UNITS, loadedAccountsDataSizeLimit: NOOP_LOADED_BYTES, ...fee > 0 && { priorityFeeLamports: fee } }
    });
  }
  const budget = fee > 0 ? computeBudgetInstructions(NOOP_COMPUTE_UNITS, Math.ceil(fee * 1e6 / NOOP_COMPUTE_UNITS)) : [];
  return buildTransaction(payer, [...budget, noopInstruction(data, opts.readonlyAccounts)], recentBlockhash, { version: "legacy" });
}

// src/solana/rpc.ts
import { createHash as createHash2 } from "node:crypto";
var RpcError = class extends Error {
  kind;
  code;
  constructor(kind, message, code) {
    super(message);
    this.name = "RpcError";
    this.kind = kind;
    this.code = code;
  }
};
var GENESIS = {
  "mainnet-beta": "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
  devnet: "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG",
  testnet: "4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY"
};
function clusterName(genesisHash) {
  for (const [name, hash] of Object.entries(GENESIS)) if (hash === genesisHash) return name;
  return `unknown network ${genesisHash.slice(0, 8)}\u2026`;
}
function probeKey(url) {
  return createHash2("sha256").update(url).digest("hex").slice(0, 24);
}
function maskRpcUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^[a-z0-9-]{12,}\./i, "\u2026.");
    const hasSecret = u.search.length > 1 || u.pathname.length > 1 || u.username !== "";
    return host + (hasSecret ? "/\u2026" : "");
  } catch {
    return "invalid-url";
  }
}
var MAX_BATCH = 64;
function retryAfter(res) {
  const ra = Number(res.headers.get("retry-after"));
  return isFinite(ra) && ra > 0 ? ra * 1e3 : void 0;
}
var MAX_BODY = 512 << 20;
async function readBody(res) {
  const reader = res.body?.getReader?.();
  if (!reader) return res.text();
  const chunks = [];
  let size = 0;
  for (; ; ) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_BODY) {
      void reader.cancel().catch(() => {
      });
      throw new RpcError("server", `the answer is larger than ${MAX_BODY >> 20} MB`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}
var RpcPool = class _RpcPool {
  #eps;
  #queue = [];
  #urgent = [];
  #o;
  #note;
  #fetch;
  #timer = null;
  #kicked = false;
  #id = 0;
  constructor(urls, options = {}) {
    const unique = [...new Set(urls.map((u) => u.trim()).filter(Boolean))];
    for (const u of unique) {
      let ok = false;
      try {
        ok = /^https?:$/.test(new URL(u).protocol);
      } catch {
      }
      if (!ok) throw new Error(`not a valid RPC URL (must start with http:// or https://): ${maskRpcUrl(u)}`);
    }
    if (!unique.length) throw new Error("no RPC endpoints configured. Add one with: chainboot rpc add <url>");
    this.#o = { maxInflight: options.maxInflight ?? 48, timeoutMs: options.timeoutMs ?? 2e4, initialRate: options.initialRate ?? 40, maxRate: options.maxRate ?? 2e3, hedgeMinMs: options.hedgeMinMs ?? 1500 };
    this.#note = options.onNote ?? (() => {
    });
    this.#fetch = options.fetch ?? fetch;
    const now = Date.now();
    this.#eps = unique.map((url) => ({
      url,
      label: maskRpcUrl(url),
      inflight: 0,
      rate: this.#o.initialRate,
      slowStart: true,
      tokens: Math.max(1, this.#o.initialRate / 4),
      refilledAt: now,
      coolUntil: 0,
      failStreak: 0,
      lastRateLimit: 0,
      usedThisWindow: 0,
      windowStart: now,
      latency: 0,
      ok: 0,
      rateLimited: 0,
      errors: 0,
      lastError: "",
      unsupported: /* @__PURE__ */ new Map(),
      noData: /* @__PURE__ */ new Set(),
      misses: 0,
      disabledUntil: 0,
      removed: false,
      batch: 8,
      batchOff: false,
      methodLatency: /* @__PURE__ */ new Map(),
      hedged: 0,
      okThisSecond: 0,
      okPrevSecond: 0,
      okSecondStart: now
    }));
    const seen = /* @__PURE__ */ new Map();
    for (const e of this.#eps) {
      const n = (seen.get(e.label) ?? 0) + 1;
      seen.set(e.label, n);
      if (n > 1) e.label += ` #${n}`;
    }
  }
  get size() {
    return this.#eps.filter((e) => !e.removed).length;
  }
  /**
   * Asks every endpoint which network it serves and drops the ones that are unreachable or on
   * a different network than `genesisHash`. Mixing networks would silently break uploads, so
   * call this once before real work. Returns one line per endpoint for display.
   */
  async probe(genesisHash, known = {}) {
    const now = Date.now();
    const report = await Promise.all(this.#eps.map(async (e) => {
      const seen = known[probeKey(e.url)];
      if (seen && now - seen.at < (seen.genesis ? 7 * 864e5 : 10 * 6e4)) {
        if (!seen.genesis) {
          e.removed = true;
          return { label: e.label, ok: false, detail: seen.error ?? "unreachable" };
        }
        if (genesisHash && seen.genesis !== genesisHash) {
          e.removed = true;
          return { label: e.label, ok: false, detail: `different network (${clusterName(seen.genesis)})`, genesis: seen.genesis };
        }
        return { label: e.label, ok: true, detail: clusterName(seen.genesis), genesis: seen.genesis };
      }
      for (let attempt = 0; ; attempt++) {
        try {
          const g = await this.#single(e, "getGenesisHash", [], 8e3);
          if (typeof g !== "string") throw new RpcError("server", "malformed answer");
          known[probeKey(e.url)] = { genesis: g, at: now };
          if (genesisHash && g !== genesisHash) {
            e.removed = true;
            return { label: e.label, ok: false, detail: `different network (${clusterName(g)})`, genesis: g };
          }
          return { label: e.label, ok: true, detail: clusterName(g), genesis: g };
        } catch (err) {
          if (attempt < 2 && err.kind !== "unsupported") {
            await sleep(400 * (attempt + 1));
            continue;
          }
          e.removed = true;
          known[probeKey(e.url)] = { genesis: null, error: err.message, at: now };
          return { label: e.label, ok: false, detail: err.message };
        }
      }
    }));
    if (!this.size) throw new Error("none of the configured RPC endpoints is usable:\n" + report.map((r) => `  ${r.label}: ${r.detail}`).join("\n"));
    return report;
  }
  stats() {
    const now = Date.now();
    return this.#eps.filter((e) => !e.removed).map((e) => ({
      label: e.label,
      state: e.disabledUntil > now ? "disabled" : e.coolUntil > now ? "cooling" : "active",
      rate: Math.round(e.rate * 10) / 10,
      inflight: e.inflight,
      ok: e.ok,
      rateLimited: e.rateLimited,
      errors: e.errors,
      latencyMs: Math.round(e.latency),
      hedged: e.hedged,
      lastError: e.lastError
    }));
  }
  /** One JSON-RPC call, retried across endpoints until it succeeds or attempts run out. */
  call(method, params = [], opts = {}) {
    return new Promise((resolve, reject) => {
      const job = {
        method,
        params,
        opts,
        tried: /* @__PURE__ */ new Set(),
        rounds: 0,
        notBefore: 0,
        lastError: null,
        attemptsLeft: opts.attempts ?? Math.max(8, this.#eps.length * 4),
        settled: false,
        queued: true,
        flying: 0,
        limited: 0,
        invalid: 0,
        resolve,
        reject
      };
      (opts.urgent ? this.#urgent : this.#queue).push(job);
      this.#kick();
    });
  }
  /** Runs the scheduler once after the current burst of call()s, so calls made together can share a request. */
  #kick() {
    if (this.#kicked) return;
    this.#kicked = true;
    queueMicrotask(() => {
      this.#kicked = false;
      this.#pump();
    });
  }
  /** Sends the same request to up to `fanout` endpoints at once; resolves with the first success. */
  async broadcast(method, params, fanout = 2, timeoutMs = 1e4) {
    const now = Date.now();
    const usable = this.#eps.filter((e) => !e.removed && e.disabledUntil <= now && e.coolUntil <= now && !this.#isUnsupported(e, method, now));
    const pool = (usable.length ? usable : this.#eps.filter((e) => !e.removed)).slice().sort((a, b) => a.inflight / this.#o.maxInflight - b.inflight / this.#o.maxInflight || a.latency - b.latency);
    const targets = pool.slice(0, Math.max(1, fanout));
    let lastErr = null;
    return new Promise((resolve, reject) => {
      let left = targets.length, done = false;
      for (const ep of targets) {
        this.#takeTokens(ep, Date.now(), 1);
        this.#single(ep, method, params, timeoutMs).then(
          (r) => {
            this.#onSuccess(ep);
            if (!done) {
              done = true;
              resolve(r);
            }
          },
          (e) => {
            this.#onFailure(ep, method, e);
            lastErr = e;
          }
        ).finally(() => {
          if (--left === 0 && !done) reject(lastErr ?? new RpcError("exhausted", "broadcast failed"));
          this.#pump();
        });
      }
    });
  }
  // ---- scheduling ----
  #isUnsupported(e, method, now) {
    const until = e.unsupported.get(method);
    if (until === void 0) return false;
    if (until <= now) {
      e.unsupported.delete(method);
      e.noData.delete(method);
      return false;
    }
    return true;
  }
  #refill(e, now) {
    const dt = (now - e.refilledAt) / 1e3;
    if (dt <= 0) return;
    e.refilledAt = now;
    e.tokens = Math.min(e.tokens + dt * e.rate, Math.max(1, e.rate / 4));
    const span = now - e.windowStart;
    if (span >= 500) {
      const busy = e.usedThisWindow >= e.rate * 0.6 * (span / 1e3);
      if (busy && now - e.lastRateLimit > 2e3 && e.failStreak === 0) {
        e.rate = Math.min(this.#o.maxRate, e.slowStart ? e.rate * 2 : e.rate + Math.max(0.5, e.rate * 0.03));
      }
      e.usedThisWindow = 0;
      e.windowStart = now;
    }
  }
  #takeTokens(e, now, n) {
    this.#refill(e, now);
    e.tokens -= n;
    e.usedThisWindow += n;
  }
  #pick(job, now, backlog) {
    let best = null, anyAllowed = false, bestLoad = Infinity;
    for (const e of this.#eps) {
      if (e.removed || e.disabledUntil > now || this.#isUnsupported(e, job.method, now)) continue;
      if (job.tried.has(e)) continue;
      anyAllowed = true;
      if (e.coolUntil > now || e.inflight >= this.#o.maxInflight) continue;
      this.#refill(e, now);
      const need = job.opts.batch && !e.batchOff ? Math.max(1, Math.min(e.batch, backlog, Math.floor(e.rate / 4))) : 1;
      if (e.tokens < need) continue;
      const load = (e.inflight + 1) / Math.max(1, e.rate) + (e.latency || 400) / 1e6;
      if (load < bestLoad) {
        bestLoad = load;
        best = e;
      }
    }
    if (best) return best;
    return anyAllowed ? "wait" : null;
  }
  #pump() {
    const now = Date.now();
    for (const queue of [this.#urgent, this.#queue]) {
      let scanned = 0;
      for (let i = 0; i < queue.length && scanned < 64; i++) {
        const job = queue[i];
        if (job.settled) {
          queue.splice(i--, 1);
          job.queued = false;
          continue;
        }
        if (job.opts.deadline !== void 0 && now > job.opts.deadline) {
          queue.splice(i--, 1);
          job.queued = false;
          job.settled = true;
          job.reject(job.lastError ?? new RpcError("exhausted", `${job.method}: timed out waiting for an RPC endpoint`));
          continue;
        }
        if (job.notBefore > now) {
          scanned++;
          continue;
        }
        const pick = this.#pick(job, now, queue.length - i);
        if (pick === null) {
          const usable = this.#eps.filter((e) => !e.removed);
          const hard = (e) => (e.unsupported.get(job.method) ?? 0) > now && !e.noData.has(job.method);
          if (usable.some(hard) && usable.every((e) => hard(e) || e.failStreak >= 3)) {
            queue.splice(i--, 1);
            job.queued = false;
            job.settled = true;
            job.reject(new RpcError("exhausted", `${job.method} failed on every RPC endpoint (last error: ${job.lastError?.message ?? "method not supported"})`));
            continue;
          }
          job.tried.clear();
          job.rounds++;
          if (!usable.some((e) => e.disabledUntil <= now && !this.#isUnsupported(e, job.method, now))) {
            for (const e of usable) {
              e.disabledUntil = 0;
              if (e.noData.delete(job.method)) e.unsupported.delete(job.method);
            }
          }
          job.notBefore = now + Math.min(4e3, 150 * 2 ** Math.min(job.rounds, 5));
          scanned++;
          continue;
        }
        if (pick === "wait") {
          scanned++;
          continue;
        }
        const want = job.opts.batch && !pick.batchOff ? Math.min(pick.batch, Math.floor(pick.tokens)) : 1;
        const jobs = [job];
        queue.splice(i, 1);
        for (let j = i, looked = 0; jobs.length < want && j < queue.length && looked < want * 4; looked++) {
          const other = queue[j];
          if (other.opts.batch && !other.settled && other.notBefore <= now && !other.tried.has(pick) && !this.#isUnsupported(pick, other.method, now)) {
            jobs.push(other);
            queue.splice(j, 1);
          } else j++;
        }
        i--;
        this.#run(pick, jobs);
      }
    }
    this.#arm();
  }
  #arm() {
    if (this.#timer || !this.#queue.length && !this.#urgent.length) return;
    this.#timer = setTimeout(() => {
      this.#timer = null;
      this.#pump();
    }, 10);
  }
  #run(ep, jobs) {
    this.#takeTokens(ep, Date.now(), jobs.length);
    for (const job of jobs) {
      job.queued = false;
      job.flying++;
      job.tried.add(ep);
      job.attemptsLeft--;
    }
    const method = jobs[0].method;
    const timeout = Math.max(...jobs.map((j) => j.opts.timeoutMs ?? this.#o.timeoutMs)) + 40 * (jobs.length - 1);
    const started = performance.now();
    const usual = ep.methodLatency.get(method) ?? ep.latency;
    const hedge = setTimeout(() => {
      const now = Date.now();
      let any = false;
      for (const job of jobs) {
        if (job.settled || job.queued) continue;
        const other = this.#eps.some((e) => e !== ep && !e.removed && !job.tried.has(e) && e.disabledUntil <= now && e.coolUntil <= now && !this.#isUnsupported(e, job.method, now));
        if (!other) continue;
        job.queued = true;
        job.attemptsLeft++;
        (job.opts.urgent ? this.#urgent : this.#queue).unshift(job);
        any = true;
      }
      ep.hedged++;
      ep.coolUntil = Math.max(ep.coolUntil, now + 1e4);
      if (any) this.#kick();
    }, Math.min(timeout / 2, Math.max(this.#o.hedgeMinMs, usual * 3)));
    const work = jobs.length === 1 ? this.#single(ep, method, jobs[0].params, timeout).then((r) => [r]) : this.#batch(ep, jobs, timeout);
    work.then(
      (results) => {
        const ms = performance.now() - started;
        ep.methodLatency.set(method, ep.methodLatency.has(method) ? ep.methodLatency.get(method) * 0.8 + ms * 0.2 : ms);
        let limited = false, clean = true;
        results.forEach((r, k) => {
          const job = jobs[k];
          job.flying--;
          if (r instanceof RpcError) {
            clean = false;
            if (r.kind === "rate-limit") {
              if (!limited) this.#onFailure(ep, job.method, r);
              limited = true;
              this.#forgive(ep, job);
            } else this.#onFailure(ep, job.method, r);
            if (r.kind === "invalid") this.#invalid(job, r);
            else this.#retry(job, r);
            return;
          }
          if (job.opts.accept && !job.opts.accept(r)) {
            ep.ok++;
            if (++ep.misses >= 200 && this.#eps.length > 1) {
              ep.misses = 0;
              ep.unsupported.set(job.method, Date.now() + 10 * 6e4);
              ep.noData.add(job.method);
              this.#note(`${ep.label}: no data for ${job.method} (no ledger history?), skipping it for 10 minutes`);
            }
            this.#retry(job, new RpcError("exhausted", `${job.method}: not found on any RPC endpoint`));
            return;
          }
          ep.misses = 0;
          this.#onSuccess(ep);
          this.#settle(job, null, r);
        });
        if (jobs.length > 1 && clean && jobs.length >= ep.batch) ep.batch = Math.min(MAX_BATCH, ep.batch * 2);
      },
      (err) => {
        for (const job of jobs) job.flying--;
        if (jobs.length > 1 && (err.kind === "invalid" || err.kind === "unsupported" || /HTTP (400|404|405|413|415)/.test(err.message))) {
          ep.batchOff = true;
          this.#note(`${ep.label}: does not accept batched requests, sending one call per request`);
          for (const job of jobs) {
            job.tried.delete(ep);
            job.attemptsLeft++;
            this.#retry(job, err);
          }
          return;
        }
        if (jobs.length > 1 && err.kind === "network") ep.batch = Math.max(1, ep.batch >> 1);
        this.#onFailure(ep, method, err);
        for (const job of jobs) {
          if (err.kind === "rate-limit") this.#forgive(ep, job);
          if (err.kind === "invalid") this.#invalid(job, err);
          else this.#retry(job, err);
        }
      }
    ).finally(() => {
      clearTimeout(hedge);
      this.#pump();
    });
  }
  /**
   * "Too many requests" means "come back later", not "this failed": the call keeps its attempt
   * and may return to the same endpoint once that endpoint's learned rate allows it.
   */
  #forgive(ep, job) {
    if (++job.limited > 100) return;
    job.tried.delete(ep);
    job.attemptsLeft++;
  }
  /** Delivers the final outcome of a call exactly once. */
  #settle(job, err, result) {
    if (job.settled) return;
    job.settled = true;
    if (err) job.reject(err);
    else job.resolve(result);
  }
  /**
   * An endpoint said the request itself is wrong. That is final when a second endpoint says
   * the same, or when there is nobody else to ask: one endpoint that does not know a parameter
   * must not fail a call the others can answer.
   */
  #invalid(job, err) {
    job.invalid++;
    const now = Date.now();
    const other = this.#eps.some((e) => !e.removed && !job.tried.has(e) && !this.#isUnsupported(e, job.method, now));
    if (job.invalid >= 2 || !other || job.attemptsLeft <= 0) this.#settle(job, err);
    else this.#retry(job, err);
  }
  #retry(job, err) {
    if (job.settled || job.queued || job.flying > 0) return;
    job.lastError = err;
    if (job.attemptsLeft <= 0) {
      this.#settle(job, new RpcError("exhausted", `${job.method} failed on every RPC endpoint (last error: ${err.message})`, err.code));
      return;
    }
    job.queued = true;
    (job.opts.urgent ? this.#urgent : this.#queue).unshift(job);
  }
  #onSuccess(ep) {
    ep.ok++;
    ep.failStreak = 0;
    const now = Date.now();
    if (now - ep.okSecondStart >= 1e3) {
      ep.okPrevSecond = now - ep.okSecondStart < 2e3 ? ep.okThisSecond : 0;
      ep.okThisSecond = 0;
      ep.okSecondStart = now;
    }
    ep.okThisSecond++;
  }
  #onFailure(ep, method, err) {
    const now = Date.now();
    ep.lastError = err.message.slice(0, 160);
    if (err.kind === "rate-limit") {
      ep.rateLimited++;
      if (now - ep.lastRateLimit > 400) {
        ep.slowStart = false;
        const proven = ep.okPrevSecond > 0 ? ep.okPrevSecond * 0.8 : ep.rate * 0.3;
        ep.rate = Math.max(1, Math.min(ep.rate * 0.7, proven));
        ep.tokens = Math.min(ep.tokens, 0);
        ep.coolUntil = Math.max(ep.coolUntil, now + (err.code && err.code > 0 ? Math.min(err.code, 15e3) : 400 + Math.random() * 400));
      }
      ep.lastRateLimit = now;
      return;
    }
    if (err.kind === "unsupported") {
      ep.unsupported.set(method, now + 30 * 6e4);
      ep.noData.delete(method);
      this.#note(`${ep.label}: does not support ${method}, using other endpoints for it`);
      return;
    }
    if (err.kind === "invalid") return;
    ep.errors++;
    if (err.kind === "rpc") return;
    ep.failStreak++;
    ep.rate = Math.max(1, ep.rate * 0.8);
    ep.coolUntil = Math.max(ep.coolUntil, now + Math.min(3e4, 250 * 2 ** Math.min(ep.failStreak, 7)));
    if (ep.failStreak === 6) this.#note(`${ep.label}: keeps failing (${ep.lastError}), resting`);
  }
  /** Turns a JSON-RPC error object into the kind of failure the scheduler understands. */
  static #classify(method, error) {
    const code = error.code, msg = String(error.message ?? "rpc error").slice(0, 200);
    if (code === 429 || code === -32429 || /rate.?limit|too many requests|exceeded.*(limit|quota)|credits|max usage/i.test(msg)) return new RpcError("rate-limit", msg);
    if (code === -32601 || /method not found|method .*not (supported|available|allowed)|is disabled|upgrade your plan/i.test(msg)) return new RpcError("unsupported", msg, code);
    if (code === -32602 || code === -32600 || code === -32700) return new RpcError("invalid", `${method}: ${msg}`, code);
    return new RpcError("rpc", msg, code);
  }
  /** One HTTP POST. Returns the parsed JSON body; throws for transport-level failures. */
  async #http(ep, payload, timeoutMs) {
    ep.inflight++;
    const started = performance.now();
    try {
      let res, text;
      try {
        res = await this.#fetch(ep.url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(timeoutMs)
        });
        text = await readBody(res);
      } catch (e) {
        if (e instanceof RpcError) throw e;
        const name = e.name;
        throw new RpcError("network", name === "TimeoutError" || name === "AbortError" ? `timeout after ${timeoutMs} ms` : `network error: ${e.message}`);
      }
      const ms = performance.now() - started;
      ep.latency = ep.latency ? ep.latency * 0.9 + ms * 0.1 : ms;
      let body;
      try {
        body = JSON.parse(text);
      } catch {
        if (res.status === 429 || /max usage|rate.?limit|too many/i.test(text.slice(0, 200))) throw new RpcError("rate-limit", `rate limited (HTTP ${res.status})`, retryAfter(res));
        if (res.status === 401 || res.status === 403) throw new RpcError("server", `HTTP ${res.status}: the endpoint rejected the request (check the API key)`);
        throw new RpcError("server", `HTTP ${res.status}: not a JSON-RPC answer`);
      }
      if (res.status === 429 && !Array.isArray(body)) throw new RpcError("rate-limit", "rate limited (HTTP 429)", retryAfter(res));
      if (!res.ok && res.status !== 429 && (!body || typeof body !== "object" || !Array.isArray(body) && !("error" in body))) throw new RpcError("server", `HTTP ${res.status}`);
      return body;
    } finally {
      ep.inflight--;
    }
  }
  async #single(ep, method, params, timeoutMs) {
    const body = await this.#http(ep, { jsonrpc: "2.0", id: ++this.#id, method, params }, timeoutMs);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new RpcError("server", "malformed JSON-RPC answer");
    if (body.error) throw _RpcPool.#classify(method, body.error);
    if (!("result" in body)) throw new RpcError("server", "malformed JSON-RPC answer");
    return body.result;
  }
  /** Several calls in one HTTP request. Resolves with one result or RpcError per job. */
  async #batch(ep, jobs, timeoutMs) {
    const body = await this.#http(ep, jobs.map((j, id2) => ({ jsonrpc: "2.0", id: id2, method: j.method, params: j.params })), timeoutMs);
    if (!Array.isArray(body)) {
      const error = body?.error;
      if (error) {
        const e = _RpcPool.#classify("batch", error);
        throw e.kind === "rpc" ? new RpcError("invalid", e.message, e.code) : e;
      }
      throw new RpcError("invalid", "the endpoint did not answer the batch with a list");
    }
    const out = jobs.map(() => new RpcError("server", "missing answer in batch"));
    for (const item of body) {
      const id2 = typeof item?.id === "number" ? item.id : -1;
      if (id2 < 0 || id2 >= jobs.length) continue;
      out[id2] = item.error ? _RpcPool.#classify(jobs[id2].method, item.error) : "result" in item ? item.result : new RpcError("server", "malformed JSON-RPC answer");
    }
    return out;
  }
  /**
   * Asks up to `count` different endpoints the same question and returns every answer that arrived
   * within `timeoutMs`. For questions where one endpoint could be behind or lie about what is newest.
   */
  async callEach(method, params, count = 3, timeoutMs = 6e3) {
    return (await this.askEach(method, params, count, timeoutMs)).answers;
  }
  /** Like callEach, and also says how many endpoints were asked (so a caller can tell "nobody has it" from "few answered"). */
  async askEach(method, params, count = 3, timeoutMs = 6e3) {
    const now = Date.now();
    const usable = this.#eps.filter((e) => !e.removed && !this.#isUnsupported(e, method, now));
    const fit = usable.filter((e) => e.disabledUntil <= now && e.coolUntil <= now);
    const order2 = [...fit.slice().sort((a, b) => (a.latency || 400) - (b.latency || 400)), ...usable.filter((e) => !fit.includes(e))];
    const targets = order2.slice(0, Math.max(1, count));
    const answers = [];
    await Promise.all(targets.map(async (ep) => {
      this.#takeTokens(ep, Date.now(), 1);
      try {
        answers.push(await this.#single(ep, method, params, timeoutMs));
        this.#onSuccess(ep);
      } catch (e) {
        this.#onFailure(ep, method, e);
      }
    }));
    this.#kick();
    return { answers, asked: targets.length };
  }
  /** Resolves when nothing is queued or in flight (useful in tests and before exit). */
  async idle() {
    while (this.#queue.length || this.#urgent.length || this.#eps.some((e) => e.inflight > 0)) await sleep(10);
  }
};

// src/store/store.ts
import fs3 from "node:fs";
import path2 from "node:path";
import { createHash as createHash4 } from "node:crypto";

// src/store/accounts.ts
import { createHash as createHash3 } from "node:crypto";
var RECORD_PROGRAM = b58decodeFixed("recr1L3PCGKLbckBqMNcJhuuyU1zgo8nBhfLVsJNwr5", 32);
var RECORD_HEADER = 33;
var ACCOUNT_PAYLOAD_MAX = 400;
var FIXED = 4 + 8 + 2 + 64;
var ACCOUNT_SPACE = RECORD_HEADER + FIXED + ACCOUNT_PAYLOAD_MAX;
var KIND_ACCOUNT_RECORD = 17;
var FLAG_SEE_TRANSACTIONS = 1;
var DOMAIN = Buffer.from("chainboot:account-record:v1", "utf8");
function accountSeed(tag) {
  return `cb${Buffer.from(tag.subarray(0, 15)).toString("hex")}`;
}
function accountAddress(owner, tag) {
  return createHash3("sha256").update(owner).update(accountSeed(tag), "utf8").update(RECORD_PROGRAM).digest();
}
var u32 = (n) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n);
  return b;
};
var u64 = (n) => {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(n));
  return b;
};
function signedBytes(tag, flags, seq, payload) {
  return Buffer.from(concat([DOMAIN, tag, Uint8Array.of(flags), u64(seq), payload]));
}
function encodeRecord(signer, tag, payload, seq) {
  const flags = payload ? 0 : FLAG_SEE_TRANSACTIONS, body = payload ?? new Uint8Array(0);
  if (body.length > ACCOUNT_PAYLOAD_MAX) throw new Error(`a pointer of ${body.length} bytes does not fit into an account (the limit is ${ACCOUNT_PAYLOAD_MAX})`);
  const len = Buffer.alloc(2);
  len.writeUInt16LE(body.length);
  return Buffer.from(concat([Uint8Array.of(203, KIND_ACCOUNT_RECORD, 1, flags), u64(seq), len, body, signer.sign(signedBytes(tag, flags, seq, body))]));
}
function decodeRecord(data, tag, signer) {
  const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  if (buf.length < FIXED || buf[0] !== 203 || buf[1] !== KIND_ACCOUNT_RECORD || buf[2] !== 1) return null;
  const flags = buf[3], seq = buf.readBigUInt64LE(4), len = buf.readUInt16LE(12);
  if (len > ACCOUNT_PAYLOAD_MAX || buf.length < FIXED + len) return null;
  const payload = buf.subarray(14, 14 + len), signature = buf.subarray(14 + len, 14 + len + 64);
  if (!verifySignature(signer, signedBytes(tag, flags, seq, payload), signature)) return null;
  return { seq, payload: flags & FLAG_SEE_TRANSACTIONS ? null : Buffer.from(payload) };
}
function createInstructions(owner, tag, lamports) {
  const address = accountAddress(owner, tag), seed = Buffer.from(accountSeed(tag), "utf8");
  return [
    {
      programId: SYSTEM_PROGRAM,
      keys: [{ pubkey: owner, isSigner: true, isWritable: true }, { pubkey: address, isSigner: false, isWritable: true }],
      // CreateAccountWithSeed: base, seed, lamports, space, owning program
      data: concat([u32(3), owner, u64(seed.length), seed, u64(lamports), u64(ACCOUNT_SPACE), RECORD_PROGRAM])
    },
    { programId: RECORD_PROGRAM, keys: [{ pubkey: address, isSigner: false, isWritable: true }, { pubkey: owner, isSigner: false, isWritable: false }], data: Uint8Array.of(0) }
  ];
}
function writeInstruction(owner, tag, record) {
  return {
    programId: RECORD_PROGRAM,
    keys: [{ pubkey: accountAddress(owner, tag), isSigner: false, isWritable: true }, { pubkey: owner, isSigner: true, isWritable: false }],
    data: concat([Uint8Array.of(1), u64(0), u32(record.length), record])
  };
}
function closeInstruction(owner, tag) {
  return {
    programId: RECORD_PROGRAM,
    keys: [{ pubkey: accountAddress(owner, tag), isSigner: false, isWritable: true }, { pubkey: owner, isSigner: true, isWritable: false }, { pubkey: owner, isSigner: false, isWritable: true }],
    data: Uint8Array.of(3)
  };
}

// src/store/sender.ts
import fs2 from "node:fs";
import path from "node:path";
var LAMPORTS_PER_SIGNATURE = 5e3;
function itemKey(data) {
  return toHex(sha256(data));
}
var Journal = class {
  #path;
  #known = /* @__PURE__ */ new Map();
  #fd = null;
  constructor(file) {
    this.#path = file;
    fs2.mkdirSync(path.dirname(file), { recursive: true });
    if (fs2.existsSync(file)) {
      for (const line of fs2.readFileSync(file, "utf8").split("\n")) {
        const [k, s, h] = line.split(" ");
        if (!k || !s || !/^[0-9a-f]{64}$/.test(k)) continue;
        try {
          b58decodeFixed(s, 64, "signature");
        } catch {
          continue;
        }
        if (h !== void 0 && !/^\d{1,15}$/.test(h)) continue;
        this.#known.set(k, { signature: s, lastValid: h === void 0 ? null : Number(h) });
      }
    }
  }
  get(key2) {
    return this.#known.get(key2);
  }
  forget(key2) {
    this.#known.delete(key2);
  }
  #write(line) {
    this.#fd ??= fs2.openSync(this.#path, "a");
    fs2.writeSync(this.#fd, line);
  }
  /** The transaction landed. */
  set(key2, signature) {
    this.#known.set(key2, { signature, lastValid: null });
    this.#write(`${key2} ${signature}
`);
  }
  /** The transaction was sent: after an interruption it is looked for before the data is sent (and paid for) again. */
  sent(key2, signature, lastValid) {
    this.#known.set(key2, { signature, lastValid });
    this.#write(`${key2} ${signature} ${lastValid}
`);
  }
  close() {
    if (this.#fd !== null) {
      fs2.closeSync(this.#fd);
      this.#fd = null;
    }
  }
};
var TxSender = class {
  #pool;
  #payer;
  #blockhash = null;
  #height = 0;
  constructor(pool, payer) {
    this.#pool = pool;
    this.#payer = payer;
  }
  async balance() {
    const r = await this.#pool.call("getBalance", [this.#payer.address, { commitment: "confirmed" }], { urgent: true });
    return r.value;
  }
  async #refreshBlockhash() {
    const r = await this.#pool.call(
      "getLatestBlockhash",
      [{ commitment: "confirmed" }],
      { urgent: true, timeoutMs: 8e3 }
    );
    this.#blockhash = { hash: b58decodeFixed(r.value.blockhash, 32, "blockhash"), lastValidBlockHeight: r.value.lastValidBlockHeight, at: Date.now() };
  }
  async #refreshHeight() {
    this.#height = await this.#pool.call("getBlockHeight", [{ commitment: "confirmed" }], { urgent: true, timeoutMs: 8e3 });
  }
  /**
   * Lands every item and returns signature and slot of each, in the same order.
   * Throws only for problems the user must fix (no funds, aborted, endpoints all dead).
   */
  async sendAll(items, opts = {}) {
    const commitment = opts.commitment ?? "finalized";
    const maxPending = opts.maxPending ?? 4e3;
    const resendAfter = opts.resendAfterMs ?? 5e3, pollMs = opts.pollMs ?? 500;
    const journal = opts.journal ? new Journal(opts.journal) : null;
    const result = new Array(items.length).fill(null);
    const feePerTx = LAMPORTS_PER_SIGNATURE + Math.max(0, opts.priorityFeeLamports ?? 0);
    const todo = [];
    const recheck = [];
    for (let i = 0; i < items.length; i++) {
      const known = journal?.get(items[i].key);
      if (known) recheck.push({ item: items[i], index: i, signature: known.signature, raw: "", lastValidBlockHeight: known.lastValid ?? 0, sentAt: 0, lastSendAt: 0, lastCheckAt: 0, sends: 0, confirmedAt: 0 });
      else todo.push(i);
    }
    let done = 0, resent = 0, fee = 0;
    const pending = /* @__PURE__ */ new Map();
    const report = () => opts.onProgress?.({ total: items.length, done, pending: pending.size, resent, feeLamports: fee });
    if (recheck.length) await this.#refreshHeight();
    for (let at = 0; at < recheck.length; at += 256) {
      const batch = recheck.slice(at, at + 256);
      const st = await this.#statuses(batch.map((p) => p.signature), true);
      const unknown = batch.map((_, i) => i).filter((i) => !st[i]);
      if (unknown.length && this.#pool.size > 1) {
        const second = await this.#statuses(unknown.map((i) => batch[i].signature), true, true).catch(() => null);
        if (second) unknown.forEach((i, k) => {
          st[i] = second[k] ?? null;
        });
      }
      batch.forEach((p, i) => {
        const s = st[i];
        if (s && !s.err && (s.confirmationStatus === "finalized" || commitment === "confirmed" && s.confirmationStatus === "confirmed")) {
          result[p.index] = { signature: p.signature, slot: s.slot };
          done++;
          return;
        }
        const flying = journal.get(p.item.key)?.lastValid != null && !s?.err && (!!s || this.#height <= p.lastValidBlockHeight + 8);
        if (flying) {
          pending.set(p.index, { ...p, sentAt: Date.now(), lastSendAt: Date.now(), lastCheckAt: 0, sends: 12, confirmedAt: s?.confirmationStatus === "confirmed" ? Date.now() : 0 });
          return;
        }
        journal?.forget(p.item.key);
        todo.push(p.index);
      });
    }
    todo.sort((a, b) => a - b);
    report();
    if (!todo.length && !pending.size) {
      journal?.close();
      return result;
    }
    const need = todo.length * feePerTx;
    const have = todo.length ? await this.balance() : need;
    if (have < need) {
      journal?.close();
      throw new Error(`not enough SOL: this needs about ${(need / 1e9).toFixed(4)} SOL in fees but ${this.#payer.address} holds ${(have / 1e9).toFixed(4)} SOL`);
    }
    await Promise.all([this.#refreshBlockhash(), this.#refreshHeight()]);
    let stop = false, fatal = null, wake = () => {
    };
    let heard = Date.now();
    const stopped = new Promise((r) => {
      wake = r;
    });
    const housekeeping = (async () => {
      let tick = 0;
      while (!stop) {
        await Promise.race([sleep(1e3), stopped]);
        if (stop) break;
        tick++;
        try {
          if (tick % 4 === 0 || !this.#blockhash || Date.now() - this.#blockhash.at > 2e4) {
            await this.#refreshBlockhash();
            heard = Date.now();
          }
          if (tick % 2 === 0) {
            await this.#refreshHeight();
            heard = Date.now();
          }
        } catch {
        }
      }
    })();
    let next = 0;
    const requeue = [];
    const failed = /* @__PURE__ */ new Map();
    const launch = (index) => {
      const bh = this.#blockhash;
      const tx = buildNoopTransaction(this.#payer, items[index].data, bh.hash, { version: opts.txVersion, readonlyAccounts: items[index].readonlyAccounts, priorityFeeLamports: opts.priorityFeeLamports, carrier: opts.carrier });
      const p = { item: items[index], index, signature: tx.signature, raw: tx.raw.toString("base64"), lastValidBlockHeight: bh.lastValidBlockHeight, sentAt: Date.now(), lastSendAt: Date.now(), lastCheckAt: Date.now() - pollMs / 2, sends: 1, confirmedAt: 0 };
      pending.set(index, p);
      journal?.sent(p.item.key, p.signature, p.lastValidBlockHeight);
      this.#send(p).then(() => {
        heard = Date.now();
      }, (e) => {
        if (pending.get(index) === p && !p.confirmedAt) {
          pending.delete(index);
          requeue.push(index);
        }
        if (e instanceof RpcError && e.kind === "invalid") fatal ??= new Error(`the network rejected a transaction: ${e.message}`);
      });
    };
    try {
      while (done < items.length) {
        if (opts.signal?.aborted) throw new Error("upload aborted");
        if (fatal) throw fatal;
        const now = Date.now();
        if (now - heard > 12e4) throw new Error(`no RPC endpoint has answered for two minutes. ${done} of ${items.length} transactions are stored${journal ? "; run the command again to continue from there" : ""}.`);
        const fresh = this.#blockhash && now - this.#blockhash.at < 45e3;
        let started = 0;
        while (fresh && pending.size < maxPending && started < 400) {
          const index = requeue.length ? requeue.shift() : next < todo.length ? todo[next++] : void 0;
          if (index === void 0) break;
          if (result[index] !== null || pending.has(index)) continue;
          launch(index);
          started++;
        }
        const waiting = [...pending.values()].filter((p) => now - p.lastCheckAt >= (p.raw ? pollMs : Math.max(pollMs, 1e3)));
        for (const p of waiting) p.lastCheckAt = now;
        const batches = [];
        for (let at = 0; at < waiting.length; at += 256) batches.push(waiting.slice(at, at + 256));
        await Promise.all(batches.map(async (batch) => {
          let st;
          try {
            st = await this.#statuses(batch.map((p) => p.signature), false);
            heard = Date.now();
          } catch {
            return;
          }
          batch.forEach((p, i) => {
            if (pending.get(p.index) !== p) return;
            const s = st[i];
            if (s && s.err) {
              pending.delete(p.index);
              const failures = (failed.get(p.index) ?? 0) + 1;
              failed.set(p.index, failures);
              if (failures >= 2) {
                fatal ??= new Error(`a transaction failed on chain twice and was not sent a third time: ${JSON.stringify(s.err)} (${p.signature})`);
                return;
              }
              requeue.push(p.index);
              resent++;
              return;
            }
            const level = s?.confirmationStatus;
            if (level === "finalized" || level === "confirmed" && commitment === "confirmed") {
              pending.delete(p.index);
              result[p.index] = { signature: p.signature, slot: s.slot };
              done++;
              fee += feePerTx;
              journal?.set(p.item.key, p.signature);
              return;
            }
            if (level === "confirmed") {
              p.confirmedAt ||= Date.now();
              return;
            }
            if (p.confirmedAt) {
              if (Date.now() - p.confirmedAt > 9e4 && !s) {
                pending.delete(p.index);
                requeue.push(p.index);
                resent++;
              }
              return;
            }
            if (!s && (this.#height > p.lastValidBlockHeight + 8 || !p.raw && Date.now() - p.sentAt > resendAfter * 24)) {
              pending.delete(p.index);
              requeue.push(p.index);
              resent++;
            } else if (!s && p.raw && Date.now() - p.lastSendAt > resendAfter && p.sends < 12) {
              p.lastSendAt = Date.now();
              p.sends++;
              this.#send(p).catch(() => {
              });
            }
          });
        }));
        report();
        await sleep(pending.size ? Math.min(200, pollMs) : 20);
      }
    } finally {
      stop = true;
      wake();
      await housekeeping;
      journal?.close();
    }
    report();
    return result;
  }
  #send(p) {
    return this.#pool.call("sendTransaction", [p.raw, { encoding: "base64", skipPreflight: true, maxRetries: 0 }], { attempts: 4, timeoutMs: 1e4 });
  }
  /** `known`: only an answer that knows every signature counts (other endpoints are asked until one does). */
  async #statuses(signatures, searchHistory, known = false) {
    const accept = (answer) => {
      const v = answer?.value;
      return Array.isArray(v) && v.every((x) => x !== null);
    };
    const r = await this.#pool.call(
      "getSignatureStatuses",
      [signatures, { searchTransactionHistory: searchHistory }],
      { urgent: true, timeoutMs: 15e3, ...known && { accept, attempts: Math.min(this.#pool.size, 4) } }
    );
    if (!Array.isArray(r?.value) || r.value.length !== signatures.length) throw new Error("malformed getSignatureStatuses answer");
    return r.value;
  }
};
async function sendAndConfirm(pool, build, timeoutMs = 9e4) {
  const deadline = Date.now() + timeoutMs;
  let lastError = "the network did not confirm the transaction in time";
  while (Date.now() < deadline) {
    const bh = await pool.call("getLatestBlockhash", [{ commitment: "confirmed" }], { urgent: true });
    const tx = build(b58decodeFixed(bh.value.blockhash, 32, "blockhash"));
    try {
      await pool.call("sendTransaction", [tx.raw.toString("base64"), { encoding: "base64", skipPreflight: false, preflightCommitment: "confirmed", maxRetries: 3 }], { attempts: 4, timeoutMs: 15e3 });
    } catch (e) {
      if (/simulation failed|insufficient|invalid/i.test(e.message)) throw new Error(`the network rejected the transaction: ${e.message}`);
      lastError = e.message;
    }
    for (let i = 0; i < 60 && Date.now() < deadline; i++) {
      await sleep(500);
      const st = (await pool.call("getSignatureStatuses", [[tx.signature]], { urgent: true }).catch(() => ({ value: [null] }))).value[0];
      if (st?.err) throw new Error(`the transaction failed on chain: ${JSON.stringify(st.err)}`);
      if (st?.confirmationStatus === "confirmed" || st?.confirmationStatus === "finalized") return tx.signature;
      if (!st && i > 10) {
        const height = await pool.call("getBlockHeight", [{ commitment: "confirmed" }], { urgent: true }).catch(() => 0);
        if (height > bh.value.lastValidBlockHeight) break;
      }
    }
  }
  throw new Error(lastError);
}

// src/store/store.ts
var MAGIC = 203;
var KIND_LEAF = 0;
var KIND_BRANCH = 1;
var KIND_HEAD = 2;
var KIND_INLINE = 3;
var KIND_POINTER = 16;
var FORMAT_VERSION = 1;
var POINTER_VERSION = 2;
var POINTER_HEAD = 3 + 8;
var SIG = 64;
var MAX_OBJECT = 1 << 30;
var MIN_LEAF = 64;
var POINTER_PAGES = 12;
var POINTER_PAGE = 1e3;
var HEAD_FIXED = 2 + 1 + 1 + 2 + 8 + 32 + SIG;
var HINT_MIN_NODES = 16;
var BLOCK_MODE_MIN_DENSITY = 4;
var NO_HINT = Buffer.alloc(SIG);
var ACCOUNT_TX_UNITS = 6e4;
function capacity(opts = {}) {
  return noopCapacity({ version: opts.txVersion, priorityFee: opts.priorityFee, readonlyAccounts: opts.readonlyAccounts, carrier: opts.carrier });
}
function tagAddress(...parts) {
  const h = createHash4("sha256");
  h.update("chainboot:v1");
  for (const p of parts) {
    h.update(Uint8Array.of(0));
    h.update(typeof p === "string" ? Buffer.from(p, "utf8") : p);
  }
  return h.digest();
}
function pushVarint(out, n) {
  while (n >= 128) {
    out.push(n % 128 | 128);
    n = Math.floor(n / 128);
  }
  out.push(n);
}
function encodeSlots(slots) {
  const sorted = [...new Set(slots)].sort((a, b) => a - b);
  const out = [];
  pushVarint(out, sorted.length);
  let prev = 0;
  for (const s of sorted) {
    pushVarint(out, s - prev);
    prev = s;
  }
  return Buffer.from(out);
}
function decodeSlots(buf) {
  let at = 0;
  const read = () => {
    let n = 0, mul = 1;
    for (; ; ) {
      const b = buf[at++];
      if (b === void 0 || mul > 2 ** 49) throw new Error("malformed slot hint");
      n += (b & 127) * mul;
      if (!(b & 128)) return n;
      mul *= 128;
    }
  };
  const count = read();
  if (count > 1e6) throw new Error("malformed slot hint");
  const slots = [];
  let prev = 0;
  for (let i = 0; i < count; i++) {
    prev += read();
    slots.push(prev);
  }
  if (at !== buf.length) throw new Error("malformed slot hint");
  return slots;
}
function sizes(opts) {
  const cap = capacity({ txVersion: opts.txVersion, priorityFee: (opts.priorityFeeLamports ?? 0) > 0, carrier: opts.carrier });
  return { cap, leafSize: cap - 2, fan: Math.floor((cap - 2) / SIG), headFan: Math.floor((cap - HEAD_FIXED) / SIG) };
}
var key = (sig) => Buffer.from(sig.buffer, sig.byteOffset, sig.byteLength).toString("latin1");
var ChainStore = class _ChainStore {
  pool;
  /** Applied to every write that does not set its own (for example a priority fee from the settings). */
  defaults;
  constructor(pool, defaults = {}) {
    this.pool = pool;
    this.defaults = defaults;
  }
  // ------------------------------------------------------------------ write
  /** Plans an upload without sending anything: how many transactions and what it costs. */
  static plan(size, opts = {}) {
    const { cap, leafSize, fan, headFan } = sizes(opts);
    const perTx = 5e3 + Math.max(0, opts.priorityFeeLamports ?? 0);
    if (size <= cap - 3) return { transactions: 1, feeLamports: perTx, leafSize: 0, depth: 0 };
    let level = Math.ceil(size / leafSize), tx = level, depth = 1;
    while (level > headFan) {
      level = Math.ceil(level / fan);
      tx += level;
      depth++;
    }
    if (opts.hint !== false && tx >= HINT_MIN_NODES) tx++;
    return { transactions: tx + 1, feeLamports: (tx + 1) * perTx, leafSize, depth };
  }
  /** Stores `data` on chain and returns its address. Safe to call again after an interruption. */
  async put(payer, data, options = {}) {
    const opts = { ...this.defaults, ...options };
    const { cap, leafSize, fan, headFan } = sizes(opts);
    const digest = sha256(data);
    const sender = new TxSender(this.pool, payer);
    const journal = opts.journalDir ? path2.join(opts.journalDir, `${toHex(digest)}.${payer.address}.${opts.carrier ?? "noop"}${opts.txVersion ?? 1}${(opts.priorityFeeLamports ?? 0) > 0 ? "f" : ""}.journal`) : void 0;
    const send2 = (phase, payloads) => sender.sendAll(payloads.map((p) => ({ data: p, key: itemKey(p) })), {
      commitment: opts.commitment,
      journal,
      signal: opts.signal,
      resendAfterMs: opts.resendAfterMs,
      pollMs: opts.pollMs,
      txVersion: opts.txVersion,
      priorityFeeLamports: opts.priorityFeeLamports,
      carrier: opts.carrier,
      onProgress: (p) => opts.onProgress?.({ phase, total: p.total, done: p.done, pending: p.pending, resent: p.resent })
    });
    let headSig;
    if (data.length <= cap - 3) {
      headSig = (await send2("head", [concat([Uint8Array.of(MAGIC, KIND_INLINE, FORMAT_VERSION), data])]))[0].signature;
    } else {
      const leaves = [];
      for (let at = 0; at < data.length; at += leafSize) leaves.push(concat([Uint8Array.of(MAGIC, KIND_LEAF), data.subarray(at, at + leafSize)]));
      let landed = await send2("data", leaves);
      const slots = new Set(landed.map((l) => l.slot));
      let nodes = landed.length, depth = 1;
      while (landed.length > headFan) {
        const branches = [];
        for (let at = 0; at < landed.length; at += fan) {
          branches.push(concat([Uint8Array.of(MAGIC, KIND_BRANCH), ...landed.slice(at, at + fan).map((l) => b58decodeFixed(l.signature, SIG, "signature"))]));
        }
        landed = await send2(`index ${depth}`, branches);
        for (const l of landed) slots.add(l.slot);
        nodes += landed.length;
        depth++;
      }
      let hint = NO_HINT;
      if (opts.hint !== false && nodes >= HINT_MIN_NODES) {
        const ref = await this.put(payer, encodeSlots(slots), { ...opts, hint: false, onProgress: (p) => opts.onProgress?.({ ...p, phase: "hint" }) });
        hint = b58decodeFixed(ref.sig, SIG, "signature");
      }
      const head = Buffer.alloc(HEAD_FIXED + landed.length * SIG);
      head[0] = MAGIC;
      head[1] = KIND_HEAD;
      head[2] = FORMAT_VERSION;
      head[3] = depth;
      head.writeUInt16LE(leafSize, 4);
      head.writeBigUInt64LE(BigInt(data.length), 6);
      digest.copy(head, 14);
      hint.copy(head, 46);
      landed.forEach((l, i) => b58decodeFixed(l.signature, SIG, "signature").copy(head, HEAD_FIXED + i * SIG));
      headSig = (await send2("head", [head]))[0].signature;
    }
    if (journal) fs3.rmSync(journal, { force: true });
    return { sig: headSig, size: data.length, sha256: toHex(digest) };
  }
  /** The longest payload a pointer may have with this store's settings (it must fit one transaction, and how much that holds depends on the chain). */
  pointerCapacity(options = {}) {
    const opts = { ...this.defaults, ...options };
    return capacity({ txVersion: opts.txVersion, priorityFee: (opts.priorityFeeLamports ?? 0) > 0, readonlyAccounts: 1, carrier: opts.carrier }) - POINTER_HEAD;
  }
  /** Publishes a small record that can be found again through `tag` (see tagAddress). */
  async putPointer(payer, tag, payload, options = {}) {
    const opts = { ...this.defaults, ...options };
    const carrier = opts.carrier ?? "noop";
    const cap = this.pointerCapacity(options);
    if (payload.length > cap) throw new Error(`pointer payload is ${payload.length} bytes, the limit is ${cap}`);
    const mirror = await this.#account(payer.publicKey, tag, Math.min(Math.max(this.pool.size, 2), 5)).catch((e) => {
      throw new Error(`could not check whether this pointer is also kept in an account: ${e.message}`);
    });
    const before = await this.getPointer(tag, [payer.publicKey], { pages: 1 }).then((r) => r?.seq ?? 0n, () => 0n);
    const seq = [BigInt(Date.now()), before + 1n, (mirror.record?.seq ?? 0n) + 1n].reduce((a, b) => a > b ? a : b);
    const head = Buffer.alloc(POINTER_HEAD);
    head[0] = MAGIC;
    head[1] = KIND_POINTER;
    head[2] = POINTER_VERSION;
    head.writeBigUInt64LE(seq, 3);
    const data = concat([head, payload]);
    const wanted = options.account ?? this.defaults.accounts ?? false;
    if (mirror.exists || wanted) {
      const fee = opts.priorityFeeLamports ?? 0;
      const send2 = (instructions, units2 = ACCOUNT_TX_UNITS) => {
        const budget = fee > 0 ? computeBudgetInstructions(units2, Math.ceil(fee * 1e6 / units2)) : [];
        return sendAndConfirm(this.pool, (bh) => buildTransaction(payer, [...budget, ...instructions], bh, { version: "legacy" }));
      };
      const both = payload.length <= ACCOUNT_PAYLOAD_MAX ? [...dataInstructions(carrier, payer.publicKey, data, [tag]), writeInstruction(payer.publicKey, tag, encodeRecord(payer, tag, payload, seq))] : null;
      const units = ACCOUNT_TX_UNITS + (carrier === "memo" && both ? both[0].data.length * MEMO_UNITS_PER_CHAR : 0);
      let fits = both !== null;
      if (both) {
        try {
          buildTransaction(payer, [...fee > 0 ? computeBudgetInstructions(units, 1) : [], ...both], Buffer.alloc(32), { version: "legacy" });
        } catch {
          fits = false;
        }
      }
      if (fits) {
        if (!mirror.exists) {
          const rent = await this.pool.call("getMinimumBalanceForRentExemption", [ACCOUNT_SPACE]);
          await send2(createInstructions(payer.publicKey, tag, rent));
        }
        return send2(both, units);
      }
      if (mirror.exists) await send2([writeInstruction(payer.publicKey, tag, encodeRecord(payer, tag, null, seq))]);
    }
    const [landed] = await new TxSender(this.pool, payer).sendAll(
      [{ data, readonlyAccounts: [tag], key: itemKey(data) }],
      { commitment: opts.commitment, txVersion: opts.txVersion, priorityFeeLamports: opts.priorityFeeLamports, carrier: opts.carrier }
    );
    return landed.signature;
  }
  /**
   * The account that mirrors the pointer of `owner` under `tag`: whether it exists, and the
   * newest valid record that the asked endpoints showed.
   */
  async #account(owner, tag, endpoints = 2) {
    const address = b58encode(accountAddress(owner, tag));
    const params = [address, { encoding: "base64", commitment: "confirmed" }];
    let answers = (await this.pool.callEach("getAccountInfo", params, endpoints)).filter((a) => a && typeof a === "object");
    if (!answers.length) answers = [await this.pool.call("getAccountInfo", params)];
    let shown = 0, lamports = 0, record = null;
    for (const a of answers) {
      const v = a?.value;
      if (!v || v.owner !== b58encode(RECORD_PROGRAM) || !Array.isArray(v.data) || typeof v.data[0] !== "string") continue;
      shown++;
      lamports = Math.max(lamports, Number(v.lamports) || 0);
      const r = decodeRecord(Buffer.from(v.data[0], "base64").subarray(RECORD_HEADER), tag, owner);
      if (r && (!record || r.seq > record.seq)) record = r;
    }
    return { exists: shown > 0, agreed: shown > 0 && shown === answers.length, address, lamports, record };
  }
  /** Closes the account that mirrors `payer`'s pointer under `tag` and returns the lamports that came back (0 when there is none). */
  async closePointerAccount(payer, tag) {
    const a = await this.#account(payer.publicKey, tag, 3);
    if (!a.exists) return 0;
    await sendAndConfirm(this.pool, (bh) => buildTransaction(payer, [closeInstruction(payer.publicKey, tag)], bh, { version: "legacy" }));
    return a.lamports;
  }
  // ------------------------------------------------------------------ read
  /** Checks that a transaction is what was asked for and came from a trusted payer. */
  static #check(tx, expected, signers, verify2) {
    if (expected && (!tx.signatures[0] || !equal(tx.signatures[0], expected))) throw new Error("answer is a different transaction");
    if (verify2 && !verifyPayerSignature(tx)) throw new Error("invalid signature");
    if (signers && !signers.some((s) => equal(s, tx.accountKeys[0]))) {
      if (!verify2 && !verifyPayerSignature(tx)) throw new Error("invalid signature");
      throw new TrustError(`transaction ${b58encode(tx.signatures[0])} was not published by a trusted key (it was paid by ${b58encode(tx.accountKeys[0])})`);
    }
  }
  async #fetchTx(signature, opts, verify2 = true, attempts) {
    if (opts.signal?.aborted) throw new Error("download aborted");
    const expected = b58decodeFixed(signature, SIG, "signature");
    let good = null, untrusted = null, problem = "";
    const accept = (answer) => {
      const result = answer;
      if (result === null) return false;
      try {
        if (!result || !Array.isArray(result.transaction) || typeof result.transaction[0] !== "string") throw new Error("malformed answer");
        if (!result.meta || result.meta.err !== null) throw new Error("transaction failed on chain");
        const tx = parseTransaction(Buffer.from(result.transaction[0], "base64"));
        _ChainStore.#check(tx, expected, opts.signers, verify2);
        good ??= { tx, result };
        return true;
      } catch (e) {
        if (e instanceof TrustError) {
          untrusted = e;
          return true;
        }
        problem = e.message;
        return false;
      }
    };
    try {
      await this.pool.call("getTransaction", [signature, { encoding: "base64", maxSupportedTransactionVersion: 1, commitment: "confirmed" }], { accept, batch: true, ...attempts && { attempts } });
    } catch (e) {
      throw new Error(`could not get a valid copy of transaction ${signature}: ${problem || e.message}`);
    }
    if (opts.signal?.aborted) throw new Error("download aborted");
    if (untrusted) throw untrusted;
    return good;
  }
  /** The chainboot data a transaction carries (through the Noop program, or as a memo on chains without it). */
  static #payload(tx) {
    for (const ix of tx.instructions) {
      const data = carriedData(ix.programId, ix.data, MAGIC);
      if (data) return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    }
    return null;
  }
  /** Downloads whole blocks and collects every chainboot transaction found in them, keyed by signature. */
  async #fetchBlocks(slots, opts, onLeaf) {
    const found = /* @__PURE__ */ new Map();
    await Promise.all(slots.map(async (slot) => {
      if (opts.signal?.aborted) return;
      let block;
      try {
        block = await this.pool.call(
          "getBlock",
          [slot, { encoding: "base64", transactionDetails: "full", rewards: false, maxSupportedTransactionVersion: 1, commitment: "confirmed" }],
          { attempts: Math.max(3, Math.min(6, this.pool.size)), timeoutMs: 45e3 }
        );
      } catch {
        return;
      }
      for (const item of block?.transactions ?? []) {
        if (!item?.meta || item.meta.err !== null || typeof item.transaction?.[0] !== "string") continue;
        let tx;
        try {
          tx = parseTransaction(Buffer.from(item.transaction[0], "base64"));
        } catch {
          continue;
        }
        const data = _ChainStore.#payload(tx);
        if (!data || opts.signers && !opts.signers.some((s) => equal(s, tx.accountKeys[0]))) continue;
        found.set(key(tx.signatures[0]), tx);
        if (data[1] === KIND_LEAF) onLeaf(data.length - 2);
      }
    }));
    return found;
  }
  /** Fetches and verifies an object. `ref` is a head signature or a full ObjectRef. */
  async get(ref, opts = {}) {
    const sig = typeof ref === "string" ? ref : ref.sig;
    const wantSha = (typeof ref === "string" ? opts.sha256 : ref.sha256)?.toLowerCase();
    if (wantSha !== void 0 && !/^[0-9a-f]{64}$/.test(wantSha)) throw new Error(`"${String(wantSha).slice(0, 80)}" is not a SHA-256`);
    const wantSize = typeof ref === "string" ? null : ref.size;
    if (wantSize !== null && (!Number.isSafeInteger(wantSize) || wantSize < 0)) throw new Error("an object's size must be a whole number");
    const cacheFile = opts.cacheDir && wantSha ? path2.join(opts.cacheDir, wantSha) : null;
    if (cacheFile && fs3.existsSync(cacheFile)) {
      const cached = fs3.readFileSync(cacheFile);
      if (toHex(sha256(cached)) === wantSha) return cached;
      fs3.rmSync(cacheFile, { force: true });
    }
    const { tx } = await this.#fetchTx(sig, opts);
    const head = _ChainStore.#payload(tx);
    if (!head) throw new Error(`${sig} does not carry chainboot data`);
    if (head[2] !== FORMAT_VERSION) throw new Error(`object ${sig} uses format version ${head[2]}, this program understands version ${FORMAT_VERSION}`);
    let out;
    if (head[1] === KIND_INLINE) {
      out = Buffer.from(head.subarray(3));
      opts.onProgress?.({ total: 1, done: 1, bytes: out.length, size: out.length });
    } else if (head[1] === KIND_HEAD) {
      out = await this.#getTree(sig, head, wantSha, wantSize, opts, false);
    } else {
      throw new Error(`${sig} is not the head of an object`);
    }
    const got = toHex(sha256(out));
    if (wantSha && got !== wantSha) throw new Error(`object ${sig} is not the expected content (sha256 differs)`);
    if (typeof ref !== "string" && ref.size !== out.length) throw new Error(`object ${sig} has ${out.length} bytes, expected ${ref.size}`);
    if (opts.cacheDir) {
      fs3.mkdirSync(opts.cacheDir, { recursive: true });
      const final = path2.join(opts.cacheDir, got), tmp = `${final}.tmp${process.pid}`;
      fs3.writeFileSync(tmp, out);
      fs3.renameSync(tmp, final);
    }
    return out;
  }
  async #getTree(sig, head, wantSha, wantSize, opts, secondTry) {
    if (head.length < HEAD_FIXED + SIG || (head.length - HEAD_FIXED) % SIG) throw new Error(`malformed head ${sig}`);
    const depth = head[3], leafSize = head.readUInt16LE(4), size = Number(head.readBigUInt64LE(6));
    const digest = head.subarray(14, 46), hint = head.subarray(46, 46 + SIG);
    if (wantSha && toHex(digest) !== wantSha) throw new Error(`object ${sig} is not the expected content (sha256 differs)`);
    if (depth < 1 || depth > 8 || leafSize < MIN_LEAF || size < 1) throw new Error(`malformed head ${sig}`);
    if (wantSize !== null && size !== wantSize) throw new Error(`object ${sig} has ${size} bytes, expected ${wantSize}`);
    const limit = opts.maxSize ?? MAX_OBJECT;
    if (wantSize === null && size > limit) throw new Error(`object ${sig} claims ${size} bytes, more than the ${limit} accepted here`);
    const leafCount = Math.ceil(size / leafSize);
    const split = (b) => {
      const r = [];
      for (let at = 0; at < b.length; at += SIG) r.push(b.subarray(at, at + SIG));
      return r;
    };
    const partBase = opts.cacheDir ? path2.join(opts.cacheDir, `${toHex(digest)}.${sig.slice(0, 16)}.part`) : null;
    const wipe = () => {
      if (partBase) for (const ext of [".data", ".done", ".sigs"]) fs3.rmSync(partBase + ext, { force: true });
    };
    if (opts.cacheDir) fs3.mkdirSync(opts.cacheDir, { recursive: true });
    const out = Buffer.alloc(size);
    const have = new Uint8Array(leafCount);
    let done = 0, bytes = 0, fromDisk = 0;
    let fd = null, doneFd = null;
    if (partBase) {
      if (fs3.existsSync(`${partBase}.data`) && fs3.existsSync(`${partBase}.done`) && fs3.statSync(`${partBase}.data`).size === size) {
        const d = fs3.readFileSync(`${partBase}.done`), prev = fs3.readFileSync(`${partBase}.data`);
        for (let i = 0; i + 4 <= d.length; i += 4) {
          const idx = d.readUInt32LE(i);
          if (idx < leafCount && !have[idx]) {
            have[idx] = 1;
            done++;
            fromDisk++;
            const from = idx * leafSize, to = Math.min(size, from + leafSize);
            prev.copy(out, from, from, to);
            bytes += to - from;
          }
        }
        fd = fs3.openSync(`${partBase}.data`, "r+");
      } else {
        fd = fs3.openSync(`${partBase}.data`, "w+");
        fs3.ftruncateSync(fd, size);
        fs3.writeFileSync(`${partBase}.done`, "");
      }
      doneFd = fs3.openSync(`${partBase}.done`, "a");
    }
    const report = () => opts.onProgress?.({ total: leafCount, done, bytes, size });
    report();
    try {
      let blocks = /* @__PURE__ */ new Map();
      if (done < leafCount && opts.mode !== "transactions" && !equal(hint, NO_HINT)) {
        try {
          const slots = decodeSlots(await this.get(b58encode(hint), { signers: opts.signers, signal: opts.signal, mode: "transactions" }));
          const nodes = (leafCount - done) * (1 + 1 / Math.max(2, Math.floor(leafSize / SIG)));
          if (slots.length && nodes / slots.length >= BLOCK_MODE_MIN_DENSITY) {
            let seen = 0, seenBytes = 0;
            blocks = await this.#fetchBlocks(slots, opts, (n) => {
              seen++;
              seenBytes += n;
              if (seen % 32 === 0) opts.onProgress?.({ total: leafCount, done: Math.min(leafCount, done + seen), bytes: Math.min(size, bytes + seenBytes), size });
            });
          }
        } catch (e) {
          if (e instanceof TrustError) throw e;
        }
      }
      if (opts.signal?.aborted) throw new Error("download aborted");
      const fetched = /* @__PURE__ */ new Map();
      const node = (s, kind, verify2) => {
        const id2 = `${key(s)}${kind}${verify2 ? "v" : ""}`;
        let p = fetched.get(id2);
        if (!p) {
          p = fetchNode(s, kind, verify2);
          fetched.set(id2, p);
          p.catch(() => {
            if (fetched.get(id2) === p) fetched.delete(id2);
          });
        }
        return p;
      };
      const fetchNode = async (s, kind, verify2) => {
        let tx = blocks.get(key(s));
        if (tx && verify2 && !verifyPayerSignature(tx)) tx = void 0;
        tx ??= (await this.#fetchTx(b58encode(s), opts, verify2)).tx;
        const data = _ChainStore.#payload(tx);
        if (!data) throw new Error(`transaction ${b58encode(s)} does not carry chainboot data`);
        if (data[1] !== kind) throw new Error(`unexpected node kind ${data[1]} in ${b58encode(s)} (wanted ${kind})`);
        return { data: data.subarray(2), tx };
      };
      let leafSigs = null, sigsFromDisk = false;
      if (partBase && fs3.existsSync(`${partBase}.sigs`)) {
        const s = fs3.readFileSync(`${partBase}.sigs`);
        if (s.length === leafCount * SIG) {
          leafSigs = split(s);
          sigsFromDisk = true;
        }
      }
      if (!leafSigs) {
        let level = split(head.subarray(HEAD_FIXED));
        for (let d = depth; d > 1; d--) {
          const nodes = await Promise.all(level.map((s) => node(s, KIND_BRANCH, true)));
          level = [];
          for (const n of nodes) {
            if (!n.data.length || n.data.length % SIG) throw new Error(`malformed branch in object ${sig}`);
            for (const s of split(n.data)) level.push(s);
            if (level.length > leafCount) throw new Error(`object ${sig} is inconsistent: more pieces than its ${size} bytes need`);
          }
        }
        if (level.length !== leafCount) throw new Error(`object ${sig} is inconsistent: ${level.length} leaves for ${size} bytes`);
        leafSigs = level;
        if (partBase) fs3.writeFileSync(`${partBase}.sigs`, concat(leafSigs));
      }
      const leafTx = new Array(leafCount);
      const place = (i, leaf) => {
        const from = i * leafSize, len = Math.min(leafSize, size - from);
        if (leaf.length !== len) throw new Error(`leaf ${i} of object ${sig} has ${leaf.length} bytes, expected ${len}`);
        leaf.copy(out, from);
        if (fd !== null && doneFd !== null && !have[i]) {
          fs3.writeSync(fd, leaf, 0, len, from);
          const rec = Buffer.alloc(4);
          rec.writeUInt32LE(i);
          fs3.writeSync(doneFd, rec);
        }
        if (!have[i]) {
          have[i] = 1;
          done++;
          bytes += len;
        }
      };
      const fetchLeaves = async (indexes, verify2) => {
        let failed = null;
        await Promise.all(indexes.map(async (i) => {
          if (failed) return;
          try {
            let n;
            try {
              n = await node(leafSigs[i], KIND_LEAF, verify2);
              place(i, n.data);
            } catch (e) {
              if (verify2 || e instanceof TrustError) throw e;
              blocks.delete(key(leafSigs[i]));
              n = await node(leafSigs[i], KIND_LEAF, true);
              place(i, n.data);
            }
            leafTx[i] = n.tx;
            if (done % 64 === 0 || done === leafCount) report();
          } catch (e) {
            failed ??= e;
          }
        }));
        if (failed) throw failed;
      };
      const missing = [];
      for (let i = 0; i < leafCount; i++) if (!have[i]) missing.push(i);
      try {
        await fetchLeaves(missing, false);
      } catch (e) {
        if (!sigsFromDisk || secondTry || opts.signal?.aborted) throw e;
        if (fd !== null) {
          fs3.closeSync(fd);
          fd = null;
        }
        if (doneFd !== null) {
          fs3.closeSync(doneFd);
          doneFd = null;
        }
        wipe();
        return await this.#getTree(sig, head, wantSha, wantSize, opts, true);
      }
      report();
      if (!equal(sha256(out), digest)) {
        const bad = [];
        for (let i = 0; i < leafCount; i++) {
          const t = leafTx[i];
          if (t && !verifyPayerSignature(t)) bad.push(i);
        }
        for (const i of bad) blocks.delete(key(leafSigs[i]));
        if (bad.length) await fetchLeaves(bad, true);
        if (!equal(sha256(out), digest)) {
          wipe();
          if (fromDisk > 0 && !secondTry) {
            if (fd !== null) {
              fs3.closeSync(fd);
              fd = null;
            }
            if (doneFd !== null) {
              fs3.closeSync(doneFd);
              doneFd = null;
            }
            return await this.#getTree(sig, head, wantSha, wantSize, opts, true);
          }
          throw new Error(`object ${sig} failed verification: the downloaded bytes do not match its SHA-256`);
        }
      }
    } finally {
      if (fd !== null) fs3.closeSync(fd);
      if (doneFd !== null) fs3.closeSync(doneFd);
    }
    wipe();
    return out;
  }
  /**
   * Newest pointer record under `tag` that was published by one of `signers`.
   * Records by anyone else are ignored, so nobody can redirect your pointer.
   *
   * "Newest" is a question an endpoint could answer wrongly: by being behind, by hiding the
   * latest transactions, or by claiming that an old one is recent. So several endpoints are
   * asked and their lists are merged, every candidate is verified by signature and must name
   * the tag, and between candidates the sequence number that their writer signed decides. An
   * endpoint can then neither add a record nor pass off an old one as the newest; one honest,
   * up-to-date endpoint is enough.
   *
   * Returns null only when the address has no record by these signers. When that cannot be
   * found out (endpoints fail, or the address is buried under other people's transactions),
   * it throws: "nothing there" must never be a guess, because writers start over from it.
   */
  async getPointer(tag, signers, opts = {}) {
    let inAccount = null;
    if (opts.accounts !== false && signers.length === 1) {
      const a = await this.#account(signers[0], tag, opts.endpoints ?? 2).catch(() => null);
      if (a?.record?.payload) {
        inAccount = { payload: a.record.payload, signature: "", slot: 0, blockTime: Number(a.record.seq / 1000n), payer: Buffer.from(signers[0]), seq: a.record.seq, account: a.address };
        if (a.agreed) return inAccount;
      }
    }
    const inTransactions = await this.#newest(tag, signers, opts);
    if (inAccount && (!inTransactions || inAccount.seq > inTransactions.seq)) return inAccount;
    return inTransactions;
  }
  /**
   * Every pointer record on the newest page of `tag`'s history, newest first, whoever wrote it
   * (or only those of `signers`). For tags that anybody may write to, such as an inbox: what a
   * record says is for the reader to judge.
   */
  async listPointers(tag, opts = {}) {
    const page = await this.#page(tag, Math.min(opts.limit ?? 50, POINTER_PAGE), opts.endpoints ?? 3, void 0, true);
    const all = [];
    for (let at = 0; at < page.candidates.length; at += 16) {
      const records = await Promise.all(page.candidates.slice(at, at + 16).map((c) => this.#record(c, tag, opts.signers, page.lists > 1)));
      for (const r of records) if (r) all.push(r);
    }
    return all;
  }
  /**
   * One page of the history of `tag`, merged from several endpoints: the signatures that are
   * candidates for pointer records, newest first, with how many endpoints named each.
   */
  async #page(tag, limit, endpoints, before, first) {
    const params = [b58encode(tag), { limit, commitment: "confirmed", ...before && { before } }];
    const usable = (answers) => answers.filter(Array.isArray);
    let lists = usable((await this.pool.askEach("getSignaturesForAddress", params, endpoints)).answers);
    const need = Math.min(2, this.pool.size);
    if (lists.length < need) {
      const again = usable((await this.pool.askEach("getSignaturesForAddress", params, Math.min(Math.max(this.pool.size, 1), endpoints + 3))).answers);
      if (again.length > lists.length) lists = again;
    }
    if (!lists.length) lists = usable([await this.pool.call("getSignaturesForAddress", params)]);
    if (!lists.length) throw new Error("malformed getSignaturesForAddress answer");
    lists = lists.map((l) => l.slice(0, limit));
    const seen = /* @__PURE__ */ new Map();
    for (const list of lists) {
      list.forEach((entry, order2) => {
        if (!entry || typeof entry.signature !== "string" || entry.signature.length > 90) return;
        let c = seen.get(entry.signature);
        if (!c) {
          c = { signature: entry.signature, slot: 0, votes: 0, mentions: 0, order: order2, claims: [], ok: 0 };
          seen.set(entry.signature, c);
        }
        c.mentions++;
        if (!entry.err) {
          c.ok++;
          c.claims.push(typeof entry.slot === "number" ? entry.slot : 0);
        }
      });
    }
    for (const c of seen.values()) settle(c);
    const candidates = [...seen.values()].filter((c) => c.ok > 0).sort((a, b) => b.slot - a.slot || a.order - b.order);
    const full = lists.filter((l) => l.length >= limit);
    let next;
    for (const l of full) {
      const last = l[l.length - 1], c = last && typeof last.signature === "string" ? seen.get(last.signature) : void 0;
      if (c && (!next || c.mentions > next.mentions || c.mentions === next.mentions && c.slot > next.slot)) next = c;
    }
    return { candidates, lists: lists.length, more: !!next, next: next?.signature };
  }
  /** The pointer record a listed transaction holds, or null when it is none (not a pointer, not under this tag, not by a trusted key). */
  async #record(c, tag, signers, several) {
    try {
      const { tx, result } = await this.#fetchTx(c.signature, { signers }, true, several && c.votes === 1 ? 2 : void 0);
      if (!tx.accountKeys.some((k) => equal(k, tag))) return null;
      const data = _ChainStore.#payload(tx);
      if (!data || data[1] !== KIND_POINTER) return null;
      let seq = 0n, payload;
      if (data[2] === 1) payload = Buffer.from(data.subarray(3));
      else if (data[2] === POINTER_VERSION && data.length >= POINTER_HEAD) {
        seq = data.readBigUInt64LE(3);
        payload = Buffer.from(data.subarray(POINTER_HEAD));
      } else return null;
      return { payload, signature: c.signature, slot: result.slot, blockTime: result.blockTime ?? null, payer: Buffer.from(tx.accountKeys[0]), seq };
    } catch (e) {
      if (e instanceof TrustError) return null;
      if (several && c.votes === 1) return null;
      throw e;
    }
  }
  /** The newest record by `signers` in the transactions that name `tag`. */
  async #newest(tag, signers, opts) {
    const pages = Math.max(1, Math.min(opts.pages ?? POINTER_PAGES, POINTER_PAGES));
    let best = null;
    let before;
    for (let n = 0; n < pages; n++) {
      const page = await this.#page(tag, n === 0 ? Math.min(opts.limit ?? 50, POINTER_PAGE) : POINTER_PAGE, opts.endpoints ?? 3, before, n === 0);
      const several = page.lists > 1;
      let size = 1;
      while (several && size < page.candidates.length && page.candidates[size - 1].votes === 1) size++;
      for (let at = 0; at < page.candidates.length; at += size, size = Math.min(32, size * 4)) {
        const window = page.candidates.slice(at, at + size);
        const records = await Promise.all(window.map((c) => this.#record(c, tag, signers, several)));
        for (let k = 0; k < window.length; k++) {
          const record = records[k];
          if (!record) continue;
          const confirmed = !several || window[k].votes > 1;
          if (!best || record.seq > best.record.seq || record.seq === best.record.seq && confirmed && !best.confirmed) best = { record, confirmed };
          if (confirmed) return best.record;
        }
      }
      if (!page.more) return best?.record ?? null;
      before = page.next;
    }
    if (best) return best.record;
    if (opts.pages !== void 0) return null;
    throw new Error(`the newest ${POINTER_PAGES * POINTER_PAGE} transactions under ${b58encode(tag)} are all by other keys, so the pointer kept there cannot be found. (Somebody is flooding this address. Pointers kept in accounts are not affected: chainboot accounts on)`);
  }
};
function settle(c) {
  const count = /* @__PURE__ */ new Map();
  for (const s of c.claims) count.set(s, (count.get(s) ?? 0) + 1);
  let slot = 0, n = 0;
  for (const [s, k] of count) if (k > n || k === n && s > slot) {
    slot = s;
    n = k;
  }
  c.votes = n >= 2 ? n : 1;
  c.slot = n >= 2 ? slot : Math.max(0, ...c.claims);
}
var TrustError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "TrustError";
  }
};

// src/codec/index.ts
import { spawnSync } from "node:child_process";
import zlib from "node:zlib";

// src/codec/xz.ts
import { createHash as createHash5 } from "node:crypto";

// src/codec/xz-core.ts
var u32le2 = (b, at) => (b[at] | b[at + 1] << 8 | b[at + 2] << 16 | b[at + 3] << 24) >>> 0;
var u32be = (b, at) => (b[at] << 24 | b[at + 1] << 16 | b[at + 2] << 8 | b[at + 3]) >>> 0;
var crcTable = null;
function crc32(data) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c2 = i;
      for (let k = 0; k < 8; k++) c2 = c2 & 1 ? 3988292384 ^ c2 >>> 1 : c2 >>> 1;
      crcTable[i] = c2 >>> 0;
    }
  }
  let c = 4294967295;
  for (let i = 0; i < data.length; i++) c = crcTable[(c ^ data[i]) & 255] ^ c >>> 8;
  return ~c >>> 0;
}
var FILTER_LZMA2 = 0x21n;
var FILTER_X86 = 0x04n;
var FILTER_ARM64 = 0x0an;
var XzError = class extends Error {
  constructor(message) {
    super(`xz: ${message}`);
    this.name = "XzError";
  }
};
function vli(buf, at, end) {
  let value = 0n;
  for (let i = 0; i < 9; i++) {
    if (at + i >= end) throw new XzError("truncated number");
    const b = buf[at + i];
    value |= BigInt(b & 127) << BigInt(7 * i);
    if ((b & 128) === 0) {
      if (b === 0 && i > 0) throw new XzError("malformed number");
      return { value, next: at + i + 1 };
    }
  }
  throw new XzError("malformed number");
}
var CHECK_SIZE = [0, 4, 4, 4, 8, 8, 8, 16, 16, 16, 32, 32, 32, 64, 64, 64];
function xzUncompressedSize(input) {
  return parseIndex(input).total;
}
function parseIndex(input) {
  const buf = input;
  if (buf.length < 32 || u32be(buf, 0) !== 4248271448 || buf[4] !== 90 || buf[5] !== 0) throw new XzError("not an xz file");
  if (buf[6] !== 0 || buf[7] > 15) throw new XzError("unsupported stream flags");
  if (crc32(buf.subarray(6, 8)) !== u32le2(buf, 8)) throw new XzError("corrupt stream header");
  const end = buf.length;
  if (buf[end - 2] !== 89 || buf[end - 1] !== 90) throw new XzError("truncated file or unsupported trailing data");
  if (crc32(buf.subarray(end - 8, end - 2)) !== u32le2(buf, end - 12)) throw new XzError("corrupt stream footer");
  if (buf[end - 4] !== buf[6] || buf[end - 3] !== buf[7]) throw new XzError("stream header and footer disagree");
  const indexSize = (u32le2(buf, end - 8) + 1) * 4;
  const indexStart = end - 12 - indexSize;
  if (indexStart < 12 || buf[indexStart] !== 0) throw new XzError("corrupt index");
  if (crc32(buf.subarray(indexStart, end - 16)) !== u32le2(buf, end - 16)) throw new XzError("corrupt index");
  let at = indexStart + 1;
  const count = vli(buf, at, end - 16);
  at = count.next;
  let total = 0n;
  for (let i = 0n; i < count.value; i++) {
    const unpadded = vli(buf, at, end - 16);
    at = unpadded.next;
    const size = vli(buf, at, end - 16);
    at = size.next;
    total += size.value;
  }
  if (total > 0xffffffffn) throw new XzError("content larger than 4 GiB is not supported");
  return { total: Number(total), indexStart, checkType: buf[7] };
}
function xzDecodeBytes(input, sha2562) {
  const buf = input;
  const { total, indexStart, checkType } = parseIndex(buf);
  const out = new Uint8Array(total);
  let at = 12, outPos = 0;
  while (at < indexStart) {
    const headerSize = (buf[at] + 1) * 4;
    if (buf[at] === 0 || at + headerSize > indexStart) throw new XzError("corrupt block header");
    if (crc32(buf.subarray(at, at + headerSize - 4)) !== u32le2(buf, at + headerSize - 4)) throw new XzError("corrupt block header");
    const flags = buf[at + 1];
    if (flags & 60) throw new XzError("unsupported block flags");
    let p = at + 2;
    const hEnd = at + headerSize - 4;
    if (flags & 64) p = vli(buf, p, hEnd).next;
    let declared = -1;
    if (flags & 128) {
      const v = vli(buf, p, hEnd);
      p = v.next;
      declared = Number(v.value);
    }
    const filters = [];
    for (let i = 0; i <= (flags & 3); i++) {
      const id2 = vli(buf, p, hEnd);
      p = id2.next;
      const n = vli(buf, p, hEnd);
      p = n.next;
      const len = Number(n.value);
      if (p + len > hEnd) throw new XzError("corrupt filter list");
      filters.push({ id: id2.value, props: buf.subarray(p, p + len) });
      p += len;
    }
    for (; p < hEnd; p++) if (buf[p] !== 0) throw new XzError("corrupt block header padding");
    const last = filters.at(-1);
    if (last.id !== FILTER_LZMA2 || last.props.length !== 1) throw new XzError("the last filter must be LZMA2");
    for (const f of filters.slice(0, -1)) {
      if (f.id !== FILTER_X86 && f.id !== FILTER_ARM64) throw new XzError(`unsupported filter 0x${f.id.toString(16)}`);
      if (f.props.length !== 0) throw new XzError("filters with a start offset are not supported");
    }
    const dictBits = last.props[0];
    if (dictBits > 40) throw new XzError("unsupported dictionary size");
    const dictSize = dictBits === 40 ? 4294967295 : (2 | dictBits & 1) * 2 ** ((dictBits >> 1) + 11);
    const start = at + headerSize, blockOut = outPos;
    const dec = new Lzma2(buf, start, indexStart, out, outPos, dictSize);
    dec.run();
    outPos = dec.outPos;
    if (declared >= 0 && outPos - blockOut !== declared) throw new XzError("block size does not match its header");
    const block = out.subarray(blockOut, outPos);
    for (let i = filters.length - 2; i >= 0; i--) {
      if (filters[i].id === FILTER_X86) bcjX86(block);
      else bcjArm64(block);
    }
    at = dec.inPos;
    while (at - start & 3) {
      if (buf[at] !== 0) throw new XzError("corrupt block padding");
      at++;
    }
    const checkSize = CHECK_SIZE[checkType];
    if (at + checkSize > indexStart) throw new XzError("truncated block");
    const check = buf.subarray(at, at + checkSize);
    if (checkType === 1) {
      if (crc32(block) !== u32le2(check, 0)) throw new XzError("data failed its CRC32 check");
    } else if (checkType === 4) {
      const [lo, hi] = crc64(block);
      if (lo !== u32le2(check, 0) || hi !== u32le2(check, 4)) throw new XzError("data failed its CRC64 check");
    } else if (checkType === 10 && sha2562) {
      const d = sha2562(block);
      if (d.length !== 32 || d.some((b, i) => b !== check[i])) throw new XzError("data failed its SHA-256 check");
    }
    at += checkSize;
  }
  if (at !== indexStart || outPos !== total) throw new XzError("content does not match the index");
  return out;
}
var crcLo = null;
var crcHi = null;
function crc64(data) {
  if (!crcLo || !crcHi) {
    crcLo = new Uint32Array(256);
    crcHi = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let lo2 = i, hi2 = 0;
      for (let k = 0; k < 8; k++) {
        const bit = lo2 & 1;
        lo2 = (lo2 >>> 1 | hi2 << 31) >>> 0;
        hi2 >>>= 1;
        if (bit) {
          lo2 = (lo2 ^ 3615952706) >>> 0;
          hi2 = (hi2 ^ 3379320725) >>> 0;
        }
      }
      crcLo[i] = lo2;
      crcHi[i] = hi2;
    }
  }
  let lo = 4294967295, hi = 4294967295;
  for (let i = 0; i < data.length; i++) {
    const idx = (lo ^ data[i]) & 255;
    lo = (crcLo[idx] ^ (lo >>> 8 | hi << 24)) >>> 0;
    hi = (crcHi[idx] ^ hi >>> 8) >>> 0;
  }
  return [~lo >>> 0, ~hi >>> 0];
}
function bcjX86(buf) {
  const ALLOWED = [true, true, true, false, true, false, false, false];
  const BIT_NUM = [0, 1, 2, 2, 3, 3, 3, 3];
  if (buf.length <= 4) return;
  const size = buf.length - 4;
  let prevPos = -1, prevMask = 0;
  const msbyte = (b) => b === 0 || b === 255;
  for (let i = 0; i < size; i++) {
    if ((buf[i] & 254) !== 232) continue;
    const gap = i - prevPos;
    if (gap > 3) {
      prevMask = 0;
    } else {
      prevMask = prevMask << gap - 1 & 7;
      if (prevMask !== 0) {
        const b = buf[i + 4 - BIT_NUM[prevMask]];
        if (!ALLOWED[prevMask] || msbyte(b)) {
          prevPos = i;
          prevMask = (prevMask << 1 | 1) & 255;
          continue;
        }
      }
    }
    prevPos = i;
    if (msbyte(buf[i + 4])) {
      let src = (buf[i + 1] | buf[i + 2] << 8 | buf[i + 3] << 16 | buf[i + 4] << 24) >>> 0;
      let dest;
      for (; ; ) {
        dest = src - (i + 5) >>> 0;
        if (prevMask === 0) break;
        const j = BIT_NUM[prevMask] * 8;
        const b = dest >>> 24 - j & 255;
        if (!msbyte(b)) break;
        src = (dest ^ 2 ** (32 - j) - 1) >>> 0;
      }
      dest &= 33554431;
      dest = (dest | 0 - (dest & 16777216)) >>> 0;
      buf[i + 1] = dest & 255;
      buf[i + 2] = dest >>> 8 & 255;
      buf[i + 3] = dest >>> 16 & 255;
      buf[i + 4] = dest >>> 24;
      i += 4;
    } else {
      prevMask = (prevMask << 1 | 1) & 255;
    }
  }
}
function bcjArm64(buf) {
  for (let i = 0; i + 4 <= buf.length; i += 4) {
    let instr = (buf[i] | buf[i + 1] << 8 | buf[i + 2] << 16 | buf[i + 3] << 24) >>> 0;
    if ((instr & 4227858432) >>> 0 === 2483027968) {
      const addr = instr - (i >>> 2) >>> 0;
      instr = (2483027968 | addr & 67108863) >>> 0;
    } else if ((instr & 2667577344) >>> 0 === 2415919104) {
      let addr = instr >>> 29 & 3 | instr >>> 3 & 2097148;
      if (addr + 131072 & 1835008) continue;
      addr = addr - (i >>> 12) >>> 0;
      instr = (instr & 2415919135) >>> 0;
      instr = (instr | (addr & 3) << 29) >>> 0;
      instr = (instr | (addr & 262140) << 3) >>> 0;
      instr = (instr | 0 - (addr & 131072) & 14680064) >>> 0;
    } else continue;
    buf[i] = instr & 255;
    buf[i + 1] = instr >>> 8 & 255;
    buf[i + 2] = instr >>> 16 & 255;
    buf[i + 3] = instr >>> 24;
  }
}
var IS_MATCH = 0;
var IS_REP = 192;
var IS_REP_G0 = 204;
var IS_REP_G1 = 216;
var IS_REP_G2 = 228;
var IS_REP0_LONG = 240;
var POS_SLOT = 432;
var SPEC_POS = 688;
var ALIGN = 803;
var LEN = 819;
var REP_LEN = 1333;
var LIT = 1847;
var Lzma2 = class {
  #in;
  #inEnd;
  #out;
  #dictSize;
  #probs = new Uint16Array(LIT + (768 << 4));
  inPos;
  outPos;
  #dictStart;
  // output position of the last dictionary reset
  #range = 0;
  #code = 0;
  #state = 0;
  #rep0 = 0;
  #rep1 = 0;
  #rep2 = 0;
  #rep3 = 0;
  #lc = 0;
  #lpMask = 0;
  #pbMask = 0;
  constructor(input, inPos, inEnd, out, outPos, dictSize) {
    this.#in = input;
    this.inPos = inPos;
    this.#inEnd = inEnd;
    this.#out = out;
    this.outPos = outPos;
    this.#dictStart = outPos;
    this.#dictSize = dictSize;
  }
  run() {
    const inp = this.#in;
    let needDictReset = true, needProps = true;
    for (; ; ) {
      if (this.inPos >= this.#inEnd) throw new XzError("truncated data");
      const control = inp[this.inPos++];
      if (control === 0) return;
      if (control >= 224 || control === 1) {
        needProps = true;
        needDictReset = false;
        this.#dictStart = this.outPos;
      } else if (needDictReset) throw new XzError("corrupt data (missing dictionary reset)");
      if (control < 128) {
        if (control > 2) throw new XzError("corrupt data (bad chunk type)");
        if (this.inPos + 2 > this.#inEnd) throw new XzError("truncated data");
        const size = (inp[this.inPos] << 8 | inp[this.inPos + 1]) + 1;
        this.inPos += 2;
        if (this.inPos + size > this.#inEnd || this.outPos + size > this.#out.length) throw new XzError("corrupt data (chunk too large)");
        this.#out.set(inp.subarray(this.inPos, this.inPos + size), this.outPos);
        this.inPos += size;
        this.outPos += size;
        continue;
      }
      if (this.inPos + 4 > this.#inEnd) throw new XzError("truncated data");
      const unpacked = ((control & 31) << 16 | inp[this.inPos] << 8 | inp[this.inPos + 1]) + 1;
      const packed = (inp[this.inPos + 2] << 8 | inp[this.inPos + 3]) + 1;
      this.inPos += 4;
      if (control >= 192) {
        if (this.inPos >= this.#inEnd) throw new XzError("truncated data");
        let d = inp[this.inPos++];
        if (d > 4 * 5 * 9 + 8) throw new XzError("corrupt data (bad properties)");
        const pb = Math.floor(d / 45);
        d -= pb * 45;
        const lp = Math.floor(d / 9), lc = d - lp * 9;
        if (lc + lp > 4) throw new XzError("corrupt data (bad properties)");
        this.#lc = lc;
        this.#lpMask = (1 << lp) - 1;
        this.#pbMask = (1 << pb) - 1;
        needProps = false;
      } else if (needProps) throw new XzError("corrupt data (missing properties)");
      if (control >= 160) {
        this.#probs.fill(1024);
        this.#state = 0;
        this.#rep0 = this.#rep1 = this.#rep2 = this.#rep3 = 0;
      }
      if (packed < 5 || this.inPos + packed > this.#inEnd || this.outPos + unpacked > this.#out.length) throw new XzError("corrupt data (chunk too large)");
      this.#lzma(this.inPos + packed, this.outPos + unpacked);
    }
  }
  // Decodes one LZMA chunk. Kept as a single function with local variables: this loop is the hot path.
  #lzma(inEnd, outEnd) {
    const inp = this.#in, out = this.#out, probs = this.#probs;
    const lc = this.#lc, lpMask = this.#lpMask, pbMask = this.#pbMask;
    const dictStart = this.#dictStart, dictSize = this.#dictSize;
    let inPos = this.inPos, pos = this.outPos;
    let state = this.#state, rep0 = this.#rep0, rep1 = this.#rep1, rep2 = this.#rep2, rep3 = this.#rep3;
    if (inp[inPos] !== 0) throw new XzError("corrupt data (range coder)");
    let code = (inp[inPos + 1] << 24 | inp[inPos + 2] << 16 | inp[inPos + 3] << 8 | inp[inPos + 4]) >>> 0;
    let range = 4294967295;
    inPos += 5;
    const bit = (i) => {
      if (range < 16777216) {
        range = range << 8 >>> 0;
        code = (code << 8 | inp[inPos++]) >>> 0;
      }
      const p = probs[i];
      const bound = (range >>> 11) * p;
      if (code < bound) {
        range = bound;
        probs[i] = p + (2048 - p >>> 5);
        return 0;
      }
      range = range - bound >>> 0;
      code = code - bound >>> 0;
      probs[i] = p - (p >>> 5);
      return 1;
    };
    const tree = (base, bits) => {
      let m = 1;
      for (let i = 0; i < bits; i++) m = m << 1 | bit(base + m);
      return m - (1 << bits);
    };
    const reverse = (base, bits) => {
      let m = 1, sym = 0;
      for (let i = 0; i < bits; i++) {
        const b = bit(base + m);
        m = m << 1 | b;
        sym |= b << i;
      }
      return sym;
    };
    const length = (base, posState) => {
      if (bit(base) === 0) return tree(base + 2 + (posState << 3), 3);
      if (bit(base + 1) === 0) return 8 + tree(base + 130 + (posState << 3), 3);
      return 16 + tree(base + 258, 8);
    };
    while (pos < outEnd) {
      if (inPos > inEnd) throw new XzError("corrupt data (chunk overrun)");
      const posState = pos - dictStart & pbMask;
      if (bit(IS_MATCH + (state << 4) + posState) === 0) {
        const prev = pos > dictStart ? out[pos - 1] : 0;
        const base = LIT + 768 * (((pos - dictStart & lpMask) << lc) + (prev >>> 8 - lc));
        let symbol = 1;
        if (state >= 7) {
          let matchByte = out[pos - rep0 - 1];
          do {
            const matchBit = matchByte >>> 7 & 1;
            matchByte = matchByte << 1 & 255;
            const b = bit(base + (1 + matchBit << 8) + symbol);
            symbol = symbol << 1 | b;
            if (matchBit !== b) break;
          } while (symbol < 256);
        }
        while (symbol < 256) symbol = symbol << 1 | bit(base + symbol);
        out[pos++] = symbol & 255;
        state = state < 4 ? 0 : state < 10 ? state - 3 : state - 6;
        continue;
      }
      let len;
      if (bit(IS_REP + state) !== 0) {
        if (pos === dictStart) throw new XzError("corrupt data (repeat without history)");
        if (bit(IS_REP_G0 + state) === 0) {
          if (bit(IS_REP0_LONG + (state << 4) + posState) === 0) {
            state = state < 7 ? 9 : 11;
            out[pos] = out[pos - rep0 - 1];
            pos++;
            continue;
          }
        } else {
          let dist;
          if (bit(IS_REP_G1 + state) === 0) dist = rep1;
          else {
            if (bit(IS_REP_G2 + state) === 0) dist = rep2;
            else {
              dist = rep3;
              rep3 = rep2;
            }
            rep2 = rep1;
          }
          rep1 = rep0;
          rep0 = dist;
        }
        len = length(REP_LEN, posState);
        state = state < 7 ? 8 : 11;
      } else {
        rep3 = rep2;
        rep2 = rep1;
        rep1 = rep0;
        len = length(LEN, posState);
        state = state < 7 ? 7 : 10;
        const slot = tree(POS_SLOT + ((len < 4 ? len : 3) << 6), 6);
        if (slot < 4) rep0 = slot;
        else {
          const direct = (slot >>> 1) - 1;
          rep0 = (2 | slot & 1) << direct >>> 0;
          if (slot < 14) rep0 += reverse(SPEC_POS + rep0 - slot, direct);
          else {
            let n = direct - 4, d = 0;
            while (n-- > 0) {
              if (range < 16777216) {
                range = range << 8 >>> 0;
                code = (code << 8 | inp[inPos++]) >>> 0;
              }
              range >>>= 1;
              if (code >= range) {
                code = code - range >>> 0;
                d = d << 1 | 1;
              } else d <<= 1;
            }
            rep0 = rep0 + (d << 4 >>> 0) + reverse(ALIGN, 4) >>> 0;
          }
        }
        if (rep0 === 4294967295) throw new XzError("corrupt data (unexpected end marker)");
      }
      len += 2;
      if (rep0 >= pos - dictStart || rep0 >= dictSize) throw new XzError("corrupt data (distance beyond history)");
      if (pos + len > outEnd) throw new XzError("corrupt data (match crosses chunk end)");
      const from = pos - rep0 - 1;
      if (rep0 + 1 >= len) {
        out.copyWithin(pos, from, from + len);
        pos += len;
      } else {
        for (let i = 0; i < len; i++) out[pos + i] = out[from + i];
        pos += len;
      }
    }
    if (range < 16777216) {
      range = range << 8 >>> 0;
      code = (code << 8 | inp[inPos++]) >>> 0;
    }
    if (inPos !== inEnd || code !== 0) throw new XzError("corrupt data (chunk size mismatch)");
    this.inPos = inPos;
    this.outPos = pos;
    this.#state = state;
    this.#rep0 = rep0;
    this.#rep1 = rep1;
    this.#rep2 = rep2;
    this.#rep3 = rep3;
  }
};

// src/codec/xz.ts
function xzDecode(input) {
  const out = xzDecodeBytes(input, (data) => createHash5("sha256").update(data).digest());
  return Buffer.from(out.buffer, out.byteOffset, out.byteLength);
}

// src/codec/index.ts
var xzAvailable = null;
function hasXzTool() {
  xzAvailable ??= spawnSync("xz", ["--version"], { stdio: "ignore" }).status === 0;
  return xzAvailable;
}
var MAX_DICT = 128 << 20;
function compress(data, opts = {}) {
  const raw = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  const want = opts.codec ?? (hasXzTool() ? "xz" : "zstd");
  let out = null;
  if (want === "xz") {
    if (!hasXzTool()) throw new Error("the `xz` tool is not installed; install it or use the zstd codec");
    let dict = 1 << 16;
    while (dict < raw.length && dict < MAX_DICT) dict <<= 1;
    const filter = opts.arch === "amd64" || opts.arch === "i386" ? ["--x86"] : opts.arch === "arm64" ? ["--arm64"] : [];
    const r = spawnSync("xz", ["-T1", "-c", "--check=crc32", ...filter, `--lzma2=preset=9e,dict=${dict}`], { input: raw, maxBuffer: 4294967295 });
    if (r.status !== 0) throw new Error(`xz failed: ${r.stderr?.toString().trim() || r.error?.message}`);
    out = r.stdout;
  } else if (want === "zstd") {
    const c = zlib.constants;
    out = zlib.zstdCompressSync(raw, { params: { [c.ZSTD_c_compressionLevel]: 22, [c.ZSTD_c_windowLog]: 27, [c.ZSTD_c_enableLongDistanceMatching]: 1 }, pledgedSrcSize: raw.length });
  }
  if (!out || out.length >= raw.length) return { codec: "raw", data: raw };
  return { codec: want, data: out };
}
function xzFast(data, rawSize) {
  if (data.length < 1 << 20 || !hasXzTool()) return null;
  const r = spawnSync("xz", ["-dc"], { input: data, maxBuffer: Math.max(rawSize, 1) + 1024 });
  return r.status === 0 && r.stdout.length === rawSize ? r.stdout : null;
}
function decompress(codec, data, rawSize) {
  let out;
  if (codec === "raw") out = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  else if (codec === "xz") {
    const claimed = xzUncompressedSize(data);
    if (claimed !== rawSize) throw new Error(`decompressed size would be ${claimed}, expected ${rawSize}`);
    out = xzFast(data, rawSize) ?? xzDecode(data);
  } else if (codec === "zstd") out = zlib.zstdDecompressSync(data, { maxOutputLength: Math.max(rawSize, 1) });
  else throw new Error(`unknown codec "${codec}"`);
  if (out.length !== rawSize) throw new Error(`decompressed size is ${out.length}, expected ${rawSize}`);
  return out;
}

// src/image/tar.ts
import zlib2 from "node:zlib";
function decompressAuto(buf) {
  if (buf.length >= 2 && buf[0] === 31 && buf[1] === 139) return zlib2.gunzipSync(buf, { maxOutputLength: 4294967295 });
  if (buf.length >= 6 && buf.readUInt32BE(0) === 4248271448) return xzDecode(buf);
  if (buf.length >= 4 && buf.readUInt32LE(0) === 4247762216) return zlib2.zstdDecompressSync(buf, { maxOutputLength: 4294967295 });
  return buf;
}
function cleanPath(p) {
  const parts = p.split("/").filter((s) => s !== "" && s !== ".");
  if (parts.some((s) => s === "..")) throw new Error(`unsafe path in archive: ${p}`);
  return parts.join("/");
}
function num(field) {
  if (field[0] === 255) return 0;
  if (field[0] & 128) {
    let v = 0;
    for (let i = 1; i < field.length; i++) v = v * 256 + field[i];
    return v;
  }
  const s = field.toString("latin1").replace(/\0.*$/s, "").trim();
  return s ? parseInt(s, 8) : 0;
}
function utf8(bytes) {
  const s = bytes.toString("utf8");
  if (Buffer.byteLength(s) !== bytes.length || s.includes("\uFFFD") && !bytes.includes(Buffer.from("\uFFFD"))) {
    throw new Error(`file name is not valid UTF-8: ${JSON.stringify(s)}`);
  }
  return s;
}
function str(field) {
  const end = field.indexOf(0);
  return utf8(field.subarray(0, end < 0 ? field.length : end));
}
function parsePax(data) {
  const out = /* @__PURE__ */ new Map();
  let at = 0;
  while (at < data.length) {
    const sp = data.indexOf(32, at);
    if (sp < 0) break;
    const len = parseInt(data.subarray(at, sp).toString("latin1"), 10);
    if (!Number.isFinite(len) || len <= 0 || at + len > data.length) throw new Error("corrupt pax header");
    const rec = data.subarray(sp + 1, at + len - 1);
    const eq = rec.indexOf(61);
    if (eq > 0) out.set(rec.subarray(0, eq).toString("utf8"), rec.subarray(eq + 1));
    at += len;
  }
  return out;
}
function readTar(tar) {
  const entries = [];
  let at = 0, pax = null, longName = null, longLink = null;
  let ended = false;
  const whole = (text) => {
    const n = Math.floor(parseFloat(text));
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  while (at + 512 <= tar.length) {
    const h = tar.subarray(at, at + 512);
    if (h.every((b) => b === 0)) {
      ended = true;
      break;
    }
    let sum = 0;
    for (let i = 0; i < 512; i++) sum += i >= 148 && i < 156 ? 32 : h[i];
    if (sum !== num(h.subarray(148, 156))) throw new Error(`corrupt tar header at byte ${at}`);
    let size = num(h.subarray(124, 136));
    const flag = String.fromCharCode(h[156]);
    const body = at + 512;
    if (pax?.has("size")) size = parseInt(pax.get("size").toString("latin1"), 10);
    if (!Number.isSafeInteger(size) || size < 0 || body + size > tar.length) throw new Error("truncated tar archive");
    const next = body + Math.ceil(size / 512) * 512;
    if (flag === "x") {
      pax = parsePax(tar.subarray(body, body + size));
      at = next;
      continue;
    }
    if (flag === "g") {
      at = next;
      continue;
    }
    if (flag === "L") {
      longName = str(tar.subarray(body, body + size));
      at = next;
      continue;
    }
    if (flag === "K") {
      longLink = str(tar.subarray(body, body + size));
      at = next;
      continue;
    }
    const prefix = h.subarray(257, 263).toString("latin1") === "ustar\0" ? str(h.subarray(345, 500)) : "";
    let name = longName ?? (prefix ? `${prefix}/${str(h.subarray(0, 100))}` : str(h.subarray(0, 100)));
    let link = longLink ?? str(h.subarray(157, 257));
    let uid = num(h.subarray(108, 116)), gid = num(h.subarray(116, 124)), mtime = num(h.subarray(136, 148));
    let xattrs;
    if (pax) {
      for (const [k, v] of pax) {
        if (k === "path") name = utf8(v);
        else if (k === "linkpath") link = utf8(v);
        else if (k === "uid") uid = whole(v.toString("latin1"));
        else if (k === "gid") gid = whole(v.toString("latin1"));
        else if (k === "mtime") mtime = whole(v.toString("latin1"));
        else if (k.startsWith("GNU.sparse.")) throw new Error(`the archive stores ${utf8(pax.get("GNU.sparse.name") ?? pax.get("path") ?? Buffer.from(name))} as a sparse file, which chainboot does not read. Make the archive without the --sparse option.`);
        else if (k.startsWith("SCHILY.xattr.")) (xattrs ??= {})[k.slice(13)] = Buffer.from(v);
        else if (k.startsWith("LIBARCHIVE.xattr.")) (xattrs ??= {})[decodeURIComponent(k.slice(17))] = Buffer.from(v.toString("latin1"), "base64");
      }
    }
    pax = null;
    longName = null;
    longLink = null;
    at = next;
    const path9 = cleanPath(name);
    if (!path9) continue;
    const base = { path: path9, mode: num(h.subarray(100, 108)) & 4095, uid, gid, mtime, ...xattrs && { xattrs } };
    switch (flag) {
      case "0":
      case "\0":
      case "7":
        entries.push({ ...base, type: "f", data: tar.subarray(body, body + size) });
        break;
      case "1":
        entries.push({ ...base, type: "h", link: cleanPath(link) });
        break;
      case "2":
        entries.push({ ...base, type: "l", link });
        break;
      case "3":
      case "4":
        entries.push({ ...base, type: flag === "3" ? "c" : "b", major: num(h.subarray(329, 337)), minor: num(h.subarray(337, 345)) });
        break;
      case "5":
        entries.push({ ...base, type: "d" });
        break;
      case "6":
        entries.push({ ...base, type: "p" });
        break;
      default:
        throw new Error(`unsupported tar entry type "${flag}" for ${path9}`);
    }
  }
  if (!ended) throw new Error("truncated tar archive: it has no end marker, so it was cut off somewhere");
  return entries;
}
function octal(value, width) {
  return value.toString(8).padStart(width - 1, "0") + "\0";
}
function header(name, e, size, flag, link) {
  const h = Buffer.alloc(512);
  h.write(name, 0, 100, "utf8");
  h.write(octal(e.mode & 4095, 8), 100, "latin1");
  h.write(octal(Math.min(e.uid, 2097151), 8), 108, "latin1");
  h.write(octal(Math.min(e.gid, 2097151), 8), 116, "latin1");
  h.write(octal(size, 12), 124, "latin1");
  h.write(octal(Math.max(0, e.mtime), 12), 136, "latin1");
  h.fill(32, 148, 156);
  h.write(flag, 156, "latin1");
  h.write(link, 157, 100, "utf8");
  h.write("ustar\x0000", 257, "latin1");
  if (e.type === "c" || e.type === "b") {
    h.write(octal(e.major ?? 0, 8), 329, "latin1");
    h.write(octal(e.minor ?? 0, 8), 337, "latin1");
  }
  let sum = 0;
  for (const b of h) sum += b;
  h.write(sum.toString(8).padStart(6, "0") + "\0 ", 148, "latin1");
  return h;
}
function paxRecord(key2, value) {
  const body = Buffer.concat([Buffer.from(` ${key2}=`, "utf8"), value, Buffer.from("\n")]);
  let len = body.length + String(body.length).length;
  if (String(len).length + body.length !== len) len = String(len).length + body.length;
  return Buffer.concat([Buffer.from(String(len)), body]);
}
var FLAG = { f: "0", h: "1", l: "2", c: "3", b: "4", d: "5", p: "6" };
function tarHead(e, size) {
  const out = [];
  {
    const name = e.type === "d" ? `${e.path}/` : e.path;
    const link = e.link ?? "";
    const records = [];
    if (Buffer.byteLength(name) > 100) records.push(paxRecord("path", Buffer.from(name)));
    if (Buffer.byteLength(link) > 100) records.push(paxRecord("linkpath", Buffer.from(link)));
    if (e.uid > 2097151) records.push(paxRecord("uid", Buffer.from(String(e.uid))));
    if (e.gid > 2097151) records.push(paxRecord("gid", Buffer.from(String(e.gid))));
    if (size > 8589934591) records.push(paxRecord("size", Buffer.from(String(size))));
    for (const [k, v] of Object.entries(e.xattrs ?? {})) records.push(paxRecord(`SCHILY.xattr.${k}`, v));
    if (records.length) {
      const body = Buffer.concat(records);
      out.push(header("PaxHeader", { ...e, type: "f", mode: 420 }, body.length, "x", ""), body, Buffer.alloc((512 - body.length % 512) % 512));
    }
    const short = (s) => Buffer.byteLength(s) > 100 ? Buffer.from(s).subarray(0, 100).toString("latin1") : s;
    out.push(header(short(name), e, Math.min(size, 8589934591), FLAG[e.type], short(link)));
  }
  return out;
}
function tarPadding(size) {
  return Buffer.alloc((512 - size % 512) % 512);
}
var TAR_END = Buffer.alloc(1024);
function writeTar(entries) {
  const out = [];
  for (const e of entries) {
    const size = e.type === "f" ? e.data?.length ?? 0 : 0;
    out.push(...tarHead(e, size));
    if (size) out.push(e.data, tarPadding(size));
  }
  out.push(TAR_END);
  return out;
}

// src/image/build.ts
import { createHash as createHash7 } from "node:crypto";

// src/image/manifest.ts
import { createHash as createHash6 } from "node:crypto";
var MANIFEST_VERSION = 1;
function comparePaths(a, b) {
  return a === b ? 0 : Buffer.compare(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}
function sortedXattrs(x) {
  if (!x || !Object.keys(x).length) return void 0;
  return Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]]));
}
function identityLine(n) {
  switch (n[1]) {
    case "f": {
      const x = sortedXattrs(n[10]);
      return JSON.stringify(x ? [n[0], "f", n[2], n[3], n[4], n[5], n[6], n[7], x] : [n[0], "f", n[2], n[3], n[4], n[5], n[6], n[7]]);
    }
    case "d": {
      const x = sortedXattrs(n[6]);
      return JSON.stringify(x ? [n[0], "d", n[2], n[3], n[4], n[5], x] : [n[0], "d", n[2], n[3], n[4], n[5]]);
    }
    default:
      return JSON.stringify(n);
  }
}
function configIdentity(config) {
  const cmd = config?.cmd?.length ? config.cmd : void 0;
  const names = Object.keys(config?.env ?? {}).sort();
  const env = names.length ? Object.fromEntries(names.map((k) => [k, config.env[k]])) : void 0;
  return cmd || env ? JSON.stringify({ ...cmd && { cmd }, ...env && { env } }) : null;
}
function treeDigest(tree, config) {
  const h = createHash6("sha256");
  h.update(`chainboot-tree-v${MANIFEST_VERSION}
`);
  for (const n of tree) {
    h.update(identityLine(n));
    h.update("\n");
  }
  const c = configIdentity(config);
  if (c) h.update(`config ${c}
`);
  return h.digest("hex");
}
var EMPTY_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
function encodeXattrs(x) {
  if (!x || !Object.keys(x).length) return void 0;
  return Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k].toString("base64")]));
}
function toNode(e, file) {
  const x = encodeXattrs(e.xattrs);
  switch (e.type) {
    case "f": {
      if (!file) throw new Error("file node needs its hash and position");
      const n = [e.path, "f", e.mode, e.uid, e.gid, e.mtime, e.data?.length ?? 0, file.sha256, file.pack, file.offset];
      if (x) n.push(x);
      return n;
    }
    case "d": {
      const n = [e.path, "d", e.mode, e.uid, e.gid, e.mtime];
      if (x) n.push(x);
      return n;
    }
    case "l":
      return [e.path, "l", e.mode, e.uid, e.gid, e.mtime, e.link ?? ""];
    case "h":
      return [e.path, "h", e.link ?? ""];
    case "c":
    case "b":
      return [e.path, e.type, e.mode, e.uid, e.gid, e.mtime, e.major ?? 0, e.minor ?? 0];
    case "p":
      return [e.path, "p", e.mode, e.uid, e.gid, e.mtime];
  }
}
var isInt = (v, max = Number.MAX_SAFE_INTEGER) => Number.isInteger(v) && v >= 0 && v <= max;
var isHash = (v) => typeof v === "string" && /^[0-9a-f]{64}$/.test(v);
function validateManifest(m) {
  const fail = (why) => {
    throw new Error(`invalid image manifest: ${why}`);
  };
  if (!m || typeof m !== "object") fail("not an object");
  const o = m;
  if (o.chainboot !== MANIFEST_VERSION) fail(`unsupported format version ${String(o.chainboot)} (this program understands version ${MANIFEST_VERSION}; update chainboot)`);
  if (o.kind !== "image") fail("not an image");
  for (const k of ["name", "version", "arch", "digest"]) if (typeof o[k] !== "string" || !o[k]) fail(`missing ${k}`);
  if (o.os !== "linux") fail("only linux images are supported");
  if (!Array.isArray(o.packs) || !Array.isArray(o.tree)) fail("missing packs or tree");
  if (o.config !== void 0) {
    const c = o.config;
    if (!c || typeof c !== "object" || Array.isArray(c)) fail("malformed configuration");
    if (c.cmd !== void 0 && (!Array.isArray(c.cmd) || c.cmd.length > 64 || c.cmd.some((x) => typeof x !== "string" || x.length > 8192 || x.includes("\0")))) fail("malformed start command");
    if (c.env !== void 0 && (!c.env || typeof c.env !== "object" || Array.isArray(c.env) || Object.entries(c.env).some(([k, v]) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(k) || typeof v !== "string" || v.length > 8192 || v.includes("\0")))) fail("malformed environment");
  }
  const packs = o.packs;
  for (const p of packs) {
    if (!p || typeof p.sig !== "string" || !isHash(p.sha256) || !isHash(p.rawSha256) || !isInt(p.size) || !isInt(p.rawSize) || !["xz", "zstd", "raw"].includes(p.codec) || p.enc !== void 0 && p.enc !== 0 && p.enc !== 1 || p.key !== void 0 && (typeof p.key !== "string" || !/^[A-Za-z0-9+/]{43}=$/.test(p.key))) fail("malformed pack entry");
  }
  const kinds = /* @__PURE__ */ new Map();
  let prev = null;
  for (const n of o.tree) {
    if (!Array.isArray(n) || typeof n[0] !== "string" || typeof n[1] !== "string") fail("malformed tree node");
    const node = n, path9 = node[0], type = node[1];
    if (!path9 || path9.startsWith("/") || path9.split("/").some((s) => s === "" || s === "." || s === "..") || path9.includes("\0")) fail(`unsafe path ${JSON.stringify(path9)}`);
    if (prev !== null && comparePaths(prev, path9) >= 0) fail(`tree is not sorted or has a duplicate at ${path9}`);
    prev = path9;
    const slash = path9.lastIndexOf("/");
    if (slash > 0 && kinds.get(path9.slice(0, slash)) !== "d") fail(`parent of ${path9} is not a directory in this image`);
    const common = () => {
      if (!isInt(node[2], 4095) || !isInt(node[3], 4294967295) || !isInt(node[4], 4294967295) || !isInt(node[5])) fail(`bad attributes for ${path9}`);
    };
    switch (type) {
      case "f": {
        common();
        if (node.length < 10 || node.length > 11 || !isInt(node[6]) || !isHash(node[7]) || !Number.isInteger(node[8]) || !isInt(node[9])) fail(`bad file node ${path9}`);
        const size = node[6], pack = node[8], offset = node[9];
        if (size === 0) {
          if (node[7] !== EMPTY_SHA256) fail(`bad empty file ${path9}`);
        } else if (pack < 0 || pack >= packs.length || offset + size > packs[pack].rawSize) fail(`file ${path9} points outside its pack`);
        break;
      }
      case "d":
        common();
        if (node.length > 7) fail(`bad directory node ${path9}`);
        break;
      case "l":
        common();
        if (node.length !== 7 || typeof node[6] !== "string" || !node[6]) fail(`bad symlink ${path9}`);
        break;
      case "h":
        if (node.length !== 3 || typeof node[2] !== "string") fail(`bad hard link ${path9}`);
        break;
      case "c":
      case "b":
        common();
        if (node.length !== 8 || !isInt(node[6]) || !isInt(node[7])) fail(`bad device node ${path9}`);
        break;
      case "p":
        common();
        if (node.length !== 6) fail(`bad fifo ${path9}`);
        break;
      default:
        fail(`unknown node type ${type} for ${path9}`);
    }
    const x = type === "f" ? node[10] : type === "d" ? node[6] : void 0;
    if (x !== void 0 && (typeof x !== "object" || x === null || Object.values(x).some((v) => typeof v !== "string"))) fail(`bad extended attributes for ${path9}`);
    kinds.set(path9, type);
  }
  for (const n of o.tree) if (n[1] === "h" && kinds.get(n[2]) !== "f") fail(`hard link ${n[0]} does not point at a regular file`);
  if (treeDigest(o.tree, o.config) !== o.digest) fail("digest does not match the content");
}
function serializeManifest(m) {
  const { tree, ...head } = m;
  const lines = tree.map((n) => JSON.stringify(n));
  return Buffer.from(`${JSON.stringify(head).slice(0, -1)},"tree":[
${lines.join(",\n")}
]}
`, "utf8");
}
function parseManifest(bytes) {
  let m;
  try {
    m = JSON.parse(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("utf8"));
  } catch {
    throw new Error("invalid image manifest: not JSON");
  }
  validateManifest(m);
  return m;
}

// src/image/build.ts
var MAX_PACK_RAW = 128 << 20;
var LAZY_PACK_RAW = 4 << 20;
var NAME_RE = /^[a-z0-9][a-z0-9._-]{0,62}$/;
function checkImageName(name) {
  if (!NAME_RE.test(name)) throw new Error(`invalid image name "${name}": use lower-case letters, digits, ".", "_" or "-" (at most 63 characters)`);
}
function normalizeEntries(input) {
  const byPath = /* @__PURE__ */ new Map();
  for (const e of input) {
    if (!e.path) continue;
    const old = byPath.get(e.path);
    if (old && old.type === "d" && e.type !== "d") throw new Error(`${e.path} is both a directory and a ${e.type} entry`);
    byPath.set(e.path, e);
  }
  for (const e of [...byPath.values()]) {
    const parts = e.path.split("/");
    for (let i = 1; i < parts.length; i++) {
      const parent = parts.slice(0, i).join("/");
      const p = byPath.get(parent);
      if (!p) byPath.set(parent, { path: parent, type: "d", mode: 493, uid: 0, gid: 0, mtime: 0 });
      else if (p.type !== "d") throw new Error(`${e.path} is inside ${parent}, which is not a directory`);
    }
  }
  for (const e of byPath.values()) {
    if (e.type !== "h") continue;
    let target = byPath.get(e.link ?? "");
    for (let hops = 0; target?.type === "h" && hops < 16; hops++) target = byPath.get(target.link ?? "");
    if (!target || target.type !== "f") throw new Error(`hard link ${e.path} points at ${e.link}, which is not a regular file in the archive`);
    e.link = target.path;
  }
  return [...byPath.values()].sort((a, b) => comparePaths(a.path, b.path));
}
function extension(path9) {
  const base = path9.slice(path9.lastIndexOf("/") + 1);
  const m = /\.([A-Za-z0-9_]+)(\.[0-9.]+)?$/.exec(base);
  return m ? m[1].toLowerCase() : "";
}
var isElf = (d) => d.length > 4 && d.readUInt32BE(0) === 2135247942;
function buildImage(input, meta, opts = {}) {
  checkImageName(meta.name);
  const say = opts.onProgress ?? (() => {
  });
  const entries = normalizeEntries(input);
  const hashOf = /* @__PURE__ */ new Map();
  const unique = /* @__PURE__ */ new Map();
  for (const e of entries) {
    if (e.type !== "f") continue;
    const data = e.data ?? Buffer.alloc(0);
    const h = data.length ? toHex(sha256(data)) : EMPTY_SHA256;
    hashOf.set(e, h);
    if (data.length && !unique.has(h)) unique.set(h, e);
  }
  const packs = [];
  const where = /* @__PURE__ */ new Map();
  for (const base of opts.reuse ?? []) {
    const remap = /* @__PURE__ */ new Map();
    for (const n of base.tree) {
      if (n[1] !== "f" || n[6] === 0 || !unique.has(n[7]) || where.has(n[7])) continue;
      const src = base.packs[n[8]];
      if (!src.sig) continue;
      let idx = remap.get(n[8]);
      if (idx === void 0) {
        idx = packs.findIndex((p) => p.sig === src.sig);
        if (idx < 0) {
          idx = packs.length;
          packs.push({ ...src });
        }
        remap.set(n[8], idx);
      }
      where.set(n[7], { pack: idx, offset: n[9] });
    }
  }
  const reused = where.size;
  const fresh = [...unique.entries()].filter(([h]) => !where.has(h)).map(([h, e]) => ({ h, e, elf: isElf(e.data), ext: extension(e.path) }));
  const lazy = opts.layout === "lazy";
  const startRank = new Map((opts.startFiles ?? []).map((p, i) => [p.replace(/^\/+/, ""), i]));
  const rank = (p) => startRank.get(p) ?? Infinity;
  if (lazy) fresh.sort((a, b) => (rank(a.e.path) === rank(b.e.path) ? 0 : rank(a.e.path) < rank(b.e.path) ? -1 : 1) || comparePaths(a.e.path, b.e.path));
  else fresh.sort((a, b) => Number(b.elf) - Number(a.elf) || (a.ext < b.ext ? -1 : a.ext > b.ext ? 1 : 0) || b.e.data.length - a.e.data.length || comparePaths(a.e.path, b.e.path));
  const packLimit = lazy ? LAZY_PACK_RAW : MAX_PACK_RAW;
  const newPacks = /* @__PURE__ */ new Map();
  let group = [], groupSize = 0;
  const flush = () => {
    if (!group.length) return;
    const raw = Buffer.concat(group.map((g) => g.e.data));
    const index = packs.length;
    let offset = 0;
    for (const g of group) {
      where.set(g.h, { pack: index, offset });
      offset += g.e.data.length;
    }
    say(`compressing pack ${index + 1} (${(raw.length / 1e6).toFixed(1)} MB)`);
    const packed = compress(raw, { arch: meta.arch, codec: opts.codec });
    if (!decompress(packed.codec, packed.data, raw.length).equals(raw)) throw new Error("internal error: pack does not round-trip");
    packs.push({ sig: "", sha256: toHex(sha256(packed.data)), size: packed.data.length, codec: packed.codec, rawSha256: toHex(sha256(raw)), rawSize: raw.length });
    newPacks.set(index, packed.data);
    group = [];
    groupSize = 0;
  };
  let inStart = lazy && startRank.size > 0;
  for (const f of fresh) {
    if (inStart && rank(f.e.path) === Infinity) {
      flush();
      inStart = false;
    }
    if (groupSize && groupSize + f.e.data.length > packLimit) flush();
    group.push(f);
    groupSize += f.e.data.length;
  }
  flush();
  const tree = entries.map((e) => {
    if (e.type !== "f") return toNode(e);
    const h = hashOf.get(e);
    return toNode(e, h === EMPTY_SHA256 ? { sha256: h, pack: -1, offset: 0 } : { sha256: h, ...where.get(h) });
  });
  const used = new Set(tree.filter((n) => n[1] === "f" && n[6] > 0).map((n) => n[8]));
  if (used.size !== packs.length) throw new Error("internal error: unused pack in manifest");
  let created = meta.created;
  if (created === void 0) {
    created = 0;
    for (const e of entries) if (e.mtime > created) created = e.mtime;
  }
  const manifest = {
    chainboot: MANIFEST_VERSION,
    kind: "image",
    name: meta.name,
    version: meta.version,
    arch: meta.arch,
    os: "linux",
    created,
    ...meta.description && { description: meta.description },
    ...meta.source && { source: meta.source },
    ...meta.config && { config: meta.config },
    digest: treeDigest(tree, meta.config),
    rawSize: entries.reduce((n, e) => n + (e.data?.length ?? 0), 0),
    fileCount: entries.length,
    packs,
    tree
  };
  try {
    validateManifest(manifest);
  } catch (e) {
    throw new Error(`this archive cannot become an image: ${e.message.replace(/^invalid image manifest: /, "")}`);
  }
  say(`${entries.length} entries, ${unique.size} unique files (${reused} already on chain), ${packs.length} pack(s)`);
  return { manifest, newPacks };
}
function entriesFromImage(m, rawPack) {
  const files = new Map(m.tree.filter((n) => n[1] === "f").map((n) => [n[0], n]));
  return m.tree.map((n) => {
    const x = n[1] === "f" ? n[10] : n[1] === "d" ? n[6] : void 0;
    const xattrs = x ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, Buffer.from(v, "base64")])) : void 0;
    switch (n[1]) {
      case "f": {
        const data = n[6] === 0 ? Buffer.alloc(0) : rawPack(n[8]).subarray(n[9], n[9] + n[6]);
        return { path: n[0], type: "f", mode: n[2], uid: n[3], gid: n[4], mtime: n[5], data, ...xattrs && { xattrs } };
      }
      case "d":
        return { path: n[0], type: "d", mode: n[2], uid: n[3], gid: n[4], mtime: n[5], ...xattrs && { xattrs } };
      case "l":
        return { path: n[0], type: "l", mode: n[2], uid: n[3], gid: n[4], mtime: n[5], link: n[6] };
      case "h": {
        const t = files.get(n[2]);
        return { path: n[0], type: "h", mode: t[2], uid: t[3], gid: t[4], mtime: t[5], link: n[2] };
      }
      case "c":
      case "b":
        return { path: n[0], type: n[1], mode: n[2], uid: n[3], gid: n[4], mtime: n[5], major: n[6], minor: n[7] };
      case "p":
        return { path: n[0], type: "p", mode: n[2], uid: n[3], gid: n[4], mtime: n[5] };
    }
  });
}
function verifyPack(m, index, raw) {
  const p = m.packs[index];
  if (!p) throw new Error(`manifest has no pack ${index}`);
  if (raw.length !== p.rawSize || toHex(sha256(raw)) !== p.rawSha256) throw new Error(`pack ${index + 1} of ${m.name} is damaged (hash mismatch)`);
  for (const n of m.tree) {
    if (n[1] !== "f" || n[6] === 0 || n[8] !== index) continue;
    const h = createHash7("sha256").update(raw.subarray(n[9], n[9] + n[6])).digest("hex");
    if (h !== n[7]) throw new Error(`file ${n[0]} in ${m.name} is damaged (hash mismatch)`);
  }
}

// src/image/extract.ts
import fs4 from "node:fs";
import path4 from "node:path";
import { spawnSync as spawnSync3 } from "node:child_process";

// src/util/xattr.ts
import { spawnSync as spawnSync2 } from "node:child_process";
import path3 from "node:path";
var WANTED = /^(security\.capability|system\.posix_acl_(access|default)|user\.(?!overlay\.).+)$/;
var has = (tool) => spawnSync2("sh", ["-c", `command -v ${tool}`], { stdio: "ignore" }).status === 0;
var tools = null;
function available() {
  tools ??= { getfattr: has("getfattr"), setfattr: has("setfattr"), python: has("python3") };
  return tools;
}
var PY_READ = `
import os, sys, json
root = sys.argv[1]
def emit(p):
    try: names = os.listxattr(p, follow_symlinks=False)
    except OSError: return
    out = {}
    for n in names:
        try: out[n] = os.getxattr(p, n, follow_symlinks=False).hex()
        except OSError: pass
    if out: sys.stdout.write(json.dumps({"p": os.path.relpath(p, root), "x": out}) + "\\n")
for d, dirs, files in os.walk(root):
    for n in dirs + files: emit(os.path.join(d, n))
`;
function readXattrs(root) {
  const t = available();
  const found = /* @__PURE__ */ new Map();
  const put = (rel, name, hex) => {
    if (!WANTED.test(name) || rel === "." || rel.startsWith("..")) return;
    (found.get(rel) ?? found.set(rel, {}).get(rel))[name] = Buffer.from(hex, "hex").toString("base64");
  };
  if (t.getfattr) {
    const r = spawnSync2("getfattr", ["-R", "-h", "-d", "-e", "hex", "--absolute-names", "-m", "-", root], { maxBuffer: 256 << 20 });
    if (r.error || !r.stdout) return found;
    let rel = "";
    for (const line of r.stdout.toString("latin1").split("\n")) {
      if (line.startsWith("# file: ")) {
        const raw = Buffer.from(line.slice(8).replace(/\\([0-7]{3})/g, (_, o) => String.fromCharCode(parseInt(o, 8))), "latin1").toString("utf8");
        rel = path3.relative(root, raw).split(path3.sep).join("/");
      } else {
        const eq = line.indexOf("=0x");
        if (eq > 0) put(rel, line.slice(0, eq), line.slice(eq + 3));
      }
    }
    return found;
  }
  if (t.python) {
    const r = spawnSync2("python3", ["-c", PY_READ, root], { maxBuffer: 256 << 20 });
    if (r.error || !r.stdout) return found;
    for (const line of r.stdout.toString("utf8").split("\n")) {
      if (!line) continue;
      try {
        const j = JSON.parse(line);
        for (const [n, v] of Object.entries(j.x)) put(j.p, n, v);
      } catch {
      }
    }
    return found;
  }
  return null;
}
function writeXattrs(file, attrs) {
  const t = available();
  const failed = [];
  for (const [name, value] of Object.entries(attrs)) {
    const hex = Buffer.from(value, "base64").toString("hex");
    let ok = false;
    if (t.setfattr) ok = spawnSync2("setfattr", ["-h", "-n", name, "-v", `0x${hex}`, file], { stdio: "ignore" }).status === 0;
    else if (t.python) ok = spawnSync2("python3", ["-c", "import os,sys; os.setxattr(sys.argv[1], sys.argv[2], bytes.fromhex(sys.argv[3]), follow_symlinks=False)", file, name, hex], { stdio: "ignore" }).status === 0;
    if (!ok) failed.push(name);
  }
  return failed;
}

// src/image/extract.ts
function extractImage(manifest, rawPack, dest, onProgress) {
  if (fs4.existsSync(dest) && fs4.readdirSync(dest).length) throw new Error(`${dest} is not empty`);
  fs4.mkdirSync(dest, { recursive: true });
  const at = (p) => path4.join(dest, p);
  const skipped = [];
  const isRoot = process.getuid?.() === 0;
  const unmapped = /* @__PURE__ */ new Set();
  const own = (p, uid, gid) => {
    if (!isRoot) return;
    try {
      fs4.lchownSync(p, uid, gid);
    } catch (e) {
      if (e.code !== "EINVAL") throw e;
      if (!unmapped.has(`${uid}:${gid}`)) {
        unmapped.add(`${uid}:${gid}`);
        skipped.push(`owner ${uid}:${gid} (those files belong to root instead)`);
      }
    }
  };
  const dirs = [], links = [];
  let done = 0;
  const total = manifest.tree.length;
  for (const n of manifest.tree) {
    const p = at(n[0]);
    switch (n[1]) {
      case "d":
        fs4.mkdirSync(p);
        dirs.push(n);
        break;
      case "f": {
        const data = n[6] === 0 ? Buffer.alloc(0) : rawPack(n[8]).subarray(n[9], n[9] + n[6]);
        fs4.writeFileSync(p, data, { mode: 384, flag: "wx" });
        own(p, n[3], n[4]);
        fs4.chmodSync(p, n[2]);
        fs4.utimesSync(p, n[5], n[5]);
        if (n[10]) applyXattrs(p, n[10], skipped);
        break;
      }
      case "l":
        fs4.symlinkSync(n[6], p);
        own(p, n[3], n[4]);
        fs4.lutimesSync(p, n[5], n[5]);
        break;
      case "h":
        links.push(n);
        break;
      case "c":
      case "b":
      case "p": {
        const args = n[1] === "p" ? [p, "p"] : [p, n[1], String(n[6]), String(n[7])];
        const r = isRoot ? spawnSync3("mknod", ["-m", (n[2] & 4095).toString(8), ...args]) : null;
        if (!r || r.status !== 0) {
          skipped.push(n[0]);
          break;
        }
        own(p, n[3], n[4]);
        fs4.utimesSync(p, n[5], n[5]);
        break;
      }
    }
    if (++done % 500 === 0) onProgress?.(done, total);
  }
  for (const n of links) {
    if (n[1] === "h") fs4.linkSync(at(n[2]), at(n[0]));
  }
  for (let i = dirs.length - 1; i >= 0; i--) {
    const n = dirs[i];
    if (n[1] !== "d") continue;
    const p = at(n[0]);
    own(p, n[3], n[4]);
    fs4.chmodSync(p, n[2]);
    if (n[6]) applyXattrs(p, n[6], skipped);
    fs4.utimesSync(p, n[5], n[5]);
  }
  onProgress?.(total, total);
  return { files: total, skipped };
}
function applyXattrs(p, xattrs, skipped) {
  for (const name of writeXattrs(p, xattrs)) skipped.push(`${p} (attribute ${name})`);
}

// src/registry/registry.ts
import fs6 from "node:fs";
import path6 from "node:path";

// src/state/vault.ts
import { createCipheriv, createDecipheriv, createHash as createHash8, createPrivateKey as createPrivateKey2, createPublicKey as createPublicKey2, diffieHellman, generateKeyPairSync as generateKeyPairSync2, hkdfSync, randomBytes } from "node:crypto";
var LOGIN_MESSAGE = [
  "chainboot: unlock my saved machines",
  "",
  "Signing this message creates the key that encrypts and restores your machines on Solana.",
  "Only sign it inside chainboot. A website that asks for this signature could read your saved machines.",
  "",
  "This is not a transaction and costs nothing.",
  "Version: 1"
].join("\n");
function deriveVault(wallet, signature, cluster) {
  if (!verifySignature(addressToBytes(wallet), Buffer.from(LOGIN_MESSAGE, "utf8"), signature)) {
    throw new Error("that is not a valid signature of the chainboot login message by this wallet");
  }
  const derive = (purpose) => Buffer.from(hkdfSync("sha256", signature, Buffer.from("chainboot-vault-v1"), Buffer.from(`${cluster}:${purpose}`), 32));
  return { wallet, cluster, signer: Keypair.fromSeed(derive("signer")), encKey: derive("encryption") };
}
function vaultFromKeypair(keypair, cluster) {
  return deriveVault(keypair.address, keypair.sign(Buffer.from(LOGIN_MESSAGE, "utf8")), cluster);
}
var OBJECT_KEY_INFO = "chainboot-object-v2:";
var OBJECT_ID_INFO = "chainboot-object-id-v2:";
function objectKeyFor(master, id2, purpose) {
  return Buffer.from(hkdfSync("sha256", master, id2, Buffer.from(OBJECT_KEY_INFO + purpose, "utf8"), 32));
}
function gcmOpen(key2, nonce, body, purpose) {
  const d = createDecipheriv("aes-256-gcm", key2, nonce);
  d.setAAD(Buffer.from(purpose, "utf8"));
  d.setAuthTag(body.subarray(body.length - 16));
  try {
    return Buffer.concat([d.update(body.subarray(0, body.length - 16)), d.final()]);
  } catch {
    throw new Error("could not decrypt: wrong wallet or key, or the data was changed");
  }
}
function gcmSeal(key2, nonce, plain, purpose) {
  const c = createCipheriv("aes-256-gcm", key2, nonce);
  c.setAAD(Buffer.from(purpose, "utf8"));
  return [c.update(plain), c.final(), c.getAuthTag()];
}
var view2 = (b) => Buffer.from(b.buffer, b.byteOffset, b.byteLength);
function seal(key2, plain, purpose) {
  return sealWithKey(key2, plain, purpose).sealed;
}
function sealWithKey(key2, plain, purpose) {
  const derived = Buffer.from(hkdfSync("sha256", key2, createHash8("sha256").update(plain).digest(), Buffer.from(OBJECT_ID_INFO + purpose, "utf8"), 28));
  const id2 = derived.subarray(0, 16), nonce = derived.subarray(16, 28);
  const objKey = objectKeyFor(key2, id2, purpose);
  return { sealed: Buffer.concat([Uint8Array.of(2), id2, nonce, ...gcmSeal(objKey, nonce, plain, purpose)]), key: objKey.toString("base64") };
}
function open(key2, sealed, purpose) {
  const buf = view2(sealed);
  if (buf[0] === 2 && buf.length >= 45) return gcmOpen(objectKeyFor(key2, buf.subarray(1, 17), purpose), buf.subarray(17, 29), buf.subarray(29), purpose);
  if (buf[0] === 1 && buf.length >= 29) return gcmOpen(key2, buf.subarray(1, 13), buf.subarray(13), purpose);
  throw new Error("this data was not encrypted by chainboot (or by a newer version)");
}
function objectKey(key2, sealed, purpose) {
  const buf = view2(sealed);
  return buf[0] === 2 && buf.length >= 45 ? objectKeyFor(key2, buf.subarray(1, 17), purpose) : null;
}
function openWithKey(objKey, sealed, purpose) {
  const buf = view2(sealed);
  if (buf[0] !== 2 || buf.length < 45) throw new Error("this object cannot be opened with a key of its own");
  if (objKey.length !== 32) throw new Error("an object key has 32 bytes");
  return gcmOpen(objKey, buf.subarray(17, 29), buf.subarray(29), purpose);
}
function openEither(vaultKey, objKey, sealed, purpose) {
  if (objKey) return openWithKey(Buffer.from(objKey, "base64"), sealed, purpose);
  if (!vaultKey) throw new Error("this is encrypted: sign in with the wallet it belongs to (chainboot login)");
  return open(vaultKey, sealed, purpose);
}
var X25519_PKCS8 = Buffer.from("302e020100300506032b656e04220420", "hex");
var X25519_SPKI = Buffer.from("302a300506032b656e032100", "hex");
var xSecret = (raw) => createPrivateKey2({ key: Buffer.concat([X25519_PKCS8, raw]), format: "der", type: "pkcs8" });
var xPublic = (raw) => createPublicKey2({ key: Buffer.concat([X25519_SPKI, raw]), format: "der", type: "spki" });
var xPublicOf = (secret) => Buffer.from(createPublicKey2(xSecret(secret)).export({ format: "der", type: "spki" }).subarray(-32));
function shareKeys(v) {
  const secret = Buffer.from(hkdfSync("sha256", v.encKey, Buffer.from("chainboot-share-v1"), Buffer.from(`${v.cluster}:x25519`), 32));
  return { secret, publicKey: xPublicOf(secret) };
}
var SHARE_PREFIX = "share_";
var shareChecksum = (publicKey) => createHash8("sha256").update("chainboot-share-address").update(publicKey).digest().subarray(0, 4);
function shareAddress(publicKey) {
  return SHARE_PREFIX + b58encode(Buffer.concat([publicKey, shareChecksum(publicKey)]));
}
function parseShareAddress(text) {
  const fail = (why) => new Error(`"${text}" is not a share address (${why}). The receiver finds theirs with: chainboot whoami`);
  if (!text.startsWith(SHARE_PREFIX)) throw fail('it starts with "share_"; a wallet address cannot receive shares');
  let raw;
  try {
    raw = b58decode(text.slice(SHARE_PREFIX.length));
  } catch {
    throw fail("it has characters that do not belong there");
  }
  if (raw.length !== 36) throw fail("it has the wrong length");
  const publicKey = Buffer.from(raw.subarray(0, 32));
  if (!shareChecksum(publicKey).equals(Buffer.from(raw.subarray(32)))) throw fail("it was mistyped: its checksum does not match");
  return publicKey;
}
function shareSecret(oneTimeShared, staticShared, oneTimePub, senderPub, receiverPub, purpose) {
  return Buffer.from(hkdfSync("sha256", Buffer.concat([oneTimeShared, staticShared]), Buffer.concat([oneTimePub, senderPub, receiverPub]), Buffer.from(`chainboot-share-v1:${purpose}`, "utf8"), 32));
}
function sealTo(receiver, sender, plain, purpose) {
  if (receiver.length !== 32) throw new Error("a share public key has 32 bytes");
  const oneTime = generateKeyPairSync2("x25519");
  const oneTimePub = Buffer.from(oneTime.publicKey.export({ format: "der", type: "spki" }).subarray(-32));
  const to = xPublic(receiver);
  const key2 = shareSecret(diffieHellman({ privateKey: oneTime.privateKey, publicKey: to }), diffieHellman({ privateKey: xSecret(sender.secret), publicKey: to }), oneTimePub, sender.publicKey, receiver, purpose);
  const nonce = randomBytes(12);
  return Buffer.concat([Uint8Array.of(1), oneTimePub, sender.publicKey, nonce, ...gcmSeal(key2, nonce, plain, purpose)]);
}
function openFrom(mine, sealed, purpose) {
  const buf = view2(sealed);
  if (buf[0] !== 1 || buf.length < 1 + 32 + 32 + 12 + 16) return null;
  const oneTimePub = buf.subarray(1, 33), sender = Buffer.from(buf.subarray(33, 65));
  try {
    const me = xSecret(mine.secret);
    const key2 = shareSecret(diffieHellman({ privateKey: me, publicKey: xPublic(oneTimePub) }), diffieHellman({ privateKey: me, publicKey: xPublic(sender) }), oneTimePub, sender, mine.publicKey, purpose);
    return { plain: gcmOpen(key2, buf.subarray(65, 77), buf.subarray(77), purpose), sender };
  } catch {
    return null;
  }
}

// src/util/lock.ts
import fs5 from "node:fs";
import os from "node:os";
import path5 from "node:path";
var STALE_MS = 15 * 6e4;
function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
}
async function withLock(name, work) {
  const dir = path5.join(os.tmpdir(), `chainboot-lock-${name.replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 120)}`);
  const owner = path5.join(dir, "owner");
  for (let waited = 0; ; waited += 100) {
    try {
      fs5.mkdirSync(dir, { mode: 448 });
      fs5.writeFileSync(owner, String(process.pid));
      break;
    } catch (e) {
      const code = e.code;
      if (code !== "EEXIST") return work();
      let stale = false;
      try {
        const pid = Number(fs5.readFileSync(owner, "utf8"));
        stale = !(pid > 0 && alive(pid)) || Date.now() - fs5.statSync(dir).mtimeMs > STALE_MS;
      } catch {
        try {
          stale = Date.now() - fs5.statSync(dir).mtimeMs > 5e3;
        } catch {
          stale = false;
        }
      }
      if (stale) {
        try {
          fs5.rmSync(dir, { recursive: true, force: true });
        } catch {
        }
        continue;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  try {
    return await work();
  } finally {
    try {
      if (Number(fs5.readFileSync(owner, "utf8")) === process.pid) fs5.rmSync(dir, { recursive: true, force: true });
    } catch {
    }
  }
}

// src/registry/registry.ts
var catalogTag = (publisher) => tagAddress("catalog", publisher);
async function putStored(store, payer, raw, opts) {
  const packed = compress(raw, { arch: opts.arch });
  if (!decompress(packed.codec, packed.data, raw.length).equals(raw)) throw new Error("internal error: object does not round-trip");
  const ref = await store.put(payer, packed.data, { journalDir: opts.journalDir, commitment: opts.commitment, onProgress: opts.onProgress });
  return { sig: ref.sig, sha256: ref.sha256, size: ref.size, codec: packed.codec, rawSize: raw.length };
}
async function getStored(store, ref, opts) {
  const data = await store.get({ sig: ref.sig, sha256: ref.sha256, size: ref.size }, {
    signers: opts.signers,
    cacheDir: opts.cacheDir,
    signal: opts.signal,
    onProgress: (p) => opts.onProgress?.(p.bytes, p.size)
  });
  return decompress(ref.codec, data, ref.rawSize);
}
var NAME = /^[a-z0-9][a-z0-9._-]{0,127}$/;
var LABEL = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
var isCount = (x) => Number.isSafeInteger(x) && x >= 0;
var isHash2 = (x) => typeof x === "string" && /^[0-9a-f]{64}$/.test(x);
var plainText = (x, max) => String(x ?? "").replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, " ").slice(0, max);
function cleanRef(r) {
  const x = r;
  if (!x || typeof x !== "object" || typeof x.sig !== "string" || x.sig.length > 90 || !isHash2(x.sha256) || !isCount(x.size) || !isCount(x.rawSize) || !["xz", "zstd", "raw"].includes(x.codec) || !isHash2(x.digest)) return null;
  if (x.publisher !== void 0) {
    try {
      addressToBytes(x.publisher);
    } catch {
      return null;
    }
  }
  if (x.key !== void 0 && (typeof x.key !== "string" || !/^[A-Za-z0-9+/]{43}=$/.test(x.key))) return null;
  return {
    sig: x.sig,
    sha256: x.sha256,
    size: x.size,
    codec: x.codec,
    rawSize: x.rawSize,
    digest: x.digest,
    version: plainText(x.version, 64),
    created: isCount(x.created) ? x.created : 0,
    downloadSize: isCount(x.downloadSize) ? x.downloadSize : 0,
    unpackedSize: isCount(x.unpackedSize) ? x.unpackedSize : 0,
    ...x.private === true && { private: true },
    ...x.publisher !== void 0 && { publisher: x.publisher },
    ...x.key !== void 0 && { key: x.key }
  };
}
function cleanImages(images) {
  if (!images || typeof images !== "object" || Array.isArray(images)) throw new Error("its list of images is malformed");
  const out = {};
  for (const [name, image] of Object.entries(images)) {
    if (!NAME.test(name) || !image || typeof image !== "object" || !image.tags || typeof image.tags !== "object" || Array.isArray(image.tags)) continue;
    const tags = {};
    for (const [tag, arches] of Object.entries(image.tags)) {
      if (!LABEL.test(tag) || !arches || typeof arches !== "object" || Array.isArray(arches)) continue;
      for (const [arch, ref] of Object.entries(arches)) {
        const clean = LABEL.test(arch) ? cleanRef(ref) : null;
        if (clean) (tags[tag] ??= {})[arch] = clean;
      }
    }
    if (Object.keys(tags).length) out[name] = { ...image.description !== void 0 && { description: plainText(image.description, 300) }, tags };
  }
  return out;
}
async function readCatalog(store, publisher, cacheDir) {
  const key2 = addressToBytes(publisher);
  const ptr = await store.getPointer(catalogTag(key2), [key2]);
  if (!ptr) return { chainboot: 1, kind: "catalog", publisher, updated: 0, images: {} };
  let ref;
  try {
    ref = JSON.parse(ptr.payload.toString("utf8"));
  } catch {
    throw new Error(`the catalog pointer of ${publisher} is malformed`);
  }
  const raw = await getStored(store, ref, { signers: [key2], cacheDir });
  const cat = JSON.parse(raw.toString("utf8"));
  if (cat?.chainboot !== 1 || cat.kind !== "catalog" || cat.publisher !== publisher) throw new Error(`the catalog of ${publisher} is malformed`);
  try {
    cat.images = cleanImages(cat.images);
  } catch (e) {
    throw new Error(`the catalog of ${publisher} is malformed: ${e.message}`);
  }
  return cat;
}
async function writeCatalog(store, payer, cat, commitment) {
  cat.updated = Math.floor(Date.now() / 1e3);
  const ref = await putStored(store, payer, Buffer.from(JSON.stringify(cat)), { commitment });
  await store.putPointer(payer, catalogTag(payer.publicKey), Buffer.from(JSON.stringify(ref)), { commitment });
}
async function publishImage(store, payer, built, opts = {}) {
  const m = built.manifest;
  if (m.packs.some((p) => p.enc || p.key)) throw new Error("a public image cannot reuse files of a private image. Build it without --reuse of a private image, or publish it as private.");
  const say = (phase) => (p) => opts.onProgress?.({ phase, done: p.done, total: p.total, detail: p.phase });
  for (const [index, data] of [...built.newPacks.entries()].sort((a, b) => a[0] - b[0])) {
    const ref2 = await store.put(payer, data, { journalDir: opts.journalDir, commitment: opts.commitment, onProgress: say(`pack ${index + 1}/${m.packs.length}`) });
    if (ref2.sha256 !== m.packs[index].sha256) throw new Error("internal error: pack hash changed during upload");
    m.packs[index].sig = ref2.sig;
  }
  if (m.packs.some((p) => !p.sig)) throw new Error("internal error: a pack has no on-chain address");
  const mref = await putStored(store, payer, serializeManifest(m), { journalDir: opts.journalDir, commitment: opts.commitment, onProgress: say("manifest") });
  const ref = {
    ...mref,
    digest: m.digest,
    version: m.version,
    created: m.created,
    downloadSize: mref.size + m.packs.reduce((n, p) => n + p.size, 0),
    unpackedSize: m.rawSize
  };
  opts.onProgress?.({ phase: "catalog", done: 0, total: 1 });
  await withLock(`catalog-${payer.address}`, async () => {
    const cat = await readCatalog(store, payer.address);
    const image = cat.images[m.name] ??= { tags: {} };
    if (opts.description ?? m.description) image.description = opts.description ?? m.description;
    for (const tag of opts.tags ?? [m.version, "latest"]) (image.tags[tag] ??= {})[m.arch] = ref;
    await writeCatalog(store, payer, cat, opts.commitment);
  });
  opts.onProgress?.({ phase: "catalog", done: 1, total: 1 });
  return ref;
}
async function unlistImage(store, payer, name, tag, arch) {
  return withLock(`catalog-${payer.address}`, () => unlistLocked(store, payer, name, tag, arch));
}
async function unlistLocked(store, payer, name, tag, arch) {
  const cat = await readCatalog(store, payer.address);
  const image = cat.images[name];
  if (!image) return false;
  if (!tag) delete cat.images[name];
  else if (!image.tags[tag]) return false;
  else if (!arch) delete image.tags[tag];
  else if (!image.tags[tag][arch]) return false;
  else {
    delete image.tags[tag][arch];
    if (!Object.keys(image.tags[tag]).length) delete image.tags[tag];
  }
  if (cat.images[name] && !Object.keys(cat.images[name].tags).length) delete cat.images[name];
  await writeCatalog(store, payer, cat);
  return true;
}
async function endorseImage(store, payer, e, commitment) {
  if (e.ref.private || e.ref.key) throw new Error("a private image cannot be endorsed");
  if (!NAME.test(e.name) || e.tags.some((t) => !LABEL.test(t)) || !LABEL.test(e.arch)) throw new Error('an image name is lower-case letters, digits, ".", "_" or "-"; so are tags and architectures');
  await withLock(`catalog-${payer.address}`, async () => {
    const cat = await readCatalog(store, payer.address);
    const image = cat.images[e.name] ??= { tags: {} };
    if (e.description && !image.description) image.description = e.description;
    const { sig, sha256: sha2562, size, codec, rawSize, digest, version, created, downloadSize, unpackedSize } = e.ref;
    const entry = { sig, sha256: sha2562, size, codec, rawSize, digest, version, created, downloadSize, unpackedSize, ...e.publisher !== payer.address && { publisher: e.publisher } };
    for (const tag of e.tags) (image.tags[tag] ??= {})[e.arch] = entry;
    await writeCatalog(store, payer, cat, commitment);
  });
}
function parseImageName(text) {
  const m = /^(?:([A-Za-z0-9._-]+)\/)?([a-z0-9][a-z0-9._-]*)(?::([A-Za-z0-9._-]+))?$/.exec(text.trim());
  if (!m) throw new Error(`"${text}" is not an image name. Examples: solinux, solinux:26.04, <publisher-address>/alpine:3.22`);
  return { publisher: m[1], name: m[2], tag: m[3] ?? "latest" };
}
async function pullImage(store, publisher, ref, opts) {
  const key2 = addressToBytes(ref.publisher ?? publisher);
  const objects = path6.join(opts.cacheDir, "objects");
  fs6.mkdirSync(objects, { recursive: true });
  opts.onProgress?.({ phase: "manifest", done: 0, total: ref.size });
  let body = await store.get({ sig: ref.sig, sha256: ref.sha256, size: ref.size }, { signers: [key2], cacheDir: objects, signal: opts.signal, onProgress: (g) => opts.onProgress?.({ phase: "manifest", done: g.bytes, total: g.size }) });
  if (ref.private && !ref.key && !opts.vault) throw new Error("this is a private image: sign in with the wallet that published it (chainboot login)");
  if (ref.private) body = openEither(opts.vault?.encKey, ref.key, body, "image-manifest");
  const manifest = parseManifest(decompress(ref.codec, body, ref.rawSize));
  if (manifest.digest !== ref.digest) throw new Error(`the manifest of ${manifest.name} does not match its catalog entry`);
  const total = manifest.packs.reduce((n, p) => n + p.size, 0);
  const got = new Array(manifest.packs.length).fill(0);
  const report = () => opts.onProgress?.({ phase: "download", done: got.reduce((a, b) => a + b, 0), total });
  report();
  const stored = await Promise.all(manifest.packs.map((p, i) => store.get({ sig: p.sig, sha256: p.sha256, size: p.size }, { cacheDir: objects, signal: opts.signal, onProgress: (g) => {
    got[i] = g.bytes;
    report();
  } })));
  const raw = /* @__PURE__ */ new Map();
  return {
    manifest,
    ref,
    pack(index) {
      let r = raw.get(index);
      if (!r) {
        const p = manifest.packs[index];
        r = decompress(p.codec, p.enc ? openEither(opts.vault?.encKey, p.key, stored[index], "pack") : stored[index], p.rawSize);
        verifyPack(manifest, index, r);
        raw.set(index, r);
      }
      return r;
    }
  };
}

// src/registry/lists.ts
var PREFIX = "list:";
var isList = (text) => text.startsWith(PREFIX);
function parseList(text) {
  const m = /^list:(\d+):([1-9A-HJ-NP-Za-km-z,]+)$/.exec(text.trim());
  if (!m) throw new Error(`"${text}" is not a list. A list looks like list:2:<address>,<address>,<address>`);
  const members = m[2].split(",").filter(Boolean);
  const threshold = Number(m[1]);
  for (const a of members) {
    try {
      addressToBytes(a);
    } catch {
      throw new Error(`"${a}" in the list is not a Solana address`);
    }
  }
  if (new Set(members).size !== members.length) throw new Error("a list names each member once");
  if (members.length < 2 || members.length > 16) throw new Error("a list has between 2 and 16 members");
  if (threshold > members.length) throw new Error(`a list of ${members.length} members cannot need ${threshold} of them`);
  if (threshold * 2 <= members.length) throw new Error(`more than half of the members must agree: a list of ${members.length} needs at least ${Math.floor(members.length / 2) + 1}`);
  return { threshold, members };
}
function formatList(spec) {
  return `${PREFIX}${spec.threshold}:${spec.members.join(",")}`;
}
async function readList(store, spec, cacheDir) {
  const results = await Promise.allSettled(spec.members.map((m) => readCatalog(store, m, cacheDir)));
  const members = results.map((r, i) => r.status === "fulfilled" ? { address: spec.members[i], ok: true, images: Object.keys(r.value.images).length } : { address: spec.members[i], ok: false, images: 0, error: r.reason.message });
  const readable = members.filter((m) => m.ok).length;
  if (readable < spec.threshold) {
    throw new Error(`only ${readable} of the list's ${spec.members.length} catalogs could be read, and ${spec.threshold} must agree: ${members.filter((m) => !m.ok).map((m) => `${m.address.slice(0, 8)}\u2026 (${m.error})`).join("; ")}`);
  }
  const votes = /* @__PURE__ */ new Map();
  results.forEach((r, i) => {
    if (r.status !== "fulfilled") return;
    for (const [name, image] of Object.entries(r.value.images)) {
      for (const [tag, arches] of Object.entries(image.tags ?? {})) {
        for (const [arch, ref] of Object.entries(arches ?? {})) {
          if (!ref || typeof ref.digest !== "string" || ref.private) continue;
          const key2 = JSON.stringify([name, tag, arch, ref.digest]);
          let list = votes.get(key2);
          if (!list) votes.set(key2, list = []);
          list.push({ ref, by: spec.members[i], description: image.description });
        }
      }
    }
  });
  const view3 = { spec, images: {}, members, waiting: [] };
  for (const [key2, list] of votes) {
    const [name, tag, arch, digest] = JSON.parse(key2);
    const agreed = list.map((v) => v.by);
    const copies = /* @__PURE__ */ new Map();
    for (const v of list) copies.set(v.ref.sha256, (copies.get(v.ref.sha256) ?? 0) + 1);
    const own = (v) => !v.ref.publisher || v.ref.publisher === v.by ? 1 : 0;
    const pick = [...list].sort((a, b) => copies.get(b.ref.sha256) - copies.get(a.ref.sha256) || own(b) - own(a))[0];
    if (agreed.length < spec.threshold) {
      view3.waiting.push({ name, tag, arch, version: pick.ref.version, digest, agreed });
      continue;
    }
    const image = view3.images[name] ??= { tags: {} };
    image.description ??= list.find((v) => v.description)?.description;
    (image.tags[tag] ??= {})[arch] = { ...pick.ref, publisher: pick.ref.publisher ?? pick.by, agreed };
  }
  view3.waiting.sort((a, b) => a.name + a.tag + a.arch < b.name + b.tag + b.arch ? -1 : 1);
  return view3;
}

// src/state/snapshot.ts
import fs7 from "node:fs";
import path7 from "node:path";
import { spawnSync as spawnSync4 } from "node:child_process";
var SAVE_PACK_RAW = 32 << 20;
var HISTORY_LISTED = 200;
var stateTag = (v, machine) => tagAddress("state", v.signer.publicKey, machine);
var stateTagOf = stateTag;
var indexTag = (v) => tagAddress("machines", v.signer.publicKey);
async function putDoc(store, v, tag, purpose, doc, extra, opts = {}) {
  const raw = Buffer.from(JSON.stringify(doc), "utf8");
  const packed = compress(raw);
  const sealed = seal(v.encKey, packed.data, purpose);
  const o = await store.put(v.signer, sealed, { journalDir: opts.journalDir, commitment: opts.commitment, onProgress: (p) => opts.onProgress?.(p.done, p.total) });
  const ref = { sig: o.sig, sha256: o.sha256, size: o.size, codec: packed.codec, rawSize: raw.length };
  await store.putPointer(v.signer, tag, seal(v.encKey, Buffer.from(JSON.stringify({ ref, ...extra })), `${purpose}-pointer`), { commitment: opts.commitment });
  return ref;
}
async function getDocByRef(store, v, purpose, ref, cacheDir) {
  const sealed = await store.get({ sig: ref.sig, sha256: ref.sha256, size: ref.size }, { signers: [v.signer.publicKey], cacheDir });
  return JSON.parse(decompress(ref.codec, open(v.encKey, sealed, purpose), ref.rawSize).toString("utf8"));
}
async function getPointer(store, v, tag, purpose) {
  const p = await store.getPointer(tag, [v.signer.publicKey]);
  if (!p) return null;
  return JSON.parse(open(v.encKey, p.payload, `${purpose}-pointer`).toString("utf8"));
}
async function readIndex(store, v) {
  const p = await getPointer(store, v, indexTag(v), "index");
  if (!p) return { machines: {} };
  const index = await getDocByRef(store, v, "index", p.ref);
  if (!index || typeof index.machines !== "object" || index.machines === null || Array.isArray(index.machines)) throw new Error("the list of saved machines is malformed");
  return index;
}
async function writeIndex(store, v, index, commitment) {
  await putDoc(store, v, indexTag(v), "index", index, {}, { commitment });
}
async function readHead(store, v, machine) {
  const p = await getPointer(store, v, stateTag(v, machine), "snapshot");
  return p ? { seq: p.seq, time: p.time, ref: p.ref } : null;
}
async function readSnapshot(store, v, ref, cacheDir) {
  const s = await getDocByRef(store, v, "snapshot", ref, cacheDir);
  checkSnapshot(s);
  return s;
}
var isCount2 = (x, max = Number.MAX_SAFE_INTEGER) => Number.isInteger(x) && x >= 0 && x <= max;
var isHash3 = (x) => typeof x === "string" && /^[0-9a-f]{64}$/.test(x);
var safePath = (p) => typeof p === "string" && p !== "" && !p.startsWith("/") && !p.includes("\0") && !p.split("/").some((part) => part === "" || part === "." || part === "..");
var isRef = (r) => {
  const x = r;
  return !!x && typeof x.sig === "string" && isHash3(x.sha256) && isCount2(x.size) && isCount2(x.rawSize) && ["xz", "zstd", "raw"].includes(x.codec);
};
function checkImageRef(image) {
  const i = image;
  const name = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
  if (!i || typeof i !== "object" || typeof i.publisher !== "string" || i.publisher.length > 64 || !name.test(String(i.name)) || !name.test(String(i.tag)) || !name.test(String(i.arch)) || !isHash3(i.digest) || !isRef(i.manifest) || i.private !== void 0 && typeof i.private !== "boolean" || i.manifest.key !== void 0 && (typeof i.manifest.key !== "string" || !/^[A-Za-z0-9+/]{43}=$/.test(i.manifest.key))) throw new Error("the description of the machine's image is malformed");
}
function checkSnapshot(s) {
  const fail = (why) => {
    throw new Error(`the saved snapshot is malformed: ${why}`);
  };
  const o = s;
  if (!o || o.chainboot !== 1 || o.kind !== "snapshot" || !Array.isArray(o.tree) || !Array.isArray(o.packs) || !Array.isArray(o.deleted) || !Array.isArray(o.history)) fail("not a snapshot");
  if (typeof o.machine !== "string" || !isCount2(o.seq) || !isCount2(o.time) || typeof o.fingerprint !== "string") fail("missing fields");
  try {
    checkImageRef(o.image);
  } catch (e) {
    fail(e.message);
  }
  for (const p of o.packs) {
    if (!p || typeof p.sig !== "string" || !isHash3(p.sha256) || !isHash3(p.rawSha256) || !isCount2(p.size) || !isCount2(p.rawSize) || !["xz", "zstd", "raw"].includes(p.codec) || p.enc !== 0 && p.enc !== 1 || p.key !== void 0 && (typeof p.key !== "string" || !/^[A-Za-z0-9+/]{43}=$/.test(p.key))) fail("malformed pack entry");
  }
  for (const p of o.deleted) if (!safePath(p)) fail(`unsafe path ${JSON.stringify(p)}`);
  for (const h of o.history) if (!h || !isCount2(h.seq) || !isCount2(h.time) || !isRef(h.ref)) fail("malformed history");
  const kinds = /* @__PURE__ */ new Map();
  for (const n of o.tree) {
    if (!Array.isArray(n) || !safePath(n[0]) || typeof n[1] !== "string") fail("malformed entry");
    const path9 = n[0], type = n[1];
    if (kinds.has(path9)) fail(`${path9} is there twice`);
    const attrs = () => {
      if (!isCount2(n[2], 4095) || !isCount2(n[3], 4294967295) || !isCount2(n[4], 4294967295) || !isCount2(n[5])) fail(`bad attributes for ${path9}`);
    };
    const xattrs = (x) => {
      if (x !== void 0 && (!x || typeof x !== "object" || Array.isArray(x) || Object.values(x).some((v) => typeof v !== "string"))) fail(`bad extended attributes for ${path9}`);
    };
    switch (type) {
      case "f": {
        attrs();
        if (n.length < 10 || n.length > 11 || !isCount2(n[6]) || !isHash3(n[7]) || !Number.isInteger(n[8]) || !isCount2(n[9])) fail(`bad file entry ${path9}`);
        const size = n[6], pack = n[8];
        if (size > 0 && (pack < 0 || pack >= o.packs.length || n[9] + size > o.packs[pack].rawSize)) fail(`file ${path9} points outside its pack`);
        xattrs(n[10]);
        break;
      }
      case "d":
        attrs();
        if (n.length > 7) fail(`bad directory entry ${path9}`);
        xattrs(n[6]);
        break;
      case "l":
        attrs();
        if (n.length !== 7 || typeof n[6] !== "string" || !n[6] || n[6].includes("\0")) fail(`bad symlink ${path9}`);
        break;
      case "h":
        if (n.length !== 3 || !safePath(n[2])) fail(`bad hard link ${path9}`);
        break;
      case "c":
      case "b":
        attrs();
        if (n.length !== 8 || !isCount2(n[6]) || !isCount2(n[7])) fail(`bad device entry ${path9}`);
        break;
      case "p":
        attrs();
        if (n.length !== 6) fail(`bad fifo ${path9}`);
        break;
      default:
        fail(`unknown entry type ${type} for ${path9}`);
    }
    kinds.set(path9, type);
  }
}
async function snapshotBySeq(store, v, head, seq, cacheDir) {
  let ref = head.ref, snapshot = await readSnapshot(store, v, ref, cacheDir);
  for (let hops = 0; hops < 1e4; hops++) {
    if (snapshot.seq === seq) return { snapshot, ref };
    const listed = snapshot.history.find((h) => h.seq === seq);
    const oldest = snapshot.history[snapshot.history.length - 1];
    const next = listed ?? oldest;
    if (!next || next.seq >= snapshot.seq || next.seq < seq) return null;
    ref = next.ref;
    snapshot = await readSnapshot(store, v, ref, cacheDir);
  }
  return null;
}
function order(files) {
  const ext = (p) => {
    const m = /\.([A-Za-z0-9_]+)$/.exec(p.slice(p.lastIndexOf("/") + 1));
    return m ? m[1].toLowerCase() : "";
  };
  return [...files].sort((a, b) => (ext(a.path) < ext(b.path) ? -1 : ext(a.path) > ext(b.path) ? 1 : 0) || (b.size ?? 0) - (a.size ?? 0) || comparePaths(a.path, b.path));
}
async function saveSnapshot(store, v, machine, base, scan, prev, opts = {}) {
  const packs = [];
  const packIndex = /* @__PURE__ */ new Map();
  const usePack = (p) => {
    let i = packIndex.get(p.sig);
    if (i === void 0) {
      i = packs.length;
      packs.push(p);
      packIndex.set(p.sig, i);
    }
    return i;
  };
  const known = /* @__PURE__ */ new Map();
  for (const n of base.tree) if (n[1] === "f" && n[6] > 0) known.set(n[7], { pack: { ...base.packs[n[8]], enc: base.packs[n[8]].enc ?? 0 }, offset: n[9] });
  if (prev) {
    for (const n of prev.snapshot.tree) if (n[1] === "f" && n[6] > 0) known.set(n[7], { pack: prev.snapshot.packs[n[8]], offset: n[9] });
  }
  const files = scan.changes.filter((c) => c.type === "f" && (c.size ?? 0) > 0);
  const fresh = /* @__PURE__ */ new Map();
  for (const f of files) if (!known.has(f.sha256) && !fresh.has(f.sha256)) fresh.set(f.sha256, f);
  const groups = [];
  let group = [], size = 0;
  for (const f of order([...fresh.values()])) {
    if (size && size + f.size > SAVE_PACK_RAW) {
      groups.push(group);
      group = [];
      size = 0;
    }
    group.push(f);
    size += f.size;
  }
  if (group.length) groups.push(group);
  const sealedPacks = [];
  groups.forEach((g, gi) => {
    opts.onProgress?.("compressing", gi, groups.length);
    const members = [];
    const parts = [];
    let offset = 0;
    for (const f of g) {
      const data2 = fs7.readFileSync(f.src);
      if (data2.length !== f.size || toHex(sha256(data2)) !== f.sha256) throw new ChangedDuringSave(f.path);
      members.push({ sha256: f.sha256, offset });
      parts.push(data2);
      offset += data2.length;
    }
    const raw = Buffer.concat(parts);
    const packed = compress(raw, { arch: machine.image.arch });
    const { sealed: data, key: key2 } = sealWithKey(v.encKey, packed.data, "pack");
    sealedPacks.push({ members, data, info: { sig: "", sha256: toHex(sha256(data)), size: data.length, codec: packed.codec, rawSha256: toHex(sha256(raw)), rawSize: raw.length, enc: 1, key: key2 } });
  });
  const newBytes = [...fresh.values()].reduce((n, f) => n + f.size, 0);
  const storedBytes = sealedPacks.reduce((n, p) => n + p.data.length, 0);
  const manifestEstimate = 400 + scan.changes.length * 60 + scan.deleted.length * 30;
  const transactions = sealedPacks.reduce((n, p) => n + ChainStore.plan(p.data.length, store.defaults).transactions, 0) + ChainStore.plan(manifestEstimate, store.defaults).transactions + 4;
  const plan = { newBytes, storedBytes, transactions, lamports: transactions * (5e3 + Math.max(0, store.defaults.priorityFeeLamports ?? 0)), reusedFiles: files.length - fresh.size, newFiles: fresh.size };
  if (opts.approve && !await opts.approve(plan)) return null;
  let sent = 0;
  const total = Math.max(1, storedBytes);
  for (const p of sealedPacks) {
    const base0 = sent;
    const ref2 = await store.put(v.signer, p.data, { journalDir: opts.journalDir, commitment: opts.commitment, onProgress: (g) => {
      if (g.phase === "data") opts.onProgress?.("uploading", base0 + Math.round(g.done / Math.max(1, g.total) * p.data.length), total);
    } });
    p.info.sig = ref2.sig;
    sent += p.data.length;
    for (const m of p.members) known.set(m.sha256, { pack: p.info, offset: m.offset });
  }
  const tree = scan.changes.map((c) => {
    switch (c.type) {
      case "f": {
        const w = c.size ? known.get(c.sha256) : null;
        const n = w ? [c.path, "f", c.mode, c.uid, c.gid, c.mtime, c.size, c.sha256, usePack(w.pack), w.offset] : [c.path, "f", c.mode, c.uid, c.gid, c.mtime, 0, c.sha256, -1, 0];
        if (c.xattrs) n.push(c.xattrs);
        return n;
      }
      case "d":
        return c.xattrs ? [c.path, "d", c.mode, c.uid, c.gid, c.mtime, c.xattrs] : [c.path, "d", c.mode, c.uid, c.gid, c.mtime];
      case "l":
        return [c.path, "l", c.mode, c.uid, c.gid, c.mtime, c.link ?? ""];
      case "h":
        return [c.path, "h", c.link ?? ""];
      case "c":
      case "b":
        return [c.path, c.type, c.mode, c.uid, c.gid, c.mtime, c.major ?? 0, c.minor ?? 0];
      case "p":
        return [c.path, "p", c.mode, c.uid, c.gid, c.mtime];
    }
  });
  const seq = (prev?.head.seq ?? 0) + 1, time = Math.floor(Date.now() / 1e3);
  const history = prev ? [{ seq: prev.head.seq, time: prev.head.time, ref: prev.head.ref, files: prev.snapshot.tree.length, bytes: prev.snapshot.tree.reduce((n, t) => n + (t[1] === "f" ? t[6] : 0), 0), ...prev.snapshot.note && { note: prev.snapshot.note } }, ...prev.snapshot.history].slice(0, HISTORY_LISTED) : [];
  const snapshot = { chainboot: 1, kind: "snapshot", machine: machine.name, seq, time, image: machine.image, packs, tree, deleted: scan.deleted, fingerprint: scan.fingerprint, history, ...opts.note && { note: opts.note.slice(0, 500) } };
  opts.onProgress?.("finishing", 0, 1);
  await opts.beforePointer?.();
  const ref = await putDoc(store, v, stateTag(v, machine.name), "snapshot", snapshot, { seq, time }, { journalDir: opts.journalDir, commitment: opts.commitment });
  await withLock(`index-${v.signer.address}`, async () => {
    const index = await readIndex(store, v);
    const entry = index.machines[machine.name];
    if (entry && !!entry.boot === !!machine.boot && !!entry.lazy === !!machine.lazy) return;
    index.machines[machine.name] = { image: entry?.image ?? machine.image, created: entry?.created ?? machine.created, ...machine.boot && { boot: true }, ...machine.lazy && { lazy: true } };
    await writeIndex(store, v, index, opts.commitment);
  });
  opts.onProgress?.("finishing", 1, 1);
  return { head: { seq, time, ref }, plan };
}
var ChangedDuringSave = class extends Error {
  constructor(file) {
    super(`${file} changed while it was being saved`);
    this.name = "ChangedDuringSave";
  }
};
async function loadPacks(store, v, snap, cacheDir, onProgress, have) {
  const objects = path7.join(cacheDir, "objects");
  const used = new Set(snap.tree.filter((n) => n[1] === "f" && n[6] > 0 && !have?.(n)).map((n) => n[8]));
  const total = [...used].reduce((n, i) => n + snap.packs[i].size, 0);
  const got = /* @__PURE__ */ new Map();
  const raw = /* @__PURE__ */ new Map();
  await Promise.all([...used].map(async (i) => {
    const p = snap.packs[i];
    const stored = await store.get({ sig: p.sig, sha256: p.sha256, size: p.size }, {
      signers: p.enc && !p.key ? [v.signer.publicKey] : void 0,
      cacheDir: objects,
      onProgress: (g) => {
        got.set(i, g.bytes);
        onProgress?.([...got.values()].reduce((a, b) => a + b, 0), total);
      }
    });
    const data = decompress(p.codec, p.enc ? openEither(v.encKey, p.key, stored, "pack") : stored, p.rawSize);
    if (toHex(sha256(data)) !== p.rawSha256) throw new Error(`saved pack ${i + 1} is damaged`);
    raw.set(i, data);
  }));
  return (i) => {
    const r = raw.get(i);
    if (!r) throw new Error(`snapshot pack ${i} was not loaded`);
    return r;
  };
}
function applySnapshot(snap, merged, content) {
  checkSnapshot(snap);
  const lostAttrs = /* @__PURE__ */ new Set();
  const unmapped = /* @__PURE__ */ new Set();
  const own = (p, uid, gid) => {
    try {
      fs7.lchownSync(p, uid, gid);
    } catch (e) {
      if (e.code !== "EINVAL") throw e;
      unmapped.add(`${uid}:${gid}`);
    }
  };
  const at = (p) => {
    if (!p || p.startsWith("/") || p.split("/").some((s) => s === "" || s === "." || s === "..")) throw new Error(`unsafe path in snapshot: ${p}`);
    const parts = p.split("/");
    let cur = merged;
    for (let i = 0; i < parts.length - 1; i++) {
      cur = path7.join(cur, parts[i]);
      const st = fs7.lstatSync(cur, { throwIfNoEntry: false });
      if (!st) fs7.mkdirSync(cur, { mode: 493 });
      else if (!st.isDirectory()) throw new Error(`cannot restore ${p}: ${parts.slice(0, i + 1).join("/")} is not a directory`);
    }
    return path7.join(merged, p);
  };
  const clear = (p) => fs7.rmSync(p, { recursive: true, force: true });
  for (const p of snap.deleted) clear(at(p));
  const dirs = [], links = [];
  for (const n of [...snap.tree].sort((a, b) => comparePaths(a[0], b[0]))) {
    const p = at(n[0]);
    const st = fs7.lstatSync(p, { throwIfNoEntry: false });
    switch (n[1]) {
      case "d":
        if (st && !st.isDirectory()) clear(p);
        if (!st || !st.isDirectory()) fs7.mkdirSync(p);
        dirs.push(n);
        break;
      case "f": {
        if (st) clear(p);
        const data = n[6] === 0 ? Buffer.alloc(0) : content(n);
        if (data.length !== n[6] || n[6] > 0 && toHex(sha256(data)) !== n[7]) throw new Error(`the saved content of ${n[0]} is damaged (it does not match its hash)`);
        fs7.writeFileSync(p, data, { mode: 384 });
        own(p, n[3], n[4]);
        fs7.chmodSync(p, n[2]);
        if (n[10] && writeXattrs(p, n[10]).length) lostAttrs.add(n[0]);
        fs7.utimesSync(p, n[5], n[5]);
        break;
      }
      case "l":
        if (st) clear(p);
        fs7.symlinkSync(n[6], p);
        own(p, n[3], n[4]);
        fs7.lutimesSync(p, n[5], n[5]);
        break;
      case "h":
        links.push(n);
        break;
      case "c":
      case "b":
      case "p": {
        if (st) clear(p);
        const r = spawnSync4("mknod", ["-m", (n[2] & 4095).toString(8), p, n[1], ...n[1] === "p" ? [] : [String(n[6]), String(n[7])]]);
        if (r.status === 0) {
          own(p, n[3], n[4]);
          fs7.utimesSync(p, n[5], n[5]);
        }
        break;
      }
    }
  }
  for (const n of links) {
    if (n[1] !== "h") continue;
    const p = at(n[0]), target = at(n[2]);
    if (!fs7.lstatSync(target, { throwIfNoEntry: false })?.isFile()) throw new Error(`cannot restore ${n[0]}: ${n[2]} is not a regular file`);
    clear(p);
    fs7.linkSync(target, p);
  }
  for (let i = dirs.length - 1; i >= 0; i--) {
    const n = dirs[i];
    if (n[1] !== "d") continue;
    const p = at(n[0]);
    if (!fs7.lstatSync(p, { throwIfNoEntry: false })?.isDirectory()) throw new Error(`cannot restore ${n[0]}: it is not a directory any more`);
    own(p, n[3], n[4]);
    fs7.chmodSync(p, n[2]);
    if (n[6] && writeXattrs(p, n[6]).length) lostAttrs.add(n[0]);
    fs7.utimesSync(p, n[5], n[5]);
  }
  return { unmappedOwners: [...unmapped], lostAttributes: [...lostAttrs] };
}

// src/registry/private.ts
var privateTag = (v) => tagAddress("private-images", v.signer.publicKey);
var privateLock = (v) => `private-${v.signer.address}`;
async function readPrivateCatalog(store, v) {
  const p = await getPointer(store, v, privateTag(v), "private-catalog");
  if (!p) return { chainboot: 1, kind: "private-catalog", updated: 0, images: {} };
  const cat = await getDocByRef(store, v, "private-catalog", p.ref);
  if (cat?.chainboot !== 1 || cat.kind !== "private-catalog") throw new Error("your private catalog is malformed");
  try {
    cat.images = cleanImages(cat.images);
  } catch (e) {
    throw new Error(`your private catalog is malformed: ${e.message}`);
  }
  return cat;
}
async function writePrivateCatalog(store, v, cat, commitment) {
  cat.updated = Math.floor(Date.now() / 1e3);
  await putDoc(store, v, privateTag(v), "private-catalog", cat, {}, { commitment });
}
async function publishPrivateImage(store, v, built, opts = {}) {
  const m = built.manifest;
  const say = (phase) => (p) => opts.onProgress?.({ phase, done: p.done, total: p.total, detail: p.phase });
  for (const [index, data] of [...built.newPacks.entries()].sort((a, b) => a[0] - b[0])) {
    const { sealed, key: key2 } = sealWithKey(v.encKey, data, "pack");
    const ref2 = await store.put(v.signer, sealed, { journalDir: opts.journalDir, commitment: opts.commitment, onProgress: say(`pack ${index + 1}/${m.packs.length}`) });
    const p = m.packs[index];
    p.sig = ref2.sig;
    p.sha256 = ref2.sha256;
    p.size = ref2.size;
    p.enc = 1;
    p.key = key2;
  }
  if (m.packs.some((p) => !p.sig)) throw new Error("internal error: a pack has no on-chain address");
  const raw = serializeManifest(m);
  const packed = compress(raw);
  const o = await store.put(v.signer, seal(v.encKey, packed.data, "image-manifest"), { journalDir: opts.journalDir, commitment: opts.commitment, onProgress: say("manifest") });
  const ref = {
    sig: o.sig,
    sha256: o.sha256,
    size: o.size,
    codec: packed.codec,
    rawSize: raw.length,
    digest: m.digest,
    version: m.version,
    created: m.created,
    downloadSize: o.size + m.packs.reduce((n, p) => n + p.size, 0),
    unpackedSize: m.rawSize,
    private: true
  };
  opts.onProgress?.({ phase: "catalog", done: 0, total: 1 });
  await withLock(privateLock(v), async () => {
    const cat = await readPrivateCatalog(store, v);
    const image = cat.images[m.name] ??= { tags: {} };
    if (opts.description ?? m.description) image.description = opts.description ?? m.description;
    for (const tag of opts.tags ?? [m.version, "latest"]) (image.tags[tag] ??= {})[m.arch] = ref;
    await writePrivateCatalog(store, v, cat, opts.commitment);
  });
  opts.onProgress?.({ phase: "catalog", done: 1, total: 1 });
  return ref;
}
async function unlistPrivateImage(store, v, name, tag, arch) {
  return withLock(privateLock(v), () => unlistLocked2(store, v, name, tag, arch));
}
async function unlistLocked2(store, v, name, tag, arch) {
  const cat = await readPrivateCatalog(store, v);
  const image = cat.images[name];
  if (!image) return false;
  if (!tag) delete cat.images[name];
  else if (!image.tags[tag]) return false;
  else if (!arch) delete image.tags[tag];
  else if (!image.tags[tag][arch]) return false;
  else {
    delete image.tags[tag][arch];
    if (!Object.keys(image.tags[tag]).length) delete image.tags[tag];
  }
  if (cat.images[name] && !Object.keys(cat.images[name].tags).length) delete cat.images[name];
  await writePrivateCatalog(store, v, cat);
  return true;
}

// src/share/share.ts
var inboxTag = (sharePublicKey) => tagAddress("inbox", sharePublicKey);
var cannot = (what) => new Error(`${what} holds data that an early version of chainboot stored before objects had keys of their own, so it cannot be shared. ${what.startsWith("image") ? "Publish it again and share that." : "Make a new machine from the same image, copy your work into it, save it and share that one."}`);
async function send(store, v, to, record, opts) {
  const mine = shareKeys(v);
  if (mine.publicKey.equals(Buffer.from(to))) throw new Error("that is your own share address");
  const raw = Buffer.from(JSON.stringify(record), "utf8");
  const packed = compress(raw);
  let sealed = sealTo(to, mine, Buffer.from(JSON.stringify({ r: packed.data.toString("base64"), c: packed.codec, n: raw.length }), "utf8"), "share");
  if (sealed.length > store.pointerCapacity()) {
    const o = await store.put(v.signer, sealTo(to, mine, packed.data, "share-record"), { journalDir: opts.journalDir, commitment: opts.commitment });
    sealed = sealTo(to, mine, Buffer.from(JSON.stringify({ o: { sig: o.sig, sha256: o.sha256, size: o.size }, by: v.signer.address, c: packed.codec, n: raw.length }), "utf8"), "share");
  }
  return store.putPointer(v.signer, inboxTag(to), sealed, { commitment: opts.commitment });
}
async function keyOfObject(store, v, ref, purpose, cacheDir) {
  const sealed = await store.get(ref, { signers: [v.signer.publicKey], cacheDir });
  return objectKey(v.encKey, sealed, purpose)?.toString("base64") ?? null;
}
async function shareImage(store, v, name, tag, arch, to, opts = {}) {
  const receiver = parseShareAddress(to);
  const cat = await readPrivateCatalog(store, v);
  const image = cat.images[name];
  const ref = image?.tags[tag]?.[arch];
  if (!image || !ref) throw new Error(`you have no private image "${name}:${tag}" for ${arch}`);
  const publisher = ref.publisher ?? v.signer.address;
  const sealed = await store.get({ sig: ref.sig, sha256: ref.sha256, size: ref.size }, { signers: [addressToBytes(publisher)], cacheDir: opts.cacheDir });
  const key2 = ref.key ?? objectKey(v.encKey, sealed, "image-manifest")?.toString("base64");
  if (!key2) throw cannot(`image "${name}"`);
  const manifest = parseManifest(decompress(ref.codec, openEither(v.encKey, ref.key, sealed, "image-manifest"), ref.rawSize));
  if (manifest.packs.some((p) => p.enc && !p.key)) throw cannot(`image "${name}"`);
  const record = {
    chainboot: 1,
    kind: "share",
    what: "image",
    name,
    time: Math.floor(Date.now() / 1e3),
    wallet: v.wallet,
    ...opts.note && { note: opts.note },
    image: { ...image.description && { description: image.description }, tag, arch, ref: { ...ref, private: true, publisher, key: key2 } }
  };
  return send(store, v, receiver, record, opts);
}
async function shareMachine(store, v, name, to, opts = {}) {
  const receiver = parseShareAddress(to);
  const head = await readHead(store, v, name);
  if (!head) throw new Error(`"${name}" has no save on chain yet. Save it first: chainboot save ${name}`);
  const sealed = await store.get({ sig: head.ref.sig, sha256: head.ref.sha256, size: head.ref.size }, { signers: [v.signer.publicKey], cacheDir: opts.cacheDir });
  const key2 = objectKey(v.encKey, sealed, "snapshot")?.toString("base64");
  if (!key2) throw cannot(`machine "${name}"`);
  const snap = JSON.parse(decompress(head.ref.codec, open(v.encKey, sealed, "snapshot"), head.ref.rawSize).toString("utf8"));
  const keys = {};
  for (const p of snap.packs) {
    if (!p.enc || p.key) continue;
    const k = await keyOfObject(store, v, p, "pack", opts.cacheDir);
    if (!k) throw cannot(`machine "${name}"`);
    keys[p.sha256] = k;
  }
  const image = { ...snap.image, manifest: { ...snap.image.manifest } };
  if (image.private && !image.manifest.key) {
    const k = await keyOfObject(store, v, image.manifest, "image-manifest", opts.cacheDir);
    if (!k) throw cannot(`the image of machine "${name}"`);
    const manifestSealed = await store.get({ sig: image.manifest.sig, sha256: image.manifest.sha256, size: image.manifest.size }, { signers: [v.signer.publicKey], cacheDir: opts.cacheDir });
    const manifest = parseManifest(decompress(image.manifest.codec, open(v.encKey, manifestSealed, "image-manifest"), image.manifest.rawSize));
    if (manifest.packs.some((p) => p.enc && !p.key)) throw cannot(`the image of machine "${name}"`);
    image.manifest.key = k;
  }
  const index = await readIndex(store, v);
  const entry = index.machines[name];
  const record = {
    chainboot: 1,
    kind: "share",
    what: "machine",
    name,
    time: Math.floor(Date.now() / 1e3),
    wallet: v.wallet,
    ...opts.note && { note: opts.note },
    machine: {
      image,
      created: entry?.created ?? snap.time,
      ...entry?.boot && { boot: true },
      seq: head.seq,
      saved: head.time,
      snapshot: head.ref,
      signer: v.signer.address,
      key: key2,
      ...Object.keys(keys).length && { keys }
    }
  };
  return { id: await send(store, v, receiver, record, opts), seq: head.seq, saved: head.time };
}
var IMAGE_NAME = /^[a-z0-9][a-z0-9._-]{0,62}$/;
var LABEL2 = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
var KEY = /^[A-Za-z0-9+/]{43}=$/;
var isCount3 = (x) => Number.isSafeInteger(x) && x >= 0;
var isAddress = (x) => {
  try {
    addressToBytes(x);
    return typeof x === "string";
  } catch {
    return false;
  }
};
function cleanShareRecord(r) {
  if (!r || typeof r !== "object" || r.chainboot !== 1 || r.kind !== "share" || !IMAGE_NAME.test(String(r.name)) || !isAddress(r.wallet) || !isCount3(r.time)) return null;
  const base = { chainboot: 1, kind: "share", name: r.name, time: r.time, wallet: r.wallet, ...r.note !== void 0 && { note: plainText(r.note, 200) } };
  if (r.what === "image") {
    const i = r.image, ref = cleanRef(i?.ref);
    if (!i || !ref || !ref.key || !ref.publisher || !LABEL2.test(String(i.tag)) || !LABEL2.test(String(i.arch))) return null;
    return { ...base, what: "image", image: { ...i.description !== void 0 && { description: plainText(i.description, 300) }, tag: i.tag, arch: i.arch, ref: { ...ref, private: true } } };
  }
  if (r.what === "machine") {
    const m = r.machine, snap = m?.snapshot;
    if (!m || !snap || typeof snap.sig !== "string" || snap.sig.length > 90 || !/^[0-9a-f]{64}$/.test(String(snap.sha256)) || !isCount3(snap.size) || !isCount3(snap.rawSize) || !["xz", "zstd", "raw"].includes(snap.codec)) return null;
    if (!KEY.test(String(m.key)) || !isAddress(m.signer) || !isCount3(m.created) || !isCount3(m.seq) || !isCount3(m.saved)) return null;
    try {
      checkImageRef(m.image);
    } catch {
      return null;
    }
    const keys = {};
    for (const [hash, key2] of Object.entries(m.keys ?? {})) {
      if (!/^[0-9a-f]{64}$/.test(hash) || !KEY.test(String(key2))) return null;
      keys[hash] = key2;
    }
    const im = m.image;
    return {
      ...base,
      what: "machine",
      machine: {
        image: { publisher: im.publisher, name: im.name, tag: im.tag, arch: im.arch, digest: im.digest, ...im.private && { private: true }, manifest: { sig: im.manifest.sig, sha256: im.manifest.sha256, size: im.manifest.size, codec: im.manifest.codec, rawSize: im.manifest.rawSize, ...im.manifest.key && { key: im.manifest.key } } },
        created: m.created,
        ...m.boot === true && { boot: true },
        seq: m.seq,
        saved: m.saved,
        snapshot: { sig: snap.sig, sha256: snap.sha256, size: snap.size, codec: snap.codec, rawSize: snap.rawSize },
        signer: m.signer,
        key: m.key,
        ...Object.keys(keys).length && { keys }
      }
    };
  }
  return null;
}
async function listShares(store, v, opts = {}) {
  const mine = shareKeys(v);
  const out = [];
  const seen = /* @__PURE__ */ new Map();
  for (const p of await store.listPointers(inboxTag(mine.publicKey), { limit: opts.limit ?? 100 })) {
    const got = openFrom(mine, p.payload, "share");
    if (!got) continue;
    try {
      const m = JSON.parse(got.plain.toString("utf8"));
      if (!Number.isInteger(m.n) || m.n < 0 || m.n > 4 << 20) continue;
      let packed;
      if (typeof m.r === "string") packed = Buffer.from(m.r, "base64");
      else if (m.o && m.by) {
        if (!Number.isSafeInteger(m.o.size) || m.o.size < 0 || m.o.size > 8 << 20) continue;
        const inner = openFrom(mine, await store.get(m.o, { signers: [addressToBytes(m.by)], cacheDir: opts.cacheDir }), "share-record");
        if (!inner || !inner.sender.equals(got.sender)) continue;
        packed = inner.plain;
      } else continue;
      const record = cleanShareRecord(JSON.parse(decompress(m.c, packed, m.n).toString("utf8")));
      if (!record) continue;
      const identity = toHex(sha256(Buffer.concat([got.sender, packed])));
      const earlier = seen.get(identity);
      const item = { id: p.signature, arrived: p.blockTime, from: shareAddress(got.sender), record };
      if (earlier !== void 0) out[earlier] = item;
      else {
        seen.set(identity, out.length);
        out.push(item);
      }
    } catch {
    }
  }
  return out;
}
async function acceptImage(store, v, shared, name = shared.name, opts = {}) {
  const r = cleanShareRecord(shared);
  if (!r || r.what !== "image" || !r.image) throw new Error("this share is not an image");
  if (!IMAGE_NAME.test(name)) throw new Error(`invalid image name "${name}": use lower-case letters, digits, ".", "_" or "-"`);
  const { tag, arch, ref, description } = r.image;
  await withLock(privateLock(v), async () => {
    const cat = await readPrivateCatalog(store, v);
    const existing = cat.images[name]?.tags[tag]?.[arch];
    if (existing && existing.digest === ref.digest) return;
    if (existing) throw new Error(`you already have a different private image "${name}:${tag}" for ${arch}. Keep the shared one under another name: --name <name>`);
    if (cat.images[name] && !opts.merge) throw new Error(`you already have a private image named "${name}". Keep the shared one under another name (--name <name>), or add it to yours by naming yours: --name ${name}`);
    const image = cat.images[name] ??= { tags: {} };
    if (description && !image.description) image.description = description;
    (image.tags[tag] ??= {})[arch] = { ...ref, private: true };
    if (tag !== "latest") (image.tags.latest ??= {})[arch] ??= { ...ref, private: true };
    await writePrivateCatalog(store, v, cat);
  });
}
async function acceptMachine(store, v, shared, name = shared.name, opts = {}) {
  const r = cleanShareRecord(shared);
  if (!r || r.what !== "machine" || !r.machine) throw new Error("this share is not a machine");
  if (!IMAGE_NAME.test(name)) throw new Error(`invalid machine name "${name}": use lower-case letters, digits, ".", "_" or "-"`);
  const m = r.machine;
  const taken = async () => {
    if ((await readIndex(store, v)).machines[name] || await readHead(store, v, name)) throw new Error(`you already have a saved machine named "${name}". Keep the shared one under another name: --name <name>`);
  };
  await taken();
  const sealed = await store.get({ sig: m.snapshot.sig, sha256: m.snapshot.sha256, size: m.snapshot.size }, { signers: [addressToBytes(m.signer)], cacheDir: opts.cacheDir });
  const snap = JSON.parse(decompress(m.snapshot.codec, openWithKey(Buffer.from(m.key, "base64"), sealed, "snapshot"), m.snapshot.rawSize).toString("utf8"));
  try {
    checkSnapshot(snap);
  } catch (e) {
    throw new Error(`the shared save cannot be kept: ${e.message}`);
  }
  for (const p of snap.packs) {
    if (p.enc && !p.key) p.key = m.keys?.[p.sha256];
    if (p.enc && !p.key) throw new Error("the share does not carry the key of every pack it needs");
  }
  const time = Math.floor(Date.now() / 1e3);
  const mine = { chainboot: 1, kind: "snapshot", machine: name, seq: 1, time, image: m.image, packs: snap.packs, tree: snap.tree, deleted: snap.deleted, fingerprint: snap.fingerprint, history: [] };
  await withLock(`index-${v.signer.address}`, async () => {
    await taken();
    await putDoc(store, v, stateTagOf(v, name), "snapshot", mine, { seq: 1, time });
    const index = await readIndex(store, v);
    index.machines[name] = { image: m.image, created: m.created, ...m.boot && { boot: true } };
    await writeIndex(store, v, index);
  });
}
function myShareAddress(v) {
  return shareAddress(shareKeys(v).publicKey);
}

// src/state/scan.ts
import { createHash as createHash9 } from "node:crypto";
import fs8 from "node:fs";
import path8 from "node:path";
var MAX_SAVED_FILE = 1 << 30;
var RUNTIME_FILES = /* @__PURE__ */ new Set(["etc/resolv.conf", "etc/hosts", "etc/hostname"]);
var UNSAVED_DIRS = [
  "tmp",
  "run",
  "proc",
  "sys",
  "dev",
  "var/tmp",
  // package manager caches: large, and rebuilt by the next "apt update" / "apk update" / "dnf makecache"
  "var/lib/apt/lists",
  "var/cache/apt",
  "var/cache/apk",
  "var/cache/dnf",
  "var/cache/yum",
  "var/cache/pacman",
  "var/cache/zypp",
  "var/cache/man",
  "var/cache/ldconfig",
  "var/cache/fontconfig",
  "var/log/journal",
  "root/.cache"
];
var UNSAVED_PATTERNS = [/^home\/[^/]+\/\.cache\//];
function isUnsaved(p) {
  if (RUNTIME_FILES.has(p)) return true;
  for (const d of UNSAVED_DIRS) if (p.startsWith(d + "/")) return true;
  return UNSAVED_PATTERNS.some((re) => re.test(p));
}
function hashFile(file) {
  const h = createHash9("sha256");
  const fd = fs8.openSync(file, "r");
  let size = 0;
  try {
    const buf = Buffer.allocUnsafe(1 << 20);
    for (; ; ) {
      const n = fs8.readSync(fd, buf, 0, buf.length, null);
      if (n <= 0) break;
      h.update(buf.subarray(0, n));
      size += n;
    }
  } finally {
    fs8.closeSync(fd);
  }
  return { sha256: h.digest("hex"), size };
}
var gone = (e) => {
  const code = e?.code;
  return code === "ENOENT" || code === "ENOTDIR";
};
var sameAttrs = (a, b) => {
  const ka = Object.keys(a ?? {}), kb = Object.keys(b ?? {});
  return ka.length === kb.length && ka.every((k) => a[k] === b?.[k]);
};
function changeToNode(c) {
  switch (c.type) {
    case "f":
      return c.xattrs ? [c.path, "f", c.mode, c.uid, c.gid, c.mtime, c.size ?? 0, c.sha256 ?? EMPTY_SHA256, 0, 0, c.xattrs] : [c.path, "f", c.mode, c.uid, c.gid, c.mtime, c.size ?? 0, c.sha256 ?? EMPTY_SHA256, 0, 0];
    case "d":
      return c.xattrs ? [c.path, "d", c.mode, c.uid, c.gid, c.mtime, c.xattrs] : [c.path, "d", c.mode, c.uid, c.gid, c.mtime];
    case "l":
      return [c.path, "l", c.mode, c.uid, c.gid, c.mtime, c.link ?? ""];
    case "h":
      return [c.path, "h", c.link ?? ""];
    case "c":
    case "b":
      return [c.path, c.type, c.mode, c.uid, c.gid, c.mtime, c.major ?? 0, c.minor ?? 0];
    case "p":
      return [c.path, "p", c.mode, c.uid, c.gid, c.mtime];
  }
}
function scanMachine(o) {
  const baseNodes = /* @__PURE__ */ new Map();
  const baseChildren = /* @__PURE__ */ new Map();
  for (const n of o.base.tree) {
    baseNodes.set(n[0], n);
    const slash = n[0].lastIndexOf("/");
    const parent = slash < 0 ? "" : n[0].slice(0, slash);
    let list = baseChildren.get(parent);
    if (!list) baseChildren.set(parent, list = []);
    list.push(n[0].slice(slash + 1));
  }
  let cache = {};
  if (o.cacheFile) {
    try {
      cache = JSON.parse(fs8.readFileSync(o.cacheFile, "utf8"));
    } catch {
    }
  }
  const nextCache = {};
  const changes = [];
  const deleted = /* @__PURE__ */ new Set();
  const skipped = [];
  const inodes = /* @__PURE__ */ new Map();
  const lexists = (p) => {
    try {
      fs8.lstatSync(p);
      return true;
    } catch {
      return false;
    }
  };
  const walk = (rel) => {
    const dir = rel ? path8.join(o.upper, rel) : o.upper;
    let names;
    try {
      names = fs8.readdirSync(dir).sort();
    } catch {
      return;
    }
    for (const name of names) {
      const p = rel ? `${rel}/${name}` : name;
      if (Buffer.byteLength(name) !== Buffer.from(name, "utf8").length || name.includes("\uFFFD")) {
        skipped.push({ path: p, why: "file name is not valid UTF-8" });
        continue;
      }
      if (isUnsaved(p)) continue;
      const abs = path8.join(dir, name);
      let st;
      try {
        st = fs8.lstatSync(abs);
      } catch (e) {
        if (gone(e)) continue;
        throw e;
      }
      const mtime = Math.floor(st.mtimeMs / 1e3);
      const common = { path: p, mode: st.mode & 4095, uid: st.uid, gid: st.gid, mtime };
      if (st.isCharacterDevice() && st.rdev === 0) {
        if (baseNodes.has(p)) deleted.add(p);
        continue;
      }
      if (st.isDirectory()) {
        changes.push({ ...common, type: "d" });
        for (const child of baseChildren.get(p) ?? []) {
          const cp = `${p}/${child}`;
          if (!isUnsaved(cp) && !lexists(path8.join(o.merged, cp))) deleted.add(cp);
        }
        walk(p);
      } else if (st.isFile()) {
        if (st.size > MAX_SAVED_FILE) {
          skipped.push({ path: p, why: "larger than 1 GiB" });
          continue;
        }
        const id2 = `${st.dev}:${st.ino}`;
        const first = st.nlink > 1 ? inodes.get(id2) : void 0;
        if (first) {
          changes.push({ ...common, type: "h", link: first });
          continue;
        }
        if (st.nlink > 1) inodes.set(id2, p);
        const known = cache[p];
        let sha2562, size = st.size;
        if (st.size === 0) sha2562 = EMPTY_SHA256;
        else if (known && known.size === st.size && known.mtimeMs === st.mtimeMs && known.ctimeMs === st.ctimeMs && known.ino === st.ino) sha2562 = known.sha256;
        else {
          let hashed;
          try {
            hashed = hashFile(abs);
          } catch (e) {
            if (gone(e)) continue;
            throw e;
          }
          sha2562 = hashed.sha256;
          size = hashed.size;
        }
        if (size === st.size) nextCache[p] = { size, mtimeMs: st.mtimeMs, ctimeMs: st.ctimeMs, ino: st.ino, sha256: sha2562 };
        changes.push({ ...common, type: "f", size, sha256: size === 0 ? EMPTY_SHA256 : sha2562, src: abs });
      } else if (st.isSymbolicLink()) {
        let link;
        try {
          link = fs8.readlinkSync(abs);
        } catch (e) {
          if (gone(e)) continue;
          throw e;
        }
        changes.push({ ...common, type: "l", link });
      } else if (st.isFIFO()) {
        changes.push({ ...common, type: "p" });
      } else if (st.isCharacterDevice() || st.isBlockDevice()) {
        changes.push({ ...common, type: st.isCharacterDevice() ? "c" : "b", major: st.rdev >> 8 & 4095, minor: st.rdev & 255 | st.rdev >> 12 & 1048320 });
      } else {
        skipped.push({ path: p, why: "sockets cannot be saved" });
      }
    }
  };
  walk("");
  const attrs = readXattrs(o.upper);
  if (attrs?.size) for (const c of changes) {
    const x = (c.type === "f" || c.type === "d") && attrs.get(c.path);
    if (x) c.xattrs = x;
  }
  const removed = [...deleted].sort(comparePaths).filter((p, _i, all) => !all.some((q) => q !== p && p.startsWith(q + "/")));
  const linkTargets = new Set(changes.filter((c) => c.type === "h").map((c) => c.link));
  const real = changes.filter((c) => {
    const b = baseNodes.get(c.path);
    if (!b || linkTargets.has(c.path)) return true;
    if (c.type === "f" && b[1] === "f") return !(b[2] === c.mode && b[3] === c.uid && b[4] === c.gid && b[5] === c.mtime && b[7] === c.sha256 && sameAttrs(b[10], c.xattrs));
    return identityLine(changeToNode(c)) !== identityLine(b);
  }).sort((a, b) => comparePaths(a.path, b.path));
  const h = createHash9("sha256");
  for (const c of real) h.update(identityLine(changeToNode(c)) + "\n");
  for (const p of removed) h.update(`-${p}
`);
  if (o.cacheFile) {
    try {
      fs8.writeFileSync(o.cacheFile, JSON.stringify(nextCache));
    } catch {
    }
  }
  return { changes: real, deleted: removed, skipped, fingerprint: h.digest("hex"), bytes: real.reduce((n, c) => n + (c.size ?? 0), 0) };
}
export {
  ChainStore,
  GENESIS,
  Keypair,
  LOGIN_MESSAGE,
  MAX_TX_SIZE_LEGACY,
  MAX_TX_SIZE_V1,
  NOOP_PROGRAM,
  RpcError,
  RpcPool,
  SYSTEM_PROGRAM,
  TrustError,
  TxSender,
  acceptImage,
  acceptMachine,
  addressToBytes,
  applySnapshot,
  b58decode,
  b58encode,
  buildImage,
  buildNoopTransaction,
  buildTransaction,
  capacity,
  checkSnapshot,
  cleanShareRecord,
  clusterName,
  compileMessage,
  compileMessageV1,
  compress,
  computeBudgetInstructions,
  configIdentity,
  decodeSlots,
  decompress,
  decompressAuto,
  deriveVault,
  encodeSlots,
  endorseImage,
  entriesFromImage,
  extractImage,
  formatList,
  isList,
  listShares,
  loadPacks,
  maskRpcUrl,
  myShareAddress,
  noopCapacity,
  noopInstruction,
  normalizeEntries,
  objectKey,
  open,
  openFrom,
  openWithKey,
  parseImageName,
  parseList,
  parseManifest,
  parseShareAddress,
  parseTransaction,
  publishImage,
  publishPrivateImage,
  pullImage,
  readCatalog,
  readHead,
  readIndex,
  readList,
  readPrivateCatalog,
  readSnapshot,
  readTar,
  saveSnapshot,
  scanMachine,
  seal,
  sealTo,
  sealWithKey,
  sendAndConfirm,
  serializeManifest,
  shareAddress,
  shareImage,
  shareKeys,
  shareMachine,
  snapshotBySeq,
  tagAddress,
  transferInstruction,
  treeDigest,
  unlistImage,
  unlistPrivateImage,
  validateManifest,
  vaultFromKeypair,
  verifyPack,
  verifyPayerSignature,
  verifySignature,
  writeTar,
  xzDecode,
  xzUncompressedSize
};
