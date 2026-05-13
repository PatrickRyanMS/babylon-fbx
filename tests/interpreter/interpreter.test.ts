import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { parseBinaryFBX } from "../../src/parsers/fbxBinaryParser.js";
import { interpretFBX } from "../../src/interpreter/fbxInterpreter.js";

const FIXTURE_PATH = resolve(__dirname, "../models/valkyrie/valkyrie_asset.fbx");

describe("interpretFBX (binary)", () => {
    const buffer = readFileSync(FIXTURE_PATH).buffer;
    const doc = parseBinaryFBX(buffer);
    const scene = interpretFBX(doc);

    it("should extract global settings", () => {
        expect(scene.upAxis).toBe(1);
        expect(scene.unitScaleFactor).toBe(1);
    });

    it("should extract geometries", () => {
        expect(scene.geometries.length).toBe(9);
    });

    it("should extract materials", () => {
        expect(scene.materials.length).toBe(1);
        expect(scene.materials[0].name).toBeTruthy();
    });

    it("should build model hierarchy with root models", () => {
        expect(scene.rootModels.length).toBeGreaterThan(0);
    });

    it("should have the main mesh model with geometry", () => {
        const meshModels = findMeshModels(scene.rootModels);
        expect(meshModels.length).toBeGreaterThan(0);
        // The main valkyrie mesh should have geometry attached
        const valk = meshModels.find((m) => m.name.includes("valkyrie"));
        expect(valk).toBeDefined();
        expect(valk!.geometry).toBeDefined();
    });

    it("should extract valid geometry data", () => {
        const firstGeom = scene.geometries[0];
        expect(firstGeom.positions.length).toBeGreaterThan(0);
        expect(firstGeom.positions.length % 3).toBe(0);
        expect(firstGeom.indices.length).toBeGreaterThan(0);
        expect(firstGeom.indices.length % 3).toBe(0);
    });

    it("should extract normals", () => {
        const firstGeom = scene.geometries[0];
        expect(firstGeom.normals).not.toBeNull();
        expect(firstGeom.normals!.length).toBeGreaterThan(0);
    });

    it("should extract UVs", () => {
        const firstGeom = scene.geometries[0];
        expect(firstGeom.uvs).not.toBeNull();
        expect(firstGeom.uvs!.length).toBeGreaterThan(0);
    });

    it("should extract material properties", () => {
        const mat = scene.materials[0];
        expect(mat.type).toBe("Lambert");
        expect(mat.properties.diffuseColor).toBeDefined();
    });

    it("should extract texture references", () => {
        const mat = scene.materials[0];
        expect(mat.textures.length).toBeGreaterThan(0);
        const diffuseTex = mat.textures.find((t) => t.propertyName === "DiffuseColor");
        expect(diffuseTex).toBeDefined();
        expect(diffuseTex!.relativeFileName).toContain("valkyrie_low_baseColor");
    });

    it("should assign materials to models", () => {
        const meshModels = findMeshModels(scene.rootModels);
        const modelWithMat = meshModels.find((m) => m.materials.length > 0);
        expect(modelWithMat).toBeDefined();
    });
});

function findMeshModels(models: any[]): any[] {
    const result: any[] = [];
    for (const m of models) {
        if (m.subType === "Mesh") {
            result.push(m);
        }
        if (m.children) {
            result.push(...findMeshModels(m.children));
        }
    }
    return result;
}

// Test embedded textures using Spider model (which has embedded texture data)
const SPIDER_PATH = resolve(__dirname, "../models/spider-animated-character/source/Spider_sketchfab.fbx");

describe("embedded textures", () => {
    const buffer = readFileSync(SPIDER_PATH).buffer;
    const doc = parseBinaryFBX(buffer);
    const scene = interpretFBX(doc);

    it("should extract embedded texture data from Video nodes", () => {
        // Spider has 2 materials (Spider_M and Camera_lambert2) with embedded textures
        const allTextures = scene.materials.flatMap(m => m.textures);
        const withEmbedded = allTextures.filter(t => t.embeddedData !== null);
        expect(withEmbedded.length).toBeGreaterThan(0);
    });

    it("should have non-trivial embedded data size", () => {
        const allTextures = scene.materials.flatMap(m => m.textures);
        const withEmbedded = allTextures.filter(t => t.embeddedData !== null);
        // Spider textures are ~700KB and ~3.6MB
        for (const tex of withEmbedded) {
            expect(tex.embeddedData!.length).toBeGreaterThan(10000);
        }
    });

    it("should still have file path information alongside embedded data", () => {
        const allTextures = scene.materials.flatMap(m => m.textures);
        const withEmbedded = allTextures.filter(t => t.embeddedData !== null);
        for (const tex of withEmbedded) {
            expect(tex.relativeFileName || tex.fileName).toBeTruthy();
        }
    });
});
