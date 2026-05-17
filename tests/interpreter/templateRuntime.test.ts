import { describe, expect, it } from "vitest";

import { interpretFBX } from "../../src/interpreter/fbxInterpreter.js";
import type { FBXDocument, FBXNode, FBXProperty } from "../../src/types/fbxTypes.js";

describe("FBX property template runtime fallback", () => {
    it("uses template defaults for model transforms, material properties, and texture properties", () => {
        const scene = interpretFBX(createTemplateFallbackDocument());
        const root = scene.rootModels[0];
        const material = scene.materials[0];
        const texture = material.textures[0];

        expect(root.scale).toEqual([2, 3, 4]);
        expect(root.geometricTranslation).toEqual([1, 2, 3]);
        expect(root.inheritType).toBe(2);
        expect(root.diagnostics[0]).toContain("InheritType 2");
        expect(material.type).toBe("Phong");
        expect(material.properties.diffuseColor).toEqual([0.2, 0.3, 0.4]);
        expect(material.properties.shininess).toBe(25);
        expect(texture.uvTranslation).toEqual([0.1, 0.2]);
        expect(texture.uvScaling).toEqual([2, 2]);
        expect(texture.uvRotation).toBe(45);
        expect(texture.uvSetName).toBe("UVChannel_1");
    });

    it("keeps object-local properties ahead of template defaults", () => {
        const doc = createTemplateFallbackDocument();
        const model = findObject(doc, "Model")!;
        model.children.push({
            name: "Properties70",
            properties: [],
            children: [
                createPropertyNode("Lcl Scaling", "Lcl Scaling", "", "A", [5, 6, 7]),
            ],
        });

        const scene = interpretFBX(doc);

        expect(scene.rootModels[0].scale).toEqual([5, 6, 7]);
    });

    it("uses template defaults for camera and light properties", () => {
        const scene = interpretFBX(createCameraLightTemplateDocument());
        const camera = scene.cameras[0];
        const light = scene.lights[0];

        expect(camera.projectionType).toBe("orthographic");
        expect(camera.fieldOfView).toBeCloseTo((2 * Math.atan((0.98 * 25.4) / (2 * 35))) * 180 / Math.PI, 6);
        expect(camera.orthoZoom).toBe(12);
        expect(camera.roll).toBe(5);
        expect(camera.aspectRatio).toBeCloseTo(1.5, 6);
        expect(light.lightType).toBe(2);
        expect(light.color).toEqual([0.4, 0.5, 0.6]);
        expect(light.intensity).toBeCloseTo(0.75, 6);
        expect(light.innerAngle).toBe(12);
        expect(light.outerAngle).toBe(40);
        expect(light.coneAngle).toBe(40);
        expect(light.decayStart).toBe(25);
        expect(light.enableFarAttenuation).toBe(true);
    });
});

function createTemplateFallbackDocument(): FBXDocument {
    return {
        version: 7500,
        nodes: [
            {
                name: "Definitions",
                properties: [],
                children: [
                    createObjectType("Model", "FbxNode", [
                        createPropertyNode("Lcl Scaling", "Lcl Scaling", "", "A", [2, 3, 4]),
                        createPropertyNode("GeometricTranslation", "Vector3D", "Vector", "A", [1, 2, 3]),
                        createPropertyNode("InheritType", "enum", "", "", [2]),
                    ]),
                    createObjectType("Material", "FbxSurfacePhong", [
                        createPropertyNode("ShadingModel", "KString", "", "", ["Phong"]),
                        createPropertyNode("DiffuseColor", "Color", "", "A", [0.2, 0.3, 0.4]),
                        createPropertyNode("Shininess", "Number", "", "A", [25]),
                    ]),
                    createObjectType("Texture", "FbxFileTexture", [
                        createPropertyNode("Translation", "Vector", "", "A", [0.1, 0.2]),
                        createPropertyNode("Scaling", "Vector", "", "A", [2, 2]),
                        createPropertyNode("Rotation", "Number", "", "A", [45]),
                        createPropertyNode("UVSet", "KString", "", "A", ["UVChannel_1"]),
                    ]),
                ],
            },
            {
                name: "Objects",
                properties: [],
                children: [
                    createObject("Model", 1n, "Model::Root", "Mesh"),
                    createObject("Material", 2n, "Material::Mat", ""),
                    {
                        ...createObject("Texture", 3n, "Texture::Tex", ""),
                        children: [
                            { name: "FileName", properties: [{ type: "string", value: "texture.png" }], children: [] },
                            { name: "RelativeFilename", properties: [{ type: "string", value: "texture.png" }], children: [] },
                        ],
                    },
                ],
            },
            {
                name: "Connections",
                properties: [],
                children: [
                    createConnection("OO", 1n, 0n),
                    createConnection("OO", 2n, 1n),
                    createConnection("OP", 3n, 2n, "DiffuseColor"),
                ],
            },
        ],
    };
}

function createCameraLightTemplateDocument(): FBXDocument {
    return {
        version: 7500,
        nodes: [
            {
                name: "Definitions",
                properties: [],
                children: [
                    createObjectType("NodeAttribute", "FbxCamera", [
                        createPropertyNode("CameraProjectionType", "enum", "", "", [1]),
                        createPropertyNode("FocalLength", "Number", "", "A", [35]),
                        createPropertyNode("FilmHeight", "Number", "", "A", [0.98]),
                        createPropertyNode("FilmAspectRatio", "Number", "", "A", [1.5]),
                        createPropertyNode("NearPlane", "Number", "", "A", [0.25]),
                        createPropertyNode("FarPlane", "Number", "", "A", [500]),
                        createPropertyNode("OrthoZoom", "Number", "", "A", [12]),
                        createPropertyNode("Roll", "Number", "", "A", [5]),
                    ]),
                    createObjectType("NodeAttribute", "FbxLight", [
                        createPropertyNode("LightType", "enum", "", "", [2]),
                        createPropertyNode("Color", "Color", "", "A", [0.4, 0.5, 0.6]),
                        createPropertyNode("Intensity", "Number", "", "A", [75]),
                        createPropertyNode("InnerAngle", "Number", "", "A", [12]),
                        createPropertyNode("OuterAngle", "Number", "", "A", [40]),
                        createPropertyNode("DecayStart", "Number", "", "A", [25]),
                        createPropertyNode("EnableFarAttenuation", "bool", "", "", [1]),
                    ]),
                ],
            },
            {
                name: "Objects",
                properties: [],
                children: [
                    createObject("Model", 1n, "Model::CameraModel", "Camera"),
                    createObject("NodeAttribute", 2n, "NodeAttribute::CameraAttr", "Camera"),
                    createObject("Model", 3n, "Model::LightModel", "Light"),
                    createObject("NodeAttribute", 4n, "NodeAttribute::LightAttr", "Light"),
                ],
            },
            {
                name: "Connections",
                properties: [],
                children: [
                    createConnection("OO", 1n, 0n),
                    createConnection("OO", 2n, 1n),
                    createConnection("OO", 3n, 0n),
                    createConnection("OO", 4n, 3n),
                ],
            },
        ],
    };
}

function createObjectType(objectType: string, templateName: string, properties: FBXNode[]): FBXNode {
    return {
        name: "ObjectType",
        properties: [{ type: "string", value: objectType }],
        children: [
            {
                name: "PropertyTemplate",
                properties: [{ type: "string", value: templateName }],
                children: [
                    {
                        name: "Properties70",
                        properties: [],
                        children: properties,
                    },
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

function createConnection(type: string, child: bigint, parent: bigint, propertyName?: string): FBXNode {
    const properties: FBXProperty[] = [
        { type: "string", value: type },
        { type: "int64", value: child },
        { type: "int64", value: parent },
    ];
    if (propertyName) properties.push({ type: "string", value: propertyName });
    return { name: "C", properties, children: [] };
}

function createPropertyNode(name: string, propertyType: string, label: string, flags: string, values: number[] | string[]): FBXNode {
    return {
        name: "P",
        properties: [
            { type: "string", value: name },
            { type: "string", value: propertyType },
            { type: "string", value: label },
            { type: "string", value: flags },
            ...values.map((value) => ({
                type: typeof value === "number" ? "float64" as const : "string" as const,
                value,
            })),
        ],
        children: [],
    };
}

function findObject(doc: FBXDocument, name: string): FBXNode | undefined {
    return doc.nodes.find((node) => node.name === "Objects")?.children.find((node) => node.name === name);
}
