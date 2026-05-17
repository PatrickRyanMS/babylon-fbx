import type { FBXSceneData } from "../../src/interpreter/fbxInterpreter.js";
import type { FBXGeometryData } from "../../src/interpreter/geometry.js";

export interface FBXRegressionSnapshot {
    rootModelCount: number;
    modelCount: number;
    meshModelCount: number;
    geometryCount: number;
    materialCount: number;
    skinCount: number;
    rigCount: number;
    rigBoneCounts: number[];
    blendShapeCount: number;
    animationCount: number;
    cameraCount: number;
    lightCount: number;
    unitScaleFactor: number;
    totalVertices: number;
    totalTriangles: number;
    geometries: FBXGeometrySnapshot[];
}

export interface FBXGeometrySnapshot {
    id: string;
    name: string;
    vertexCount: number;
    indexCount: number;
    triangleCount: number;
    bounds: {
        min: [number, number, number];
        max: [number, number, number];
    };
}

export function createFBXRegressionSnapshot(scene: FBXSceneData): FBXRegressionSnapshot {
    const models = collectModels(scene.rootModels);
    const geometries = scene.geometries.map(createGeometrySnapshot);

    return {
        rootModelCount: scene.rootModels.length,
        modelCount: models.length,
        meshModelCount: models.filter((model) => model.geometry).length,
        geometryCount: scene.geometries.length,
        materialCount: scene.materials.length,
        skinCount: scene.skins.length,
        rigCount: scene.rigs.length,
        rigBoneCounts: scene.rigs.map((rig) => rig.bones.length),
        blendShapeCount: scene.blendShapes.length,
        animationCount: scene.animations.length,
        cameraCount: scene.cameras.length,
        lightCount: scene.lights.length,
        unitScaleFactor: scene.unitScaleFactor,
        totalVertices: geometries.reduce((sum, geometry) => sum + geometry.vertexCount, 0),
        totalTriangles: geometries.reduce((sum, geometry) => sum + geometry.triangleCount, 0),
        geometries,
    };
}

function createGeometrySnapshot(geometry: FBXGeometryData): FBXGeometrySnapshot {
    return {
        id: geometry.id.toString(),
        name: geometry.name,
        vertexCount: geometry.positions.length / 3,
        indexCount: geometry.indices.length,
        triangleCount: geometry.indices.length / 3,
        bounds: computeBounds(geometry.positions),
    };
}

function computeBounds(positions: Float64Array): { min: [number, number, number]; max: [number, number, number] } {
    const min: [number, number, number] = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
    const max: [number, number, number] = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];

    for (let i = 0; i < positions.length; i += 3) {
        min[0] = Math.min(min[0], positions[i]);
        min[1] = Math.min(min[1], positions[i + 1]);
        min[2] = Math.min(min[2], positions[i + 2]);
        max[0] = Math.max(max[0], positions[i]);
        max[1] = Math.max(max[1], positions[i + 1]);
        max[2] = Math.max(max[2], positions[i + 2]);
    }

    return { min, max };
}

function collectModels(models: FBXSceneData["rootModels"]): FBXSceneData["rootModels"] {
    const result: FBXSceneData["rootModels"] = [];
    for (const model of models) {
        result.push(model);
        result.push(...collectModels(model.children));
    }
    return result;
}
