# FBX Loader — Visual Test Model Plan

Target loader: `Babylon.js/packages/dev/loaders/src/FBX` (productized FBX `ISceneLoaderPluginAsync`).

This document lists the **minimal set of authored FBX models** needed to give the FBX loader full
*visual* (Playwright screenshot) coverage. Models are consolidated: where two features don't visually
interfere, they share one model, and one "canonical" asset is re-exported in several file formats.

There are currently **no `.fbx`-based visual tests** for this loader (only unit tests under
`test/unit/FBX`). These models are what you need to author so visual tests can be added.

---

## Authoring principles (read first)

1. **Small, deterministic, obvious.** Use simple primitives and saturated/asymmetric colors and
   patterns so a regression in any single feature produces an unmistakable pixel difference.
2. **Asymmetric textures/shapes.** Prefer a clear asymmetric mark (e.g. a colored letter "F",
   arrow, or off-center checker). Symmetric content hides flip/rotation/handedness/axis bugs.
3. **Self-contained where possible.** Embed textures (`Video`/`Content`) so a model is one file.
   Keep exactly one model that intentionally uses an **external sidecar** texture to cover path
   resolution.
4. **Pin the frame for time-based features.** Skinning, morphs, and animation must render at a
   **fixed frame/time** (e.g. t = 0.5 s). Author non-identity rest/bind/default poses so the
   *static* render already shows the deformation, and the animated render at the pinned time is
   deterministic.
5. **Keep each model on-screen at a known camera framing.** Most models will be rendered with a
   harness camera/light, except the camera/light model which ships its own.
6. **One feature regression → one visible region.** Lay sub-objects out in a row so you can tell
   which feature broke from the screenshot.

---

## Model list

Legend for "Files": each row may produce multiple `.fbx` files (format/variant re-exports or
animation variants of the same source asset).

### M01 — Canonical cube (format & parser coverage)
- **Files:**
  - `cube_phong.bin74.fbx`   — Binary, FBX 7.4
  - `cube_phong.ascii74.fbx` — ASCII, FBX 7.4
  - `cube_phong.bin75.fbx`   — Binary, FBX 7.5 (64-bit node-header offsets)
  - `cube_phong.fbx6.fbx`    — Binary, FBX 6100 legacy (string object names + `Connect` entries)
  - `cube_phong.zlib.fbx`    — Binary with **zlib-compressed** vertex/index arrays
- **Geometry:** 1×1×1 cube; per-face normals; one UV set (0..1 per face). For the `zlib` variant,
  subdivide enough (a few thousand verts) so the exporter compresses the arrays.
- **Material:** single **Phong** material — mid-gray diffuse, small specular color, moderate
  shininess; one **embedded diffuse texture** showing an asymmetric mark (e.g. colored "F").
- **Covers:** binary 7.4 / 7.5, ASCII 7.4, FBX 6100 legacy object/connection model, zlib array
  decompression; basic mesh build; normals; UVs; Phong material; embedded diffuse texture.
- **Reference image:** all five should render **identically** → one shared reference image.

### M02 — N-gons, triangulation & vertex colors
- **Files:** `geo_ngons.fbx`
- **Geometry:** one flat panel facing the camera, made of several coplanar polygons, each a
  distinct **per-vertex color**:
  - a triangle
  - a convex quad
  - a convex hexagon (6-gon)
  - a **concave** polygon (5-point star or arrow) — exercises ear-clipping
  - one intentionally **degenerate/collinear** polygon — exercises triangulation fallback (should
    drop gracefully, not spike)
  - make one polygon use **vertex alpha < 1**
- **Covers:** convex fan triangulation, concave ear-clipping, >4-vertex n-gons, degenerate-polygon
  fallback, per-vertex colors, vertex alpha.

### M03 — Normal mapping/reference modes (smooth vs flat)
- **Files:** `geo_normals.fbx`
- **Geometry:** two identical spheres side by side. Left = smooth normals authored
  `ByControlPoint`; right = faceted normals authored `ByPolygonVertex`. Neutral Lambert material.
- **Covers:** `ByControlPoint` vs `ByPolygonVertex` mapping, `Direct`/`IndexToDirect` reference
  handling, smooth vs flat shading.

### M04 — Material properties (no textures)
- **Files:** `mat_properties.fbx`
- **Geometry:** a row of 6 spheres on a plane, each with its own material isolating one property:
  1. **Lambert**, pure diffuse (no specular)
  2. **Phong**, strong specular color + **high** shininess (tight highlight)
  3. **Phong**, **low** shininess (broad highlight)
  4. **emissive** color (self-lit look)
  5. **ambient** color contribution
  6. **opacity / transparency** (semi-transparent)
- **Covers:** Lambert vs Phong, diffuse / specular color / shininess / emissive / ambient,
  opacity & transparency factor. Solid colors only → deterministic.

### M05 — All texture slots + tangents + embedded vs external
- **Files:** `mat_textures_all_slots.fbx` (+ sidecar PNGs listed below)
- **Geometry:** a sphere or beveled cube with **authored tangents and binormals**
  (`LayerElementTangent` / `LayerElementBinormal`) and a clean UV set.
- **Material (one material, all slots at once, each effect unmistakable, all embedded):**
  - **Diffuse** (checker/pattern)
  - **Normal / bump** (clear directional relief; author tangents so handedness is testable —
    include a note/variant for a **Y-down** normal map to verify tangent-handedness flip)
  - **Emissive** (a bright shape that glows)
  - **Ambient**
  - **Specular** (specular mask)
  - **Opacity** (alpha cutout pattern → visible holes)
- **Second object** beside it that references an **external sidecar** texture (NOT embedded).
- **Sidecar files to ship:** `slot_external_diffuse.png` (name it whatever the FBX
  `RelativeFilename` points to; keep it next to the `.fbx`).
- **Covers:** diffuse / bump / emissive / ambient / specular / opacity slots; authored
  tangents+binormals; normal-map tangent handedness (Y-up & Y-down); embedded texture decode;
  external sidecar texture path resolution.

### M06 — UV transforms & multiple UV sets
- **Files:** `mat_uv_transform_multiset.fbx`
- **Geometry:** a plane carrying **two UV sets**.
- **Material:** a checker **diffuse** texture with non-identity **UV translation + scaling +
  rotation** (so a clean checker becomes visibly offset, tiled, and rotated); a second texture
  (e.g. emissive) bound to the **second UV set** so it sits differently.
- **Covers:** per-texture UV translation/scaling/rotation, multiple UV sets, `uvSetIndex` routing.

### M07 — Multi-material submeshes + double-sided
- **Files:** `mat_multimaterial_doublesided.fbx`
- **Geometry:** a single mesh whose polygons are split across **3 materials** via
  `LayerElementMaterial` `ByPolygon` (distinct solid colors → 3 submeshes). Include a thin open
  plane angled so its **backface** is in view; assign it a material with **CullingOff**
  (double-sided).
- **Covers:** per-polygon material indices, multi-material submesh splitting, `AllSame` (non-zero)
  material index as a sub-case, backface-culling-off / double-sided rendering.

### M08 — Transform evaluator (full chain)
- **Files:** `xform_chain.fbx`
- **Geometry:** a parent→child→grandchild chain of small, distinctly-colored boxes, each box
  isolating transform features so misplacement is obvious:
  - **parent:** `Lcl Translation` + `Lcl Rotation` + `Lcl Scaling`
  - **childA:** `PreRotation` and `PostRotation`
  - **childB:** `RotationPivot` + `RotationOffset` + `ScalingPivot` + `ScalingOffset` (off-center
    pivot so rotation visibly orbits)
  - **childC:** non-XYZ **`RotationOrder`** (e.g. ZYX) with a rotation that only lands correctly
    under that order
  - **one mesh** with `GeometricTranslation/Rotation/Scaling` **and** a child WITHOUT that offset →
    proves geometric transforms are mesh-only and do **not** propagate to children
- **Covers:** Lcl TRS, pre/post rotation, rotation & scaling pivots/offsets, rotation order,
  geometric (mesh-only) transforms, parent→child transform inheritance.
- **Note:** `InheritType` is parsed but not yet applied at runtime — not worth a dedicated visual
  gate until runtime support lands.

### M09 — Skinning (skeleton + clusters + bind pose)
- **Files:** `skin_bend.fbx`  *(reused by M12)*
- **Geometry:** a tall subdivided box or cylinder skinned to a **3-bone** vertical chain. Author a
  non-identity **bind/rest** so the static frame already shows a clear bend (e.g. top bone rotated
  ~45°). Smooth weights across each joint; at least one vertex blended between two bones. Add a
  small region weighted to **>4 bones (5–6 influences)** to exercise the extra-influence buffers.
- **Covers:** skeleton + bone hierarchy, skin clusters, vertex weights, bind-pose / `TransformLink`,
  >4 (up to 8) influences per vertex.

### M10 — Morph targets with in-betweens
- **Files:** `morph_inbetween.fbx`  *(reused by M13)*
- **Geometry:** a flat grid plane (or simple face mesh) with **one blend-shape channel** that has
  **two in-between shapes** with `FullWeights` (e.g. 50 and 100): at 50 % it bulges partway, at
  100 % fully. Author **morphed normals** so shading updates. Set the channel `DeformPercent` so the
  static render shows a partial/in-between deformation.
- **Covers:** morph targets, blend-shape channels, in-between shapes / `FullWeights` selection,
  morphed normals, default `DeformPercent`.

### M11 — Node animation (interpolation types)
- **Files:** `anim_node_trs.fbx`
- **Geometry:** three small boxes, each animated on one channel with a different interpolation:
  - **box1:** Translation, **constant/stepped** keys
  - **box2:** Rotation, **linear** keys
  - **box3:** Scale, **cubic** keys (non-zero tangents)
  - *(optional)* **box4:** a densely **sampled/baked** curve to exercise sampled-curve detection
- **Render at a pinned time** (e.g. t = 0.5 s) where the three poses are distinct and deterministic.
- **Covers:** node T/R/S animation, constant / linear / cubic interpolation, sampled/baked-curve
  handling, animation-stack/timeline import.

### M12 — Skeletal animation
- **Files:** `anim_skeletal.fbx`  *(may be the SAME file as M09 with a Take/AnimationStack added)*
- **Content:** M09's skinned mesh + skeleton, plus a bone-animation clip that bends the chain over
  time. Render mid-clip.
- **Covers:** bone animation driving skin deformation.

### M13 — Morph (DeformPercent) animation
- **Files:** `anim_morph.fbx`  *(may be the SAME file as M10 with a clip added)*
- **Content:** M10's morph mesh with `DeformPercent` animated 0→100. Render mid-clip.
- **Covers:** blend-shape `DeformPercent` animation.

### M14 — Multiple animation clips
- **Files:** `anim_multiclip.fbx`
- **Content:** one box with **two animation stacks** (e.g. "Spin" and "Bounce").
- **Covers:** multiple animation stacks/clips import and clip selection.

### M15 — Cameras & lights
- **Files:** `scene_lights_perspcam.fbx`  and  `scene_orthocam.fbx`
  *(keep cameras in separate files if mixing two cameras in one scene is awkward for the harness)*
- **Content:** a neutral set (ground plane + sphere + backdrop wall) lit by **three lights** with
  distinct colors so each is identifiable:
  - **red Point** light
  - **green Directional** light
  - **blue Spot** light (cone footprint visible on the ground; set a cone angle)
  Plus an embedded **perspective** camera framing the scene. `scene_orthocam.fbx` carries an
  **orthographic** camera (set `orthoZoom`/aspect) over the same set.
- **Covers:** point / directional / spot lights (color, intensity, cone angle), perspective camera
  (FOV, near/far, aspect), orthographic camera projection.

### M16 — Global axis & unit settings
- **Files:** (same asymmetric source mesh exported three ways)
  - `global_yup_1unit.fbx` — **Y-up**, `UnitScaleFactor` = 1.0 (baseline)
  - `global_zup.fbx`       — **Z-up**, same mesh → must render in the **same orientation** as Y-up
  - `global_units_254.fbx` — `UnitScaleFactor` = 2.54 (inch→cm) → must render at the **same size**
    as the 1.0 baseline after unit handling
- **Geometry:** an orientation-revealing asymmetric mesh (3D letter "F" or an arrow with a colored
  base) so axis/handedness errors are obvious.
- **Covers:** up-axis conversion (Y-up vs Z-up), handedness/coordinate conversion, `UnitScaleFactor`.

---

## Feature → model coverage matrix

| Loader feature | Covered by |
| --- | --- |
| Binary FBX 7.4 / 7.5 (64-bit headers) | M01 |
| ASCII FBX 7.4 | M01 |
| FBX 6100 legacy objects / `Connect` | M01 |
| zlib-compressed arrays | M01 |
| Basic mesh / normals / UVs | M01, M03 |
| Fan triangulation (convex) | M02 |
| Concave ear-clipping | M02 |
| >4-gon polygons | M02 |
| Degenerate-polygon fallback | M02 |
| Vertex colors + vertex alpha | M02 |
| Normal mapping modes (ByControlPoint / ByPolygonVertex) | M03 |
| Lambert vs Phong | M04, M01 |
| Diffuse/specular/shininess/emissive/ambient | M04 |
| Opacity / transparency | M04, M05 (opacity map) |
| Diffuse texture | M01, M05, M06 |
| Normal/bump texture + tangents/binormals + handedness | M05 |
| Emissive / ambient / specular / opacity textures | M05 |
| Embedded textures (`Video/Content`) | M01, M05 |
| External sidecar texture path resolution | M05 |
| UV translation/scaling/rotation | M06 |
| Multiple UV sets / uvSetIndex | M06 |
| Multi-material submeshes (`ByPolygon`) | M07 |
| `AllSame` non-zero material index | M07 |
| Backface-culling-off / double-sided | M07 |
| Lcl T/R/S | M08 |
| Pre/Post rotation | M08 |
| Rotation/Scaling pivots & offsets | M08 |
| Rotation order (non-XYZ) | M08 |
| Geometric (mesh-only) transforms | M08 |
| Parent→child inheritance | M08 |
| Skeleton + clusters + weights + bind pose | M09 |
| >4 (up to 8) bone influences | M09 |
| Morph targets + in-betweens (`FullWeights`) | M10 |
| Morphed normals | M10 |
| Node T/R/S animation (constant/linear/cubic) | M11 |
| Sampled/baked-curve detection | M11 |
| Skeletal animation | M12 |
| Morph `DeformPercent` animation | M13 |
| Multiple animation stacks/clips | M14 |
| Point / Directional / Spot lights | M15 |
| Perspective camera | M15 |
| Orthographic camera | M15 |
| Up-axis (Y/Z) + handedness conversion | M16 |
| `UnitScaleFactor` | M16 |

---

## Authoring effort summary

- **16 logical models**, but several reuse one source asset:
  - M01 is **one** authored cube exported as **5 files**.
  - M12/M13 can be the **same files** as M09/M10 with an animation clip added.
  - M16 is **one** source mesh exported **3 ways**.
- Net new authored *source scenes*: ~**13**; total *files* on disk: ~**22** (plus a few PNG
  sidecars for M05).

## Suggested minimal first wave (if you want to start small)

If you want to bootstrap coverage fast, author these 6 first — they cover the highest-risk paths:
`cube_phong.bin74.fbx` (M01), `geo_ngons.fbx` (M02), `mat_textures_all_slots.fbx` (M05),
`xform_chain.fbx` (M08), `skin_bend.fbx` (M09), `morph_inbetween.fbx` (M10).

---

## Not visually testable (skip for visual gates)

These are parsed but not applied at runtime, or are diagnostics-only — cover them with **unit
tests**, not visual models: `InheritType`/segment-scale compensation, `TransformAssociateModel`,
animation **layer blending**, animated non-TRS properties (visibility, camera focal length, light
animation, custom attributes), `LayeredTexture`, `LayerElementVisibility`, smoothing-group normal
recomputation, edge creases.
