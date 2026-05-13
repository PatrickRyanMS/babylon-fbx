import type { FBXNode } from "../types/fbxTypes.js";
import { findChildByName, getPropertyValue, cleanFBXName } from "../types/fbxTypes.js";
import type { FBXObjectMap } from "./connections.js";
import { getChildren } from "./connections.js";

/** FBX time units: 46186158000 ticks per second */
const FBX_TIME_UNIT = 46186158000;

/** A single keyframe */
export interface FBXKeyframe {
    /** Time in seconds */
    time: number;
    /** Value at this keyframe */
    value: number;
}

/** An animation curve (one axis of one property) */
export interface FBXCurveData {
    /** Channel: "d|X", "d|Y", "d|Z" */
    channel: string;
    /** Keyframes */
    keys: FBXKeyframe[];
}

/** An animation curve node (T/R/S for one bone) */
export interface FBXCurveNodeData {
    /** Property type: "T" (translation), "R" (rotation), "S" (scale) */
    type: string;
    /** Target model (bone) ID */
    targetModelId: bigint;
    /** Curves for each axis */
    curves: FBXCurveData[];
}

/** Animation layer with blend mode info */
export interface FBXAnimationLayerData {
    /** Layer name */
    name: string;
    /** Layer weight (0-100, default 100) */
    weight: number;
    /** Blend mode: 0=Additive, 1=Override, 2=OverridePassthrough */
    blendMode: number;
    /** Curve nodes in this layer */
    curveNodes: FBXCurveNodeData[];
}

/** One animation clip (AnimationStack) */
export interface FBXAnimationStackData {
    /** Animation name */
    name: string;
    /** Duration in seconds */
    duration: number;
    /** Per-bone curve nodes (flattened from all layers for backward compat) */
    curveNodes: FBXCurveNodeData[];
    /** Animation layers (preserves blend mode info) */
    layers: FBXAnimationLayerData[];
}

/**
 * Extract all animation stacks from the FBX scene.
 */
export function extractAnimations(objectMap: FBXObjectMap): FBXAnimationStackData[] {
    const stacks: FBXAnimationStackData[] = [];

    for (const [id, node] of objectMap.objects) {
        if (node.name === "AnimationStack") {
            const stack = extractAnimStack(id, node, objectMap);
            if (stack) stacks.push(stack);
        }
    }

    return stacks;
}

function extractAnimStack(
    stackId: bigint,
    stackNode: FBXNode,
    objectMap: FBXObjectMap
): FBXAnimationStackData | null {
    const name = cleanFBXName(getPropertyValue<string>(stackNode, 1) ?? "Animation");

    // Find AnimationLayer children of this stack
    const layerEntries = getChildren(objectMap, stackId, "AnimationLayer");
    if (layerEntries.length === 0) return null;

    // Collect all CurveNodes from all layers
    const allCurveNodes: FBXCurveNodeData[] = [];
    const layers: FBXAnimationLayerData[] = [];
    let minTime = Infinity;
    let maxTime = 0;

    for (const { id: layerId, node: layerNode } of layerEntries) {
        // Extract layer properties
        let layerName = cleanFBXName(getPropertyValue<string>(layerNode, 1) ?? "Layer");
        let weight = 100;
        let blendMode = 0;

        const props70 = findChildByName(layerNode, "Properties70");
        if (props70) {
            for (const p of props70.children) {
                if (p.name !== "P") continue;
                const pName = getPropertyValue<string>(p, 0);
                if (pName === "Weight") {
                    const v = p.properties[4]?.value;
                    if (typeof v === "number") weight = v;
                } else if (pName === "BlendMode") {
                    const v = p.properties[4]?.value;
                    if (typeof v === "number") blendMode = v;
                    else if (typeof v === "bigint") blendMode = Number(v);
                }
            }
        }

        // AnimationCurveNodes are children of the layer
        const curveNodeEntries = getChildren(objectMap, layerId, "AnimationCurveNode");
        const layerCurveNodes: FBXCurveNodeData[] = [];

        for (const { id: curveNodeId, node: curveNodeNode } of curveNodeEntries) {
            const curveNodeData = extractCurveNode(curveNodeId, curveNodeNode, objectMap);
            if (!curveNodeData) continue;

            for (const curve of curveNodeData.curves) {
                for (const key of curve.keys) {
                    if (key.time < minTime) minTime = key.time;
                    if (key.time > maxTime) maxTime = key.time;
                }
            }

            layerCurveNodes.push(curveNodeData);
            allCurveNodes.push(curveNodeData);
        }

        layers.push({
            name: layerName,
            weight,
            blendMode,
            curveNodes: layerCurveNodes,
        });
    }

    if (allCurveNodes.length === 0) return null;

    // Rebase all keyframe times so the animation starts at 0
    if (minTime > 0 && isFinite(minTime)) {
        for (const cn of allCurveNodes) {
            for (const curve of cn.curves) {
                for (const key of curve.keys) {
                    key.time -= minTime;
                }
            }
        }
        maxTime -= minTime;
    }

    return {
        name,
        duration: maxTime,
        curveNodes: allCurveNodes,
        layers,
    };
}

function extractCurveNode(
    curveNodeId: bigint,
    curveNodeNode: FBXNode,
    objectMap: FBXObjectMap
): FBXCurveNodeData | null {
    const typeName = cleanFBXName(getPropertyValue<string>(curveNodeNode, 1) ?? "");

    // Handle T (translation), R (rotation), S (scale) targeting Models
    if (typeName === "T" || typeName === "R" || typeName === "S") {
        const targetModelId = findCurveNodeTarget(curveNodeId, objectMap);
        if (targetModelId === null) return null;

        const curves = extractCurves(curveNodeId, objectMap);
        if (curves.length === 0) return null;

        return {
            type: typeName,
            targetModelId,
            curves,
        };
    }

    // Handle DeformPercent targeting BlendShapeChannels
    if (typeName === "DeformPercent") {
        const targetId = findCurveNodeBlendShapeTarget(curveNodeId, objectMap);
        if (targetId === null) return null;

        const curves = extractCurves(curveNodeId, objectMap);
        if (curves.length === 0) return null;

        return {
            type: "DeformPercent",
            targetModelId: targetId,
            curves,
        };
    }

    return null;
}

/**
 * Find the Model that an AnimationCurveNode targets.
 * The CurveNode connects to the Model via OP connection with a property name.
 */
function findCurveNodeTarget(curveNodeId: bigint, objectMap: FBXObjectMap): bigint | null {
    // Look for connections where this curveNode is a child (going up to parent)
    // The OP connection from curveNode → Model has the property name (e.g. "Lcl Translation")
    for (const conn of objectMap.connections) {
        if (conn.childId === curveNodeId && conn.type === "OP") {
            const parentNode = objectMap.objects.get(conn.parentId);
            if (parentNode && parentNode.name === "Model") {
                return conn.parentId;
            }
        }
    }
    return null;
}

/**
 * Find the BlendShapeChannel that a DeformPercent AnimationCurveNode targets.
 */
function findCurveNodeBlendShapeTarget(curveNodeId: bigint, objectMap: FBXObjectMap): bigint | null {
    for (const conn of objectMap.connections) {
        if (conn.childId === curveNodeId && conn.type === "OP") {
            const parentNode = objectMap.objects.get(conn.parentId);
            if (parentNode && parentNode.name === "Deformer") {
                const subType = getPropertyValue<string>(parentNode, 2);
                if (subType === "BlendShapeChannel") {
                    return conn.parentId;
                }
            }
        }
    }
    // Also check OO connections
    for (const conn of objectMap.connections) {
        if (conn.childId === curveNodeId && conn.type === "OO") {
            const parentNode = objectMap.objects.get(conn.parentId);
            if (parentNode && parentNode.name === "Deformer") {
                const subType = getPropertyValue<string>(parentNode, 2);
                if (subType === "BlendShapeChannel") {
                    return conn.parentId;
                }
            }
        }
    }
    return null;
}

/**
 * Extract AnimationCurves connected to a CurveNode.
 * Each curve connects via OP with channel "d|X", "d|Y", or "d|Z".
 */
function extractCurves(curveNodeId: bigint, objectMap: FBXObjectMap): FBXCurveData[] {
    const curves: FBXCurveData[] = [];

    // Find AnimationCurve children of this CurveNode
    for (const conn of objectMap.connections) {
        if (conn.parentId === curveNodeId && conn.type === "OP") {
            const curveNode = objectMap.objects.get(conn.childId);
            if (!curveNode || curveNode.name !== "AnimationCurve") continue;

            const channel = conn.propertyName ?? "d|X";
            const keys = extractKeyframes(curveNode);
            if (keys.length > 0) {
                curves.push({ channel, keys });
            }
        }
    }

    // Also check OO connections (some exporters use OO for curve→curveNode)
    if (curves.length === 0) {
        const ooChildren = getChildren(objectMap, curveNodeId, "AnimationCurve");
        // For OO connections, infer channel from order (X, Y, Z)
        const channelNames = ["d|X", "d|Y", "d|Z"];
        for (let i = 0; i < ooChildren.length && i < 3; i++) {
            const keys = extractKeyframes(ooChildren[i].node);
            if (keys.length > 0) {
                curves.push({ channel: channelNames[i], keys });
            }
        }
    }

    return curves;
}

/**
 * Extract keyframes from an AnimationCurve node.
 */
function extractKeyframes(curveNode: FBXNode): FBXKeyframe[] {
    const keyTimeNode = findChildByName(curveNode, "KeyTime");
    const keyValueNode = findChildByName(curveNode, "KeyValueFloat");

    if (!keyTimeNode || !keyValueNode) return [];

    const keyTimes = toInt64Array(keyTimeNode.properties[0]?.value);
    const keyValues = toFloat32Array(keyValueNode.properties[0]?.value);

    if (!keyTimes || !keyValues) return [];
    if (keyTimes.length !== keyValues.length) return [];

    const keys: FBXKeyframe[] = [];
    for (let i = 0; i < keyTimes.length; i++) {
        keys.push({
            time: Number(keyTimes[i]) / FBX_TIME_UNIT,
            value: keyValues[i],
        });
    }

    return keys;
}

// ── Utilities ──────────────────────────────────────────────────────────────────

function toInt64Array(value: unknown): BigInt64Array | null {
    if (value instanceof BigInt64Array) return value;
    return null;
}

function toFloat32Array(value: unknown): Float32Array | null {
    if (value instanceof Float32Array) return value;
    if (value instanceof Float64Array) {
        const result = new Float32Array(value.length);
        for (let i = 0; i < value.length; i++) result[i] = value[i];
        return result;
    }
    return null;
}
