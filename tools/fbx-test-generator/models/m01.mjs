// M01 — canonical textured Phong cube (basic mesh, normals, UVs, embedded diffuse texture).
import { geometry, material, texture, video, model, doc, OO, OP } from "../lib/fbxScene.mjs";
import { letterF } from "../lib/png.mjs";
const CP = [
    [-0.5, -0.5, -0.5], // 0
    [0.5, -0.5, -0.5], // 1
    [0.5, 0.5, -0.5], // 2
    [-0.5, 0.5, -0.5], // 3
    [-0.5, -0.5, 0.5], // 4
    [0.5, -0.5, 0.5], // 5
    [0.5, 0.5, 0.5], // 6
    [-0.5, 0.5, 0.5], // 7
];

const FACES = [
    { idx: [4, 5, 6, 7], nrm: [0, 0, 1] }, // +Z front
    { idx: [1, 0, 3, 2], nrm: [0, 0, -1] }, // -Z back
    { idx: [5, 1, 2, 6], nrm: [1, 0, 0] }, // +X right
    { idx: [0, 4, 7, 3], nrm: [-1, 0, 0] }, // -X left
    { idx: [7, 6, 2, 3], nrm: [0, 1, 0] }, // +Y top
    { idx: [0, 1, 5, 4], nrm: [0, -1, 0] }, // -Y bottom
];

const FACE_UV = [[0, 0], [1, 0], [1, 1], [0, 1]];

export function buildM01() {
    const faces = FACES.map((f) => f.idx);
    const normals = [];
    const uvs = [];
    for (const f of FACES) {
        for (let i = 0; i < 4; i++) {
            normals.push(f.nrm);
            uvs.push(FACE_UV[i]);
        }
    }

    const geomId = 100;
    const modelId = 200;
    const matId = 300;
    const texId = 400;
    const vidId = 500;

    const objects = [
        geometry(geomId, "Cube", { positions: CP, faces, normals, uvs, uvName: "map1" }),
        model(modelId, "Cube", "Mesh"),
        material(matId, "CubeMat", "Phong", {
            diffuse: [0.8, 0.8, 0.8],
            specular: [0.9, 0.9, 0.9],
            specularFactor: 1,
            shininess: 32,
            ambient: [0.2, 0.2, 0.2],
        }),
        texture(texId, "CubeDiffuse", "cube_diffuse.png", "cube_diffuse.png", { media: "CubeDiffuse" }),
        video(vidId, "CubeDiffuse", "cube_diffuse.png", letterF(64)),
    ];

    const connections = [
        OO(modelId, 0),
        OO(geomId, modelId),
        OO(matId, modelId),
        OP(texId, matId, "DiffuseColor"),
        OO(vidId, texId),
    ];

    return { nodes: doc(objects, connections), version: 7500 };
}
