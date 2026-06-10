// M05 — texture slots (binary; embedded textures + one external sidecar).
// A row of quads, each isolating a texture slot so a regression is easy to localize:
//   diffuse | normal(debossed F, authored tangents) | emissive | opacity(holes) | external-diffuse
import { geometry, material, texture, video, model, doc, transformProps, OO, OP } from "../lib/fbxScene.mjs";
import { checker, debossedF, letterF, holes } from "../lib/png.mjs";

const QUAD = [
    [-0.6, -0.6, 0],
    [0.6, -0.6, 0],
    [0.6, 0.6, 0],
    [-0.6, 0.6, 0],
];
const QUAD_FACE = [[0, 1, 2, 3]];
const QUAD_NRM = [[0, 0, 1], [0, 0, 1], [0, 0, 1], [0, 0, 1]];
const QUAD_UV = [[0, 0], [1, 0], [1, 1], [0, 1]];
const QUAD_TAN = [[1, 0, 0], [1, 0, 0], [1, 0, 0], [1, 0, 0]];
const QUAD_BIN = [[0, 1, 0], [0, 1, 0], [0, 1, 0], [0, 1, 0]];

let nextId = 100;
const id = () => nextId++;

function quad(name, x, matProps, slots, withTangents) {
    const objects = [];
    const connections = [];
    const sidecars = [];
    const geomId = id();
    const modelId = id();
    const matId = id();

    const geomOpts = { positions: QUAD, faces: QUAD_FACE, normals: QUAD_NRM, uvs: QUAD_UV };
    if (withTangents) {
        geomOpts.tangents = QUAD_TAN;
        geomOpts.binormals = QUAD_BIN;
    }
    objects.push(geometry(geomId, name, geomOpts));
    objects.push(model(modelId, name, "Mesh", transformProps({ translation: [x, 0, 0] })));
    objects.push(material(matId, name + "Mat", "Phong", matProps));
    connections.push(OO(modelId, 0), OO(geomId, modelId), OO(matId, modelId));

    for (const s of slots) {
        const texId = id();
        const texName = name + "_" + s.prop;
        connections.push(OP(texId, matId, s.prop));
        if (s.external) {
            // Ship the texture next to the .fbx instead of embedding it.
            objects.push(texture(texId, texName, s.file, s.file));
            sidecars.push({ name: s.file, bytes: s.png });
        } else {
            const vidId = id();
            objects.push(texture(texId, texName, s.file, s.file, { media: texName }));
            objects.push(video(vidId, texName, s.file, s.png));
            connections.push(OO(vidId, texId));
        }
    }
    return { objects, connections, sidecars };
}

export function buildM05() {
    const blocks = [
        quad("Diffuse", -2.8, { diffuse: [1, 1, 1] }, [{ prop: "DiffuseColor", file: "m05_diffuse.png", png: checker(64) }]),
        quad("Normal", -1.4, { diffuse: [0.72, 0.72, 0.75], specular: [1, 1, 1], specularFactor: 1, shininess: 24 },
            [{ prop: "NormalMap", file: "m05_normal.png", png: debossedF(96) }], true),
        quad("Emissive", 0.0, { diffuse: [0.05, 0.05, 0.05] },
            [{ prop: "EmissiveColor", file: "m05_emissive.png", png: letterF(64, [60, 255, 140, 255], [0, 0, 0, 255]) }]),
        quad("Opacity", 1.4, { diffuse: [1, 1, 1] },
            [
                { prop: "DiffuseColor", file: "m05_op_diffuse.png", png: checker(64, 8, [60, 160, 230, 255], [20, 60, 110, 255]) },
                { prop: "TransparentColor", file: "m05_opacity.png", png: holes(64) },
            ]),
        quad("External", 2.8, { diffuse: [1, 1, 1] },
            [{ prop: "DiffuseColor", file: "m05_external_diffuse.png", png: letterF(64, [230, 120, 40, 255], [250, 245, 230, 255]), external: true }]),
    ];

    const objects = blocks.flatMap((b) => b.objects);
    const connections = blocks.flatMap((b) => b.connections);
    const sidecars = blocks.flatMap((b) => b.sidecars);

    return { nodes: doc(objects, connections), version: 7500, sidecars };
}
