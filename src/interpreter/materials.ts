import type { FBXNode } from "../types/fbxTypes.js";
import { findChildByName, getPropertyValue, findChildrenByName, cleanFBXName } from "../types/fbxTypes.js";
import type { FBXObjectMap } from "./connections.js";
import { getChildren } from "./connections.js";

/** Parsed material data */
export interface FBXMaterialData {
    id: bigint;
    name: string;
    type: "Lambert" | "Phong";
    properties: FBXMaterialProperties;
    textures: FBXTextureRef[];
}

export interface FBXMaterialProperties {
    diffuseColor?: [number, number, number];
    diffuseFactor?: number;
    ambientColor?: [number, number, number];
    ambientFactor?: number;
    specularColor?: [number, number, number];
    specularFactor?: number;
    shininess?: number;
    emissiveColor?: [number, number, number];
    emissiveFactor?: number;
    opacity?: number;
    transparencyFactor?: number;
}

export interface FBXTextureRef {
    /** Which material property this texture is connected to */
    propertyName: string;
    /** Absolute file path from the FBX */
    fileName: string;
    /** Relative file path from the FBX */
    relativeFileName: string;
    /** Texture node ID */
    id: bigint;
    /** Embedded texture data (from Video node Content), if available */
    embeddedData: Uint8Array | null;
    /** UV translation [u, v] */
    uvTranslation?: [number, number];
    /** UV scaling [u, v] */
    uvScaling?: [number, number];
    /** UV rotation in degrees */
    uvRotation?: number;
    /** Which UV set index this texture uses */
    uvSetIndex?: number;
    /** Which named UV set this texture uses */
    uvSetName?: string;
}

/**
 * Extract material data from an FBX Material node.
 */
export function extractMaterial(
    materialNode: FBXNode,
    materialId: bigint,
    objectMap: FBXObjectMap
): FBXMaterialData {
    const name = cleanFBXName(getPropertyValue<string>(materialNode, 1) ?? "Material");

    // Determine Lambert vs Phong from ShadingModel property
    const shadingModel = findChildByName(materialNode, "ShadingModel");
    const shadingType = shadingModel
        ? (getPropertyValue<string>(shadingModel, 0) ?? "Lambert")
        : "Lambert";
    const type: "Lambert" | "Phong" =
        shadingType.toLowerCase() === "phong" ? "Phong" : "Lambert";

    // Extract properties from Properties70
    const properties = extractMaterialProperties(materialNode);

    // Find connected textures
    const textures = extractTextures(materialId, objectMap);

    return { id: materialId, name, type, properties, textures };
}

function extractMaterialProperties(materialNode: FBXNode): FBXMaterialProperties {
    const props: FBXMaterialProperties = {};
    const props70 = findChildByName(materialNode, "Properties70");
    if (!props70) return props;

    for (const p of props70.children) {
        if (p.name !== "P") continue;
        const propName = getPropertyValue<string>(p, 0);
        if (!propName) continue;

        switch (propName) {
            case "DiffuseColor":
            case "Diffuse":
                props.diffuseColor = getColor3(p, 4);
                break;
            case "DiffuseFactor":
                props.diffuseFactor = getNumberProp(p, 4);
                break;
            case "AmbientColor":
            case "Ambient":
                props.ambientColor = getColor3(p, 4);
                break;
            case "AmbientFactor":
                props.ambientFactor = getNumberProp(p, 4);
                break;
            case "SpecularColor":
            case "Specular":
                props.specularColor = getColor3(p, 4);
                break;
            case "SpecularFactor":
                props.specularFactor = getNumberProp(p, 4);
                break;
            case "Shininess":
            case "ShininessExponent":
                props.shininess = getNumberProp(p, 4);
                break;
            case "EmissiveColor":
            case "Emissive":
                props.emissiveColor = getColor3(p, 4);
                break;
            case "EmissiveFactor":
                props.emissiveFactor = getNumberProp(p, 4);
                break;
            case "Opacity":
                props.opacity = getNumberProp(p, 4);
                break;
            case "TransparencyFactor":
                props.transparencyFactor = getNumberProp(p, 4);
                break;
        }
    }

    return props;
}

function extractTextures(materialId: bigint, objectMap: FBXObjectMap): FBXTextureRef[] {
    const textures: FBXTextureRef[] = [];
    const textureChildren = getChildren(objectMap, materialId, "Texture");

    for (const { id, node, propertyName } of textureChildren) {
        const fileNameNode = findChildByName(node, "FileName");
        const relFileNameNode = findChildByName(node, "RelativeFilename");

        const fileName = fileNameNode ? (getPropertyValue<string>(fileNameNode, 0) ?? "") : "";
        const relativeFileName = relFileNameNode
            ? (getPropertyValue<string>(relFileNameNode, 0) ?? "")
            : "";

        // Extract UV transform properties
        let uvTranslation: [number, number] | undefined;
        let uvScaling: [number, number] | undefined;
        let uvRotation: number | undefined;
        let uvSetName: string | undefined;
        const texProps70 = findChildByName(node, "Properties70");
        if (texProps70) {
            for (const p of texProps70.children) {
                if (p.name !== "P") continue;
                const pName = getPropertyValue<string>(p, 0);
                if (pName === "UVTranslation" || pName === "Translation") {
                    const u = toNumber(p.properties[4]?.value);
                    const v = toNumber(p.properties[5]?.value);
                    if (u !== undefined && v !== undefined) uvTranslation = [u, v];
                } else if (pName === "UVScaling" || pName === "Scaling") {
                    const u = toNumber(p.properties[4]?.value);
                    const v = toNumber(p.properties[5]?.value);
                    if (u !== undefined && v !== undefined) uvScaling = [u, v];
                } else if (pName === "UVRotation" || pName === "Rotation") {
                    uvRotation = toNumber(p.properties[4]?.value);
                } else if (pName === "UVSet") {
                    const value = p.properties[4]?.value;
                    if (typeof value === "string" && value.length > 0) uvSetName = value;
                }
            }
        }
        uvTranslation ??= getNumberPairChild(node, "ModelUVTranslation");
        uvScaling ??= getNumberPairChild(node, "ModelUVScaling");

        // Check for embedded texture data in connected Video node
        let embeddedData: Uint8Array | null = null;
        const videoChildren = getChildren(objectMap, id, "Video");
        for (const { node: videoNode } of videoChildren) {
            const contentNode = findChildByName(videoNode, "Content");
            if (contentNode && contentNode.properties.length > 0) {
                const content = contentNode.properties[0].value;
                if (content instanceof Uint8Array && content.length > 0) {
                    embeddedData = content;
                } else if (content instanceof ArrayBuffer && (content as ArrayBuffer).byteLength > 0) {
                    embeddedData = new Uint8Array(content as ArrayBuffer);
                }
            }
        }

        textures.push({
            propertyName: propertyName ?? "DiffuseColor",
            fileName,
            relativeFileName,
            id,
            embeddedData,
            uvTranslation,
            uvScaling,
            uvRotation,
            uvSetName,
        });
    }

    return textures;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function getColor3(node: FBXNode, startIndex: number): [number, number, number] | undefined {
    if (node.properties.length <= startIndex + 2) return undefined;
    const r = toNumber(node.properties[startIndex].value);
    const g = toNumber(node.properties[startIndex + 1].value);
    const b = toNumber(node.properties[startIndex + 2].value);
    if (r === undefined || g === undefined || b === undefined) return undefined;
    return [r, g, b];
}

function getNumberProp(node: FBXNode, index: number): number | undefined {
    if (index >= node.properties.length) return undefined;
    return toNumber(node.properties[index].value);
}

function toNumber(value: unknown): number | undefined {
    if (typeof value === "number") return value;
    if (typeof value === "bigint") return Number(value);
    return undefined;
}

function getNumberPairChild(node: FBXNode, childName: string): [number, number] | undefined {
    const child = findChildByName(node, childName);
    if (!child) return undefined;
    const u = toNumber(child.properties[0]?.value);
    const v = toNumber(child.properties[1]?.value);
    return u !== undefined && v !== undefined ? [u, v] : undefined;
}


