// Blend-shape (morph target) builder: a BlendShape deformer with one or more channels, each with
// one or more Shape geometries (in-between targets via FullWeights). Shape Vertices are deltas.
import { n, I, L, D, S, Dn, In, P, objProps } from "./fbxNode.mjs";
import { OO } from "./fbxScene.mjs";

/**
 * @param next id generator
 * @param geomId base mesh geometry id
 * @param channels [{ name, deformPercent, shapes: [{ fullWeight, indices:[cp...], deltas:[[dx,dy,dz]...], normals? }] }]
 * @returns { objects, connections }
 */
export function buildBlendShape(next, geomId, channels) {
    const objects = [], connections = [];
    const channelIds = [];
    const bsId = next();
    objects.push(n("Deformer", objProps(bsId, "Deformer::BlendShape", "BlendShape"), [
        n("Version", [I(100)]),
        n("Properties70", [], []),
    ]));
    connections.push(OO(bsId, geomId));

    for (const ch of channels) {
        const channelId = next();
        channelIds.push(channelId);
        const fullWeights = ch.shapes.map((s) => s.fullWeight);
        objects.push(n("Deformer", objProps(channelId, `SubDeformer::${ch.name}`, "BlendShapeChannel"), [
            n("Version", [I(100)]),
            n("DeformPercent", [D(ch.deformPercent)]),
            n("FullWeights", [Dn(fullWeights)]),
            n("Properties70", [], [P("DeformPercent", "Number", "", "A", D(ch.deformPercent))]),
        ]));
        connections.push(OO(channelId, bsId));

        for (const s of ch.shapes) {
            const shapeId = next();
            const flatDeltas = [];
            for (const d of s.deltas) flatDeltas.push(d[0], d[1], d[2]);
            const children = [
                n("Version", [I(100)]),
                n("Indexes", [In(s.indices)]),
                n("Vertices", [Dn(flatDeltas)]),
            ];
            if (s.normals) {
                const fn = [];
                for (const nn of s.normals) fn.push(nn[0], nn[1], nn[2]);
                children.push(n("Normals", [Dn(fn)]));
            }
            objects.push(n("Geometry", objProps(shapeId, `Geometry::${ch.name}_${s.fullWeight}`, "Shape"), children));
            connections.push(OO(shapeId, channelId));
        }
    }
    return { objects, connections, channelIds };
}
