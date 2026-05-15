import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { parseBinaryFBX } from "../../src/parsers/fbxBinaryParser.js";
import { interpretFBX } from "../../src/interpreter/fbxInterpreter.js";
import { sampleFBXCurveAtTime } from "../../src/interpreter/animation.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const spiderPath = resolve(__dirname, "../models/spider-animated-character/Spider_sketchfab.fbx");
const bristlebackPath = resolve(__dirname, "../models/bristleback-dota-fan-art/POSE.fbx");
const wwiPlanePath = resolve(__dirname, "../models/stylized-ww1-plane/PlaneAnimated with toon.fbx");

function loadSpider() {
    const buf = readFileSync(spiderPath);
    const doc = parseBinaryFBX(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    return interpretFBX(doc);
}

function loadBristleback() {
    const buf = readFileSync(bristlebackPath);
    const doc = parseBinaryFBX(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    return interpretFBX(doc);
}

function loadWWIPlane() {
    const buf = readFileSync(wwiPlanePath);
    const doc = parseBinaryFBX(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    return interpretFBX(doc);
}

describe("Skeleton extraction", () => {
    it("should extract skin deformer from spider model", () => {
        const scene = loadSpider();
        expect(scene.skins.length).toBe(1);
    });

    it("should extract 48 bones from the spider skeleton", () => {
        const scene = loadSpider();
        const skin = scene.skins[0];
        expect(skin.bones.length).toBe(48);
    });

    it("should have correct bone hierarchy (parents before children)", () => {
        const scene = loadSpider();
        const skin = scene.skins[0];

        // Every bone's parent index should be less than its own index (or -1 for roots)
        for (const bone of skin.bones) {
            expect(bone.parentIndex).toBeLessThan(bone.index);
        }
    });

    it("should have root bones with parentIndex -1", () => {
        const scene = loadSpider();
        const skin = scene.skins[0];

        const rootBones = skin.bones.filter((b) => b.parentIndex === -1);
        expect(rootBones.length).toBeGreaterThan(0);
    });

    it("should have bone names", () => {
        const scene = loadSpider();
        const skin = scene.skins[0];

        for (const bone of skin.bones) {
            expect(bone.name).toBeTruthy();
            expect(bone.name.length).toBeGreaterThan(0);
        }
    });

    it("should extract vertex weights (boneIndices and boneWeights)", () => {
        const scene = loadSpider();
        const skin = scene.skins[0];

        expect(skin.boneIndices.length).toBeGreaterThan(0);
        expect(skin.boneWeights.length).toBeGreaterThan(0);
        expect(skin.boneIndices.length).toBe(skin.boneWeights.length);
    });

    it("should have at most 4 influences per vertex", () => {
        const scene = loadSpider();
        const skin = scene.skins[0];

        for (let i = 0; i < skin.boneIndices.length; i++) {
            expect(skin.boneIndices[i].length).toBeLessThanOrEqual(4);
            expect(skin.boneWeights[i].length).toBeLessThanOrEqual(4);
        }
    });

    it("should have normalized weights (sum ≈ 1.0) for influenced vertices", () => {
        const scene = loadSpider();
        const skin = scene.skins[0];

        let checkedCount = 0;
        for (let i = 0; i < skin.boneWeights.length; i++) {
            if (skin.boneWeights[i].length === 0) continue;
            const sum = skin.boneWeights[i].reduce((a, b) => a + b, 0);
            expect(sum).toBeCloseTo(1.0, 4);
            checkedCount++;
        }
        expect(checkedCount).toBeGreaterThan(0);
    });

    it("should have cluster matrices (Transform/TransformLink)", () => {
        const scene = loadSpider();
        const skin = scene.skins[0];

        // At least some bones should have transform matrices
        const bonesWithMatrices = skin.bones.filter(
            (b) => b.transformLinkMatrix !== null
        );
        expect(bonesWithMatrices.length).toBeGreaterThan(0);
    });

    it("should preserve non-cluster skeleton ancestors", () => {
        const scene = loadBristleback();
        const bipedSkins = scene.skins.filter((skin) => skin.bones[0]?.name === "Bip001");

        expect(bipedSkins.length).toBeGreaterThan(0);

        for (const skin of bipedSkins) {
            const bipedRoot = skin.bones[0];
            const pelvis = skin.bones.find((bone) => bone.name === "Bip001 Pelvis");

            expect(bipedRoot.parentIndex).toBe(-1);
            expect(bipedRoot.transformLinkMatrix).toBeNull();
            expect(pelvis).toBeDefined();
            expect(pelvis!.parentIndex).toBe(bipedRoot.index);
            expect(skin.bones.some((bone) => bone.transformLinkMatrix !== null)).toBe(true);
        }
    });

    it("should use declared animation stack time span when present", () => {
        const scene = loadBristleback();
        const animation = scene.animations.find((anim) => anim.name === "animtion_bristleback_base");

        expect(animation).toBeDefined();
        expect(animation!.startTime).toBeCloseTo(0, 5);
        expect(animation!.stopTime).toBeCloseTo(4, 5);
        expect(animation!.duration).toBeCloseTo(4, 5);
    });

    it("should preserve declared animation stack duration after keyframe rebasing", () => {
        const scene = loadWWIPlane();
        const animation = scene.animations.find((anim) => anim.name === "Take 001");

        expect(animation).toBeDefined();
        expect(animation!.startTime * 30).toBeCloseTo(0, 3);
        expect(animation!.stopTime * 30).toBeCloseTo(148.75, 3);
    });

    it("should preserve Bristleback cubic morph curve interpolation", () => {
        const scene = loadBristleback();
        const channel = scene.blendShapes
            .flatMap((blendShape) => blendShape.channels)
            .find((c) => c.name === "body_morph_4");
        const animation = scene.animations.find((anim) => anim.name === "animtion_bristleback_base");
        const curveNode = animation?.curveNodes.find((cn) => cn.targetModelId === channel?.id);
        const curve = curveNode?.curves[0];

        expect(channel).toBeDefined();
        expect(curve).toBeDefined();

        const peakKey = curve!.keys.find((key) => Math.abs(key.time * 30 - 16) < 0.001);
        expect(peakKey).toBeDefined();
        expect(peakKey!.interpolation).toBe("cubic");
        expect(peakKey!.rightSlope).toBeCloseTo(60.857, 3);
        expect(peakKey!.nextLeftSlope).toBeCloseTo(0, 5);

        const cubicFrame18 = sampleFBXCurveAtTime(curve!, 18 / 30);
        const linearFrame18 = 30.738998 + ((18 - 16) / (28 - 16)) * (56.799999 - 30.738998);
        expect(cubicFrame18).toBeCloseTo(35.487, 3);
        expect(cubicFrame18!).toBeGreaterThan(linearFrame18);
    });
});

describe("Animation extraction", () => {
    it("should extract 8 animation stacks from spider model", () => {
        const scene = loadSpider();
        expect(scene.animations.length).toBe(8);
    });

    it("should have named animation stacks", () => {
        const scene = loadSpider();
        const names = scene.animations.map((a) => a.name);
        expect(names).toContain("Spider_Tpose");
        expect(names).toContain("Spider_Walk");
        expect(names).toContain("Spider_Idle");
    });

    it("should have curve nodes in each animation stack", () => {
        const scene = loadSpider();
        for (const anim of scene.animations) {
            expect(anim.curveNodes.length).toBeGreaterThan(0);
        }
    });

    it("should have T, R, S curve node types", () => {
        const scene = loadSpider();
        // Check the Walk animation (should have full transforms)
        const walk = scene.animations.find((a) => a.name.includes("Walk"));
        expect(walk).toBeDefined();

        const types = new Set(walk!.curveNodes.map((cn) => cn.type));
        expect(types.has("T")).toBe(true);
        expect(types.has("R")).toBe(true);
        expect(types.has("S")).toBe(true);
    });

    it("should have curves with keyframes", () => {
        const scene = loadSpider();
        const walk = scene.animations.find((a) => a.name.includes("Walk"));
        expect(walk).toBeDefined();

        // At least one curve node should have curves with keyframes
        const hasKeyframes = walk!.curveNodes.some((cn) =>
            cn.curves.some((c) => c.keys.length > 0)
        );
        expect(hasKeyframes).toBe(true);
    });

    it("should have positive duration", () => {
        const scene = loadSpider();
        const walk = scene.animations.find((a) => a.name.includes("Walk"));
        expect(walk).toBeDefined();
        expect(walk!.duration).toBeGreaterThan(0);
    });

    it("should have keyframe times in seconds (reasonable range)", () => {
        const scene = loadSpider();
        const walk = scene.animations.find((a) => a.name.includes("Walk"));
        expect(walk).toBeDefined();

        for (const cn of walk!.curveNodes) {
            for (const curve of cn.curves) {
                for (const key of curve.keys) {
                    // Time should be in a reasonable range (0 to ~10 seconds)
                    expect(key.time).toBeGreaterThanOrEqual(0);
                    expect(key.time).toBeLessThan(60);
                }
            }
        }
    });
});
