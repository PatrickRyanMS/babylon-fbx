// M06 — per-texture UV transform (translation + scaling). A checker on a plane that, with an
// identity transform, would be a clean 1x checker; here it tiles and offsets, so a regression in
// UV-transform handling is obvious. (UV rotation is omitted: it is not applied consistently by the
// FBX SDK/Maya from this property form, so it cannot be visually validated.)
import { geometry, material, texture, video, model, doc, idGen, OO, OP } from "../lib/fbxScene.mjs";
import { plane } from "../lib/shapes.mjs";
import { checker } from "../lib/png.mjs";

export function buildM06() {
    const next = idGen(100);
    const geomId = next(), modelId = next(), matId = next(), texId = next(), vidId = next();

    const objects = [
        geometry(geomId, "UVPlane", plane(2, 2, 1, 1)),
        model(modelId, "UVPlane", "Mesh"),
        material(matId, "UVMat", "Lambert", { diffuse: [1, 1, 1] }),
        texture(texId, "UVTex", "m06_checker.png", "m06_checker.png", {
            media: "UVTex",
            uvScaling: [3, 3],
            uvTranslation: [0.15, 0.0],
            uvSet: "map1",
        }),
        video(vidId, "UVTex", "m06_checker.png", checker(64, 2, [235, 235, 235, 255], [200, 60, 60, 255])),
    ];
    const connections = [OO(modelId, 0), OO(geomId, modelId), OO(matId, modelId), OP(texId, matId, "DiffuseColor"), OO(vidId, texId)];
    return { nodes: doc(objects, connections), version: 7500 };
}
