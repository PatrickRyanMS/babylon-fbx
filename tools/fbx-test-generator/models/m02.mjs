// M02 — n-gon triangulation + per-vertex colors.
// A flat panel (facing +Z) of coplanar polygons, each a distinct solid vertex color:
//   triangle, convex quad, convex hexagon, concave arrow (ear-clip), tiny degenerate strip.
import { geometry, material, model, doc, OO } from "../lib/fbxScene.mjs";

// Build a regular polygon centered at (cx,cy) with given radius and vertex count.
function regular(cx, cy, r, sides, startDeg = 90) {
    const pts = [];
    for (let i = 0; i < sides; i++) {
        const a = (startDeg + (i * 360) / sides) * (Math.PI / 180);
        pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    return pts;
}

export function buildM02() {
    // Each shape contributes its own control points (no sharing) at z = 0.
    const shapes = [
        { pts: regular(-3.0, 0, 0.6, 3), color: [0.90, 0.12, 0.12, 1] }, // triangle (red)
        { pts: regular(-1.5, 0, 0.6, 4, 45), color: [0.12, 0.80, 0.18, 0.5] }, // quad (green, vertex alpha 0.5)
        { pts: regular(0.2, 0, 0.7, 6), color: [0.20, 0.35, 0.95, 1] }, // hexagon (blue)
        {
            // Concave right-pointing arrow (7 verts) — exercises ear-clipping.
            pts: [
                [1.4, -0.25], [2.0, -0.25], [2.0, -0.5], [2.5, 0.0],
                [2.0, 0.5], [2.0, 0.25], [1.4, 0.25],
            ],
            color: [0.95, 0.85, 0.10, 1], // yellow
        },
        {
            // Degenerate, near-collinear quad — should drop gracefully (diagnostic).
            pts: [[3.1, -0.02], [3.5, 0.0], [3.9, 0.02], [3.5, 0.0]],
            color: [0.5, 0.5, 0.5, 1],
        },
    ];

    const positions = [];
    const faces = [];
    const colors = [];
    const normals = [];
    for (const s of shapes) {
        const base = positions.length;
        const face = [];
        for (const p of s.pts) {
            positions.push([p[0], p[1], 0]);
            face.push(base + face.length);
        }
        faces.push(face);
        for (let i = 0; i < s.pts.length; i++) {
            colors.push(s.color);
            normals.push([0, 0, 1]);
        }
    }

    const geomId = 100;
    const modelId = 200;
    const matId = 300;

    const objects = [
        geometry(geomId, "Ngons", { positions, faces, normals, colors }),
        model(modelId, "Ngons", "Mesh"),
        material(matId, "NgonMat", "Lambert", { diffuse: [1, 1, 1], ambient: [0.6, 0.6, 0.6] }),
    ];
    const connections = [OO(modelId, 0), OO(geomId, modelId), OO(matId, modelId)];
    return { nodes: doc(objects, connections), version: 7500 };
}
