import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { Vector3, Quaternion } from "@babylonjs/core/Maths/math.vector.js";

import { FBXFileLoader } from "../src/fbxFileLoader.js";
import type { FBXGeometryData } from "../src/interpreter/geometry.js";
import type { FBXModelData } from "../src/interpreter/fbxInterpreter.js";
import type { FBXSkinData } from "../src/interpreter/skeleton.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const alfaRomeoPath = resolve(__dirname, "models/alfa-romeo-stradale-1967/finish91.fbx");
const aishaPath = resolve(__dirname, "models/anime-chibi-girl-aisha-by-seraphim/test2.fbx");
const tamagotchiPath = resolve(__dirname, "models/tamagotchi-pet-sailor-moon/lp_01.fbx");

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

    it("builds Babylon extra skinning buffers for meshes with more than four influences", () => {
        const loader = new FBXFileLoader() as unknown as {
            _buildSkinningData: (
                geomData: FBXGeometryData,
                skin: FBXSkinData
            ) => {
                matricesIndices: Float32Array;
                matricesWeights: Float32Array;
                matricesIndicesExtra: Float32Array | null;
                matricesWeightsExtra: Float32Array | null;
                numBoneInfluencers: number;
            };
        };
        const geomData = {
            id: 1n,
            name: "SyntheticGeometry",
            positions: new Float64Array([0, 0, 0, 1, 0, 0]),
            indices: new Uint32Array([0, 1, 1]),
            normals: null,
            uvs: null,
            uvSets: [],
            colors: null,
            controlPointIndices: new Uint32Array([0, 1]),
            materialIndices: null,
        } satisfies FBXGeometryData;
        const skin = {
            id: 2n,
            geometryId: 1n,
            bones: [],
            boneIndices: [
                [0, 1, 2, 3, 4, 5, 6],
                [0, 1, 2, 3],
            ],
            boneWeights: [
                [0.28, 0.22, 0.18, 0.12, 0.09, 0.07, 0.04],
                [0.4, 0.3, 0.2, 0.1],
            ],
        } satisfies FBXSkinData;

        const result = loader._buildSkinningData(geomData, skin);

        expect(result.numBoneInfluencers).toBe(7);
        expect(result.matricesIndices.slice(0, 4)).toEqual(new Float32Array([0, 1, 2, 3]));
        expect(result.matricesWeights.slice(0, 4)).toEqual(new Float32Array([0.28, 0.22, 0.18, 0.12]));
        expect(result.matricesIndicesExtra).not.toBeNull();
        expect(result.matricesWeightsExtra).not.toBeNull();
        expect(result.matricesIndicesExtra!.slice(0, 4)).toEqual(new Float32Array([4, 5, 6, 0]));
        expect(result.matricesWeightsExtra!.slice(0, 4)).toEqual(new Float32Array([0.09, 0.07, 0.04, 0]));
        expect(VertexBuffer.MatricesIndicesExtraKind).toBe("matricesIndicesExtra");
    });

    it("builds same-basename texture fallbacks when FBX texture extensions do not match disk files", () => {
        const fallbackUrls = (FBXFileLoader as unknown as {
            _buildTextureFallbackUrls: (texturePath: string) => string[];
        })._buildTextureFallbackUrls("file:///models/vino/Sticker_D.png");

        expect(fallbackUrls[0]).toBe("file:///models/vino/Sticker_D.jpg");
        expect(fallbackUrls).toContain("file:///models/vino/Sticker_D.jpeg");
        expect(fallbackUrls).not.toContain("file:///models/vino/Sticker_D.png");
    });

    it("bakes geometric transforms with translation after rotation and scale", () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const loader = new FBXFileLoader() as unknown as {
            _createMesh: (model: FBXModelData, geomData: FBXGeometryData, scene: Scene) => Mesh;
        };
        const geomData = {
            id: 1n,
            name: "SyntheticGeometry",
            positions: new Float64Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
            indices: new Uint32Array([0, 1, 2]),
            normals: new Float64Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
            uvs: null,
            uvSets: [],
            colors: null,
            controlPointIndices: new Uint32Array([0, 1, 2]),
            materialIndices: null,
        } satisfies FBXGeometryData;
        const model = createModel({
            geometry: geomData,
            geometricTranslation: [10, 0, 0],
            geometricRotation: [0, 0, 90],
            geometricScaling: [2, 1, 1],
        });

        const mesh = loader._createMesh(model, geomData, scene);
        const positions = mesh.getVerticesData("position");

        expect(positions).not.toBeNull();
        expect(positions![0]).toBeCloseTo(10, 6);
        expect(positions![1]).toBeCloseTo(0, 6);
        expect(positions![2]).toBeCloseTo(0, 6);
        expect(positions![3]).toBeCloseTo(10, 6);
        expect(Math.abs(positions![4])).toBeCloseTo(2, 6);
        expect(positions![5]).toBeCloseTo(0, 6);

        scene.dispose();
        engine.dispose();
    });

    it("loads FBX 6 static meshes with string-based legacy connections", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const file = readFileSync(tamagotchiPath);
        const buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
        const rootUrl = `${pathToFileURL(dirname(tamagotchiPath)).href}/`;

        await new FBXFileLoader().importMeshAsync(null, scene, buffer, rootUrl);

        const importedMeshes = scene.meshes.filter((mesh) => mesh.name !== "__root__");
        expect(importedMeshes.length).toBe(36);
        expect(importedMeshes.every((mesh) => mesh.getTotalVertices() > 0)).toBe(true);
        expect(scene.materials.some((material) => material.name === "Material_01")).toBe(true);
        expectMeshCenter(scene, "Element_01_low003", [8.807619, 76.422528, 8.056388]);
        expectMeshCenter(scene, "Sphere_03_low003", [5.008725, 74.650731, 4.229053]);
        expectMeshCenter(scene, "Sphere_06_low003", [13.314888, 77.517435, 11.391784]);

        scene.dispose();
        engine.dispose();
    });
});

function createModel(overrides: Partial<FBXModelData>): FBXModelData {
    return {
        id: 1n,
        name: "SyntheticModel",
        subType: "Mesh",
        materials: [],
        children: [],
        translation: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        preRotation: [0, 0, 0],
        postRotation: [0, 0, 0],
        rotationPivot: [0, 0, 0],
        scalingPivot: [0, 0, 0],
        rotationOffset: [0, 0, 0],
        scalingOffset: [0, 0, 0],
        geometricTranslation: [0, 0, 0],
        geometricRotation: [0, 0, 0],
        geometricScaling: [1, 1, 1],
        rotationOrder: 0,
        inheritType: 1,
        cullingOff: false,
        ...overrides,
    };
}

function expectMeshCenter(scene: Scene, name: string, expected: [number, number, number]): void {
    const mesh = scene.meshes.find((candidate) => candidate.name === name);
    expect(mesh).toBeDefined();
    mesh!.computeWorldMatrix(true);
    const center = mesh!.getBoundingInfo().boundingBox.centerWorld;
    expect(center.x).toBeCloseTo(expected[0], 3);
    expect(center.y).toBeCloseTo(expected[1], 3);
    expect(center.z).toBeCloseTo(expected[2], 3);
}
