// M11 — node animation with constant / linear / cubic interpolation, rendered at a pinned time.
//   red:   Translation Y, constant (stepped)
//   green: Rotation Z,   linear  (spin)
//   blue:  Scale,        cubic   (ease in/out)
import { doc, idGen, meshTriplet } from "../lib/fbxScene.mjs";
import { box } from "../lib/shapes.mjs";
import { buildAnimation } from "../lib/anim.mjs";

export function buildM11() {
    const next = idGen(100);
    const objects = [], connections = [];
    const B = () => box(0.5, 0.5, 0.5);

    const b1 = meshTriplet(next, "TransConst", B(), { type: "Lambert", matProps: { diffuse: [0.9, 0.3, 0.3] }, transform: { translation: [-1.6, 0, 0] } });
    const b2 = meshTriplet(next, "RotLinear", B(), { type: "Lambert", matProps: { diffuse: [0.3, 0.8, 0.3] }, transform: { translation: [0, 0, 0] } });
    const b3 = meshTriplet(next, "ScaleCubic", B(), { type: "Lambert", matProps: { diffuse: [0.3, 0.5, 0.9] }, transform: { translation: [1.6, 0, 0] } });
    objects.push(...b1.objects, ...b2.objects, ...b3.objects);
    connections.push(...b1.connections, ...b2.connections, ...b3.connections);

    const anim = buildAnimation(next, [{
        name: "Take 001", start: 0, stop: 2,
        tracks: [
            {
                modelId: b1.modelId, type: "T", prop: "Lcl Translation", defaults: [-1.6, 0, 0],
                channels: { Y: [{ t: 0, v: -0.8, interp: "constant" }, { t: 0.66, v: 0, interp: "constant" }, { t: 1.33, v: 0.8, interp: "constant" }, { t: 2, v: -0.8, interp: "constant" }] },
            },
            {
                modelId: b2.modelId, type: "R", prop: "Lcl Rotation", defaults: [0, 0, 0],
                channels: { Z: [{ t: 0, v: 0, interp: "linear" }, { t: 2, v: 360, interp: "linear" }] },
            },
            {
                modelId: b3.modelId, type: "S", prop: "Lcl Scaling", defaults: [1, 1, 1],
                channels: {
                    X: [{ t: 0, v: 1, interp: "cubic" }, { t: 1, v: 1.8, interp: "cubic" }, { t: 2, v: 1, interp: "cubic" }],
                    Y: [{ t: 0, v: 1, interp: "cubic" }, { t: 1, v: 1.8, interp: "cubic" }, { t: 2, v: 1, interp: "cubic" }],
                    Z: [{ t: 0, v: 1, interp: "cubic" }, { t: 1, v: 1.8, interp: "cubic" }, { t: 2, v: 1, interp: "cubic" }],
                },
            },
        ],
    }]);
    objects.push(...anim.objects);
    connections.push(...anim.connections);

    return { nodes: doc(objects, connections), version: 7500 };
}
