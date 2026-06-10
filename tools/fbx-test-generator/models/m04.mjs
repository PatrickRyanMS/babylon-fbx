// M04 — material properties on a row of spheres (no textures, solid colors for determinism):
//   Lambert | Phong tight-spec | Phong broad-spec | Emissive | Ambient | Transparent
import { doc, idGen, meshTriplet } from "../lib/fbxScene.mjs";
import { uvSphere } from "../lib/shapes.mjs";

export function buildM04() {
    const next = idGen(100);
    const sphere = () => uvSphere(0.5, 16, 24);
    const specs = [
        { name: "Lambert", type: "Lambert", props: { diffuse: [0.85, 0.2, 0.2] } },
        { name: "PhongTight", type: "Phong", props: { diffuse: [0.2, 0.4, 0.85], specular: [1, 1, 1], specularFactor: 1, shininess: 80 } },
        { name: "PhongBroad", type: "Phong", props: { diffuse: [0.2, 0.4, 0.85], specular: [1, 1, 1], specularFactor: 1, shininess: 6 } },
        { name: "Emissive", type: "Lambert", props: { diffuse: [0.05, 0.05, 0.05], emissive: [0.1, 0.9, 0.3] } },
        { name: "Ambient", type: "Lambert", props: { diffuse: [0.1, 0.1, 0.1], ambient: [0.9, 0.7, 0.2] } },
        { name: "Transparent", type: "Phong", props: { diffuse: [0.85, 0.7, 0.2], specular: [1, 1, 1], specularFactor: 1, shininess: 40, opacity: 0.4 } },
    ];

    const objects = [], connections = [];
    const startX = -((specs.length - 1) * 1.25) / 2;
    specs.forEach((s, i) => {
        const m = meshTriplet(next, s.name, sphere(), { type: s.type, matProps: s.props, transform: { translation: [startX + i * 1.25, 0, 0] } });
        objects.push(...m.objects);
        connections.push(...m.connections);
    });

    return { nodes: doc(objects, connections), version: 7500 };
}
