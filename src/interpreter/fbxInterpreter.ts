import type { FBXDocument, FBXNode } from "../types/fbxTypes.js";
import { findDocumentNode, getPropertyValue, cleanFBXName } from "../types/fbxTypes.js";
import { resolveConnections, getChildren, type FBXObjectMap } from "./connections.js";
import { extractGeometry, type FBXGeometryData } from "./geometry.js";
import { extractMaterial, type FBXMaterialData } from "./materials.js";
import { extractSkins, type FBXSkinData } from "./skeleton.js";
import { extractAnimations, type FBXAnimationStackData } from "./animation.js";

/** Represents a model (transform node) in the FBX scene */
export interface FBXModelData {
    id: bigint;
    name: string;
    subType: string;
    /** Geometry attached to this model (if it's a Mesh type) */
    geometry?: FBXGeometryData;
    /** Materials assigned to this model */
    materials: FBXMaterialData[];
    /** Child models */
    children: FBXModelData[];
    /** Transform properties */
    translation: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
    /** PreRotation (applied before Lcl Rotation, in degrees) */
    preRotation: [number, number, number];
    /** PostRotation (applied after Lcl Rotation, inverted, in degrees) */
    postRotation: [number, number, number];
    /** RotationPivot — point around which rotation occurs */
    rotationPivot: [number, number, number];
    /** ScalingPivot — point around which scaling occurs */
    scalingPivot: [number, number, number];
    /** RotationOffset — translation after rotation pivot */
    rotationOffset: [number, number, number];
    /** ScalingOffset — translation after scaling pivot */
    scalingOffset: [number, number, number];
    /** Geometric transforms — applied to geometry only, do not affect children */
    geometricTranslation: [number, number, number];
    geometricRotation: [number, number, number];
    geometricScaling: [number, number, number];
    /** Rotation order: 0=XYZ, 1=XZY, 2=YZX, 3=YXZ, 4=ZXY, 5=ZYX */
    rotationOrder: number;
    /** Whether backface culling is disabled ("CullingOff") */
    cullingOff: boolean;
}

/** Result of interpreting an FBX document */
export interface FBXSceneData {
    /** All root-level models */
    rootModels: FBXModelData[];
    /** All geometries in the scene */
    geometries: FBXGeometryData[];
    /** All materials in the scene */
    materials: FBXMaterialData[];
    /** Skin deformers (skeletons + vertex weights) */
    skins: FBXSkinData[];
    /** Animation stacks (clips) */
    animations: FBXAnimationStackData[];
    /** Global settings */
    upAxis: number;
    upAxisSign: number;
    frontAxis: number;
    frontAxisSign: number;
    coordAxis: number;
    coordAxisSign: number;
    unitScaleFactor: number;
}

/**
 * Interpret a parsed FBX document into scene data.
 */
export function interpretFBX(doc: FBXDocument): FBXSceneData {
    const objectMap = resolveConnections(doc);

    // Extract global settings
    const globalSettings = extractGlobalSettings(doc);

    // Extract all materials
    const materials: FBXMaterialData[] = [];
    for (const [id, node] of objectMap.objects) {
        if (node.name === "Material") {
            materials.push(extractMaterial(node, id, objectMap));
        }
    }

    // Extract all geometries
    const geometries: FBXGeometryData[] = [];
    for (const [id, node] of objectMap.objects) {
        if (node.name === "Geometry") {
            const subType = getPropertyValue<string>(node, 2);
            if (subType === "Mesh") {
                geometries.push(extractGeometry(node, id));
            }
        }
    }

    // Extract skeleton/skinning data
    const skins = extractSkins(objectMap);

    // Extract animation data
    const animations = extractAnimations(objectMap);

    // Build model hierarchy
    const rootModels = buildModelHierarchy(objectMap, geometries, materials);

    return {
        rootModels,
        geometries,
        materials,
        skins,
        animations,
        ...globalSettings,
    };
}

// ── Model Hierarchy ────────────────────────────────────────────────────────────

function buildModelHierarchy(
    objectMap: FBXObjectMap,
    geometries: FBXGeometryData[],
    materials: FBXMaterialData[]
): FBXModelData[] {
    const geometryMap = new Map<bigint, FBXGeometryData>();
    for (const g of geometries) {
        geometryMap.set(g.id, g);
    }

    const materialMap = new Map<bigint, FBXMaterialData>();
    for (const m of materials) {
        materialMap.set(m.id, m);
    }

    // Find root models (those connected to ID 0, which is the scene root)
    const rootChildren = objectMap.childrenOf.get(0n) ?? [];
    const rootModels: FBXModelData[] = [];

    for (const { id } of rootChildren) {
        const node = objectMap.objects.get(id);
        if (node && node.name === "Model") {
            rootModels.push(buildModel(id, node, objectMap, geometryMap, materialMap));
        }
    }

    return rootModels;
}

function buildModel(
    modelId: bigint,
    modelNode: FBXNode,
    objectMap: FBXObjectMap,
    geometryMap: Map<bigint, FBXGeometryData>,
    materialMap: Map<bigint, FBXMaterialData>
): FBXModelData {
    const name = cleanFBXName(getPropertyValue<string>(modelNode, 1) ?? "Model");
    const subType = getPropertyValue<string>(modelNode, 2) ?? "Null";

    // Find attached geometry
    const geomChildren = getChildren(objectMap, modelId, "Geometry");
    const geometry = geomChildren.length > 0 ? geometryMap.get(geomChildren[0].id) : undefined;

    // Find attached materials
    const matChildren = getChildren(objectMap, modelId, "Material");
    const modelMaterials: FBXMaterialData[] = [];
    for (const { id } of matChildren) {
        const mat = materialMap.get(id);
        if (mat) modelMaterials.push(mat);
    }

    // Extract transform
    const transform = extractTransform(modelNode);

    // Recursively build child models
    const childModelNodes = getChildren(objectMap, modelId, "Model");
    const children: FBXModelData[] = [];
    for (const { id, node } of childModelNodes) {
        children.push(buildModel(id, node, objectMap, geometryMap, materialMap));
    }

    // Extract culling
    const cullingNode = modelNode.children.find((c) => c.name === "Culling");
    const cullingOff = cullingNode
        ? getPropertyValue<string>(cullingNode, 0) === "CullingOff"
        : false;

    return {
        id: modelId,
        name,
        subType,
        geometry,
        materials: modelMaterials,
        children,
        cullingOff,
        ...transform,
    };
}

function extractTransform(modelNode: FBXNode): {
    translation: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
    preRotation: [number, number, number];
    postRotation: [number, number, number];
    rotationPivot: [number, number, number];
    scalingPivot: [number, number, number];
    rotationOffset: [number, number, number];
    scalingOffset: [number, number, number];
    geometricTranslation: [number, number, number];
    geometricRotation: [number, number, number];
    geometricScaling: [number, number, number];
    rotationOrder: number;
} {
    const translation: [number, number, number] = [0, 0, 0];
    const rotation: [number, number, number] = [0, 0, 0];
    const scale: [number, number, number] = [1, 1, 1];
    const preRotation: [number, number, number] = [0, 0, 0];
    const postRotation: [number, number, number] = [0, 0, 0];
    const rotationPivot: [number, number, number] = [0, 0, 0];
    const scalingPivot: [number, number, number] = [0, 0, 0];
    const rotationOffset: [number, number, number] = [0, 0, 0];
    const scalingOffset: [number, number, number] = [0, 0, 0];
    const geometricTranslation: [number, number, number] = [0, 0, 0];
    const geometricRotation: [number, number, number] = [0, 0, 0];
    const geometricScaling: [number, number, number] = [1, 1, 1];
    let rotationOrder = 0;

    const props70 = modelNode.children.find((c) => c.name === "Properties70");
    if (!props70) return { translation, rotation, scale, preRotation, postRotation, rotationPivot, scalingPivot, rotationOffset, scalingOffset, geometricTranslation, geometricRotation, geometricScaling, rotationOrder };

    for (const p of props70.children) {
        if (p.name !== "P") continue;
        const propName = getPropertyValue<string>(p, 0);
        if (!propName) continue;

        switch (propName) {
            case "Lcl Translation":
                translation[0] = toNumber(p.properties[4]?.value) ?? 0;
                translation[1] = toNumber(p.properties[5]?.value) ?? 0;
                translation[2] = toNumber(p.properties[6]?.value) ?? 0;
                break;
            case "Lcl Rotation":
                rotation[0] = toNumber(p.properties[4]?.value) ?? 0;
                rotation[1] = toNumber(p.properties[5]?.value) ?? 0;
                rotation[2] = toNumber(p.properties[6]?.value) ?? 0;
                break;
            case "Lcl Scaling":
                scale[0] = toNumber(p.properties[4]?.value) ?? 1;
                scale[1] = toNumber(p.properties[5]?.value) ?? 1;
                scale[2] = toNumber(p.properties[6]?.value) ?? 1;
                break;
            case "PreRotation":
                preRotation[0] = toNumber(p.properties[4]?.value) ?? 0;
                preRotation[1] = toNumber(p.properties[5]?.value) ?? 0;
                preRotation[2] = toNumber(p.properties[6]?.value) ?? 0;
                break;
            case "PostRotation":
                postRotation[0] = toNumber(p.properties[4]?.value) ?? 0;
                postRotation[1] = toNumber(p.properties[5]?.value) ?? 0;
                postRotation[2] = toNumber(p.properties[6]?.value) ?? 0;
                break;
            case "RotationPivot":
                rotationPivot[0] = toNumber(p.properties[4]?.value) ?? 0;
                rotationPivot[1] = toNumber(p.properties[5]?.value) ?? 0;
                rotationPivot[2] = toNumber(p.properties[6]?.value) ?? 0;
                break;
            case "ScalingPivot":
                scalingPivot[0] = toNumber(p.properties[4]?.value) ?? 0;
                scalingPivot[1] = toNumber(p.properties[5]?.value) ?? 0;
                scalingPivot[2] = toNumber(p.properties[6]?.value) ?? 0;
                break;
            case "RotationOffset":
                rotationOffset[0] = toNumber(p.properties[4]?.value) ?? 0;
                rotationOffset[1] = toNumber(p.properties[5]?.value) ?? 0;
                rotationOffset[2] = toNumber(p.properties[6]?.value) ?? 0;
                break;
            case "ScalingOffset":
                scalingOffset[0] = toNumber(p.properties[4]?.value) ?? 0;
                scalingOffset[1] = toNumber(p.properties[5]?.value) ?? 0;
                scalingOffset[2] = toNumber(p.properties[6]?.value) ?? 0;
                break;
            case "GeometricTranslation":
                geometricTranslation[0] = toNumber(p.properties[4]?.value) ?? 0;
                geometricTranslation[1] = toNumber(p.properties[5]?.value) ?? 0;
                geometricTranslation[2] = toNumber(p.properties[6]?.value) ?? 0;
                break;
            case "GeometricRotation":
                geometricRotation[0] = toNumber(p.properties[4]?.value) ?? 0;
                geometricRotation[1] = toNumber(p.properties[5]?.value) ?? 0;
                geometricRotation[2] = toNumber(p.properties[6]?.value) ?? 0;
                break;
            case "GeometricScaling":
                geometricScaling[0] = toNumber(p.properties[4]?.value) ?? 1;
                geometricScaling[1] = toNumber(p.properties[5]?.value) ?? 1;
                geometricScaling[2] = toNumber(p.properties[6]?.value) ?? 1;
                break;
            case "RotationOrder":
                rotationOrder = toNumber(p.properties[4]?.value) ?? 0;
                break;
        }
    }

    return { translation, rotation, scale, preRotation, postRotation, rotationPivot, scalingPivot, rotationOffset, scalingOffset, geometricTranslation, geometricRotation, geometricScaling, rotationOrder };
}

// ── Global Settings ────────────────────────────────────────────────────────────

interface GlobalSettings {
    upAxis: number;
    upAxisSign: number;
    frontAxis: number;
    frontAxisSign: number;
    coordAxis: number;
    coordAxisSign: number;
    unitScaleFactor: number;
}

function extractGlobalSettings(doc: FBXDocument): GlobalSettings {
    const defaults: GlobalSettings = {
        upAxis: 1,
        upAxisSign: 1,
        frontAxis: 2,
        frontAxisSign: 1,
        coordAxis: 0,
        coordAxisSign: 1,
        unitScaleFactor: 1,
    };

    const gsNode = findDocumentNode(doc, "GlobalSettings");
    if (!gsNode) return defaults;

    const props70 = gsNode.children.find((c) => c.name === "Properties70");
    if (!props70) return defaults;

    for (const p of props70.children) {
        if (p.name !== "P") continue;
        const propName = getPropertyValue<string>(p, 0);
        const value = toNumber(p.properties[4]?.value);
        if (propName && value !== undefined) {
            switch (propName) {
                case "UpAxis":
                    defaults.upAxis = value;
                    break;
                case "UpAxisSign":
                    defaults.upAxisSign = value;
                    break;
                case "FrontAxis":
                    defaults.frontAxis = value;
                    break;
                case "FrontAxisSign":
                    defaults.frontAxisSign = value;
                    break;
                case "CoordAxis":
                    defaults.coordAxis = value;
                    break;
                case "CoordAxisSign":
                    defaults.coordAxisSign = value;
                    break;
                case "UnitScaleFactor":
                    defaults.unitScaleFactor = value;
                    break;
            }
        }
    }

    return defaults;
}

// ── Utilities ──────────────────────────────────────────────────────────────────

function toNumber(value: unknown): number | undefined {
    if (typeof value === "number") return value;
    if (typeof value === "bigint") return Number(value);
    return undefined;
}


