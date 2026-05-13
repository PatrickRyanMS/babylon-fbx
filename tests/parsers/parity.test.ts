import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { parseBinaryFBX } from "../../src/parsers/fbxBinaryParser.js";
import { parseAsciiFBX } from "../../src/parsers/fbxAsciiParser.js";
import { interpretFBX } from "../../src/interpreter/fbxInterpreter.js";
import { findDocumentNode } from "../../src/types/fbxTypes.js";

const BINARY_PATH = resolve(__dirname, "../models/valkyrie/valkyrie_asset.fbx");
const ASCII_PATH = resolve(__dirname, "../models/valkyrie/valkyrie_asset_ascii.fbx");

describe("ASCII vs Binary parity", () => {
    const binDoc = parseBinaryFBX(readFileSync(BINARY_PATH).buffer);
    const asciiDoc = parseAsciiFBX(readFileSync(ASCII_PATH, "utf-8"));

    it("should produce the same important top-level node names", () => {
        const important = ["FBXHeaderExtension", "GlobalSettings", "Documents", "Definitions", "Objects", "Connections"];
        const binNames = binDoc.nodes.map((n) => n.name).filter((n) => important.includes(n));
        const asciiNames = asciiDoc.nodes.map((n) => n.name).filter((n) => important.includes(n));
        expect(asciiNames).toEqual(binNames);
    });

    it("should have the same number of objects", () => {
        const binObjects = findDocumentNode(binDoc, "Objects")!;
        const asciiObjects = findDocumentNode(asciiDoc, "Objects")!;
        expect(asciiObjects.children.length).toBe(binObjects.children.length);
    });

    it("should have the same number of connections", () => {
        const binConns = findDocumentNode(binDoc, "Connections")!;
        const asciiConns = findDocumentNode(asciiDoc, "Connections")!;
        expect(asciiConns.children.length).toBe(binConns.children.length);
    });

    it("should interpret to the same number of geometries", () => {
        const binScene = interpretFBX(binDoc);
        const asciiScene = interpretFBX(asciiDoc);
        expect(asciiScene.geometries.length).toBe(binScene.geometries.length);
    });

    it("should interpret to the same number of materials", () => {
        const binScene = interpretFBX(binDoc);
        const asciiScene = interpretFBX(asciiDoc);
        expect(asciiScene.materials.length).toBe(binScene.materials.length);
    });

    it("should produce matching vertex counts for first geometry", () => {
        const binScene = interpretFBX(binDoc);
        const asciiScene = interpretFBX(asciiDoc);
        expect(asciiScene.geometries[0].positions.length).toBe(
            binScene.geometries[0].positions.length
        );
        expect(asciiScene.geometries[0].indices.length).toBe(
            binScene.geometries[0].indices.length
        );
    });
});
