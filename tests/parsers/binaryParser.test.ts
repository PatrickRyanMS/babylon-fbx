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
});
