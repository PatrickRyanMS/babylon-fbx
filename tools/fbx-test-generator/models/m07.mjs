// M07 — multi-material submeshes (per-polygon material indices). One cube whose 3 face-pairs use
// 3 different materials, so the loader must split the mesh into 3 submeshes. A regression in
// per-polygon material assignment is obvious (faces get the wrong color).
import { geometry, material, model, doc, idGen, transformProps, OO } from "../lib/fbxScene.mjs";
import { box } from "../lib/shapes.mjs";

export function buildM07() {
    const next = idGen(100);
    const objects = [], connections = [];

    // Multi-material cube: 6 faces -> material indices [0,0,1,1,2,2].
    const cubeGeom = next(), cubeModel = next(), mA = next(), mB = next(), mC = next();
    const cube = box(1.1, 1.1, 1.1);
    cube.materialIndices = [0, 0, 1, 1, 2, 2];
    cube.materialMapping = "ByPolygon";
    objects.push(
        geometry(cubeGeom, "MultiCube", cube),
        model(cubeModel, "MultiCube", "Mesh"),
        material(mA, "FaceA", "Lambert", { diffuse: [0.9, 0.2, 0.2] }),
        material(mB, "FaceB", "Lambert", { diffuse: [0.2, 0.8, 0.3] }),
        material(mC, "FaceC", "Lambert", { diffuse: [0.2, 0.4, 0.95] })
    );
    // Connection order sets material index: mA=0, mB=1, mC=2.
    connections.push(OO(cubeModel, 0), OO(cubeGeom, cubeModel), OO(mA, cubeModel), OO(mB, cubeModel), OO(mC, cubeModel));

    return { nodes: doc(objects, connections), version: 7500 };
}
