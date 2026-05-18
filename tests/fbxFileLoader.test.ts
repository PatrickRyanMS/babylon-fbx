import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { Matrix, Vector3, Quaternion } from "@babylonjs/core/Maths/math.vector.js";
import { Camera } from "@babylonjs/core/Cameras/camera.js";
import { SpotLight } from "@babylonjs/core/Lights/spotLight.js";

import { FBXFileLoader } from "../src/fbxFileLoader.js";
import type { FBXGeometryData } from "../src/interpreter/geometry.js";
import type { FBXCameraData, FBXLightData, FBXModelData } from "../src/interpreter/fbxInterpreter.js";
import type { FBXMaterialData } from "../src/interpreter/materials.js";
import type { FBXSkinData } from "../src/interpreter/skeleton.js";
import type { FBXBlendShapeData } from "../src/interpreter/blendShapes.js";
import { Material } from "@babylonjs/core/Materials/material.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const alfaRomeoPath = resolve(__dirname, "models/alfa-romeo-stradale-1967/finish91.fbx");
const aishaPath = resolve(__dirname, "models/anime-chibi-girl-aisha-by-seraphim/test2.fbx");
const behemotPath = resolve(__dirname, "models/behemot-cat/LowPoly_Cat_V04.fbx");
const tamagotchiPath = resolve(__dirname, "models/tamagotchi-pet-sailor-moon/lp_01.fbx");
const spartanPath = resolve(__dirname, "models/spartan-armour-mkv-halo-reach/Spartan_Sketchfab.fbx");

describe("FBXFileLoader", () => {
    it("maps non-Y-up FBX scene axes into Babylon's Y-up basis", () => {
        const computeAxisConversion = (FBXFileLoader as unknown as {
            _computeFBXAxisConversionMatrix: (sceneData: Pick<import("../src/interpreter/fbxInterpreter.js").FBXSceneData, "coordAxis" | "coordAxisSign" | "upAxis" | "upAxisSign" | "frontAxis" | "frontAxisSign">) => Matrix;
        })._computeFBXAxisConversionMatrix;

        const defaultAxis = computeAxisConversion({
            coordAxis: 0,
            coordAxisSign: 1,
            upAxis: 1,
            upAxisSign: 1,
            frontAxis: 2,
            frontAxisSign: 1,
        });
        const vinoAxis = computeAxisConversion({
            coordAxis: 0,
            coordAxisSign: 1,
            upAxis: 2,
            upAxisSign: 1,
            frontAxis: 1,
            frontAxisSign: -1,
        });
        const strongholdAxis = computeAxisConversion({
            coordAxis: 1,
            coordAxisSign: -1,
            upAxis: 2,
            upAxisSign: 1,
            frontAxis: 0,
            frontAxisSign: -1,
        });

        expect(defaultAxis.equals(Matrix.Identity())).toBe(true);
        expect(vinoAxis.determinant()).toBeCloseTo(1, 6);
        expect(strongholdAxis.determinant()).toBeCloseTo(1, 6);
        expect(Vector3.TransformCoordinates(new Vector3(1, 0, 0), vinoAxis).x).toBeCloseTo(1, 6);
        expect(Vector3.TransformCoordinates(new Vector3(0, 0, 1), vinoAxis).y).toBeCloseTo(1, 6);
        expect(Vector3.TransformCoordinates(new Vector3(0, -1, 0), vinoAxis).z).toBeCloseTo(1, 6);
        expect(Vector3.TransformCoordinates(new Vector3(0, -1, 0), strongholdAxis).x).toBeCloseTo(1, 6);
        expect(Vector3.TransformCoordinates(new Vector3(0, 0, 1), strongholdAxis).y).toBeCloseTo(1, 6);
        expect(Vector3.TransformCoordinates(new Vector3(-1, 0, 0), strongholdAxis).z).toBeCloseTo(1, 6);
    });

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

    it("does not instantiate unsupported Maya ShaderFX IBL texture references", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const file = readFileSync(spartanPath);
        const buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
        const rootUrl = `${pathToFileURL(dirname(spartanPath)).href}/`;

        await new FBXFileLoader().importMeshAsync(null, scene, buffer, rootUrl);

        expect(scene.textures.some((texture) => texture.name.toLowerCase().endsWith(".dds"))).toBe(false);
        expect(scene.materials.find((material) => material.name === "Spartan_Shoulders_Mat")).toBeInstanceOf(StandardMaterial);

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
            tangents: null,
            binormals: null,
            controlPointIndices: new Uint32Array([0, 1]),
            materialIndices: null,
            diagnostics: [],
        } satisfies FBXGeometryData;
        const skin = {
            id: 2n,
            geometryId: 1n,
            meshBindPoseMatrix: null,
            bones: [],
            boneIndices: [
                [0, 1, 2, 3, 4, 5, 6],
                [0, 1, 2, 3],
            ],
            boneWeights: [
                [0.28, 0.22, 0.18, 0.12, 0.09, 0.07, 0.04],
                [0.4, 0.3, 0.2, 0.1],
            ],
            diagnostics: [],
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

    it("applies FBX material factors and transparency semantics", () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const loader = new FBXFileLoader() as unknown as {
            _createMaterial: (matData: FBXMaterialData, scene: Scene, rootUrl: string) => StandardMaterial;
        };

        const material = loader._createMaterial({
            id: 1n,
            name: "SyntheticMaterial",
            type: "Phong",
            properties: {
                diffuseColor: [0.8, 0.6, 0.4],
                diffuseFactor: 0.5,
                specularColor: [1, 1, 1],
                specularFactor: 0.25,
                transparencyFactor: 0.4,
            },
            textures: [],
        }, scene, "");

        expect(material.diffuseColor.r).toBeCloseTo(0.4, 6);
        expect(material.diffuseColor.g).toBeCloseTo(0.3, 6);
        expect(material.diffuseColor.b).toBeCloseTo(0.2, 6);
        expect(material.specularColor.r).toBeCloseTo(0.25, 6);
        expect(material.alpha).toBeCloseTo(0.6, 6);
        expect(material.transparencyMode).toBe(Material.MATERIAL_ALPHABLEND);

        scene.dispose();
        engine.dispose();
    });

    it("maps opacity texture slots to alpha-test-and-blend materials", () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const loader = new FBXFileLoader() as unknown as {
            _createMaterial: (matData: FBXMaterialData, scene: Scene, rootUrl: string) => StandardMaterial;
        };

        const material = loader._createMaterial({
            id: 1n,
            name: "SyntheticMaterial",
            type: "Lambert",
            properties: {},
            textures: [{
                id: 2n,
                propertyName: "TransparentColor",
                fileName: "",
                relativeFileName: "alpha.png",
                embeddedData: null,
            }],
        }, scene, "file:///textures/");

        expect(material.opacityTexture).toBeDefined();
        expect(material.transparencyMode).toBe(Material.MATERIAL_ALPHATESTANDBLEND);

        scene.dispose();
        engine.dispose();
    });

    it("applies camera and light fidelity metadata without conflating spot inner and outer angles", () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const loader = new FBXFileLoader() as unknown as {
            _createCamera: (camData: FBXCameraData, modelIdToNode: Map<bigint, unknown>, scene: Scene) => unknown;
            _createLight: (lightData: FBXLightData, modelIdToNode: Map<bigint, unknown>, scene: Scene) => unknown;
        };

        const camera = loader._createCamera({
            modelId: 1n,
            name: "OrthoCamera",
            fieldOfView: 30,
            nearPlane: 0.5,
            farPlane: 250,
            aspectRatio: 2,
            projectionType: "orthographic",
            orthoZoom: 10,
            roll: 15,
            unknownProperties: ["InterestPosition"],
            diagnostics: ["roll metadata only"],
        }, new Map(), scene)! as import("@babylonjs/core/Cameras/freeCamera.js").FreeCamera;
        const light = loader._createLight({
            modelId: 2n,
            name: "Spot",
            lightType: 2,
            color: [0.2, 0.3, 0.4],
            intensity: 0.8,
            coneAngle: 40,
            decayType: 1,
            innerAngle: 10,
            outerAngle: 40,
            decayStart: 20,
            enableFarAttenuation: true,
            castShadows: true,
            unknownProperties: [],
            diagnostics: [],
        }, new Map(), scene)! as SpotLight;

        expect(camera.mode).toBe(Camera.ORTHOGRAPHIC_CAMERA);
        expect(camera.orthoTop).toBe(5);
        expect(camera.orthoRight).toBe(10);
        expect((camera.metadata as { fbxCamera: { roll: number; unknownProperties: string[] } }).fbxCamera.roll).toBe(15);
        expect(light).toBeInstanceOf(SpotLight);
        expect((light as SpotLight).angle).toBeCloseTo(40 * Math.PI / 180, 6);
        expect((light.metadata as { fbxLight: { innerAngle: number; decayStart: number } }).fbxLight.innerAngle).toBe(10);
        expect((light.metadata as { fbxLight: { innerAngle: number; decayStart: number } }).fbxLight.decayStart).toBe(20);

        scene.dispose();
        engine.dispose();
    });

    it("preserves model diagnostics and custom properties in Babylon metadata", () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const node = new TransformNode("Model", scene);
        const applyModelMetadata = (FBXFileLoader as unknown as {
            _applyModelMetadata: (node: TransformNode | Mesh, model: FBXModelData) => void;
        })._applyModelMetadata;

        applyModelMetadata(node, createModel({
            customProperties: { ExportTag: "hero" },
            diagnostics: ["InheritType 2 is runtime-gated."],
        }));

        expect((node.metadata as { fbxCustomProperties: { ExportTag: string } }).fbxCustomProperties.ExportTag).toBe("hero");
        expect((node.metadata as { fbxDiagnostics: string[] }).fbxDiagnostics[0]).toContain("InheritType 2");

        scene.dispose();
        engine.dispose();
    });

    it("uses mesh bind-pose matrices to keep skinned submeshes aligned with static siblings", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const file = readFileSync(behemotPath);
        const buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
        const rootUrl = `${pathToFileURL(dirname(behemotPath)).href}/`;

        await new FBXFileLoader().importMeshAsync(null, scene, buffer, rootUrl);

        const flameInner = scene.meshes.find((mesh) => mesh.name === "Flame_Inner");
        const flameOuter = scene.meshes.find((mesh) => mesh.name === "Flame_Outer");
        expect(flameInner).toBeDefined();
        expect(flameOuter).toBeDefined();
        flameInner!.computeWorldMatrix(true);
        flameOuter!.computeWorldMatrix(true);
        const innerCenter = flameInner!.getBoundingInfo().boundingBox.centerWorld;
        const outerCenter = flameOuter!.getBoundingInfo().boundingBox.centerWorld;

        expect(Vector3.Distance(outerCenter, innerCenter)).toBeLessThan(0.25);

        scene.dispose();
        engine.dispose();
    });

    it("uses glTF-style side orientation for FBX source meshes", () => {
        const loader = new FBXFileLoader() as unknown as {
            _createMesh: (model: FBXModelData, geomData: FBXGeometryData, scene: Scene) => Mesh;
        };
        const geomData = createTriangleGeometry();
        const model = createModel({ geometry: geomData });

        const leftHandedEngine = new NullEngine();
        const leftHandedScene = new Scene(leftHandedEngine);
        const leftHandedMesh = loader._createMesh(model, geomData, leftHandedScene);
        expect(leftHandedMesh.sideOrientation).toBe(Material.ClockWiseSideOrientation);
        leftHandedScene.dispose();
        leftHandedEngine.dispose();

        const rightHandedEngine = new NullEngine();
        const rightHandedScene = new Scene(rightHandedEngine);
        rightHandedScene.useRightHandedSystem = true;
        const rightHandedMesh = loader._createMesh(model, geomData, rightHandedScene);
        expect(rightHandedMesh.sideOrientation).toBe(Material.CounterClockWiseSideOrientation);
        rightHandedScene.dispose();
        rightHandedEngine.dispose();
    });

    it("bakes geometric transforms with translation after rotation and scale", () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const loader = new FBXFileLoader() as unknown as {
            _createMesh: (model: FBXModelData, geomData: FBXGeometryData, scene: Scene) => Mesh;
        };
        const geomData = createTriangleGeometry();
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

    it("creates separate morph targets for FullWeights in-between shapes", () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const loader = new FBXFileLoader() as unknown as {
            _applyBlendShapes: (
                blendShapes: FBXBlendShapeData[],
                meshes: Mesh[],
                scene: Scene,
                unitScaleFactor: number
            ) => void;
        };
        const mesh = new Mesh("MorphMesh", scene);
        mesh.setVerticesData("position", new Float32Array([0, 0, 0]));
        mesh.setIndices([0]);
        mesh.metadata = {
            fbxGeometryId: 1n,
            fbxControlPointIndices: new Uint32Array([0]),
        };

        loader._applyBlendShapes([{
            id: 2n,
            geometryId: 1n,
            channels: [{
                id: 3n,
                name: "Smile",
                deformPercent: 75,
                fullWeights: [50, 100],
                diagnostics: [],
                shapes: [
                    { indices: new Uint32Array([0]), vertices: new Float64Array([0.5, 0, 0]), normals: null },
                    { indices: new Uint32Array([0]), vertices: new Float64Array([1, 0, 0]), normals: null },
                ],
            }],
        }], [mesh], scene, 1);

        expect(mesh.morphTargetManager?.numTargets).toBe(2);
        expect(mesh.morphTargetManager?.getTarget(0).influence).toBeCloseTo(0.5, 6);
        expect(mesh.morphTargetManager?.getTarget(1).influence).toBeCloseTo(0.5, 6);
        const legacyMap = (mesh.metadata as Record<string, unknown>).fbxBlendShapeChannelIds as Map<bigint, number>;
        const targetsMap = (mesh.metadata as Record<string, unknown>).fbxBlendShapeChannelTargets as Map<bigint, { targetIndices: number[]; fullWeights: number[] | null }>;
        expect(legacyMap.get(3n)).toBe(0);
        expect(targetsMap.get(3n)).toEqual({ targetIndices: [0, 1], fullWeights: [50, 100] });

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

function createTriangleGeometry(): FBXGeometryData {
    return {
        id: 1n,
        name: "SyntheticGeometry",
        positions: new Float64Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
        indices: new Uint32Array([0, 1, 2]),
        normals: new Float64Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
        uvs: null,
        uvSets: [],
        colors: null,
        tangents: null,
        binormals: null,
        controlPointIndices: new Uint32Array([0, 1, 2]),
        materialIndices: null,
        diagnostics: [],
    };
}

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
        diagnostics: [],
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
