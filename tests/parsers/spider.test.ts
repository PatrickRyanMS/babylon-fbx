import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { parseBinaryFBX } from "../../src/parsers/fbxBinaryParser.js";
import { interpretFBX } from "../../src/interpreter/fbxInterpreter.js";
import { findDocumentNode } from "../../src/types/fbxTypes.js";

const SPIDER_PATH = resolve(
    __dirname,
    "../models/spider-animated-character/source/Spider_sketchfab.fbx"
);

describe("Spider model (FBX v7.4, 32-bit offsets)", () => {
    const buffer = readFileSync(SPIDER_PATH).buffer;
    const doc = parseBinaryFBX(buffer);

    it("should parse as version 7400", () => {
        expect(doc.version).toBe(7400);
    });

    it("should have expected top-level nodes", () => {
        const names = doc.nodes.map((n) => n.name);
        expect(names).toContain("Objects");
        expect(names).toContain("Connections");
    });

    it("should have geometry nodes", () => {
        const objects = findDocumentNode(doc, "Objects")!;
        const geometries = objects.children.filter((c) => c.name === "Geometry");
        expect(geometries.length).toBeGreaterThan(0);
    });

    it("should interpret without errors", () => {
        const scene = interpretFBX(doc);
        expect(scene.geometries.length).toBeGreaterThan(0);
        expect(scene.rootModels.length).toBeGreaterThan(0);
    });

    it("should extract valid geometry", () => {
        const scene = interpretFBX(doc);
        const geom = scene.geometries[0];
        expect(geom.positions.length).toBeGreaterThan(0);
        expect(geom.positions.length % 3).toBe(0);
        expect(geom.indices.length % 3).toBe(0);
    });
});
