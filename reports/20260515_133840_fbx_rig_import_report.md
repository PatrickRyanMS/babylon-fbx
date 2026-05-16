# FBX Rig Import Report: Anime Chibi Girl Aisha

## Purpose

This report preserves the current debugging context and proposed implementation direction for improving the Babylon FBX loader's handling of complex rigged assets. It is intended to be read by a future agent/session after a machine restart.

The immediate target asset is:

```text
tests/models/anime-chibi-girl-aisha-by-seraphim/test2.fbx
```

The user validated that this file opens and animates correctly in both Maya and Blender. Maya reports a bind-pose warning, and Blender's displayed bone orientations may look odd, but the mesh deformation and animation are correct in those tools. That means this is not simply an unsupported constraint-rig case; the FBX contains enough importable data for an open-source importer to reconstruct the usable deformation rig.

## Current Repository State

At the time this report was written, the working tree has uncommitted experimental changes in:

```text
src/fbxFileLoader.ts
src/interpreter/geometry.ts
src/interpreter/skeleton.ts
```

Important: these diffs include both useful work and experiments. Do not assume the current `src/fbxFileLoader.ts` state is final. In particular, recent local-space animation-bake experiments preserved finger bone lengths but visually worsened or failed to fix the body deformation. Before implementing the final architecture, inspect and decide what to keep, revert, or refactor.

Useful validation commands:

```bash
npm run typecheck
npx vitest run tests/interpreter/skeleton.test.ts tests/parsers/spider.test.ts tests/interpreter/interpreter.test.ts
npm test
```

The viewer hot reloads; the user explicitly said not to restart it after every code change.

## Asset Findings

Observed facts for `test2.fbx`:

- The loader currently reports 25 skinned meshes, 25 skins/skeletons, 1 animation, 9 morph targets.
- The model contains multiple skeleton-like hierarchies:
  - `mainAisha:FitSkeleton`: appears to be an unanimated/reference/T-pose chain.
  - `mainAisha:DeformationSystem`: contains the deformation bones used by skin clusters.
  - `mainAisha:MotionSystem` / FK controls: animated control hierarchy, not directly skin-bound.
- The body mesh is bound to the `DeformationSystem` model IDs, not the unanimated `FitSkeleton` IDs.
- No duplicate model names were found inside the body skin's resolved bone list.
- Many meshes share overlapping deformation bone model IDs, but the current loader creates a separate Babylon `Skeleton` per FBX skin.
- The current per-skin skeleton approach makes Babylon's inspector show many partial skeletons and makes it hard to reason about the actual rig.
- Frame 0 improved substantially after earlier bind/hierarchy work.
- Frame 15 still shows body/hand artifacts. Finger segment lengths can be preserved by some local bake experiments, but the body deformation still remains wrong.
- Geometry triangulation improvements helped reduce some sheet-like artifacts, but the remaining failure is primarily rig/bind/animation evaluation, not raw polygon triangulation.

## Most Important Conclusion

The scalable gap is architectural:

> The loader currently imports skeletons as per-skin artifacts. Mature importers first resolve a deformation rig from FBX cluster connections and bind all relevant skins to that resolved rig.

For this asset class, the loader needs a rig-resolution and bind-resolution layer before Babylon scene construction. Tactical fixes to individual bone chains are downstream of that missing layer and are unlikely to scale.

## Research Summary: Blender, three.js, Assimp

Findings from source-level research and rubber-duck critique:

### Blender

- Blender builds armatures from FBX model hierarchies, including "fake bones" where needed.
- Blender reads BindPose data but lets `Cluster.TransformLink` overwrite bind matrices for cluster-referenced bones.
- Blender implements the full FBX/Maya transform chain:

```text
WorldTransform =
ParentWorldTransform @ T @ Roff @ Rp @ Rpre @ R @ Rpost^-1 @ Rp^-1 @ Soff @ Sp @ S @ Sp^-1
```

- Blender handles enough bind/armature/animation compensation for this file to animate correctly.
- Blender does not generally evaluate arbitrary Maya constraints as a full Maya dependency graph, so if this asset works in Blender, our loader is probably missing transform/bind/armature reconciliation rather than needing a full constraint solver first.

### three.js

- `LimbNode` and `Root` models may become `Bone` objects in the scene graph, but only cluster-targeted bones are assigned to a `Skeleton`.
- `Cluster.TransformLink` is used as the authoritative inverse bind source for skinned bones.
- BindPose is used as fallback/rest information for non-cluster bones.
- Animation reads direct `Lcl Translation`, `Lcl Rotation`, `Lcl Scaling`, and `DeformPercent` curves.

### Assimp

- Assimp is strict: a node becomes an `aiBone` only when referenced by a skin cluster.
- It uses `TransformLink` for bone offset matrices.
- It explicitly logs/ignores empty stacks that may rely on IK/constraints.

## Why the Current Loader Falls Short

### 1. One Babylon skeleton per FBX skin

The loader currently builds one `Skeleton` for every `FBXSkinData`. This matches the raw number of FBX skins but not the conceptual rig. The Aisha model is a multi-mesh character where many meshes share overlapping deformation bones.

This causes:

- Inspector clutter and confusing skeleton overlays.
- Independent evaluation of what should be one deformation rig.
- Repeated partial skeletons with different subsets of the same bone IDs.
- More opportunities for bind/rest inconsistencies across meshes.

### 2. No global deformation-rig resolution

The loader needs to first collect all `Cluster` target model IDs across skins and use those IDs as the authoritative deformation-bone set. Skeleton-like hierarchies not referenced by clusters, such as `FitSkeleton` and many `MotionSystem` controls, should be scene nodes or controls, not skinning bones.

### 3. Bind pose sources are not reconciled Blender-style

Relevant bind sources:

1. `Cluster.TransformLink`: bone world matrix at bind time; authoritative for cluster bones.
2. `Cluster.Transform`: mesh/world matrix at bind time.
3. `Pose` / `BindPose` / `PoseNode.Matrix`: useful fallback for helpers/ancestors.
4. Evaluated FBX local transforms: last resort fallback.

Maya's warning likely means BindPose and TransformLink disagree. For cluster bones, trust `TransformLink` over BindPose.

### 4. Animation baking is not using a resolved rig basis

The current loader samples curves and then tries to compensate per skin. This is fragile because the skeleton is already split into many partial skeletons. The better approach is:

- Resolve one deformation rig.
- Compute bind world/local matrices for that rig.
- Sample animation onto that rig.
- Emit Babylon TRS keys after converting from evaluated FBX matrices into the resolved skeleton's local pose space.

### 5. FBX transform semantics must be centralized

The transform evaluator must be shared by static bind/rest evaluation and animation sampling. It must include:

- `Lcl Translation`
- `Lcl Rotation`
- `Lcl Scaling`
- `PreRotation`
- `PostRotation`
- `RotationOrder`
- `RotationPivot`
- `ScalingPivot`
- `RotationOffset`
- `ScalingOffset`
- `InheritType`
- mesh-only `GeometricTranslation`, `GeometricRotation`, `GeometricScaling`

Do not implement slightly different matrix math in different parts of the loader.

## Proposed Implementation Plan

### Phase 0: Stabilize current branch

1. Inspect current diffs.
2. Decide which experimental changes to keep.
3. Keep the geometry triangulation improvements if they still pass tests; they are useful but not the core rig fix.
4. Treat the current local/absolute animation bake code in `src/fbxFileLoader.ts` as experimental until replaced by the rig-resolution architecture.

### Phase 1: Add a rig-resolution layer

Create a new interpreter-level module, for example:

```text
src/interpreter/rig.ts
```

It should work from the FBX connection graph and object map, not from Babylon objects.

Responsibilities:

1. Collect all `Skin` deformers.
2. Collect all `Cluster` deformers per skin.
3. For each cluster, find its target `Model` bone.
4. Build a global set of cluster-targeted model IDs.
5. Group these IDs into one or more deformation rigs by connected parent hierarchy.
6. Include transitive parent model IDs needed to preserve transforms up to the rig root.
7. Exclude non-cluster skeleton-like hierarchies unless they are ancestors of cluster targets.

For Aisha, expected result:

- `FitSkeleton` should not become the skinned deformation rig.
- `MotionSystem` / FK controls should not become skinning bones unless clusters reference them.
- The main deformation rig should be based on model IDs under `mainAisha:DeformationSystem`.

### Phase 2: Resolve bind matrices

For each resolved rig bone:

1. If the bone is directly targeted by a cluster, use that cluster's `TransformLink` as bind world.
2. If multiple clusters reference the same model ID, verify their `TransformLink` matrices are equivalent within epsilon. If not, record a warning and choose a deterministic matrix.
3. For helper/ancestor bones with no cluster:
   - Use BindPose matrix if available.
   - Otherwise evaluate the FBX local transform chain at rest and compose with parent.
4. Derive bind-local matrices from bind-world matrices.

Babylon uses local multiplied by parent for absolute composition, so verify the formula with unit tests. In the current code style, child bind local has been derived as:

```ts
localBind = childAbsoluteBind.multiply(parentAbsoluteBindInverse);
```

Do not trust this blindly; write a tiny synthetic matrix test before finalizing conventions.

### Phase 3: Create shared Babylon skeletons

Instead of one skeleton per skin:

1. Create one Babylon `Skeleton` per resolved deformation rig.
2. Create one `Bone` per resolved rig bone.
3. Preserve a map:

```ts
Map<fbxModelId, babylonBoneIndex>
```

4. For each mesh/skin, remap cluster weights into the shared skeleton's bone indices.
5. Assign each skinned mesh to the shared skeleton for its rig.

Babylon may still need mesh-specific bind/pose data. If so, store per-mesh bind data separately rather than duplicating the conceptual skeleton.

### Phase 4: Apply correct mesh bind world and inverse bind data

For each skinned mesh:

1. Find the skin connected to the mesh geometry.
2. Use `Cluster.Transform` as the mesh bind world when available.
3. Account for the mesh model's geometric transform.
4. Ensure Babylon's mesh pose matrix and skeleton inverse bind matrices represent the same bind space.

Research-backed formula for real-time skinning is conceptually:

```text
boneOffset = inverse(TransformLink) * meshBindWorld
```

How exactly this maps to Babylon depends on `Skeleton.needInitialSkinMatrix`, `mesh.updatePoseMatrix`, and whether vertices are kept in mesh-local or bind-world space. Implement this behind a small helper and test it independently.

### Phase 5: Bake animation on the resolved rig

For each animation stack:

1. Collect sample times from all relevant curve nodes.
2. Evaluate FBX local matrices for all model nodes using the shared transform evaluator.
3. For each deformation rig bone, compute evaluated world matrices.
4. Convert evaluated world matrices into local matrices relative to the resolved rig parent.
5. Apply bind/rest compensation in the same convention used by the bind resolver.
6. Decompose to Babylon TRS keyframes.

This should be modeled after Blender's approach: bake final evaluated pose into animation keys rather than copying raw Lcl curves onto Babylon bones.

If later diagnostics show that deformation bones do not have enough direct animation data and are driven only by FK/control constraints, add detection and warnings first. Do not implement a full constraint solver until the Blender-compatible direct-data path is exhausted.

### Phase 6: Handle non-deforming animated controls separately

Controls in `MotionSystem` may still have animation curves. They should be imported as normal scene `TransformNode`s or non-skinning bones if useful for display, but they should not be used as deformation bones unless clusters reference them.

The animation pipeline should still create non-bone node animations for visible/control nodes with direct curves.

### Phase 7: Tests and diagnostics

Add tests that validate the intermediate rig data before visual testing:

1. Aisha body skin resolves to a deformation rig under `DeformationSystem`, not `FitSkeleton`.
2. `FitSkeleton` model IDs are not cluster-targeted.
3. Multiple Aisha meshes share the same resolved rig ID / bone map where appropriate.
4. Cluster bones use `TransformLink` over BindPose.
5. Bind-local derivation composes back to bind-world matrices within epsilon.
6. Animation sampling preserves constant child bone lengths when parent bones animate.

Then validate visually through the viewer:

```text
http://127.0.0.1:5173/?model=anime-chibi-girl-aisha-by-seraphim%2Ftest2.fbx
```

Useful screenshot artifacts from prior sessions are in:

```text
C:\Users\patricr\.copilot\session-state\6c0ce318-d961-424a-8a16-6af140d72eb0\files
```

## Known Diagnostics from This Session

The body skin binding check found:

- `mainAisha:body`
  - mesh model ID: `2378646766096`
  - geometry ID: `2378611561744`
  - skin ID: `2377474450000`
  - bone count in current per-skin extraction: 102
  - cluster count: 91
  - roots: `mainAisha:Ashasd`
  - bound to `DeformationSystem`, not `FitSkeleton`

Example distinction:

- `mainAisha:Root_M`
  - under `mainAisha:DeformationSystem`
  - animated
  - cluster/deformation path
- `mainAisha:Root`
  - under `mainAisha:FitSkeleton`
  - not animated
  - reference/T-pose path

This strongly suggests the loader is not binding to the wrong named skeleton chain, but it is constructing/evaluating the deformation skeleton in a non-Blender-compatible way.

## Risks and Open Questions

1. **Babylon shared skeleton limitations**
   - Babylon supports multiple meshes referencing one `Skeleton`, but mesh-specific bind matrices may require careful handling.

2. **Matrix convention drift**
   - Babylon matrix multiplication and FBX matrix storage conventions must be verified with small tests.
   - Avoid copying formulas from Blender/three.js without adapting row/column conventions.

3. **InheritType**
   - The file contains varying `InheritType` values. Ignoring this may explain residual transform differences.

4. **Constraints**
   - Since Blender animates this asset correctly, do not start with a full constraint solver.
   - If, after implementing Blender-style rig/bind/animation baking, the model still fails, inspect whether Blender is doing constraint-like handling or whether the exporter baked constraints into deformation bones in a way we are still missing.

5. **Current experimental diffs**
   - Some recent changes improved one metric but worsened visuals. Use the report's architecture as the source of truth, not the current bake experiment.

## Recommended Next Session Prompt

After restart, a good prompt is:

```text
Read reports\20260515_133840_fbx_rig_import_report.md and implement the rig-resolution plan. Start by inspecting the current diffs and deciding which experimental changes to keep. Do not continue finger-chain tweaks; first add an interpreter-level rig resolver that builds shared deformation rigs from cluster target model IDs across skins, excludes FitSkeleton/MotionSystem from skinning unless cluster-targeted, and adds tests for the Aisha model's resolved rig.
```

