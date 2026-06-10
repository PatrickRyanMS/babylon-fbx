// Single source of truth for per-model view config, shared by render.mjs (Babylon FBX loader) and
// render-maya.mjs (fbx2gltf/SDK proxy) so the two never drift apart.
//   alpha/beta : ArcRotate framing (radians) when the default camera is used
//   seek       : 0..1 position within an animation clip (default 0.5)
//   useFbxCamera : render through the file's own FBX camera instead of the default rig
const PI = Math.PI;

export const VIEW_CONFIG = {
    "m01_cube_phong.fbx": { alpha: -PI / 4, beta: PI / 3 },
    "m02_geo_ngons.fbx": { alpha: PI / 2, beta: PI / 2 },
    "m03_normals.fbx": { alpha: -PI / 2.3, beta: PI / 2.4 },
    "m04_material_properties.fbx": { alpha: -PI / 2, beta: PI / 2.2 },
    "m05_textures.fbx": { alpha: PI / 2, beta: PI / 2 },
    "m06_uv_transform.fbx": { alpha: PI / 2, beta: PI / 2 },
    "m07_multimaterial.fbx": { alpha: -PI / 3.2, beta: PI / 3 },
    "m08_transforms.fbx": { alpha: -PI / 2.3, beta: PI / 2.3 },
    "m09_skinning.fbx": { alpha: -PI / 2, beta: PI / 2 },
    "m10_morph.fbx": { alpha: -PI / 3, beta: PI / 3.4 },
    "m11_node_anim.fbx": { alpha: -PI / 2.4, beta: PI / 2.3, seek: 40 / 60 },
    // NOTE: fbx2gltf drops FBX skeletal (joint) animation, so render-maya.mjs shows m12 at the rest
    // pose (straight). The Babylon loader render (render.mjs) animates it correctly (bent) — that is
    // the authoritative animated render; real Maya also shows the bend when scrubbed.
    "m12_skeletal_anim.fbx": { alpha: -PI / 2, beta: PI / 2 },
    "m13_morph_anim.fbx": { alpha: -PI / 3, beta: PI / 3.4 },
    "m14_multiclip.fbx": { alpha: -PI / 3, beta: PI / 3 },
    "m15_camera_lights.fbx": { alpha: -PI / 3, beta: PI / 2.6, useFbxCamera: true },
    "m16_axis_yup.fbx": { alpha: -PI / 4, beta: PI / 3 },
    "m16_axis_zup.fbx": { alpha: -PI / 4, beta: PI / 3 },
    "m16_units_254.fbx": { alpha: -PI / 4, beta: PI / 3 },
};

export const DEFAULT_VIEW = { alpha: -PI / 4, beta: PI / 3 };
