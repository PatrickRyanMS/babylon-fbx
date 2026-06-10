// M13 — morph (DeformPercent) animation. The M10 morph plane with the channel's DeformPercent
// animated 0 -> 100 -> 0, so at the pinned mid-clip frame the bulge is fully applied.
import { geometry, material, model, doc, idGen, transformProps, OO } from "../lib/fbxScene.mjs";
import { plane } from "../lib/shapes.mjs";
import { buildBlendShape } from "../lib/morph.mjs";
import { buildAnimation } from "../lib/anim.mjs";

export function buildM13() {
    const next = idGen(100);
    const geomId = next(), meshModel = next(), matId = next();
    const grid = plane(2.4, 2.4, 14, 14);
    const objects = [
        geometry(geomId, "MorphAnim", grid),
        // Laid flat so the animated +Z bulge rises as a hill (clearly visible from an oblique view).
        model(meshModel, "MorphAnim", "Mesh", transformProps({ rotation: [-90, 0, 0] })),
        material(matId, "MorphAnimMat", "Phong", { diffuse: [0.45, 0.8, 0.55], specular: [0.5, 0.5, 0.5], specularFactor: 1, shininess: 24 }),
    ];
    const connections = [OO(meshModel, 0), OO(geomId, meshModel), OO(matId, meshModel)];

    const indices = [], deltas = [], normals = [];
    grid.positions.forEach((p, ci) => {
        const r2 = p[0] * p[0] + p[1] * p[1];
        const dz = 0.9 * Math.exp(-r2 / 0.5);
        if (dz > 1e-3) {
            indices.push(ci);
            deltas.push([0, 0, dz]);
            const g = (0.9 * 2 / 0.5) * Math.exp(-r2 / 0.5);
            const nx = p[0] * g, ny = p[1] * g, nz = 1, len = Math.hypot(nx, ny, nz) || 1;
            normals.push([nx / len, ny / len, nz / len]);
        }
    });

    const bs = buildBlendShape(next, geomId, [{ name: "Bulge", deformPercent: 0, shapes: [{ fullWeight: 100, indices, deltas, normals }] }]);
    objects.push(...bs.objects);
    connections.push(...bs.connections);

    const anim = buildAnimation(next, [{
        name: "Take 001", start: 0, stop: 2,
        tracks: [{
            modelId: bs.channelIds[0], type: "DeformPercent", prop: "DeformPercent", channel: "d|DeformPercent", default: 0,
            keys: [{ t: 0, v: 0, interp: "linear" }, { t: 1, v: 100, interp: "linear" }, { t: 2, v: 0, interp: "linear" }],
        }],
    }]);
    objects.push(...anim.objects);
    connections.push(...anim.connections);

    return { nodes: doc(objects, connections), version: 7500 };
}
