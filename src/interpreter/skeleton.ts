import type { FBXNode } from "../types/fbxTypes.js";
import { findChildByName, getPropertyValue, cleanFBXName } from "../types/fbxTypes.js";
import type { FBXObjectMap } from "./connections.js";
import { getChildren } from "./connections.js";

/** Represents a single bone (cluster) in the FBX skeleton */
export interface FBXBoneData {
    /** The Model node ID for this bone */
    modelId: bigint;
    /** Bone name (from the Model node) */
    name: string;
    /** Index of this bone in the skeleton */
    index: number;
    /** Index of the parent bone (-1 for root) */
    parentIndex: number;
    /** Local translation from parent (Lcl Translation) */
    translation: [number, number, number];
    /** Local rotation in degrees (Lcl Rotation) */
    rotation: [number, number, number];
    /** Pre-rotation in degrees (applied before Lcl Rotation) */
    preRotation: [number, number, number];
    /** Post-rotation in degrees (applied after Lcl Rotation, inverted) */
    postRotation: [number, number, number];
    /** Rotation pivot point */
    rotationPivot: [number, number, number];
    /** Scaling pivot point */
    scalingPivot: [number, number, number];
    /** Rotation offset */
    rotationOffset: [number, number, number];
    /** Scaling offset */
    scalingOffset: [number, number, number];
    /** Local scale (Lcl Scaling) */
    scale: [number, number, number];
    /** Rotation order: 0=XYZ, 1=XZY, 2=YZX, 3=YXZ, 4=ZXY, 5=ZYX */
    rotationOrder: number;
    /** Bind pose transform matrix (cluster Transform, 4x4) */
    bindPoseMatrix: Float64Array | null;
    /** Bone's world transform at bind time (cluster TransformLink, 4x4) */
    transformLinkMatrix: Float64Array | null;
}

/** Represents a skin deformer with its clusters */
export interface FBXSkinData {
    /** Skin deformer ID */
    id: bigint;
    /** Geometry ID this skin is attached to */
    geometryId: bigint;
    /** Bones in this skeleton */
    bones: FBXBoneData[];
    /** Per-vertex bone indices (up to 4 influences per vertex) */
    boneIndices: number[][];
    /** Per-vertex bone weights (matching boneIndices) */
    boneWeights: number[][];
}

/**
 * Extract all skin deformers from the FBX scene.
 * Returns skin data including bone hierarchy and vertex weights.
 */
export function extractSkins(objectMap: FBXObjectMap): FBXSkinData[] {
    const skins: FBXSkinData[] = [];

    for (const [id, node] of objectMap.objects) {
        if (node.name === "Deformer" && getPropertyValue<string>(node, 2) === "Skin") {
            const skin = extractSkin(id, node, objectMap);
            if (skin) skins.push(skin);
        }
    }

    return skins;
}

function extractSkin(
    skinId: bigint,
    _skinNode: FBXNode,
    objectMap: FBXObjectMap
): FBXSkinData | null {
    // Find the geometry this skin is attached to
    // Skin is a child of the geometry in FBX connection graph
    const skinParent = objectMap.parentOf.get(skinId);
    if (!skinParent) return null;

    const geometryId = skinParent.id;
    const geometryNode = objectMap.objects.get(geometryId);
    if (!geometryNode || geometryNode.name !== "Geometry") return null;

    // Find all clusters (children of this skin)
    const clusterEntries = getChildren(objectMap, skinId, "Deformer");
    if (clusterEntries.length === 0) return null;

    // For each cluster, find the connected bone Model
    // Connection graph: BoneModel → Cluster (bone is child of cluster)
    const boneModelMap = new Map<bigint, { clusterId: bigint; clusterNode: FBXNode }>();
    for (const { id: clusterId, node: clusterNode } of clusterEntries) {
        const subType = getPropertyValue<string>(clusterNode, 2);
        if (subType !== "Cluster") continue;

        // The bone Model is a child of the Cluster
        const boneChildren = getChildren(objectMap, clusterId, "Model");
        if (boneChildren.length > 0) {
            boneModelMap.set(boneChildren[0].id, { clusterId, clusterNode });
        }
    }

    // Build bone hierarchy from Model parent-child relationships
    const bones = buildBoneHierarchy(boneModelMap, objectMap);
    if (bones.length === 0) return null;

    // Extract per-vertex weights from clusters
    const { boneIndices, boneWeights } = extractVertexWeights(
        bones,
        boneModelMap,
        objectMap
    );

    return {
        id: skinId,
        geometryId,
        bones,
        boneIndices,
        boneWeights,
    };
}

/**
 * Build a flat ordered bone list with parent indices from the FBX Model hierarchy.
 */
function buildBoneHierarchy(
    boneModelMap: Map<bigint, { clusterId: bigint; clusterNode: FBXNode }>,
    objectMap: FBXObjectMap
): FBXBoneData[] {
    const bones: FBXBoneData[] = [];
    const boneIndexMap = new Map<bigint, number>();
    const visited = new Set<bigint>();

    // Find root bones: bones whose parent model is NOT another bone in our map.
    // Since FBX connects bones to clusters AND parent bones, we need to check
    // all parent connections to find the actual model hierarchy.
    const hasParentBone = new Set<bigint>();
    for (const modelId of boneModelMap.keys()) {
        // Check if any other bone in our map is a parent of this bone
        for (const conn of objectMap.connections) {
            if (conn.childId === modelId && conn.type === "OO" && boneModelMap.has(conn.parentId)) {
                hasParentBone.add(modelId);
                break;
            }
        }
    }

    const rootBoneIds: bigint[] = [];
    for (const modelId of boneModelMap.keys()) {
        if (!hasParentBone.has(modelId)) {
            rootBoneIds.push(modelId);
        }
    }

    // BFS to build ordered list
    const queue: { modelId: bigint; parentIndex: number }[] = rootBoneIds.map((id) => ({
        modelId: id,
        parentIndex: -1,
    }));

    while (queue.length > 0) {
        const { modelId, parentIndex } = queue.shift()!;
        if (visited.has(modelId)) continue;
        visited.add(modelId);

        const modelNode = objectMap.objects.get(modelId);
        if (!modelNode) continue;

        const boneIndex = bones.length;
        boneIndexMap.set(modelId, boneIndex);

        const clusterInfo = boneModelMap.get(modelId)!;
        const transform = extractBoneTransform(modelNode);
        const { bindPoseMatrix, transformLinkMatrix } = extractClusterMatrices(
            clusterInfo.clusterNode
        );

        bones.push({
            modelId,
            name: cleanFBXName(getPropertyValue<string>(modelNode, 1) ?? `Bone${boneIndex}`),
            index: boneIndex,
            parentIndex,
            translation: transform.translation,
            rotation: transform.rotation,
            preRotation: transform.preRotation,
            postRotation: transform.postRotation,
            rotationPivot: transform.rotationPivot,
            scalingPivot: transform.scalingPivot,
            rotationOffset: transform.rotationOffset,
            scalingOffset: transform.scalingOffset,
            scale: transform.scale,
            rotationOrder: transform.rotationOrder,
            bindPoseMatrix,
            transformLinkMatrix,
        });

        // Find child bones of this model that are also in our boneModelMap
        const childModels = getChildren(objectMap, modelId, "Model");
        for (const { id: childId } of childModels) {
            if (boneModelMap.has(childId) && !visited.has(childId)) {
                queue.push({ modelId: childId, parentIndex: boneIndex });
            }
        }
    }

    return bones;
}

function extractBoneTransform(modelNode: FBXNode): {
    translation: [number, number, number];
    rotation: [number, number, number];
    preRotation: [number, number, number];
    postRotation: [number, number, number];
    rotationPivot: [number, number, number];
    scalingPivot: [number, number, number];
    rotationOffset: [number, number, number];
    scalingOffset: [number, number, number];
    scale: [number, number, number];
    rotationOrder: number;
} {
    const translation: [number, number, number] = [0, 0, 0];
    const rotation: [number, number, number] = [0, 0, 0];
    const preRotation: [number, number, number] = [0, 0, 0];
    const postRotation: [number, number, number] = [0, 0, 0];
    const rotationPivot: [number, number, number] = [0, 0, 0];
    const scalingPivot: [number, number, number] = [0, 0, 0];
    const rotationOffset: [number, number, number] = [0, 0, 0];
    const scalingOffset: [number, number, number] = [0, 0, 0];
    const scale: [number, number, number] = [1, 1, 1];
    let rotationOrder = 0;

    const props70 = findChildByName(modelNode, "Properties70");
    if (!props70) return { translation, rotation, preRotation, postRotation, rotationPivot, scalingPivot, rotationOffset, scalingOffset, scale, rotationOrder };

    for (const p of props70.children) {
        if (p.name !== "P") continue;
        const propName = getPropertyValue<string>(p, 0);
        if (!propName) continue;

        switch (propName) {
            case "Lcl Translation":
                translation[0] = toNumber(p.properties[4]?.value) ?? 0;
                translation[1] = toNumber(p.properties[5]?.value) ?? 0;
                translation[2] = toNumber(p.properties[6]?.value) ?? 0;
                break;
            case "Lcl Rotation":
                rotation[0] = toNumber(p.properties[4]?.value) ?? 0;
                rotation[1] = toNumber(p.properties[5]?.value) ?? 0;
                rotation[2] = toNumber(p.properties[6]?.value) ?? 0;
                break;
            case "PreRotation":
                preRotation[0] = toNumber(p.properties[4]?.value) ?? 0;
                preRotation[1] = toNumber(p.properties[5]?.value) ?? 0;
                preRotation[2] = toNumber(p.properties[6]?.value) ?? 0;
                break;
            case "PostRotation":
                postRotation[0] = toNumber(p.properties[4]?.value) ?? 0;
                postRotation[1] = toNumber(p.properties[5]?.value) ?? 0;
                postRotation[2] = toNumber(p.properties[6]?.value) ?? 0;
                break;
            case "RotationPivot":
                rotationPivot[0] = toNumber(p.properties[4]?.value) ?? 0;
                rotationPivot[1] = toNumber(p.properties[5]?.value) ?? 0;
                rotationPivot[2] = toNumber(p.properties[6]?.value) ?? 0;
                break;
            case "ScalingPivot":
                scalingPivot[0] = toNumber(p.properties[4]?.value) ?? 0;
                scalingPivot[1] = toNumber(p.properties[5]?.value) ?? 0;
                scalingPivot[2] = toNumber(p.properties[6]?.value) ?? 0;
                break;
            case "RotationOffset":
                rotationOffset[0] = toNumber(p.properties[4]?.value) ?? 0;
                rotationOffset[1] = toNumber(p.properties[5]?.value) ?? 0;
                rotationOffset[2] = toNumber(p.properties[6]?.value) ?? 0;
                break;
            case "ScalingOffset":
                scalingOffset[0] = toNumber(p.properties[4]?.value) ?? 0;
                scalingOffset[1] = toNumber(p.properties[5]?.value) ?? 0;
                scalingOffset[2] = toNumber(p.properties[6]?.value) ?? 0;
                break;
            case "Lcl Scaling":
                scale[0] = toNumber(p.properties[4]?.value) ?? 1;
                scale[1] = toNumber(p.properties[5]?.value) ?? 1;
                scale[2] = toNumber(p.properties[6]?.value) ?? 1;
                break;
            case "RotationOrder":
                rotationOrder = toNumber(p.properties[4]?.value) ?? 0;
                break;
        }
    }

    return { translation, rotation, preRotation, postRotation, rotationPivot, scalingPivot, rotationOffset, scalingOffset, scale, rotationOrder };
}

function extractClusterMatrices(clusterNode: FBXNode): {
    bindPoseMatrix: Float64Array | null;
    transformLinkMatrix: Float64Array | null;
} {
    let bindPoseMatrix: Float64Array | null = null;
    let transformLinkMatrix: Float64Array | null = null;

    const transformNode = findChildByName(clusterNode, "Transform");
    if (transformNode && transformNode.properties[0]) {
        const val = transformNode.properties[0].value;
        if (val instanceof Float64Array && val.length === 16) {
            bindPoseMatrix = val;
        } else if (val instanceof Float32Array && val.length === 16) {
            bindPoseMatrix = new Float64Array(val);
        }
    }

    const transformLinkNode = findChildByName(clusterNode, "TransformLink");
    if (transformLinkNode && transformLinkNode.properties[0]) {
        const val = transformLinkNode.properties[0].value;
        if (val instanceof Float64Array && val.length === 16) {
            transformLinkMatrix = val;
        } else if (val instanceof Float32Array && val.length === 16) {
            transformLinkMatrix = new Float64Array(val);
        }
    }

    return { bindPoseMatrix, transformLinkMatrix };
}

/**
 * Extract per-vertex bone indices and weights from cluster data.
 * Returns arrays indexed by control point index.
 */
function extractVertexWeights(
    bones: FBXBoneData[],
    boneModelMap: Map<bigint, { clusterId: bigint; clusterNode: FBXNode }>,
    objectMap: FBXObjectMap
): { boneIndices: number[][]; boneWeights: number[][] } {
    // We need to find the max vertex index to size our arrays
    let maxVertexIndex = 0;

    // First pass: find max vertex index
    for (const bone of bones) {
        const clusterInfo = boneModelMap.get(bone.modelId);
        if (!clusterInfo) continue;

        const indexesNode = findChildByName(clusterInfo.clusterNode, "Indexes");
        if (!indexesNode) continue;

        const indexes = toInt32Array(indexesNode.properties[0]?.value);
        if (!indexes) continue;

        for (let i = 0; i < indexes.length; i++) {
            if (indexes[i] > maxVertexIndex) maxVertexIndex = indexes[i];
        }
    }

    // Initialize arrays
    const vertexCount = maxVertexIndex + 1;
    const boneIndices: number[][] = new Array(vertexCount);
    const boneWeights: number[][] = new Array(vertexCount);
    for (let i = 0; i < vertexCount; i++) {
        boneIndices[i] = [];
        boneWeights[i] = [];
    }

    // Second pass: collect influences
    for (const bone of bones) {
        const clusterInfo = boneModelMap.get(bone.modelId);
        if (!clusterInfo) continue;

        const indexesNode = findChildByName(clusterInfo.clusterNode, "Indexes");
        const weightsNode = findChildByName(clusterInfo.clusterNode, "Weights");
        if (!indexesNode || !weightsNode) continue;

        const indexes = toInt32Array(indexesNode.properties[0]?.value);
        const weights = toFloat64Array(weightsNode.properties[0]?.value);
        if (!indexes || !weights) continue;

        for (let i = 0; i < indexes.length; i++) {
            const vertIdx = indexes[i];
            boneIndices[vertIdx].push(bone.index);
            boneWeights[vertIdx].push(weights[i]);
        }
    }

    // Normalize: limit to 4 influences per vertex, sort by weight descending
    for (let i = 0; i < vertexCount; i++) {
        if (boneIndices[i].length <= 4) continue;

        // Sort by weight descending and keep top 4
        const pairs = boneIndices[i].map((bi, idx) => ({
            index: bi,
            weight: boneWeights[i][idx],
        }));
        pairs.sort((a, b) => b.weight - a.weight);
        boneIndices[i] = pairs.slice(0, 4).map((p) => p.index);
        boneWeights[i] = pairs.slice(0, 4).map((p) => p.weight);
    }

    // Normalize weights to sum to 1.0
    for (let i = 0; i < vertexCount; i++) {
        const sum = boneWeights[i].reduce((a, b) => a + b, 0);
        if (sum > 0) {
            for (let j = 0; j < boneWeights[i].length; j++) {
                boneWeights[i][j] /= sum;
            }
        }
    }

    return { boneIndices, boneWeights };
}

// ── Utilities ──────────────────────────────────────────────────────────────────

function toNumber(value: unknown): number | undefined {
    if (typeof value === "number") return value;
    if (typeof value === "bigint") return Number(value);
    return undefined;
}

function toInt32Array(value: unknown): Int32Array | null {
    if (value instanceof Int32Array) return value;
    if (value instanceof Float64Array) {
        const result = new Int32Array(value.length);
        for (let i = 0; i < value.length; i++) result[i] = Math.round(value[i]);
        return result;
    }
    return null;
}

function toFloat64Array(value: unknown): Float64Array | null {
    if (value instanceof Float64Array) return value;
    if (value instanceof Float32Array) return new Float64Array(value);
    return null;
}
