import { resolveConnections } from "../../src/interpreter/connections.js";
import { cleanFBXName, findDocumentNode, type FBXDocument, type FBXNode } from "../../src/types/fbxTypes.js";

export interface FBXFeatureInventory {
    version: number;
    nodeNames: Map<string, number>;
    objectTypes: Map<string, number>;
    connectionTypes: Map<string, number>;
    propertyNames: Set<string>;
    deformerTypes: Map<string, number>;
    materialTextureSlots: Set<string>;
    layerElementTypes: Map<string, number>;
    animationTargets: Set<string>;
    nodeAttributeTypes: Map<string, number>;
}

export function collectFBXFeatureInventory(doc: FBXDocument): FBXFeatureInventory {
    const inventory: FBXFeatureInventory = {
        version: doc.version,
        nodeNames: new Map(),
        objectTypes: new Map(),
        connectionTypes: new Map(),
        propertyNames: new Set(),
        deformerTypes: new Map(),
        materialTextureSlots: new Set(),
        layerElementTypes: new Map(),
        animationTargets: new Set(),
        nodeAttributeTypes: new Map(),
    };

    for (const node of doc.nodes) {
        walkNode(node, inventory);
    }

    const objectMap = resolveConnections(doc);
    for (const node of objectMap.objects.values()) {
        const subType = getStringProperty(node, 2) ?? getStringProperty(node, 1) ?? "";
        increment(inventory.objectTypes, subType ? `${node.name}:${cleanFBXName(subType)}` : node.name);

        if (node.name === "Deformer" && subType) {
            increment(inventory.deformerTypes, cleanFBXName(subType));
        }

        if (node.name === "NodeAttribute" && subType) {
            increment(inventory.nodeAttributeTypes, cleanFBXName(subType));
        }

        if (node.name === "AnimationCurveNode" && subType) {
            inventory.animationTargets.add(cleanFBXName(subType));
        }
    }

    for (const connection of objectMap.connections) {
        increment(inventory.connectionTypes, connection.type);
        if (connection.propertyName) {
            inventory.materialTextureSlots.add(connection.propertyName);
            inventory.animationTargets.add(connection.propertyName);
        }
    }

    const connectionsNode = findDocumentNode(doc, "Connections");
    for (const connection of connectionsNode?.children ?? []) {
        if (connection.name === "C" || connection.name === "Connect") {
            const type = getStringProperty(connection, 0);
            increment(inventory.connectionTypes, type ? `${connection.name}:${type}` : connection.name);
        }
    }

    return inventory;
}

function walkNode(node: FBXNode, inventory: FBXFeatureInventory): void {
    increment(inventory.nodeNames, node.name);

    if (node.name.startsWith("LayerElement")) {
        increment(inventory.layerElementTypes, node.name);
    }

    if (node.name === "P" || node.name === "Property") {
        const propertyName = getStringProperty(node, 0);
        if (propertyName) {
            inventory.propertyNames.add(propertyName);
        }
    }

    for (const child of node.children) {
        walkNode(child, inventory);
    }
}

function getStringProperty(node: FBXNode, index: number): string | undefined {
    const value = node.properties[index]?.value;
    return typeof value === "string" ? value : undefined;
}

function increment(map: Map<string, number>, key: string): void {
    map.set(key, (map.get(key) ?? 0) + 1);
}
