import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Vector3, Quaternion } from "@babylonjs/core/Maths/math.vector.js";

import { FBXFileLoader } from "../src/fbxFileLoader.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const alfaRomeoPath = resolve(__dirname, "models/alfa-romeo-stradale-1967/finish91.fbx");
const aishaPath = resolve(__dirname, "models/anime-chibi-girl-aisha-by-seraphim/test2.fbx");

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

    it("preserves inherited FBX geometry-branch transforms for skinned meshes", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const file = readFileSync(aishaPath);
        const buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
        const rootUrl = `${pathToFileURL(dirname(aishaPath)).href}/`;

        await new FBXFileLoader().importMeshAsync(null, scene, buffer, rootUrl);

        const body = scene.meshes.find((mesh) => mesh.name === "mainAisha:body");
        expect(body).toBeDefined();
        expect(body!.parent?.name).toBe("__fbx_root__");

        const worldScale = new Vector3();
        const worldRotation = new Quaternion();
        const worldTranslation = new Vector3();
        body!.computeWorldMatrix(true).decompose(worldScale, worldRotation, worldTranslation);
        expect(Math.abs(worldScale.x)).toBeCloseTo(0.0922878854, 6);
        expect(Math.abs(worldScale.y)).toBeCloseTo(0.0922878854, 6);
        expect(Math.abs(worldScale.z)).toBeCloseTo(0.0922878854, 6);

        const poseScale = new Vector3();
        const poseRotation = new Quaternion();
        const poseTranslation = new Vector3();
        body!.getPoseMatrix().decompose(poseScale, poseRotation, poseTranslation);
        expect(poseScale.x).toBeCloseTo(1 / 0.0922878854, 5);
        expect(poseScale.y).toBeCloseTo(1 / 0.0922878854, 5);
        expect(poseScale.z).toBeCloseTo(1 / 0.0922878854, 5);

        scene.dispose();
        engine.dispose();
    });

    it("does not apply the handedness conversion root in right-handed scenes", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        scene.useRightHandedSystem = true;
        const file = readFileSync(aishaPath);
        const buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
        const rootUrl = `${pathToFileURL(dirname(aishaPath)).href}/`;

        await new FBXFileLoader().importMeshAsync(null, scene, buffer, rootUrl);

        const root = scene.transformNodes.find((node) => node.name === "__fbx_root__");
        expect(root).toBeDefined();
        expect(root!.rotation.y).toBeCloseTo(0, 6);
        expect(root!.scaling.z).toBeCloseTo(1, 6);

        const body = scene.meshes.find((mesh) => mesh.name === "mainAisha:body");
        expect(body).toBeDefined();
        expect(body!.parent).toBe(root);

        const worldScale = new Vector3();
        const worldRotation = new Quaternion();
        const worldTranslation = new Vector3();
        body!.computeWorldMatrix(true).decompose(worldScale, worldRotation, worldTranslation);
        expect(worldScale.x).toBeCloseTo(0.0922878854, 6);
        expect(worldScale.y).toBeCloseTo(0.0922878854, 6);
        expect(worldScale.z).toBeCloseTo(0.0922878854, 6);

        scene.dispose();
        engine.dispose();
    });
});
