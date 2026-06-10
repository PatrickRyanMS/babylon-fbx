// Validate generated FBX files with the real Autodesk FBX SDK (via fbx2gltf) — a Maya proxy.
// Reports vertices/triangles/nodes/surfaces; a file that loads with geometry will open in Maya.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "out");

function findExe() {
    const base = path.join(__dirname, "node_modules", "fbx2gltf", "bin");
    const plat = os.platform() === "win32" ? "Windows_NT" : os.platform() === "darwin" ? "Darwin" : "Linux";
    const dir = path.join(base, plat);
    const exe = fs.readdirSync(dir).find((f) => /^FBX2glTF/i.test(f));
    return path.join(dir, exe);
}

const exe = findExe();
const manifest = JSON.parse(fs.readFileSync(path.join(outDir, "manifest.json"), "utf8"));
let failures = 0;

for (const m of manifest) {
    const src = path.join(outDir, m.file);
    const dst = path.join(outDir, "_validate_" + m.file.replace(/\.fbx$/, "") + ".glb");
    try {
        const log = execFileSync(exe, ["-i", src, "-o", dst, "--verbose"], { encoding: "utf8" });
        const g = (re) => (log.match(re) || [])[1] || "0";
        const verts = g(/(\d+) vertices/);
        const tris = g(/(\d+) triangles/);
        const nodes = g(/(\d+) nodes/);
        const surfaces = g(/(\d+) surfaces/);
        const ok = Number(verts) > 0 && Number(nodes) > 1;
        if (!ok) failures++;
        console.log(`${ok ? "PASS" : "FAIL"}  ${m.file}  verts=${verts} tris=${tris} nodes=${nodes} surfaces=${surfaces}`);
        fs.rmSync(dst, { force: true });
    } catch (e) {
        failures++;
        console.log(`ERROR ${m.file}: ${("" + (e.stdout || e.message)).split("\n").slice(-2).join(" ")}`);
    }
}

console.log(`\n${manifest.length - failures}/${manifest.length} models load in the FBX SDK.`);

// The FBX SDK extracts embedded textures into <name>.fbm folders during load — remove them.
for (const d of fs.readdirSync(outDir)) {
    if (d.endsWith(".fbm")) fs.rmSync(path.join(outDir, d), { recursive: true, force: true });
}

process.exit(failures ? 1 : 0);
