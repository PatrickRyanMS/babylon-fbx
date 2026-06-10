// Maya-faithful render: convert each FBX -> glb with the real Autodesk FBX SDK (fbx2gltf),
// then render the glb single-sided in Babylon. Because fbx2gltf reads the FBX exactly as Maya
// does and bakes the result into standard glTF (CCW-front, right-handed), rendering it with
// backface culling shows the SAME front/back faces Maya shows. This is the only reliable way to
// detect reversed winding / inverted normals — the FBX loader compensates with sideOrientation
// and would hide the problem. Output: renders/<name>_maya.png
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { VIEW_CONFIG, DEFAULT_VIEW } from "./viewConfig.mjs";

const require = createRequire("C:/Users/patricr/sourceControl/github/Babylon.js/");
const { chromium } = require("playwright");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "out");
const rendersDir = path.join(__dirname, "renders");
const glbDir = path.join(rendersDir, "_glb");
fs.mkdirSync(glbDir, { recursive: true });

function findExe() {
    const base = path.join(__dirname, "node_modules", "fbx2gltf", "bin");
    const plat = os.platform() === "win32" ? "Windows_NT" : os.platform() === "darwin" ? "Darwin" : "Linux";
    const dir = path.join(base, plat);
    const exe = fs.readdirSync(dir).find((f) => /^FBX2glTF/i.test(f));
    return path.join(dir, exe);
}

const MIME = { ".glb": "model/gltf-binary", ".gltf": "model/gltf+json", ".png": "image/png", ".bin": "application/octet-stream" };

const server = http.createServer((req, res) => {
    const file = path.join(glbDir, decodeURIComponent(req.url.split("?")[0]));
    if (!file.startsWith(glbDir) || !fs.existsSync(file)) {
        res.writeHead(404);
        res.end("not found");
        return;
    }
    res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream", "access-control-allow-origin": "*" });
    fs.createReadStream(file).pipe(res);
});

const CAMERA = VIEW_CONFIG;

async function main() {
    const only = process.argv.slice(2);
    const exe = findExe();
    let manifest = JSON.parse(fs.readFileSync(path.join(outDir, "manifest.json"), "utf8"));
    if (only.length) manifest = manifest.filter((m) => only.some((o) => m.file.includes(o)));

    // Convert each FBX -> glb with the real FBX SDK.
    for (const m of manifest) {
        const src = path.join(outDir, m.file);
        const dst = path.join(glbDir, m.file.replace(/\.fbx$/, "") + ".glb");
        try {
            execFileSync(exe, ["-i", src, "-o", dst], { encoding: "utf8" });
        } catch (e) {
            console.log(`CONVERT ERROR ${m.file}: ${("" + (e.stdout || e.message)).split("\n").slice(-2).join(" ")}`);
        }
    }
    // fbx2gltf extracts embedded textures into <name>.fbm folders during load — remove them.
    for (const d of fs.readdirSync(outDir)) {
        if (d.endsWith(".fbm")) fs.rmSync(path.join(outDir, d), { recursive: true, force: true });
    }

    await new Promise((r) => server.listen(1358, r));

    const browser = await chromium.launch({
        executablePath: "C:/Users/patricr/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe",
        args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
    });
    const page = await browser.newPage({ viewport: { width: 900, height: 650 } });
    page.on("pageerror", (e) => console.log("  [pageerror]", e.message));

    for (const entry of manifest) {
        const glb = entry.file.replace(/\.fbx$/, "") + ".glb";
        if (!fs.existsSync(path.join(glbDir, glb))) {
            console.log(`${entry.file} -> (no glb, skipped)`);
            continue;
        }
        const cam = CAMERA[entry.file] || DEFAULT_VIEW;
        await page.goto("http://localhost:1337/empty.html", { waitUntil: "load" });
        await page.waitForFunction(() => window.BABYLON && window.BABYLON.SceneLoader, { timeout: 20000 });

        const status = await page.evaluate(
            async ({ url, alpha, beta, seek, useFbxCamera }) => {
                const BABYLON = window.BABYLON;
                const canvas = document.getElementById("babylon-canvas");
                const engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
                const scene = new BABYLON.Scene(engine);
                scene.clearColor = new BABYLON.Color4(0.16, 0.16, 0.18, 1);
                try {
                    await BABYLON.SceneLoader.ImportMeshAsync("", "", url, scene, null, ".glb");
                } catch (e) {
                    return "LOAD ERROR: " + e.message;
                }
                if (scene.lights.length === 0) {
                    const hemi = new BABYLON.HemisphericLight("h", new BABYLON.Vector3(0.3, 1, 0.25), scene);
                    hemi.intensity = 0.95;
                    hemi.groundColor = new BABYLON.Color3(0.25, 0.25, 0.3);
                    const dir = new BABYLON.DirectionalLight("d", new BABYLON.Vector3(-0.6, -1, -0.8), scene);
                    dir.intensity = 0.9;
                }
                // Single-sided to expose backfaces, exactly like Maya's Lambert viewport.
                for (const m of scene.materials) {
                    m.backFaceCulling = true;
                    if ("twoSidedLighting" in m) m.twoSidedLighting = false;
                }
                const groups = scene.animationGroups || [];
                for (const g of groups) {
                    g.start(false);
                    g.goToFrame(g.from + (g.to - g.from) * seek);
                    g.pause();
                }
                // Optionally render through the file's own (FBX-authored) camera to validate its
                // aim; otherwise frame with a default ArcRotate camera.
                let usedFbx = false;
                if (useFbxCamera) {
                    const fbxCam = scene.cameras.find((cc) => /persp/i.test(cc.name)) || scene.cameras[0];
                    if (fbxCam) {
                        scene.activeCamera = fbxCam;
                        usedFbx = true;
                    }
                }
                if (!usedFbx) {
                    scene.createDefaultCamera(true, true, false);
                    const c = scene.activeCamera;
                    c.alpha = alpha;
                    c.beta = beta;
                    c.radius = c.radius * 1.15;
                }
                await new Promise((r) => scene.executeWhenReady(() => r()));
                for (let i = 0; i < 90; i++) {
                    scene.render();
                    await new Promise((r) => setTimeout(r, 12));
                }
                const meshes = scene.meshes.filter((m) => m.getTotalVertices && m.getTotalVertices() > 0).length;
                return "OK meshes=" + meshes + (usedFbx ? " (fbx-cam)" : "");
            },
            { url: `http://localhost:1358/${glb}`, alpha: cam.alpha, beta: cam.beta, seek: cam.seek ?? 0.5, useFbxCamera: !!cam.useFbxCamera }
        );

        const png = path.join(rendersDir, entry.file.replace(/\.fbx$/, "") + "_maya.png");
        await page.locator("#babylon-canvas").screenshot({ path: png });
        console.log(`${entry.file} -> ${path.basename(png)}  [${status}]`);
    }

    await browser.close();
    server.close();
    fs.rmSync(glbDir, { recursive: true, force: true });
}

main().catch((e) => {
    console.error(e);
    server.close();
    process.exit(1);
});
