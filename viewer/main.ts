import { Engine } from "@babylonjs/core/Engines/engine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera.js";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Texture } from "@babylonjs/core/Materials/Textures/texture.js";
import type { ISceneLoaderAsyncResult } from "@babylonjs/core/Loading/sceneLoader.js";

// PBR material support (required for GLB/glTF models)
import "@babylonjs/core/Materials/PBR/pbrMaterial.js";

// Shader support for image processing and environment textures
import "@babylonjs/core/Shaders/rgbdDecode.fragment.js";
import "@babylonjs/core/Shaders/postprocess.vertex.js";

// GLTF loader for GLB reference models
import "@babylonjs/loaders/glTF/2.0/index.js";

import { FBXFileLoader } from "../src/fbxFileLoader.js";

// Import model URLs via Vite's ?url transform (works for assets outside root)

// Spider
import spiderFbxUrl from "../tests/models/spider-animated-character/source/Spider_sketchfab.fbx?url";
import spiderTexUrl from "../tests/models/spider-animated-character/textures/Spider.png?url";
import spiderGroundTexUrl from "../tests/models/spider-animated-character/textures/ground_3.png?url";
import spiderGlbUrl from "../tests/models/spider-animated-character/spider_animated_character.glb?url";

// Valkyrie
import valkBinaryUrl from "../tests/models/valkyrie/valkyrie_asset.fbx?url";
import valkAsciiUrl from "../tests/models/valkyrie/valkyrie_asset_ascii.fbx?url";
import valkTextureUrl from "../tests/models/valkyrie/valkyrie_low_baseColor.jpg?url";

// Behemot Cat
import catFbxUrl from "../tests/models/behemot-cat/source/LowPoly_Cat_V04.fbx?url";
import catTexUrl from "../tests/models/behemot-cat/textures/Cat_BC.png?url";
import catOpacityUrl from "../tests/models/behemot-cat/textures/Cat_Opacity.png?url";

// Phoenix Bird
import phoenixFbxUrl from "../tests/models/phoenix-bird/source/fly.fbx?url";
import phoenixDiffAUrl from "../tests/models/phoenix-bird/textures/Tex_Ride_FengHuang_01a_D_A.tga.png?url";
import phoenixEmissAUrl from "../tests/models/phoenix-bird/textures/Tex_Ride_FengHuang_01a_E.tga.png?url";
import phoenixDiffBUrl from "../tests/models/phoenix-bird/textures/Tex_Ride_FengHuang_01b_D_A.tga.png?url";
import phoenixEmissBUrl from "../tests/models/phoenix-bird/textures/Tex_Ride_FengHuang_01b_E.tga.png?url";

// Stylized WW1 Plane
import planeFbxUrl from "../tests/models/stylized-ww1-plane/source/PlaneAnimated with toon.fbx?url";
import planeBlurUrl from "../tests/models/stylized-ww1-plane/textures/blur_effect4.png?url";
import planeRgbUrl from "../tests/models/stylized-ww1-plane/textures/RGB.jpeg?url";

// Hover Bike
import bikeFbxUrl from "../tests/models/hover-bike-the-rocket/source/TheRocketAnimation.fbx?url";
import bikeColorUrl from "../tests/models/hover-bike-the-rocket/textures/Color.png?url";
import bikeEmissiveUrl from "../tests/models/hover-bike-the-rocket/textures/Emissive.png?url";
import bikeNormalUrl from "../tests/models/hover-bike-the-rocket/textures/Normal.png?url";

// Mech Drone
import droneFbxUrl from "../tests/models/mech-drone/source/Drone.FBX?url";
import droneDiffUrl from "../tests/models/mech-drone/textures/Drone_diff.jpeg?url";
import droneEmissiveUrl from "../tests/models/mech-drone/textures/Drone_emissive.jpeg?url";
import droneNormalUrl from "../tests/models/mech-drone/textures/Drone_normal.jpeg?url";

// Jet Car (vertex colors)
import carFbxUrl from "../tests/models/40min-draft-jet-car-vertex-color/Car.fbx?url";

// Gandalf Sax Animated PC Set
import gandalfFbxUrl from "../tests/models/gandalf-sax-animated-pc-set/source/Double_Display_Composition_04.fbx?url";
import gandalfDisplayBaseUrl from "../tests/models/gandalf-sax-animated-pc-set/textures/Double_Display_Base_Color.png?url";
import gandalfDisplayNormalUrl from "../tests/models/gandalf-sax-animated-pc-set/textures/Double_Display_Normal_DirectX.png?url";
import gandalfDisplayMetallicUrl from "../tests/models/gandalf-sax-animated-pc-set/textures/Double_Display_Metallic.png?url";
import gandalfDisplayRoughnessUrl from "../tests/models/gandalf-sax-animated-pc-set/textures/Double_Display_Roughness.png?url";
import gandalfKeyboardBaseUrl from "../tests/models/gandalf-sax-animated-pc-set/textures/Mechan_Keyboard_Base_Color.png?url";
import gandalfKeyboardNormalUrl from "../tests/models/gandalf-sax-animated-pc-set/textures/Mechan_Keyboard_Normal_DirectX.png?url";
import gandalfKeyboardOpacityUrl from "../tests/models/gandalf-sax-animated-pc-set/textures/Mechan_Keyboard_Opacity.png?url";
import gandalfMouseBaseUrl from "../tests/models/gandalf-sax-animated-pc-set/textures/PC_Mouse_BaseColor.png?url";
import gandalfMouseNormalUrl from "../tests/models/gandalf-sax-animated-pc-set/textures/PC_Mouse_Normal.png?url";

// Mannequin (animated, with normal/roughness/specular textures)
import mannequinFbxUrl from "../tests/models/mannequin-anatomy-aid-free-download/source/Mannequin_Animation.FBX?url";
import mannequinDiffuseUrl from "../tests/models/mannequin-anatomy-aid-free-download/textures/Diffuse.jpeg?url";
import mannequinNormalUrl from "../tests/models/mannequin-anatomy-aid-free-download/textures/Normal.jpeg?url";
import mannequinRoughnessUrl from "../tests/models/mannequin-anatomy-aid-free-download/textures/Roughness.jpeg?url";
import mannequinSpecularUrl from "../tests/models/mannequin-anatomy-aid-free-download/textures/Specular.jpeg?url";

// Register the FBX loader
SceneLoader.RegisterPlugin(new FBXFileLoader());

// Model catalog — add new models here
interface ModelEntry {
    name: string;
    url: string;
    /** "fbx" uses our custom loader, "glb" uses Babylon's built-in GLTF loader */
    format: "fbx" | "glb";
    /** Map of texture slot → resolved URL. Slots: "diffuse", "normal", "emissive", etc. */
    textures: { slot: string; url: string; materialName?: string }[];
    /** Name of the animation clip to auto-play on load (defaults to first clip) */
    defaultAnimation?: string;
    /** Force all materials to opaque (fixes z-fighting from erroneous transparency) */
    forceOpaque?: boolean;
}

const models: ModelEntry[] = [
    {
        name: "Spider (FBX, animated)",
        url: spiderFbxUrl,
        format: "fbx",
        defaultAnimation: "Spider_Walk",
        textures: [
            { slot: "diffuse", url: spiderTexUrl, materialName: "Spider_M" },
            { slot: "diffuse", url: spiderGroundTexUrl, materialName: "Camera_lambert2" },
        ],
    },
    {
        name: "Spider (GLB reference)",
        url: spiderGlbUrl,
        format: "glb",
        defaultAnimation: "Spider_Walk",
        textures: [],
    },
    {
        name: "Valkyrie (binary v7.7)",
        url: valkBinaryUrl,
        format: "fbx",
        textures: [{ slot: "diffuse", url: valkTextureUrl }],
    },
    {
        name: "Valkyrie (ASCII v7.7)",
        url: valkAsciiUrl,
        format: "fbx",
        textures: [{ slot: "diffuse", url: valkTextureUrl }],
    },
    {
        name: "Behemot Cat",
        url: catFbxUrl,
        format: "fbx",
        textures: [
            { slot: "diffuse", url: catTexUrl },
            { slot: "opacity", url: catOpacityUrl },
        ],
    },
    {
        name: "Phoenix Bird (animated)",
        url: phoenixFbxUrl,
        format: "fbx",
        forceOpaque: true,
        textures: [
            { slot: "diffuse", url: phoenixDiffAUrl },
            { slot: "emissive", url: phoenixEmissAUrl },
        ],
    },
    {
        name: "WW1 Plane (animated)",
        url: planeFbxUrl,
        format: "fbx",
        textures: [
            { slot: "diffuse", url: planeRgbUrl },
        ],
    },
    {
        name: "Hover Bike (animated)",
        url: bikeFbxUrl,
        format: "fbx",
        textures: [
            { slot: "diffuse", url: bikeColorUrl },
            { slot: "emissive", url: bikeEmissiveUrl },
            { slot: "normal", url: bikeNormalUrl },
        ],
    },
    {
        name: "Mech Drone",
        url: droneFbxUrl,
        format: "fbx",
        textures: [
            { slot: "diffuse", url: droneDiffUrl },
            { slot: "emissive", url: droneEmissiveUrl },
            { slot: "normal", url: droneNormalUrl },
        ],
    },
    {
        name: "Jet Car (vertex colors)",
        url: carFbxUrl,
        format: "fbx",
        textures: [],
    },
    {
        name: "Gandalf Sax PC Set (animated)",
        url: gandalfFbxUrl,
        format: "fbx",
        textures: [
            { slot: "diffuse", url: gandalfDisplayBaseUrl, materialName: "Double_Display" },
            { slot: "normal", url: gandalfDisplayNormalUrl, materialName: "Double_Display" },
            { slot: "diffuse", url: gandalfKeyboardBaseUrl, materialName: "Mechan_Keyboard" },
            { slot: "normal", url: gandalfKeyboardNormalUrl, materialName: "Mechan_Keyboard" },
            { slot: "opacity", url: gandalfKeyboardOpacityUrl, materialName: "Mechan_Keyboard" },
            { slot: "diffuse", url: gandalfMouseBaseUrl, materialName: "PC_Mouse" },
            { slot: "normal", url: gandalfMouseNormalUrl, materialName: "PC_Mouse" },
        ],
    },
    {
        name: "Mannequin (animated)",
        url: mannequinFbxUrl,
        format: "fbx",
        textures: [
            { slot: "diffuse", url: mannequinDiffuseUrl },
            { slot: "normal", url: mannequinNormalUrl },
        ],
    },
];

const status = document.getElementById("status")!;

let engine: Engine;
let scene: Scene;
let camera: ArcRotateCamera;
let currentResult: ISceneLoaderAsyncResult | null = null;

async function main() {
    const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
    engine = new Engine(canvas, true);
    scene = new Scene(engine);
    scene.clearColor = new Color4(0.1, 0.1, 0.12, 1);

    // Camera — slightly above looking down
    camera = new ArcRotateCamera("camera", 5.42, 1.12, 30, Vector3.Zero(), scene);
    camera.attachControl(canvas, true);
    camera.wheelPrecision = 10;

    // Lights
    const light = new HemisphericLight("light", new Vector3(0, 1, 0.5), scene);
    light.intensity = 1.0;
    const fillLight = new HemisphericLight("fillLight", new Vector3(0, -1, -0.5), scene);
    fillLight.intensity = 0.6;

    buildGUI();
    await loadModel(0);

    // Show inspector by default
    await import("@babylonjs/core/Debug/debugLayer.js");
    await import("@babylonjs/inspector");
    scene.debugLayer.show({ embedMode: true });

    engine.runRenderLoop(() => scene.render());
    window.addEventListener("resize", () => engine.resize());

    // Expose for debugging/testing
    (window as any).__scene = scene;
}

function buildGUI() {
    const gui = document.getElementById("gui")!;
    gui.innerHTML = "";

    // Dropdown — auto-load on selection change
    const select = document.createElement("select");
    select.id = "modelSelect";
    for (let i = 0; i < models.length; i++) {
        const opt = document.createElement("option");
        opt.value = String(i);
        opt.textContent = models[i].name;
        select.appendChild(opt);
    }
    select.addEventListener("change", () => {
        const idx = parseInt(select.value);
        loadModel(idx);
    });
    gui.appendChild(select);

    // Inspector toggle
    const inspBtn = document.createElement("button");
    inspBtn.textContent = "Inspector";
    inspBtn.addEventListener("click", async () => {
        await import("@babylonjs/core/Debug/debugLayer.js");
        await import("@babylonjs/inspector");
        if (scene.debugLayer.isVisible()) {
            scene.debugLayer.hide();
        } else {
            scene.debugLayer.show({ embedMode: true });
        }
    });
    gui.appendChild(inspBtn);

    // Animation controls (populated after model load)
    const animSeparator = document.createElement("span");
    animSeparator.textContent = " | ";
    animSeparator.style.color = "#666";
    animSeparator.id = "animSeparator";
    animSeparator.style.display = "none";
    gui.appendChild(animSeparator);

    const animSelect = document.createElement("select");
    animSelect.id = "animSelect";
    animSelect.style.display = "none";
    animSelect.addEventListener("change", () => {
        playAnimation(parseInt(animSelect.value));
    });
    gui.appendChild(animSelect);

    const animBtn = document.createElement("button");
    animBtn.id = "animBtn";
    animBtn.textContent = "Stop";
    animBtn.style.display = "none";
    animBtn.addEventListener("click", () => {
        toggleAnimation();
    });
    gui.appendChild(animBtn);
}

function disposeCurrentModel() {
    if (!currentResult) return;

    for (const ag of currentResult.animationGroups) ag.dispose();
    for (const sk of currentResult.skeletons) sk.dispose();
    for (const m of currentResult.meshes) m.dispose();
    for (const tn of currentResult.transformNodes) tn.dispose();

    // Dispose all materials and their textures
    const materialsToDispose = [...scene.materials];
    for (const mat of materialsToDispose) {
        if (mat instanceof StandardMaterial) {
            mat.diffuseTexture?.dispose();
            mat.bumpTexture?.dispose();
            mat.emissiveTexture?.dispose();
            mat.ambientTexture?.dispose();
            mat.specularTexture?.dispose();
            mat.opacityTexture?.dispose();
        }
        mat.dispose(true, true);
    }

    // Dispose any remaining textures (from GLB/PBR materials)
    const texturesToDispose = [...scene.textures];
    for (const tex of texturesToDispose) {
        tex.dispose();
    }

    currentResult = null;
}

async function loadModel(index: number) {
    const model = models[index];
    status.textContent = `Loading ${model.name}...`;

    disposeCurrentModel();

    try {
        if (model.format === "glb") {
            // Use Babylon's built-in GLTF/GLB loader
            currentResult = await SceneLoader.ImportMeshAsync(
                "",
                "",
                model.url,
                scene
            );

            // Trim dead leading/trailing frames from GLB animations
            // (this asset has extra frames that cause a pause before looping)
            trimAnimationGroups(currentResult.animationGroups);
        } else {
            // Use our custom FBX loader
            const response = await fetch(model.url);
            const arrayBuffer = await response.arrayBuffer();

            const rootUrl = model.url.substring(0, model.url.lastIndexOf("/") + 1);

            const loader = new FBXFileLoader();
            currentResult = await loader.importMeshAsync(
                null,
                scene,
                arrayBuffer,
                rootUrl
            );

            // Replace textures with known Vite-resolved URLs
            for (const mat of scene.materials) {
                if (mat instanceof StandardMaterial) {
                    applyTextures(mat, model.textures);
                }
            }

            // Force opaque materials for models with z-fighting issues
            if (model.forceOpaque) {
                for (const mat of scene.materials) {
                    if (mat instanceof StandardMaterial) {
                        mat.transparencyMode = 0; // OPAQUE
                        mat.alpha = 1;
                        mat.opacityTexture = null;
                    }
                }
            }
        }

        // Auto-frame camera — position above looking down at the model
        const worldExtends = scene.getWorldExtends();
        const center = worldExtends.min.add(worldExtends.max).scale(0.5);
        const size = worldExtends.max.subtract(worldExtends.min).length();
        camera.target = center;
        camera.radius = size * 1.2;
        camera.alpha = 2.105;   // ~120° azimuth
        camera.beta = 1.080;    // ~62° elevation (above horizon)

        const meshCount = currentResult.meshes.length;
        const skelCount = currentResult.skeletons.length;
        const animCount = currentResult.animationGroups.length;

        let statusText = `Loaded: ${meshCount} mesh(es)`;
        if (skelCount > 0) statusText += `, ${skelCount} skeleton(s)`;
        if (animCount > 0) statusText += `, ${animCount} animation(s)`;
        statusText += ". Use mouse to orbit.";
        status.textContent = statusText;

        // Update animation UI
        updateAnimationUI(currentResult.animationGroups.length > 0
            ? currentResult.animationGroups
            : [], model.defaultAnimation);
    } catch (err: any) {
        status.textContent = `Error: ${err.message}`;
        console.error(err);
    }
}

/**
 * Apply known textures to a material by slot (and optionally material name).
 */
function applyTextures(
    mat: StandardMaterial,
    textures: { slot: string; url: string; materialName?: string }[]
) {
    for (const tex of textures) {
        // If materialName is specified, only apply to matching material
        if (tex.materialName && mat.name !== tex.materialName) continue;

        switch (tex.slot) {
            case "diffuse":
                mat.diffuseTexture?.dispose();
                mat.diffuseTexture = new Texture(tex.url, scene);
                // Ensure texture shows at full brightness
                mat.diffuseColor = new Color3(1, 1, 1);
                break;
            case "normal":
                mat.bumpTexture?.dispose();
                mat.bumpTexture = new Texture(tex.url, scene);
                break;
            case "emissive":
                mat.emissiveTexture?.dispose();
                mat.emissiveTexture = new Texture(tex.url, scene);
                break;
            case "opacity":
                mat.opacityTexture?.dispose();
                mat.opacityTexture = new Texture(tex.url, scene);
                break;
        }
    }
}

// ── Animation Controls ─────────────────────────────────────────────────────────

import { AnimationGroup } from "@babylonjs/core/Animations/animationGroup.js";

/**
 * Trim dead frames from animation groups. Rebases all animation keys so the
 * minimum non-rest frame becomes frame 0, removing leading/trailing pauses.
 * This is specific to the spider asset which has extra frames from the author.
 */
function trimAnimationGroups(groups: AnimationGroup[]) {
    for (const group of groups) {
        // Find the actual from/to range across all targeted animations
        let minFrame = Infinity;
        let maxFrame = -Infinity;

        for (const anim of group.targetedAnimations) {
            const keys = anim.animation.getKeys();
            if (keys.length < 2) continue;

            // Find first frame that differs from the initial value
            let firstActive = keys[0].frame;
            let lastActive = keys[keys.length - 1].frame;

            // Use the actual keyframe range (skip if only 1 key)
            if (firstActive < minFrame) minFrame = firstActive;
            if (lastActive > maxFrame) maxFrame = lastActive;
        }

        if (minFrame === Infinity || minFrame === 0) continue;

        // Rebase all keys by subtracting minFrame
        for (const anim of group.targetedAnimations) {
            const keys = anim.animation.getKeys();
            const rebasedKeys = keys
                .filter(k => k.frame >= minFrame && k.frame <= maxFrame)
                .map(k => ({ ...k, frame: k.frame - minFrame }));
            anim.animation.setKeys(rebasedKeys);
        }

        // Update group range
        group.normalize(0, maxFrame - minFrame);
    }
}

let activeAnimations: AnimationGroup[] = [];
let currentAnimIndex = 0;
let isPlaying = false;

function updateAnimationUI(groups: AnimationGroup[], defaultAnimName?: string) {
    const animSelect = document.getElementById("animSelect") as HTMLSelectElement;
    const animBtn = document.getElementById("animBtn") as HTMLButtonElement;
    const animSeparator = document.getElementById("animSeparator") as HTMLSpanElement;

    activeAnimations = groups;
    currentAnimIndex = 0;
    isPlaying = false;

    if (groups.length === 0) {
        animSelect.style.display = "none";
        animBtn.style.display = "none";
        animSeparator.style.display = "none";
        return;
    }

    // Populate dropdown
    animSelect.innerHTML = "";
    for (let i = 0; i < groups.length; i++) {
        const opt = document.createElement("option");
        opt.value = String(i);
        opt.textContent = groups[i].name;
        animSelect.appendChild(opt);
    }

    animSelect.style.display = "";
    animBtn.style.display = "";
    animSeparator.style.display = "";

    // Find default animation by name, fall back to first
    let defaultIndex = 0;
    if (defaultAnimName) {
        const idx = groups.findIndex(g => g.name === defaultAnimName);
        if (idx >= 0) defaultIndex = idx;
    }
    animSelect.value = String(defaultIndex);

    // Auto-play default animation
    playAnimation(defaultIndex);
}

function playAnimation(index: number) {
    // Stop all current animations
    for (const ag of activeAnimations) {
        ag.stop();
    }

    currentAnimIndex = index;
    const animSelect = document.getElementById("animSelect") as HTMLSelectElement;
    animSelect.value = String(index);

    activeAnimations[index].start(true);
    isPlaying = true;

    const animBtn = document.getElementById("animBtn") as HTMLButtonElement;
    animBtn.textContent = "Stop";
}

function toggleAnimation() {
    const animBtn = document.getElementById("animBtn") as HTMLButtonElement;

    if (isPlaying) {
        activeAnimations[currentAnimIndex].stop();
        isPlaying = false;
        animBtn.textContent = "Play";
    } else {
        activeAnimations[currentAnimIndex].start(true);
        isPlaying = true;
        animBtn.textContent = "Stop";
    }
}

main().catch((err) => {
    status.textContent = `Error: ${err.message}`;
    console.error(err);
});
