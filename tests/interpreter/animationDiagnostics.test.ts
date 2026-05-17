import { describe, expect, it } from "vitest";

import { extractAnimations } from "../../src/interpreter/animation.js";
import { resolveConnections } from "../../src/interpreter/connections.js";
import type { FBXDocument, FBXNode, FBXProperty } from "../../src/types/fbxTypes.js";

describe("FBX animation diagnostics", () => {
    it("preserves layer weights, blend modes, and unsupported curve nodes", () => {
        const animations = extractAnimations(resolveConnections(createAnimationDocument()));
        const animation = animations[0];

        expect(animation.layers).toHaveLength(2);
        expect(animation.layers[0].weight).toBe(50);
        expect(animation.layers[0].normalizedWeight).toBe(0.5);
        expect(animation.unsupportedCurveNodes[0]).toMatchObject({
            type: "Visibility",
            targetId: 10n,
            propertyName: "Visibility",
            curveCount: 1,
            defaultValues: {},
        });
        expect(animation.diagnostics.map((diagnostic) => diagnostic.type)).toEqual(expect.arrayContaining([
            "multiple-animation-layers",
            "partial-layer-weight",
            "unsupported-layer-blend-mode",
            "unsupported-curve-node",
        ]));
    });

    it("preserves unsupported-only animation stacks as diagnostics instead of dropping them", () => {
        const animations = extractAnimations(resolveConnections(createUnsupportedOnlyAnimationDocument()));
        const animation = animations[0];

        expect(animations).toHaveLength(1);
        expect(animation.curveNodes).toHaveLength(0);
        expect(animation.unsupportedCurveNodes).toHaveLength(1);
        expect(animation.unsupportedCurveNodes[0]).toMatchObject({
            type: "Visibility",
            targetId: 10n,
            propertyName: "Visibility",
            curveCount: 1,
            defaultValues: { "d|X": 0.25 },
        });
        expect(animation.unsupportedCurveNodes[0].curves[0].keys.map((key) => key.time)).toEqual([0, 1]);
        expect(animation.duration).toBe(1);
        expect(animation.diagnostics.map((diagnostic) => diagnostic.type)).toContain("unsupported-curve-node");
    });
});

function createAnimationDocument(): FBXDocument {
    return {
        version: 7500,
        nodes: [
            {
                name: "Objects",
                properties: [],
                children: [
                    createObject("Model", 10n, "Model::Cube", "Mesh"),
                    createObject("AnimationStack", 20n, "AnimStack::Take", ""),
                    createAnimationLayer(21n, "AnimLayer::Base", 50, 1),
                    createAnimationLayer(22n, "AnimLayer::Add", 100, 0),
                    createObject("AnimationCurveNode", 30n, "AnimCurveNode::T", ""),
                    createObject("AnimationCurveNode", 31n, "AnimCurveNode::Visibility", ""),
                    createAnimationCurve(40n),
                    createAnimationCurve(41n),
                ],
            },
            {
                name: "Connections",
                properties: [],
                children: [
                    createConnection("OO", 21n, 20n),
                    createConnection("OO", 22n, 20n),
                    createConnection("OO", 30n, 21n),
                    createConnection("OO", 31n, 21n),
                    createConnection("OP", 30n, 10n, "Lcl Translation"),
                    createConnection("OP", 31n, 10n, "Visibility"),
                    createConnection("OP", 40n, 30n, "d|X"),
                    createConnection("OP", 41n, 31n, "d|X"),
                ],
            },
        ],
    };
}

function createUnsupportedOnlyAnimationDocument(): FBXDocument {
    return {
        version: 7500,
        nodes: [
            {
                name: "Objects",
                properties: [],
                children: [
                    createObject("Model", 10n, "Model::Cube", "Mesh"),
                    createObject("AnimationStack", 20n, "AnimStack::VisibilityOnly", ""),
                    createAnimationLayer(21n, "AnimLayer::Base", 100, 0),
                    {
                        ...createObject("AnimationCurveNode", 31n, "AnimCurveNode::Visibility", ""),
                        children: [
                            {
                                name: "Properties70",
                                properties: [],
                                children: [createProperty("d|X", "Number", 0.25)],
                            },
                        ],
                    },
                    createAnimationCurve(41n),
                ],
            },
            {
                name: "Connections",
                properties: [],
                children: [
                    createConnection("OO", 21n, 20n),
                    createConnection("OO", 31n, 21n),
                    createConnection("OP", 31n, 10n, "Visibility"),
                    createConnection("OP", 41n, 31n, "d|X"),
                ],
            },
        ],
    };
}

function createAnimationLayer(id: bigint, name: string, weight: number, blendMode: number): FBXNode {
    return {
        ...createObject("AnimationLayer", id, name, ""),
        children: [
            {
                name: "Properties70",
                properties: [],
                children: [
                    createProperty("Weight", "Number", weight),
                    createProperty("BlendMode", "enum", blendMode),
                ],
            },
        ],
    };
}

function createAnimationCurve(id: bigint): FBXNode {
    return {
        ...createObject("AnimationCurve", id, `AnimCurve::${id.toString()}`, ""),
        children: [
            { name: "KeyTime", properties: [{ type: "int64[]", value: new BigInt64Array([0n, 46186158000n]) }], children: [] },
            { name: "KeyValueFloat", properties: [{ type: "float32[]", value: new Float32Array([0, 1]) }], children: [] },
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

function createProperty(name: string, type: string, value: number): FBXNode {
    return {
        name: "P",
        properties: [
            { type: "string", value: name },
            { type: "string", value: type },
            { type: "string", value: "" },
            { type: "string", value: "" },
            { type: "float64", value },
        ],
        children: [],
    };
}

function createConnection(type: string, child: bigint, parent: bigint, propertyName?: string): FBXNode {
    const properties: FBXProperty[] = [
        { type: "string", value: type },
        { type: "int64", value: child },
        { type: "int64", value: parent },
    ];
    if (propertyName) properties.push({ type: "string", value: propertyName });
    return { name: "C", properties, children: [] };
}
