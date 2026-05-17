import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { parseBinaryFBX } from "../../src/parsers/fbxBinaryParser.js";
import { resolveConnections } from "../../src/interpreter/connections.js";
import type { FBXDocument, FBXNode } from "../../src/types/fbxTypes.js";

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

    it("records additive object and connection entries", () => {
        expect(objectMap.objectEntries.length).toBe(objectMap.objects.size);
        expect(objectMap.connectionEntries.length).toBeGreaterThanOrEqual(objectMap.connections.length);
        expect(objectMap.connectionEntries.some((entry) => entry.accepted && entry.rawType === "OO")).toBe(true);
    });

    it("diagnoses unsupported or unresolved connections without adding them to the graph", () => {
        const map = resolveConnections({
            version: 7500,
            nodes: [
                {
                    name: "Objects",
                    properties: [],
                    children: [
                        createObject("Model", 1n, "Root", "Null"),
                    ],
                },
                {
                    name: "Connections",
                    properties: [],
                    children: [
                        createConnection("XX", 1n, 0n),
                        createConnection("OO", "MissingLegacy", "Scene", "Connect"),
                    ],
                },
            ],
        });

        expect(map.connections).toHaveLength(0);
        expect(map.connectionEntries).toHaveLength(2);
        expect(map.diagnostics.map((diagnostic) => diagnostic.reason)).toEqual([
            "unsupported-connection-type",
            "unresolved-legacy-endpoint",
        ]);
    });

    it("keeps legacy synthetic mesh geometry IDs separate from object names", () => {
        const map = resolveConnections({
            version: 6100,
            nodes: [
                {
                    name: "Objects",
                    properties: [],
                    children: [
                        createLegacyObject("Model", "MeshA", "Mesh"),
                        createLegacyObject("Model", "MeshA\0Geometry", "Null"),
                    ],
                },
                {
                    name: "Connections",
                    properties: [],
                    children: [
                        createConnection("OO", "MeshA", "Scene", "Connect"),
                    ],
                },
            ],
        });

        const syntheticGeometryEntries = map.objectEntries.filter((entry) => entry.source === "legacySyntheticGeometry");
        expect(syntheticGeometryEntries).toHaveLength(1);
        expect(syntheticGeometryEntries[0].id).not.toBe(map.objectEntries.find((entry) => entry.legacyName === "MeshA")?.id);
        expect(map.childrenOf.get(syntheticGeometryEntries[0].id)).toBeUndefined();
    });

    it("diagnoses duplicate parents while preserving existing last-parent behavior", () => {
        const map = resolveConnections({
            version: 7500,
            nodes: [
                {
                    name: "Objects",
                    properties: [],
                    children: [
                        createObject("Model", 1n, "Child", "Null"),
                        createObject("Model", 2n, "ParentA", "Null"),
                        createObject("Model", 3n, "ParentB", "Null"),
                    ],
                },
                {
                    name: "Connections",
                    properties: [],
                    children: [
                        createConnection("OO", 1n, 2n),
                        createConnection("OO", 1n, 3n),
                    ],
                },
            ],
        });

        expect(map.parentOf.get(1n)?.id).toBe(3n);
        expect(map.diagnostics.some((diagnostic) => diagnostic.reason === "duplicate-parent")).toBe(true);
    });
});

function createObject(name: string, id: bigint, objectName: string, subType: string): FBXNode {
    return {
        name,
        properties: [
            { type: "int64", value: id },
            { type: "string", value: objectName },
            { type: "string", value: subType },
        ],
        children: [],
    };
}

function createLegacyObject(name: string, objectName: string, subType: string): FBXNode {
    return {
        name,
        properties: [
            { type: "string", value: objectName },
            { type: "string", value: subType },
        ],
        children: [],
    };
}

function createConnection(type: string, child: bigint | string, parent: bigint | string, nodeName = "C"): FBXNode {
    return {
        name: nodeName,
        properties: [
            { type: "string", value: type },
            typeof child === "bigint" ? { type: "int64", value: child } : { type: "string", value: child },
            typeof parent === "bigint" ? { type: "int64", value: parent } : { type: "string", value: parent },
        ],
        children: [],
    };
}
