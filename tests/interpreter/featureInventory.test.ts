import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

import { parseBinaryFBX } from "../../src/parsers/fbxBinaryParser.js";
import type { FBXDocument } from "../../src/types/fbxTypes.js";
import { collectFBXFeatureInventory } from "../helpers/fbxFeatureInventory.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const aishaPath = resolve(__dirname, "../models/anime-chibi-girl-aisha-by-seraphim/test2.fbx");
const tamagotchiPath = resolve(__dirname, "../models/tamagotchi-pet-sailor-moon/lp_01.fbx");
const strongholdPath = resolve(__dirname, "../models/the-last-stronghold-animated/Floating_Gate_Chinese1.fbx");
const vinoPath = resolve(__dirname, "../models/vino/SM_Vino.fbx");

describe("FBX feature inventory", () => {
    it("records legacy FBX 6 object and connection features", () => {
        const inventory = collectFBXFeatureInventory(loadDocument(tamagotchiPath));

        expect(inventory.version).toBe(6100);
        expect(inventory.connectionTypes.get("Connect:OO")).toBeGreaterThan(0);
        expect(inventory.objectTypes.get("Model:Mesh")).toBe(36);
        expect(inventory.layerElementTypes.get("LayerElementUV")).toBeGreaterThan(0);
    });

    it("records rig and animation features used by skinned fixtures", () => {
        const inventory = collectFBXFeatureInventory(loadDocument(aishaPath));

        expect(inventory.deformerTypes.get("Skin")).toBeGreaterThan(0);
        expect(inventory.deformerTypes.get("Cluster")).toBeGreaterThan(0);
        expect(inventory.deformerTypes.get("BlendShape")).toBeGreaterThan(0);
        expect(inventory.animationTargets.has("DeformPercent")).toBe(true);
        expect(inventory.propertyNames.has("InheritType")).toBe(true);
    });

    it("records associate-model and material texture diagnostics for problem fixtures", () => {
        const strongholdInventory = collectFBXFeatureInventory(loadDocument(strongholdPath));
        const vinoInventory = collectFBXFeatureInventory(loadDocument(vinoPath));

        expect(strongholdInventory.nodeNames.get("TransformAssociateModel")).toBe(1460);
        expect(vinoInventory.materialTextureSlots.has("DiffuseColor")).toBe(true);
        expect(vinoInventory.materialTextureSlots.has("TransparentColor")).toBe(true);
    });
});

function loadDocument(path: string): FBXDocument {
    const file = readFileSync(path);
    const buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
    return parseBinaryFBX(buffer);
}
