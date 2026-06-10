// Diagnostic: parse a binary FBX into my node format, re-serialize with my writer, validate via SDK.
// Isolates writer bugs (round-trip should preserve the file) from content/structure issues.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { writeBinaryFBX } from "./lib/fbxBinary.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = process.argv[2];
if (!SRC) { console.error("usage: node _roundtrip.mjs <file.fbx>"); process.exit(1); }

const exeDir = path.join(__dirname, "node_modules", "fbx2gltf", "bin", os.platform() === "win32" ? "Windows_NT" : os.platform() === "darwin" ? "Darwin" : "Linux");
const EXE = path.join(exeDir, fs.readdirSync(exeDir).find((f) => /^FBX2glTF/i.test(f)));

const b = fs.readFileSync(SRC);
const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
const version = view.getUint32(23, true);
const is64 = version >= 7500;
const HS = is64 ? 25 : 13;
const rdU = (o) => (is64 ? Number(view.getBigUint64(o, true)) : view.getUint32(o, true));

function readArray(c, tag) {
    const al = view.getUint32(c, true), cl = view.getUint32(c + 8, true);
    c += 12;
    const raw = Uint8Array.from(b.subarray(c, c + cl));
    let arr;
    if (tag === "d") arr = new Float64Array(raw.buffer, 0, al);
    else if (tag === "f") arr = new Float32Array(raw.buffer, 0, al);
    else if (tag === "i") arr = new Int32Array(raw.buffer, 0, al);
    else arr = raw;
    return { value: arr, next: c + cl };
}
function readProp(c) {
    const t = String.fromCharCode(b[c]); c++;
    switch (t) {
        case "C": return { prop: { tag: "C", value: b[c] }, next: c + 1 };
        case "Y": return { prop: { tag: "Y", value: view.getInt16(c, true) }, next: c + 2 };
        case "I": return { prop: { tag: "I", value: view.getInt32(c, true) }, next: c + 4 };
        case "F": return { prop: { tag: "F", value: view.getFloat32(c, true) }, next: c + 4 };
        case "D": return { prop: { tag: "D", value: view.getFloat64(c, true) }, next: c + 8 };
        case "L": return { prop: { tag: "L", value: Number(view.getBigInt64(c, true)) }, next: c + 8 };
        case "S": { const len = view.getUint32(c, true); c += 4; return { prop: { tag: "S", value: b.toString("latin1", c, c + len) }, next: c + len }; }
        case "R": { const len = view.getUint32(c, true); c += 4; return { prop: { tag: "R", value: Buffer.from(b.subarray(c, c + len)) }, next: c + len }; }
        default: { const r = readArray(c, t); return { prop: { tag: t, value: r.value, compress: false }, next: r.next }; }
    }
}
function parseNode(off) {
    const end = rdU(off);
    if (end === 0) return { nul: true, next: off + HS };
    const np = rdU(off + (is64 ? 8 : 4)), pl = rdU(off + (is64 ? 16 : 8)), nl = b[off + HS - 1];
    const name = b.toString("latin1", off + HS, off + HS + nl);
    let c = off + HS + nl;
    const properties = [];
    for (let i = 0; i < np; i++) { const r = readProp(c); properties.push(r.prop); c = r.next; }
    const children = [];
    while (c < end) { const r = parseNode(c); if (r.nul) { c = r.next; break; } children.push(r.node); c = r.next; }
    return { nul: false, node: { name, properties, children }, next: end };
}

const top = [];
let off = 27;
while (off < b.length) { const r = parseNode(off); if (r.nul) break; top.push(r.node); off = r.next; }

// Drop the source FileId/CreationTime/Creator so my writer injects its own (consistent with the
// fixed footer part1). Otherwise the footer mismatches the preserved FileId and the SDK rejects it.
const filtered = top.filter((nd) => !["FileId", "CreationTime", "Creator"].includes(nd.name));
const out = writeBinaryFBX(filtered, version);
const dst = path.join(__dirname, "out", "_roundtrip.fbx");
fs.writeFileSync(dst, out);
console.log(`parsed ${top.length} top nodes; wrote ${out.length} bytes (orig ${b.length})`);
const log = execFileSync(EXE, ["-i", dst, "-o", path.join(__dirname, "out", "_rt.glb"), "--verbose"], { encoding: "utf8" });
console.log((log.match(/\d+ (vertices|textures|nodes|surfaces)/g) || []).join("  "));
for (const d of fs.readdirSync(path.join(__dirname, "out"))) if (d.endsWith(".fbm")) fs.rmSync(path.join(__dirname, "out", d), { recursive: true, force: true });
fs.rmSync(path.join(__dirname, "out", "_rt.glb"), { force: true });
fs.rmSync(dst, { force: true });
