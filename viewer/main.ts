import { Engine } from "@babylonjs/core/Engines/engine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera.js";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight.js";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader.js";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial.js";
import { CubeTexture } from "@babylonjs/core/Materials/Textures/cubeTexture.js";
import { Texture } from "@babylonjs/core/Materials/Textures/texture.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import "@babylonjs/core/Materials/Textures/Loaders/envTextureLoader.js";
import type { ISceneLoaderAsyncResult } from "@babylonjs/core/Loading/sceneLoader.js";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture.js";

// PBR material support (required for GLB/glTF models)
import "@babylonjs/core/Materials/PBR/pbrMaterial.js";

// Shader support for image processing and environment textures
import "@babylonjs/core/Shaders/rgbdDecode.fragment.js";
import "@babylonjs/core/Shaders/postprocess.vertex.js";

// GLTF loader for GLB reference models
import "@babylonjs/loaders/glTF/2.0/index.js";

import { FBXFileLoader } from "../src/fbxFileLoader.js";
import studioEnvironmentUrl from "./studio.env?url";

// Import test assets via Vite's ?url transform (works for assets outside root).
const assetUrls = import.meta.glob<string>(
    "../tests/models/**/*.{fbx,FBX,glb,GLB,png,PNG,jpg,JPG,jpeg,JPEG,webp,WEBP}",
    { eager: true, query: "?url", import: "default" }
);

function assetUrl(relativePath: string): string {
    const url = assetUrls[`../tests/models/${relativePath}`];
    if (!url) {
        throw new Error(`Missing viewer asset: ${relativePath}`);
    }
    return url;
}

// Register the FBX loader
SceneLoader.RegisterPlugin(new FBXFileLoader());

interface ViewerPBRMaterialOverride {
    materialName: string;
    albedoTextureHasAlpha?: boolean;
    useAlphaFromAlbedoTexture?: boolean;
    useAdditiveAlpha?: boolean;
    transparencyMode?: "opaque" | "alphaTest" | "alphaBlend";
    metallic?: number;
    roughness?: number;
    alpha?: number;
    alphaCutOff?: number;
    clearOpacityTexture?: boolean;
    backFaceCulling?: boolean;
    forceIrradianceInFragment?: boolean;
    invertNormalMapX?: boolean;
    invertNormalMapY?: boolean;
    clearCoat?: ViewerPBRClearCoatOverride;
    subSurface?: ViewerPBRSubSurfaceOverride;
}

interface ViewerPBRClearCoatOverride {
    isEnabled?: boolean;
    intensity?: number;
    roughness?: number;
    texturePath?: string;
    textureRoughnessPath?: string;
    bumpTexturePath?: string;
    bumpTextureLevel?: number;
    bumpTextureScale?: number;
}

interface ViewerPBRSubSurfaceOverride {
    isRefractionEnabled?: boolean;
    refractionIntensity?: number;
    useAlbedoToTintRefraction?: boolean;
}

interface ViewerPBRMaterialTextureAlias {
    materialName: string;
    textureMaterialKey: string;
}

interface ViewerLineArtAlbedoOverride {
    materialName: string;
    siblingAlbedoTexture: string;
    albedoTexturePath: string;
}

interface ViewerTextureOverride {
    slot: string;
    url: string;
    materialName?: string;
    coordinatesIndex?: number;
    useAlphaFromRGB?: boolean;
    addressMode?: "clamp";
}

interface ViewerTextureOverrideSource {
    slot: string;
    path: string;
    materialName?: string;
    coordinatesIndex?: number;
    useAlphaFromRGB?: boolean;
    addressMode?: "clamp";
}

interface ViewerTexturePreload {
    path: string;
    url: string;
}

interface ViewerModelOverride {
    name?: string;
    textures?: ViewerTextureOverrideSource[];
    preloadTextures?: string[];
    pbrMaterialOverrides?: ViewerPBRMaterialOverride[];
    pbrMaterialTextureAliases?: ViewerPBRMaterialTextureAlias[];
    lineArtAlbedoOverrides?: ViewerLineArtAlbedoOverride[];
    defaultAnimation?: string;
    disableVertexColors?: boolean;
    forceOpaque?: boolean;
    viewerRotationYDegrees?: number;
}

interface ModelEntry {
    name: string;
    path: string;
    url: string;
    /** "fbx" uses our custom loader, "glb" uses Babylon's built-in GLTF loader */
    format: "fbx" | "glb";
    /** Legacy manual texture overrides; FBX models now use the viewer-only PBR manifest path. */
    textures: ViewerTextureOverride[];
    preloadTextures: ViewerTexturePreload[];
    /** Viewer-only PBR material fixes for assets that need manual flags beyond texture inference. */
    pbrMaterialOverrides?: ViewerPBRMaterialOverride[];
    pbrMaterialTextureAliases?: ViewerPBRMaterialTextureAlias[];
    lineArtAlbedoOverrides?: ViewerLineArtAlbedoOverride[];
    /** Name of the animation clip to auto-play on load (defaults to first clip) */
    defaultAnimation?: string;
    /** Viewer-only switch to ignore imported vertex color data for assets where textures should drive color. */
    disableVertexColors?: boolean;
    /** Force all materials to opaque (fixes z-fighting from erroneous transparency) */
    forceOpaque?: boolean;
    /** Viewer-only root yaw adjustment, in degrees. */
    viewerRotationYDegrees?: number;
}

const DEFAULT_MODEL_PATH = "spider-animated-character/Spider_sketchfab.fbx";
const MODEL_QUERY_PARAM = "model";

const modelOverrides: Record<string, ViewerModelOverride> = {
    "spider-animated-character/Spider_sketchfab.fbx": {
        name: "Spider (FBX, animated)",
        defaultAnimation: "Spider_Walk",
        textures: [
            { slot: "diffuse", path: "spider-animated-character/Spider.png", materialName: "Spider_M" },
            { slot: "diffuse", path: "spider-animated-character/ground_3.png", materialName: "Camera_lambert2" },
        ],
    },
    "spider-animated-character/spider_animated_character.glb": {
        name: "Spider (GLB reference)",
        defaultAnimation: "Spider_Walk",
    },
    "anime-chibi-girl-aisha-by-seraphim/test2.fbx": {
        name: "Aisha (FBX, animated)",
        defaultAnimation: "Take 001",
    },
    "anime-chibi-girl-aisha-by-seraphim/anime_chibi_girl__aisha_by_seraphim.glb": {
        name: "Aisha (GLB reference)",
        defaultAnimation: "Take 001",
    },
    "bristleback-dota-fan-art/POSE.fbx": {
        name: "Bristleback (FBX, animated)",
        defaultAnimation: "animtion_bristleback_base",
    },
    "bristleback-dota-fan-art/bristleback_dota_fan-art.glb": {
        name: "Bristleback (GLB reference)",
        defaultAnimation: "animtion_bristleback_base",
    },
    "valkyrie/valkyrie_asset.fbx": {
        name: "Valkyrie (binary v7.7)",
        textures: [{ slot: "diffuse", path: "valkyrie/valkyrie_low_baseColor.jpg" }],
    },
    "valkyrie/valkyrie_asset_ascii.fbx": {
        name: "Valkyrie (ASCII v7.7)",
        textures: [{ slot: "diffuse", path: "valkyrie/valkyrie_low_baseColor.jpg" }],
    },
    "behemot-cat/LowPoly_Cat_V04.fbx": {
        name: "Behemot Cat",
        textures: [
            { slot: "diffuse", path: "behemot-cat/Cat_BC.png" },
        ],
        preloadTextures: ["behemot-cat/Cat_Opacity.png"],
        pbrMaterialOverrides: [
            { materialName: "Cat_Material", clearOpacityTexture: true, transparencyMode: "opaque", backFaceCulling: true },
        ],
        viewerRotationYDegrees: -30,
    },
    "tamagotchi-pet-sailor-moon/lp_01.fbx": {
        name: "Tamagotchi Pet Sailor Moon",
        viewerRotationYDegrees: 120,
    },
    "phoenix-bird/fly.fbx": {
        name: "Phoenix Bird (FBX, animated)",
        forceOpaque: true,
        defaultAnimation: "Take 001",
        textures: [
            { slot: "diffuse", path: "phoenix-bird/Tex_Ride_FengHuang_01a_D_A.tga.png" },
            { slot: "emissive", path: "phoenix-bird/Tex_Ride_FengHuang_01a_E.tga.png" },
        ],
    },
    "phoenix-bird/phoenix_bird.glb": {
        name: "Phoenix Bird (GLB reference)",
        defaultAnimation: "Take 001",
    },
    "stylized-ww1-plane/PlaneAnimated with toon.fbx": {
        name: "WW1 Plane (animated)",
        textures: [
            { slot: "diffuse", path: "stylized-ww1-plane/RGB.jpeg" },
        ],
        pbrMaterialOverrides: [
            {
                materialName: "Blur_effect",
                albedoTextureHasAlpha: true,
                useAlphaFromAlbedoTexture: true,
            },
        ],
    },
    "stylized-mushrooms/mushroms_2.fbx": {
        name: "Stylized Mushrooms",
        textures: [
            { slot: "diffuse", path: "stylized-mushrooms/mushroms_Base_color_1001.png", materialName: "mushroms" },
            { slot: "emissive", path: "stylized-mushrooms/mushroms_Emissive_1001.png", materialName: "mushroms" },
            { slot: "diffuse", path: "stylized-mushrooms/mushroms_Base_color_1002.png", materialName: "ground" },
            { slot: "emissive", path: "stylized-mushrooms/mushroms_Emissive_1002.png", materialName: "ground" },
            { slot: "opacity", path: "stylized-mushrooms/mushroms_Opacity_1002.png", materialName: "ground", useAlphaFromRGB: true },
        ],
        pbrMaterialOverrides: [
            {
                materialName: "ground",
                transparencyMode: "alphaTest",
            },
        ],
    },
    "stylized-mangrove-greenhouse/Mangrove Greenhouse.fbx": {
        name: "Stylized Mangrove Greenhouse",
        textures: [
            { slot: "diffuse", path: "stylized-mangrove-greenhouse/Texture1_albedo.png", materialName: "TT_checker_1" },
            { slot: "diffuse", path: "stylized-mangrove-greenhouse/Texture2_albedo.png", materialName: "TT_checker_2" },
            { slot: "diffuse", path: "stylized-mangrove-greenhouse/Texture3_albedo.png", materialName: "TT_checker_3" },
            { slot: "diffuse", path: "stylized-mangrove-greenhouse/Texture4_albedo.png", materialName: "TT_checker_4" },
            { slot: "diffuse", path: "stylized-mangrove-greenhouse/Glass_albedo.png", materialName: "Glass" },
            { slot: "opacity", path: "stylized-mangrove-greenhouse/Glass_opacity.png", materialName: "Glass", useAlphaFromRGB: true },
            { slot: "diffuse", path: "stylized-mangrove-greenhouse/Glow_albedo.png", materialName: "Glow" },
            { slot: "emissive", path: "stylized-mangrove-greenhouse/Glow_albedo.png", materialName: "Glow" },
            { slot: "opacity", path: "stylized-mangrove-greenhouse/Glow_opacity.png", materialName: "Glow", useAlphaFromRGB: true },
            { slot: "diffuse", path: "stylized-mangrove-greenhouse/Grass_albedo.png", materialName: "Grass" },
            { slot: "diffuse", path: "stylized-mangrove-greenhouse/Leaves_albedo.png", materialName: "Leaves 1" },
            { slot: "diffuse", path: "stylized-mangrove-greenhouse/Leaves2_albedo.png", materialName: "Leaves 2" },
            { slot: "diffuse", path: "stylized-mangrove-greenhouse/Leaves3_albedo.png", materialName: "Leaves 3" },
            { slot: "diffuse", path: "stylized-mangrove-greenhouse/Leaves4_albedo.png", materialName: "Leaves 4" },
            { slot: "diffuse", path: "stylized-mangrove-greenhouse/Leaves Drop_albedo.png", materialName: "Leaves  drop" },
            { slot: "diffuse", path: "stylized-mangrove-greenhouse/Leave_flower_albedo.png", materialName: "Material.003" },
            { slot: "diffuse", path: "stylized-mangrove-greenhouse/Leave_palm_albedo.png", materialName: "Material.004" },
            { slot: "diffuse", path: "stylized-mangrove-greenhouse/Leave_palm_albedo.png", materialName: "Material.028" },
        ],
        pbrMaterialOverrides: [
            { materialName: "Glass", transparencyMode: "alphaBlend" },
            { materialName: "Glow", useAdditiveAlpha: true },
            { materialName: "Grass", albedoTextureHasAlpha: true, useAlphaFromAlbedoTexture: true, transparencyMode: "alphaTest" },
            { materialName: "Leaves 1", albedoTextureHasAlpha: true, useAlphaFromAlbedoTexture: true, transparencyMode: "alphaTest" },
            { materialName: "Leaves 2", albedoTextureHasAlpha: true, useAlphaFromAlbedoTexture: true, transparencyMode: "alphaTest" },
            { materialName: "Leaves 3", albedoTextureHasAlpha: true, useAlphaFromAlbedoTexture: true, transparencyMode: "alphaTest" },
            { materialName: "Leaves 4", albedoTextureHasAlpha: true, useAlphaFromAlbedoTexture: true, transparencyMode: "alphaTest" },
            { materialName: "Leaves  drop", albedoTextureHasAlpha: true, useAlphaFromAlbedoTexture: true, transparencyMode: "alphaTest" },
        ],
        lineArtAlbedoOverrides: [
            {
                materialName: "Line art Green _VertexColor",
                siblingAlbedoTexture: "Texture2_albedo.png",
                albedoTexturePath: "stylized-mangrove-greenhouse/Texture3_albedo.png",
            },
            {
                materialName: "Line art",
                siblingAlbedoTexture: "Texture3_albedo.png",
                albedoTexturePath: "stylized-mangrove-greenhouse/Texture2_albedo.png",
            },
        ],
    },
    "hover-bike-the-rocket/TheRocketAnimation.fbx": {
        name: "Hover Bike (animated)",
        textures: [
            { slot: "diffuse", path: "hover-bike-the-rocket/Color.png" },
            { slot: "emissive", path: "hover-bike-the-rocket/Emissive.png" },
            { slot: "normal", path: "hover-bike-the-rocket/Normal.png" },
        ],
    },
    "mech-drone/Drone.FBX": {
        name: "Mech Drone",
        textures: [
            { slot: "diffuse", path: "mech-drone/Drone_diff.jpg", materialName: "Robot" },
            { slot: "emissive", path: "mech-drone/Drone_emissive.jpg", materialName: "Robot" },
            { slot: "normal", path: "mech-drone/Drone_normal.jpg", materialName: "Robot" },
        ],
        pbrMaterialOverrides: [
            {
                materialName: "Fire",
                useAdditiveAlpha: true,
            },
        ],
        viewerRotationYDegrees: 180,
    },
    "vino/SM_Vino.fbx": {
        name: "Vino",
        disableVertexColors: true,
        textures: [
            { slot: "diffuse", path: "vino/Main Body_Pattern_D.jpg", materialName: "Main Body" },
            { slot: "normal", path: "vino/Main Body_Pattern_N.jpg", materialName: "Main Body" },
            { slot: "ambientOcclusion", path: "vino/MainParts_AO.png", materialName: "Main Body" },
            { slot: "roughness", path: "vino/Main Body_Pattern_R.jpg", materialName: "Main Body" },
            { slot: "metallic", path: "vino/Main Body_Pattern_M.jpg", materialName: "Main Body" },

            { slot: "diffuse", path: "vino/SmlParts_D.jpg", materialName: "SmallParts" },
            { slot: "normal", path: "vino/SmlParts_N.jpg", materialName: "SmallParts" },
            { slot: "ambientOcclusion", path: "vino/SmlParts_AO.jpeg", materialName: "SmallParts" },
            { slot: "roughness", path: "vino/SmlParts_R.jpg", materialName: "SmallParts" },
            { slot: "metallic", path: "vino/SmlParts_M.jpg", materialName: "SmallParts" },

            { slot: "diffuse", path: "vino/Lamp&Glass_D.jpg", materialName: "Lamp & Glass" },
            { slot: "normal", path: "vino/Lamp&Glass_N.jpg", materialName: "Lamp & Glass" },
            { slot: "roughness", path: "vino/Lamp&Glass_R.jpg", materialName: "Lamp & Glass" },
            { slot: "metallic", path: "vino/Lamp&Glass_M.jpg", materialName: "Lamp & Glass" },

            { slot: "diffuse", path: "vino/Lamp&Glass_D.jpg", materialName: "Glass" },
            { slot: "normal", path: "vino/Lamp&Glass_N.jpg", materialName: "Glass" },
            { slot: "roughness", path: "vino/Lamp&Glass_R.jpg", materialName: "Glass" },
            { slot: "metallic", path: "vino/Lamp&Glass_M.jpg", materialName: "Glass" },

            { slot: "diffuse", path: "vino/Tire_D.jpg", materialName: "Tire" },
            { slot: "normal", path: "vino/Tire_N.jpeg", materialName: "Tire" },
            { slot: "ambientOcclusion", path: "vino/Tire_AO.jpg", materialName: "Tire" },
            { slot: "roughness", path: "vino/Tire_R.jpg", materialName: "Tire" },
            { slot: "metallic", path: "vino/Tire_M.jpg", materialName: "Tire" },

            { slot: "diffuse", path: "vino/Sticker_D.jpg", materialName: "Sticker" },
            { slot: "normal", path: "vino/Sticker_N.jpg", materialName: "Sticker" },
            { slot: "roughness", path: "vino/Sticker_R.jpg", materialName: "Sticker" },
            { slot: "opacity", path: "vino/Sticker_A.png", materialName: "Sticker", addressMode: "clamp" },
        ],
        pbrMaterialOverrides: [
            {
                materialName: "Main Body",
                transparencyMode: "opaque",
                forceIrradianceInFragment: true,
                invertNormalMapX: true,
                clearOpacityTexture: true,
                backFaceCulling: true,
                clearCoat: {
                    isEnabled: true,
                    intensity: 1,
                    roughness: 1,
                    texturePath: "vino/Main Body_Pattern_CoatMsk.jpg",
                    textureRoughnessPath: "vino/Main Body_Pattern_CoatR.jpg",
                    bumpTexturePath: "vino/flakes.png",
                    bumpTextureLevel: 0.2143837519721915,
                    bumpTextureScale: 50,
                },
            },
            {
                materialName: "SmallParts",
                forceIrradianceInFragment: true,
                invertNormalMapX: true,
                backFaceCulling: true,
            },
            {
                materialName: "Lamp & Glass",
                transparencyMode: "opaque",
                clearOpacityTexture: true,
                forceIrradianceInFragment: true,
                invertNormalMapX: true,
                backFaceCulling: false,
            },
            {
                materialName: "Glass",
                transparencyMode: "alphaBlend",
                alpha: 0.25,
                clearOpacityTexture: true,
                forceIrradianceInFragment: true,
                invertNormalMapX: true,
                backFaceCulling: true,
                subSurface: {
                    isRefractionEnabled: true,
                    refractionIntensity: 0.9930598111760697,
                    useAlbedoToTintRefraction: true,
                },
            },
            {
                materialName: "Tire",
                forceIrradianceInFragment: true,
                invertNormalMapX: true,
                backFaceCulling: true,
            },
            {
                materialName: "Sticker",
                transparencyMode: "alphaTest",
                alphaCutOff: 0.15337093928152645,
                metallic: 0,
                forceIrradianceInFragment: true,
                invertNormalMapX: true,
                backFaceCulling: true,
            },
        ],
        pbrMaterialTextureAliases: [
            { materialName: "Main Body", textureMaterialKey: "main_body_pattern" },
            { materialName: "SmallParts", textureMaterialKey: "smlparts" },
            { materialName: "Lamp & Glass", textureMaterialKey: "lamp_glass" },
            { materialName: "Glass", textureMaterialKey: "lamp_glass" },
            { materialName: "Tire", textureMaterialKey: "tire" },
            { materialName: "Sticker", textureMaterialKey: "sticker" },
        ],
    },
    "vino/vino.glb": {
        name: "Vino (GLB reference)",
    },
    "40min-draft-jet-car-vertex-color/Car.fbx": {
        name: "Jet Car (vertex colors)",
    },
    "alfa-romeo-stradale-1967/finish91.fbx": {
        name: "Alfa Romeo Stradale 1967",
        textures: [
            { slot: "ambientOcclusion", path: "alfa-romeo-stradale-1967/AoJ2.jpeg", materialName: "forMayaAO:mi_car_paint_phen2", coordinatesIndex: 0 },
            { slot: "diffuse", path: "alfa-romeo-stradale-1967/uvKoldefuz2.png", materialName: "forMayaAO:phong2", coordinatesIndex: 1 },
            { slot: "roughness", path: "alfa-romeo-stradale-1967/uvKolRough.png", materialName: "forMayaAO:phong2", coordinatesIndex: 1 },
            { slot: "normal", path: "alfa-romeo-stradale-1967/uvNom3bmp.png", materialName: "forMayaAO:number", coordinatesIndex: 1 },
            { slot: "opacity", path: "alfa-romeo-stradale-1967/setkaAlfa2.png", materialName: "forMayaAO:Grill2", coordinatesIndex: 1, useAlphaFromRGB: true },
            { slot: "normal", path: "alfa-romeo-stradale-1967/setkabmp.png", materialName: "forMayaAO:Grill2", coordinatesIndex: 1 },
            { slot: "normal", path: "alfa-romeo-stradale-1967/headlight2bmp.png", materialName: "forMayaAO:frontLights", coordinatesIndex: 1 },
        ],
        pbrMaterialOverrides: [
            { materialName: "Chrome", metallic: 1, roughness: 0.18 },
            { materialName: "Chrome_2", metallic: 1, roughness: 0.22 },
            { materialName: "miror", metallic: 1, roughness: 0.05 },
            { materialName: "chromedvorn", metallic: 1, roughness: 0.2 },
            { materialName: "forMayaAO:mi_car_paint_phen2", metallic: 0, roughness: 0.18 },
            { materialName: "forMayaAO:Grill2", transparencyMode: "alphaTest" },
        ],
    },
    "gandalf-sax-animated-pc-set/Double_Display_Composition_04.fbx": {
        name: "Gandalf Sax PC Set (animated)",
        textures: [
            { slot: "diffuse", path: "gandalf-sax-animated-pc-set/Double_Display_Base_Color.png", materialName: "Double_Display" },
            { slot: "normal", path: "gandalf-sax-animated-pc-set/Double_Display_Normal_DirectX.png", materialName: "Double_Display" },
            { slot: "diffuse", path: "gandalf-sax-animated-pc-set/Mechan_Keyboard_Base_Color.png", materialName: "Mechan_Keyboard" },
            { slot: "normal", path: "gandalf-sax-animated-pc-set/Mechan_Keyboard_Normal_DirectX.png", materialName: "Mechan_Keyboard" },
            { slot: "opacity", path: "gandalf-sax-animated-pc-set/Mechan_Keyboard_Opacity.png", materialName: "Mechan_Keyboard" },
            { slot: "diffuse", path: "gandalf-sax-animated-pc-set/PC_Mouse_BaseColor.png", materialName: "PC_Mouse" },
            { slot: "normal", path: "gandalf-sax-animated-pc-set/PC_Mouse_Normal.png", materialName: "PC_Mouse" },
        ],
    },
    "mannequin-anatomy-aid-free-download/Mannequin_Animation.FBX": {
        name: "Mannequin (animated)",
        textures: [
            { slot: "diffuse", path: "mannequin-anatomy-aid-free-download/Diffuse.jpg" },
            { slot: "normal", path: "mannequin-anatomy-aid-free-download/Normal.jpg" },
        ],
    },
    "globophobia/Sketchfab.fbx": {
        name: "Globophobia",
        pbrMaterialOverrides: [
            {
                materialName: "shadow",
                albedoTextureHasAlpha: true,
                useAlphaFromAlbedoTexture: true,
            },
        ],
        viewerRotationYDegrees: 90,
    },
    "stylised-sky-player-home-dioroma/b63dcd76ee2d4476baf26f7dc48ea3f5.fbx.fbx": {
        name: "Stylised Sky Player Home Diorama",
        pbrMaterialOverrides: [
            {
                materialName: "wooden skel no op_PBR",
                transparencyMode: "opaque",
            },
            {
                materialName: "op_branches_PBR",
                albedoTextureHasAlpha: true,
                useAlphaFromAlbedoTexture: true,
                transparencyMode: "alphaTest",
            },
        ],
    },
    "the-last-stronghold-animated/Floating_Gate_Chinese1.fbx": {
        name: "The Last Stronghold (animated)",
        textures: [
            { slot: "diffuse", path: "the-last-stronghold-animated/sky-yellow-e.jpg", materialName: "sky_sketchfab" },
            { slot: "diffuse", path: "the-last-stronghold-animated/baked-gate_LOW_denoise.jpg", materialName: "final_gate_low" },
            { slot: "diffuse", path: "the-last-stronghold-animated/baked_full_alfa_denoise.jpg", materialName: "final_alfa" },
            { slot: "diffuse", path: "the-last-stronghold-animated/baked_gate_Top_denoise.jpg", materialName: "final_gate_top" },
            { slot: "diffuse", path: "the-last-stronghold-animated/baked_merged_C_denoise.jpg", materialName: "final_C" },
            { slot: "diffuse", path: "the-last-stronghold-animated/bake_island_B_denoise.jpg", materialName: "final_B" },
            { slot: "diffuse", path: "the-last-stronghold-animated/bake_somt_denoise.jpg", materialName: "final_SOMT" },
            { slot: "diffuse", path: "the-last-stronghold-animated/baked_island_E_denoise.jpg", materialName: "final_E" },
            { slot: "diffuse", path: "the-last-stronghold-animated/bake_islands_A_denoise.jpg", materialName: "final_A" },
            { slot: "diffuse", path: "the-last-stronghold-animated/ropes_denoise.jpg", materialName: "final_rope" },
        ],
        pbrMaterialOverrides: [
            { materialName: "sky_sketchfab", backFaceCulling: true },
        ],
    },
    "spartan-armour-mkv-halo-reach/Spartan_Sketchfab.fbx": {
        name: "Spartan Armor (FBX)",
        pbrMaterialTextureAliases: [
            { materialName: "Spartan_Shoulders_Mat", textureMaterialKey: "odst_shoulder_mat" },
            { materialName: "Spartan_Ear_Mat", textureMaterialKey: "spartan_ears_mat" },
            { materialName: "lambert2", textureMaterialKey: "lambert1" },
        ],
    },
    "spartan-armour-mkv-halo-reach/spartan_armour_mkv_-_halo_reach.glb": {
        name: "Spartan Armor (GLB reference)",
    },
};

const models: ModelEntry[] = buildModelCatalog();

function buildModelCatalog(): ModelEntry[] {
    return Object.keys(assetUrls)
        .map((path) => path.replace("../tests/models/", ""))
        .filter(isModelPath)
        .sort((a, b) => modelDisplayName(a).localeCompare(modelDisplayName(b)))
        .map((path) => {
            const override = modelOverrides[path] ?? {};
            return {
                name: override.name ?? modelDisplayName(path),
                path,
                url: assetUrl(path),
                format: inferModelFormat(path),
                textures: resolveTextureOverrides(override.textures),
                preloadTextures: resolveTexturePreloads(override.preloadTextures),
                pbrMaterialOverrides: override.pbrMaterialOverrides,
                pbrMaterialTextureAliases: override.pbrMaterialTextureAliases,
                lineArtAlbedoOverrides: override.lineArtAlbedoOverrides,
                defaultAnimation: override.defaultAnimation,
                disableVertexColors: override.disableVertexColors,
                forceOpaque: override.forceOpaque,
                viewerRotationYDegrees: override.viewerRotationYDegrees,
            };
        });
}

function resolveTextureOverrides(textures: ViewerTextureOverrideSource[] = []): ViewerTextureOverride[] {
    return textures.flatMap((texture) => {
        const url = assetUrls[`../tests/models/${texture.path}`];
        if (!url) {
            console.warn(`Missing viewer texture override: ${texture.path}`);
            return [];
        }
        return [{
            slot: texture.slot,
            url,
            materialName: texture.materialName,
            coordinatesIndex: texture.coordinatesIndex,
            useAlphaFromRGB: texture.useAlphaFromRGB,
            addressMode: texture.addressMode,
        }];
    });
}

function resolveTexturePreloads(paths: string[] = []): ViewerTexturePreload[] {
    return paths.flatMap((path) => {
        const url = assetUrls[`../tests/models/${path}`];
        if (!url) {
            console.warn(`Missing viewer texture preload: ${path}`);
            return [];
        }
        return [{ path, url }];
    });
}

function preloadViewerTextures(textures: ViewerTexturePreload[]): void {
    for (const preload of textures) {
        const fileName = getFileName(preload.path);
        const alreadyLoaded = scene.textures.some((texture) =>
            texture.name === fileName ||
            texture.url === preload.url ||
            getFileName((texture.url ?? "").replace(/\\/g, "/")) === fileName
        );
        if (alreadyLoaded) continue;

        const texture = new Texture(preload.url, scene);
        texture.name = fileName;
        texture.gammaSpace = false;
    }
}

function isModelPath(path: string): boolean {
    const lower = path.toLowerCase();
    return lower.endsWith(".fbx") || lower.endsWith(".glb");
}

function inferModelFormat(path: string): "fbx" | "glb" {
    return path.toLowerCase().endsWith(".glb") ? "glb" : "fbx";
}

function modelDisplayName(path: string): string {
    const folder = getDirectoryName(path).split("/").filter(Boolean).pop();
    const fileName = getFileName(path).replace(/\.(fbx|glb)$/i, "").replace(/\.fbx$/i, "");
    return toTitleCase(folder || fileName);
}

function toTitleCase(value: string): string {
    return value
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/\b\w/g, (match) => match.toUpperCase());
}

type ViewerPBRTextureSlot =
    | "albedo"
    | "normal"
    | "orm"
    | "metallic"
    | "roughness"
    | "ambientOcclusion"
    | "emissive"
    | "opacity"
    | "height"
    | "specular"
    | "gloss"
    | "unknown";

interface ViewerPBRTextureEntry {
    path: string;
    fileName: string;
    materialKey: string;
    slot: ViewerPBRTextureSlot;
    coordinatesIndex?: number;
    addressMode?: "clamp";
}

interface ViewerPBRTextureManifest {
    fbxPath: string;
    folder: string;
    normalization: ViewerNormalizationSettings;
    textures: ViewerPBRTextureEntry[];
}

interface ViewerNormalizationSettings {
    targetDiagonal: number;
    cameraRadiusMultiplier: number;
    cameraNearDivisor: number;
    cameraFarMultiplier: number;
}

const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp"];
const DEFAULT_NORMALIZATION: ViewerNormalizationSettings = {
    targetDiagonal: 10,
    cameraRadiusMultiplier: 1.35,
    cameraNearDivisor: 500,
    cameraFarMultiplier: 8,
};

function getAssetRelativePath(url: string): string | undefined {
    const match = Object.entries(assetUrls).find(([, value]) => value === url);
    return match?.[0].replace("../tests/models/", "");
}

function getViewerTextureAddressMode(path: string): "clamp" | undefined {
    return path === "vino/Sticker_A.png" ? "clamp" : undefined;
}

function getViewerPBRManifest(model: ModelEntry): ViewerPBRTextureManifest | null {
    const fbxPath = getAssetRelativePath(model.url);
    return fbxPath ? viewerPBRManifests[fbxPath] ?? null : null;
}

function buildViewerPBRManifests(): Record<string, ViewerPBRTextureManifest> {
    const assetPaths = Object.keys(assetUrls)
        .map((path) => path.replace("../tests/models/", ""))
        .sort((a, b) => a.localeCompare(b));
    const texturePaths = assetPaths.filter(isTexturePath);
    const manifests: Record<string, ViewerPBRTextureManifest> = {};

    for (const fbxPath of assetPaths.filter(isFBXPath)) {
        const folder = getDirectoryName(fbxPath);
        manifests[fbxPath] = {
            fbxPath,
            folder,
            normalization: DEFAULT_NORMALIZATION,
            textures: texturePaths
                .filter((path) => getDirectoryName(path) === folder)
                .map((path) => {
                    const fileName = getFileName(path);
                    return {
                        path,
                        fileName,
                        materialKey: inferMaterialKey(fileName),
                        slot: inferTextureSlot(fileName),
                        addressMode: getViewerTextureAddressMode(path),
                    };
                }),
        };
    }

    return manifests;
}

function getDirectoryName(path: string): string {
    const index = path.lastIndexOf("/");
    return index >= 0 ? path.substring(0, index) : "";
}

function getFileName(path: string): string {
    const index = path.lastIndexOf("/");
    return index >= 0 ? path.substring(index + 1) : path;
}

function isTexturePath(path: string): boolean {
    const lower = path.toLowerCase();
    return IMAGE_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

function isFBXPath(path: string): boolean {
    return path.toLowerCase().endsWith(".fbx");
}

function inferTextureSlot(fileName: string): ViewerPBRTextureSlot {
    const normalized = normalizeTextureName(fileName);

    if (/(^|[_\-\s])(opacity|alpha|opc|mask|coatmsk|flakesmask|op)($|[_\-\s])/.test(normalized)) return "opacity";
    if (/(^|[_\-\s])(emissive|emission|emit|glow|e)($|[_\-\s])/.test(normalized)) return "emissive";
    if (/(^|[_\-\s])(normal|norm|nrm|bump|bntn|nom|n)($|[_\-\s])/.test(normalized)) return "normal";
    if (/(^|[_\-\s])(orm|occlusionroughnessmetallic|occlusion_roughness_metallic|occlusion[_\-\s]?roughness[_\-\s]?metallic)($|[_\-\s])/.test(normalized)) return "orm";
    if (/(^|[_\-\s])(metallic|metalness|metal|met|m)($|[_\-\s])/.test(normalized)) return "metallic";
    if (/(^|[_\-\s])(roughness|rough|roph|r)($|[_\-\s])/.test(normalized)) return "roughness";
    if (/(^|[_\-\s])(ao|ambient|ambientocclusion|ambient_occlusion|occlusion|mixed_ao)($|[_\-\s])/.test(normalized)) return "ambientOcclusion";
    if (/(^|[_\-\s])(height|disp|displacement)($|[_\-\s])/.test(normalized)) return "height";
    if (/(^|[_\-\s])(specular|spec)($|[_\-\s])/.test(normalized)) return "specular";
    if (/(^|[_\-\s])(gloss|glossiness)($|[_\-\s])/.test(normalized)) return "gloss";
    if (/(^|[_\-\s])(albedo|basecolor|base_color|base|diffuse|diff|dif|defuse|color|colour|bc|d|tex|texture|rgb)($|[_\-\s])/.test(normalized)) return "albedo";

    return "unknown";
}

function inferMaterialKey(fileName: string): string {
    let name = normalizeTextureName(fileName);
    name = name
        .replace(/([_\-\s])?(base[_\-\s]?color|basecolor|albedo|diffuse|defuse|diff|dif|color|colour|bc|tex|texture|rgb)([_\-\s]?v\d+)?$/i, "")
        .replace(/([_\-\s])?(normal[_\-\s]?(opengl|directx)?|norm|nrm|bump|bntn|nom|n)$/i, "")
        .replace(/([_\-\s])?(orm|occlusion[_\-\s]?roughness[_\-\s]?metallic)$/i, "")
        .replace(/([_\-\s])?(metallic|metalness|metal|met|m)$/i, "")
        .replace(/([_\-\s])?(roughness|rough|roph|r)$/i, "")
        .replace(/([_\-\s])?(ambient[_\-\s]?occlusion|mixed[_\-\s]?ao|occlusion|ambient|ao)$/i, "")
        .replace(/([_\-\s])?(opacity|alpha|opc|mask|coatmsk|flakesmask|op)$/i, "")
        .replace(/([_\-\s])?(emissive|emission|emit|glow|e)$/i, "")
        .replace(/([_\-\s])?(height|disp|displacement)$/i, "")
        .replace(/([_\-\s])?(specular|spec|gloss|glossiness)$/i, "")
        .replace(/([_\-\s])+$/g, "");

    return normalizeMaterialName(name) || "default";
}

function normalizeTextureName(fileName: string): string {
    return fileName
        .replace(/\.(tga\.)?(png|jpe?g|webp)$/i, "")
        .replace(/\.\d+$/g, "")
        .toLowerCase();
}

function normalizeMaterialName(name: string): string {
    return name
        .replace(/\x00.*$/g, "")
        .replace(/[^a-z0-9]+/gi, "_")
        .replace(/^_+|_+$/g, "")
        .toLowerCase();
}

const viewerPBRManifests = buildViewerPBRManifests();

interface ViewerAssetFrame {
    center: Vector3;
    size: number;
    scale: number;
    camera: {
        radius: number;
        minZ: number;
        maxZ: number;
    };
}

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
    camera.lowerRadiusLimit = 1.0;

    scene.environmentTexture = CubeTexture.CreateFromPrefilteredData(studioEnvironmentUrl, scene);
    scene.environmentIntensity = 1.0;

    const lightElevation = 40 * Math.PI / 180;
    const lightAzimuth = 2.105 + Math.PI / 2;
    const lightPosition = new Vector3(
        Math.cos(lightAzimuth) * Math.cos(lightElevation),
        Math.sin(lightElevation),
        Math.sin(lightAzimuth) * Math.cos(lightElevation)
    ).scale(20);
    const keyLight = new DirectionalLight("keyLight", lightPosition.scale(-1).normalize(), scene);
    keyLight.position = lightPosition;
    keyLight.intensity = 2.5;

    const initialModelIndex = getInitialModelIndex();
    buildGUI(initialModelIndex);
    await loadModel(initialModelIndex);

    // Show inspector by default
    await import("@babylonjs/core/Debug/debugLayer.js");
    await import("@babylonjs/inspector");
    scene.debugLayer.show({ embedMode: true });

    engine.runRenderLoop(() => scene.render());
    window.addEventListener("resize", () => engine.resize());

    // Expose for debugging/testing
    (window as any).__scene = scene;
}

function buildGUI(initialModelIndex: number) {
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
    select.value = String(initialModelIndex);
    select.addEventListener("change", () => {
        const idx = parseInt(select.value);
        setStartupModel(models[idx]);
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

function getInitialModelIndex(): number {
    const requestedModel = new URLSearchParams(window.location.search).get(MODEL_QUERY_PARAM);
    return findModelIndex(requestedModel) ?? findModelIndex(DEFAULT_MODEL_PATH) ?? 0;
}

function findModelIndex(modelLocator: string | null | undefined): number | undefined {
    if (!modelLocator) return undefined;

    const normalizedLocator = normalizeModelLocator(modelLocator);
    if (!normalizedLocator) return undefined;

    const exactIndex = models.findIndex((model) =>
        normalizeModelLocator(model.path) === normalizedLocator ||
        normalizeModelLocator(model.name) === normalizedLocator
    );
    if (exactIndex >= 0) return exactIndex;

    const locatorTokens = normalizedLocator.split(" ").filter(Boolean);
    if (locatorTokens.length === 0) return undefined;

    const partialIndex = models.findIndex((model) => {
        const searchable = normalizeModelLocator(`${model.path} ${model.name} ${model.format}`);
        return locatorTokens.every((token) => searchable.includes(token));
    });

    return partialIndex >= 0 ? partialIndex : undefined;
}

function normalizeModelLocator(value: string): string {
    return value
        .replace(/\.(fbx|glb)$/i, "")
        .replace(/[^a-z0-9]+/gi, " ")
        .trim()
        .toLowerCase();
}

function setStartupModel(model: ModelEntry) {
    const url = new URL(window.location.href);
    url.searchParams.set(MODEL_QUERY_PARAM, model.path);
    window.history.replaceState(null, "", url);
}

function disposeCurrentModel() {
    if (!currentResult) return;

    for (const ag of currentResult.animationGroups) ag.dispose();
    for (const m of currentResult.meshes) m.dispose();
    for (const tn of currentResult.transformNodes) tn.dispose();
    for (const sk of currentResult.skeletons) sk.dispose();

    const multiMaterialsToDispose = [...scene.multiMaterials];
    for (const mat of multiMaterialsToDispose) {
        mat.dispose();
    }

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
        if (tex === scene.environmentTexture || tex.name.startsWith("data:EnvironmentBRDFTexture")) {
            continue;
        }
        tex.dispose();
    }

    currentResult = null;
}

function applyViewerPBRMaterials(
    result: ISceneLoaderAsyncResult,
    manifest: ViewerPBRTextureManifest | null,
    forceOpaque: boolean,
    materialTextureAliases: ViewerPBRMaterialTextureAlias[] = []
): number {
    const convertedMaterials = new Map<unknown, unknown>();
    const allowGlobalTextureFallback = countLeafMaterials(result) <= 1;
    let assignedTextureCount = 0;

    const convertMaterial = (material: unknown): unknown => {
        if (!material) return null;

        const existing = convertedMaterials.get(material);
        if (existing) return existing;

        if (material instanceof MultiMaterial) {
            const multiMaterial = new MultiMaterial(`${material.name}_PBR`, scene);
            convertedMaterials.set(material, multiMaterial);
            multiMaterial.subMaterials = material.subMaterials.map((subMaterial) =>
                convertMaterial(subMaterial) as PBRMaterial | null
            );
            return multiMaterial;
        }

        if (material instanceof PBRMaterial) {
            convertedMaterials.set(material, material);
            return material;
        }

        const textureEntries = manifest
            ? selectTextureEntriesForMaterial(
                materialName(material),
                manifest,
                material,
                allowGlobalTextureFallback,
                materialTextureAliases
            )
            : [];
        const conversion = createViewerPBRMaterial(material, textureEntries, forceOpaque);
        assignedTextureCount += conversion.textureCount;
        convertedMaterials.set(material, conversion.material);
        return conversion.material;
    };

    for (const mesh of result.meshes) {
        if (!mesh.material) continue;
        mesh.material = convertMaterial(mesh.material) as typeof mesh.material;
    }

    return assignedTextureCount;
}

function countLeafMaterials(result: ISceneLoaderAsyncResult): number {
    const materials = new Set<unknown>();
    for (const mesh of result.meshes) {
        collectLeafMaterials(mesh.material, materials);
    }
    return materials.size;
}

function collectLeafMaterials(material: unknown, materials: Set<unknown>) {
    if (!material) return;
    if (material instanceof MultiMaterial) {
        for (const subMaterial of material.subMaterials) {
            collectLeafMaterials(subMaterial, materials);
        }
        return;
    }
    materials.add(material);
}

function createViewerPBRMaterial(
    sourceMaterial: unknown,
    textureEntries: ViewerPBRTextureEntry[],
    forceOpaque: boolean
): { material: PBRMaterial; textureCount: number } {
    const pbrMaterial = new PBRMaterial(`${materialName(sourceMaterial) || "material"}_PBR`, scene);
    pbrMaterial.metallic = 0;
    pbrMaterial.roughness = 0.6;
    let textureCount = 0;

    if (sourceMaterial instanceof StandardMaterial) {
        pbrMaterial.albedoColor = sourceMaterial.diffuseColor.clone();
        pbrMaterial.emissiveColor = sourceMaterial.emissiveColor.clone();
        pbrMaterial.alpha = sourceMaterial.alpha;
        pbrMaterial.backFaceCulling = sourceMaterial.backFaceCulling;
        textureCount += copyStandardMaterialTexturesToPBR(sourceMaterial, pbrMaterial, forceOpaque);
        if (!forceOpaque && standardMaterialHasAlpha(sourceMaterial)) {
            pbrMaterial.needDepthPrePass = true;
            pbrMaterial.useAlphaFromAlbedoTexture = Boolean(sourceMaterial.diffuseTexture?.hasAlpha);
            if (sourceMaterial.alpha < 1 || sourceMaterial.needAlphaBlending()) {
                pbrMaterial.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
            }
        }
    } else {
        pbrMaterial.albedoColor = new Color3(1, 1, 1);
    }

    for (const entry of textureEntries) {
        const texture = createViewerPBRTexture(entry);

        switch (entry.slot) {
            case "albedo":
                pbrMaterial.albedoTexture?.dispose();
                pbrMaterial.albedoTexture = texture;
                pbrMaterial.albedoColor = new Color3(1, 1, 1);
                textureCount++;
                break;
            case "normal":
                pbrMaterial.bumpTexture?.dispose();
                pbrMaterial.bumpTexture = texture;
                textureCount++;
                break;
            case "orm":
                pbrMaterial.metallicTexture?.dispose();
                pbrMaterial.metallicTexture = texture;
                pbrMaterial.metallic = 1;
                pbrMaterial.roughness = 1;
                pbrMaterial.useAmbientOcclusionFromMetallicTextureRed = true;
                pbrMaterial.useRoughnessFromMetallicTextureAlpha = false;
                pbrMaterial.useRoughnessFromMetallicTextureGreen = true;
                pbrMaterial.useMetallnessFromMetallicTextureBlue = true;
                textureCount++;
                break;
            case "metallic":
                pbrMaterial.metallicTexture?.dispose();
                pbrMaterial.metallicTexture = texture;
                pbrMaterial.metallic = 1;
                pbrMaterial.useAmbientOcclusionFromMetallicTextureRed = false;
                pbrMaterial.useRoughnessFromMetallicTextureAlpha = false;
                pbrMaterial.useRoughnessFromMetallicTextureGreen = false;
                pbrMaterial.useMetallnessFromMetallicTextureBlue = true;
                textureCount++;
                break;
            case "roughness":
                pbrMaterial.microSurfaceTexture?.dispose();
                pbrMaterial.microSurfaceTexture = texture;
                pbrMaterial.roughness = 1;
                textureCount++;
                break;
            case "ambientOcclusion":
                pbrMaterial.ambientTexture?.dispose();
                pbrMaterial.ambientTexture = texture;
                pbrMaterial.ambientTextureStrength = 1;
                textureCount++;
                break;
            case "emissive":
                pbrMaterial.emissiveTexture?.dispose();
                pbrMaterial.emissiveTexture = texture;
                pbrMaterial.emissiveColor = new Color3(1, 1, 1);
                textureCount++;
                break;
            case "opacity":
                if (forceOpaque) {
                    texture.dispose();
                    break;
                }
                pbrMaterial.opacityTexture?.dispose();
                pbrMaterial.opacityTexture = configureOpacityTexture(texture, entry.fileName);
                pbrMaterial.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
                pbrMaterial.needDepthPrePass = true;
                textureCount++;
                break;
            case "height":
                if (pbrMaterial.bumpTexture) {
                    texture.dispose();
                    break;
                }
                pbrMaterial.bumpTexture = texture;
                textureCount++;
                break;
            case "specular":
                pbrMaterial.reflectivityTexture?.dispose();
                pbrMaterial.reflectivityTexture = texture;
                textureCount++;
                break;
            case "gloss":
                pbrMaterial.microSurfaceTexture?.dispose();
                pbrMaterial.microSurfaceTexture = texture;
                textureCount++;
                break;
            case "unknown":
                texture.dispose();
                break;
        }
    }

    if (forceOpaque) {
        pbrMaterial.transparencyMode = PBRMaterial.PBRMATERIAL_OPAQUE;
        pbrMaterial.alpha = 1;
        pbrMaterial.opacityTexture = null;
        pbrMaterial.needDepthPrePass = false;
    }

    return { material: pbrMaterial, textureCount };
}

function copyStandardMaterialTexturesToPBR(
    sourceMaterial: StandardMaterial,
    pbrMaterial: PBRMaterial,
    forceOpaque: boolean
): number {
    let textureCount = 0;

    if (sourceMaterial.diffuseTexture) {
        pbrMaterial.albedoTexture = sourceMaterial.diffuseTexture;
        pbrMaterial.albedoColor = new Color3(1, 1, 1);
        textureCount++;
    }

    if (sourceMaterial.bumpTexture) {
        pbrMaterial.bumpTexture = sourceMaterial.bumpTexture;
        textureCount++;
    }

    if (sourceMaterial.emissiveTexture) {
        pbrMaterial.emissiveTexture = sourceMaterial.emissiveTexture;
        pbrMaterial.emissiveColor = new Color3(1, 1, 1);
        textureCount++;
    }

    if (sourceMaterial.ambientTexture) {
        pbrMaterial.ambientTexture = sourceMaterial.ambientTexture;
        pbrMaterial.ambientTextureStrength = 1;
        textureCount++;
    }

    if (sourceMaterial.specularTexture) {
        pbrMaterial.reflectivityTexture = sourceMaterial.specularTexture;
        textureCount++;
    }

    if (!forceOpaque && sourceMaterial.opacityTexture) {
        pbrMaterial.opacityTexture = configureOpacityTexture(sourceMaterial.opacityTexture);
        pbrMaterial.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
        pbrMaterial.needDepthPrePass = true;
        textureCount++;
    }

    return textureCount;
}

function standardMaterialHasAlpha(material: StandardMaterial): boolean {
    return material.alpha < 1 ||
        Boolean(material.opacityTexture) ||
        Boolean(material.diffuseTexture?.hasAlpha) ||
        material.needAlphaBlending() ||
        material.needAlphaTesting();
}

function createViewerPBRTexture(entry: ViewerPBRTextureEntry): Texture {
    const texture = new Texture(assetUrl(entry.path), scene);
    texture.name = entry.fileName;
    texture.gammaSpace = entry.slot === "albedo" || entry.slot === "emissive";
    if (entry.coordinatesIndex !== undefined) {
        texture.coordinatesIndex = entry.coordinatesIndex;
    }
    applyViewerTextureAddressMode(texture, entry.addressMode);
    if (entry.slot === "opacity") {
        configureOpacityTexture(texture, entry.fileName);
    }
    return texture;
}

function configureOpacityTexture<T extends BaseTexture>(texture: T, sourceName = texture.name): T {
    texture.hasAlpha = true;
    texture.getAlphaFromRGB = isJpegTexturePath(sourceName);
    return texture;
}

function applyViewerTextureAddressMode(texture: Texture, addressMode: "clamp" | undefined): void {
    if (addressMode !== "clamp") return;
    texture.wrapU = Texture.CLAMP_ADDRESSMODE;
    texture.wrapV = Texture.CLAMP_ADDRESSMODE;
}

function isJpegTexturePath(path: string): boolean {
    return /\.(jpe?g)(?:$|[?#])/i.test(path);
}

function selectTextureEntriesForMaterial(
    materialNameValue: string,
    manifest: ViewerPBRTextureManifest,
    sourceMaterial?: unknown,
    allowGlobalTextureFallback = false,
    materialTextureAliases: ViewerPBRMaterialTextureAlias[] = []
): ViewerPBRTextureEntry[] {
    const supportedTextures = manifest.textures.filter((entry) => entry.slot !== "unknown");
    const sourceTextureMatches = sourceMaterial
        ? getSourceMaterialTextureEntries(sourceMaterial, manifest)
        : [];
    if (sourceTextureMatches.length > 0) {
        return chooseOneTexturePerSlot(getSiblingTextureEntries(sourceTextureMatches, manifest));
    }

    if (supportedTextures.length === 0) return [];

    const normalizedMaterialName = normalizeMaterialName(materialNameValue);
    const exactMatches = normalizedMaterialName
        ? supportedTextures.filter((entry) =>
            normalizedMaterialName === entry.materialKey ||
            normalizedMaterialName.includes(entry.materialKey) ||
            entry.materialKey.includes(normalizedMaterialName)
        )
        : [];

    if (exactMatches.length > 0) {
        return chooseOneTexturePerSlot(exactMatches);
    }

    const aliasKey = findViewerMaterialTextureAlias(materialNameValue, materialTextureAliases);
    if (aliasKey) {
        const aliasMatches = supportedTextures.filter((entry) =>
            materialKeyMatchesAny(entry.materialKey, new Set([aliasKey]))
        );
        if (aliasMatches.length > 0) {
            return chooseOneTexturePerSlot(aliasMatches);
        }
    }

    const materialKeys = new Set(supportedTextures.map((entry) => entry.materialKey));
    if (allowGlobalTextureFallback && materialKeys.size === 1 && supportedTextures.length === manifest.textures.length) {
        return chooseOneTexturePerSlot(supportedTextures);
    }

    const sharedMaterialKey = [...materialKeys]
        .sort((a, b) => a.length - b.length)
        .find((key) =>
            key !== "default" &&
            key.length >= 4 &&
            [...materialKeys].every((otherKey) => otherKey === key || otherKey.includes(key))
        );
    if (allowGlobalTextureFallback && sharedMaterialKey) {
        return chooseOneTexturePerSlot(
            supportedTextures.filter((entry) => entry.materialKey.includes(sharedMaterialKey))
        );
    }

    return [];
}

function findViewerMaterialTextureAlias(
    materialNameValue: string,
    materialTextureAliases: ViewerPBRMaterialTextureAlias[]
): string | null {
    const normalizedMaterialName = normalizePBRMaterialOverrideName(materialNameValue);
    const alias = materialTextureAliases.find((entry) =>
        normalizePBRMaterialOverrideName(entry.materialName) === normalizedMaterialName
    );
    return alias ? normalizeMaterialName(alias.textureMaterialKey) : null;
}

function getSourceMaterialTextureEntries(
    sourceMaterial: unknown,
    manifest: ViewerPBRTextureManifest
): ViewerPBRTextureEntry[] {
    if (!(sourceMaterial instanceof StandardMaterial)) return [];

    const sourceTextures: { texture: { name: string; coordinatesIndex?: number } | null; slot: ViewerPBRTextureSlot }[] = [
        { texture: sourceMaterial.diffuseTexture, slot: "albedo" },
        { texture: sourceMaterial.bumpTexture, slot: "normal" },
        { texture: sourceMaterial.emissiveTexture, slot: "emissive" },
        { texture: sourceMaterial.ambientTexture, slot: "ambientOcclusion" },
        { texture: sourceMaterial.specularTexture, slot: "specular" },
    ];
    if (sourceMaterial.opacityTexture) {
        sourceTextures.push({ texture: sourceMaterial.opacityTexture, slot: "opacity" });
    }

    return sourceTextures
        .map(({ texture, slot }) => texture ? matchManifestTextureFromSource(texture, slot, manifest) : null)
        .filter((entry): entry is ViewerPBRTextureEntry => Boolean(entry));
}

function matchManifestTextureFromSource(
    texture: { name: string; coordinatesIndex?: number },
    slot: ViewerPBRTextureSlot,
    manifest: ViewerPBRTextureManifest
): ViewerPBRTextureEntry | null {
    const sourceNames = getTextureSourceNames(texture);
    const matches = manifest.textures.filter((entry) =>
        sourceNames.some((sourceName) => textureNamesMatch(sourceName, entry.fileName))
    );
    const slotMatches = matches.filter((entry) => entry.slot === slot);
    const [bestMatch] = (slotMatches.length > 0 ? slotMatches : matches).sort(compareTexturePreference);
    if (!bestMatch) return null;
    return {
        ...bestMatch,
        slot: bestMatch.slot === "unknown" ? slot : bestMatch.slot,
        coordinatesIndex: texture.coordinatesIndex,
    };
}

function getTextureSourceNames(texture: { name: string }): string[] {
    const names = new Set<string>();
    for (const value of [
        texture.name,
        "url" in texture && typeof texture.url === "string" ? texture.url : "",
    ]) {
        if (!value) continue;
        names.add(getFileName(value.replace(/\\/g, "/")));
    }
    return [...names];
}

function textureNamesMatch(sourceName: string, manifestFileName: string): boolean {
    const source = normalizeComparableTextureName(sourceName);
    const manifest = normalizeComparableTextureName(manifestFileName);
    return Boolean(source) && (
        source === manifest ||
        source.includes(manifest) ||
        manifest.includes(source)
    );
}

function normalizeComparableTextureName(fileName: string): string {
    return normalizeTextureName(fileName)
        .replace(/[^a-z0-9]+/g, "");
}

function getSiblingTextureEntries(
    sourceMatches: ViewerPBRTextureEntry[],
    manifest: ViewerPBRTextureManifest
): ViewerPBRTextureEntry[] {
    const sourceByPath = new Map<string, ViewerPBRTextureEntry>();
    for (const entry of sourceMatches) {
        if (!sourceByPath.has(entry.path)) {
            sourceByPath.set(entry.path, entry);
        }
    }
    const sourceKeys = new Set(sourceMatches.map((entry) => entry.materialKey));
    const entries = manifest.textures
        .filter((entry) =>
            sourceByPath.has(entry.path) ||
            (entry.slot !== "unknown" && materialKeyMatchesAny(entry.materialKey, sourceKeys))
        )
        .map((entry) => {
            const sourceEntry = sourceByPath.get(entry.path);
            if (sourceEntry) return sourceEntry;

            const sourceCoordinatesIndex = sourceMatches.find((sourceMatch) =>
                sourceMatch.coordinatesIndex !== undefined &&
                materialKeyMatchesAny(entry.materialKey, new Set([sourceMatch.materialKey]))
            )?.coordinatesIndex;
            return sourceCoordinatesIndex !== undefined
                ? { ...entry, coordinatesIndex: sourceCoordinatesIndex }
                : entry;
        });
    return entries;
}

function materialKeyMatchesAny(materialKey: string, sourceKeys: Set<string>): boolean {
    for (const sourceKey of sourceKeys) {
        if (sourceKey === "default") {
            if (materialKey === sourceKey) return true;
            continue;
        }
        if (
            materialKey === sourceKey ||
            materialKey.includes(sourceKey) ||
            sourceKey.includes(materialKey)
        ) {
            return true;
        }
    }
    return false;
}

function chooseOneTexturePerSlot(entries: ViewerPBRTextureEntry[]): ViewerPBRTextureEntry[] {
    const preferredSlotOrder: ViewerPBRTextureSlot[] = [
        "albedo",
        "normal",
        "orm",
        "metallic",
        "roughness",
        "ambientOcclusion",
        "emissive",
        "opacity",
        "height",
        "specular",
        "gloss",
    ];
    const selected = new Map<ViewerPBRTextureSlot, ViewerPBRTextureEntry>();

    for (const entry of [...entries].sort(compareTexturePreference)) {
        if (!selected.has(entry.slot)) {
            selected.set(entry.slot, entry);
        }
    }
    if (
        selected.has("orm") &&
        (selected.has("metallic") || selected.has("roughness") || selected.has("ambientOcclusion"))
    ) {
        selected.delete("orm");
    }

    return preferredSlotOrder
        .map((slot) => selected.get(slot))
        .filter((entry): entry is ViewerPBRTextureEntry => Boolean(entry));
}

function compareTexturePreference(a: ViewerPBRTextureEntry, b: ViewerPBRTextureEntry): number {
    const aScore = texturePreferenceScore(a);
    const bScore = texturePreferenceScore(b);
    return bScore - aScore || a.fileName.localeCompare(b.fileName);
}

function texturePreferenceScore(entry: ViewerPBRTextureEntry): number {
    const normalized = normalizeTextureName(entry.fileName);
    let score = 1;
    if (!/(^|[_\-\s])v\d+($|[_\-\s])/.test(normalized)) {
        score = 2;
    }
    if (/(^|[_\-\s])v2($|[_\-\s])/.test(normalized)) {
        score = 3;
    }
    if (entry.slot === "ambientOcclusion" && /(^|[_\-\s])mixed[_\-\s]?ao($|[_\-\s])/.test(normalized)) {
        score += 4;
    }
    return score;
}

function materialName(material: unknown): string {
    return typeof material === "object" &&
        material !== null &&
        "name" in material &&
        typeof material.name === "string"
        ? material.name
        : "";
}

function normalizeLoadedAsset(
    result: ISceneLoaderAsyncResult,
    manifest: ViewerPBRTextureManifest | null,
    viewerRotationYDegrees = 0
): ViewerAssetFrame {
    const settings = manifest?.normalization ?? DEFAULT_NORMALIZATION;
    const originalExtents = getLoadedMeshExtents(result);
    const originalCenter = originalExtents
        ? originalExtents.min.add(originalExtents.max).scale(0.5)
        : Vector3.Zero();
    const originalSize = originalExtents
        ? originalExtents.max.subtract(originalExtents.min).length()
        : settings.targetDiagonal;

    let scale = 1;
    if (Number.isFinite(originalSize) && originalSize > 0) {
        scale = settings.targetDiagonal / originalSize;
    }

    const viewerRoot = new TransformNode("viewerNormalizedRoot", scene);
    const viewerRotationY = viewerRotationYDegrees * Math.PI / 180;
    viewerRoot.scaling = new Vector3(scale, scale, scale);
    viewerRoot.rotation.y = viewerRotationY;
    viewerRoot.position = Vector3.TransformCoordinates(
        originalCenter.scale(scale),
        Matrix.RotationYawPitchRoll(viewerRotationY, 0, 0)
    ).scale(-1);

    const loadedNodes = new Set<unknown>([...result.meshes, ...result.transformNodes]);
    for (const transformNode of result.transformNodes) {
        if (isAttachedToBone(transformNode)) continue;
        if (!transformNode.parent || !loadedNodes.has(transformNode.parent)) {
            transformNode.parent = viewerRoot;
        }
    }
    for (const mesh of result.meshes) {
        if (isAttachedToBone(mesh)) continue;
        if (!mesh.parent || !loadedNodes.has(mesh.parent)) {
            mesh.parent = viewerRoot;
        }
    }

    result.transformNodes.push(viewerRoot);

    const normalizedExtents = getLoadedMeshExtents(result);
    const center = normalizedExtents
        ? normalizedExtents.min.add(normalizedExtents.max).scale(0.5)
        : Vector3.Zero();
    const size = normalizedExtents
        ? normalizedExtents.max.subtract(normalizedExtents.min).length()
        : settings.targetDiagonal;
    const safeSize = Number.isFinite(size) && size > 0 ? size : settings.targetDiagonal;
    const radius = safeSize * settings.cameraRadiusMultiplier;

    return {
        center,
        size: safeSize,
        scale,
        camera: {
            radius,
            minZ: Math.max(safeSize / settings.cameraNearDivisor, 0.01),
            maxZ: Math.max(safeSize * settings.cameraFarMultiplier, radius + safeSize),
        },
    };
}

function getLoadedMeshExtents(result: ISceneLoaderAsyncResult): { min: Vector3; max: Vector3 } | null {
    let min: Vector3 | null = null;
    let max: Vector3 | null = null;

    for (const mesh of result.meshes) {
        if (mesh.isDisposed()) continue;

        const extents = getMeshFiniteWorldExtents(mesh);
        if (!extents) continue;

        if (!min || !max) {
            min = extents.min.clone();
            max = extents.max.clone();
            continue;
        }

        min.x = Math.min(min.x, extents.min.x);
        min.y = Math.min(min.y, extents.min.y);
        min.z = Math.min(min.z, extents.min.z);
        max.x = Math.max(max.x, extents.max.x);
        max.y = Math.max(max.y, extents.max.y);
        max.z = Math.max(max.z, extents.max.z);
    }

    return min && max ? { min, max } : null;
}

function getMeshFiniteWorldExtents(mesh: ISceneLoaderAsyncResult["meshes"][number]): { min: Vector3; max: Vector3 } | null {
    if (mesh.getTotalVertices() === 0) return null;

    mesh.computeWorldMatrix(true);

    const box = mesh.getBoundingInfo().boundingBox;
    if (isFiniteBounds(box.minimumWorld, box.maximumWorld)) {
        return { min: box.minimumWorld, max: box.maximumWorld };
    }

    const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
    if (!positions || positions.length < 3) return null;

    const world = mesh.getWorldMatrix().m;
    if (!world.every(Number.isFinite)) return null;

    const min = new Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
    const max = new Vector3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);

    for (let i = 0; i + 2 < positions.length; i += 3) {
        const x = positions[i];
        const y = positions[i + 1];
        const z = positions[i + 2];
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;

        const worldX = x * world[0] + y * world[4] + z * world[8] + world[12];
        const worldY = x * world[1] + y * world[5] + z * world[9] + world[13];
        const worldZ = x * world[2] + y * world[6] + z * world[10] + world[14];
        if (!Number.isFinite(worldX) || !Number.isFinite(worldY) || !Number.isFinite(worldZ)) continue;

        min.x = Math.min(min.x, worldX);
        min.y = Math.min(min.y, worldY);
        min.z = Math.min(min.z, worldZ);
        max.x = Math.max(max.x, worldX);
        max.y = Math.max(max.y, worldY);
        max.z = Math.max(max.z, worldZ);
    }

    return isFiniteBounds(min, max) ? { min, max } : null;
}

function isFiniteBounds(min: Vector3, max: Vector3): boolean {
    return Number.isFinite(min.x) &&
        Number.isFinite(min.y) &&
        Number.isFinite(min.z) &&
        Number.isFinite(max.x) &&
        Number.isFinite(max.y) &&
        Number.isFinite(max.z) &&
        min.x <= max.x &&
        min.y <= max.y &&
        min.z <= max.z;
}

function isAttachedToBone(node: unknown): boolean {
    return typeof node === "object" &&
        node !== null &&
        "_transformToBoneReferal" in node &&
        Boolean((node as { _transformToBoneReferal?: unknown })._transformToBoneReferal);
}

interface ViewerFeatureStats {
    uvSetCount: number;
    hasVertexColors: boolean;
    morphTargetCount: number;
    multiMaterialCount: number;
    alphaMaterialCount: number;
}

const UV_BUFFER_KINDS = [
    VertexBuffer.UVKind,
    VertexBuffer.UV2Kind,
    VertexBuffer.UV3Kind,
    VertexBuffer.UV4Kind,
    VertexBuffer.UV5Kind,
    VertexBuffer.UV6Kind,
];

function getViewerFeatureStats(result: ISceneLoaderAsyncResult): ViewerFeatureStats {
    let uvSetCount = 0;
    let hasVertexColors = false;
    let morphTargetCount = 0;
    let multiMaterialCount = 0;
    let alphaMaterialCount = 0;
    const multiMaterials = new Set<MultiMaterial>();
    const alphaMaterials = new Set<PBRMaterial | StandardMaterial>();

    for (const mesh of result.meshes) {
        const meshUVSetCount = UV_BUFFER_KINDS.filter((kind) =>
            mesh.isVerticesDataPresent(kind)
        ).length;
        uvSetCount = Math.max(uvSetCount, meshUVSetCount);

        if (mesh.useVertexColors && mesh.isVerticesDataPresent(VertexBuffer.ColorKind)) {
            hasVertexColors = true;
        }

        if (mesh.morphTargetManager) {
            morphTargetCount += mesh.morphTargetManager.numTargets;
        }

        if (mesh.material instanceof MultiMaterial) {
            multiMaterials.add(mesh.material);
            for (const subMaterial of mesh.material.subMaterials) {
                if (subMaterial instanceof PBRMaterial || subMaterial instanceof StandardMaterial) {
                    if (materialUsesAlpha(subMaterial)) {
                        alphaMaterials.add(subMaterial);
                    }
                }
            }
        } else if (mesh.material instanceof PBRMaterial || mesh.material instanceof StandardMaterial) {
            if (materialUsesAlpha(mesh.material)) {
                alphaMaterials.add(mesh.material);
            }
        }
    }

    multiMaterialCount = multiMaterials.size;
    alphaMaterialCount = alphaMaterials.size;

    return {
        uvSetCount,
        hasVertexColors,
        morphTargetCount,
        multiMaterialCount,
        alphaMaterialCount,
    };
}

function applyVertexColorUseOverride(result: ISceneLoaderAsyncResult, disableVertexColors: boolean): void {
    if (!disableVertexColors) return;

    for (const mesh of result.meshes) {
        mesh.useVertexColors = false;
    }
}

function materialUsesAlpha(material: PBRMaterial | StandardMaterial): boolean {
    return material.alpha < 1 ||
        Boolean(material.opacityTexture) ||
        Boolean(material instanceof PBRMaterial && material.useAlphaFromAlbedoTexture && material.albedoTexture) ||
        Boolean("needDepthPrePass" in material && material.needDepthPrePass) ||
        material.needAlphaBlending() ||
        material.needAlphaTesting();
}

function appendFeatureStats(statusText: string, stats: ViewerFeatureStats): string {
    if (stats.uvSetCount > 1) statusText += `, ${stats.uvSetCount} UV sets`;
    if (stats.hasVertexColors) statusText += ", vertex colors";
    if (stats.morphTargetCount > 0) statusText += `, ${stats.morphTargetCount} morph target(s)`;
    if (stats.multiMaterialCount > 0) statusText += `, ${stats.multiMaterialCount} multi-material(s)`;
    if (stats.alphaMaterialCount > 0) statusText += `, ${stats.alphaMaterialCount} alpha material(s)`;
    return statusText;
}

function getLoadedAssetTextureCount(
    result: ISceneLoaderAsyncResult,
    manifest: ViewerPBRTextureManifest | null,
    model: ModelEntry
): number {
    const textureUrls = new Set<string>();
    const knownTextureUrls = getKnownAssetTextureUrls(manifest, model);
    const folder = manifest?.folder;

    for (const texture of scene.textures) {
        const url = texture.url ?? texture.name;
        if (isKnownAssetTextureUrl(url, knownTextureUrls, folder)) {
            textureUrls.add(url);
        }
    }

    for (const override of model.textures) {
        textureUrls.add(override.url);
    }
    for (const preload of model.preloadTextures) {
        textureUrls.add(preload.url);
    }

    for (const mesh of result.meshes) {
        collectMaterialTextureUrls(mesh.material, textureUrls, folder, knownTextureUrls);
    }

    return textureUrls.size;
}

function getKnownAssetTextureUrls(
    manifest: ViewerPBRTextureManifest | null,
    model: ModelEntry
): Set<string> {
    const urls = new Set<string>();
    if (manifest) {
        for (const entry of manifest.textures) {
            urls.add(assetUrl(entry.path));
        }
    }
    for (const override of model.textures) {
        urls.add(override.url);
    }
    for (const preload of model.preloadTextures) {
        urls.add(preload.url);
    }
    return urls;
}

function isKnownAssetTextureUrl(
    url: string,
    knownTextureUrls: Set<string>,
    assetFolder: string | undefined
): boolean {
    if (knownTextureUrls.size > 0) {
        return knownTextureUrls.has(url);
    }
    return Boolean(assetFolder && url.includes(`/tests/models/${assetFolder}/`));
}

function collectMaterialTextureUrls(
    material: unknown,
    textureUrls: Set<string>,
    assetFolder: string | undefined,
    knownTextureUrls: Set<string>
) {
    if (!material) return;

    if (material instanceof MultiMaterial) {
        for (const subMaterial of material.subMaterials) {
            collectMaterialTextureUrls(subMaterial, textureUrls, assetFolder, knownTextureUrls);
        }
        return;
    }

    if (!(material instanceof PBRMaterial) && !(material instanceof StandardMaterial)) {
        return;
    }

    const textures = material.getActiveTextures();
    for (const texture of textures) {
        const url = texture.url ?? texture.name;
        if (!url) continue;
        if (isKnownAssetTextureUrl(url, knownTextureUrls, assetFolder)) {
            textureUrls.add(url);
        }
    }
}

async function loadModel(index: number) {
    const model = models[index];
    status.textContent = `Loading ${model.name}...`;
    let pbrTextureCount = 0;
    let assetTextureCount = 0;

    disposeCurrentModel();

    try {
        let manifest: ViewerPBRTextureManifest | null = null;

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
            applyVertexColorUseOverride(currentResult, model.disableVertexColors ?? false);

            manifest = getViewerPBRManifest(model);
            pbrTextureCount = applyViewerPBRMaterials(
                currentResult,
                manifest,
                model.forceOpaque ?? false,
                model.pbrMaterialTextureAliases ?? []
            );
            pbrTextureCount += applyPBRTextureOverrides(
                model.textures,
                model.forceOpaque ?? false
            );
            applyPBRMaterialOverrides(model.pbrMaterialOverrides ?? [], model.forceOpaque ?? false);
            applyLineArtSiblingAlbedo(currentResult, model.lineArtAlbedoOverrides ?? []);
            preloadViewerTextures(model.preloadTextures);
            assetTextureCount = getLoadedAssetTextureCount(currentResult, manifest, model);

            if (pbrTextureCount === 0) {
                // Fallback for any hand-authored entries that do not have sibling texture assets.
                for (const mat of scene.materials) {
                    if (mat instanceof StandardMaterial) {
                        applyTextures(mat, model.textures);
                    }
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

        const frame = normalizeLoadedAsset(currentResult, manifest, model.viewerRotationYDegrees);
        camera.target = frame.center;
        camera.radius = frame.camera.radius;
        camera.minZ = frame.camera.minZ;
        camera.maxZ = frame.camera.maxZ;
        camera.alpha = 2.105;   // ~120° azimuth
        camera.beta = 1.080;    // ~62° elevation (above horizon)

        const meshCount = currentResult.meshes.length;
        const skelCount = currentResult.skeletons.length;
        const animCount = currentResult.animationGroups.length;

        let statusText = `Loaded: ${meshCount} mesh(es)`;
        if (skelCount > 0) statusText += `, ${skelCount} skeleton(s)`;
        if (animCount > 0) statusText += `, ${animCount} animation(s)`;
        if (assetTextureCount > 0) statusText += `, ${assetTextureCount} asset texture(s)`;
        statusText = appendFeatureStats(statusText, getViewerFeatureStats(currentResult));
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
                mat.opacityTexture = configureOpacityTexture(new Texture(tex.url, scene), tex.url);
                break;
        }
    }
}

function applyPBRTextureOverrides(
    textures: ViewerTextureOverride[],
    forceOpaque: boolean
): number {
    let appliedCount = 0;

    for (const mat of scene.materials) {
        if (!(mat instanceof PBRMaterial)) continue;

        for (const tex of textures) {
            if (tex.materialName && !matchesPBRMaterialOverride(mat.name, tex.materialName)) {
                continue;
            }
            if (!tex.materialName && pbrMaterialHasTextureForSlot(mat, tex.slot)) {
                continue;
            }

            const texture = createPBRTextureOverride(tex);
            switch (tex.slot) {
                case "albedo":
                case "diffuse":
                    mat.albedoTexture?.dispose();
                    mat.albedoTexture = texture;
                    mat.albedoColor = new Color3(1, 1, 1);
                    appliedCount++;
                    break;
                case "normal":
                    mat.bumpTexture?.dispose();
                    mat.bumpTexture = texture;
                    appliedCount++;
                    break;
                case "ambientOcclusion":
                    mat.ambientTexture?.dispose();
                    mat.ambientTexture = texture;
                    mat.ambientTextureStrength = 1;
                    appliedCount++;
                    break;
                case "roughness":
                    mat.microSurfaceTexture?.dispose();
                    mat.microSurfaceTexture = texture;
                    mat.roughness = 1;
                    appliedCount++;
                    break;
                case "metallic":
                    mat.metallicTexture?.dispose();
                    mat.metallicTexture = texture;
                    mat.metallic = 1;
                    mat.useMetallnessFromMetallicTextureBlue = true;
                    mat.useRoughnessFromMetallicTextureGreen = false;
                    mat.useRoughnessFromMetallicTextureAlpha = false;
                    mat.useAmbientOcclusionFromMetallicTextureRed = false;
                    appliedCount++;
                    break;
                case "emissive":
                    mat.emissiveTexture?.dispose();
                    mat.emissiveTexture = texture;
                    mat.emissiveColor = new Color3(1, 1, 1);
                    appliedCount++;
                    break;
                case "opacity":
                    if (forceOpaque) {
                        texture.dispose();
                        break;
                    }
                    mat.opacityTexture?.dispose();
                    mat.opacityTexture = configureOpacityTexture(texture, tex.url);
                    if (tex.useAlphaFromRGB) {
                        mat.opacityTexture.getAlphaFromRGB = true;
                    }
                    mat.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
                    mat.needDepthPrePass = true;
                    appliedCount++;
                    break;
                default:
                    texture.dispose();
                    break;
            }
        }
    }

    return appliedCount;
}

function createPBRTextureOverride(textureOverride: ViewerTextureOverride): Texture {
    const texture = new Texture(textureOverride.url, scene);
    texture.name = getFileName(textureOverride.url.replace(/\\/g, "/"));
    texture.gammaSpace = textureOverride.slot === "diffuse" ||
        textureOverride.slot === "albedo" ||
        textureOverride.slot === "emissive";
    if (textureOverride.coordinatesIndex !== undefined) {
        texture.coordinatesIndex = textureOverride.coordinatesIndex;
    }
    applyViewerTextureAddressMode(texture, textureOverride.addressMode);
    return texture;
}

function pbrMaterialHasTextureForSlot(material: PBRMaterial, slot: string): boolean {
    switch (slot) {
        case "albedo":
        case "diffuse":
            return Boolean(material.albedoTexture);
        case "normal":
            return Boolean(material.bumpTexture);
        case "ambientOcclusion":
            return Boolean(material.ambientTexture);
        case "roughness":
            return Boolean(material.microSurfaceTexture);
        case "metallic":
            return Boolean(material.metallicTexture);
        case "emissive":
            return Boolean(material.emissiveTexture);
        case "opacity":
            return Boolean(material.opacityTexture);
        default:
            return false;
    }
}

function applyPBRMaterialOverrides(
    overrides: ViewerPBRMaterialOverride[],
    forceOpaque: boolean
) {
    if (overrides.length === 0) return;

    for (const mat of scene.materials) {
        if (!(mat instanceof PBRMaterial)) continue;

        for (const override of overrides) {
            if (!matchesPBRMaterialOverride(mat.name, override.materialName)) {
                continue;
            }

            if (override.albedoTextureHasAlpha && mat.albedoTexture) {
                mat.albedoTexture.hasAlpha = true;
            }

            if (override.metallic !== undefined) {
                mat.metallic = override.metallic;
            }

            if (override.roughness !== undefined) {
                mat.roughness = override.roughness;
            }

            if (override.alpha !== undefined) {
                mat.alpha = override.alpha;
            }

            if (override.alphaCutOff !== undefined) {
                mat.alphaCutOff = override.alphaCutOff;
            }

            if (override.clearOpacityTexture) {
                clearPBRMaterialOpacityTexture(mat);
            }

            if (override.backFaceCulling !== undefined) {
                mat.backFaceCulling = override.backFaceCulling;
            }

            if (override.forceIrradianceInFragment !== undefined) {
                mat.forceIrradianceInFragment = override.forceIrradianceInFragment;
            }

            if (override.invertNormalMapX !== undefined) {
                mat.invertNormalMapX = override.invertNormalMapX;
            }

            if (override.invertNormalMapY !== undefined) {
                mat.invertNormalMapY = override.invertNormalMapY;
            }

            if (override.clearCoat) {
                applyPBRClearCoatOverride(mat, override.clearCoat);
            }

            if (override.subSurface) {
                applyPBRSubSurfaceOverride(mat, override.subSurface);
            }

            if (!forceOpaque && override.useAlphaFromAlbedoTexture && mat.albedoTexture) {
                mat.useAlphaFromAlbedoTexture = true;
                mat.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
                mat.needDepthPrePass = true;
            }

            if (!forceOpaque && override.useAdditiveAlpha) {
                mat.alphaMode = Engine.ALPHA_ADD;
                mat.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
                mat.needDepthPrePass = false;
            }

            applyPBRTransparencyModeOverride(mat, override.transparencyMode, forceOpaque);
        }
    }
}

function applyLineArtSiblingAlbedo(
    result: ISceneLoaderAsyncResult,
    overrides: ViewerLineArtAlbedoOverride[]
): void {
    const clonesBySource = new Map<PBRMaterial, Map<BaseTexture, PBRMaterial>>();

    for (const mesh of result.meshes) {
        if (!(mesh.material instanceof MultiMaterial)) continue;

        const subMaterials = mesh.material.subMaterials;
        for (let i = 0; i < subMaterials.length; i++) {
            const material = subMaterials[i];
            if (!(material instanceof PBRMaterial)) continue;
            if (material.albedoTexture || !isLineArtMaterialName(material.name)) continue;

            const sibling = findTexturedSiblingMaterial(subMaterials, i);
            if (!sibling?.albedoTexture) continue;

            const override = findLineArtAlbedoOverride(material.name, sibling.albedoTexture.name, overrides);
            const albedoTexture = override
                ? getLineArtOverrideAlbedoTexture(override.albedoTexturePath)
                : sibling.albedoTexture;
            subMaterials[i] = getLineArtAlbedoClone(material, albedoTexture, clonesBySource);
        }
    }
}

function findTexturedSiblingMaterial(
    subMaterials: (PBRMaterial | null)[],
    materialIndex: number
): PBRMaterial | null {
    return subMaterials.find((subMaterial, index) =>
        index !== materialIndex &&
        subMaterial instanceof PBRMaterial &&
        Boolean(subMaterial.albedoTexture) &&
        !isLineArtMaterialName(subMaterial.name)
    ) ?? null;
}

function findLineArtAlbedoOverride(
    materialName: string,
    siblingAlbedoTextureName: string,
    overrides: ViewerLineArtAlbedoOverride[]
): ViewerLineArtAlbedoOverride | null {
    const normalizedMaterialName = normalizeLineArtAlbedoOverrideName(materialName);
    const siblingFileName = getFileName(siblingAlbedoTextureName.replace(/\\/g, "/"));
    return overrides.find((override) =>
        normalizeLineArtAlbedoOverrideName(override.materialName) === normalizedMaterialName &&
        getFileName(override.siblingAlbedoTexture.replace(/\\/g, "/")) === siblingFileName
    ) ?? null;
}

function getLineArtOverrideAlbedoTexture(path: string): BaseTexture {
    const fileName = getFileName(path);
    const existing = scene.textures.find((texture) =>
        texture.name === fileName ||
        getFileName((texture.url ?? "").replace(/\\/g, "/")) === fileName
    );
    if (existing) return existing;

    const texture = new Texture(assetUrl(path), scene);
    texture.name = fileName;
    texture.gammaSpace = true;
    return texture;
}

function getLineArtAlbedoClone(
    source: PBRMaterial,
    albedoTexture: BaseTexture,
    clonesBySource: Map<PBRMaterial, Map<BaseTexture, PBRMaterial>>
): PBRMaterial {
    let clonesByTexture = clonesBySource.get(source);
    if (!clonesByTexture) {
        clonesByTexture = new Map<BaseTexture, PBRMaterial>();
        clonesBySource.set(source, clonesByTexture);
    }

    const existing = clonesByTexture.get(albedoTexture);
    if (existing) return existing;

    const clone = source.clone(`${source.name}_${textureNameStem(albedoTexture.name)}_Albedo`);
    clone.albedoTexture = albedoTexture;
    clone.albedoColor = new Color3(1, 1, 1);
    clonesByTexture.set(albedoTexture, clone);
    return clone;
}

function isLineArtMaterialName(name: string): boolean {
    return /(^|[^a-z0-9])line[^a-z0-9]*art([^a-z0-9]|$)/i.test(name);
}

function normalizeLineArtAlbedoOverrideName(name: string): string {
    return normalizeMaterialName(name.replace(/_pbr$/i, ""));
}

function textureNameStem(name: string): string {
    return getFileName(name.replace(/\\/g, "/"))
        .replace(/\.[^.]+$/g, "")
        .replace(/[^a-z0-9]+/gi, "_")
        .replace(/^_+|_+$/g, "") || "Texture";
}

function matchesPBRMaterialOverride(pbrMaterialName: string, overrideMaterialName: string): boolean {
    const normalizedPBRName = normalizePBRMaterialOverrideName(pbrMaterialName);
    const normalizedOverrideName = normalizePBRMaterialOverrideName(overrideMaterialName);
    return normalizedPBRName === normalizedOverrideName;
}

function normalizePBRMaterialOverrideName(name: string): string {
    return normalizeMaterialName(name
        .replace(/_pbr$/i, "")
        .replace(/_vertexcolor$/i, "")
    );
}

function clearPBRMaterialOpacityTexture(material: PBRMaterial): void {
    material.opacityTexture?.dispose();
    material.opacityTexture = null;
    material.useAlphaFromAlbedoTexture = false;
}

function applyPBRClearCoatOverride(material: PBRMaterial, override: ViewerPBRClearCoatOverride): void {
    const clearCoat = material.clearCoat;

    if (override.isEnabled !== undefined) {
        clearCoat.isEnabled = override.isEnabled;
    }

    if (override.intensity !== undefined) {
        clearCoat.intensity = override.intensity;
    }

    if (override.roughness !== undefined) {
        clearCoat.roughness = override.roughness;
    }

    if (override.texturePath) {
        clearCoat.texture?.dispose();
        clearCoat.texture = createPBRDataTexture(override.texturePath);
    }

    if (override.textureRoughnessPath) {
        clearCoat.textureRoughness?.dispose();
        clearCoat.textureRoughness = createPBRDataTexture(override.textureRoughnessPath);
        clearCoat.useRoughnessFromMainTexture = false;
    }

    if (override.bumpTexturePath) {
        clearCoat.bumpTexture?.dispose();
        clearCoat.bumpTexture = createPBRDataTexture(override.bumpTexturePath);
        if (override.bumpTextureLevel !== undefined) {
            clearCoat.bumpTexture.level = override.bumpTextureLevel;
        }
    }

    if (override.bumpTextureScale !== undefined && clearCoat.bumpTexture) {
        clearCoat.bumpTexture.uScale = override.bumpTextureScale;
        clearCoat.bumpTexture.vScale = override.bumpTextureScale;
    }
}

function applyPBRSubSurfaceOverride(material: PBRMaterial, override: ViewerPBRSubSurfaceOverride): void {
    const subSurface = material.subSurface;

    if (override.isRefractionEnabled !== undefined) {
        subSurface.isRefractionEnabled = override.isRefractionEnabled;
    }

    if (override.refractionIntensity !== undefined) {
        subSurface.refractionIntensity = override.refractionIntensity;
    }

    if (override.useAlbedoToTintRefraction !== undefined) {
        subSurface.useAlbedoToTintRefraction = override.useAlbedoToTintRefraction;
    }
}

function createPBRDataTexture(path: string): Texture {
    const texture = new Texture(assetUrl(path), scene);
    texture.name = getFileName(path);
    texture.gammaSpace = false;
    return texture;
}

function applyPBRTransparencyModeOverride(
    material: PBRMaterial,
    transparencyMode: ViewerPBRMaterialOverride["transparencyMode"],
    forceOpaque: boolean
): void {
    switch (transparencyMode) {
        case "opaque":
            material.transparencyMode = PBRMaterial.PBRMATERIAL_OPAQUE;
            material.alpha = 1;
            clearPBRMaterialOpacityTexture(material);
            material.needDepthPrePass = false;
            break;
        case "alphaTest":
            if (forceOpaque) return;
            material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHATEST;
            material.needDepthPrePass = false;
            break;
        case "alphaBlend":
            if (forceOpaque) return;
            material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
            material.needDepthPrePass = true;
            break;
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
