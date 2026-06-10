// Skinning builder: bone LimbNode models + NodeAttributes, a Skin deformer with one Cluster per
// bone (Indexes/Weights + bind matrices), and a BindPose. The mesh deforms because the bones' rest
// (Lcl) transforms differ from the straight bind pose stored in the clusters.
import { n, I, L, D, S, Dn, In, P, objProps } from "./fbxNode.mjs";
import { model, transformProps, OO } from "./fbxScene.mjs";

// Row-major 4x4 translation matrix (FBX stores translation in elements 12..14).
function transMat(x, y, z) {
    return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
}

// Smooth per-bone weights: each bone's influence falls off as a Gaussian in Y around its bind
// position, then the influences are normalized. This gives natural, overlapping weights (a smooth
// bend) instead of the sharp seams a piecewise-linear ramp produces.
function blendWeights(y, bindYs) {
    const spacing = (bindYs[bindYs.length - 1] - bindYs[0]) / Math.max(1, bindYs.length - 1);
    const sigma = spacing * 0.9;
    const raw = bindYs.map((by) => Math.exp(-(((y - by) / sigma) ** 2)));
    const sum = raw.reduce((a, b) => a + b, 0) || 1;
    return raw.map((r) => r / sum);
}

/**
 * @param next id generator
 * @param geomId mesh geometry id
 * @param meshModelId mesh model id (for the bind pose)
 * @param positions control points [[x,y,z]...]
 * @param bones [{ name, bindY, localT:[x,y,z], localR:[x,y,z], parent: boneIndex|-1 }]
 * @returns { objects, connections, boneIds }
 */
export function buildSkin(next, geomId, meshModelId, positions, bones) {
    const objects = [], connections = [];
    const boneIds = bones.map(() => next());

    bones.forEach((b, i) => {
        objects.push(model(boneIds[i], b.name, "LimbNode", transformProps({ translation: b.localT, rotation: b.localR || [0, 0, 0] })));
        const naId = next();
        objects.push(n("NodeAttribute", objProps(naId, `NodeAttribute::${b.name}`, "LimbNode"), [
            n("TypeFlags", [S("Skeleton")]),
            n("Properties70", [], [P("Size", "double", "Number", "", D(2))]),
        ]));
        connections.push(OO(naId, boneIds[i]));
        connections.push(OO(boneIds[i], b.parent >= 0 ? boneIds[b.parent] : 0));
    });

    const skinId = next();
    objects.push(n("Deformer", objProps(skinId, "Deformer::Skin", "Skin"), [
        n("Version", [I(101)]),
        n("Link_DeformAcuracy", [D(50)]),
        n("Properties70", [], []),
    ]));
    connections.push(OO(skinId, geomId));

    const perBone = bones.map(() => ({ idx: [], w: [] }));
    const bindYs = bones.map((b) => b.bindY);
    positions.forEach((p, ci) => {
        blendWeights(p[1], bindYs).forEach((w, bi) => {
            if (w > 1e-4) { perBone[bi].idx.push(ci); perBone[bi].w.push(w); }
        });
    });

    const poseNodes = [{ modelId: meshModelId, matrix: transMat(0, 0, 0) }];
    bones.forEach((b, i) => {
        const clusterId = next();
        const link = transMat(0, b.bindY, 0); // bone world bind (straight)
        objects.push(n("Deformer", objProps(clusterId, "SubDeformer::Cluster", "Cluster"), [
            n("Version", [I(100)]),
            n("UserData", [S(""), S("")]),
            n("Indexes", [In(perBone[i].idx)]),
            n("Weights", [Dn(perBone[i].w)]),
            n("Transform", [Dn(transMat(0, 0, 0))]), // mesh world bind (identity)
            n("TransformLink", [Dn(link)]),
        ]));
        connections.push(OO(clusterId, skinId));
        connections.push(OO(boneIds[i], clusterId));
        poseNodes.push({ modelId: boneIds[i], matrix: link });
    });

    const poseId = next();
    objects.push(n("Pose", objProps(poseId, "Pose::BindPose", "BindPose"), [
        n("Type", [S("BindPose")]),
        n("Version", [I(100)]),
        n("NbPoseNodes", [I(poseNodes.length)]),
        ...poseNodes.map((pn) => n("PoseNode", [], [n("Node", [L(pn.modelId)]), n("Matrix", [Dn(pn.matrix)])])),
    ]));

    return { objects, connections, boneIds };
}
