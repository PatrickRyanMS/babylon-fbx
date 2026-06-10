// M03 — normal mapping/reference modes: smooth (ByControlPoint) vs flat (ByPolygonVertex) shading.
import { doc, idGen, meshTriplet } from "../lib/fbxScene.mjs";
import { uvSphere } from "../lib/shapes.mjs";

export function buildM03() {
    const next = idGen(100);
    const mat = { type: "Phong", matProps: { diffuse: [0.6, 0.62, 0.7], specular: [0.5, 0.5, 0.5], specularFactor: 1, shininess: 24 } };

    const smooth = meshTriplet(next, "SmoothSphere", uvSphere(0.6, 16, 24, { flat: false }), { ...mat, transform: { translation: [-0.8, 0, 0] } });
    const flat = meshTriplet(next, "FlatSphere", uvSphere(0.6, 16, 24, { flat: true }), { ...mat, transform: { translation: [0.8, 0, 0] } });

    return {
        nodes: doc([...smooth.objects, ...flat.objects], [...smooth.connections, ...flat.connections]),
        version: 7500,
    };
}
