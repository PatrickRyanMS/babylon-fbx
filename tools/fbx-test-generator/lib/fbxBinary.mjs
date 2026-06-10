// Binary FBX writer. Produces buffers compatible with the repo's fbxBinaryParser.
import zlib from "node:zlib";
import { n, R, S } from "./fbxNode.mjs";

const MAGIC = Buffer.from("Kaydara FBX Binary  \0", "binary"); // 21 bytes
// FBX binary footer part1 is derived from FileId + CreationTime. Rather than reimplement that
// derivation, we always emit one known-consistent triple captured from a real Autodesk export
// (simpleCube.fbx): the preamble writes this exact FileId + CreationTime, and the footer writes
// the matching part1, so the SDK's integrity check passes for any content.
const FILE_ID = Buffer.from("2ab821e7ba2fc7c1bacab122a420f6fb", "hex");
const CREATION_TIME = "2026-06-09 17:10:29:674";
const FOOTER_PART1 = Buffer.from("fabca902d9cfd16abf79f08e16f22170", "hex");
const FOOTER_PART2 = Buffer.from([0xf8, 0x5a, 0x8c, 0x6a, 0xde, 0xf5, 0xd9, 0x7e, 0xec, 0xe9, 0x0c, 0xe3, 0x75, 0x8f, 0x29, 0x0b]);

function encodeArray(typed, elementSize, compress) {
    const raw = Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength);
    const arrayLength = typed.length;
    let encoding = 0;
    let data = raw;
    if (compress) {
        data = zlib.deflateSync(raw); // zlib stream (header + deflate + adler32)
        encoding = 1;
    }
    const header = Buffer.alloc(12);
    header.writeUInt32LE(arrayLength, 0);
    header.writeUInt32LE(encoding, 4);
    header.writeUInt32LE(data.length, 8);
    return Buffer.concat([header, data]);
}

function encodeProperty(prop) {
    const { tag, value } = prop;
    switch (tag) {
        case "C": {
            const b = Buffer.alloc(2);
            b[0] = 0x43; // 'C'
            b[1] = typeof value === "number" ? value & 0xff : value ? 1 : 0;
            return b;
        }
        case "I": {
            const b = Buffer.alloc(5);
            b[0] = 0x49;
            b.writeInt32LE(value | 0, 1);
            return b;
        }
        case "L": {
            const b = Buffer.alloc(9);
            b[0] = 0x4c;
            b.writeBigInt64LE(BigInt(value), 1);
            return b;
        }
        case "F": {
            const b = Buffer.alloc(5);
            b[0] = 0x46;
            b.writeFloatLE(value, 1);
            return b;
        }
        case "D": {
            const b = Buffer.alloc(9);
            b[0] = 0x44;
            b.writeDoubleLE(value, 1);
            return b;
        }
        case "S": {
            // Binary FBX encodes object identifiers as "Name\x00\x01Class" (not ASCII "Class::Name").
            let s = value;
            const sep = s.indexOf("::");
            if (sep >= 0) {
                s = s.slice(sep + 2) + "\u0000\u0001" + s.slice(0, sep);
            }
            const str = Buffer.from(s, "utf8");
            const b = Buffer.alloc(5 + str.length);
            b[0] = 0x53;
            b.writeUInt32LE(str.length, 1);
            str.copy(b, 5);
            return b;
        }
        case "R": {
            const bytes = Buffer.from(value);
            const b = Buffer.alloc(5 + bytes.length);
            b[0] = 0x52;
            b.writeUInt32LE(bytes.length, 1);
            bytes.copy(b, 5);
            return b;
        }
        case "d":
            return Buffer.concat([Buffer.from("d"), encodeArray(value, 8, prop.compress)]);
        case "f":
            return Buffer.concat([Buffer.from("f"), encodeArray(value, 4, prop.compress)]);
        case "i":
            return Buffer.concat([Buffer.from("i"), encodeArray(value, 4, prop.compress)]);
        case "l":
            return Buffer.concat([Buffer.from("l"), encodeArray(value, 8, prop.compress)]);
        default:
            throw new Error(`Unknown property tag '${tag}'`);
    }
}

function serializeNode(node, startOffset, is64Bit) {
    const headerSize = is64Bit ? 25 : 13;
    const nameBuf = Buffer.from(node.name, "ascii");
    const propsBuf = Buffer.concat((node.properties || []).map(encodeProperty));

    const childStart = startOffset + headerSize + nameBuf.length + propsBuf.length;
    let childrenBuf = Buffer.alloc(0);
    // FBX binary: a node is followed by a null-record terminator (an empty nested-node list) iff
    // it has children, has zero properties (empty containers like References/Properties70), OR is
    // an FBX object header [int64 id, string name, string class] (e.g. a childless AnimationLayer).
    // The Autodesk SDK reader desyncs on both missing AND extra terminators, so this must be exact.
    const p = node.properties || [];
    const isObjectHeader = p.length >= 3 && p[0].tag === "L" && p[1].tag === "S" && p[2].tag === "S";
    const hasNestedList = (node.children && node.children.length > 0) || p.length === 0 || isObjectHeader;
    if (hasNestedList) {
        let cursor = childStart;
        const parts = [];
        for (const child of node.children || []) {
            const b = serializeNode(child, cursor, is64Bit);
            parts.push(b);
            cursor += b.length;
        }
        parts.push(Buffer.alloc(headerSize)); // null record terminating the nested list
        childrenBuf = Buffer.concat(parts);
    }

    const endOffset = childStart + childrenBuf.length;

    const header = Buffer.alloc(headerSize);
    if (is64Bit) {
        header.writeBigUInt64LE(BigInt(endOffset), 0);
        header.writeBigUInt64LE(BigInt((node.properties || []).length), 8);
        header.writeBigUInt64LE(BigInt(propsBuf.length), 16);
        header[24] = nameBuf.length;
    } else {
        header.writeUInt32LE(endOffset, 0);
        header.writeUInt32LE((node.properties || []).length, 4);
        header.writeUInt32LE(propsBuf.length, 8);
        header[12] = nameBuf.length;
    }

    return Buffer.concat([header, nameBuf, propsBuf, childrenBuf]);
}

/**
 * Serialize an array of top-level FBX nodes to a binary FBX Buffer.
 * @param {object[]} nodes top-level node tree
 * @param {number} version FBX version (e.g. 7400, 7500, 6100)
 */
export function writeBinaryFBX(topNodes, version = 7400, options = {}) {
    const is64Bit = version >= 7500;

    // Binary FBX requires top-level FileId/CreationTime/Creator after FBXHeaderExtension
    // for the Autodesk FBX SDK (and Maya) to validate and import the scene.
    const fileId = R(FILE_ID);
    const preamble = [
        n("FileId", [fileId]),
        n("CreationTime", [S(CREATION_TIME)]),
        n("Creator", [S("Babylon FBX visual-test generator")]),
    ];
    const nodes =
        options.noPreamble
            ? topNodes
            : topNodes.length > 0 && topNodes[0].name === "FBXHeaderExtension"
              ? [topNodes[0], ...preamble, ...topNodes.slice(1)]
              : [...preamble, ...topNodes];

    const head = Buffer.alloc(27);
    MAGIC.copy(head, 0);
    head[21] = 0x1a;
    head[22] = 0x00;
    head.writeUInt32LE(version, 23);

    const headerSize = is64Bit ? 25 : 13;
    let cursor = 27;
    const parts = [head];
    for (const node of nodes) {
        const b = serializeNode(node, cursor, is64Bit);
        parts.push(b);
        cursor += b.length;
    }
    parts.push(Buffer.alloc(headerSize)); // top-level null record

    if (options.noFooter) {
        return Buffer.concat(parts);
    }

    // FBX binary footer: part1 + zero-pad to 16-byte alignment + 4 zeros + version + 120 zeros + part2.
    let bodyLen = parts.reduce((a, b) => a + b.length, 0);
    parts.push(FOOTER_PART1);
    bodyLen += FOOTER_PART1.length;
    const pad = (16 - (bodyLen % 16)) % 16;
    const tail = Buffer.alloc(pad + 4 + 4 + 120);
    tail.writeUInt32LE(version, pad + 4);
    parts.push(tail);
    parts.push(FOOTER_PART2);

    return Buffer.concat(parts);
}
