# Unsupported FBX features that need targeted models

Date: 2026-05-18

## Purpose

This report lists FBX features that are currently unsupported, partially supported, or diagnostic-only in `babylon-fbx`, with a focus on features where we need a real or purpose-built model before implementing runtime support.

The goal is not just to find any file containing a node name. For most of these features, useful support requires a model where the feature visibly changes the rendered result, plus a reliable reference render or reference export. Otherwise it is too easy to implement a plausible interpretation that passes parsing but is visually wrong.

## Current support baseline

The loader already supports:

- Binary and ASCII FBX parsing, including zlib-compressed binary arrays.
- Scoped legacy FBX 6 static mesh/material import.
- Mesh positions, polygon indices, normals, UV sets, vertex colors, material indices, tangents, binormals, n-gon triangulation, and multiple UV buffers.
- Lambert/Phong-like materials mapped to Babylon `StandardMaterial`.
- Common texture slots, texture UV transforms, named UV set selection, basename/extension fallback, and embedded `Video/Content` textures.
- Model and bone transform properties including pre/post rotation, pivots, offsets, rotation order, geometric transforms, and handled `InheritType = 2` scale compensation.
- Skins, clusters, bind-pose/cluster bind matrices, shared rig resolution, up to eight bone influences, morph targets, `FullWeights`-aware in-between morph target math, model/bone TRS animation, and blend-shape `DeformPercent` animation.
- Basic cameras and lights.
- Diagnostics/metadata preservation for many unsupported features.

## Fixture inventory notes

I scanned the current `tests\models` FBX fixtures: 37 FBX files.

Notable existing evidence:

- `unsupported-curve-node`: 3,218 diagnostics across 10 fixtures. Most are custom rig/control data, but 140 are `Visibility`.
- `TransformAssociateModel`: present in 6 fixtures, with 3,800 `associate-model-present` skin diagnostics.
- `LayerElementVisibility`: present in 5 fixtures.
- `FullWeights`: present in 4 fixtures, though current known problematic cases were single-shape channels with extra weights.
- `LayerElementTangent` and `LayerElementBinormal`: present in 6 fixtures.
- `LayerElementSmoothing`: present in 14 fixtures.
- One fixture has a camera node attribute with many camera properties: `tests\models\hover-bike-the-rocket\TheRocketAnimation.fbx`.
- No current fixture scan found real `LayeredTexture`, non-bind `Pose`, unsupported deformer subtypes, or `Constraint` objects in the fixture set, though synthetic tests cover some diagnostic plumbing.

## Model requirements that apply to every requested fixture

For each feature below, the best model package would include:

1. The source DCC scene if possible: `.blend`, `.ma`, `.mb`, `.max`, etc.
2. The exported `.fbx`.
3. A visual reference: screenshot, turntable, or a reference `.glb`/`.gltf`.
4. A short note explaining what should visibly happen.
5. A deliberately tiny version first: two cubes or a simple armature is usually better than a production character.
6. If animated, a known frame list: "at frame 0 this is hidden; frame 30 it is visible; frame 60 it is hidden again."
7. If materials/textures are involved, include all texture files and label the intended slot usage.

Prefer models that are not baked down to plain geometry/animation. If a DCC bakes the feature away during FBX export, it is no longer useful for implementing the feature.

## Summary table

| Feature | Current loader state | Existing fixture evidence | Model needed before support |
| --- | --- | --- | --- |
| Animated model visibility | Parsed as `unsupportedCurveNodes`; not applied at runtime | 140 visibility curve nodes across current fixtures | Tiny two-mesh animation where visibility toggles and affects final render |
| Static model visibility | `Visibility` is treated as a system property but not mapped to mesh/node visibility | Many files contain static `Visibility` properties | One scene with visible, hidden, and parent-hidden mesh nodes |
| `LayerElementVisibility` | Parsed node tree only; geometry extraction ignores it | 5 fixtures contain it | Mesh with per-polygon hidden faces and a clear reference |
| Animation layer blending | Layers, weight, and blend mode are preserved; runtime does not blend layers | Diagnostic support exists, but no strong fixture from scan | Base plus additive/override layer where final motion differs from either layer alone |
| Layered textures | Scene diagnostic only; no runtime layer blending | No current fixture hit | Material with two or more texture layers, blend modes, alpha masks, and reference render |
| Runtime constraints | Diagnostic only; constraints are not evaluated | No current fixture hit | Parent/point/orient/aim constrained objects where transforms are not baked |
| Non-TRS animated properties | Preserved as unsupported curve nodes except `DeformPercent`; not evaluated | Many unsupported custom curves; visibility curves exist | Separate controlled models for visibility, material alpha/color, camera FOV, light intensity/color |
| Cluster `Additive` / `TotalOne` modes | Diagnostic only; Babylon linear blend skinning path ignores mode semantics | Synthetic test; current production fixtures mostly expose associate matrices | Small skinned mesh where cluster mode changes deformation visibly |
| `TransformAssociateModel` semantics | Matrices are extracted and preserved; not applied to runtime skinning | 6 fixtures, including Last Stronghold-like assets | Small associate-model skin setup with clear before/after deformation expectation |
| Unsupported deformer subtypes | Diagnostic only for non-Skin/Cluster/BlendShape deformers | No current fixture hit | Vertex cache, point cache, lattice/FFD, or other deformer that visibly drives mesh shape |
| Non-bind poses | Diagnostic only for `Pose` subtypes other than `BindPose` | No current fixture hit | File where `RestPose`, `CharacterPose`, or similar should affect import behavior |
| Camera fidelity beyond basics | Basic `FreeCamera`; many camera properties are metadata only | Hover-bike contains many camera properties | Camera scene with target/interest, film offset/roll, ortho, animated FOV/zoom |
| Light fidelity beyond basics | Point/directional/spot, color, intensity, cone angle; decay/range/shadow settings metadata only | No strong light fixture found in scan | Point, spot, and directional lights with attenuation, range, shadows, and reference render |
| PBR/material-extension graphs | Runtime is `StandardMaterial`; richer PBR graphs need viewer overrides or are ignored | Chernovan and other assets need viewer overrides | Metallic/roughness/normal/opacity material authored in FBX, with reference |
| Transparency semantics | Opacity and transparency factor are mapped; exact `TransparentColor`/alpha conventions need fixture gates | `TransparentColor` in 11 fixtures | Simple glass/cutout material with known expected blend/alpha-test behavior |
| Displacement, gloss, reflection semantics | Some slots are loaded or preserved, but not mapped to real displacement/gloss workflows | Material props common in fixtures | Plane/sphere material where each map visibly changes result |
| Smoothing groups and generated normals | Smoothing groups are read but not used to recompute/split normals | 14 fixtures contain `LayerElementSmoothing` | Mesh without explicit normals where smoothing groups alone determine hard/soft edges |
| Edge creases/subdivision | No current runtime support found | No current fixture hit | Subdivision/creased mesh where crease weights affect final silhouette |
| Robust concave n-gon triangulation | Ear clipping exists with fallback diagnostics; complex failures need specific gates | 469 `triangulation-fallback`, 219 `degenerate-polygon` diagnostics | Concave and holed n-gon meshes with reference triangulation |
| Global `UnitScaleFactor` | Extracted, but not consistently applied across geometry, transforms, skinning, and animation | Known fixtures include non-1 unit scales | Same object exported in cm/inches/meters with expected identical Babylon size |
| Legacy FBX 6 skinning/takes | Scoped FBX 6 static mesh/material support only | Tamagotchi covers static FBX 6100 | FBX 6 file with skinning and/or Takes animation |
| Helper/control rigs | Helper/control-set data is diagnostic-only | 24 `unsupported-helper` diagnostics | Rig where helper/control objects drive visible constraints or deformation |

## Detailed model requests

### 1. Animated model visibility

Current state:

- `AnimationCurveNode` entries that are not model/bone TRS or blend-shape `DeformPercent` become `unsupportedCurveNodes`.
- Visibility curves are preserved with target ID, property name, curves, and defaults, but no Babylon `Animation` is created for `isVisible`, `visibility`, or enabled state.
- Static model `Visibility` is currently filtered as a system property and not mapped as first-class runtime visibility.

Existing fixture clues:

- The current scan found 140 unsupported curve nodes targeting `Visibility`.
- Cloud Station has a small number of visibility curves in addition to its handled skeletal animation.
- Aisha has many unsupported curve nodes, but prior review suggested many are rig/control metadata rather than core visible animation.

Ideal fixture:

- `visibility_toggle_minimal.fbx`
- Three objects:
  - `AlwaysVisibleCube`
  - `AnimatedVisibilityCube`
  - `ParentHiddenChildCube`
- `AnimatedVisibilityCube` should be visible at frame 0, hidden at frame 30, visible at frame 60.
- Use step/constant visibility if possible, because visibility should not interpolate as partial alpha unless the DCC really exports it that way.
- Include a second version where the parent null toggles visibility and the mesh child has no curve, to test hierarchy inheritance.

What support should prove:

- Initial static visibility is respected.
- Visibility animation targets the correct Babylon object(s).
- Parent visibility does not permanently overwrite child local visibility.
- The animation group controls visibility when scrubbing/playing, not just at load time.

### 2. `LayerElementVisibility`

Current state:

- `LayerElementVisibility` is present in parsed FBX trees but `extractGeometry` does not consume it.
- This is different from model/node visibility: it can hide individual polygons or layer elements.

Existing fixture clues:

- Found in:
  - `tests\models\mech-drone\Drone.FBX`
  - `tests\models\stylised-sky-player-home-dioroma\b63dcd76ee2d4476baf26f7dc48ea3f5.fbx.fbx`
  - `tests\models\tamagotchi-pet-sailor-moon\lp_01.fbx`
  - `tests\models\the-neko-stop-off-hand-painted-diorama\miniHouse_FBX.FBX`
  - `tests\models\the-noble-craftsman\522c4a354ac04bef977b09b11f785f9b.fbx.fbx`

Ideal fixture:

- A cube or plane grid with one or two hidden faces.
- Export with `LayerElementVisibility` using a clear mapping mode, preferably `ByPolygon`.
- Include a reference screenshot showing the missing face(s).

What support should prove:

- Hidden polygons are excluded from final indices or otherwise not rendered.
- Material indices, control-point indices, skin weights, normals, UVs, and morph target mapping remain aligned after polygon removal.
- Face/vertex counts in the viewer stats pane match expected values.

### 3. Animation layer blending

Current state:

- The interpreter preserves animation stacks, layers, layer weight, normalized weight, and blend mode.
- Runtime animation currently flattens supported curve nodes and does not evaluate layer weights or blend modes.
- Diagnostics exist for `multiple-animation-layers`, `unsupported-layer-blend-mode`, and `partial-layer-weight`.

Ideal fixture:

- One cube or one two-bone armature.
- Layer 1: base transform animation, such as rotate 0 -> 90 degrees.
- Layer 2: additive or override transform animation, such as add 30 degrees or translate upward.
- Use a non-100% layer weight in one version.
- Reference should show final blended result, not just each layer independently.

What support should prove:

- Override, additive, and override-passthrough semantics are handled or intentionally scoped.
- Partial layer weights affect final curves.
- Layers on bones and non-bone model nodes both behave.
- Existing single-layer animation remains unchanged.

### 4. Runtime constraints

Current state:

- `Constraint` objects produce `unsupported-constraint` diagnostics.
- No runtime module evaluates constraints.
- No real current fixture hit was found in the scan.

Useful constraint types to target:

- Parent constraint.
- Point/position constraint.
- Orient/rotation constraint.
- Aim/look-at constraint.
- Scale constraint.

Ideal fixture:

- A driver cube and a constrained cube.
- The constrained cube should not have baked TRS keys that already contain the final result.
- If the DCC exporter always bakes constraints, include the source scene so we can see what the FBX actually preserved.
- For aim constraint, use an arrow/eye object that points at a moving target.

What support should prove:

- Constraint targets are resolved through FBX connections.
- Runtime evaluation order is deterministic.
- Constraint support does not break ordinary parented transforms.
- If we choose not to support runtime constraints, the model helps decide whether importer-time baking is possible.

### 5. Non-TRS animated properties

Current state:

- Runtime supports model/bone T/R/S animation and blend-shape `DeformPercent`.
- Other animated properties are diagnostic-only `unsupportedCurveNodes`.
- The current fixture scan found many unsupported custom rig properties and 140 visibility targets.

Subfeatures that need separate tiny models:

| Property family | Example FBX target | Desired model |
| --- | --- | --- |
| Visibility | `Visibility` on `Model` | Toggle a mesh on/off over time |
| Material alpha | `Opacity`, `TransparencyFactor`, `TransparentColor` | Fade a glass plane or cutout card |
| Material color | `DiffuseColor`, `EmissiveColor`, `SpecularColor` | Animate color visibly |
| Camera | `FieldOfView`, `FocalLength`, `Roll`, `OrthoZoom` | Camera zoom/roll shot with reference |
| Light | `Intensity`, `Color`, cone angle/range | Animated light over simple shaded objects |
| Custom rig controls | Arbitrary user properties driving constraints/SDK | Only useful if they visibly drive deformation or transform through preserved FBX graph data |

What support should prove:

- Curves are targeted to the correct Babylon object and property.
- Constant/linear/cubic interpolation behavior matches current curve sampling rules.
- Animation groups include these tracks and scrub correctly.
- We avoid treating rig-control metadata as runtime animation unless it has an actual evaluated dependency.

### 6. Layered textures

Current state:

- `LayeredTexture` objects produce `unsupported-layered-texture` diagnostics.
- Runtime texture blending/compositing is not implemented.
- Current fixture scan did not find a `LayeredTexture` object.

Ideal fixture:

- One material with a base diffuse texture and a second overlay texture.
- Include at least two blend modes if possible:
  - Normal/alpha blend.
  - Multiply or add.
- Include one layer with UV offset/scale so we can verify per-layer transforms.
- Reference render should make each layer obvious, such as a checker base with a colored decal overlay.

What support should prove:

- FBX texture graph resolution handles `Texture -> LayeredTexture -> Material`.
- Blend mode/order/alpha are interpreted correctly.
- We can decide whether to compose textures on CPU, create a Babylon node/custom material, or degrade gracefully to a dominant layer.

### 7. Cluster modes and `TransformAssociateModel`

Current state:

- Skin cluster `Mode` values `Additive` and `TotalOne` produce `cluster-mode-runtime-unsupported`.
- `TransformAssociateModel` is extracted and preserved but not applied to runtime skinning math.
- Missing `Cluster.Transform` and `TransformLink` have fallback diagnostics; `missing-bind-pose-matrix` is metadata when cluster matrices are present.

Existing fixture clues:

- `TransformAssociateModel` appears in 6 fixtures:
  - `tests\models\etrian-odyssey-3-monk\EOMonk.fbx`
  - `tests\models\holotech-bench\TechTable_Animation.fbx`
  - `tests\models\kuma-heavy-robot-r-9000s\Roboarm_lowpoly.fbx`
  - `tests\models\quirky-series-free-animals-pack\FREE Animals.fbx`
  - `tests\models\the-last-stronghold-animated\Floating_Gate_Chinese1.fbx`
  - `tests\models\truffle-man\Shroom.fbx`

Ideal fixture:

- A very small skinned cylinder or strip.
- Two bones plus an associate model/null that visibly changes deformation when associate semantics are used.
- Include an explicit cluster `Mode` node if possible:
  - One `Normalize` control version.
  - One `Additive` version.
  - One `TotalOne` version.
- Include the source DCC file because this area is exporter-specific.

What support should prove:

- The skin bind formula uses `Transform`, `TransformLink`, and `TransformAssociateModel` correctly.
- Additive/associate behavior changes deformation only for models that request it.
- Aisha, Spider, Bristleback, Phoenix, Cloud Station, and other known-good rigs do not regress.

### 8. Unsupported deformer subtypes and geometry caches

Current state:

- Only `Skin`, `Cluster`, `BlendShape`, and `BlendShapeChannel` deformers are considered supported.
- Other `Deformer` subtypes would produce `unsupported-deformer`.
- Current fixture scan did not find unsupported deformer subtypes.

Feature families to look for:

- Vertex cache / point cache animation.
- Geometry cache deformation.
- Lattice/FFD deformation.
- Other DCC-specific deformer nodes preserved in FBX.

Ideal fixture:

- A plane or cylinder with obvious per-vertex deformation over time, not representable as skeletal animation.
- A reference `.abc`, `.glb`, or rendered turntable if the FBX relies on cache data.
- Include one static frame and one animated version if possible.

What support should prove:

- We can identify whether Babylon should use morph target animation, baked vertex buffers, thin instances, or an unsupported diagnostic.
- Frame/time mapping and memory usage are reasonable.
- Mesh topology remains constant if we choose morph/vertex animation.

### 9. Non-bind poses

Current state:

- `Pose` subtype `BindPose` is used by skinning.
- Other `Pose` subtypes produce `unsupported-pose` diagnostics.
- Current fixture scan did not find non-bind pose subtypes.

Potential subtypes:

- `RestPose`.
- `CharacterPose`.
- DCC-specific pose-library data.

Ideal fixture:

- A rig where the non-bind pose is necessary to get the intended rest or preview pose.
- Include source DCC and a reference render.
- If it is only pose-library metadata and does not affect initial render, note that clearly.

What support should prove:

- We know whether the pose should affect imported rest transforms, animation, or only metadata.
- Bind-pose behavior remains untouched.

### 10. Camera fidelity and animated camera properties

Current state:

- The interpreter extracts basic camera data: FOV, near/far, aspect, projection type, focal length, film size, ortho zoom, and roll.
- Runtime creates a Babylon `FreeCamera`, sets FOV/clip planes, handles basic orthographic bounds, and stores richer camera data in metadata.
- Many camera properties remain unknown/metadata only.

Existing fixture clue:

- `tests\models\hover-bike-the-rocket\TheRocketAnimation.fbx` contains a camera node attribute and many camera properties.

Ideal fixtures:

- Perspective camera with focal length/filmback that must match a reference framing.
- Orthographic camera with `OrthoZoom`.
- Camera with roll/film offset/optical center.
- Camera target/interest setup where orientation depends on target data.
- Animated camera FOV or focal length.

What support should prove:

- Imported Babylon camera matches DCC/reference framing.
- Camera parent transform and local camera settings compose correctly.
- Animated camera properties can be included in animation groups without breaking mesh animation.

### 11. Light fidelity and animated light properties

Current state:

- Runtime creates point, directional, and spot lights.
- Color, intensity, and cone angle are mapped.
- Decay type, decay start, near/far attenuation, and shadow flags are metadata/diagnostic-only.
- Current scan did not find a strong light fixture.

Ideal fixture:

- Three simple lights in one scene: point, spot, directional.
- Include decay/range settings that make a visible difference.
- Include a spot inner/outer cone test on a wall or floor.
- Include one animated intensity/color/cone test.
- Include a reference render.

What support should prove:

- Babylon light range/falloff approximates FBX decay semantics well enough.
- Spot direction follows the FBX model transform.
- Shadow flags are either mapped or intentionally preserved as metadata only.

### 12. PBR/material-extension graphs and transparency

Current state:

- Runtime materials are `StandardMaterial`, not `PBRMaterial`.
- Common Lambert/Phong properties and texture slots are mapped.
- Shininess maps and displacement slots are recognized but not meaningfully mapped to a native StandardMaterial workflow.
- Viewer overrides currently handle some asset-specific PBR/glass cases, such as Chernovan glass translucency.

Existing fixture clues:

- `TransparentColor` appears in 11 fixtures.
- `TransparencyFactor`, `Opacity`, `ReflectionFactor`, and `ShininessExponent` are common.
- Chernovan required viewer-only material/texture overrides for visual parity.

Ideal fixtures:

- A simple metallic/roughness material with base color, normal, metallic, roughness, and AO maps.
- A glass material with alpha, transmission/translucency/refraction expectation, and reference render.
- A cutout material with alpha-test expectation.
- A material using displacement/gloss/reflection maps where the expected degradation is clear.

What support should prove:

- We can decide when to use `StandardMaterial` versus `PBRMaterial`.
- Transparency convention is correct for `Opacity`, `TransparencyFactor`, and `TransparentColor`.
- Unsupported maps produce useful diagnostics rather than silent no-ops.

### 13. Smoothing groups, edge creases, and generated normals

Current state:

- Smoothing groups are read but not used to split/recompute normals.
- Explicit normals are used when present.
- Tangent/binormal layers are extracted and runtime tangents are applied; generated tangents are available when normal-mapped geometry lacks tangent layers.
- Edge crease/subdivision semantics are not implemented.

Existing fixture clues:

- `LayerElementSmoothing`: 14 fixtures.
- `LayerElementTangent` / `LayerElementBinormal`: 6 fixtures.
- Tangent support has synthetic and fixture coverage, but smoothing-group normal reconstruction still needs a targeted model.

Ideal fixtures:

- Mesh with no explicit normals but clear smoothing groups:
  - One hard-edged cube.
  - One smooth cylinder/sphere.
  - One mesh mixing hard and soft edges.
- Mesh with edge crease weights and a reference subdivided result.
- Keep topology tiny so expected normal splits can be asserted numerically.

What support should prove:

- Normals are generated/split according to FBX smoothing data only when explicit normals are absent or intentionally ignored.
- Vertex duplication for hard edges does not break UVs, skin weights, material indices, or morph targets.
- Creases are either supported through a subdivision path or preserved as diagnostics.

### 14. Robust concave n-gon triangulation

Current state:

- The geometry interpreter ear-clips polygons and falls back to fan triangulation when it cannot complete.
- Diagnostics exist for degenerate polygons and triangulation fallback.

Existing fixture clues:

- Current scan found 469 `triangulation-fallback` diagnostics and 219 `degenerate-polygon` diagnostics.
- Existing production assets may contain these cases, but a controlled model is better for proving exact topology.

Ideal fixture:

- A flat concave n-gon shaped like an L or star.
- A non-planar n-gon.
- A polygon with a hole if FBX export can represent it in a way the parser sees.
- Include expected triangle count and reference wireframe.

What support should prove:

- Triangulation avoids overlapping/inverted triangles.
- UVs/normals/colors/material indices follow the triangulated vertices.
- Fallback diagnostics remain only for genuinely unrecoverable geometry.

### 15. Global `UnitScaleFactor`

Current state:

- `UnitScaleFactor` is extracted.
- Morph deltas use it, but scene geometry, transforms, skin bind matrices, camera/lights, and animation are not globally audited for consistent scaling.

Ideal fixture:

- Same simple scene exported at meter, centimeter, and inch unit scales.
- Include:
  - Static mesh of known dimensions.
  - Parented transform at known distance.
  - One skinned bone offset.
  - One morph target delta.
  - One animated translation.
  - Optional camera near/far and light range.

What support should prove:

- All spatial data scales consistently.
- Existing assets with non-1 unit settings do not suddenly change size unless they were previously wrong.
- Bind matrices and animation curves stay in the same coordinate space.

### 16. Legacy FBX 6 skinning and Takes animation

Current state:

- Legacy FBX 6 static mesh/material support is scoped and covered by Tamagotchi.
- FBX 6 skinning and Takes animation remain out of scope until a fixture requires them.

Ideal fixture:

- FBX 6100 or similar legacy binary file with:
  - One skinned mesh.
  - A two-bone animation in the legacy `Takes` format.
  - One material and texture.
- Include source DCC and a modern FBX 7 export of the same scene if possible.

What support should prove:

- Legacy object and connection adaptation works beyond static meshes.
- Takes map to `FBXAnimationStackData` or a clearly scoped compatibility path.
- Existing FBX 7 animation behavior remains unchanged.

### 17. Helper/control rigs and unsupported node attributes

Current state:

- Helper/control-set nodes are diagnostic-only.
- NodeAttribute subtypes other than `Camera` and `Light` produce `unsupported-node-attribute`.
- Many `Null`, `LimbNode`, and `Root` attributes appear in current fixtures, but they often do not require runtime conversion beyond the existing `Model` hierarchy.

Existing fixture clues:

- `unsupported-helper`: 24 diagnostics across 9 fixtures.
- `unsupported-node-attribute`: 2,584 diagnostics, mostly rig/helper metadata.

Ideal fixture:

- Only useful if the helper/control data affects final render.
- Example: a rig control object drives a constrained bone or visibility switch through preserved FBX relationships.
- Include a source scene and a note describing the dependency graph.

What support should prove:

- We can distinguish harmless DCC metadata from runtime-required controls.
- If helpers only serve selection/control UI, they should remain metadata.
- If helpers drive constraints/animation, they should be handled through the constraint/non-TRS animation path rather than a broad "convert every node attribute" path.

## Features that do not currently need "support from scratch" models

These areas already have implementation coverage, though more real-world fixtures can still help harden them:

- Embedded textures: supported via `Video/Content` extraction and Blob URL texture creation.
- Standard model/bone TRS animation: supported.
- Blend-shape `DeformPercent`: supported.
- `FullWeights` in-between morph target math: implemented with synthetic tests; a real multi-shape channel fixture would still be valuable for validation.
- Tangent/binormal layers and generated tangents: supported, though exact MikkTSpace parity can still be improved if a reference demands it.
- `InheritType = 2` scale compensation: implemented with helper bones; keep new cases as regression tests, especially with non-uniform animated parent scale.

## Suggested model-hunting priority

1. Animated visibility plus static visibility.
2. Layered texture material.
3. Animation layer blending.
4. Constraint-driven transform.
5. Associate-model/additive cluster skinning.
6. `LayerElementVisibility`.
7. Light/camera animated properties.
8. PBR/glass/transparency material fixture.
9. Smoothing-group normals.
10. Legacy FBX 6 skinning/Takes.

This order prioritizes features that are clearly diagnostic-only today, likely to affect visible parity, and risky to implement without a controlled reference.
