// M15 — cameras & lights. A neutral subject (ground + sphere at the origin) lit by three FBX
// lights with distinct colors (red point, green spot, blue directional) plus a perspective and an
// orthographic camera. Every light and camera is oriented with a look-at so its local -Z axis
// points at the subject — the FBX/Maya convention (Maya aims cameras AND lights down local -Z;
// Babylon aims down +Z, and the loader's handedness root converts between them).
//
// NOTE: this model is also a regression asset for light/camera ORIENTATION. The FBX loader builds
// lights with a hardcoded local direction of (0,-1,0) (-Y) while it builds cameras facing +Z; an
// FBX light authored to the -Z convention here will be mis-oriented if that -Y assumption is wrong.
import { geometry, material, model, doc, idGen, meshTriplet, transformProps, OO } from "../lib/fbxScene.mjs";
import { n, I, D, S, P, objProps } from "../lib/fbxNode.mjs";
import { uvSphere } from "../lib/shapes.mjs";

// Euler XYZ (degrees) aiming a node at `target` from `pos`. FBX forward axis differs by type:
// lights look down local -Z, cameras look down local +X (the FbxCamera convention). Returned
// angles decompose the column-vector rotation R = Rx*Ry*Rz so the SDK reproduces the aim.
function aimEuler(pos, target, kind) {
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
    const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const f = norm(sub(target, pos)); // world forward
    const worldUp = [0, 1, 0];
    let col0, col1, col2; // world images of local +X, +Y, +Z
    if (kind === "camera") {
        // local +X -> forward
        const up = Math.abs(f[1]) > 0.999 ? [0, 0, 1] : worldUp;
        const upp = norm(sub(up, scale(f, dot(up, f))));
        col0 = f; col1 = upp; col2 = cross(f, upp);
    } else {
        // light: local -Z -> forward, i.e. local +Z -> -forward
        col2 = [-f[0], -f[1], -f[2]];
        const up = Math.abs(dot(col2, worldUp)) > 0.999 ? [0, 0, 1] : worldUp;
        col0 = norm(cross(up, col2));
        col1 = cross(col2, col0);
    }
    const clamp = (v) => Math.max(-1, Math.min(1, v));
    // SDK composes FBX eEulerXYZ as the column-vector product R = Rz*Ry*Rx; extract accordingly.
    const ry = Math.asin(clamp(-col0[2]));
    const rx = Math.atan2(col1[2], col2[2]);
    const rz = Math.atan2(col0[1], col0[0]);
    const deg = (r) => Math.round((r * 180 / Math.PI) * 1000) / 1000;
    return [deg(rx), deg(ry), deg(rz)];
}

function ground() {
    return {
        // Wound CCW as seen from above so the geometric normal points +Y (up), matching the
        // stored normals — otherwise the SDK/Maya treat it as backface-up.
        positions: [[-4, -0.9, -4], [4, -0.9, -4], [4, -0.9, 4], [-4, -0.9, 4]],
        faces: [[0, 3, 2, 1]],
        normals: [[0, 1, 0], [0, 1, 0], [0, 1, 0], [0, 1, 0]],
        uvs: [[0, 0], [0, 1], [1, 1], [1, 0]],
    };
}

function lightObj(next, name, type, color, intensity, translation, rotation, coneAngle) {
    const modelId = next(), naId = next();
    const p70 = [
        P("Color", "Color", "", "A", D(color[0]), D(color[1]), D(color[2])),
        P("Intensity", "Number", "", "A", D(intensity)),
        P("LightType", "enum", "", "", I(type)),
    ];
    if (coneAngle !== undefined) {
        p70.push(P("OuterAngle", "Number", "", "A", D(coneAngle)), P("InnerAngle", "Number", "", "A", D(coneAngle * 0.6)));
    }
    return {
        objects: [
            model(modelId, name, "Light", transformProps({ translation, rotation })),
            n("NodeAttribute", objProps(naId, `NodeAttribute::${name}`, "Light"), [n("TypeFlags", [S("Light")]), n("Properties70", [], p70)]),
        ],
        connections: [OO(modelId, 0), OO(naId, modelId)],
    };
}

function cameraObj(next, name, translation, rotation, ortho) {
    const modelId = next(), naId = next();
    const p70 = [
        P("FieldOfView", "Number", "", "A", D(50)),
        P("NearPlane", "Number", "", "A", D(0.01)),
        P("FarPlane", "Number", "", "A", D(2000)),
        P("CameraProjectionType", "enum", "", "", I(ortho ? 1 : 0)),
    ];
    if (ortho) p70.push(P("OrthoZoom", "Number", "", "A", D(5)));
    return {
        objects: [
            model(modelId, name, "Camera", transformProps({ translation, rotation })),
            n("NodeAttribute", objProps(naId, `NodeAttribute::${name}`, "Camera"), [n("TypeFlags", [S("Camera")]), n("Properties70", [], p70)]),
        ],
        connections: [OO(modelId, 0), OO(naId, modelId)],
    };
}

export function buildM15() {
    const next = idGen(100);
    const objects = [], connections = [];
    const subject = [0, 0, 0]; // sphere centre — everything aims here

    // Ground + sphere.
    const gGeom = next(), gModel = next(), gMat = next();
    objects.push(
        geometry(gGeom, "Ground", ground()),
        model(gModel, "Ground", "Mesh"),
        material(gMat, "GroundMat", "Phong", { diffuse: [0.7, 0.7, 0.72] })
    );
    connections.push(OO(gModel, 0), OO(gGeom, gModel), OO(gMat, gModel));

    const sphere = meshTriplet(next, "Subject", uvSphere(0.7, 16, 24), { type: "Phong", matProps: { diffuse: [0.85, 0.85, 0.85], specular: [0.6, 0.6, 0.6], specularFactor: 1, shininess: 32 } });
    objects.push(...sphere.objects);
    connections.push(...sphere.connections);

    // Three colored lights, each aimed (local -Z) at the subject.
    //   point (red, omni — no aim), spot (green, tight cone), directional (blue).
    const redPos = [2.8, 1.1, 2.4];
    const greenPos = [-2.8, 1.5, 2.0];
    const bluePos = [0.0, 2.4, 3.0];
    // Intensities are FBX-standard scale (~100 = full); the loader divides by 100.
    const lights = [
        lightObj(next, "RedPoint", 0, [1, 0.2, 0.2], 110, redPos, [0, 0, 0]),
        lightObj(next, "GreenSpot", 2, [0.25, 1, 0.3], 350, greenPos, aimEuler(greenPos, subject, "light"), 40),
        lightObj(next, "BlueDir", 1, [0.3, 0.45, 1], 70, bluePos, aimEuler(bluePos, subject, "light")),
    ];
    for (const l of lights) { objects.push(...l.objects); connections.push(...l.connections); }

    // Perspective + orthographic cameras, both aimed at the subject.
    const perspPos = [3.6, 2.6, 4.6];
    const orthoPos = [0, 1.4, 6];
    const persp = cameraObj(next, "PerspCam", perspPos, aimEuler(perspPos, subject, "camera"), false);
    const orthoCam = cameraObj(next, "OrthoCam", orthoPos, aimEuler(orthoPos, subject, "camera"), true);
    objects.push(...persp.objects, ...orthoCam.objects);
    connections.push(...persp.connections, ...orthoCam.connections);

    return { nodes: doc(objects, connections), version: 7500 };
}
