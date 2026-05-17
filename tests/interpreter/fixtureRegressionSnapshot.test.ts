import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

import { interpretFBX } from "../../src/interpreter/fbxInterpreter.js";
import { parseBinaryFBX } from "../../src/parsers/fbxBinaryParser.js";
import type { FBXDocument } from "../../src/types/fbxTypes.js";
import { createFBXRegressionSnapshot } from "../helpers/fbxRegressionSnapshot.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const aishaPath = resolve(__dirname, "../models/anime-chibi-girl-aisha-by-seraphim/test2.fbx");
const tamagotchiPath = resolve(__dirname, "../models/tamagotchi-pet-sailor-moon/lp_01.fbx");
const strongholdPath = resolve(__dirname, "../models/the-last-stronghold-animated/Floating_Gate_Chinese1.fbx");
const vinoPath = resolve(__dirname, "../models/vino/SM_Vino.fbx");

describe("FBX fixture regression snapshots", () => {
    it("captures stable static-scene counts for Tamagotchi and Vino", () => {
        const tamagotchi = createFBXRegressionSnapshot(interpretFBX(loadDocument(tamagotchiPath)));
        const vino = createFBXRegressionSnapshot(interpretFBX(loadDocument(vinoPath)));

        expect(tamagotchi).toMatchObject({
            rootModelCount: 1,
            modelCount: 38,
            meshModelCount: 36,
            geometryCount: 36,
            materialCount: 1,
            skinCount: 0,
            animationCount: 0,
        });
        expect(tamagotchi.geometries[0]).toMatchObject({
            name: "Corps_01_low016",
            vertexCount: 426,
            indexCount: 426,
            triangleCount: 142,
        });

        expect(vino).toMatchObject({
            rootModelCount: 3,
            modelCount: 3,
            meshModelCount: 3,
            geometryCount: 3,
            materialCount: 6,
            skinCount: 0,
        });
        expect(vino.totalTriangles).toBe(95599);
    });

    it("captures stable rig and animation counts for skinned fixtures", () => {
        const aisha = createFBXRegressionSnapshot(interpretFBX(loadDocument(aishaPath)));
        const stronghold = createFBXRegressionSnapshot(interpretFBX(loadDocument(strongholdPath)));

        expect(aisha).toMatchObject({
            rootModelCount: 1,
            modelCount: 1110,
            geometryCount: 25,
            materialCount: 7,
            skinCount: 25,
            rigCount: 1,
            rigBoneCounts: [129],
            blendShapeCount: 9,
            animationCount: 1,
        });

        expect(stronghold).toMatchObject({
            rootModelCount: 11,
            modelCount: 157,
            geometryCount: 10,
            materialCount: 10,
            skinCount: 10,
            rigCount: 1,
            rigBoneCounts: [147],
            animationCount: 1,
        });
        expect(stronghold.geometries[0]).toMatchObject({
            name: "Cylinder.016",
            vertexCount: 7936,
            triangleCount: 3968,
        });
    });
});

function loadDocument(path: string): FBXDocument {
    const file = readFileSync(path);
    const buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
    return parseBinaryFBX(buffer);
}
