import { describe, expect, it } from "vitest";

import { resolveConnections } from "../../src/interpreter/connections.js";
import { extractSkins } from "../../src/interpreter/skeleton.js";
import type { FBXDocument, FBXNode, FBXProperty } from "../../src/types/fbxTypes.js";

describe("FBX skinning diagnostics", () => {
    it("preserves cluster mode and records bind/associate diagnostics", () => {
        const skins = extractSkins(resolveConnections(createSkinDocument()));
        const skin = skins[0];
        const bone = skin.bones[0];

        expect(bone.clusterMode).toBe("Additive");
        expect(bone.transformAssociateModelMatrix).not.toBeNull();
        expect(skin.diagnostics.map((diagnostic) => diagnostic.type)).toContain("cluster-mode-runtime-unsupported");
        expect(skin.diagnostics.map((diagnostic) => diagnostic.type)).toContain("missing-cluster-transform-link");
        expect(skin.diagnostics.map((diagnostic) => diagnostic.type)).toContain("associate-model-present");
    });
});

function createSkinDocument(): FBXDocument {
    return {
        version: 7500,
        nodes: [
            {
                name: "Objects",
                properties: [],
                children: [
                    createObject("Geometry", 1n, "Geometry::Mesh", "Mesh"),
                    createObject("Deformer", 2n, "Deformer::Skin", "Skin"),
                    {
                        ...createObject("Deformer", 3n, "SubDeformer::Cluster", "Cluster"),
                        children: [
                            { name: "Mode", properties: [{ type: "string", value: "Additive" }], children: [] },
                            { name: "Indexes", properties: [{ type: "int32[]", value: new Int32Array([0]) }], children: [] },
                            { name: "Weights", properties: [{ type: "float64[]", value: new Float64Array([1]) }], children: [] },
                            { name: "Transform", properties: [{ type: "float64[]", value: identityMatrix() }], children: [] },
                            { name: "TransformAssociateModel", properties: [{ type: "float64[]", value: identityMatrix() }], children: [] },
                        ],
                    },
                    createObject("Model", 4n, "Model::Bone", "LimbNode"),
                ],
            },
            {
                name: "Connections",
                properties: [],
                children: [
                    createConnection("OO", 2n, 1n),
                    createConnection("OO", 3n, 2n),
                    createConnection("OO", 4n, 3n),
                ],
            },
        ],
    };
}

function createObject(name: string, id: bigint, objectName: string, subType: string): FBXNode {
    return {
        name,
        properties: [
            { type: "int64", value: id },
            { type: "string", value: objectName },
            { type: "string", value: subType },
        ],
        children: [],
    };
}

function createConnection(type: string, child: bigint, parent: bigint): FBXNode {
    const properties: FBXProperty[] = [
        { type: "string", value: type },
        { type: "int64", value: child },
        { type: "int64", value: parent },
    ];
    return { name: "C", properties, children: [] };
}

function identityMatrix(): Float64Array {
    return new Float64Array([
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1,
    ]);
}
