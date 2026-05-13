import type { FBXDocument, FBXNode } from "../types/fbxTypes.js";
import { findDocumentNode, getPropertyValue } from "../types/fbxTypes.js";

/** Connection type: OO = object-to-object, OP = object-to-property */
export type ConnectionType = "OO" | "OP";

export interface FBXConnection {
    type: ConnectionType;
    childId: bigint;
    parentId: bigint;
    /** For OP connections, the property name on the parent (e.g. "DiffuseColor") */
    propertyName?: string;
}

export interface FBXObjectMap {
    /** All objects by their unique ID */
    objects: Map<bigint, FBXNode>;
    /** Children of each object ID */
    childrenOf: Map<bigint, { id: bigint; propertyName?: string }[]>;
    /** Parent of each object ID */
    parentOf: Map<bigint, { id: bigint; propertyName?: string }>;
    /** Raw connection list */
    connections: FBXConnection[];
}

/**
 * Build a connection graph from a parsed FBX document.
 * Maps object IDs to their FBXNode and resolves parent-child relationships.
 */
export function resolveConnections(doc: FBXDocument): FBXObjectMap {
    const objects = new Map<bigint, FBXNode>();
    const childrenOf = new Map<bigint, { id: bigint; propertyName?: string }[]>();
    const parentOf = new Map<bigint, { id: bigint; propertyName?: string }>();
    const connections: FBXConnection[] = [];

    // Build object map from Objects section
    const objectsNode = findDocumentNode(doc, "Objects");
    if (objectsNode) {
        for (const obj of objectsNode.children) {
            const idProp = obj.properties[0];
            if (idProp) {
                const id = toBigInt(idProp.value);
                if (id !== undefined) {
                    objects.set(id, obj);
                }
            }
        }
    }

    // Parse connections
    const connectionsNode = findDocumentNode(doc, "Connections");
    if (connectionsNode) {
        for (const c of connectionsNode.children) {
            if (c.name !== "C") continue;

            const type = getPropertyValue<string>(c, 0) as ConnectionType;
            const childIdRaw = c.properties[1]?.value;
            const parentIdRaw = c.properties[2]?.value;

            if (childIdRaw === undefined || parentIdRaw === undefined) continue;

            const childId = toBigInt(childIdRaw);
            const parentId = toBigInt(parentIdRaw);
            if (childId === undefined || parentId === undefined) continue;

            const propertyName =
                type === "OP" && c.properties.length > 3
                    ? getPropertyValue<string>(c, 3)
                    : undefined;

            connections.push({ type, childId, parentId, propertyName });

            // Build childrenOf
            if (!childrenOf.has(parentId)) {
                childrenOf.set(parentId, []);
            }
            childrenOf.get(parentId)!.push({ id: childId, propertyName });

            // Build parentOf
            parentOf.set(childId, { id: parentId, propertyName });
        }
    }

    return { objects, childrenOf, parentOf, connections };
}

/** Get all child objects of a given parent ID, optionally filtered by node name */
export function getChildren(
    map: FBXObjectMap,
    parentId: bigint,
    nodeName?: string
): { id: bigint; node: FBXNode; propertyName?: string }[] {
    const children = map.childrenOf.get(parentId) ?? [];
    const result: { id: bigint; node: FBXNode; propertyName?: string }[] = [];

    for (const child of children) {
        const node = map.objects.get(child.id);
        if (node && (!nodeName || node.name === nodeName)) {
            result.push({ id: child.id, node, propertyName: child.propertyName });
        }
    }

    return result;
}

function toBigInt(value: unknown): bigint | undefined {
    if (typeof value === "bigint") return value;
    if (typeof value === "number") return BigInt(Math.round(value));
    return undefined;
}
