// Generate the first-wave FBX visual-test models into ./out and write a manifest.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeBinaryFBX } from "./lib/fbxBinary.mjs";
import { writeAsciiFBX } from "./lib/fbxAscii.mjs";
import { buildM01 } from "./models/m01.mjs";
import { buildM02 } from "./models/m02.mjs";
import { buildM03 } from "./models/m03.mjs";
import { buildM04 } from "./models/m04.mjs";
import { buildM05 } from "./models/m05.mjs";
import { buildM06 } from "./models/m06.mjs";
import { buildM07 } from "./models/m07.mjs";
import { buildM08 } from "./models/m08.mjs";
import { buildM09 } from "./models/m09.mjs";
import { buildM10 } from "./models/m10.mjs";
import { buildM11 } from "./models/m11.mjs";
import { buildM12 } from "./models/m12.mjs";
import { buildM13 } from "./models/m13.mjs";
import { buildM14 } from "./models/m14.mjs";
import { buildM15 } from "./models/m15.mjs";
import { buildM16Yup, buildM16Zup, buildM16Units } from "./models/m16.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "out");
fs.mkdirSync(outDir, { recursive: true });

// Each entry: { file, format: "binary"|"ascii", build }
const TARGETS = [
    { file: "m01_cube_phong.fbx", format: "binary", build: buildM01 },
    { file: "m02_geo_ngons.fbx", format: "binary", build: buildM02 },
    { file: "m03_normals.fbx", format: "binary", build: buildM03 },
    { file: "m04_material_properties.fbx", format: "binary", build: buildM04 },
    { file: "m05_textures.fbx", format: "binary", build: buildM05 },
    { file: "m06_uv_transform.fbx", format: "binary", build: buildM06 },
    { file: "m07_multimaterial.fbx", format: "binary", build: buildM07 },
    { file: "m08_transforms.fbx", format: "binary", build: buildM08 },
    { file: "m09_skinning.fbx", format: "binary", build: buildM09 },
    { file: "m10_morph.fbx", format: "binary", build: buildM10 },
    { file: "m11_node_anim.fbx", format: "binary", build: buildM11 },
    { file: "m12_skeletal_anim.fbx", format: "binary", build: buildM12 },
    { file: "m13_morph_anim.fbx", format: "binary", build: buildM13 },
    { file: "m14_multiclip.fbx", format: "binary", build: buildM14 },
    { file: "m15_camera_lights.fbx", format: "binary", build: buildM15 },
    { file: "m16_axis_yup.fbx", format: "binary", build: buildM16Yup },
    { file: "m16_axis_zup.fbx", format: "binary", build: buildM16Zup },
    { file: "m16_units_254.fbx", format: "binary", build: buildM16Units },
];

const manifest = [];
for (const t of TARGETS) {
    const { nodes, version, sidecars } = t.build();
    const bytes = t.format === "binary" ? writeBinaryFBX(nodes, version) : Buffer.from(writeAsciiFBX(nodes, version), "utf8");
    const outPath = path.join(outDir, t.file);
    fs.writeFileSync(outPath, bytes);
    manifest.push({ file: t.file, format: t.format, version, bytes: bytes.length });
    console.log(`wrote ${t.file} (${t.format}, v${version}, ${bytes.length} bytes)`);

    // Emit any sidecar files (external textures).
    for (const s of sidecars || []) {
        fs.writeFileSync(path.join(outDir, s.name), s.bytes);
        console.log(`  sidecar ${s.name} (${s.bytes.length} bytes)`);
    }
}

fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`\nmanifest: ${manifest.length} model(s)`);
