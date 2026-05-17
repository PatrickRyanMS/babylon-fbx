import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

import {
    extractPropertyTemplates,
    getPropertyTemplate,
    getTemplatePropertyValue,
    resolvePropertyValues,
} from "../../src/interpreter/propertyTemplates.js";
import { parseBinaryFBX } from "../../src/parsers/fbxBinaryParser.js";
import type { FBXDocument, FBXNode } from "../../src/types/fbxTypes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const aishaPath = resolve(__dirname, "../models/anime-chibi-girl-aisha-by-seraphim/test2.fbx");
const vinoPath = resolve(__dirname, "../models/vino/SM_Vino.fbx");

describe("FBX property templates", () => {
    it("extracts model and material template defaults from Definitions", () => {
        const templates = extractPropertyTemplates(loadDocument(aishaPath));
        const modelTemplate = getPropertyTemplate(templates, "Model", "FbxNode");
        const materialTemplate = getPropertyTemplate(templates, "Material", "FbxSurfaceLambert");

        expect(modelTemplate?.properties.get("RotationOffset")?.values).toEqual([0, 0, 0]);
        expect(modelTemplate?.properties.get("InheritType")?.values[0]).toBe(0);
        expect(materialTemplate?.properties.get("DiffuseColor")?.values).toEqual([0.8, 0.8, 0.8]);
        expect(getTemplatePropertyValue<number>(materialTemplate, "DiffuseFactor")).toBe(1);
    });

    it("extracts fixture-specific template variants", () => {
        const templates = extractPropertyTemplates(loadDocument(vinoPath));
        const materialTemplate = getPropertyTemplate(templates, "Material", "FbxSurfacePhong");
        const textureTemplate = getPropertyTemplate(templates, "Texture", "FbxFileTexture");

        expect(getTemplatePropertyValue<string>(materialTemplate, "ShadingModel")).toBe("Phong");
        expect(getTemplatePropertyValue<number>(textureTemplate, "WrapModeU")).toBe(0);
        expect(getTemplatePropertyValue<number>(textureTemplate, "PremultiplyAlpha")).toBe(1);
    });

    it("resolves object-local properties before template defaults", () => {
        const template = getPropertyTemplate(extractPropertyTemplates(createSyntheticTemplateDocument()), "Material", "FbxSurfaceLambert");
        const materialNode = createSyntheticMaterialNode();

        expect(resolvePropertyValues(materialNode, template, "DiffuseFactor")).toEqual([0.25]);
        expect(resolvePropertyValues(materialNode, template, "AmbientFactor")).toEqual([1]);
        expect(resolvePropertyValues(materialNode, template, "MissingProperty")).toBeUndefined();
    });
});

function loadDocument(path: string): FBXDocument {
    const file = readFileSync(path);
    const buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
    return parseBinaryFBX(buffer);
}

function createSyntheticTemplateDocument(): FBXDocument {
    return {
        version: 7500,
        nodes: [
            {
                name: "Definitions",
                properties: [],
                children: [
                    {
                        name: "ObjectType",
                        properties: [{ type: "string", value: "Material" }],
                        children: [
                            {
                                name: "PropertyTemplate",
                                properties: [{ type: "string", value: "FbxSurfaceLambert" }],
                                children: [
                                    {
                                        name: "Properties70",
                                        properties: [],
                                        children: [
                                            createPropertyNode("DiffuseFactor", "Number", "", "A", [1]),
                                            createPropertyNode("AmbientFactor", "Number", "", "A", [1]),
                                        ],
                                    },
                                ],
                            },
                        ],
                    },
                ],
            },
        ],
    };
}

function createSyntheticMaterialNode(): FBXNode {
    return {
        name: "Material",
        properties: [
            { type: "int64", value: 1n },
            { type: "string", value: "Material" },
            { type: "string", value: "" },
        ],
        children: [
            {
                name: "Properties70",
                properties: [],
                children: [
                    createPropertyNode("DiffuseFactor", "Number", "", "A", [0.25]),
                ],
            },
        ],
    };
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
