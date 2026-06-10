// Reusable geometry primitives. Each returns geometry() options:
//   { positions: [[x,y,z]...] control points, faces: [[i,...]...], normals, uvs, normalsMapping, uvMapping }
// normals/uvs are per-control-point when *Mapping is "ByControlPoint", else per polygon-vertex.

/** Axis-aligned box centred at origin. Per-face normals + 0..1 UV per face. */
export function box(sx = 1, sy = 1, sz = 1) {
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    const cp = [
        [-hx, -hy, -hz], [hx, -hy, -hz], [hx, hy, -hz], [-hx, hy, -hz],
        [-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz],
    ];
    const F = [
        { idx: [4, 5, 6, 7], nrm: [0, 0, 1] },
        { idx: [1, 0, 3, 2], nrm: [0, 0, -1] },
        { idx: [5, 1, 2, 6], nrm: [1, 0, 0] },
        { idx: [0, 4, 7, 3], nrm: [-1, 0, 0] },
        { idx: [7, 6, 2, 3], nrm: [0, 1, 0] },
        { idx: [0, 1, 5, 4], nrm: [0, -1, 0] },
    ];
    const uv = [[0, 0], [1, 0], [1, 1], [0, 1]];
    const faces = [], normals = [], uvs = [];
    for (const f of F) {
        faces.push(f.idx);
        for (let i = 0; i < 4; i++) { normals.push(f.nrm); uvs.push(uv[i]); }
    }
    return { positions: cp, faces, normals, uvs };
}

/**
 * UV sphere. Smooth (ByControlPoint normals = normalized position) or flat (per-face normals).
 * The pole rings use triangle fans (not quads) so there are no degenerate, zero-area polygons at
 * the poles — those would collapse on triangulation and leave invalid normals (a visible "hole").
 */
export function uvSphere(r = 0.6, rings = 14, segs = 20, { flat = false } = {}) {
    const positions = [], cpNormals = [], cpUVs = [];
    const idx = (i, j) => i * (segs + 1) + j;
    for (let i = 0; i <= rings; i++) {
        const theta = (i / rings) * Math.PI;
        const st = Math.sin(theta), ct = Math.cos(theta);
        for (let j = 0; j <= segs; j++) {
            const phi = (j / segs) * Math.PI * 2;
            const x = st * Math.cos(phi), y = ct, z = st * Math.sin(phi);
            positions.push([r * x, r * y, r * z]);
            cpNormals.push([x, y, z]);
            cpUVs.push([j / segs, 1 - i / rings]);
        }
    }
    const faces = [];
    for (let i = 0; i < rings; i++) {
        for (let j = 0; j < segs; j++) {
            if (i === 0) {
                // Top pole fan: drop the degenerate pole-pole edge of the quad.
                faces.push([idx(i, j), idx(i + 1, j + 1), idx(i + 1, j)]);
            } else if (i === rings - 1) {
                // Bottom pole fan.
                faces.push([idx(i, j), idx(i, j + 1), idx(i + 1, j + 1)]);
            } else {
                faces.push([idx(i, j), idx(i, j + 1), idx(i + 1, j + 1), idx(i + 1, j)]);
            }
        }
    }
    if (!flat) {
        return { positions, faces, normals: cpNormals, normalsMapping: "ByControlPoint", uvs: cpUVs, uvMapping: "ByControlPoint" };
    }
    // Flat: per polygon-vertex face normals via Newell's method (robust for the pole triangles).
    const normals = [], uvs = [];
    for (const f of faces) {
        let nx = 0, ny = 0, nz = 0;
        for (let k = 0; k < f.length; k++) {
            const a = positions[f[k]], b = positions[f[(k + 1) % f.length]];
            nx += (a[1] - b[1]) * (a[2] + b[2]);
            ny += (a[2] - b[2]) * (a[0] + b[0]);
            nz += (a[0] - b[0]) * (a[1] + b[1]);
        }
        const len = Math.hypot(nx, ny, nz) || 1; nx /= len; ny /= len; nz /= len;
        for (let k = 0; k < f.length; k++) { normals.push([nx, ny, nz]); uvs.push(cpUVs[f[k]]); }
    }
    return { positions, faces, normals, uvs };
}

/** Subdivided plane in XY facing +Z. Per-control-point normals (+Z) and 0..1 UVs. */
export function plane(w = 1, h = 1, nx = 1, ny = 1) {
    const positions = [], cpNormals = [], cpUVs = [];
    const idx = (i, j) => i * (nx + 1) + j;
    for (let i = 0; i <= ny; i++) {
        for (let j = 0; j <= nx; j++) {
            positions.push([(j / nx - 0.5) * w, (i / ny - 0.5) * h, 0]);
            cpNormals.push([0, 0, 1]);
            cpUVs.push([j / nx, i / ny]);
        }
    }
    const faces = [];
    for (let i = 0; i < ny; i++) {
        for (let j = 0; j < nx; j++) {
            faces.push([idx(i, j), idx(i, j + 1), idx(i + 1, j + 1), idx(i + 1, j)]);
        }
    }
    return { positions, faces, normals: cpNormals, normalsMapping: "ByControlPoint", uvs: cpUVs, uvMapping: "ByControlPoint" };
}

/** Vertical cylinder along +Y, centred at origin, with `rings` height divisions (for skinning). */
export function cylinder(r = 0.3, height = 2, segs = 16, rings = 8) {
    const positions = [], cpNormals = [], cpUVs = [];
    const idx = (i, j) => i * (segs + 1) + j;
    for (let i = 0; i <= rings; i++) {
        const y = (i / rings - 0.5) * height;
        for (let j = 0; j <= segs; j++) {
            const phi = (j / segs) * Math.PI * 2;
            const cx = Math.cos(phi), cz = Math.sin(phi);
            positions.push([r * cx, y, r * cz]);
            cpNormals.push([cx, 0, cz]);
            cpUVs.push([j / segs, i / rings]);
        }
    }
    const faces = [];
    for (let i = 0; i < rings; i++) {
        for (let j = 0; j < segs; j++) {
            // Wound so the geometric (winding) normal points outward, matching the stored normals.
            faces.push([idx(i, j), idx(i + 1, j), idx(i + 1, j + 1), idx(i, j + 1)]);
        }
    }
    return { positions, faces, normals: cpNormals, normalsMapping: "ByControlPoint", uvs: cpUVs, uvMapping: "ByControlPoint" };
}
