import type { FBXNode } from "../types/fbxTypes.js";
import { findChildByName, getPropertyValue, cleanFBXName } from "../types/fbxTypes.js";
import type { FBXObjectMap } from "./connections.js";
import { getChildren } from "./connections.js";

/** A single morph target (shape) within a blend shape channel */
export interface FBXShapeData {
    /** Sparse vertex indices affected by this shape */
    indices: Uint32Array;
    /** Absolute vertex positions for affected vertices [x,y,z,...] */
    vertices: Float64Array;
    /** Normals for affected vertices [x,y,z,...] (optional) */
    normals: Float64Array | null;
}

/** A blend shape channel (one animatable morph target) */
export interface FBXBlendShapeChannelData {
    /** Channel name */
    name: string;
    /** Channel node ID */
    id: bigint;
    /** Default weight (0-100 in FBX) */
    deformPercent: number;
    /** Shape geometry (typically one per channel, but FBX supports in-between shapes) */
    shapes: FBXShapeData[];
}

/** A blend shape deformer attached to a geometry */
export interface FBXBlendShapeData {
    /** Deformer ID */
    id: bigint;
    /** Geometry ID this blend shape is attached to */
    geometryId: bigint;
    /** Channels (each is an animatable morph target) */
    channels: FBXBlendShapeChannelData[];
}

/**
 * Extract all blend shape deformers from the FBX scene.
 */
export function extractBlendShapes(objectMap: FBXObjectMap): FBXBlendShapeData[] {
    const blendShapes: FBXBlendShapeData[] = [];

    for (const [id, node] of objectMap.objects) {
        if (node.name === "Deformer" && getPropertyValue<string>(node, 2) === "BlendShape") {
            const bs = extractBlendShape(id, node, objectMap);
            if (bs) blendShapes.push(bs);
        }
    }

    return blendShapes;
}

function extractBlendShape(
    deformerId: bigint,
    _deformerNode: FBXNode,
    objectMap: FBXObjectMap
): FBXBlendShapeData | null {
    // Find the geometry this blend shape is attached to
    const parent = objectMap.parentOf.get(deformerId);
    if (!parent) return null;

    const parentNode = objectMap.objects.get(parent.id);
    if (!parentNode || parentNode.name !== "Geometry") return null;

    const geometryId = parent.id;

    // Find BlendShapeChannel children
    const channels: FBXBlendShapeChannelData[] = [];
    const channelChildren = getChildren(objectMap, deformerId, "Deformer");

    for (const { id: channelId, node: channelNode } of channelChildren) {
        const subType = getPropertyValue<string>(channelNode, 2);
        if (subType !== "BlendShapeChannel") continue;

        const channelName = cleanFBXName(getPropertyValue<string>(channelNode, 1) ?? "MorphTarget");

        // Read DeformPercent from Properties70
        let deformPercent = 0;
        const props70 = findChildByName(channelNode, "Properties70");
        if (props70) {
            for (const p of props70.children) {
                if (p.name !== "P") continue;
                const pName = getPropertyValue<string>(p, 0);
                if (pName === "DeformPercent") {
                    const val = p.properties[4]?.value;
                    if (typeof val === "number") deformPercent = val;
                    else if (typeof val === "bigint") deformPercent = Number(val);
                }
            }
        }

        // Also check for FullWeights node (contains target weights for in-between shapes)
        // For now we just extract shapes

        // Find connected Shape geometries
        const shapes: FBXShapeData[] = [];
        const shapeChildren = getChildren(objectMap, channelId, "Geometry");

        for (const { node: shapeNode } of shapeChildren) {
            const shapeSubType = getPropertyValue<string>(shapeNode, 2);
            if (shapeSubType !== "Shape") continue;

            const shape = extractShape(shapeNode);
            if (shape) shapes.push(shape);
        }

        if (shapes.length > 0) {
            channels.push({
                name: channelName,
                id: channelId,
                deformPercent,
                shapes,
            });
        }
    }

    if (channels.length === 0) return null;

    return {
        id: deformerId,
        geometryId,
        channels,
    };
}

function extractShape(shapeNode: FBXNode): FBXShapeData | null {
    // Shape has: Indexes (sparse vertex indices), Vertices (delta or absolute positions), Normals (optional)
    const indexesNode = findChildByName(shapeNode, "Indexes");
    const verticesNode = findChildByName(shapeNode, "Vertices");

    if (!indexesNode || !verticesNode) return null;

    const rawIndices = indexesNode.properties[0]?.value;
    const rawVertices = verticesNode.properties[0]?.value;

    if (!rawIndices || !rawVertices) return null;

    // Convert indices
    let indices: Uint32Array;
    if (rawIndices instanceof Int32Array) {
        indices = new Uint32Array(rawIndices.length);
        for (let i = 0; i < rawIndices.length; i++) indices[i] = rawIndices[i];
    } else if (rawIndices instanceof Uint32Array) {
        indices = rawIndices;
    } else {
        return null;
    }

    // Convert vertices
    let vertices: Float64Array;
    if (rawVertices instanceof Float64Array) {
        vertices = rawVertices;
    } else if (rawVertices instanceof Float32Array) {
        vertices = new Float64Array(rawVertices);
    } else {
        return null;
    }

    // Optional normals
    let normals: Float64Array | null = null;
    const normalsNode = findChildByName(shapeNode, "Normals");
    if (normalsNode) {
        const rawNormals = normalsNode.properties[0]?.value;
        if (rawNormals instanceof Float64Array) {
            normals = rawNormals;
        } else if (rawNormals instanceof Float32Array) {
            normals = new Float64Array(rawNormals);
        }
    }

    return { indices, vertices, normals };
}
