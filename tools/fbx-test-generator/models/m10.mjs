// M10 — morph targets with in-betweens. A grid plane with one blend-shape channel that has two
// in-between shapes (FullWeights 50 and 100) bulging the centre toward +Z. DeformPercent is set
// so the static render shows the bulge — proving morph targets + in-between selection are read.
import { geometry, material, model, doc, idGen, transformProps, OO } from "../lib/fbxScene.mjs";
import { plane } from "../lib/shapes.mjs";
import { buildBlendShape } from "../lib/morph.mjs";

export function buildM10() {
    const next = idGen(100);
    const geomId = next(), meshModel = next(), matId = next();
    const grid = plane(2.4, 2.4, 14, 14);

    const objects = [
        geometry(geomId, "MorphPlane", grid),
        // Laid flat (rotated about X) so the +Z bulge points up — an obvious hill from an oblique view.
        model(meshModel, "MorphPlane", "Mesh", transformProps({ rotation: [-90, 0, 0] })),
        material(matId, "MorphMat", "Phong", { diffuse: [0.4, 0.6, 0.85], specular: [0.5, 0.5, 0.5], specularFactor: 1, shininess: 24 }),
    ];
    const connections = [OO(meshModel, 0), OO(geomId, meshModel), OO(matId, meshModel)];

    // Gaussian centre bulge in +Z; `scale` selects the in-between amplitude.
    const bulge = (scale) => {
        const indices = [], deltas = [], normals = [];
        grid.positions.forEach((p, ci) => {
            const r2 = p[0] * p[0] + p[1] * p[1];
            const dz = scale * 0.9 * Math.exp(-r2 / 0.5);
            if (dz > 1e-3) {
                indices.push(ci);
                deltas.push([0, 0, dz]);
                // Approximate morphed normal tilting outward from the peak.
                const g = (scale * 0.9 * 2 / 0.5) * Math.exp(-r2 / 0.5);
                const nx = p[0] * g, ny = p[1] * g, nz = 1;
                const len = Math.hypot(nx, ny, nz) || 1;
                normals.push([nx / len, ny / len, nz / len]);
            }
        });
        return { indices, deltas, normals };
    };

    const half = bulge(0.5), full = bulge(1.0);
    const bs = buildBlendShape(next, geomId, [{
        name: "Bulge",
        deformPercent: 100,
        shapes: [
            { fullWeight: 50, indices: half.indices, deltas: half.deltas, normals: half.normals },
            { fullWeight: 100, indices: full.indices, deltas: full.deltas, normals: full.normals },
        ],
    }]);
    objects.push(...bs.objects);
    connections.push(...bs.connections);

    return { nodes: doc(objects, connections), version: 7500 };
}
