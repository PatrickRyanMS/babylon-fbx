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
import type { FBXAnimationStackData, FBXCurveNodeData } from "../src/interpreter/animation.js";
import type { FBXGeometryData } from "../src/interpreter/geometry.js";
import type { FBXCameraData, FBXLightData, FBXModelData } from "../src/interpreter/fbxInterpreter.js";
import type { FBXMaterialData } from "../src/interpreter/materials.js";
import type { FBXBoneData, FBXSkinData } from "../src/interpreter/skeleton.js";
import type { FBXRigData } from "../src/interpreter/rig.js";
import type { FBXBlendShapeData } from "../src/interpreter/blendShapes.js";
import { Material } from "@babylonjs/core/Materials/material.js";
import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup.js";

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

    it("maps Lambert materials to diffuse-only StandardMaterial shading", () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const loader = new FBXFileLoader() as unknown as {
            _createMaterial: (matData: FBXMaterialData, scene: Scene, rootUrl: string) => StandardMaterial;
        };

        const material = loader._createMaterial({
            id: 1n,
            name: "LambertMaterial",
            type: "Lambert",
            properties: {
                specularColor: [1, 1, 1],
                specularFactor: 1,
            },
            textures: [],
        }, scene, "");

        expect(material.specularColor.r).toBe(0);
        expect(material.specularColor.g).toBe(0);
        expect(material.specularColor.b).toBe(0);

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

    it("clones culling-off materials without mutating shared cached materials", () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const material = new StandardMaterial("SharedMaterial", scene);
        const getModelMaterial = (FBXFileLoader as unknown as {
            _getModelMaterial: (
                material: StandardMaterial,
                model: FBXModelData,
                cullingCloneCache?: Map<StandardMaterial, StandardMaterial>,
                cloneCullingOffMaterial?: boolean
            ) => StandardMaterial;
        })._getModelMaterial;

        const model = createModel({ cullingOff: true });
        const cloneCache = new Map<StandardMaterial, StandardMaterial>();
        const first = getModelMaterial(material, model, cloneCache);
        const second = getModelMaterial(material, model, cloneCache);

        expect(first).not.toBe(material);
        expect(first).toBe(second);
        expect(first.backFaceCulling).toBe(false);
        expect(material.backFaceCulling).toBe(true);

        const exclusiveMaterial = new StandardMaterial("ExclusiveMaterial", scene);
        const exclusive = getModelMaterial(exclusiveMaterial, model, undefined, false);
        expect(exclusive).toBe(exclusiveMaterial);
        expect(exclusiveMaterial.backFaceCulling).toBe(false);

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
            diagnostics: ["Synthetic model diagnostic."],
        }));

        expect((node.metadata as { fbxCustomProperties: { ExportTag: string } }).fbxCustomProperties.ExportTag).toBe("hero");
        expect((node.metadata as { fbxDiagnostics: string[] }).fbxDiagnostics[0]).toContain("Synthetic model diagnostic");

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

    it("uses FBX bind matrices as skeleton rest pose when Lcl transforms differ", () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const loader = new FBXFileLoader() as unknown as {
            _createSkeleton: (
                skeletonId: string,
                bones: FBXBoneData[],
                scene: Scene
            ) => import("@babylonjs/core/Bones/skeleton.js").Skeleton;
        };
        const scaledBind = Matrix.Scaling(100, 100, 100);

        const skeleton = loader._createSkeleton("bind-rest", [
            createBone({
                modelId: 1n,
                name: "Armature",
                scale: [100, 100, 100],
                modelBindPoseMatrix: Float64Array.from(scaledBind.asArray()),
            }),
            createBone({
                modelId: 2n,
                name: "Root",
                index: 1,
                parentIndex: 0,
                isCluster: true,
                scale: [100, 100, 100],
                transformLinkMatrix: Float64Array.from(scaledBind.asArray()),
                modelBindPoseMatrix: Float64Array.from(scaledBind.asArray()),
            }),
        ], scene);
        const mesh = new Mesh("SkinnedMesh", scene);
        mesh.skeleton = skeleton;

        const transformMatrices = skeleton.getTransformMatrices(mesh);
        const rootFinalMatrix = Matrix.FromArray(Array.from(transformMatrices.slice(16, 32)));

        expect(rootFinalMatrix.m[0]).toBeCloseTo(1, 6);
        expect(rootFinalMatrix.m[5]).toBeCloseTo(1, 6);
        expect(rootFinalMatrix.m[10]).toBeCloseTo(1, 6);
        expect(rootFinalMatrix.m[12]).toBeCloseTo(0, 6);
        expect(rootFinalMatrix.m[13]).toBeCloseTo(0, 6);
        expect(rootFinalMatrix.m[14]).toBeCloseTo(0, 6);

        scene.dispose();
        engine.dispose();
    });

    it("keeps authored bone rest pose for working animated rigs with ordinary bind offsets", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const file = readFileSync(aishaPath);
        const buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
        const rootUrl = `${pathToFileURL(dirname(aishaPath)).href}/`;

        await new FBXFileLoader().importMeshAsync(null, scene, buffer, rootUrl);

        const skeleton = scene.skeletons[0];
        const rootBone = skeleton.bones.find((bone) => bone.name === "mainAisha:Root_M");
        const shoulderBone = skeleton.bones.find((bone) => bone.name === "mainAisha:Shoulder_L");
        expect(rootBone).toBeDefined();
        expect(shoulderBone).toBeDefined();

        expect(maxMatrixDifference(rootBone!.getLocalMatrix(), rootBone!.getBindMatrix())).toBeGreaterThan(0.5);
        expect(maxMatrixDifference(shoulderBone!.getLocalMatrix(), shoulderBone!.getBindMatrix())).toBeGreaterThan(0.1);

        scene.dispose();
        engine.dispose();
    });

    it("does not let non-cluster helper scale force a whole skeleton into bind-rest mode", () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const loader = new FBXFileLoader() as unknown as {
            _createSkeleton: (
                skeletonId: string,
                bones: FBXBoneData[],
                scene: Scene
            ) => import("@babylonjs/core/Bones/skeleton.js").Skeleton;
        };

        const skeleton = loader._createSkeleton("helper-scale", [
            createBone({
                modelId: 1n,
                name: "ScaledHelper",
                scale: [100, 100, 100],
                modelBindPoseMatrix: Float64Array.from(Matrix.Identity().asArray()),
            }),
            createBone({
                modelId: 2n,
                name: "DeformingBone",
                index: 1,
                parentIndex: 0,
                isCluster: true,
                transformLinkMatrix: Float64Array.from(Matrix.Identity().asArray()),
                modelBindPoseMatrix: Float64Array.from(Matrix.Identity().asArray()),
            }),
        ], scene);

        const helperScale = getMatrixScale(skeleton.bones[0].getLocalMatrix());
        expect(helperScale.x).toBeCloseTo(100, 6);
        expect(helperScale.y).toBeCloseTo(100, 6);
        expect(helperScale.z).toBeCloseTo(100, 6);

        scene.dispose();
        engine.dispose();
    });

    it("compensates InheritType Rrs bones so child scale, but not child translation, cancels parent scale", () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const loader = new FBXFileLoader() as unknown as {
            _createSkeleton: (
                skeletonId: string,
                bones: FBXBoneData[],
                scene: Scene
            ) => import("@babylonjs/core/Bones/skeleton.js").Skeleton;
        };

        const skeleton = loader._createSkeleton("inherit-rrs", [
            createBone({
                modelId: 1n,
                name: "ScaledParent",
                scale: [2, 2, 2],
            }),
            createBone({
                modelId: 2n,
                name: "NoParentScaleChild",
                index: 1,
                parentIndex: 0,
                translation: [1, 0, 0],
                inheritType: 2,
            }),
        ], scene);
        const child = expectBone(skeleton, "NoParentScaleChild");
        const helper = expectBone(skeleton, "NoParentScaleChild__fbx_scaleCompensation");
        const childLocalScale = new Vector3();
        const childLocalRotation = new Quaternion();
        const childLocalTranslation = new Vector3();
        const helperLocalScale = new Vector3();
        const helperLocalRotation = new Quaternion();
        const helperLocalTranslation = new Vector3();
        const childWorldScale = new Vector3();
        const childWorldRotation = new Quaternion();
        const childWorldTranslation = new Vector3();

        expect(helper.getIndex()).toBe(-1);
        child.getLocalMatrix().decompose(childLocalScale, childLocalRotation, childLocalTranslation);
        helper.getLocalMatrix().decompose(helperLocalScale, helperLocalRotation, helperLocalTranslation);
        child.getLocalMatrix()
            .multiply(helper.getLocalMatrix())
            .multiply(skeleton.bones[0].getLocalMatrix())
            .decompose(childWorldScale, childWorldRotation, childWorldTranslation);

        expect(childLocalTranslation.x).toBeCloseTo(0, 6);
        expect(childLocalScale.x).toBeCloseTo(1, 6);
        expect(childLocalScale.y).toBeCloseTo(1, 6);
        expect(childLocalScale.z).toBeCloseTo(1, 6);
        expect(helperLocalTranslation.x).toBeCloseTo(1, 6);
        expect(helperLocalScale.x).toBeCloseTo(0.5, 6);
        expect(helperLocalScale.y).toBeCloseTo(0.5, 6);
        expect(helperLocalScale.z).toBeCloseTo(0.5, 6);
        expect(childWorldTranslation.x).toBeCloseTo(2, 6);
        expect(childWorldScale.x).toBeCloseTo(1, 6);
        expect(childWorldScale.y).toBeCloseTo(1, 6);
        expect(childWorldScale.z).toBeCloseTo(1, 6);

        scene.dispose();
        engine.dispose();
    });

    it("preserves child scale and rotation inheritance when compensating InheritType Rrs rest pose", () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const loader = new FBXFileLoader() as unknown as {
            _createSkeleton: (
                skeletonId: string,
                bones: FBXBoneData[],
                scene: Scene
            ) => import("@babylonjs/core/Bones/skeleton.js").Skeleton;
        };

        const skeleton = loader._createSkeleton("inherit-rrs-rotated", [
            createBone({
                modelId: 1n,
                name: "NonUniformScaledRotatedParent",
                rotation: [17, 29, 90],
                scale: [1.3861, 1.1764, 1.1764],
            }),
            createBone({
                modelId: 2n,
                name: "OwnScaleChild",
                index: 1,
                parentIndex: 0,
                translation: [1, 0, 0],
                scale: [1.1794, 1.3048, 1.2464],
                inheritType: 2,
            }),
        ], scene);
        const parent = expectBone(skeleton, "NonUniformScaledRotatedParent");
        const helper = expectBone(skeleton, "OwnScaleChild__fbx_scaleCompensation");
        const child = expectBone(skeleton, "OwnScaleChild");
        const childAbsolute = child.getLocalMatrix()
            .multiply(helper.getLocalMatrix())
            .multiply(parent.getLocalMatrix());
        const childScale = new Vector3();
        const childRotation = new Quaternion();
        const childTranslation = new Vector3();

        childAbsolute.decompose(childScale, childRotation, childTranslation);

        expect(childScale.x).toBeCloseTo(1.1794, 4);
        expect(childScale.y).toBeCloseTo(1.3048, 4);
        expect(childScale.z).toBeCloseTo(1.2464, 4);
        const childLocal = child.getLocalMatrix();
        const childLocalScale = new Vector3();
        const childLocalRotation = new Quaternion();
        const childLocalTranslation = new Vector3();
        childLocal.decompose(childLocalScale, childLocalRotation, childLocalTranslation);

        expect(helper.getIndex()).toBe(-1);
        expect(childLocalTranslation.x).toBeCloseTo(0, 6);
        expect(childLocalTranslation.y).toBeCloseTo(0, 6);
        expect(childLocalTranslation.z).toBeCloseTo(0, 6);

        scene.dispose();
        engine.dispose();
    });

    it("strips only immediate parent scale when compensating a nested InheritType Rrs child", () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const loader = new FBXFileLoader() as unknown as {
            _createSkeleton: (
                skeletonId: string,
                bones: FBXBoneData[],
                scene: Scene
            ) => import("@babylonjs/core/Bones/skeleton.js").Skeleton;
        };

        const skeleton = loader._createSkeleton("inherit-rrs-nested", [
            createBone({
                modelId: 1n,
                name: "ScaledGrandparent",
                scale: [2, 2, 2],
            }),
            createBone({
                modelId: 2n,
                name: "ScaleInheritingParent",
                index: 1,
                parentIndex: 0,
                translation: [1, 0, 0],
                scale: [3, 3, 3],
            }),
            createBone({
                modelId: 3n,
                name: "NoAncestorScaleChild",
                index: 2,
                parentIndex: 1,
                translation: [1, 0, 0],
                inheritType: 2,
            }),
        ], scene);
        const child = expectBone(skeleton, "NoAncestorScaleChild");
        const helper = expectBone(skeleton, "NoAncestorScaleChild__fbx_scaleCompensation");
        const parent = expectBone(skeleton, "ScaleInheritingParent");
        const grandparent = expectBone(skeleton, "ScaledGrandparent");
        const childAbsolute = child.getLocalMatrix()
            .multiply(helper.getLocalMatrix())
            .multiply(parent.getLocalMatrix())
            .multiply(grandparent.getLocalMatrix());
        const childScale = new Vector3();
        const childRotation = new Quaternion();
        const childTranslation = new Vector3();

        childAbsolute.decompose(childScale, childRotation, childTranslation);

        expect(childScale.x).toBeCloseTo(2, 6);
        expect(childScale.y).toBeCloseTo(2, 6);
        expect(childScale.z).toBeCloseTo(2, 6);

        scene.dispose();
        engine.dispose();
    });

    it("compensates animated InheritType Rrs bones when sampling rig animations", () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const loader = new FBXFileLoader() as unknown as {
            _createSkeleton: (
                skeletonId: string,
                bones: FBXBoneData[],
                scene: Scene
            ) => import("@babylonjs/core/Bones/skeleton.js").Skeleton;
            _createAnimationGroup: (
                animStack: FBXAnimationStackData,
                rigs: FBXRigData[],
                skeletonByRigId: Map<string, import("@babylonjs/core/Bones/skeleton.js").Skeleton>,
                scene: Scene,
                modelIdToNode: Map<bigint, TransformNode>,
                modelIdToData: Map<bigint, FBXModelData>,
                meshes: Mesh[]
            ) => AnimationGroup | null;
        };
        const bones = [
            createBone({
                modelId: 1n,
                name: "ScaledParent",
                scale: [2, 2, 2],
            }),
            createBone({
                modelId: 2n,
                name: "AnimatedNoParentScaleChild",
                index: 1,
                parentIndex: 0,
                translation: [1, 0, 0],
                inheritType: 2,
            }),
            createBone({
                modelId: 3n,
                name: "OrdinaryAnimatedSibling",
                index: 2,
                parentIndex: 0,
                translation: [3, 0, 0],
            }),
        ];
        const skeleton = loader._createSkeleton("animated-inherit-rrs", bones, scene);
        const rig: FBXRigData = {
            id: "rig",
            rootModelIds: [1n],
            bones,
            modelIdToBoneIndex: new Map([[1n, 0], [2n, 1], [3n, 2]]),
            clusterModelIds: new Set([2n, 3n]),
            skinBindings: [],
            warnings: [],
        };
        const animStack: FBXAnimationStackData = {
            name: "SyntheticInheritAnimation",
            startTime: 0,
            stopTime: 1,
            duration: 1,
            curveNodes: [
                createVariableCurveNode(1n, "S", [[2, 2, 2], [4, 4, 4]]),
                createVariableCurveNode(2n, "T", [[1, 0, 0], [2, 0, 0]]),
                createVariableCurveNode(2n, "R", [[0, 0, 0], [0, 90, 0]]),
                createVariableCurveNode(3n, "T", [[3, 0, 0], [4, 0, 0]]),
                createCurveNode(3n, "R", [0, 0, 0]),
            ],
            layers: [],
            unsupportedCurveNodes: [],
            diagnostics: [],
        };

        const group = loader._createAnimationGroup(
            animStack,
            [rig],
            new Map([["rig", skeleton]]),
            scene,
            new Map(),
            new Map([
                [1n, createModel({ id: 1n, name: "ScaledParent", subType: "LimbNode", scale: [2, 2, 2] })],
                [2n, createModel({ id: 2n, name: "AnimatedNoParentScaleChild", subType: "LimbNode", translation: [1, 0, 0], inheritType: 2 })],
                [3n, createModel({ id: 3n, name: "OrdinaryAnimatedSibling", subType: "LimbNode", translation: [3, 0, 0] })],
            ]),
            []
        );
        const child = expectBone(skeleton, "AnimatedNoParentScaleChild");
        const childHelper = expectBone(skeleton, "AnimatedNoParentScaleChild__fbx_scaleCompensation");
        const sibling = expectBone(skeleton, "OrdinaryAnimatedSibling");
        const childPosition = group!.targetedAnimations.find((targetedAnimation) =>
            targetedAnimation.target === child &&
            targetedAnimation.animation.targetProperty === "position"
        );
        expect(childPosition).toBeUndefined();

        const helperPosition = group!.targetedAnimations.find((targetedAnimation) =>
            targetedAnimation.target === childHelper &&
            targetedAnimation.animation.targetProperty === "position"
        );
        expect(helperPosition).toBeDefined();
        const keys = helperPosition!.animation.getKeys();
        expect((keys[0].value as Vector3).x).toBeCloseTo(1, 6);
        expect((keys[keys.length - 1].value as Vector3).x).toBeCloseTo(2, 6);

        const helperScale = group!.targetedAnimations.find((targetedAnimation) =>
            targetedAnimation.target === childHelper &&
            targetedAnimation.animation.targetProperty === "scaling"
        );
        expect(helperScale).toBeDefined();
        const helperScaleKeys = helperScale!.animation.getKeys();
        expect((helperScaleKeys[0].value as Vector3).x).toBeCloseTo(0.5, 6);
        expect((helperScaleKeys[helperScaleKeys.length - 1].value as Vector3).x).toBeCloseTo(0.25, 6);

        const childRotation = group!.targetedAnimations.find((targetedAnimation) =>
            targetedAnimation.target === child &&
            targetedAnimation.animation.targetProperty === "rotationQuaternion"
        );
        expect(childRotation).toBeDefined();
        const childRotationKeys = childRotation!.animation.getKeys();
        const finalRotation = childRotationKeys[childRotationKeys.length - 1].value as Quaternion;
        expect(Math.abs(Quaternion.Dot(finalRotation, Quaternion.FromEulerAngles(0, Math.PI / 2, 0)))).toBeCloseTo(1, 5);

        const siblingPosition = group!.targetedAnimations.find((targetedAnimation) =>
            targetedAnimation.target === sibling &&
            targetedAnimation.animation.targetProperty === "position"
        );
        expect(siblingPosition).toBeDefined();
        const siblingKeys = siblingPosition!.animation.getKeys();
        expect((siblingKeys[0].value as Vector3).x).toBeCloseTo(3, 6);
        expect((siblingKeys[siblingKeys.length - 1].value as Vector3).x).toBeCloseTo(4, 6);
        expect(group!.targetedAnimations.some((targetedAnimation) =>
            targetedAnimation.target === sibling &&
            targetedAnimation.animation.targetProperty === "rotationQuaternion"
        )).toBe(true);

        scene.dispose();
        engine.dispose();
    });

    it("remaps bind-rest animation only for bones with severe local scale mismatch", () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const loader = new FBXFileLoader() as unknown as {
            _createSkeleton: (
                skeletonId: string,
                bones: FBXBoneData[],
                scene: Scene
            ) => import("@babylonjs/core/Bones/skeleton.js").Skeleton;
            _createAnimationGroup: (
                animStack: FBXAnimationStackData,
                rigs: FBXRigData[],
                skeletonByRigId: Map<string, import("@babylonjs/core/Bones/skeleton.js").Skeleton>,
                scene: Scene,
                modelIdToNode: Map<bigint, TransformNode>,
                modelIdToData: Map<bigint, FBXModelData>,
                meshes: Mesh[]
            ) => AnimationGroup | null;
        };
        const childBindLocal = Matrix.RotationY(Math.PI / 4);
        const bones = [
            createBone({
                modelId: 1n,
                name: "ScaledRoot",
                scale: [100, 100, 100],
                isCluster: true,
                transformLinkMatrix: Float64Array.from(Matrix.Identity().asArray()),
                modelBindPoseMatrix: Float64Array.from(Matrix.Identity().asArray()),
            }),
            createBone({
                modelId: 2n,
                name: "AnimatedChild",
                index: 1,
                parentIndex: 0,
                isCluster: true,
                transformLinkMatrix: Float64Array.from(childBindLocal.asArray()),
                modelBindPoseMatrix: Float64Array.from(childBindLocal.asArray()),
            }),
        ];
        const skeleton = loader._createSkeleton("selective-bind-rest", bones, scene);
        const rig: FBXRigData = {
            id: "rig",
            rootModelIds: [1n],
            bones,
            modelIdToBoneIndex: new Map([[1n, 0], [2n, 1]]),
            clusterModelIds: new Set([1n, 2n]),
            skinBindings: [],
            warnings: [],
        };
        const animStack: FBXAnimationStackData = {
            name: "SyntheticAction",
            startTime: 0,
            stopTime: 1,
            duration: 1,
            curveNodes: [createCurveNode(2n, "R", [0, 0, 0])],
            layers: [],
            unsupportedCurveNodes: [],
            diagnostics: [],
        };

        const group = loader._createAnimationGroup(
            animStack,
            [rig],
            new Map([["rig", skeleton]]),
            scene,
            new Map(),
            new Map([[2n, createModel({ id: 2n, name: "AnimatedChild", subType: "LimbNode" })]]),
            []
        );
        const childRotation = group!.targetedAnimations.find((targetedAnimation) =>
            targetedAnimation.target === skeleton.bones[1] &&
            targetedAnimation.animation.targetProperty === "rotationQuaternion"
        );
        expect(childRotation).toBeDefined();

        const firstKey = childRotation!.animation.getKeys()[0].value as Quaternion;
        expect(firstKey.x).toBeCloseTo(0, 6);
        expect(firstKey.y).toBeCloseTo(0, 6);
        expect(firstKey.z).toBeCloseTo(0, 6);
        expect(firstKey.w).toBeCloseTo(1, 6);

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

    it("generates tangents for normal-mapped geometry when FBX omits tangent layers", () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const loader = new FBXFileLoader() as unknown as {
            _createMesh: (model: FBXModelData, geomData: FBXGeometryData, scene: Scene) => Mesh;
        };
        const geomData = createTriangleGeometry({
            uvs: new Float64Array([0, 0, 1, 0, 0, 1]),
            uvSets: [{ name: "UVMap", data: new Float64Array([0, 0, 1, 0, 0, 1]) }],
        });

        const mesh = loader._createMesh(createModel({ geometry: geomData }), geomData, scene);
        const tangents = mesh.getVerticesData(VertexBuffer.TangentKind);

        expect(tangents).toBeDefined();
        expect(tangents!.length).toBe(12);
        for (let i = 0; i < tangents!.length; i += 4) {
            expect(tangents![i]).toBeCloseTo(1, 6);
            expect(tangents![i + 1]).toBeCloseTo(0, 6);
            expect(tangents![i + 2]).toBeCloseTo(0, 6);
            expect(tangents![i + 3]).toBeCloseTo(-1, 6);
        }

        scene.dispose();
        engine.dispose();
    });

    it("smooths generated tangents across expanded duplicate polygon vertices", () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const loader = new FBXFileLoader() as unknown as {
            _createMesh: (model: FBXModelData, geomData: FBXGeometryData, scene: Scene) => Mesh;
        };
        const geomData = createTriangleGeometry({
            positions: new Float64Array([
                0, 0, 0,
                1, 0, 0,
                0, 1, 0,
                0, 0, 0,
                0, 1, 0,
                -1, 0, 0,
            ]),
            indices: new Uint32Array([0, 1, 2, 3, 4, 5]),
            normals: new Float64Array([
                0, 0, 1,
                0, 0, 1,
                0, 0, 1,
                0, 0, 1,
                0, 0, 1,
                0, 0, 1,
            ]),
            uvs: new Float64Array([
                0, 0,
                1, 0,
                0, 1,
                0, 0,
                1, 0,
                0, 1,
            ]),
            uvSets: [{
                name: "UVMap",
                data: new Float64Array([
                    0, 0,
                    1, 0,
                    0, 1,
                    0, 0,
                    1, 0,
                    0, 1,
                ]),
            }],
            controlPointIndices: new Uint32Array([0, 1, 2, 0, 2, 3]),
        });

        const mesh = loader._createMesh(createModel({ geometry: geomData }), geomData, scene);
        const tangents = mesh.getVerticesData(VertexBuffer.TangentKind);
        const sqrtHalf = Math.SQRT1_2;

        expect(tangents).toBeDefined();
        expect(tangents![0]).toBeCloseTo(sqrtHalf, 6);
        expect(tangents![1]).toBeCloseTo(sqrtHalf, 6);
        expect(tangents![3]).toBeCloseTo(-1, 6);
        expect(tangents![12]).toBeCloseTo(sqrtHalf, 6);
        expect(tangents![13]).toBeCloseTo(sqrtHalf, 6);
        expect(tangents![15]).toBeCloseTo(-1, 6);

        scene.dispose();
        engine.dispose();
    });

    it("does not smooth generated tangents across mirrored UV islands", () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const loader = new FBXFileLoader() as unknown as {
            _createMesh: (model: FBXModelData, geomData: FBXGeometryData, scene: Scene) => Mesh;
        };
        const geomData = createTriangleGeometry({
            positions: new Float64Array([
                0, 0, 0,
                1, 0, 0,
                0, 1, 0,
                0, 0, 0,
                -1, 0, 0,
                0, 1, 0,
            ]),
            indices: new Uint32Array([0, 1, 2, 3, 4, 5]),
            normals: new Float64Array([
                0, 0, 1,
                0, 0, 1,
                0, 0, 1,
                0, 0, 1,
                0, 0, 1,
                0, 0, 1,
            ]),
            uvs: new Float64Array([
                0, 0,
                1, 0,
                0, 1,
                0, 0,
                1, 0,
                0, 1,
            ]),
            uvSets: [{
                name: "UVMap",
                data: new Float64Array([
                    0, 0,
                    1, 0,
                    0, 1,
                    0, 0,
                    1, 0,
                    0, 1,
                ]),
            }],
            controlPointIndices: new Uint32Array([0, 1, 2, 0, 3, 2]),
        });

        const mesh = loader._createMesh(createModel({ geometry: geomData }), geomData, scene);
        const tangents = mesh.getVerticesData(VertexBuffer.TangentKind);

        expect(tangents).toBeDefined();
        expect(tangents![0]).toBeCloseTo(1, 6);
        expect(tangents![1]).toBeCloseTo(0, 6);
        expect(tangents![3]).toBeCloseTo(-1, 6);
        expect(tangents![12]).toBeCloseTo(-1, 6);
        expect(tangents![13]).toBeCloseTo(0, 6);
        expect(tangents![15]).toBeCloseTo(1, 6);

        scene.dispose();
        engine.dispose();
    });

    it("does not smooth generated tangents across material seams", () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const loader = new FBXFileLoader() as unknown as {
            _createMesh: (model: FBXModelData, geomData: FBXGeometryData, scene: Scene) => Mesh;
        };
        const geomData = createTriangleGeometry({
            positions: new Float64Array([
                0, 0, 0,
                1, 0, 0,
                0, 1, 0,
                0, 0, 0,
                0, 1, 0,
                -1, 0, 0,
            ]),
            indices: new Uint32Array([0, 1, 2, 3, 4, 5]),
            normals: new Float64Array([
                0, 0, 1,
                0, 0, 1,
                0, 0, 1,
                0, 0, 1,
                0, 0, 1,
                0, 0, 1,
            ]),
            uvs: new Float64Array([
                0, 0,
                1, 0,
                0, 1,
                0, 0,
                1, 0,
                0, 1,
            ]),
            uvSets: [{
                name: "UVMap",
                data: new Float64Array([
                    0, 0,
                    1, 0,
                    0, 1,
                    0, 0,
                    1, 0,
                    0, 1,
                ]),
            }],
            controlPointIndices: new Uint32Array([0, 1, 2, 0, 2, 3]),
            materialIndices: new Int32Array([0, 1]),
        });

        const mesh = loader._createMesh(createModel({ geometry: geomData }), geomData, scene);
        const tangents = mesh.getVerticesData(VertexBuffer.TangentKind);

        expect(tangents).toBeDefined();
        expect(tangents![0]).toBeCloseTo(1, 6);
        expect(tangents![1]).toBeCloseTo(0, 6);
        expect(tangents![3]).toBeCloseTo(-1, 6);
        expect(tangents![12]).toBeCloseTo(0, 6);
        expect(tangents![13]).toBeCloseTo(1, 6);
        expect(tangents![15]).toBeCloseTo(-1, 6);

        scene.dispose();
        engine.dispose();
    });

    it("keeps right-handed scene tangent handedness unmirrored", () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        scene.useRightHandedSystem = true;
        const loader = new FBXFileLoader() as unknown as {
            _createMesh: (model: FBXModelData, geomData: FBXGeometryData, scene: Scene) => Mesh;
        };
        const geomData = createTriangleGeometry({
            uvs: new Float64Array([0, 0, 1, 0, 0, 1]),
            uvSets: [{ name: "UVMap", data: new Float64Array([0, 0, 1, 0, 0, 1]) }],
        });

        const mesh = loader._createMesh(createModel({ geometry: geomData }), geomData, scene);
        const tangents = mesh.getVerticesData(VertexBuffer.TangentKind);

        expect(tangents).toBeDefined();
        for (let i = 3; i < tangents!.length; i += 4) {
            expect(tangents![i]).toBeCloseTo(1, 6);
        }

        scene.dispose();
        engine.dispose();
    });

    it("mirrors source tangent handedness under the FBX handedness root", () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const loader = new FBXFileLoader() as unknown as {
            _createMesh: (model: FBXModelData, geomData: FBXGeometryData, scene: Scene) => Mesh;
        };
        const geomData = createTriangleGeometry({
            tangents: new Float64Array([
                1, 0, 0, 1,
                1, 0, 0, 1,
                1, 0, 0, 1,
            ]),
        });

        const mesh = loader._createMesh(createModel({ geometry: geomData }), geomData, scene);
        const tangents = mesh.getVerticesData(VertexBuffer.TangentKind);

        expect(tangents).toBeDefined();
        for (let i = 3; i < tangents!.length; i += 4) {
            expect(tangents![i]).toBeCloseTo(-1, 6);
        }

        scene.dispose();
        engine.dispose();
    });

    it("configures FBX normal maps as non-color data with Babylon handedness inversions", () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const loader = new FBXFileLoader() as unknown as {
            _createMaterial: (matData: FBXMaterialData, scene: Scene, rootUrl: string) => StandardMaterial;
        };
        const materialData: FBXMaterialData = {
            id: 1n,
            name: "SyntheticMaterial",
            type: "Phong",
            properties: {},
            textures: [{
                propertyName: "NormalMap",
                fileName: "normal.png",
                relativeFileName: "normal.png",
                id: 2n,
                embeddedData: null,
            }],
        };

        const material = loader._createMaterial(materialData, scene, "file:///textures/");

        expect(material.bumpTexture?.gammaSpace).toBe(false);
        expect(material.invertNormalMapX).toBe(true);
        expect(material.invertNormalMapY).toBe(false);

        scene.dispose();
        engine.dispose();
    });

    it("configures right-handed FBX normal maps with matching Babylon handedness inversions", () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        scene.useRightHandedSystem = true;
        const loader = new FBXFileLoader() as unknown as {
            _createMaterial: (matData: FBXMaterialData, scene: Scene, rootUrl: string) => StandardMaterial;
        };
        const materialData: FBXMaterialData = {
            id: 1n,
            name: "SyntheticMaterial",
            type: "Phong",
            properties: {},
            textures: [{
                propertyName: "NormalMap",
                fileName: "normal.png",
                relativeFileName: "normal.png",
                id: 2n,
                embeddedData: null,
            }],
        };

        const material = loader._createMaterial(materialData, scene, "file:///textures/");

        expect(material.bumpTexture?.gammaSpace).toBe(false);
        expect(material.invertNormalMapX).toBe(false);
        expect(material.invertNormalMapY).toBe(true);

        scene.dispose();
        engine.dispose();
    });

    it("does not apply tangent-space normal map settings to FBX bump height maps", () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const loader = new FBXFileLoader() as unknown as {
            _createMaterial: (matData: FBXMaterialData, scene: Scene, rootUrl: string) => StandardMaterial;
        };
        const materialData: FBXMaterialData = {
            id: 1n,
            name: "SyntheticMaterial",
            type: "Phong",
            properties: {},
            textures: [{
                propertyName: "Bump",
                fileName: "height.png",
                relativeFileName: "height.png",
                id: 2n,
                embeddedData: null,
            }],
        };

        const material = loader._createMaterial(materialData, scene, "file:///textures/");

        expect(material.bumpTexture).toBeDefined();
        expect(material.bumpTexture?.gammaSpace).toBe(true);
        expect(material.invertNormalMapX).toBe(false);
        expect(material.invertNormalMapY).toBe(false);

        scene.dispose();
        engine.dispose();
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

function createTriangleGeometry(overrides: Partial<FBXGeometryData> = {}): FBXGeometryData {
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
        ...overrides,
    };
}

function createBone(overrides: Partial<FBXBoneData>): FBXBoneData {
    return {
        modelId: 1n,
        name: "SyntheticBone",
        index: 0,
        parentIndex: -1,
        isCluster: false,
        translation: [0, 0, 0],
        rotation: [0, 0, 0],
        preRotation: [0, 0, 0],
        postRotation: [0, 0, 0],
        rotationPivot: [0, 0, 0],
        scalingPivot: [0, 0, 0],
        rotationOffset: [0, 0, 0],
        scalingOffset: [0, 0, 0],
        scale: [1, 1, 1],
        rotationOrder: 0,
        inheritType: 1,
        clusterMode: "Unknown",
        bindPoseMatrix: null,
        transformLinkMatrix: null,
        transformAssociateModelMatrix: null,
        modelBindPoseMatrix: null,
        diagnostics: [],
        ...overrides,
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

function createCurveNode(targetModelId: bigint, type: "T" | "R" | "S", values: [number, number, number]): FBXCurveNodeData {
    return {
        type,
        targetModelId,
        curves: ["d|X", "d|Y", "d|Z"].map((channel, index) => ({
            channel,
            keys: [
                { time: 0, value: values[index], interpolation: "linear" },
                { time: 1, value: values[index], interpolation: "linear" },
            ],
        })),
    };
}

function createVariableCurveNode(targetModelId: bigint, type: "T" | "R" | "S", values: [[number, number, number], [number, number, number]]): FBXCurveNodeData {
    return {
        type,
        targetModelId,
        curves: ["d|X", "d|Y", "d|Z"].map((channel, index) => ({
            channel,
            keys: [
                { time: 0, value: values[0][index], interpolation: "linear" },
                { time: 1, value: values[1][index], interpolation: "linear" },
            ],
        })),
    };
}

function maxMatrixDifference(a: Matrix, b: Matrix): number {
    let maxDifference = 0;
    for (let i = 0; i < 16; i++) {
        maxDifference = Math.max(maxDifference, Math.abs(a.m[i] - b.m[i]));
    }
    return maxDifference;
}

function getMatrixScale(matrix: Matrix): Vector3 {
    const scale = new Vector3();
    const rotation = new Quaternion();
    const translation = new Vector3();
    matrix.decompose(scale, rotation, translation);
    return scale;
}

function expectBone(
    skeleton: import("@babylonjs/core/Bones/skeleton.js").Skeleton,
    name: string
): import("@babylonjs/core/Bones/bone.js").Bone {
    const bone = skeleton.bones.find((candidate) => candidate.name === name);
    expect(bone).toBeDefined();
    return bone!;
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
