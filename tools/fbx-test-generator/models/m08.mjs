// M08 — transform evaluator: Lcl TRS, pre/post rotation, pivots/offsets, rotation order,
// geometric (mesh-only) transform, and parent->child inheritance. Distinct colored boxes so a
// misplacement is obvious.
import { doc, idGen, meshTriplet, OO } from "../lib/fbxScene.mjs";
import { box } from "../lib/shapes.mjs";

export function buildM08() {
    const next = idGen(100);
    const objects = [], connections = [];
    const B = () => box(0.45, 0.45, 0.45);
    const add = (name, color, transform, parent = 0) => {
        const m = meshTriplet(next, name, B(), { type: "Lambert", matProps: { diffuse: color }, transform, parent });
        objects.push(...m.objects);
        connections.push(...m.connections);
        return m.modelId;
    };

    add("Base", [0.6, 0.6, 0.6], { translation: [-3, 0, 0] });
    add("Translated", [0.9, 0.2, 0.2], { translation: [-1.8, 0.6, 0] });
    add("Rotated", [0.2, 0.8, 0.2], { translation: [-0.6, 0, 0], rotation: [0, 0, 45] });
    add("Scaled", [0.2, 0.4, 0.9], { translation: [0.6, 0, 0], scaling: [0.6, 1.5, 0.6] });
    // Off-centre rotation pivot: the box orbits the pivot instead of its own centre.
    add("Pivot", [0.9, 0.8, 0.2], { translation: [1.8, 0, 0], rotationPivot: [0.4, 0.4, 0], rotation: [0, 0, 45] });
    // Non-XYZ rotation order (ZYX). The composed orientation differs from the default XYZ order.
    add("RotOrder", [0.8, 0.3, 0.8], { translation: [3, 0, 0], rotationOrder: 5, rotation: [0, 90, 90] });

    // Hierarchy: child swings out from a rotated parent.
    const parent = add("Parent", [0.2, 0.7, 0.8], { translation: [-1.4, -1.8, 0], rotation: [0, 40, 0] });
    add("Child", [0.95, 0.95, 0.95], { translation: [1.3, 0, 0] }, parent);

    // Geometric (mesh-only) transform: the mesh is offset +Y from its node pivot.
    add("Geometric", [0.95, 0.55, 0.15], { translation: [1.6, -1.8, 0], geometricTranslation: [0, 0.7, 0] });

    return { nodes: doc(objects, connections), version: 7500 };
}
