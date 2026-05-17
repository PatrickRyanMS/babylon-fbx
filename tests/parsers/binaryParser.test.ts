import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { parseBinaryFBX } from "../../src/parsers/fbxBinaryParser.js";
import { findDocumentNode } from "../../src/types/fbxTypes.js";

const FIXTURE_PATH = resolve(__dirname, "../models/valkyrie/valkyrie_asset.fbx");

describe("parseBinaryFBX", () => {
    const buffer = readFileSync(FIXTURE_PATH).buffer;
    const doc = parseBinaryFBX(buffer);

    it("should parse the version as 7700", () => {
        expect(doc.version).toBe(7700);
    });

    it("should have expected top-level nodes", () => {
        const topLevelNames = doc.nodes.map((n) => n.name);
        expect(topLevelNames).toContain("FBXHeaderExtension");
        expect(topLevelNames).toContain("GlobalSettings");
        expect(topLevelNames).toContain("Documents");
        expect(topLevelNames).toContain("Definitions");
        expect(topLevelNames).toContain("Objects");
        expect(topLevelNames).toContain("Connections");
    });

    it("should parse FBXHeaderExtension with version info", () => {
        const header = findDocumentNode(doc, "FBXHeaderExtension");
        expect(header).toBeDefined();
        const fbxVersion = header!.children.find((c) => c.name === "FBXVersion");
        expect(fbxVersion).toBeDefined();
        expect(fbxVersion!.properties[0].value).toBe(7700);
    });

    it("should have Objects with Geometry nodes", () => {
        const objects = findDocumentNode(doc, "Objects");
        expect(objects).toBeDefined();
        const geometries = objects!.children.filter((c) => c.name === "Geometry");
        expect(geometries.length).toBeGreaterThan(0);
    });

    it("should have Connections", () => {
        const connections = findDocumentNode(doc, "Connections");
        expect(connections).toBeDefined();
        expect(connections!.children.length).toBeGreaterThan(0);
        // All connection children should be named "C"
        for (const c of connections!.children) {
            expect(c.name).toBe("C");
        }
    });

    it("should parse Geometry vertices as float64 array", () => {
        const objects = findDocumentNode(doc, "Objects");
        const geometry = objects!.children.find((c) => c.name === "Geometry");
        expect(geometry).toBeDefined();
        const vertices = geometry!.children.find((c) => c.name === "Vertices");
        expect(vertices).toBeDefined();
        expect(vertices!.properties[0].type).toBe("float64[]");
        const vertexData = vertices!.properties[0].value as Float64Array;
        expect(vertexData.length).toBeGreaterThan(0);
        // Vertex count should be divisible by 3 (x,y,z triples)
        expect(vertexData.length % 3).toBe(0);
    });

    it("should parse PolygonVertexIndex as int32 array", () => {
        const objects = findDocumentNode(doc, "Objects");
        const geometry = objects!.children.find((c) => c.name === "Geometry");
        const pvi = geometry!.children.find((c) => c.name === "PolygonVertexIndex");
        expect(pvi).toBeDefined();
        expect(pvi!.properties[0].type).toBe("int32[]");
        const indices = pvi!.properties[0].value as Int32Array;
        expect(indices.length).toBeGreaterThan(0);
        // Should contain at least one negative index (polygon boundary marker)
        const hasNegative = Array.from(indices).some((v) => v < 0);
        expect(hasNegative).toBe(true);
    });

    it("parses raw boolean arrays as one byte per element", () => {
        const doc = parseBinaryFBX(createSingleRawBooleanArrayNode([1, 0, 1]));
        const node = doc.nodes[0];

        expect(node.name).toBe("BoolArray");
        expect(node.properties[0].type).toBe("boolean[]");
        expect(node.properties[0].value).toEqual(new Uint8Array([1, 0, 1]));
    });

    it("rejects raw arrays whose byte length does not match the element count", () => {
        expect(() => parseBinaryFBX(createSingleRawBooleanArrayNode([1, 0, 1, 1], 3))).toThrow(
            "Invalid FBX array byte length for boolean[]"
        );
    });

    it("rejects nodes whose declared property-list length is inconsistent", () => {
        expect(() => parseBinaryFBX(createSingleRawBooleanArrayNode([1, 0, 1], 3, -1))).toThrow(
            /Invalid FBX property list length/
        );
    });
});

function createSingleRawBooleanArrayNode(
    rawValues: number[],
    arrayLength = rawValues.length,
    propertyListLengthAdjustment = 0
): ArrayBuffer {
    const header = new Uint8Array(27);
    writeAscii(header, 0, "Kaydara FBX Binary  \0");
    header[21] = 0x1a;
    header[22] = 0x00;
    new DataView(header.buffer).setUint32(23, 7400, true);

    const name = "BoolArray";
    const nameBytes = asciiBytes(name);
    const propertyByteLength = 1 + 12 + rawValues.length;
    const nodeByteLength = 13 + nameBytes.length + propertyByteLength;
    const endOffset = header.byteLength + nodeByteLength;
    const bytes = new Uint8Array(endOffset + 13);
    bytes.set(header, 0);
    const view = new DataView(bytes.buffer);

    let offset = header.byteLength;
    view.setUint32(offset, endOffset, true);
    view.setUint32(offset + 4, 1, true);
    view.setUint32(offset + 8, propertyByteLength + propertyListLengthAdjustment, true);
    bytes[offset + 12] = nameBytes.length;
    offset += 13;
    bytes.set(nameBytes, offset);
    offset += nameBytes.length;

    bytes[offset++] = "b".charCodeAt(0);
    view.setUint32(offset, arrayLength, true);
    view.setUint32(offset + 4, 0, true);
    view.setUint32(offset + 8, rawValues.length, true);
    offset += 12;
    bytes.set(rawValues, offset);

    return bytes.buffer;
}

function asciiBytes(value: string): Uint8Array {
    const bytes = new Uint8Array(value.length);
    writeAscii(bytes, 0, value);
    return bytes;
}

function writeAscii(bytes: Uint8Array, offset: number, value: string): void {
    for (let i = 0; i < value.length; i++) {
        bytes[offset + i] = value.charCodeAt(i);
    }
}
