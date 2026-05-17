import { describe, expect, it } from "vitest";

import { interpretFBX } from "../../src/interpreter/fbxInterpreter.js";
import type { FBXDocument, FBXNode } from "../../src/types/fbxTypes.js";

describe("FBX scene diagnostics", () => {
    it("reports unsupported constraints, helpers, layered textures, poses, deformers, and node attributes", () => {
        const scene = interpretFBX(createUnsupportedSceneDocument());
        const types = scene.diagnostics.map((diagnostic) => diagnostic.type);

        expect(types).toEqual(expect.arrayContaining([
            "unsupported-constraint",
            "unsupported-helper",
            "unsupported-layered-texture",
            "unsupported-pose",
            "unsupported-deformer",
            "unsupported-node-attribute",
        ]));
        expect(scene.diagnostics.find((diagnostic) => diagnostic.type === "unsupported-constraint")?.objectName).toBe("Aim");
        expect(scene.diagnostics.find((diagnostic) => diagnostic.type === "unsupported-node-attribute")?.subType).toBe("Null");
    });

    it("promotes connection graph diagnostics to scene diagnostics", () => {
        const scene = interpretFBX({
            version: 7500,
            nodes: [
                { name: "Objects", properties: [], children: [createObject("Model", 1n, "Model::Root", "Null")] },
                {
                    name: "Connections",
                    properties: [],
                    children: [
                        {
                            name: "C",
                            properties: [
                                { type: "string", value: "XX" },
                                { type: "int64", value: 1n },
                                { type: "int64", value: 0n },
                            ],
                            children: [],
                        },
                    ],
                },
            ],
        });

        expect(scene.diagnostics).toContainEqual(expect.objectContaining({
            type: "connection-graph",
            subType: "unsupported-connection-type",
        }));
    });
});

function createUnsupportedSceneDocument(): FBXDocument {
    return {
        version: 7500,
        nodes: [
            {
                name: "Objects",
                properties: [],
                children: [
                    createObject("Constraint", 1n, "Constraint::Aim", "Aim"),
                    createObject("Character", 2n, "Character::RigControls", ""),
                    createObject("ControlSet", 3n, "ControlSet::Controls", ""),
                    createObject("LayeredTexture", 4n, "LayeredTexture::DiffuseStack", ""),
                    createObject("Pose", 5n, "Pose::Rest", "RestPose"),
                    createObject("Deformer", 6n, "Deformer::Cache", "VertexCacheDeformer"),
                    createObject("NodeAttribute", 7n, "NodeAttribute::Locator", "Null"),
                ],
            },
            {
                name: "Connections",
                properties: [],
                children: [
                    createConnection(2n, 1n),
                    createConnection(7n, 2n),
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

function createConnection(child: bigint, parent: bigint): FBXNode {
    return {
        name: "C",
        properties: [
            { type: "string", value: "OO" },
            { type: "int64", value: child },
            { type: "int64", value: parent },
        ],
        children: [],
    };
}
