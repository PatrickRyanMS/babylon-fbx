// M16 — global axis & unit settings (a test of the LOADER's GlobalSettings conversion).
// An asymmetric RGB axis gizmo (X=red, Y=green/up, Z=blue) authored three ways:
//   yup   : geometry authored Y-up        (green/up arm along +Y), UpAxis=Y
//   zup   : geometry authored Z-up        (green/up arm along +Z), UpAxis=Z
//   units : same as yup but UnitScaleFactor=2.54
//
// The Babylon FBX loader reads UpAxis/FrontAxis/CoordAxis and converts the file's basis into the
// engine's Y-up/left-handed space, so all three load with green pointing +Y and the SAME size — a
// regression in axis/unit handling makes zup load rotated. NOTE: this looks the same in Babylon for
// all three precisely because the loader converts; Autodesk Maya does NOT convert axes on import, so
// opening the zup file in Maya shows the gizmo rotated (green forward) — that is the proof it is
// genuinely authored Z-up, not a renamed Y-up file. UnitScaleFactor is treated as metadata only by
// the loader (it is not applied to geometry, transforms, or morph deltas), so the units file loads
// at the yup size. Loader-level coverage: packages/dev/loaders/test/unit/FBX/axisAndUnits.test.ts.
import { doc, globalSettings, idGen, meshTriplet } from "../lib/fbxScene.mjs";
import { box } from "../lib/shapes.mjs";

function gizmoDoc(parts, settings) {
    const next = idGen(100);
    const objects = [], connections = [];
    for (const p of parts) {
        const m = meshTriplet(next, p.name, box(...p.dims), { type: "Lambert", matProps: { diffuse: p.color }, transform: { translation: p.pos } });
        objects.push(...m.objects);
        connections.push(...m.connections);
    }
    return { nodes: doc(objects, connections, globalSettings(settings)), version: 7500 };
}

const YUP_PARTS = [
    { name: "Center", dims: [0.35, 0.35, 0.35], color: [0.6, 0.6, 0.6], pos: [0, 0, 0] },
    { name: "XArm", dims: [0.7, 0.18, 0.18], color: [0.9, 0.15, 0.15], pos: [0.5, 0, 0] },
    { name: "YArm", dims: [0.18, 0.7, 0.18], color: [0.15, 0.8, 0.15], pos: [0, 0.5, 0] },
    { name: "ZArm", dims: [0.18, 0.18, 0.7], color: [0.2, 0.4, 0.95], pos: [0, 0, 0.5] },
];

// Genuinely authored Z-up: in a Z-up scene "up" is +Z, so the green/up arm is along +Z and the blue
// (FBX front) arm along -Y. The loader's conversion brings green back to engine +Y.
const ZUP_PARTS = [
    { name: "Center", dims: [0.35, 0.35, 0.35], color: [0.6, 0.6, 0.6], pos: [0, 0, 0] },
    { name: "XArm", dims: [0.7, 0.18, 0.18], color: [0.9, 0.15, 0.15], pos: [0.5, 0, 0] },
    { name: "YArm", dims: [0.18, 0.18, 0.7], color: [0.15, 0.8, 0.15], pos: [0, 0, 0.5] },
    { name: "ZArm", dims: [0.18, 0.7, 0.18], color: [0.2, 0.4, 0.95], pos: [0, -0.5, 0] },
];

const YUP = { upAxis: 1, upAxisSign: 1, frontAxis: 2, frontAxisSign: 1, coordAxis: 0, coordAxisSign: 1, unitScaleFactor: 1 };
const ZUP = { upAxis: 2, upAxisSign: 1, frontAxis: 1, frontAxisSign: -1, coordAxis: 0, coordAxisSign: 1, unitScaleFactor: 1 };

export function buildM16Yup() { return gizmoDoc(YUP_PARTS, YUP); }
export function buildM16Zup() { return gizmoDoc(ZUP_PARTS, ZUP); }
export function buildM16Units() { return gizmoDoc(YUP_PARTS, { ...YUP, unitScaleFactor: 2.54 }); }
