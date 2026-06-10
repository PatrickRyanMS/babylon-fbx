// M14 — multiple animation clips (AnimationStacks). One box with two stacks: "Spin" (rotates 360
// about Y over 2s) and "Bounce" (translates down/up/down over 2s). The loader surfaces each stack as
// its own AnimationGroup, so a correct import yields two groups named "Spin" and "Bounce".
// This is non-visual in a single frame (the static render just shows the box); the clip count and
// names are verified in packages/dev/loaders/test/unit/FBX/interpreter/animation.test.ts (multi-clip).
import { doc, idGen, meshTriplet } from "../lib/fbxScene.mjs";
import { box } from "../lib/shapes.mjs";
import { buildAnimation } from "../lib/anim.mjs";

export function buildM14() {
    const next = idGen(100);
    const b = meshTriplet(next, "MultiClip", box(0.7, 0.7, 0.7), { type: "Lambert", matProps: { diffuse: [0.75, 0.6, 0.3] } });

    const anim = buildAnimation(next, [
        {
            name: "Spin", start: 0, stop: 2,
            tracks: [{ modelId: b.modelId, type: "R", prop: "Lcl Rotation", defaults: [0, 0, 0], channels: { Y: [{ t: 0, v: 0, interp: "linear" }, { t: 2, v: 360, interp: "linear" }] } }],
        },
        {
            name: "Bounce", start: 0, stop: 2,
            tracks: [{ modelId: b.modelId, type: "T", prop: "Lcl Translation", defaults: [0, 0, 0], channels: { Y: [{ t: 0, v: -0.6, interp: "linear" }, { t: 1, v: 0.6, interp: "linear" }, { t: 2, v: -0.6, interp: "linear" }] } }],
        },
    ]);

    return { nodes: doc([...b.objects, ...anim.objects], [...b.connections, ...anim.connections]), version: 7500 };
}
