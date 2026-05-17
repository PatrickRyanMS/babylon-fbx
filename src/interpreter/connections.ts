import type { FBXDocument, FBXNode } from "../types/fbxTypes.js";
import { cleanFBXName, findDocumentNode, getPropertyValue } from "../types/fbxTypes.js";

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
    const legacyIds = new Map<string, bigint>();
    let nextLegacyId = -1n;

    const getLegacyId = (name: string): bigint => {
        let id = legacyIds.get(name);
        if (id === undefined) {
            id = nextLegacyId--;
            legacyIds.set(name, id);
        }
        return id;
    };

    // Build object map from Objects section
    const objectsNode = findDocumentNode(doc, "Objects");
    if (objectsNode) {
        for (const obj of objectsNode.children) {
            const idProp = obj.properties[0];
            if (idProp) {
                const id = toBigInt(idProp.value);
                if (id !== undefined) {
                    objects.set(id, obj);
                } else if (typeof idProp.value === "string") {
                    const legacyName = cleanFBXName(idProp.value);
                    const id = getLegacyId(legacyName);
                    const normalized = normalizeLegacyObject(obj, id);
                    objects.set(id, normalized);

                    if (obj.name === "Model" && getPropertyValue<string>(obj, 1) === "Mesh") {
                        const geometryId = getLegacyId(`${legacyName}\0Geometry`);
                        objects.set(geometryId, createLegacyGeometry(obj, geometryId));
                        addConnection(connections, childrenOf, parentOf, "OO", geometryId, id);
                    }
                }
            }
        }
    }

    // Parse connections
    const connectionsNode = findDocumentNode(doc, "Connections");
    if (connectionsNode) {
        for (const c of connectionsNode.children) {
            if (c.name !== "C" && c.name !== "Connect") continue;

            const type = getPropertyValue<string>(c, 0) as ConnectionType;
            const childIdRaw = c.properties[1]?.value;
            const parentIdRaw = c.properties[2]?.value;

            if (childIdRaw === undefined || parentIdRaw === undefined) continue;

            const childId = toObjectId(childIdRaw, legacyIds);
            const parentId = toObjectId(parentIdRaw, legacyIds);
            if (childId === undefined || parentId === undefined) continue;

            const propertyName =
                type === "OP" && c.properties.length > 3
                    ? getPropertyValue<string>(c, 3)
                    : undefined;

            addConnection(connections, childrenOf, parentOf, type, childId, parentId, propertyName);
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

function toObjectId(value: unknown, legacyIds: Map<string, bigint>): bigint | undefined {
    const numericId = toBigInt(value);
    if (numericId !== undefined) return numericId;
    if (typeof value !== "string") return undefined;
    const legacyName = cleanFBXName(value);
    if (legacyName === "Scene") return 0n;
    return legacyIds.get(legacyName);
}

function addConnection(
    connections: FBXConnection[],
    childrenOf: Map<bigint, { id: bigint; propertyName?: string }[]>,
    parentOf: Map<bigint, { id: bigint; propertyName?: string }>,
    type: ConnectionType,
    childId: bigint,
    parentId: bigint,
    propertyName?: string
): void {
    connections.push({ type, childId, parentId, propertyName });

    if (!childrenOf.has(parentId)) {
        childrenOf.set(parentId, []);
    }
    childrenOf.get(parentId)!.push({ id: childId, propertyName });
    parentOf.set(childId, { id: parentId, propertyName });
}

function normalizeLegacyObject(node: FBXNode, id: bigint): FBXNode {
    const name = cleanFBXName(getPropertyValue<string>(node, 0) ?? node.name);
    const subType = getPropertyValue<string>(node, 1) ?? "";
    return {
        ...node,
        properties: [
            { type: "int64", value: id },
            { type: "string", value: name },
            { type: "string", value: subType },
        ],
    };
}

function createLegacyGeometry(modelNode: FBXNode, geometryId: bigint): FBXNode {
    const name = cleanFBXName(getPropertyValue<string>(modelNode, 0) ?? "Geometry");
    return {
        name: "Geometry",
        properties: [
            { type: "int64", value: geometryId },
            { type: "string", value: name },
            { type: "string", value: "Mesh" },
        ],
        children: modelNode.children,
    };
}
