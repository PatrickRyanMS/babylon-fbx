// Render generated FBX models to PNGs via the running babylon-server (window.BABYLON).
// Serves ./out so external sidecar textures resolve, loads each model, frames, screenshots.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { VIEW_CONFIG, DEFAULT_VIEW } from "./viewConfig.mjs";

const require = createRequire("C:/Users/patricr/sourceControl/github/Babylon.js/");
const { chromium } = require("playwright");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "out");
const rendersDir = path.join(__dirname, "renders");
fs.mkdirSync(rendersDir, { recursive: true });

const MIME = { ".fbx": "application/octet-stream", ".png": "image/png", ".json": "application/json" };

const server = http.createServer((req, res) => {
    const file = path.join(outDir, decodeURIComponent(req.url.split("?")[0]));
    if (!file.startsWith(outDir) || !fs.existsSync(file)) {
        res.writeHead(404);
        res.end("not found");
        return;
    }
    res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream", "access-control-allow-origin": "*" });
    fs.createReadStream(file).pipe(res);
});

const CAMERA = VIEW_CONFIG;

async function main() {
    await new Promise((r) => server.listen(1357, r));
    const manifest = JSON.parse(fs.readFileSync(path.join(outDir, "manifest.json"), "utf8"));

    const browser = await chromium.launch({
        executablePath: "C:/Users/patricr/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe",
        args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
    });
    const page = await browser.newPage({ viewport: { width: 900, height: 650 } });
    page.on("console", (m) => console.log("  [page]", m.text()));
    page.on("pageerror", (e) => console.log("  [pageerror]", e.message));

    for (const entry of manifest) {
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
                    await BABYLON.SceneLoader.ImportMeshAsync("", "", url, scene, null, ".fbx");
                } catch (e) {
                    return "LOAD ERROR: " + e.message;
                }
                // Use FBX-authored lights when present (e.g. the camera/light model); otherwise add
                // a neutral harness rig so geometry is visible.
                if (scene.lights.length === 0) {
                    const hemi = new BABYLON.HemisphericLight("h", new BABYLON.Vector3(0.3, 1, 0.25), scene);
                    hemi.intensity = 0.85;
                    hemi.groundColor = new BABYLON.Color3(0.25, 0.25, 0.3);
                    const dir = new BABYLON.DirectionalLight("d", new BABYLON.Vector3(-0.6, -1, -0.8), scene);
                    dir.intensity = 0.9;
                }

                // Render single-sided (backface culling on) to match Maya's viewport, so reversed
                // winding / inverted normals are revealed instead of hidden by double-sided drawing.
                for (const m of scene.materials) {
                    m.backFaceCulling = true;
                }

                // Pin animated models to a deterministic mid-clip frame.
                const groups = scene.animationGroups || [];
                for (const g of groups) {
                    g.start(false);
                    g.goToFrame(g.from + (g.to - g.from) * seek);
                    g.pause();
                }

                let usedFbx = false;
                if (useFbxCamera && scene.cameras.length) {
                    const fbxCam = scene.cameras.find((cc) => /persp/i.test(cc.name)) || scene.cameras[0];
                    if (fbxCam) { scene.activeCamera = fbxCam; usedFbx = true; }
                }
                if (!usedFbx) {
                    scene.createDefaultCamera(true, true, false);
                    const cam = scene.activeCamera;
                    cam.alpha = alpha;
                    cam.beta = beta;
                    cam.radius = cam.radius * 1.15;
                }

                await new Promise((r) => scene.executeWhenReady(() => r()));
                for (let i = 0; i < 90; i++) {
                    scene.render();
                    await new Promise((r) => setTimeout(r, 12));
                }
                const meshes = scene.meshes.filter((m) => m.getTotalVertices && m.getTotalVertices() > 0).length;
                return "OK meshes=" + meshes + (usedFbx ? " (fbx-cam)" : "");
            },
            { url: `http://localhost:1357/${entry.file}`, alpha: cam.alpha, beta: cam.beta, seek: cam.seek ?? 0.5, useFbxCamera: !!cam.useFbxCamera }
        );

        const png = path.join(rendersDir, entry.file.replace(/\.fbx$/, "") + ".png");
        await page.locator("#babylon-canvas").screenshot({ path: png });
        console.log(`${entry.file} -> ${path.basename(png)}  [${status}]`);
    }

    await browser.close();
    server.close();
}

main().catch((e) => {
    console.error(e);
    server.close();
    process.exit(1);
});
