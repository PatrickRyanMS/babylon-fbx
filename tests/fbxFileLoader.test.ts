import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";

import { FBXFileLoader } from "../src/fbxFileLoader.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const alfaRomeoPath = resolve(__dirname, "models/alfa-romeo-stradale-1967/finish91.fbx");

describe("FBXFileLoader", () => {
    it("uses the FBX texture UVSet property to select secondary UV coordinates", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const file = readFileSync(alfaRomeoPath);
        const buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
        const rootUrl = `${pathToFileURL(dirname(alfaRomeoPath)).href}/`;

        await new FBXFileLoader().importMeshAsync(null, scene, buffer, rootUrl);

        const alphaMaterial = scene.materials.find((material) => material.name === "forMayaAO:Alpha");
        expect(alphaMaterial).toBeInstanceOf(StandardMaterial);
        expect((alphaMaterial as StandardMaterial).diffuseTexture?.coordinatesIndex).toBe(1);

        const speedometerMaterial = scene.materials.find((material) => material.name === "forMayaAO:blinn7");
        expect(speedometerMaterial).toBeInstanceOf(StandardMaterial);
        expect((speedometerMaterial as StandardMaterial).diffuseTexture?.coordinatesIndex).toBe(0);

        const meshWithSecondUVSet = scene.meshes.find((mesh) => mesh.isVerticesDataPresent("uv2"));
        expect(meshWithSecondUVSet).toBeDefined();

        scene.dispose();
        engine.dispose();
    });
});
