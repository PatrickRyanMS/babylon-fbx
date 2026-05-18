# Agent context handoff - babylon-fbx

Last updated: 2026-05-18

## Purpose

This file is a compact context jumpstart for future Copilot/agent sessions after crashes or failed restores. It captures the high-level project intent, architecture, hard-won implementation lessons, current known risks, and the development workflow.

Maintenance rule: update this handoff whenever there is major new progress, a major debugging finding, a significant decision, or a new known-good/known-bad project state. The goal is to make crash/restore recovery fast without needing to reconstruct context from chat history.

## What we are building

`babylon-fbx` is a pure TypeScript FBX importer plugin for Babylon.js. The goal is to load binary and ASCII `.fbx` assets without Autodesk's FBX SDK and produce useful Babylon scene objects: meshes, materials, textures, skeletons, morph targets, animation groups, cameras, lights, metadata, and diagnostics.

The package entry point exports the Babylon loader plus parser/interpreter primitives:

- `FBXFileLoader` for Babylon `SceneLoader` integration.
- `parseBinaryFBX` and `parseAsciiFBX` for raw FBX parsing.
- `interpretFBX` for converting the parsed node tree into FBX scene data.

## Architecture

The codebase has three main layers:

1. Parser layer: `src\parsers\`
   - Converts binary or ASCII FBX into a shared `FBXDocument` tree.
   - Must stay Babylon-independent.
   - Binary FBX starts with `Kaydara FBX Binary`; ASCII starts with `; FBX`.
   - FBX 7.5+ binary files use 64-bit node header fields.
   - Binary compressed numeric arrays are inflated by the internal `src\parsers\zlibInflate.ts`; there is no `pako` dependency.

2. Interpreter layer: `src\interpreter\`
   - Resolves `Objects` plus `Connections` into a semantic scene.
   - Extracts geometry, materials, textures, property templates, rigs, skins, blend shapes, animation stacks/layers/curves, cameras, lights, global settings, and diagnostics.
   - Output is `FBXSceneData`, still mostly Babylon-independent.

3. Babylon runtime layer: `src\fbxFileLoader.ts`
   - Implements Babylon's `ISceneLoaderPluginAsync`.
   - Parses input, calls `interpretFBX`, then builds Babylon meshes/materials/skeletons/morph targets/animation groups/cameras/lights.
   - This is where Babylon-specific coordinate conversion, vertex buffers, `StandardMaterial`, `Skeleton`, `Bone`, `MorphTargetManager`, and `AnimationGroup` behavior lives.

The viewer in `viewer\main.ts` is a Vite/Babylon inspection harness, not loader runtime logic. It loads fixtures from `tests\models\`, registers the custom loader, provides model overrides for visual debugging, and compares some FBX fixtures to GLB references.

## Major implementation learnings

### FBX graph shape

FBX uses a flat object table plus a connection graph. `OO` means object-to-object and `OP` means object-to-property, such as a texture connected to a material's `DiffuseColor`. Avoid assuming parent/child relationships from physical node nesting once inside the `Objects` section.

Legacy FBX 6 files can use string names and `Connect` records instead of numeric FBX 7-style object IDs. The connection resolver synthesizes IDs and creates synthetic geometry for the scoped static-mesh FBX 6 path. Do not remove this as dead-looking compatibility code; it is covered by Tamagotchi fixture tests.

### Geometry

`PolygonVertexIndex` uses FBX's negative-index-minus-one convention: a negative value marks polygon end and the actual control point index is `-(idx + 1)`.

FBX layer elements need both mapping mode and reference mode handling. Normals, UVs, colors, tangents, binormals, and material indices may be mapped by polygon vertex, by control point, or all-same, and may be direct or index-to-direct. Keep diagnostics for malformed layer data rather than silently accepting bad indices.

The geometry layer expands control points into polygon vertices. `controlPointIndices` must be preserved because skinning weights are keyed by original control point, not by expanded Babylon vertex.

Geometric transforms are mesh-only transforms; they affect geometry data but not child nodes. Current loader behavior follows Blender-style composition for geometry transforms and separately transforms positions, deltas, normals, and tangents.

### Coordinate systems and scene roots

The loader creates an artificial `__fbx_root__` for Babylon handedness conversion in left-handed scenes, matching the glTF-loader style conversion. If FBX `GlobalSettings` declare a non-Y-up source basis, a child `__fbx_axis_conversion__` root is added under `__fbx_root__`.

Do not fold the artificial root conversion into skinned mesh pose space. Skinned mesh pose matrices should cancel only the real FBX mesh transform/bind pose; the conversion root remains a scene-level transform applied once at render time.

Y-up files should get identity axis conversion. Z-up and other non-default files need the dedicated axis-conversion root. This fixed Vino and Last Stronghold orientation issues.

### Materials and textures

The runtime currently maps FBX Lambert/Phong-ish material data to Babylon `StandardMaterial`, not PBR material. Common texture slots are routed to diffuse, bump, emissive, ambient, specular, opacity, and reflection slots. Unsupported or richer material graph concepts should generally be preserved as diagnostics/metadata until fixture-gated.

Normal-map texture slots (`NormalMap`, `NormalMapTexture`, `normalCamera`) are treated as tangent-space normal maps: `gammaSpace = false`, with Babylon normal-map inversion based on scene handedness. `Bump` and `BumpFactor` are deliberately not forced through the same normal-map data/inversion setup because they are often grayscale height/bump maps.

Texture loading supports embedded `Video/Content` blobs and external texture fallback by basename/common extension. Viewer-only texture overrides should not be promoted into loader runtime behavior unless they represent general FBX semantics.

### Tangents and normal maps

If FBX supplies tangents, transform tangent XYZ with the geometric normal matrix and mirror tangent handedness for left-handed conversion. If tangents are absent but normals and UVs exist, the loader generates tangent data.

With explicit tangents, Babylon shaders build TBN using `tangent.w`; do not try to paper over tangent-space issues only with `invertNormalMapX/Y`.

The Holotech Bench investigation found two separate issues: loader tangent/normal-map handling and viewer-only ORM roughness packing. The ORM color-space fix belongs in the viewer, not the loader.

### Skinning and rigs

The project moved from one Babylon skeleton per FBX skin to resolved deformation rigs. `src\interpreter\rig.ts` groups skins by deformation rig, keeps a union of cluster targets plus required ancestors, and remaps each skin's cluster indices into shared rig bone indices.

Important skinning invariants:

- `Cluster.TransformLink` is the strongest bind-world source for cluster bones.
- Model `BindPose` matrices are useful fallback/bind data, especially for skinned mesh transforms.
- Preserve source bone order where possible; reordering broke Spider-like assets.
- Skin weights are remapped from skin-local cluster indices to resolved rig bone indices at vertex buffer build time.
- More than four bone influences use Babylon's extra skinning buffers up to eight influences.
- Missing rig bone mappings should throw, not silently assign a bogus index.

Babylon-specific critical lesson: bind matrices and animation-local matrices are not the same thing. For ordinary rigs, create bones with authored local/rest matrices, then set bind data with `bone.updateMatrix(localBind, false, false)` and `_updateAbsoluteBindMatrices(undefined, false)` so animation locals are not overwritten by bind matrices.

For severe authored-local versus bind-local scale disagreement, the loader can switch a rig to bind-rest mode. The current threshold is a max scale ratio of `10`; only threshold cluster bones are marked for animation remapping into bind-rest space.

FBX `InheritType = 2` (`Rrs`, no parent scale inheritance) is handled with synthetic Babylon helper bones named `__fbx_scaleCompensation`. For each compensated source bone, the helper is inserted parent-before-child, carries the source local translation plus inverse immediate-parent scale, and has `_index = -1` so shader skinning indices continue to target the real source bone. The real source bone keeps raw rotation/scale with local translation removed. Source-bone lookups must use the loader's source-bone map rather than assuming `skeleton.bones[sourceIndex]`, because helpers are present in the Babylon bone array.

The Cloud Station debugging report `reports\20260518_inherit_type_2_helper_compensation.md` captures the root cause, implementation details, validation, and future cautions for this helper-bone architecture.

### Animation

FBX time uses `46186158000` ticks per second. Animation extraction preserves stacks, layers, curve nodes, curves, key interpolation, and key metadata. Runtime currently evaluates model/bone TRS and blend-shape `DeformPercent`; many non-TRS animated properties are diagnostic-only.

Animation should stay sparse: animate bones/models that have direct curve targets. A previous all-rig-bones bake caused visual regressions. The exception is `InheritType = 2` helper compensation: sample only compensated bones and their ancestors, put translation/inverse-parent-scale keys on the helper, and put raw rotation/scale keys on the source bone; do not rebake unaffected sibling subtrees.

Some DCC exporters emit dense baked curves named `FbxMayaSample Curve`. Treat these as sampled linear data even when FBX key flags contain cubic-looking metadata; this matches Cloud Station's GLB reference samplers and prevents false Hermite easing/overshoot on baked keys. The interpreter also detects Blender-style frame-baked curves without relying on Maya naming: keys must be dense, uniformly spaced near a common frame cadence, and lack meaningful cubic tangent deviation. True sparse cubic curves, such as the Bristleback regression, and dense authored curves with meaningful tangents still use preserved key tangent metadata.

Blend shape in-between targets use `FullWeights`. The interpreter sorts/preserves shape targets by full weight, and the loader maps `DeformPercent` to multiple morph target influences where possible.

### Diagnostics-first approach

When a feature is not confidently implemented, prefer preserving it as diagnostics/metadata over silently dropping it or adding speculative runtime behavior. Current diagnostic-first areas include constraints, helper/control-set data, non-bind poses, unsupported deformer subtypes, layered textures, unsupported animation layer blending, unsupported curve nodes, and non-default transform inheritance modes other than handled `InheritType = 2`.

This project has repeatedly benefited from adding fixture inventory and regression tests before changing runtime behavior.

### Viewer-only learnings

`viewer\main.ts` contains visual-debug overrides for specific fixtures. These are presentation/reference-match fixes, not necessarily loader behavior.

Known viewer-specific lessons:

- Some Sketchfab-style black duplicate outline shells are intentional outline geometry and should use `backFaceCulling = true`, not be hidden.
- Viewer ORM packing must treat roughness/metallic/AO as data textures and avoid browser color-space conversion.
- Manual texture/material overrides are acceptable in the viewer when source FBX files omit connections or have asset-specific authoring quirks.

## Known open or fragile areas

Behemot Cat remains the major known visual defect. One placement issue for `Flame_Outer` was fixed by using the mesh model's FBX `BindPose` matrix, but the cat still appears deformed/exploded. Treat this as a skinning/bind-space issue, not a scene-axis or material issue. See `reports\20260516_behemot_visual_bug.md`.

Other runtime areas that should stay fixture-gated:

- `TransformAssociateModel` semantics for skin clusters, especially Last Stronghold-like assets.
- Non-default FBX `InheritType` / segment-scale compensation beyond handled `InheritType = 2`; `InheritType = 0` remains diagnostic-only.
- `InheritType = 2` with bind-rest remapping remains intentionally conservative: inherited-scale animation compensation is skipped for rigs that also trip `_bindRestBones` until a fixture proves the combined semantics.
- Runtime constraints.
- Runtime non-TRS animation for visibility, cameras, lights, and custom properties.
- Layered textures and richer PBR/material-extension graphs.
- Global `UnitScaleFactor` application across positions, transforms, morph deltas, and animation; do not change this globally without an audit.
- More exact MikkTSpace parity for generated tangents if GLB comparisons demand it.

## Tests and validation

Common commands:

```bash
npm test
npm run typecheck
npm run viewer
npx vitest run tests/parsers/binaryParser.test.ts
npx vitest -t "should parse the version"
```

Important test areas:

- Parser tests in `tests\parsers\`.
- Interpreter tests in `tests\interpreter\`.
- Babylon runtime tests in `tests\fbxFileLoader.test.ts`.
- Fixture inventory and regression snapshot helpers in `tests\helpers\`.

When changing parser/interpreter/runtime behavior, add fixture-driven coverage where possible. For visual issues, use the viewer and then encode the root cause in a numeric or structural regression test when feasible.

## Current working context on 2026-05-18

The user is intentionally cleaning up model assets before committing. Do not treat a dirty worktree with deleted/untracked files under `tests\models\` as corruption, and do not restore or revert those files unless explicitly asked.

At the time this handoff was written, the visible worktree state included many deleted files under `tests\models\fiat-500-x-outlaw\`, a modified `viewer\main.ts`, and multiple untracked model directories/archives under `tests\models\`. Preserve user cleanup work.

Cloud Station context: `tests\models\cloud-station\` has an FBX plus GLB reference. The initial FBX mismatch was mostly skeletal scale/placement for fish/windsock rigs rather than missing textures. Inventory showed 45 `InheritType = 2` `LimbNode` bones and all had animated T/R/S curves, so the fix needed sampled animation compensation, not only rest-pose adjustment. Mostly metadata-only unsupported curves remain (`lockInfluenceWeights`) plus a few `Visibility` curves.

Rubber-duck review of the Cloud Station `InheritType = 2` fix found no blocker for the uniform-scale case, but flagged broad rig rebaking and weak tests as regression risks. The implementation was hardened so only `InheritType = 2` bones are compensated, ancestors are sampled only for computing those keys, unaffected siblings keep the existing animation path, and tests cover rotated parents, nested ancestor scale, child-owned scale, animation compensation, and sibling behavior.

Follow-up Cloud Station eye-white issue: the GLB uses explicit `*_scaleCompensation` helper bones around the fish eye/body joints, while the FBX has non-uniform scaled `InheritType = 2` bones. A decompose/recompose parent-scale strip was too approximate for the eye disks; the loader now removes only the immediate parent local scale by composing no-scale local matrices directly, which better matches the GLB helper-bone structure.

Earlier visual check showed the Cloud Station back fish still had sunken eyes under the first `InheritType = 2` attempt. Verified fixture facts: Cloud Station has 45 `InheritType = 2` models across three fish rigs and the windsock, 4 resolved rigs, 16 skins, no `TransformAssociateModel` clusters, and unsupported animation curves are only 49 `lockInfluenceWeights` plus 5 `Visibility` curves.

Rubber-duck critique and follow-up verification: the `_bindRestBones` skip path is a real code risk but not the Cloud Station cause because all four Cloud Station rigs currently report zero bind-rest bones. The stronger suspect for sunken eyes is still incorrect `InheritType = 2` / segment-scale-compensation math under rotated non-uniform scaled parents. Next useful steps are to dump/compare fish eye bind-chain matrices against `Cluster.TransformLink` and the GLB `*_scaleCompensation` helper bones, add numeric rest-pose tests for rotated non-uniform parents with full component-wise child positions, and investigate preserving cubic curve behavior or adaptive oversampling for matrix-baked bone animations.

Cloud Station fix update: comparing FBX fish bones to GLB `*_scaleCompensation` helper nodes showed the helper keeps the child translation authored and applies only inverse parent scale to the child basis. The loader now preserves `InheritType = 2` child translations while compensating local scale/rotation basis, compares bind-rest thresholds against raw authored Lcl matrices, and samples animated parent scale for compensated bones. This made the FBX eye locals match the GLB helper-node composition for fish body/eye chains.

Root cause update for the Cloud Station tail pop: the GLB reference samplers are linear, and the FBX fish curves are dense baked `FbxMayaSample Curve` data. The interpreter now marks those curves as sampled and linearly evaluates them instead of treating cubic-looking key flags as Hermite curves. This replaced the earlier mid-frame oversampling workaround. The remaining pop came from collapsing the GLB-style `*_scaleCompensation` helper-bone structure into a single compensated bone local matrix and decomposing it to TRS. The loader now creates synthetic `__fbx_scaleCompensation` helper bones, so Cloud Station's `EVSB_FISH1:body_02_JNT` is parented under `EVSB_FISH1:body_02_JNT__fbx_scaleCompensation`; the helper carries compensation while the source bone receives raw rotation keys.

Post-fix user validation: the user checked through most animated meshes and did not see regressions. The measured Cloud Station middle-fish `EVSB_FISH1:body_02_JNT` local rotation delta dropped from the previous multi-degree pop to approximately `0.016` degrees per sampled step, with no absolute jump detected in that check.

Root cause update for the Cloud Station shiny/wiggly fish bands: the artifact is lighting/material response, not generated tangents or malformed normals. Toggling the fish material unlit removes the bands, and the GLB reference uses `KHR_materials_unlit` for the fish. Runtime Lambert materials now use diffuse-only `StandardMaterial` specular black, the viewer maps zero-specular StandardMaterials to roughness 1 during PBR conversion, and Cloud Station fish viewer overrides set the three fish PBR materials to `unlit` for GLB visual parity.

## Useful existing reports

- `README.md` - current public architecture, supported features, commands, and workflow.
- `FBX_LOADER_TANGENT_NORMAL_REVIEW.md` - tangent, normal-map, roughness, and bind-rest review.
- `reports\20260516_progress_report.md` - Blender-parity implementation pass and visual fixes.
- `reports\20260516_135207_fbx_feature_support_audit.md` - support gaps and asset-specific hypotheses.
- `reports\20260516_behemot_visual_bug.md` - current Behemot debugging path.
- `reports\20260515_224503_fbx_rig_import_changelog.md` - rig resolver, skinning, bind-pose, and animation process notes.
- `reports\20260518_inherit_type_2_helper_compensation.md` - Cloud Station `InheritType = 2` helper-bone root cause, implementation, and validation notes.
