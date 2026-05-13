import type {
    ISceneLoaderPluginAsync,
    ISceneLoaderPluginExtensions,
    ISceneLoaderAsyncResult,
    ISceneLoaderProgressEvent,
} from "@babylonjs/core/Loading/sceneLoader.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { AssetContainer } from "@babylonjs/core/assetContainer.js";
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

import { parseBinaryFBX } from "./parsers/fbxBinaryParser.js";
import { parseAsciiFBX } from "./parsers/fbxAsciiParser.js";
import { interpretFBX, type FBXModelData, type FBXSceneData } from "./interpreter/fbxInterpreter.js";
import type { FBXDocument } from "./types/fbxTypes.js";
import type { FBXGeometryData } from "./interpreter/geometry.js";
import type { FBXMaterialData } from "./interpreter/materials.js";
import type { FBXSkinData, FBXBoneData } from "./interpreter/skeleton.js";
import type { FBXAnimationStackData, FBXCurveNodeData } from "./interpreter/animation.js";

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
        _scene: Scene,
        _data: unknown,
        _rootUrl: string,
        _onProgress?: (event: ISceneLoaderProgressEvent) => void,
        _fileName?: string
    ): Promise<AssetContainer> {
        throw new Error("FBXFileLoader.loadAssetContainerAsync is not yet implemented");
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

        // Create skeletons and collect preRotation data for animations
        const skeletons: Skeleton[] = [];
        const skeletonByGeometryId = new Map<bigint, Skeleton>();
        const skinByGeometryId = new Map<bigint, FBXSkinData>();
        const bonePreRotations = new Map<bigint, [number, number, number]>();
        const boneRotationOrders = new Map<bigint, number>();

        for (const skin of fbxScene.skins) {
            const { skeleton } = this._createSkeleton(skin, scene);
            skeletons.push(skeleton);
            skeletonByGeometryId.set(skin.geometryId, skeleton);
            skinByGeometryId.set(skin.geometryId, skin);

            for (const boneData of skin.bones) {
                bonePreRotations.set(boneData.modelId, boneData.preRotation);
                boneRotationOrders.set(boneData.modelId, boneData.rotationOrder);
            }
        }

        // Build model hierarchy under a root node that converts RH→LH.
        // This matches exactly what the glTF loader does with its __root__ node:
        // rotation.y = PI + scaling.z = -1
        const rootNode = new TransformNode("__fbx_root__", scene);
        rootNode.rotation.y = Math.PI;
        rootNode.scaling.z = -1;

        const meshes: Mesh[] = [];
        const transformNodes: TransformNode[] = [rootNode];

        for (const model of fbxScene.rootModels) {
            this._buildModel(
                model,
                scene,
                rootNode,
                materialCache,
                nameFilter,
                meshes,
                transformNodes,
                skeletonByGeometryId,
                skinByGeometryId
            );
        }

        // Create animation groups
        const animationGroups: AnimationGroup[] = [];
        for (const animStack of fbxScene.animations) {
            const group = this._createAnimationGroup(animStack, fbxScene.skins, skeletons, bonePreRotations, boneRotationOrders, scene);
            if (group) animationGroups.push(group);
        }

        return {
            meshes,
            particleSystems: [],
            skeletons,
            animationGroups,
            transformNodes,
            geometries: [],
            lights: [],
            spriteManagers: [],
        };
    }

    private _buildModel(
        model: FBXModelData,
        scene: Scene,
        parent: Nullable<TransformNode>,
        materialCache: Map<bigint, StandardMaterial>,
        nameFilter: ((name: string) => boolean) | null,
        meshes: Mesh[],
        transformNodes: TransformNode[],
        skeletonByGeometryId: Map<bigint, Skeleton>,
        skinByGeometryId: Map<bigint, FBXSkinData>
    ): void {
        if (model.geometry && model.subType === "Mesh") {
            // Create mesh
            if (nameFilter && !nameFilter(model.name)) {
                return;
            }

            const skeleton = skeletonByGeometryId.get(model.geometry.id);
            const skin = skinByGeometryId.get(model.geometry.id);

            const mesh = this._createMesh(model, model.geometry, scene, skeleton, skin);
            if (parent) {
                mesh.parent = parent;
            }

            // Apply full FBX transform chain.
            // If PreRotation was baked into vertices (skinned mesh with non-Identity
            // cluster Transform), apply the transform WITHOUT PreRotation.
            if ((model as any)._preRotationBaked) {
                FBXFileLoader._applyFBXTransformSkipPreRotation(mesh, model);
            } else {
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

            meshes.push(mesh);

            // Recurse children
            for (const child of model.children) {
                this._buildModel(child, scene, mesh, materialCache, nameFilter, meshes, transformNodes, skeletonByGeometryId, skinByGeometryId);
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

            // Recurse children
            for (const child of model.children) {
                this._buildModel(child, scene, transformNode, materialCache, nameFilter, meshes, transformNodes, skeletonByGeometryId, skinByGeometryId);
            }
        }
    }

    private _createMesh(
        model: FBXModelData,
        geomData: FBXGeometryData,
        scene: Scene,
        skeleton?: Skeleton,
        skin?: FBXSkinData
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

        // For skinned meshes with non-Identity cluster Transform: bake the mesh's
        // PreRotation into vertex positions/normals. This puts vertices into the same
        // coordinate space as the bones (TransformLink = Y-up world space), so that
        // bone operations work directly on the correct coordinate frame.
        // Without this, bone ops (Y-up) would be applied to Z-up vertices, causing
        // the mesh to appear rotated/distorted during animation.
        let preRotationBaked = false;
        let preRotMatrix: Matrix | null = null;
        if (skeleton && skin && skin.bones.length > 0 && skin.bones[0].bindPoseMatrix) {
            const firstTransform = Matrix.FromArray(skin.bones[0].bindPoseMatrix);
            if (!FBXFileLoader._isNearIdentity(firstTransform)) {
                const preRot = model.preRotation;
                if (preRot[0] !== 0 || preRot[1] !== 0 || preRot[2] !== 0) {
                    const d2r = Math.PI / 180;
                    preRotMatrix = FBXFileLoader._eulerToMatrixXYZ(
                        preRot[0] * d2r, preRot[1] * d2r, preRot[2] * d2r
                    );
                    for (let i = 0; i < positions.length; i += 3) {
                        const v = Vector3.TransformCoordinates(
                            new Vector3(positions[i], positions[i + 1], positions[i + 2]),
                            preRotMatrix
                        );
                        positions[i] = v.x;
                        positions[i + 1] = v.y;
                        positions[i + 2] = v.z;
                    }
                    preRotationBaked = true;
                    (model as any)._preRotationBaked = true;
                }
            }
        }

        vertexData.positions = positions;
        vertexData.indices = Array.from(geomData.indices);

        if (geomData.normals) {
            const normals = float64To32(geomData.normals);
            // Apply the same PreRotation baking to normals (rotation only, not translation)
            if (preRotationBaked && preRotMatrix) {
                for (let i = 0; i < normals.length; i += 3) {
                    const n = Vector3.TransformNormal(
                        new Vector3(normals[i], normals[i + 1], normals[i + 2]),
                        preRotMatrix
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

        // Apply bone weights if we have a skin
        if (skeleton && skin) {
            const { matricesIndices, matricesWeights } = this._buildSkinningData(
                geomData,
                skin
            );
            vertexData.matricesIndices = matricesIndices;
            vertexData.matricesWeights = matricesWeights;
        }

        vertexData.applyToMesh(mesh);

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

    /**
     * Build per-polygon-vertex bone indices and weights from the control-point-based skin data.
     * The geometry expands control points to per-polygon-vertex, so we need to look up
     * each polygon-vertex's control point index.
     */
    private _buildSkinningData(
        geomData: FBXGeometryData,
        skin: FBXSkinData
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
                    matricesIndices[i * 4 + j] = j < boneIdx.length ? boneIdx[j] : 0;
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
                const blob = new Blob([tex.embeddedData], { type: mimeType });
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

    private _createSkeleton(skin: FBXSkinData, scene: Scene): { skeleton: Skeleton } {
        const skeleton = new Skeleton("Skeleton", "skeleton_" + skin.id.toString(), scene);
        const babylonBones: Bone[] = [];

        // Compute per-bone world matrices from cluster data.
        const tlWorldMatrices: (Matrix | null)[] = [];
        for (let i = 0; i < skin.bones.length; i++) {
            const boneData = skin.bones[i];
            tlWorldMatrices.push(
                boneData.transformLinkMatrix ? Matrix.FromArray(boneData.transformLinkMatrix) : null
            );
        }

        // localMatrix = Lcl-derived (what animation naturally targets)
        // bindMatrix = TL-local (bone's bind-time local transform from TransformLink)
        // This works because at bind time:
        //   absoluteBindMatrix = accumulated(TL-local) = TL_world
        //   absoluteInverseBindMatrix = inv(TL_world)
        //   boneInfluence = inv(TL) * absoluteMatrix_current
        //
        // For meshes where Transform ≠ Identity (Phoenix), the mesh's PreRotation is
        // baked into vertex data in _createMesh(), keeping mesh node at Identity,
        // so bones (in Y-up TL space) operate directly on Y-up vertex data.

        for (let i = 0; i < skin.bones.length; i++) {
            const boneData = skin.bones[i];
            const parentBone = boneData.parentIndex >= 0 ? babylonBones[boneData.parentIndex] : null;

            // Local matrix from Lcl properties — this is what animation naturally targets.
            const localMatrix = FBXFileLoader._computeFBXLocalMatrix(
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

            // Bind matrix from TransformLink hierarchy.
            let bindMatrix: Matrix | null = null;
            const tl = tlWorldMatrices[i];
            if (tl) {
                if (boneData.parentIndex >= 0 && tlWorldMatrices[boneData.parentIndex]) {
                    const parentTLInv = new Matrix();
                    tlWorldMatrices[boneData.parentIndex]!.invertToRef(parentTLInv);
                    bindMatrix = tl.multiply(parentTLInv);
                } else {
                    bindMatrix = tl.clone();
                }
            }

            const bone = new Bone(
                boneData.name,
                skeleton,
                parentBone,
                localMatrix,
                null,       // restMatrix
                bindMatrix  // bindMatrix from TL
            );
            babylonBones.push(bone);
        }

        return { skeleton };
    }

    private static _isNearIdentity(m: Matrix): boolean {
        const v = m.toArray();
        return Math.abs(v[0] - 1) < 0.001 && Math.abs(v[5] - 1) < 0.001 &&
               Math.abs(v[10] - 1) < 0.001 && Math.abs(v[15] - 1) < 0.001 &&
               Math.abs(v[12]) < 0.001 && Math.abs(v[13]) < 0.001 && Math.abs(v[14]) < 0.001 &&
               Math.abs(v[1]) < 0.001 && Math.abs(v[2]) < 0.001 && Math.abs(v[3]) < 0.001 &&
               Math.abs(v[4]) < 0.001 && Math.abs(v[6]) < 0.001 && Math.abs(v[7]) < 0.001 &&
               Math.abs(v[8]) < 0.001 && Math.abs(v[9]) < 0.001 && Math.abs(v[11]) < 0.001;
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
        const localMatrix = FBXFileLoader._computeFBXLocalMatrix(
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

        // Decompose into TRS
        const s = new Vector3();
        const r = new Quaternion();
        const t = new Vector3();
        localMatrix.decompose(s, r, t);

        node.position = t;
        node.rotationQuaternion = r;
        node.scaling = s;
    }

    /**
     * Apply the FBX transform chain WITHOUT PreRotation.
     * Used when PreRotation was already baked into vertex data.
     */
    private static _applyFBXTransformSkipPreRotation(
        node: TransformNode | Mesh,
        model: FBXModelData
    ): void {
        const localMatrix = FBXFileLoader._computeFBXLocalMatrix(
            model.translation,
            model.rotation,
            model.scale,
            [0, 0, 0],  // PreRotation zeroed — already baked into vertices
            model.postRotation,
            model.rotationPivot,
            model.scalingPivot,
            model.rotationOffset,
            model.scalingOffset,
            model.rotationOrder
        );

        const s = new Vector3();
        const r = new Quaternion();
        const t = new Vector3();
        localMatrix.decompose(s, r, t);

        node.position = t;
        node.rotationQuaternion = r;
        node.scaling = s;
    }

    private _createAnimationGroup(
        animStack: FBXAnimationStackData,
        skins: FBXSkinData[],
        skeletons: Skeleton[],
        bonePreRotations: Map<bigint, [number, number, number]>,
        boneRotationOrders: Map<bigint, number>,
        scene: Scene
    ): AnimationGroup | null {
        if (animStack.curveNodes.length === 0) return null;

        const animGroup = new AnimationGroup(animStack.name, scene);

        // Build a map from model ID to skeleton bone for targeting
        const modelIdToBone = new Map<bigint, Bone>();
        for (let si = 0; si < skins.length; si++) {
            const skeleton = skeletons[si];
            const skin = skins[si];
            for (const boneData of skin.bones) {
                const bone = skeleton.bones[boneData.index];
                if (bone) {
                    modelIdToBone.set(boneData.modelId, bone);
                }
            }
        }

        // Group curve nodes by target model and type
        for (const curveNode of animStack.curveNodes) {
            const bone = modelIdToBone.get(curveNode.targetModelId);
            if (!bone) continue;

            const preRot = bonePreRotations.get(curveNode.targetModelId) ?? [0, 0, 0];
            const rotOrder = boneRotationOrders.get(curveNode.targetModelId) ?? 0;
            const animation = this._buildBoneAnimation(curveNode, bone.name, preRot, rotOrder);
            if (animation) {
                animGroup.addTargetedAnimation(animation, bone);
            }
        }

        // Normalize the animation group
        if (animGroup.targetedAnimations.length > 0) {
            animGroup.normalize(0, animStack.duration * 30);
            return animGroup;
        }

        animGroup.dispose();
        return null;
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
            const x = sampleCurveAtTime(xCurve, time) ?? 0;
            const y = sampleCurveAtTime(yCurve, time) ?? 0;
            const z = sampleCurveAtTime(zCurve, time) ?? 0;
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
            const rx = (sampleCurveAtTime(xCurve, time) ?? 0) * d2r;
            const ry = (sampleCurveAtTime(yCurve, time) ?? 0) * d2r;
            const rz = (sampleCurveAtTime(zCurve, time) ?? 0) * d2r;

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

/** Sample a curve at a given time with linear interpolation */
function sampleCurveAtTime(
    curveData: { keys: { time: number; value: number }[] } | undefined,
    time: number
): number | null {
    if (!curveData || curveData.keys.length === 0) return null;

    const keys = curveData.keys;

    // Before first key
    if (time <= keys[0].time) return keys[0].value;
    // After last key
    if (time >= keys[keys.length - 1].time) return keys[keys.length - 1].value;

    // Find surrounding keys and interpolate
    for (let i = 0; i < keys.length - 1; i++) {
        if (time >= keys[i].time && time <= keys[i + 1].time) {
            const t =
                keys[i + 1].time === keys[i].time
                    ? 0
                    : (time - keys[i].time) / (keys[i + 1].time - keys[i].time);
            return keys[i].value + t * (keys[i + 1].value - keys[i].value);
        }
    }

    return keys[keys.length - 1].value;
}
