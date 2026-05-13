import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { parseBinaryFBX } from "../../src/parsers/fbxBinaryParser.js";
import { resolveConnections } from "../../src/interpreter/connections.js";
import { findDocumentNode } from "../../src/types/fbxTypes.js";

const FIXTURE_PATH = resolve(__dirname, "../models/valkyrie/valkyrie_asset.fbx");

describe("resolveConnections", () => {
    const buffer = readFileSync(FIXTURE_PATH).buffer;
    const doc = parseBinaryFBX(buffer);
    const objectMap = resolveConnections(doc);

    it("should build the object map with all objects", () => {
        expect(objectMap.objects.size).toBeGreaterThan(0);
    });

    it("should have connections", () => {
        expect(objectMap.connections.length).toBeGreaterThan(0);
    });

    it("should include OO and OP connection types", () => {
        const types = new Set(objectMap.connections.map((c) => c.type));
        expect(types.has("OO")).toBe(true);
        expect(types.has("OP")).toBe(true);
    });

    it("should have children of the root (ID 0)", () => {
        const rootChildren = objectMap.childrenOf.get(0n) ?? [];
        expect(rootChildren.length).toBeGreaterThan(0);
    });

    it("should map OP connections with property names", () => {
        const opConnections = objectMap.connections.filter((c) => c.type === "OP");
        expect(opConnections.length).toBeGreaterThan(0);
        // At least one should have DiffuseColor (our texture connection)
        const diffuse = opConnections.find((c) => c.propertyName === "DiffuseColor");
        expect(diffuse).toBeDefined();
    });
});
