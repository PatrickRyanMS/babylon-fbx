// M09 — skinning: a cylinder skinned to a 3-bone chain. The bones' rest (Lcl) pose is bent while
// the clusters store the straight bind pose, so the cylinder renders bent at the static frame —
// proving skeleton + clusters + weights + bind pose are read.
import { geometry, material, model, doc, idGen, transformProps, OO } from "../lib/fbxScene.mjs";
import { cylinder } from "../lib/shapes.mjs";
import { buildSkin } from "../lib/skin.mjs";

export function buildM09() {
    const next = idGen(100);
    const geomId = next(), meshModel = next(), matId = next();

    const cyl = cylinder(0.28, 2, 16, 14);
    const objects = [
        geometry(geomId, "SkinCylinder", cyl),
        model(meshModel, "SkinCylinder", "Mesh"),
        material(matId, "SkinMat", "Phong", { diffuse: [0.7, 0.55, 0.45], specular: [0.4, 0.4, 0.4], specularFactor: 1, shininess: 24 }),
    ];
    const connections = [OO(meshModel, 0), OO(geomId, meshModel), OO(matId, meshModel)];

    // Bind pose is straight (bindY = -1, 0, 1). Rest (Lcl) bends ~22deg at each upper joint.
    const bones = [
        { name: "Bone0", bindY: -1, localT: [0, -1, 0], localR: [0, 0, 0], parent: -1 },
        { name: "Bone1", bindY: 0, localT: [0, 1, 0], localR: [0, 0, 22], parent: 0 },
        { name: "Bone2", bindY: 1, localT: [0, 1, 0], localR: [0, 0, 22], parent: 1 },
    ];
    const skin = buildSkin(next, geomId, meshModel, cyl.positions, bones);
    objects.push(...skin.objects);
    connections.push(...skin.connections);

    return { nodes: doc(objects, connections), version: 7500 };
}
