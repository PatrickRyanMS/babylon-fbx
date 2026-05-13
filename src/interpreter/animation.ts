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

/** One animation clip (AnimationStack) */
export interface FBXAnimationStackData {
    /** Animation name */
    name: string;
    /** Duration in seconds */
    duration: number;
    /** Per-bone curve nodes */
    curveNodes: FBXCurveNodeData[];
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
    const layers = getChildren(objectMap, stackId, "AnimationLayer");
    if (layers.length === 0) return null;

    // Collect all CurveNodes from all layers
    const curveNodes: FBXCurveNodeData[] = [];
    let minTime = Infinity;
    let maxTime = 0;

    for (const { id: layerId } of layers) {
        // AnimationCurveNodes are children of the layer
        const curveNodeEntries = getChildren(objectMap, layerId, "AnimationCurveNode");

        for (const { id: curveNodeId, node: curveNodeNode } of curveNodeEntries) {
            const curveNodeData = extractCurveNode(curveNodeId, curveNodeNode, objectMap);
            if (!curveNodeData) continue;

            for (const curve of curveNodeData.curves) {
                for (const key of curve.keys) {
                    if (key.time < minTime) minTime = key.time;
                    if (key.time > maxTime) maxTime = key.time;
                }
            }

            curveNodes.push(curveNodeData);
        }
    }

    if (curveNodes.length === 0) return null;

    // Rebase all keyframe times so the animation starts at 0
    if (minTime > 0 && isFinite(minTime)) {
        for (const cn of curveNodes) {
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
        curveNodes,
    };
}

function extractCurveNode(
    curveNodeId: bigint,
    curveNodeNode: FBXNode,
    objectMap: FBXObjectMap
): FBXCurveNodeData | null {
    const typeName = cleanFBXName(getPropertyValue<string>(curveNodeNode, 1) ?? "");

    // Only process T (translation), R (rotation), S (scale)
    if (typeName !== "T" && typeName !== "R" && typeName !== "S") {
        return null;
    }

    // Find the target model via OP connection (CurveNode → Model)
    // The CurveNode connects to a Model via OP with property name like "Lcl Translation"
    const targetModelId = findCurveNodeTarget(curveNodeId, objectMap);
    if (targetModelId === null) return null;

    // Find AnimationCurve children connected via OP with channel name
    const curves = extractCurves(curveNodeId, objectMap);

    if (curves.length === 0) return null;

    return {
        type: typeName,
        targetModelId,
        curves,
    };
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
