# Blender FBX parity implementation plan

## Goal

Close the known capability gaps between this Babylon.js FBX loader and Blender's FBX importer while preserving the current known-good gates: Aisha, Spider, Bristleback, Phoenix, Spartan, Globophobia, Mannequin, Tamagotchi, Behemot Cat, Last Stronghold, and Vino.

This is not a plan to copy Blender's architecture. Blender uses an intermediate helper hierarchy and Blender-specific object types. The goal is to match the relevant FBX semantics in this loader's parser/interpreter/loader architecture.

## Planning notes from Rubber Duck review

The Rubber Duck critique changed the plan in four important ways:

1. Move transform inheritance work before bind/associate-model runtime changes. Skinning and animation depend on correct world/local transform evaluation.
2. Split parser/object compatibility into smaller phases. Property templates, connection graph behavior, and diagnostics should not land as one large behavioral change.
3. Make diagnostics concrete before changing behavior. Each phase needs numeric invariants and fixture gates, not only visual checks.
4. Treat high-risk changes as additive first. Parse/expose new data before consuming it, and use feature flags or narrow gates for behavior changes where possible.

## Cross-cutting rules

1. Keep the parser layer Babylon-independent.
2. Preserve the current bind/rest invariant unless a gated fixture proves it must change: rest locals come from FBX model transforms, bind data comes from cluster/bind-pose matrices, and animation drives local model transforms.
3. Do not fold the Babylon handedness-conversion root into skin bind or pose matrices.
4. Prefer data-only extraction before runtime behavior changes.
5. Pair every fixture-level visual gate with at least one minimal synthetic test that isolates the feature.
6. Define rollback criteria before each behavior-changing phase: if known-good gates regress and the phase cannot explain/fix the regression directly, back out the behavior change and keep only additive diagnostics.

## Phase -1: Fixture and unsupported-feature inventory

Purpose: ground Blender-parity work in actual project assets and avoid speculative implementation.

Tasks:
1. Add an inventory script/test helper that walks parsed FBX documents and records object types, node names, property names, connection types, deformer types, material/texture slots, layer element types, animation targets, and node attributes.
2. Generate per-fixture summaries for current model fixtures.
3. Identify parsed-but-ignored data for each fixture.
4. Classify each ignored feature as:
   - present and visually likely relevant,
   - present but not currently visible,
   - not present in current fixtures,
   - Blender-supported but out of scope until a fixture requires it.

Exit criteria:
1. The report identifies which fixtures exercise each Blender gap.
2. The implementation phases below can be prioritized from real fixture evidence.

## Phase 0: Regression harness and Blender parity diagnostics

Purpose: create gates strong enough to catch silent behavior changes.

Tasks:
1. Capture current-loader golden data for each key fixture:
   - mesh count,
   - material count,
   - skeleton count,
   - animation group count,
   - vertex/index counts by mesh,
   - world-space bounding boxes for selected meshes,
   - bone counts and parent relationships,
   - sampled animation transforms at fixed times,
   - morph target counts and key weights,
   - visible/hidden state when available.
2. Add focused synthetic fixtures or in-memory documents for:
   - property template fallback,
   - FBX 6 string `Connect`,
   - concave n-gon triangulation,
   - smoothing-group normal splits,
   - `LayerElementVisibility`,
   - `InheritType`,
   - `TransformAssociateModel`,
   - animation layer blending,
   - in-between blend shapes.
3. Where feasible, capture Blender reference values for isolated features:
   - triangulated face counts,
   - mesh bounding boxes,
   - transform matrices,
   - material texture assignments,
   - camera/light properties.
4. Add diagnostics for unsupported data rather than silent fallback where the current code cannot yet consume it.

Exit criteria:
1. `npm test` includes focused regression coverage for current supported behavior and known missing behavior.
2. Each later phase has a gate that proves the exact feature, not just a broad visual proxy.

## Phase 1: Property templates and defaults, additive first

Purpose: match Blender's template-aware property fallback without causing broad silent behavior changes.

Tasks:
1. Parse `Definitions/ObjectType/PropertyTemplate/Properties70` into an interpreter-level template map.
2. Expose a helper for resolving object-local property first, template property second, explicit default last.
3. Add diagnostics showing property values that would change if template fallback were enabled.
4. Flip consumers one object category at a time:
   - Model transforms,
   - Material properties,
   - Texture/video properties,
   - NodeAttribute properties for cameras/lights,
   - Animation curve node defaults.
5. Add tests for missing object-local properties that are supplied by templates.

Risks:
1. Template fallback can change many defaults at once.
2. Material/camera/light changes may look unrelated to parser work.

Exit criteria:
1. Template extraction is tested independently.
2. Each consumer category can be enabled without regressing known-good gates.

## Phase 2: Scene graph, connections, and node-attribute compatibility

Purpose: broaden Blender-style scene graph handling while isolating connection graph risk.

Tasks:
1. Refactor connection resolution to track object table entries, connection table entries, and unsupported link diagnostics separately.
2. Preserve current FBX 7 numeric `C` behavior and scoped FBX 6 string `Connect` behavior.
3. Expand node-attribute attachment semantics:
   - Geometry attached to Model,
   - Material attached to Model,
   - Texture attached to Material properties,
   - Camera/Light `NodeAttribute` attached to Model,
   - Shape/BlendShape/Deformer relationships.
4. Add diagnostics for unsupported connection shapes instead of ignoring them silently.
5. Keep synthetic IDs for legacy FBX 6 objects collision-safe and deterministic.

Risks:
1. This touches all downstream interpreters.
2. Small parent/child relationship changes can affect transforms, skeletons, and animation targeting.

Exit criteria:
1. Current fixtures produce the same model/geometry/material/skinning counts unless a change is intentionally gated.
2. Unsupported connection types are visible in diagnostics.

## Phase 3: Geometry fidelity

Purpose: close Blender gaps in mesh interpretation.

Tasks:
1. Replace simple fan triangulation with robust triangulation:
   - project 3D polygon to a stable 2D plane,
   - ear-clip simple concave polygons,
   - detect degenerate/self-intersecting cases,
   - provide safe fallback diagnostics when exact triangulation is not possible.
2. Add layer data validation:
   - expected array lengths,
   - mapping/reference mode compatibility,
   - index bounds,
   - recoverable fallback with diagnostics.
3. Use smoothing groups to split vertices or recompute normals where source normals are absent or insufficient.
4. Add tangent/binormal extraction:
   - first pass: pass through `LayerElementTangent` / `LayerElementBinormal` when present,
   - second pass only if needed: compute missing tangents using a MikkTSpace-compatible approach.
5. Add `LayerElementVisibility` handling for hidden polygons/vertices if fixtures prove it affects rendering.
6. Preserve edge crease data as metadata first; only map it to Babylon behavior if there is a concrete runtime use.

Gates:
1. Behemot Cat for triangulation and geometry fidelity.
2. Vino and Spartan for tangents/binormals/material-adjacent geometry.
3. Synthetic concave and degenerate polygon fixtures.

Exit criteria:
1. Concave n-gon fixtures triangulate without overlaps/spikes.
2. Existing symmetric/asymmetric visual gates do not regress.

## Phase 4: Materials, textures, images, and static visibility

Purpose: close Blender gaps in material and texture graph behavior.

Tasks:
1. Improve texture/image graph resolution:
   - `Texture` to `Video` links,
   - embedded and external image handling,
   - relative/absolute path fallback,
   - folder search behavior,
   - extension fallback already implemented.
2. Improve alpha/transparency semantics:
   - `TransparencyFactor`,
   - `TransparentColor`,
   - opacity textures,
   - material alpha mode decisions.
3. Add richer material slots:
   - specular/gloss/shininess maps,
   - displacement metadata or supported mapping,
   - normal/bump variants,
   - Maya environment slots where useful.
4. Add `LayeredTexture` support only if fixtures use it; otherwise keep diagnostics.
5. Add optional PBR-style mapping only when fixtures provide material extension data that benefits from it.
6. Apply static visibility/culling signals consistently.

Gates:
1. Vino for texture path, alpha, and material visibility behavior.
2. Spartan for Maya texture slots.
3. Alfa Romeo for existing UV set/material behavior.

Exit criteria:
1. Vino-class materials render with expected opacity/culling behavior.
2. Existing material/UV tests remain green.

## Phase 5: Shared transform evaluator with `InheritType`

Purpose: implement Blender-parity transform semantics before changing skinning or animation behavior that depends on world matrices.

Tasks:
1. Centralize transform evaluation in one interpreter/loader helper:
   - `Lcl` TRS,
   - pre/post rotation,
   - pivots,
   - offsets,
   - rotation order,
   - geometric transform as mesh-only,
   - parent inheritance mode.
2. Implement FBX inheritance modes:
   - `RrSs`,
   - `RSrs`,
   - `Rrs`.
3. Add segment-scale compensation behavior where applicable.
4. Keep old behavior behind a compatibility path until gates pass.
5. Re-sample static and animated transforms through the same evaluator.

Gates:
1. Synthetic parent-scale and inheritance-mode fixtures.
2. Aisha and Spider as canaries because they contain non-default inheritance data and currently pass.
3. Behemot and Last Stronghold as problem fixtures.

Exit criteria:
1. Synthetic inheritance fixtures match expected matrices.
2. Known-good skinned gates do not regress.

## Phase 6: Skinning, bind poses, cluster modes, and associate models

Purpose: close Blender gaps in armature/bind reconciliation after transform evaluation is reliable.

Tasks:
1. Extend cluster mode extraction and diagnostics.
2. Define runtime semantics for `TransformAssociateModel`:
   - additive/associate modes,
   - absent `Mode` node behavior,
   - compatibility with Babylon skeleton bind matrices.
3. Reconcile bind poses, `Transform`, `TransformLink`, rest locals, and fallback matrices more explicitly.
4. Improve mixed bone/non-bone helper handling in resolved rigs.
5. Preserve the current successful shared-rig resolver behavior unless a fixture proves a change is needed.

Gates:
1. Last Stronghold for `TransformAssociateModel`.
2. Aisha, Spider, Bristleback, Phoenix for regression protection.
3. Synthetic associate-model skin fixture if needed.

Exit criteria:
1. Last Stronghold deformation improves or diagnostics prove a different root cause.
2. Existing rig gates remain correct.

## Phase 7: Animation parity

Purpose: close gaps in Blender-style animation evaluation.

Tasks:
1. Decide runtime representation:
   - bake animation layers into final curves at import time, or
   - preserve multiple layers/groups with runtime blending metadata.
2. Implement animation layer blending:
   - layer weight,
   - blend mode,
   - rotation and scale accumulation behavior where present.
3. Add non-TRS animated properties:
   - visibility,
   - camera focal length/focus-related properties,
   - light properties,
   - selected custom properties when useful.
4. Add curve interpolation diagnostics for cases beyond current sampling assumptions.
5. Ensure the shared transform evaluator from Phase 5 is used for sampled transforms.

Gates:
1. Aisha/Spider/Bristleback/Phoenix animation regression samples.
2. Synthetic two-layer animation fixture.
3. Visibility animation fixture.

Exit criteria:
1. Layered animation fixtures match expected sampled values.
2. Existing animation gates remain stable.

## Phase 8: Blend shape in-betweens and `FullWeights`

Purpose: match Blender's support for FBX in-between shape keys.

Tasks:
1. Interpret `FullWeights` for each `BlendShapeChannel`.
2. Select/interpolate between in-between shapes based on `DeformPercent`.
3. Decide Babylon representation:
   - multiple morph targets with computed weights, or
   - baked target interpolation per animation sample.
4. Apply geometric delta/normal transforms consistently for all shapes.

Gates:
1. Bristleback, Aisha, and Mannequin for real-world blend shape data.
2. Synthetic in-between shape fixture with known weights.

Exit criteria:
1. In-between shapes no longer collapse to the first shape.
2. Existing morph target behavior does not regress.

## Phase 9: Camera and light fidelity

Purpose: close Blender gaps for non-mesh scene content when assets require it.

Status: completed for the safe runtime subset. Cameras/lights now use property-template fallback, preserve focal length/filmback/orthographic/roll and attenuation/spot/shadow metadata, map orthographic camera bounds when safe, and keep spot `InnerAngle` diagnostic/metadata separate from Babylon's outer cone angle.

Tasks:
1. Extend camera node attributes:
   - projection/orthographic mode,
   - focal length,
   - filmback/aperture,
   - roll,
   - target/interest helpers where represented in the graph.
2. Extend light node attributes:
   - decay modes,
   - spot falloff/softness,
   - shadow-related metadata where Babylon supports it,
   - animated light properties from Phase 7.
3. Keep unsupported properties in metadata/diagnostics.

Gates:
1. Synthetic camera and light fixtures.
2. Any repository asset with meaningful cameras/lights.

Exit criteria:
1. Basic camera/light behavior remains stable.
2. Extended properties map correctly where Babylon has equivalents.

## Phase 10: Constraints, helpers, and remaining Blender-only relationships

Purpose: handle complex DCC helper relationships only when fixtures require them.

Status: completed as diagnostics-first support. Unsupported constraints, helper/control objects, layered textures, non-bind poses, unsupported deformers, unsupported node attributes, and connection-graph issues are surfaced in interpreted scene diagnostics; runtime constraint evaluation remains fixture-driven and intentionally deferred.

Tasks:
1. Inventory constraint/deformer/helper object types present in fixtures.
2. Add data-only extraction and diagnostics first.
3. Implement runtime behavior only for constraint types with real asset impact.
4. Keep unsupported constraints visible in metadata so downstream users can diagnose missing behavior.

Exit criteria:
1. No silent ignore for constraint/helper relationships that can affect visible scene output.
2. Runtime support is fixture-driven, not speculative.

## Suggested implementation order

1. Phase -1: Fixture inventory.
2. Phase 0: Regression harness.
3. Phase 1: Property templates, additive first.
4. Phase 2: Scene graph and connection compatibility.
5. Phase 3: Geometry fidelity.
6. Phase 4: Materials/textures/static visibility.
7. Phase 5: Shared transform evaluator and `InheritType`.
8. Phase 6: Skinning/bind/associate models.
9. Phase 7: Animation parity.
10. Phase 8: Blend shape in-betweens.
11. Phase 9: Camera/light fidelity.
12. Phase 10: Constraints/helpers.

## Deferred parity gates completion

Status: completed as gated diagnostics. Non-default `InheritType` is preserved and surfaced on model diagnostics/metadata while runtime parent-scale inheritance remains unchanged until a fixture-specific visual baseline exists. Unsupported-only animation stacks, such as visibility/camera/light property animation without TRS curves, are now preserved with curve/default diagnostics instead of being dropped. Constraint runtime evaluation remains explicitly fixture-driven; current support keeps those relationships visible through diagnostics rather than applying speculative transforms.

## Immediate next candidate work

The roadmap phases are now implemented through the diagnostic/runtime-safe subset. Any further work should be fixture-driven runtime expansion: parent-scale `InheritType` composition with a visual baseline, concrete constraint evaluation for a known affected asset, or runtime application of non-TRS animation such as visibility/camera/light curves after adding dedicated gates.
