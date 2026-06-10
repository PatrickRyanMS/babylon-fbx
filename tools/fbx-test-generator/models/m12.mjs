// M12 — skeletal animation. The M09 cylinder rig with a straight bind/rest, plus an animation
// that rotates the bones over time, so at the pinned mid-clip frame the cylinder is bent.
import { geometry, material, model, doc, idGen, OO } from "../lib/fbxScene.mjs";
import { cylinder } from "../lib/shapes.mjs";
import { buildSkin } from "../lib/skin.mjs";
import { buildAnimation } from "../lib/anim.mjs";

export function buildM12() {
    const next = idGen(100);
    const geomId = next(), meshModel = next(), matId = next();
    const cyl = cylinder(0.28, 2, 16, 14);
    const objects = [
        geometry(geomId, "AnimSkin", cyl),
        model(meshModel, "AnimSkin", "Mesh"),
        material(matId, "AnimSkinMat", "Phong", { diffuse: [0.55, 0.6, 0.7], specular: [0.4, 0.4, 0.4], specularFactor: 1, shininess: 24 }),
    ];
    const connections = [OO(meshModel, 0), OO(geomId, meshModel), OO(matId, meshModel)];

    // Straight rest + bind; animation does the bending.
    const bones = [
        { name: "J0", bindY: -1, localT: [0, -1, 0], localR: [0, 0, 0], parent: -1 },
        { name: "J1", bindY: 0, localT: [0, 1, 0], localR: [0, 0, 0], parent: 0 },
        { name: "J2", bindY: 1, localT: [0, 1, 0], localR: [0, 0, 0], parent: 1 },
    ];
    const skin = buildSkin(next, geomId, meshModel, cyl.positions, bones);
    objects.push(...skin.objects);
    connections.push(...skin.connections);

    const rotKeys = [{ t: 0, v: 0, interp: "linear" }, { t: 1, v: 38, interp: "linear" }, { t: 2, v: 0, interp: "linear" }];
    const anim = buildAnimation(next, [{
        name: "Take 001", start: 0, stop: 2,
        tracks: [
            { modelId: skin.boneIds[1], type: "R", prop: "Lcl Rotation", defaults: [0, 0, 0], channels: { Z: rotKeys } },
            { modelId: skin.boneIds[2], type: "R", prop: "Lcl Rotation", defaults: [0, 0, 0], channels: { Z: rotKeys } },
        ],
    }]);
    objects.push(...anim.objects);
    connections.push(...anim.connections);

    return { nodes: doc(objects, connections), version: 7500 };
}
