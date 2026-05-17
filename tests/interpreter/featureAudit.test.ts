import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

import { parseBinaryFBX } from "../../src/parsers/fbxBinaryParser.js";
import { resolveConnections, type FBXObjectMap } from "../../src/interpreter/connections.js";
import { interpretFBX } from "../../src/interpreter/fbxInterpreter.js";
import { findChildByName, getPropertyValue, type FBXDocument, type FBXNode } from "../../src/types/fbxTypes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const aishaPath = resolve(__dirname, "../models/anime-chibi-girl-aisha-by-seraphim/test2.fbx");
const behemotPath = resolve(__dirname, "../models/behemot-cat/LowPoly_Cat_V04.fbx");
const spiderPath = resolve(__dirname, "../models/spider-animated-character/Spider_sketchfab.fbx");
const tamagotchiPath = resolve(__dirname, "../models/tamagotchi-pet-sailor-moon/lp_01.fbx");
const strongholdPath = resolve(__dirname, "../models/the-last-stronghold-animated/Floating_Gate_Chinese1.fbx");
const vinoPath = resolve(__dirname, "../models/vino/SM_Vino.fbx");

describe("FBX feature audit fixtures", () => {
    it("identifies Behemot Cat as a multi-skin fixture with at most four influences per skin", () => {
        const objectMap = loadObjectMap(behemotPath);
        const stats = collectRawInfluenceStats(objectMap);

        expect(countSkinDeformers(objectMap)).toBe(3);
        expect(stats.maxInfluences).toBe(3);
        expect(stats.verticesOver4).toBe(0);
    });

    it("preserves Behemot Cat per-skin influences and normalized weights", () => {
        const scene = interpretFBX(loadDocument(behemotPath));
        const maxExtractedInfluences = Math.max(
            ...scene.skins.flatMap((skin) => skin.boneIndices.map((indices) => indices.length))
        );
        const weightedVertices = scene.skins
            .flatMap((skin) => skin.boneWeights)
            .filter((weights) => weights.length > 0);

        expect(maxExtractedInfluences).toBe(3);
        expect(weightedVertices.length).toBeGreaterThan(0);
        for (const weights of weightedVertices) {
            expect(weights.reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1, 5);
        }
    });

    it("identifies Last Stronghold clusters with TransformAssociateModel", () => {
        const objectMap = loadObjectMap(strongholdPath);
        const stats = collectRawInfluenceStats(objectMap);
        const scene = interpretFBX(loadDocument(strongholdPath));
        const associateClusters = [...objectMap.objects.values()]
            .filter((node) =>
                node.name === "Deformer" &&
                getPropertyValue<string>(node, 2) === "Cluster" &&
                findChildByName(node, "TransformAssociateModel")
            );
        const extractedAssociateMatrices = scene.skins
            .flatMap((skin) => skin.bones)
            .filter((bone) => bone.transformAssociateModelMatrix !== null);

        expect(countSkinDeformers(objectMap)).toBe(10);
        expect(stats.maxInfluences).toBe(4);
        expect(stats.verticesOver4).toBe(0);
        expect(associateClusters.length).toBe(1460);
        expect(extractedAssociateMatrices.length).toBe(1460);
    });

    it("imports Tamagotchi's FBX 6 legacy string connection graph as static meshes", () => {
        const doc = loadDocument(tamagotchiPath);
        const objectMap = resolveConnections(doc);
        const scene = interpretFBX(doc);
        const objectsNode = doc.nodes.find((node) => node.name === "Objects");
        const connectionsNode = doc.nodes.find((node) => node.name === "Connections");

        expect(doc.version).toBe(6100);
        expect(objectsNode?.children.some((node) => node.name === "Model" && typeof node.properties[0]?.value === "string")).toBe(true);
        expect(connectionsNode?.children.some((node) => node.name === "Connect")).toBe(true);
        expect(objectMap.objects.size).toBe(77);
        expect(objectMap.childrenOf.get(0n)?.length).toBe(1);
        expect(scene.rootModels.length).toBe(1);
        expect(scene.geometries.length).toBe(36);
        expect(scene.materials.length).toBe(1);
    });

    it("keeps Vino classified as a non-skinned static mesh/material fixture", () => {
        const scene = interpretFBX(loadDocument(vinoPath));

        expect(scene.skins.length).toBe(0);
        expect(scene.geometries.length).toBe(3);
        expect(scene.materials.length).toBe(6);
        expect(scene.rootModels.flatMap((model) => model.children).length).toBeGreaterThanOrEqual(0);
        expect(scene.rootModels.some((model) => model.geometry || model.children.some((child) => child.geometry))).toBe(true);
    });

    it("parses non-default InheritType and surfaces runtime-gated diagnostics", () => {
        expect(countNonDefaultInheritTypes(aishaPath)).toBe(307);
        expect(countNonDefaultInheritTypes(spiderPath)).toBe(47);
        expect(countNonDefaultInheritTypes(behemotPath)).toBe(2);
        expect(countNonDefaultInheritTypes(strongholdPath)).toBe(0);
        expect(countNonDefaultInheritTypeDiagnostics(behemotPath)).toBe(2);
    });
});

function loadDocument(path: string): FBXDocument {
    const file = readFileSync(path);
    const buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
    return parseBinaryFBX(buffer);
}

function loadObjectMap(path: string): FBXObjectMap {
    return resolveConnections(loadDocument(path));
}

function countSkinDeformers(objectMap: FBXObjectMap): number {
    return [...objectMap.objects.values()].filter((node) =>
        node.name === "Deformer" &&
        getPropertyValue<string>(node, 2) === "Skin"
    ).length;
}

function collectRawInfluenceStats(objectMap: FBXObjectMap): { maxInfluences: number; verticesOver4: number } {
    let maxInfluences = 0;
    let verticesOver4 = 0;

    for (const [skinId, skinNode] of objectMap.objects) {
        if (skinNode.name !== "Deformer" || getPropertyValue<string>(skinNode, 2) !== "Skin") continue;

        const influencesByControlPoint = new Map<number, number>();
        for (const { node } of objectMap.childrenOf.get(skinId)?.flatMap((child) => {
            const node = objectMap.objects.get(child.id);
            return node ? [{ node }] : [];
        }) ?? []) {
            if (node.name !== "Deformer" || getPropertyValue<string>(node, 2) !== "Cluster") continue;

            const indexes = getInt32ArrayChild(node, "Indexes");
            if (!indexes) continue;

            for (const controlPointIndex of indexes) {
                influencesByControlPoint.set(
                    controlPointIndex,
                    (influencesByControlPoint.get(controlPointIndex) ?? 0) + 1
                );
            }
        }

        for (const count of influencesByControlPoint.values()) {
            maxInfluences = Math.max(maxInfluences, count);
            if (count > 4) verticesOver4++;
        }
    }

    return { maxInfluences, verticesOver4 };
}

function getInt32ArrayChild(node: FBXNode, childName: string): Int32Array | null {
    const value = findChildByName(node, childName)?.properties[0]?.value;
    return value instanceof Int32Array ? value : null;
}

function countNonDefaultInheritTypes(path: string): number {
    const scene = interpretFBX(loadDocument(path));
    return collectModels(scene.rootModels).filter((model) => model.inheritType !== 1).length;
}

function countNonDefaultInheritTypeDiagnostics(path: string): number {
    const scene = interpretFBX(loadDocument(path));
    return collectModels(scene.rootModels).filter((model) =>
        model.inheritType !== 1 &&
        model.diagnostics.some((diagnostic) => diagnostic.includes("InheritType"))
    ).length;
}

function collectModels(models: ReturnType<typeof interpretFBX>["rootModels"]): ReturnType<typeof interpretFBX>["rootModels"] {
    const result: ReturnType<typeof interpretFBX>["rootModels"] = [];
    for (const model of models) {
        result.push(model);
        result.push(...collectModels(model.children));
    }
    return result;
}
