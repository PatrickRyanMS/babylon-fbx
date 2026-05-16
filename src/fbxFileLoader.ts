import type {
    ISceneLoaderPluginAsync,
    ISceneLoaderPluginExtensions,
    ISceneLoaderAsyncResult,
    ISceneLoaderProgressEvent,
} from "@babylonjs/core/Loading/sceneLoader.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { Nullable } from "@babylonjs/core/types.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { SubMesh } from "@babylonjs/core/Meshes/subMesh.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial.js";
import { Texture } from "@babylonjs/core/Materials/Textures/texture.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3, Quaternion, Matrix } from "@babylonjs/core/Maths/math.vector.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { Skeleton } from "@babylonjs/core/Bones/skeleton.js";
import { Bone } from "@babylonjs/core/Bones/bone.js";
import { Animation } from "@babylonjs/core/Animations/animation.js";
import { AnimationGroup } from "@babylonjs/core/Animations/animationGroup.js";
import { AnimationKeyInterpolation, type IAnimationKey } from "@babylonjs/core/Animations/animationKey.js";
import { MorphTarget } from "@babylonjs/core/Morph/morphTarget.js";
import { MorphTargetManager } from "@babylonjs/core/Morph/morphTargetManager.js";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { PointLight } from "@babylonjs/core/Lights/pointLight.js";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight.js";
import { SpotLight } from "@babylonjs/core/Lights/spotLight.js";
import { AssetContainer } from "@babylonjs/core/assetContainer.js";

import { parseBinaryFBX } from "./parsers/fbxBinaryParser.js";
import { parseAsciiFBX } from "./parsers/fbxAsciiParser.js";
import { interpretFBX, type FBXModelData, type FBXSceneData, type FBXCameraData, type FBXLightData } from "./interpreter/fbxInterpreter.js";
import type { FBXDocument } from "./types/fbxTypes.js";
import type { FBXGeometryData } from "./interpreter/geometry.js";
import type { FBXMaterialData } from "./interpreter/materials.js";
import type { FBXSkinData, FBXBoneData } from "./interpreter/skeleton.js";
import type { FBXRigData, FBXSkinBindingData } from "./interpreter/rig.js";
import type { FBXBlendShapeData } from "./interpreter/blendShapes.js";
import { sampleFBXCurveAtTime, type FBXAnimationStackData, type FBXCurveData, type FBXCurveNodeData } from "./interpreter/animation.js";

const FBX_ASCII_MAGIC = "; FBX";
const FBX_BINARY_MAGIC = "Kaydara FBX Binary";

/**
 * FBX file loader plugin for Babylon.js.
 * Pure TypeScript implementation — no Autodesk FBX SDK dependency.
 */
export class FBXFileLoader implements ISceneLoaderPluginAsync {
    public readonly name = "fbx";

    public readonly extensions: ISceneLoaderPluginExtensions = {
        ".fbx": { isBinary: true },
    };

    public async importMeshAsync(
        meshesNames: string | readonly string[] | null | undefined,
        scene: Scene,
        data: unknown,
        rootUrl: string,
        _onProgress?: (event: ISceneLoaderProgressEvent) => void,
        _fileName?: string
    ): Promise<ISceneLoaderAsyncResult> {
        const doc = this._parse(data);
        const fbxScene = interpretFBX(doc);
        return this._buildScene(fbxScene, scene, rootUrl, meshesNames);
    }

    public async loadAsync(
        scene: Scene,
        data: unknown,
        rootUrl: string,
        _onProgress?: (event: ISceneLoaderProgressEvent) => void,
        _fileName?: string
    ): Promise<void> {
        const doc = this._parse(data);
        const fbxScene = interpretFBX(doc);
        this._buildScene(fbxScene, scene, rootUrl, null);
    }

    public async loadAssetContainerAsync(
        scene: Scene,
        data: unknown,
        rootUrl: string,
        _onProgress?: (event: ISceneLoaderProgressEvent) => void,
        _fileName?: string
    ): Promise<AssetContainer> {
        const doc = this._parse(data);
        const fbxScene = interpretFBX(doc);

        const container = new AssetContainer(scene);

        // Build the scene into a temporary holder, then move results to container
        const result = this._buildScene(fbxScene, scene, rootUrl, null);

        for (const mesh of result.meshes) {
            container.meshes.push(mesh);
        }
        for (const skeleton of result.skeletons) {
            container.skeletons.push(skeleton);
        }
        for (const ag of result.animationGroups) {
            container.animationGroups.push(ag);
        }
        for (const tn of result.transformNodes) {
            container.transformNodes.push(tn);
        }
        for (const light of result.lights) {
            container.lights.push(light);
        }

        // Remove all added objects from the scene (container owns them)
        container.removeAllFromScene();

        return container;
    }

    // ── Parsing ────────────────────────────────────────────────────────────

    private _parse(data: unknown): FBXDocument {
        if (data instanceof ArrayBuffer) {
            return this._parseFromArrayBuffer(data);
        }
        if (ArrayBuffer.isView(data)) {
            const view = data as ArrayBufferView;
            const buffer = view.buffer.slice(
                view.byteOffset,
                view.byteOffset + view.byteLength
            ) as ArrayBuffer;
            return this._parseFromArrayBuffer(buffer);
        }
        if (typeof data === "string") {
            return parseAsciiFBX(data);
        }
        throw new Error("FBXFileLoader: unsupported data type");
    }

    private _parseFromArrayBuffer(buffer: ArrayBuffer): FBXDocument {
        // Check magic bytes to determine binary vs ASCII
        const headerBytes = new Uint8Array(buffer, 0, Math.min(21, buffer.byteLength));
        const header = String.fromCharCode(...headerBytes);

        if (header.startsWith(FBX_BINARY_MAGIC)) {
            return parseBinaryFBX(buffer);
        }

        // Try ASCII
        const text = new TextDecoder("utf-8").decode(buffer);
        if (text.trimStart().startsWith(FBX_ASCII_MAGIC)) {
            return parseAsciiFBX(text);
        }

        throw new Error("FBXFileLoader: unrecognized FBX format");
    }

    // ── Scene Building ─────────────────────────────────────────────────────

    private _buildScene(
        fbxScene: FBXSceneData,
        scene: Scene,
        rootUrl: string,
        meshesNames: string | readonly string[] | null | undefined
    ): ISceneLoaderAsyncResult {
        const nameFilter = this._buildNameFilter(meshesNames);

        // Create materials
        const materialCache = new Map<bigint, StandardMaterial>();
        for (const matData of fbxScene.materials) {
            const material = this._createMaterial(matData, scene, rootUrl);
            materialCache.set(matData.id, material);
        }

        // Create one Babylon skeleton per resolved deformation rig.
        const skeletons: Skeleton[] = [];
        const skeletonByRigId = new Map<string, Skeleton>();
        const skeletonByGeometryId = new Map<bigint, Skeleton>();
        const skinByGeometryId = new Map<bigint, FBXSkinData>();
        const skinBindingByGeometryId = new Map<bigint, FBXSkinBindingData>();
        const skinById = new Map<bigint, FBXSkinData>();

        for (const skin of fbxScene.skins) {
            skinById.set(skin.id, skin);
        }

        for (const rig of fbxScene.rigs) {
            const skeleton = this._createSkeleton(rig.id, rig.bones, scene);
            skeletons.push(skeleton);
            skeletonByRigId.set(rig.id, skeleton);

            for (const binding of rig.skinBindings) {
                const skin = skinById.get(binding.skinId);
                if (!skin) continue;

                skeletonByGeometryId.set(binding.geometryId, skeleton);
                skinByGeometryId.set(binding.geometryId, skin);
                skinBindingByGeometryId.set(binding.geometryId, binding);
            }

        }

        // Collect model data for animation sampling.
        const modelIdToData = new Map<bigint, FBXModelData>();
        const collectModelData = (models: FBXModelData[]) => {
            for (const m of models) {
                modelIdToData.set(m.id, m);
                collectModelData(m.children);
            }
        };
        collectModelData(fbxScene.rootModels);

        // Build model hierarchy under a root node that converts RH→LH.
        // This matches exactly what the glTF loader does with its __root__ node:
        // rotation.y = PI + scaling.z = -1
        const rootNode = new TransformNode("__fbx_root__", scene);
        rootNode.rotation.y = Math.PI;
        rootNode.scaling.z = -1;

        const meshes: Mesh[] = [];
        const transformNodes: TransformNode[] = [rootNode];
        const modelIdToNode = new Map<bigint, TransformNode>();
        const fbxWorldIdentity = Matrix.Identity();

        for (const model of fbxScene.rootModels) {
            this._buildModel(
                model,
                scene,
                rootNode,
                fbxWorldIdentity,
                materialCache,
                nameFilter,
                meshes,
                transformNodes,
                skeletonByGeometryId,
                skinByGeometryId,
                skinBindingByGeometryId,
                modelIdToNode
            );
        }

        // Link non-skinned child meshes/nodes to their parent bones so they
        // follow skeletal animation. Preserve their current world matrix when
        // switching from the FBX model hierarchy to Babylon's bone parent.
        for (const rig of fbxScene.rigs) {
            const skeleton = skeletonByRigId.get(rig.id);
            if (!skeleton) continue;

            const boneModelIds = new Set(rig.bones.map(b => b.modelId));
            const skinnedMesh = meshes.find(m => m.skeleton === skeleton) ?? null;
            const boneReferenceNode = skinnedMesh ?? rootNode;

            for (const boneData of rig.bones) {
                if (!boneData.isCluster) continue;

                const boneNode = modelIdToNode.get(boneData.modelId);
                const bone = skeleton.bones[boneData.index];
                if (!boneNode || !bone) continue;

                // Find direct children of this bone's TransformNode that aren't bones themselves
                for (const child of [...boneNode.getChildren()]) {
                    const childTransform = child as TransformNode;
                    // Check if this child is itself a bone — if so, skip it
                    let childIsBone = false;
                    for (const [modelId, node] of modelIdToNode) {
                        if (node === childTransform && boneModelIds.has(modelId)) {
                            childIsBone = true;
                            break;
                        }
                    }
                    if (!childIsBone) {
                        const childWorld = childTransform.computeWorldMatrix(true).clone();
                        const boneReferenceWorld = FBXFileLoader._getBoneReferenceWorldMatrix(
                            skeleton,
                            bone,
                            boneReferenceNode,
                            skinnedMesh
                        );
                        const boneReferenceWorldInv = new Matrix();
                        boneReferenceWorld.invertToRef(boneReferenceWorldInv);
                        const childLocalToBone = childWorld.multiply(boneReferenceWorldInv);

                        childTransform.parent = null;
                        childTransform.attachToBone(bone, boneReferenceNode);
                        FBXFileLoader._applyMatrixToTransform(childTransform, childLocalToBone);
                    }
                }
            }
        }

        // Apply blend shapes (morph targets) to meshes
        if (fbxScene.blendShapes.length > 0) {
            this._applyBlendShapes(fbxScene.blendShapes, meshes, scene, fbxScene.unitScaleFactor);
        }

        // Create animation groups
        const animationGroups: AnimationGroup[] = [];
        for (const animStack of fbxScene.animations) {
            const group = this._createAnimationGroup(animStack, fbxScene.rigs, skeletonByRigId, scene, modelIdToNode, modelIdToData, meshes);
            if (group) animationGroups.push(group);
        }

        // Create cameras
        const cameras: FreeCamera[] = [];
        for (const camData of fbxScene.cameras) {
            const cam = this._createCamera(camData, modelIdToNode, scene);
            if (cam) cameras.push(cam);
        }

        // Create lights
        const sceneLights: (PointLight | DirectionalLight | SpotLight)[] = [];
        for (const lightData of fbxScene.lights) {
            const light = this._createLight(lightData, modelIdToNode, scene);
            if (light) sceneLights.push(light);
        }

        return {
            meshes,
            particleSystems: [],
            skeletons,
            animationGroups,
            transformNodes,
            geometries: [],
            lights: sceneLights,
            spriteManagers: [],
        };
    }

    private _buildModel(
        model: FBXModelData,
        scene: Scene,
        parent: Nullable<TransformNode>,
        parentFBXWorldMatrix: Matrix,
        materialCache: Map<bigint, StandardMaterial>,
        nameFilter: ((name: string) => boolean) | null,
        meshes: Mesh[],
        transformNodes: TransformNode[],
        skeletonByGeometryId: Map<bigint, Skeleton>,
        skinByGeometryId: Map<bigint, FBXSkinData>,
        skinBindingByGeometryId: Map<bigint, FBXSkinBindingData>,
        modelIdToNode: Map<bigint, TransformNode>
    ): void {
        const localMatrix = FBXFileLoader._computeFBXModelLocalMatrix(model);
        const fbxWorldMatrix = localMatrix.multiply(parentFBXWorldMatrix);

        if (model.geometry && model.subType === "Mesh") {
            // Create mesh
            if (nameFilter && !nameFilter(model.name)) {
                return;
            }

            const skeleton = skeletonByGeometryId.get(model.geometry.id);
            const skin = skinByGeometryId.get(model.geometry.id);
            const skinBinding = skinBindingByGeometryId.get(model.geometry.id);

            if (skeleton && skin) {
                skeleton.needInitialSkinMatrix = true;
            }

            const mesh = this._createMesh(model, model.geometry, scene, skeleton, skin, skinBinding);

            // For skinned meshes: keep the mesh transform independent from the
            // scene/root conversion. Babylon applies the pose matrix in the same
            // space as the bone bind matrices.
            if (skeleton && skin) {
                FBXFileLoader._applyMatrixToTransform(mesh, fbxWorldMatrix);
                mesh.computeWorldMatrix(true);
                mesh.updatePoseMatrix(Matrix.Invert(mesh.getWorldMatrix()));
                mesh.alwaysSelectAsActiveMesh = true;
            } else {
                if (parent) {
                    mesh.parent = parent;
                }
                FBXFileLoader._applyFBXTransform(mesh, model);
            }

            // Apply material(s)
            if (model.materials.length > 1 && model.geometry?.materialIndices) {
                // Multi-material: create sub-meshes for each material
                this._applyMultiMaterial(mesh, model, materialCache, scene);
            } else if (model.materials.length > 0) {
                const mat = materialCache.get(model.materials[0].id);
                if (mat) {
                    if (model.cullingOff) {
                        mat.backFaceCulling = false;
                    }
                    mesh.material = mat;
                }
            }

            if (model.geometry?.colors) {
                this._useUnmodulatedVertexColorMaterials(mesh, scene);
            }
            this._applyMaterialUVSetCoordinates(mesh.material, model.geometry);

            meshes.push(mesh);
            modelIdToNode.set(model.id, mesh);

            // Apply custom properties as metadata
            if (model.customProperties) {
                mesh.metadata = { ...(mesh.metadata as object ?? {}), fbxCustomProperties: model.customProperties };
            }

            // Recurse children
            for (const child of model.children) {
                this._buildModel(child, scene, mesh, fbxWorldMatrix, materialCache, nameFilter, meshes, transformNodes, skeletonByGeometryId, skinByGeometryId, skinBindingByGeometryId, modelIdToNode);
            }
        } else {
            // Transform node (Null type or no geometry)
            const transformNode = new TransformNode(model.name, scene);
            if (parent) {
                transformNode.parent = parent;
            }

            // Apply full FBX transform chain
            FBXFileLoader._applyFBXTransform(transformNode, model);

            transformNodes.push(transformNode);
            modelIdToNode.set(model.id, transformNode);

            // Apply custom properties as metadata
            if (model.customProperties) {
                transformNode.metadata = { fbxCustomProperties: model.customProperties };
            }

            // Recurse children
            for (const child of model.children) {
                this._buildModel(child, scene, transformNode, fbxWorldMatrix, materialCache, nameFilter, meshes, transformNodes, skeletonByGeometryId, skinByGeometryId, skinBindingByGeometryId, modelIdToNode);
            }
        }
    }

    private _createMesh(
        model: FBXModelData,
        geomData: FBXGeometryData,
        scene: Scene,
        skeleton?: Skeleton,
        skin?: FBXSkinData,
        skinBinding?: FBXSkinBindingData
    ): Mesh {
        const mesh = new Mesh(model.name, scene);
        const vertexData = new VertexData();

        // Convert Float64Array to Float32Array for Babylon
        const positions = float64To32(geomData.positions);

        // Apply GeometricTranslation — affects only this mesh's geometry, not children
        const gt = model.geometricTranslation;
        if (gt[0] !== 0 || gt[1] !== 0 || gt[2] !== 0) {
            for (let i = 0; i < positions.length; i += 3) {
                positions[i] += gt[0];
                positions[i + 1] += gt[1];
                positions[i + 2] += gt[2];
            }
        }

        // Apply GeometricRotation if present
        const gr = model.geometricRotation;
        if (gr[0] !== 0 || gr[1] !== 0 || gr[2] !== 0) {
            const d2r = Math.PI / 180;
            const geoRotMatrix = FBXFileLoader._eulerToMatrixXYZ(gr[0] * d2r, gr[1] * d2r, gr[2] * d2r);
            for (let i = 0; i < positions.length; i += 3) {
                const v = Vector3.TransformCoordinates(
                    new Vector3(positions[i], positions[i + 1], positions[i + 2]),
                    geoRotMatrix
                );
                positions[i] = v.x;
                positions[i + 1] = v.y;
                positions[i + 2] = v.z;
            }
        }

        // Apply GeometricScaling if present
        const gs = model.geometricScaling;
        if (gs[0] !== 1 || gs[1] !== 1 || gs[2] !== 1) {
            for (let i = 0; i < positions.length; i += 3) {
                positions[i] *= gs[0];
                positions[i + 1] *= gs[1];
                positions[i + 2] *= gs[2];
            }
        }

        // For skinned meshes: do NOT bake mesh local transform into vertices.
        // Vertices remain in their original mesh-local space, keeping the mesh data
        // clean for retargeting. The mesh node carries its FBX transform as an
        // initial pose, while TransformLink bind matrices handle skinning.

        vertexData.positions = positions;
        vertexData.indices = Array.from(geomData.indices);

        if (geomData.normals) {
            const normals = float64To32(geomData.normals);
            // Apply geometric rotation to normals if present
            if (gr[0] !== 0 || gr[1] !== 0 || gr[2] !== 0) {
                const d2r = Math.PI / 180;
                const geoRotMatrix = FBXFileLoader._eulerToMatrixXYZ(gr[0] * d2r, gr[1] * d2r, gr[2] * d2r);
                for (let i = 0; i < normals.length; i += 3) {
                    const n = Vector3.TransformNormal(
                        new Vector3(normals[i], normals[i + 1], normals[i + 2]),
                        geoRotMatrix
                    );
                    normals[i] = n.x;
                    normals[i + 1] = n.y;
                    normals[i + 2] = n.z;
                }
            }
            vertexData.normals = normals;
        }

        if (geomData.uvs) {
            vertexData.uvs = float64To32(geomData.uvs);
        }
        if (geomData.uvSets.length > 1) {
            vertexData.uvs2 = float64To32(geomData.uvSets[1].data);
        }
        if (geomData.uvSets.length > 2) {
            vertexData.uvs3 = float64To32(geomData.uvSets[2].data);
        }
        if (geomData.uvSets.length > 3) {
            vertexData.uvs4 = float64To32(geomData.uvSets[3].data);
        }
        if (geomData.uvSets.length > 4) {
            vertexData.uvs5 = float64To32(geomData.uvSets[4].data);
        }
        if (geomData.uvSets.length > 5) {
            vertexData.uvs6 = float64To32(geomData.uvSets[5].data);
        }

        if (geomData.colors) {
            // Force alpha to 1.0 — FBX vertex color alpha is often unreliable
            // (e.g. zeroed out by exporters) and would cause transparency sorting issues.
            const colors = new Float32Array(geomData.colors.length);
            for (let i = 0; i < colors.length; i += 4) {
                colors[i] = geomData.colors[i];
                colors[i + 1] = geomData.colors[i + 1];
                colors[i + 2] = geomData.colors[i + 2];
                colors[i + 3] = 1.0;
            }
            vertexData.colors = colors;
            mesh.hasVertexAlpha = false;
        }

        // Apply bone weights if we have a skin
        if (skeleton && skin) {
            const { matricesIndices, matricesWeights } = this._buildSkinningData(
                geomData,
                skin,
                skinBinding
            );
            vertexData.matricesIndices = matricesIndices;
            vertexData.matricesWeights = matricesWeights;
        }

        vertexData.applyToMesh(mesh);

        // Store geometry metadata for blend shape matching
        mesh.metadata = {
            ...(mesh.metadata as object ?? {}),
            fbxGeometryId: geomData.id,
            fbxControlPointIndices: geomData.controlPointIndices,
            // Store geometric rotation for morph delta alignment (vertex-level only)
            fbxPreRotMatrix: (gr[0] !== 0 || gr[1] !== 0 || gr[2] !== 0)
                ? FBXFileLoader._eulerToMatrixXYZ(gr[0] * Math.PI / 180, gr[1] * Math.PI / 180, gr[2] * Math.PI / 180)
                : null,
        };

        if (skeleton) {
            mesh.skeleton = skeleton;
        }

        return mesh;
    }

    /**
     * Apply multi-material to a mesh by creating sub-meshes grouped by material index.
     * Reorders the index buffer so that triangles sharing the same material are contiguous.
     */
    private _applyMultiMaterial(
        mesh: Mesh,
        model: FBXModelData,
        materialCache: Map<bigint, StandardMaterial>,
        scene: Scene
    ): void {
        const matIndices = model.geometry!.materialIndices!;
        const indices = mesh.getIndices();
        if (!indices) return;

        const triCount = indices.length / 3;

        // Group triangles by material index
        const groups = new Map<number, number[]>(); // matIdx -> triangle indices
        for (let ti = 0; ti < triCount; ti++) {
            const matIdx = ti < matIndices.length ? matIndices[ti] : 0;
            let group = groups.get(matIdx);
            if (!group) {
                group = [];
                groups.set(matIdx, group);
            }
            group.push(ti);
        }

        // Sort group keys to ensure consistent ordering
        const sortedMatIndices = [...groups.keys()].sort((a, b) => a - b);

        // Reorder index buffer so triangles are grouped by material
        const newIndices: number[] = [];
        const subMeshRanges: { start: number; count: number; matIdx: number }[] = [];

        for (const matIdx of sortedMatIndices) {
            const tris = groups.get(matIdx)!;
            const start = newIndices.length;
            for (const ti of tris) {
                newIndices.push(indices[ti * 3], indices[ti * 3 + 1], indices[ti * 3 + 2]);
            }
            subMeshRanges.push({ start, count: tris.length * 3, matIdx });
        }

        // Update the mesh's index buffer
        mesh.setIndices(newIndices);

        // Create MultiMaterial
        const multiMat = new MultiMaterial(model.name + "_multi", scene);
        for (const range of subMeshRanges) {
            const fbxMat = model.materials[range.matIdx];
            if (fbxMat) {
                const mat = materialCache.get(fbxMat.id);
                if (mat) {
                    if (model.cullingOff) mat.backFaceCulling = false;
                    multiMat.subMaterials.push(mat);
                } else {
                    multiMat.subMaterials.push(null);
                }
            } else {
                multiMat.subMaterials.push(null);
            }
        }

        mesh.material = multiMat;

        // Clear existing sub-meshes and create new ones
        mesh.subMeshes = [];
        const vertexCount = mesh.getTotalVertices();
        for (let i = 0; i < subMeshRanges.length; i++) {
            const range = subMeshRanges[i];
            new SubMesh(i, 0, vertexCount, range.start, range.count, mesh);
        }
    }

    private _applyMaterialUVSetCoordinates(
        material: unknown,
        geometry: FBXGeometryData
    ): void {
        if (!material) return;
        if (material instanceof MultiMaterial) {
            for (const subMaterial of material.subMaterials) {
                if (subMaterial instanceof StandardMaterial) {
                    this._applyStandardMaterialUVSetCoordinates(subMaterial, geometry);
                }
            }
            return;
        }
        if (material instanceof StandardMaterial) {
            this._applyStandardMaterialUVSetCoordinates(material, geometry);
        }
    }

    private _applyStandardMaterialUVSetCoordinates(
        material: StandardMaterial,
        geometry: FBXGeometryData
    ): void {
        for (const texture of [
            material.diffuseTexture,
            material.bumpTexture,
            material.emissiveTexture,
            material.ambientTexture,
            material.specularTexture,
            material.opacityTexture,
            material.reflectionTexture,
        ]) {
            if (!texture) continue;

            const uvSetName = (texture.metadata as { fbxUVSetName?: string } | null | undefined)?.fbxUVSetName;
            if (!uvSetName) continue;

            const uvSetIndex = geometry.uvSets.findIndex((uvSet) => uvSet.name === uvSetName);
            if (uvSetIndex >= 0) {
                texture.coordinatesIndex = uvSetIndex;
            }
        }
    }

    /**
     * Babylon multiplies vertex colors by material diffuse color. Use per-mesh
     * material clones so vertex-colored geometry can render unmodulated without
     * changing shared materials used by non-vertex-colored meshes.
     */
    private _useUnmodulatedVertexColorMaterials(mesh: Mesh, scene: Scene): void {
        const assignedMat = mesh.material;
        if (!assignedMat) return;

        if (assignedMat instanceof StandardMaterial) {
            if (!assignedMat.diffuseTexture) {
                const clone = assignedMat.clone(`${assignedMat.name}_VertexColor`);
                clone.diffuseColor = new Color3(1, 1, 1);
                mesh.material = clone;
            }
            return;
        }

        if (assignedMat instanceof MultiMaterial) {
            const multiMat = new MultiMaterial(`${assignedMat.name}_VertexColor`, scene);
            multiMat.subMaterials = assignedMat.subMaterials.map((sub) => {
                if (sub instanceof StandardMaterial && !sub.diffuseTexture) {
                    const clone = sub.clone(`${sub.name}_VertexColor`);
                    clone.diffuseColor = new Color3(1, 1, 1);
                    return clone;
                }
                return sub;
            });
            mesh.material = multiMat;
        }
    }

    /**
     * Build per-polygon-vertex bone indices and weights from the control-point-based skin data.
     * The geometry expands control points to per-polygon-vertex, so we need to look up
     * each polygon-vertex's control point index.
     */
    private _buildSkinningData(
        geomData: FBXGeometryData,
        skin: FBXSkinData,
        skinBinding?: FBXSkinBindingData
    ): { matricesIndices: Float32Array; matricesWeights: Float32Array } {
        // The positions array is per-polygon-vertex (already expanded).
        // We need to figure out the control point index for each polygon vertex.
        // The geometry stores positions per polygon-vertex, so geomData.positions.length/3
        // = number of polygon vertices. We stored control point indices during expansion,
        // but they aren't exported. Instead, we can use the fact that skin data is indexed
        // by control point, and the geometry's _controlPointIndices stores this mapping.
        //
        // Since we don't have direct access to the control point mapping from FBXGeometryData,
        // we'll use the vertex positions to build the skinning buffer. But actually,
        // we should extend geometry to export control point indices per polygon-vertex.
        //
        // For now, use the approach of matching positions to control points.
        // Actually, let's look at this differently - the indices/weights in the skin
        // are per control point. The geometry already expanded to per polygon-vertex
        // with positions copied from control points. We need to know which control point
        // each polygon-vertex came from.
        //
        // We'll use geomData.controlPointIndices if available.
        const vertexCount = geomData.positions.length / 3;
        const matricesIndices = new Float32Array(vertexCount * 4);
        const matricesWeights = new Float32Array(vertexCount * 4);

        if (geomData.controlPointIndices) {
            for (let i = 0; i < vertexCount; i++) {
                const cpIdx = geomData.controlPointIndices[i];
                const boneIdx = skin.boneIndices[cpIdx] ?? [];
                const boneWts = skin.boneWeights[cpIdx] ?? [];

                for (let j = 0; j < 4; j++) {
                    if (j < boneIdx.length) {
                        const skinBoneIndex = boneIdx[j];
                        const rigBoneIndex = skinBinding
                            ? skinBinding.skinBoneIndexToRigBoneIndex[skinBoneIndex]
                            : skinBoneIndex;
                        if (rigBoneIndex === undefined || rigBoneIndex < 0) {
                            throw new Error(`FBXFileLoader: missing rig bone mapping for skin bone index ${skinBoneIndex}`);
                        }
                        matricesIndices[i * 4 + j] = rigBoneIndex;
                    } else {
                        matricesIndices[i * 4 + j] = 0;
                    }
                    matricesWeights[i * 4 + j] = j < boneWts.length ? boneWts[j] : 0;
                }
            }
        }

        return { matricesIndices, matricesWeights };
    }

    private _createMaterial(
        matData: FBXMaterialData,
        scene: Scene,
        rootUrl: string
    ): StandardMaterial {
        const material = new StandardMaterial(matData.name, scene);

        const props = matData.properties;

        if (props.diffuseColor) {
            material.diffuseColor = new Color3(
                props.diffuseColor[0],
                props.diffuseColor[1],
                props.diffuseColor[2]
            );
        }

        if (props.ambientColor) {
            material.ambientColor = new Color3(
                props.ambientColor[0],
                props.ambientColor[1],
                props.ambientColor[2]
            );
        }

        if (props.specularColor) {
            material.specularColor = new Color3(
                props.specularColor[0],
                props.specularColor[1],
                props.specularColor[2]
            );
        }

        if (props.emissiveColor) {
            material.emissiveColor = new Color3(
                props.emissiveColor[0],
                props.emissiveColor[1],
                props.emissiveColor[2]
            );
        }

        if (props.opacity !== undefined) {
            material.alpha = props.opacity;
        }

        if (props.shininess !== undefined) {
            material.specularPower = props.shininess;
        }

        // Apply textures
        for (const tex of matData.textures) {
            // Use embedded texture data if available, otherwise load from URL
            let texture: Texture;
            if (tex.embeddedData) {
                // Create texture from embedded binary data via blob URL
                const mimeType = FBXFileLoader._guessMimeType(tex.fileName || tex.relativeFileName);
                const embeddedData = new Uint8Array(tex.embeddedData);
                const blob = new Blob([embeddedData], { type: mimeType });
                const blobUrl = URL.createObjectURL(blob);
                texture = new Texture(blobUrl, scene);
            } else {
                // Try relativeFileName first, falling back to just the basename
                let texturePath: string;
                if (tex.relativeFileName) {
                    const normalized = tex.relativeFileName.replace(/\\/g, "/");
                    const basename = normalized.split("/").pop() ?? normalized;
                    texturePath = rootUrl + basename;
                } else if (tex.fileName) {
                    const basename = tex.fileName.replace(/\\/g, "/").split("/").pop() ?? tex.fileName;
                    texturePath = rootUrl + basename;
                } else {
                    continue;
                }
                texture = new Texture(texturePath, scene);
            }

            switch (tex.propertyName) {
                case "DiffuseColor":
                    material.diffuseTexture = texture;
                    // In FBX, a connected diffuse texture provides the color.
                    // Set diffuseColor to white so the texture isn't darkened by
                    // the material's base color (many FBX exports set it near-black).
                    material.diffuseColor = new Color3(1, 1, 1);
                    break;
                case "NormalMap":
                case "Bump":
                    material.bumpTexture = texture;
                    break;
                case "EmissiveColor":
                    material.emissiveTexture = texture;
                    break;
                case "AmbientColor":
                    material.ambientTexture = texture;
                    break;
                case "SpecularColor":
                    material.specularTexture = texture;
                    break;
                case "TransparencyFactor":
                case "TransparentColor":
                    material.opacityTexture = texture;
                    break;
                case "ReflectionColor":
                case "ReflectionFactor":
                    material.reflectionTexture = texture;
                    break;
                case "DisplacementColor":
                case "Displacement":
                    // StandardMaterial doesn't have a displacement slot natively;
                    // store for potential PBR conversion use
                    break;
                case "ShininessExponent":
                    // Shininess map — no direct StandardMaterial slot
                    break;
            }

            // Apply UV transforms
            if (tex.uvTranslation) {
                texture.uOffset = tex.uvTranslation[0];
                texture.vOffset = tex.uvTranslation[1];
            }
            if (tex.uvScaling) {
                texture.uScale = tex.uvScaling[0];
                texture.vScale = tex.uvScaling[1];
            }
            if (tex.uvRotation !== undefined) {
                texture.wAng = tex.uvRotation * (Math.PI / 180);
            }
            if (tex.uvSetIndex !== undefined) {
                texture.coordinatesIndex = tex.uvSetIndex;
            }
            if (tex.uvSetName) {
                texture.metadata = {
                    ...(texture.metadata as object ?? {}),
                    fbxUVSetName: tex.uvSetName,
                };
            }
        }

        return material;
    }

    /** Guess MIME type from file extension */
    private static _guessMimeType(fileName: string): string {
        const ext = fileName.toLowerCase().split(".").pop() ?? "";
        switch (ext) {
            case "png": return "image/png";
            case "jpg": case "jpeg": return "image/jpeg";
            case "tga": return "image/x-tga";
            case "bmp": return "image/bmp";
            case "gif": return "image/gif";
            case "webp": return "image/webp";
            default: return "image/png";
        }
    }

    /**
     * Apply blend shape (morph target) deformers to meshes.
     * FBX Shape vertices are stored as absolute positions for sparse control points.
     * We compute deltas relative to the base mesh positions.
     */
    private _applyBlendShapes(
        blendShapes: FBXBlendShapeData[],
        meshes: Mesh[],
        scene: Scene,
        unitScaleFactor: number
    ): void {
        // Build a map from geometry ID to mesh (using the mesh metadata we'll need to store)
        // The mesh's geometry ID is tracked through the model hierarchy during _buildModel.
        // We need to match blendShape.geometryId to the correct mesh.
        // Strategy: match by examining which meshes have positions matching the geometry.

        for (const bs of blendShapes) {
            // Find the mesh that uses this geometry
            const mesh = meshes.find(m => {
                const geomId = (m.metadata as { fbxGeometryId?: bigint } | undefined)?.fbxGeometryId;
                return geomId === bs.geometryId;
            });
            if (!mesh) continue;

            const morphTargetManager = new MorphTargetManager(scene);
            morphTargetManager.optimizeInfluencers = false;
            // Get preRotation matrix if the mesh had its positions baked
            const preRotMatrix = (mesh.metadata as { fbxPreRotMatrix?: Matrix | null } | undefined)?.fbxPreRotMatrix ?? null;

            for (const channel of bs.channels) {
                // Use the first shape (in-between shapes not yet supported)
                const shape = channel.shapes[0];
                if (!shape) continue;

                // Get the control point indices for this mesh (stored as metadata)
                const cpIndices = (mesh.metadata as { fbxControlPointIndices?: Uint32Array } | undefined)?.fbxControlPointIndices;
                if (!cpIndices) continue;

                const basePositions = mesh.getVerticesData("position");
                const baseNormals = mesh.getVerticesData("normal");
                if (!basePositions) continue;

                const vertexCount = basePositions.length / 3;

                // Babylon MorphTarget.setPositions expects ABSOLUTE target positions.
                // FBX shape vertices are deltas, so we add them to the base.
                const targetPositions = new Float32Array(vertexCount * 3);
                const hasNormals = shape.normals !== null && baseNormals !== null;
                const targetNormals = hasNormals ? new Float32Array(vertexCount * 3) : null;

                // Copy base positions (unaffected vertices stay at base)
                for (let i = 0; i < targetPositions.length; i++) {
                    targetPositions[i] = basePositions[i];
                }
                if (targetNormals && baseNormals) {
                    for (let i = 0; i < targetNormals.length; i++) {
                        targetNormals[i] = baseNormals[i];
                    }
                }

                // Build a lookup from control point index to shape data index
                const cpToShapeIdx = new Map<number, number>();
                for (let i = 0; i < shape.indices.length; i++) {
                    cpToShapeIdx.set(shape.indices[i], i);
                }

                for (let vi = 0; vi < vertexCount; vi++) {
                    const cpIdx = cpIndices[vi];
                    const shapeIdx = cpToShapeIdx.get(cpIdx);
                    if (shapeIdx === undefined) continue;

                    // Get the raw FBX delta
                    let dx = shape.vertices[shapeIdx * 3];
                    let dy = shape.vertices[shapeIdx * 3 + 1];
                    let dz = shape.vertices[shapeIdx * 3 + 2];

                    // Rotate delta by the same preRotation applied to base positions
                    if (preRotMatrix) {
                        const rv = Vector3.TransformNormal(new Vector3(dx, dy, dz), preRotMatrix);
                        dx = rv.x; dy = rv.y; dz = rv.z;
                    }

                    // Scale delta by UnitScaleFactor — base mesh positions are in scaled space
                    // but shape deltas are stored in the original unscaled space
                    if (unitScaleFactor !== 1) {
                        dx *= unitScaleFactor;
                        dy *= unitScaleFactor;
                        dz *= unitScaleFactor;
                    }

                    targetPositions[vi * 3] += dx;
                    targetPositions[vi * 3 + 1] += dy;
                    targetPositions[vi * 3 + 2] += dz;

                    if (targetNormals && shape.normals) {
                        let nx = shape.normals[shapeIdx * 3];
                        let ny = shape.normals[shapeIdx * 3 + 1];
                        let nz = shape.normals[shapeIdx * 3 + 2];
                        if (preRotMatrix) {
                            const rn = Vector3.TransformNormal(new Vector3(nx, ny, nz), preRotMatrix);
                            nx = rn.x; ny = rn.y; nz = rn.z;
                        }
                        targetNormals[vi * 3] += nx;
                        targetNormals[vi * 3 + 1] += ny;
                        targetNormals[vi * 3 + 2] += nz;
                    }
                }

                const morphTarget = new MorphTarget(channel.name, channel.deformPercent / 100, scene);
                morphTarget.setPositions(targetPositions);
                if (targetNormals) {
                    morphTarget.setNormals(targetNormals);
                }
                // Store channel ID mapping on the mesh for animation targeting
                if (!mesh.metadata) mesh.metadata = {};
                if (!(mesh.metadata as Record<string, unknown>).fbxBlendShapeChannelIds) {
                    (mesh.metadata as Record<string, unknown>).fbxBlendShapeChannelIds = new Map<bigint, number>();
                }
                ((mesh.metadata as Record<string, unknown>).fbxBlendShapeChannelIds as Map<bigint, number>).set(channel.id, morphTargetManager.numTargets);

                morphTargetManager.addTarget(morphTarget);
            }

            if (morphTargetManager.numTargets > 0) {
                morphTargetManager.numMaxInfluencers = morphTargetManager.numTargets;
                mesh.morphTargetManager = morphTargetManager;
            }
        }
    }

    private _createCamera(
        camData: FBXCameraData,
        modelIdToNode: Map<bigint, TransformNode>,
        scene: Scene
    ): FreeCamera | null {
        const parentNode = modelIdToNode.get(camData.modelId);
        const position = parentNode ? parentNode.position.clone() : Vector3.Zero();

        const camera = new FreeCamera(camData.name, position, scene);
        camera.fov = camData.fieldOfView * (Math.PI / 180);
        camera.minZ = camData.nearPlane;
        camera.maxZ = camData.farPlane;

        if (parentNode) {
            camera.parent = parentNode;
        }

        return camera;
    }

    private _createLight(
        lightData: FBXLightData,
        modelIdToNode: Map<bigint, TransformNode>,
        scene: Scene
    ): PointLight | DirectionalLight | SpotLight | null {
        const parentNode = modelIdToNode.get(lightData.modelId);
        const position = parentNode ? parentNode.position.clone() : Vector3.Zero();
        const color = new Color3(lightData.color[0], lightData.color[1], lightData.color[2]);

        let light: PointLight | DirectionalLight | SpotLight;

        switch (lightData.lightType) {
            case 1: // Directional
                light = new DirectionalLight(lightData.name, new Vector3(0, -1, 0), scene);
                light.diffuse = color;
                light.intensity = lightData.intensity;
                break;
            case 2: { // Spot
                const angle = lightData.coneAngle * (Math.PI / 180);
                light = new SpotLight(lightData.name, position, new Vector3(0, -1, 0), angle, 2, scene);
                light.diffuse = color;
                light.intensity = lightData.intensity;
                break;
            }
            default: // Point (0)
                light = new PointLight(lightData.name, position, scene);
                light.diffuse = color;
                light.intensity = lightData.intensity;
                break;
        }

        if (parentNode) {
            light.parent = parentNode;
        }

        return light;
    }

    private _createSkeleton(skeletonId: string, bones: FBXBoneData[], scene: Scene): Skeleton {
        const skeleton = new Skeleton("Skeleton", `skeleton_${skeletonId}`, scene);
        const babylonBones: Bone[] = [];
        const restLocalMatrices: Matrix[] = [];
        const restAbsoluteMatrices: Matrix[] = [];

        // Phase 1: Create bones with localMatrix = computedLcl (the bone's rest pose
        // from Lcl properties). This is what animation curves naturally target.
        for (let i = 0; i < bones.length; i++) {
            const boneData = bones[i];
            const parentBone = boneData.parentIndex >= 0 ? babylonBones[boneData.parentIndex] : null;

            const computedLcl = FBXFileLoader._computeFBXLocalMatrix(
                boneData.translation,
                boneData.rotation,
                boneData.scale,
                boneData.preRotation,
                boneData.postRotation,
                boneData.rotationPivot,
                boneData.scalingPivot,
                boneData.rotationOffset,
                boneData.scalingOffset,
                boneData.rotationOrder
            );
            restLocalMatrices[i] = computedLcl;
            restAbsoluteMatrices[i] = parentBone
                ? computedLcl.multiply(restAbsoluteMatrices[boneData.parentIndex])
                : computedLcl;

            const bone = new Bone(
                boneData.name,
                skeleton,
                parentBone,
                computedLcl,   // localMatrix = rest pose (what animation drives)
                null,          // restMatrix
                null,          // bindMatrix (set in phase 2)
                i              // index
            );
            babylonBones.push(bone);
        }

        const absoluteBindMatrices = bones.map((boneData, index) =>
            boneData.transformLinkMatrix
                ? Matrix.FromArray(boneData.transformLinkMatrix)
                : boneData.modelBindPoseMatrix
                    ? Matrix.FromArray(boneData.modelBindPoseMatrix)
                : restAbsoluteMatrices[index]
        );

        // Phase 2: Set bind/rest matrices from FBX TransformLink. Maya-style
        // files may omit some cluster bind entries, but still carry per-model
        // BindPose matrices for helper/container bones.
        for (let i = 0; i < bones.length; i++) {
            const bone = babylonBones[i];
            const absoluteBind = absoluteBindMatrices[i];

            // Derive localBind = absoluteBind × inv(parentAbsoluteBind)
            const parentBone = bone.getParent();
            let localBind: Matrix;
            if (parentBone) {
                const parentAbsoluteBindInv = parentBone.getAbsoluteInverseBindMatrix();
                localBind = absoluteBind.multiply(parentAbsoluteBindInv);
            } else {
                localBind = absoluteBind;
            }

            bone.updateMatrix(localBind, false, false);
            bone._updateAbsoluteBindMatrices(undefined, false);
        }

        return skeleton;
    }

    /**
     * Build a rotation matrix from Euler angles in FBX's XYZ intrinsic order.
     * In row-vector convention: v' = v * Rx * Ry * Rz
     */
    private static _eulerToMatrixXYZ(rx: number, ry: number, rz: number): Matrix {
        const mx = Matrix.RotationX(rx);
        const my = Matrix.RotationY(ry);
        const mz = Matrix.RotationZ(rz);
        return mx.multiply(my).multiply(mz);
    }

    /**
     * Build a rotation matrix from Euler angles using the specified rotation order.
     * FBX rotation orders: 0=XYZ, 1=XZY, 2=YZX, 3=YXZ, 4=ZXY, 5=ZYX
     * In row-vector convention: v' = v * R1 * R2 * R3
     */
    private static _eulerToMatrix(rx: number, ry: number, rz: number, order: number): Matrix {
        const mx = Matrix.RotationX(rx);
        const my = Matrix.RotationY(ry);
        const mz = Matrix.RotationZ(rz);
        switch (order) {
            case 0: return mx.multiply(my).multiply(mz); // XYZ
            case 1: return mx.multiply(mz).multiply(my); // XZY
            case 2: return my.multiply(mz).multiply(mx); // YZX
            case 3: return my.multiply(mx).multiply(mz); // YXZ
            case 4: return mz.multiply(mx).multiply(my); // ZXY
            case 5: return mz.multiply(my).multiply(mx); // ZYX
            default: return mx.multiply(my).multiply(mz); // fallback to XYZ
        }
    }

    /**
     * Compute the full FBX local transform matrix:
     * M = T * Roff * Rp * Rpre * R * Rpost^-1 * Rp^-1 * Soff * Sp * S * Sp^-1
     *
     * In row-vector convention: v' = v * M
     */
    private static _computeFBXLocalMatrix(
        translation: [number, number, number],
        rotation: [number, number, number],
        scale: [number, number, number],
        preRotation: [number, number, number],
        postRotation: [number, number, number],
        rotationPivot: [number, number, number],
        scalingPivot: [number, number, number],
        rotationOffset: [number, number, number],
        scalingOffset: [number, number, number],
        rotationOrder: number = 0
    ): Matrix {
        const d2r = Math.PI / 180;

        // Check if we can use the simplified path (no pivots/offsets/postRotation)
        const hasPivots =
            rotationPivot[0] !== 0 || rotationPivot[1] !== 0 || rotationPivot[2] !== 0 ||
            scalingPivot[0] !== 0 || scalingPivot[1] !== 0 || scalingPivot[2] !== 0;
        const hasOffsets =
            rotationOffset[0] !== 0 || rotationOffset[1] !== 0 || rotationOffset[2] !== 0 ||
            scalingOffset[0] !== 0 || scalingOffset[1] !== 0 || scalingOffset[2] !== 0;
        const hasPostRot =
            postRotation[0] !== 0 || postRotation[1] !== 0 || postRotation[2] !== 0;

        if (!hasPivots && !hasOffsets && !hasPostRot) {
            // Simple path: T * Rpre * R * S
            // Note: PreRotation always uses XYZ order per FBX spec
            const preRotM = FBXFileLoader._eulerToMatrixXYZ(
                preRotation[0] * d2r, preRotation[1] * d2r, preRotation[2] * d2r
            );
            const lclRotM = FBXFileLoader._eulerToMatrix(
                rotation[0] * d2r, rotation[1] * d2r, rotation[2] * d2r, rotationOrder
            );
            const translationM = Matrix.Translation(translation[0], translation[1], translation[2]);
            const rotationM = lclRotM.multiply(preRotM);
            const scaleM = Matrix.Scaling(scale[0], scale[1], scale[2]);
            return scaleM.multiply(rotationM).multiply(translationM);
        }

        // Full FBX transform chain:
        // M = T * Roff * Rp * Rpre * R * Rpost^-1 * Rp^-1 * Soff * Sp * S * Sp^-1
        const T = Matrix.Translation(translation[0], translation[1], translation[2]);
        const Roff = Matrix.Translation(rotationOffset[0], rotationOffset[1], rotationOffset[2]);
        const Rp = Matrix.Translation(rotationPivot[0], rotationPivot[1], rotationPivot[2]);
        const RpInv = Matrix.Translation(-rotationPivot[0], -rotationPivot[1], -rotationPivot[2]);
        const Soff = Matrix.Translation(scalingOffset[0], scalingOffset[1], scalingOffset[2]);
        const Sp = Matrix.Translation(scalingPivot[0], scalingPivot[1], scalingPivot[2]);
        const SpInv = Matrix.Translation(-scalingPivot[0], -scalingPivot[1], -scalingPivot[2]);

        // PreRotation and PostRotation always use XYZ per FBX spec
        const Rpre = FBXFileLoader._eulerToMatrixXYZ(
            preRotation[0] * d2r, preRotation[1] * d2r, preRotation[2] * d2r
        );
        // Lcl Rotation uses the node's RotationOrder
        const R = FBXFileLoader._eulerToMatrix(
            rotation[0] * d2r, rotation[1] * d2r, rotation[2] * d2r, rotationOrder
        );
        const S = Matrix.Scaling(scale[0], scale[1], scale[2]);

        // PostRotation is inverted in the chain
        let RpostInv: Matrix;
        if (hasPostRot) {
            const Rpost = FBXFileLoader._eulerToMatrixXYZ(
                postRotation[0] * d2r, postRotation[1] * d2r, postRotation[2] * d2r
            );
            RpostInv = new Matrix();
            Rpost.invertToRef(RpostInv);
        } else {
            RpostInv = Matrix.Identity();
        }

        // Row-vector convention: v' = v * S * Sp^-1 * Soff * Rp^-1 * Rpost^-1 * R * Rpre * Rp * Roff * T
        // Which reverses to: M = T * Roff * Rp * Rpre * R * Rpost^-1 * Rp^-1 * Soff * Sp * S * Sp^-1
        // In multiply order (rightmost applied first to row vector):
        // result = SpInv * S * Sp * Soff * RpInv * RpostInv * R * Rpre * Rp * Roff * T
        let result = SpInv;
        result = result.multiply(S);
        result = result.multiply(Sp);
        result = result.multiply(Soff);
        result = result.multiply(RpInv);
        result = result.multiply(RpostInv);
        result = result.multiply(R);
        result = result.multiply(Rpre);
        result = result.multiply(Rp);
        result = result.multiply(Roff);
        result = result.multiply(T);

        return result;
    }

    /**
     * Apply the FBX transform chain to a Babylon TransformNode or Mesh.
     * Decomposes the full local matrix into position/rotation/scale.
     */
    private static _applyFBXTransform(
        node: TransformNode | Mesh,
        model: FBXModelData
    ): void {
        const localMatrix = FBXFileLoader._computeFBXModelLocalMatrix(model);

        // Decompose into TRS
        const s = new Vector3();
        const r = new Quaternion();
        const t = new Vector3();
        localMatrix.decompose(s, r, t);

        node.position = t;
        node.rotationQuaternion = r;
        node.scaling = s;
    }

    private static _computeFBXModelLocalMatrix(model: FBXModelData): Matrix {
        return FBXFileLoader._computeFBXLocalMatrix(
            model.translation,
            model.rotation,
            model.scale,
            model.preRotation,
            model.postRotation,
            model.rotationPivot,
            model.scalingPivot,
            model.rotationOffset,
            model.scalingOffset,
            model.rotationOrder
        );
    }

    private static _getBoneReferenceWorldMatrix(
        skeleton: Skeleton,
        bone: Bone,
        referenceNode: TransformNode,
        skinnedMesh: Mesh | null
    ): Matrix {
        if (skinnedMesh) {
            skeleton.getTransformMatrices(skinnedMesh);
        } else {
            skeleton.prepare(true);
        }
        referenceNode.computeWorldMatrix(true);
        return bone.getFinalMatrix().multiply(referenceNode.getWorldMatrix());
    }

    private static _applyMatrixToTransform(node: TransformNode, matrix: Matrix): void {
        const s = new Vector3();
        const r = new Quaternion();
        const t = new Vector3();
        matrix.decompose(s, r, t);

        node.position = t;
        node.rotationQuaternion = r;
        node.scaling = s;
    }

    private _createAnimationGroup(
        animStack: FBXAnimationStackData,
        rigs: FBXRigData[],
        skeletonByRigId: Map<string, Skeleton>,
        scene: Scene,
        modelIdToNode: Map<bigint, TransformNode>,
        modelIdToData: Map<bigint, FBXModelData>,
        meshes: Mesh[]
    ): AnimationGroup | null {
        if (animStack.curveNodes.length === 0) return null;

        const animGroup = new AnimationGroup(animStack.name, scene);

        // Build a map from model ID to resolved rig bones. A single FBX model ID
        // should only appear once per resolved rig, but keeping an array preserves
        // the previous animation fan-out behavior for any future duplicate rigs.
        const modelIdToBones = new Map<bigint, Bone[]>();
        for (const rig of rigs) {
            const skeleton = skeletonByRigId.get(rig.id);
            if (!skeleton) continue;

            for (const boneData of rig.bones) {
                const bone = skeleton.bones[boneData.index];
                if (!bone) continue;

                const bones = modelIdToBones.get(boneData.modelId);
                if (bones) {
                    bones.push(bone);
                } else {
                    modelIdToBones.set(boneData.modelId, [bone]);
                }
            }
        }

        // Group curve nodes by target
        const boneCurves = new Map<bigint, FBXCurveNodeData[]>();
        const nonBoneCurves = new Map<bigint, FBXCurveNodeData[]>();
        const blendShapeCurves: FBXCurveNodeData[] = [];

        for (const curveNode of animStack.curveNodes) {
            if (curveNode.type === "DeformPercent") {
                blendShapeCurves.push(curveNode);
                continue;
            }

            if (modelIdToBones.has(curveNode.targetModelId)) {
                if (!boneCurves.has(curveNode.targetModelId)) {
                    boneCurves.set(curveNode.targetModelId, []);
                }
                boneCurves.get(curveNode.targetModelId)!.push(curveNode);
            } else {
                if (!nonBoneCurves.has(curveNode.targetModelId)) {
                    nonBoneCurves.set(curveNode.targetModelId, []);
                }
                nonBoneCurves.get(curveNode.targetModelId)!.push(curveNode);
            }
        }

        // Process bone targets: compute full FBX local matrix per frame, decompose to TRS.
        // Bind matrices handle skinning offsets; animation curves drive local bone transforms.
        for (const [targetId, curveNodes] of boneCurves) {
            const bones = modelIdToBones.get(targetId);
            const modelData = modelIdToData.get(targetId);
            if (!bones || bones.length === 0 || !modelData) continue;

            const animations = this._buildBoneAnimations(
                curveNodes,
                bones[0].name,
                modelData,
                animStack.startTime,
                animStack.stopTime
            );
            for (const bone of bones) {
                for (const animation of animations) {
                    animGroup.addTargetedAnimation(animation.clone(), bone);
                }
            }
        }

        // Process non-bone targets: bake full transform matrix per frame
        for (const [targetId, curveNodes] of nonBoneCurves) {
            const node = modelIdToNode.get(targetId);
            if (!node) continue;

            const modelData = modelIdToData.get(targetId);
            if (!modelData) continue;

            const animations = this._buildNodeAnimations(
                curveNodes,
                node.name,
                modelData,
                animStack.startTime,
                animStack.stopTime
            );
            for (const animation of animations) {
                animGroup.addTargetedAnimation(animation, node);
            }
        }

        // Process blend shape (morph target) animations
        for (const curveNode of blendShapeCurves) {
            const targetChannelId = curveNode.targetModelId;

            // Find the morph target with matching channel ID across all meshes
            let targetFound = false;
            for (const mesh of meshes) {
                if (!mesh.morphTargetManager || targetFound) continue;
                const channelMap = (mesh.metadata as Record<string, unknown> | undefined)?.fbxBlendShapeChannelIds as Map<bigint, number> | undefined;
                if (!channelMap) continue;
                const targetIndex = channelMap.get(targetChannelId);
                if (targetIndex === undefined) continue;

                const target = mesh.morphTargetManager.getTarget(targetIndex);
                if (target && curveNode.curves.length > 0) {
                    const fps = 30;
                    const anim = new Animation(
                        `${target.name}_influence`, "influence", fps,
                        Animation.ANIMATIONTYPE_FLOAT, Animation.ANIMATIONLOOPMODE_CYCLE
                    );
                    const keys = buildScalarAnimationKeys(
                        curveNode.curves[0],
                        fps,
                        animStack.startTime,
                        animStack.stopTime,
                        (value) => value / 100 // FBX uses 0-100, Babylon uses 0-1
                    );
                    anim.setKeys(keys);
                    animGroup.addTargetedAnimation(anim, target);
                    targetFound = true;
                }
            }
        }

        // Normalize the animation group
        if (animGroup.targetedAnimations.length > 0) {
            animGroup.normalize(animStack.startTime * 30, animStack.stopTime * 30);
            return animGroup;
        }

        animGroup.dispose();
        return null;
    }

    /**
     * Build animations for a non-bone node, correctly handling pivots.
     * Computes the full FBX transform matrix at each keyframe and decomposes into TRS.
     */
    private _buildNodeAnimations(
        curveNodes: FBXCurveNodeData[],
        nodeName: string,
        modelData: FBXModelData,
        startTime: number,
        stopTime: number
    ): Animation[] {
        const fps = 30;

        // Separate curves by type
        const tNode = curveNodes.find(cn => cn.type === "T");
        const rNode = curveNodes.find(cn => cn.type === "R");
        const sNode = curveNodes.find(cn => cn.type === "S");

        const times = collectAnimationSampleTimes(curveNodes, fps, startTime, stopTime);
        if (times.length === 0) return [];

        // Get curve accessors
        const txCurve = tNode?.curves.find(c => c.channel === "d|X");
        const tyCurve = tNode?.curves.find(c => c.channel === "d|Y");
        const tzCurve = tNode?.curves.find(c => c.channel === "d|Z");
        const rxCurve = rNode?.curves.find(c => c.channel === "d|X");
        const ryCurve = rNode?.curves.find(c => c.channel === "d|Y");
        const rzCurve = rNode?.curves.find(c => c.channel === "d|Z");
        const sxCurve = sNode?.curves.find(c => c.channel === "d|X");
        const syCurve = sNode?.curves.find(c => c.channel === "d|Y");
        const szCurve = sNode?.curves.find(c => c.channel === "d|Z");

        // Build keyframes by computing the full matrix at each time
        const posKeys: { frame: number; value: Vector3 }[] = [];
        const rotKeys: { frame: number; value: Quaternion }[] = [];
        const sclKeys: { frame: number; value: Vector3 }[] = [];
        let prevQuat: Quaternion | null = null;

        for (const time of times) {
            const frame = time * fps;

            // Sample animated values, falling back to model's base values
            const tx = sampleFBXCurveAtTime(txCurve, time) ?? modelData.translation[0];
            const ty = sampleFBXCurveAtTime(tyCurve, time) ?? modelData.translation[1];
            const tz = sampleFBXCurveAtTime(tzCurve, time) ?? modelData.translation[2];
            const rx = sampleFBXCurveAtTime(rxCurve, time) ?? modelData.rotation[0];
            const ry = sampleFBXCurveAtTime(ryCurve, time) ?? modelData.rotation[1];
            const rz = sampleFBXCurveAtTime(rzCurve, time) ?? modelData.rotation[2];
            const sx = sampleFBXCurveAtTime(sxCurve, time) ?? modelData.scale[0];
            const sy = sampleFBXCurveAtTime(syCurve, time) ?? modelData.scale[1];
            const sz = sampleFBXCurveAtTime(szCurve, time) ?? modelData.scale[2];

            // Compute the full FBX local transform matrix with pivots
            const localMatrix = FBXFileLoader._computeFBXLocalMatrix(
                [tx, ty, tz],
                [rx, ry, rz],
                [sx, sy, sz],
                modelData.preRotation,
                modelData.postRotation,
                modelData.rotationPivot,
                modelData.scalingPivot,
                modelData.rotationOffset,
                modelData.scalingOffset,
                modelData.rotationOrder
            );

            // Decompose into TRS
            const s = new Vector3();
            const r = new Quaternion();
            const t = new Vector3();
            localMatrix.decompose(s, r, t);

            // Ensure quaternion continuity
            if (prevQuat && Quaternion.Dot(prevQuat, r) < 0) {
                r.scaleInPlace(-1);
            }
            prevQuat = r;

            posKeys.push({ frame, value: t });
            rotKeys.push({ frame, value: r });
            sclKeys.push({ frame, value: s });
        }

        const animations: Animation[] = [];

        // Only create position animation if it's not constant
        if (!this._isVector3KeysConstant(posKeys)) {
            const posAnim = new Animation(
                `${nodeName}_position`, "position", fps,
                Animation.ANIMATIONTYPE_VECTOR3, Animation.ANIMATIONLOOPMODE_CYCLE
            );
            posAnim.setKeys(posKeys);
            animations.push(posAnim);
        }

        // Always create rotation animation (if there are rotation curves)
        if (rNode) {
            const rotAnim = new Animation(
                `${nodeName}_rotation`, "rotationQuaternion", fps,
                Animation.ANIMATIONTYPE_QUATERNION, Animation.ANIMATIONLOOPMODE_CYCLE
            );
            rotAnim.setKeys(rotKeys);
            animations.push(rotAnim);
        }

        // Only create scale animation if it's not constant
        if (!this._isVector3KeysConstant(sclKeys)) {
            const sclAnim = new Animation(
                `${nodeName}_scaling`, "scaling", fps,
                Animation.ANIMATIONTYPE_VECTOR3, Animation.ANIMATIONLOOPMODE_CYCLE
            );
            sclAnim.setKeys(sclKeys);
            animations.push(sclAnim);
        }

        return animations;
    }

    private _isVector3KeysConstant(keys: { frame: number; value: Vector3 }[]): boolean {
        if (keys.length < 2) return true;
        const first = keys[0].value;
        for (let i = 1; i < keys.length; i++) {
            const v = keys[i].value;
            if (Math.abs(v.x - first.x) > 0.0001 ||
                Math.abs(v.y - first.y) > 0.0001 ||
                Math.abs(v.z - first.z) > 0.0001) {
                return false;
            }
        }
        return true;
    }

    private _sampleModelLocalMatrix(
        modelData: FBXModelData,
        curveNodes: FBXCurveNodeData[],
        time: number
    ): Matrix {
        const tNode = curveNodes.find(cn => cn.type === "T");
        const rNode = curveNodes.find(cn => cn.type === "R");
        const sNode = curveNodes.find(cn => cn.type === "S");

        const txCurve = tNode?.curves.find(c => c.channel === "d|X");
        const tyCurve = tNode?.curves.find(c => c.channel === "d|Y");
        const tzCurve = tNode?.curves.find(c => c.channel === "d|Z");
        const rxCurve = rNode?.curves.find(c => c.channel === "d|X");
        const ryCurve = rNode?.curves.find(c => c.channel === "d|Y");
        const rzCurve = rNode?.curves.find(c => c.channel === "d|Z");
        const sxCurve = sNode?.curves.find(c => c.channel === "d|X");
        const syCurve = sNode?.curves.find(c => c.channel === "d|Y");
        const szCurve = sNode?.curves.find(c => c.channel === "d|Z");

        return FBXFileLoader._computeFBXLocalMatrix(
            [
                sampleFBXCurveAtTime(txCurve, time) ?? modelData.translation[0],
                sampleFBXCurveAtTime(tyCurve, time) ?? modelData.translation[1],
                sampleFBXCurveAtTime(tzCurve, time) ?? modelData.translation[2],
            ],
            [
                sampleFBXCurveAtTime(rxCurve, time) ?? modelData.rotation[0],
                sampleFBXCurveAtTime(ryCurve, time) ?? modelData.rotation[1],
                sampleFBXCurveAtTime(rzCurve, time) ?? modelData.rotation[2],
            ],
            [
                sampleFBXCurveAtTime(sxCurve, time) ?? modelData.scale[0],
                sampleFBXCurveAtTime(syCurve, time) ?? modelData.scale[1],
                sampleFBXCurveAtTime(szCurve, time) ?? modelData.scale[2],
            ],
            modelData.preRotation,
            modelData.postRotation,
            modelData.rotationPivot,
            modelData.scalingPivot,
            modelData.rotationOffset,
            modelData.scalingOffset,
            modelData.rotationOrder
        );
    }

    /**
     * Build matrix-baked bone animation from full FBX local transforms.
     * The bind matrix carries the skinning offset, so animation curves drive
     * the same FBX local transform chain as the source skeleton.
     */
    private _buildBoneAnimations(
        curveNodes: FBXCurveNodeData[],
        boneName: string,
        modelData: FBXModelData,
        startTime: number,
        stopTime: number,
        bindLocalMatrix?: Matrix
    ): Animation[] {
        const fps = 30;

        // Separate curves by type
        const tNode = curveNodes.find(cn => cn.type === "T");
        const rNode = curveNodes.find(cn => cn.type === "R");
        const sNode = curveNodes.find(cn => cn.type === "S");

        const times = collectAnimationSampleTimes(curveNodes, fps, startTime, stopTime);
        if (times.length === 0) return [];

        // Get curve accessors
        const txCurve = tNode?.curves.find(c => c.channel === "d|X");
        const tyCurve = tNode?.curves.find(c => c.channel === "d|Y");
        const tzCurve = tNode?.curves.find(c => c.channel === "d|Z");
        const rxCurve = rNode?.curves.find(c => c.channel === "d|X");
        const ryCurve = rNode?.curves.find(c => c.channel === "d|Y");
        const rzCurve = rNode?.curves.find(c => c.channel === "d|Z");
        const sxCurve = sNode?.curves.find(c => c.channel === "d|X");
        const syCurve = sNode?.curves.find(c => c.channel === "d|Y");
        const szCurve = sNode?.curves.find(c => c.channel === "d|Z");

        const posKeys: { frame: number; value: Vector3 }[] = [];
        const rotKeys: { frame: number; value: Quaternion }[] = [];
        const sclKeys: { frame: number; value: Vector3 }[] = [];
        let prevQuat: Quaternion | null = null;
        let restLocalInverse: Matrix | null = null;
        if (bindLocalMatrix) {
            const restLocalMatrix = FBXFileLoader._computeFBXLocalMatrix(
                modelData.translation,
                modelData.rotation,
                modelData.scale,
                modelData.preRotation,
                modelData.postRotation,
                modelData.rotationPivot,
                modelData.scalingPivot,
                modelData.rotationOffset,
                modelData.scalingOffset,
                modelData.rotationOrder
            );
            restLocalInverse = new Matrix();
            restLocalMatrix.invertToRef(restLocalInverse);
        }

        for (const time of times) {
            const frame = time * fps;

            // Sample animated values, falling back to model's base values
            const tx = sampleFBXCurveAtTime(txCurve, time) ?? modelData.translation[0];
            const ty = sampleFBXCurveAtTime(tyCurve, time) ?? modelData.translation[1];
            const tz = sampleFBXCurveAtTime(tzCurve, time) ?? modelData.translation[2];
            const rx = sampleFBXCurveAtTime(rxCurve, time) ?? modelData.rotation[0];
            const ry = sampleFBXCurveAtTime(ryCurve, time) ?? modelData.rotation[1];
            const rz = sampleFBXCurveAtTime(rzCurve, time) ?? modelData.rotation[2];
            const sx = sampleFBXCurveAtTime(sxCurve, time) ?? modelData.scale[0];
            const sy = sampleFBXCurveAtTime(syCurve, time) ?? modelData.scale[1];
            const sz = sampleFBXCurveAtTime(szCurve, time) ?? modelData.scale[2];

            // Compute the full FBX local matrix from animated Lcl values
            const localMatrix = FBXFileLoader._computeFBXLocalMatrix(
                [tx, ty, tz],
                [rx, ry, rz],
                [sx, sy, sz],
                modelData.preRotation,
                modelData.postRotation,
                modelData.rotationPivot,
                modelData.scalingPivot,
                modelData.rotationOffset,
                modelData.scalingOffset,
                modelData.rotationOrder
            );

            const correctedLocalMatrix = restLocalInverse && bindLocalMatrix
                ? bindLocalMatrix.multiply(restLocalInverse).multiply(localMatrix)
                : localMatrix;

            const s = new Vector3();
            const r = new Quaternion();
            const t = new Vector3();
            correctedLocalMatrix.decompose(s, r, t);

            if (prevQuat && Quaternion.Dot(prevQuat, r) < 0) {
                r.scaleInPlace(-1);
            }
            prevQuat = r;

            posKeys.push({ frame, value: t });
            rotKeys.push({ frame, value: r });
            sclKeys.push({ frame, value: s });
        }

        const animations: Animation[] = [];

        if (!this._isVector3KeysConstant(posKeys)) {
            const posAnim = new Animation(
                `${boneName}_position`, "position", fps,
                Animation.ANIMATIONTYPE_VECTOR3, Animation.ANIMATIONLOOPMODE_CYCLE
            );
            posAnim.setKeys(posKeys);
            animations.push(posAnim);
        }

        if (rNode) {
            const rotAnim = new Animation(
                `${boneName}_rotation`, "rotationQuaternion", fps,
                Animation.ANIMATIONTYPE_QUATERNION, Animation.ANIMATIONLOOPMODE_CYCLE
            );
            rotAnim.setKeys(rotKeys);
            animations.push(rotAnim);
        }

        if (!this._isVector3KeysConstant(sclKeys)) {
            const sclAnim = new Animation(
                `${boneName}_scaling`, "scaling", fps,
                Animation.ANIMATIONTYPE_VECTOR3, Animation.ANIMATIONLOOPMODE_CYCLE
            );
            sclAnim.setKeys(sclKeys);
            animations.push(sclAnim);
        }

        return animations;
    }

    private _buildBoneAnimation(
        curveNode: FBXCurveNodeData,
        boneName: string,
        preRotation: [number, number, number],
        rotationOrder: number = 0
    ): Animation | null {
        const fps = 30;

        if (curveNode.type === "T") {
            // Skip constant position animations (bone doesn't translate)
            if (this._isCurveNodeConstant(curveNode)) return null;
            return this._buildVector3Animation(
                curveNode,
                `${boneName}_position`,
                "position",
                fps
            );
        } else if (curveNode.type === "R") {
            return this._buildRotationAnimation(
                curveNode,
                `${boneName}_rotation`,
                fps,
                preRotation,
                rotationOrder
            );
        } else if (curveNode.type === "S") {
            // Skip constant scaling animations (bone doesn't scale)
            if (this._isCurveNodeConstant(curveNode)) return null;
            return this._buildVector3Animation(
                curveNode,
                `${boneName}_scaling`,
                "scaling",
                fps
            );
        }

        return null;
    }

    /** Check if all curves in a curve node have constant values */
    private _isCurveNodeConstant(curveNode: FBXCurveNodeData): boolean {
        for (const curve of curveNode.curves) {
            if (curve.keys.length < 2) continue;
            const first = curve.keys[0].value;
            for (let i = 1; i < curve.keys.length; i++) {
                if (Math.abs(curve.keys[i].value - first) > 0.0001) return false;
            }
        }
        return true;
    }

    private _buildVector3Animation(
        curveNode: FBXCurveNodeData,
        animName: string,
        property: string,
        fps: number
    ): Animation | null {
        const xCurve = curveNode.curves.find((c) => c.channel === "d|X");
        const yCurve = curveNode.curves.find((c) => c.channel === "d|Y");
        const zCurve = curveNode.curves.find((c) => c.channel === "d|Z");

        if (!xCurve && !yCurve && !zCurve) return null;

        // Collect all unique time points
        const timeSet = new Set<number>();
        for (const curve of curveNode.curves) {
            for (const key of curve.keys) {
                timeSet.add(key.time);
            }
        }
        const times = [...timeSet].sort((a, b) => a - b);
        if (times.length === 0) return null;

        const animation = new Animation(
            animName,
            property,
            fps,
            Animation.ANIMATIONTYPE_VECTOR3,
            Animation.ANIMATIONLOOPMODE_CYCLE
        );

        const keys: { frame: number; value: Vector3 }[] = [];
        for (const time of times) {
            const frame = time * fps;
            const x = sampleFBXCurveAtTime(xCurve, time) ?? 0;
            const y = sampleFBXCurveAtTime(yCurve, time) ?? 0;
            const z = sampleFBXCurveAtTime(zCurve, time) ?? 0;
            keys.push({
                frame,
                value: new Vector3(x, y, z),
            });
        }

        animation.setKeys(keys);
        return animation;
    }

    private _buildRotationAnimation(
        curveNode: FBXCurveNodeData,
        animName: string,
        fps: number,
        preRotation: [number, number, number],
        rotationOrder: number = 0
    ): Animation | null {
        const xCurve = curveNode.curves.find((c) => c.channel === "d|X");
        const yCurve = curveNode.curves.find((c) => c.channel === "d|Y");
        const zCurve = curveNode.curves.find((c) => c.channel === "d|Z");

        if (!xCurve && !yCurve && !zCurve) return null;

        const timeSet = new Set<number>();
        for (const curve of curveNode.curves) {
            for (const key of curve.keys) {
                timeSet.add(key.time);
            }
        }
        const times = [...timeSet].sort((a, b) => a - b);
        if (times.length === 0) return null;

        const animation = new Animation(
            animName,
            "rotationQuaternion",
            fps,
            Animation.ANIMATIONTYPE_QUATERNION,
            Animation.ANIMATIONLOOPMODE_CYCLE
        );

        // PreRotation matrix using XYZ Euler order
        const d2r = Math.PI / 180;
        const preRotMatrix = FBXFileLoader._eulerToMatrixXYZ(
            preRotation[0] * d2r,
            preRotation[1] * d2r,
            preRotation[2] * d2r
        );

        const keys: { frame: number; value: Quaternion }[] = [];
        let prevQuat: Quaternion | null = null;
        for (const time of times) {
            const frame = time * fps;
            const rx = (sampleFBXCurveAtTime(xCurve, time) ?? 0) * d2r;
            const ry = (sampleFBXCurveAtTime(yCurve, time) ?? 0) * d2r;
            const rz = (sampleFBXCurveAtTime(zCurve, time) ?? 0) * d2r;

            // Combined rotation: Rlcl * Rpre (row-vector convention)
            // Lcl Rotation uses the node's RotationOrder
            const lclRotMatrix = FBXFileLoader._eulerToMatrix(rx, ry, rz, rotationOrder);
            const combinedMatrix = lclRotMatrix.multiply(preRotMatrix);

            const quat = Quaternion.FromRotationMatrix(combinedMatrix);

            // Ensure quaternion continuity: q and -q represent the same rotation,
            // but SLERP between them takes the long path causing extreme artifacts.
            if (prevQuat && Quaternion.Dot(prevQuat, quat) < 0) {
                quat.scaleInPlace(-1);
            }
            prevQuat = quat;

            keys.push({ frame, value: quat });
        }

        animation.setKeys(keys);
        return animation;
    }

    private _buildNameFilter(
        meshesNames: string | readonly string[] | null | undefined
    ): ((name: string) => boolean) | null {
        if (!meshesNames) return null;
        if (typeof meshesNames === "string") {
            if (meshesNames === "") return null;
            return (name: string) => name === meshesNames;
        }
        if (meshesNames.length === 0) return null;
        const nameSet = new Set(meshesNames);
        return (name: string) => nameSet.has(name);
    }
}

function float64To32(arr: Float64Array): Float32Array {
    const result = new Float32Array(arr.length);
    for (let i = 0; i < arr.length; i++) {
        result[i] = arr[i];
    }
    return result;
}

function collectAnimationSampleTimes(
    curveNodes: FBXCurveNodeData[],
    fps: number,
    startTime: number,
    stopTime: number
): number[] {
    let minTime = Number.POSITIVE_INFINITY;
    let maxTime = Number.NEGATIVE_INFINITY;
    const sourceTimes = new Set<number>();

    for (const curveNode of curveNodes) {
        for (const curve of curveNode.curves) {
            for (const key of curve.keys) {
                minTime = Math.min(minTime, key.time);
                maxTime = Math.max(maxTime, key.time);
                if (key.time >= startTime && key.time <= stopTime) {
                    sourceTimes.add(key.time);
                }
            }
        }
    }

    if (!Number.isFinite(minTime) || !Number.isFinite(maxTime)) return [];

    const rangeStart = stopTime > startTime ? startTime : minTime;
    const rangeStop = stopTime > startTime ? stopTime : maxTime;
    const times = new Set<number>([rangeStart, rangeStop, ...sourceTimes]);
    const startFrame = Math.ceil(rangeStart * fps);
    const stopFrame = Math.floor(rangeStop * fps);

    for (let frame = startFrame; frame <= stopFrame; frame++) {
        times.add(frame / fps);
    }

    return [...times].sort((a, b) => a - b);
}

function buildScalarAnimationKeys(
    curve: FBXCurveData,
    fps: number,
    startTime: number,
    stopTime: number,
    mapValue: (value: number) => number
): IAnimationKey[] {
    const range = getCurveSampleRange(curve, startTime, stopTime);
    const keys = curve.keys
        .filter((key) => key.time >= range.start && key.time <= range.stop)
        .map((key) => ({
            source: key,
            frame: key.time * fps,
            value: mapValue(key.value),
        }));

    if (!keys.some((key) => Math.abs(key.source.time - range.start) < 1e-6)) {
        keys.unshift({
            source: {
                time: range.start,
                value: sampleFBXCurveAtTime(curve, range.start) ?? 0,
                interpolation: "linear",
            },
            frame: range.start * fps,
            value: mapValue(sampleFBXCurveAtTime(curve, range.start) ?? 0),
        });
    }

    if (!keys.some((key) => Math.abs(key.source.time - range.stop) < 1e-6)) {
        keys.push({
            source: {
                time: range.stop,
                value: sampleFBXCurveAtTime(curve, range.stop) ?? 0,
                interpolation: "linear",
            },
            frame: range.stop * fps,
            value: mapValue(sampleFBXCurveAtTime(curve, range.stop) ?? 0),
        });
    }

    const animationKeys: IAnimationKey[] = keys.map((key) => ({
        frame: key.frame,
        value: key.value,
    }));

    for (let i = 0; i < keys.length - 1; i++) {
        const key = keys[i].source;
        const nextAnimationKey = animationKeys[i + 1];

        if (key.interpolation === "constant") {
            animationKeys[i].interpolation = AnimationKeyInterpolation.STEP;
            continue;
        }

        if (key.interpolation !== "cubic") continue;

        const nextKey = keys[i + 1].source;
        const duration = Math.max(nextKey.time - key.time, 1e-6);
        const linearSlope = (nextKey.value - key.value) / duration;
        animationKeys[i].outTangent = mapSlope(key.rightSlope ?? linearSlope, mapValue) / fps;
        nextAnimationKey.inTangent = mapSlope(key.nextLeftSlope ?? linearSlope, mapValue) / fps;
    }

    return animationKeys;
}

function mapSlope(slope: number, mapValue: (value: number) => number): number {
    return mapValue(slope) - mapValue(0);
}

function getCurveSampleRange(
    curve: FBXCurveData,
    startTime: number,
    stopTime: number
): { start: number; stop: number } {
    if (stopTime > startTime) {
        return { start: startTime, stop: stopTime };
    }

    return {
        start: curve.keys[0]?.time ?? 0,
        stop: curve.keys[curve.keys.length - 1]?.time ?? 0,
    };
}

