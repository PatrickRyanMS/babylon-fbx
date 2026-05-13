import type { FBXNode } from "../types/fbxTypes.js";
import { findChildByName, findChildrenByName, getPropertyValue, cleanFBXName } from "../types/fbxTypes.js";

/** A named UV set */
export interface FBXUVSet {
    /** UV set name (e.g. "UVMap", "lightmap") */
    name: string;
    /** Per-vertex UV data [u,v, ...] (expanded to match triangle vertices) */
    data: Float64Array;
}

/** Parsed geometry data ready for Babylon consumption */
export interface FBXGeometryData {
    /** Node ID from the FBX document */
    id: bigint;
    /** Geometry name */
    name: string;
    /** Flat array of vertex positions [x,y,z, x,y,z, ...] */
    positions: Float64Array;
    /** Triangle indices (already triangulated from n-gons) */
    indices: Uint32Array;
    /** Per-vertex normals [x,y,z, ...] (expanded to match triangle vertices) */
    normals: Float64Array | null;
    /** Per-vertex UVs [u,v, ...] (expanded to match triangle vertices) — first UV set for convenience */
    uvs: Float64Array | null;
    /** All UV sets (including the first) */
    uvSets: FBXUVSet[];
    /** Per-vertex colors [r,g,b,a, ...] (expanded to match triangle vertices) */
    colors: Float32Array | null;
    /** Control point index for each polygon-vertex (for skinning lookup) */
    controlPointIndices: Uint32Array | null;
    /** Per-triangle material index (which material each triangle belongs to) */
    materialIndices: Int32Array | null;
}

/**
 * Extract geometry data from an FBX Geometry node.
 * Handles polygon triangulation and layer element expansion.
 */
export function extractGeometry(geometryNode: FBXNode, nodeId: bigint): FBXGeometryData {
    const name = cleanFBXName(getPropertyValue<string>(geometryNode, 1) ?? "Geometry");

    // Extract raw vertices
    const verticesNode = findChildByName(geometryNode, "Vertices");
    if (!verticesNode) {
        throw new Error(`Geometry '${name}' has no Vertices node`);
    }
    const rawPositions = toFloat64Array(verticesNode.properties[0].value);

    // Extract polygon vertex indices
    const pviNode = findChildByName(geometryNode, "PolygonVertexIndex");
    if (!pviNode) {
        throw new Error(`Geometry '${name}' has no PolygonVertexIndex node`);
    }
    const rawIndices = toInt32Array(pviNode.properties[0].value);

    // Parse polygons from the FBX negative-index convention
    const polygons = parsePolygons(rawIndices);

    // Triangulate polygons (fan triangulation for convex polygons)
    const triangles = triangulatePolygons(polygons);

    // Build the list of polygon-vertex pairs for layer element expansion
    const polyVertexList = buildPolygonVertexList(polygons);

    // Extract normals
    const normalNode = findChildByName(geometryNode, "LayerElementNormal");
    let normals: Float64Array | null = null;
    if (normalNode) {
        normals = expandLayerElement(normalNode, "Normals", "NormalsIndex", polyVertexList, rawPositions.length / 3, 3);
    }

    // Extract all UV sets
    const uvNodes = findChildrenByName(geometryNode, "LayerElementUV");
    const uvSets: FBXUVSet[] = [];
    for (const uvNode of uvNodes) {
        const nameNode = findChildByName(uvNode, "Name");
        const setName = nameNode ? (getPropertyValue<string>(nameNode, 0) ?? `UVSet${uvSets.length}`) : `UVSet${uvSets.length}`;
        const data = expandLayerElement(uvNode, "UV", "UVIndex", polyVertexList, rawPositions.length / 3, 2);
        if (data) {
            uvSets.push({ name: setName, data });
        }
    }
    const uvs = uvSets.length > 0 ? uvSets[0].data : null;

    // Extract vertex colors
    const colorNode = findChildByName(geometryNode, "LayerElementColor");
    let colors: Float32Array | null = null;
    if (colorNode) {
        const colorData = expandLayerElement(colorNode, "Colors", "ColorIndex", polyVertexList, rawPositions.length / 3, 4);
        if (colorData) {
            colors = new Float32Array(colorData.length);
            for (let i = 0; i < colorData.length; i++) {
                colors[i] = colorData[i];
            }
        }
    }

    // Extract smoothing groups (per-polygon)
    const smoothingNode = findChildByName(geometryNode, "LayerElementSmoothing");
    let smoothingGroups: Int32Array | null = null;
    if (smoothingNode) {
        const smoothingDataNode = findChildByName(smoothingNode, "Smoothing");
        if (smoothingDataNode) {
            smoothingGroups = toInt32Array(smoothingDataNode.properties[0].value);
        }
    }

    // Extract per-polygon material indices
    const matNode = findChildByName(geometryNode, "LayerElementMaterial");
    let polyMaterialIndices: Int32Array | null = null;
    if (matNode) {
        polyMaterialIndices = extractMaterialIndices(matNode, polygons.length);
    }

    // Build final indexed mesh with expanded per-triangle-vertex attributes
    const result = buildTriangleMesh(rawPositions, triangles, polyVertexList, normals, uvs, uvSets, colors);

    // Expand per-polygon material indices to per-triangle
    let materialIndices: Int32Array | null = null;
    if (polyMaterialIndices) {
        // Check if all polygons use the same material (optimization)
        let allSame = true;
        const firstMat = polyMaterialIndices[0];
        for (let i = 1; i < polyMaterialIndices.length; i++) {
            if (polyMaterialIndices[i] !== firstMat) { allSame = false; break; }
        }

        if (!allSame) {
            // Expand to per-triangle (fan triangulation: polygon with N verts → N-2 triangles)
            const triCount = result.indices.length / 3;
            materialIndices = new Int32Array(triCount);
            let triIdx = 0;
            for (let pi = 0; pi < polygons.length; pi++) {
                const numTris = polygons[pi].indices.length - 2;
                for (let t = 0; t < numTris; t++) {
                    materialIndices[triIdx++] = polyMaterialIndices[pi];
                }
            }
        }
    }

    return {
        id: nodeId,
        name,
        positions: result.positions,
        indices: result.indices,
        normals: result.normals,
        uvs: result.uvs,
        uvSets: result.uvSets,
        colors: result.colors,
        controlPointIndices: result.controlPointIndices,
        materialIndices,
    };
}

// ── Polygon Parsing ────────────────────────────────────────────────────────────

interface Polygon {
    /** Control point indices for this polygon */
    indices: number[];
    /** Starting index in the original PolygonVertexIndex array */
    startIndex: number;
}

function parsePolygons(rawIndices: Int32Array): Polygon[] {
    const polygons: Polygon[] = [];
    let currentPoly: number[] = [];
    let startIndex = 0;

    for (let i = 0; i < rawIndices.length; i++) {
        const idx = rawIndices[i];
        if (idx < 0) {
            // End of polygon: actual index is -(idx + 1)
            currentPoly.push(-(idx + 1));
            polygons.push({ indices: currentPoly, startIndex });
            currentPoly = [];
            startIndex = i + 1;
        } else {
            currentPoly.push(idx);
        }
    }

    return polygons;
}

/** Fan-triangulate polygons. Returns triangle indices as [polyVertexIndex] triples. */
function triangulatePolygons(polygons: Polygon[]): number[][] {
    const triangles: number[][] = [];

    for (const poly of polygons) {
        for (let i = 1; i < poly.indices.length - 1; i++) {
            // Triangle fan from vertex 0
            triangles.push([
                poly.startIndex, // first vertex of polygon
                poly.startIndex + i,
                poly.startIndex + i + 1,
            ]);
        }
    }

    return triangles;
}

/** Build a flat list of (polygonIndex, vertexInPolygon, controlPointIndex) for each polygon vertex */
interface PolyVertex {
    polyIndex: number;
    vertexInPoly: number;
    controlPointIndex: number;
    /** Global polygon-vertex index (position in the original PolygonVertexIndex array) */
    globalIndex: number;
}

function buildPolygonVertexList(polygons: Polygon[]): PolyVertex[] {
    const list: PolyVertex[] = [];
    for (let pi = 0; pi < polygons.length; pi++) {
        const poly = polygons[pi];
        for (let vi = 0; vi < poly.indices.length; vi++) {
            list.push({
                polyIndex: pi,
                vertexInPoly: vi,
                controlPointIndex: poly.indices[vi],
                globalIndex: poly.startIndex + vi,
            });
        }
    }
    return list;
}

// ── Layer Element Expansion ────────────────────────────────────────────────────

/**
 * Extract per-polygon material indices from LayerElementMaterial.
 * Returns an Int32Array with one material index per polygon.
 */
function extractMaterialIndices(matNode: FBXNode, polygonCount: number): Int32Array | null {
    const mappingNode = findChildByName(matNode, "MappingInformationType");
    const referenceNode = findChildByName(matNode, "ReferenceInformationType");

    if (!mappingNode || !referenceNode) return null;

    const mapping = getPropertyValue<string>(mappingNode, 0) ?? "";
    const reference = getPropertyValue<string>(referenceNode, 0) ?? "";

    if (mapping === "AllSame") {
        // All polygons use material index 0
        const indices = new Int32Array(polygonCount);
        return indices; // already filled with 0
    }

    if (mapping === "ByPolygon") {
        const materialsNode = findChildByName(matNode, "Materials");
        if (!materialsNode) return null;
        const rawIndices = toInt32Array(materialsNode.properties[0].value);
        // For Direct reference, the Materials array has one index per polygon
        if (reference === "Direct" || reference === "IndexToDirect") {
            return rawIndices;
        }
    }

    return null;
}

function expandLayerElement(
    layerNode: FBXNode,
    dataChildName: string,
    indexChildName: string,
    polyVertexList: PolyVertex[],
    controlPointCount: number,
    stride: number
): Float64Array | null {
    const mappingNode = findChildByName(layerNode, "MappingInformationType");
    const referenceNode = findChildByName(layerNode, "ReferenceInformationType");

    if (!mappingNode || !referenceNode) return null;

    const mapping = getPropertyValue<string>(mappingNode, 0) ?? "";
    const reference = getPropertyValue<string>(referenceNode, 0) ?? "";

    const dataNode = findChildByName(layerNode, dataChildName);
    if (!dataNode) return null;
    const data = toFloat64Array(dataNode.properties[0].value);

    let indexData: Int32Array | null = null;
    if (reference === "IndexToDirect") {
        const indexNode = findChildByName(layerNode, indexChildName);
        if (indexNode) {
            indexData = toInt32Array(indexNode.properties[0].value);
        }
    }

    // Expand to per-polygon-vertex
    const result = new Float64Array(polyVertexList.length * stride);

    for (let i = 0; i < polyVertexList.length; i++) {
        const pv = polyVertexList[i];
        let dataIndex: number;

        if (mapping === "ByPolygonVertex") {
            if (reference === "IndexToDirect" && indexData) {
                dataIndex = indexData[pv.globalIndex];
            } else {
                // Direct
                dataIndex = pv.globalIndex;
            }
        } else if (mapping === "ByControlPoint" || mapping === "ByVertice") {
            if (reference === "IndexToDirect" && indexData) {
                dataIndex = indexData[pv.controlPointIndex];
            } else {
                dataIndex = pv.controlPointIndex;
            }
        } else if (mapping === "ByPolygon") {
            if (reference === "IndexToDirect" && indexData) {
                dataIndex = indexData[pv.polyIndex];
            } else {
                dataIndex = pv.polyIndex;
            }
        } else if (mapping === "AllSame") {
            dataIndex = 0;
        } else {
            dataIndex = pv.globalIndex;
        }

        for (let s = 0; s < stride; s++) {
            result[i * stride + s] = data[dataIndex * stride + s];
        }
    }

    return result;
}

// ── Final Mesh Assembly ────────────────────────────────────────────────────────

interface TriangleMeshData {
    positions: Float64Array;
    indices: Uint32Array;
    normals: Float64Array | null;
    uvs: Float64Array | null;
    uvSets: FBXUVSet[];
    colors: Float32Array | null;
    controlPointIndices: Uint32Array;
}

/**
 * Build the final triangle mesh. Since normals/UVs are per-polygon-vertex,
 * we need to create unique vertices for each polygon-vertex combination.
 */
function buildTriangleMesh(
    rawPositions: Float64Array,
    triangles: number[][],
    polyVertexList: PolyVertex[],
    expandedNormals: Float64Array | null,
    expandedUVs: Float64Array | null,
    expandedUVSets: FBXUVSet[],
    expandedColors: Float32Array | null
): TriangleMeshData {
    // Each polygon-vertex becomes a unique vertex in the output
    const vertexCount = polyVertexList.length;
    const positions = new Float64Array(vertexCount * 3);
    const controlPointIndices = new Uint32Array(vertexCount);

    // Copy positions — keep in original RH space (root node handles RH→LH conversion)
    for (let i = 0; i < polyVertexList.length; i++) {
        const cp = polyVertexList[i].controlPointIndex;
        positions[i * 3] = rawPositions[cp * 3];
        positions[i * 3 + 1] = rawPositions[cp * 3 + 1];
        positions[i * 3 + 2] = rawPositions[cp * 3 + 2];
        controlPointIndices[i] = cp;
    }

    // Normals stay in RH space (root node handles conversion)
    if (expandedNormals) {
        // No transformation needed
    }

    // Keep original winding order — Z negation handles handedness
    const indexCount = triangles.length * 3;
    const indices = new Uint32Array(indexCount);
    for (let i = 0; i < triangles.length; i++) {
        indices[i * 3] = triangles[i][0];
        indices[i * 3 + 1] = triangles[i][1];
        indices[i * 3 + 2] = triangles[i][2];
    }

    return {
        positions,
        indices,
        normals: expandedNormals,
        uvs: expandedUVs,
        uvSets: expandedUVSets,
        colors: expandedColors,
        controlPointIndices,
    };
}

// ── Utilities ──────────────────────────────────────────────────────────────────

function toFloat64Array(value: unknown): Float64Array {
    if (value instanceof Float64Array) return value;
    if (value instanceof Float32Array) return new Float64Array(value);
    if (value instanceof Int32Array) return new Float64Array(value);
    throw new Error(`Cannot convert ${typeof value} to Float64Array`);
}

function toInt32Array(value: unknown): Int32Array {
    if (value instanceof Int32Array) return value;
    if (value instanceof Float64Array) {
        const result = new Int32Array(value.length);
        for (let i = 0; i < value.length; i++) {
            result[i] = Math.round(value[i]);
        }
        return result;
    }
    if (value instanceof Float32Array) {
        const result = new Int32Array(value.length);
        for (let i = 0; i < value.length; i++) {
            result[i] = Math.round(value[i]);
        }
        return result;
    }
    throw new Error(`Cannot convert ${typeof value} to Int32Array`);
}


