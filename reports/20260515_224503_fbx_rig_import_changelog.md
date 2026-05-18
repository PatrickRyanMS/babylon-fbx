# FBX Rig Import Changelog and Loader Process Notes

## Purpose

This timestamped report captures the current rig-import work after the first successful visual pass for Spider, Bristleback, and Phoenix. It records what changed, why those changes helped, what the loader process is now, what was learned during debugging, and what gaps remain before continuing on the anime girl / Aisha asset.

The important current state is:

- Spider, Bristleback, and Phoenix are visually passing in the viewer with skeleton overlay checks.
- Phoenix wing and feather planes are intentional asset geometry, not sheet artifacts.
- Anime girl / Aisha still has broken deformation, even though the new resolver gets it down to the intended deformation rig/skeleton path. That makes it the next focused debugging target, not evidence that the shared-rig architecture should be backed out.

## Validation Snapshot

Current validation performed after the rig changes:

```text
npm run typecheck
npm test
```

The full test suite passes:

```text
8 test files passed
68 tests passed
```

Visual validation was done through the viewer by loading the assets, selecting the relevant animation where needed, and projecting a skeleton overlay over the canvas:

- Spider Idle: used because the slower motion makes detached leg sections easier to see.
- Spider Walk: used as the faster motion stress case.
- Bristleback: checked that the skinned body follows the visible skeleton and morph targets remain reasonable.
- Phoenix: checked with the understanding that the broad wing/feather planes are expected geometry.

The final screenshot artifacts from this pass were captured in the session workspace as:

```text
final-spider-idle.png
final-spider-walk.png
final-bristleback.png
final-phoenix.png
```

## High-Level Change Summary

The loader moved from a per-skin skeleton model toward a resolved deformation-rig model.

Before this work:

- Each FBX `Skin` deformer effectively became its own Babylon `Skeleton`.
- Multi-mesh characters could produce many partial skeletons for one conceptual rig.
- Bone order, bind matrices, mesh pose matrices, and animation targets were coupled to individual skins.
- Complex assets such as Aisha were difficult to reason about because control rigs, fit/reference skeletons, and deformation bones were all competing in the same import path.

After this work:

- The interpreter resolves deformation rigs before Babylon scene creation.
- The loader creates one Babylon `Skeleton` per resolved deformation rig.
- Each skinned mesh keeps its original FBX `Skin` data but remaps skin-local cluster indices into the shared rig's bone indices.
- Cluster `TransformLink` remains the authoritative bind-world source for cluster bones.
- Bind matrices are separated from the local matrices that animation curves drive.
- Sparse per-model bone animation targeting was restored instead of forcing a baked animation track onto every rig bone.

## New Loader Process

### 1. Parse FBX into an intermediate document

The binary or ASCII parser still produces an `FBXDocument` tree. The parser layer remains Babylon-independent.

### 2. Interpret the FBX object graph

`interpretFBX` resolves the FBX connection graph, extracts scene data, and now also resolves rigs:

```ts
const objectMap = resolveConnections(doc);
const skins = extractSkins(objectMap);
const rigs = resolveRigs(objectMap, skins);
```

The `FBXSceneData` result now includes:

```ts
skins: FBXSkinData[];
rigs: FBXRigData[];
```

This keeps raw skin extraction and conceptual deformation-rig resolution as separate steps.

### 3. Extract skins and bind-pose data

`extractSkins` still works per FBX `Skin` deformer. Each `FBXSkinData` includes:

- The connected geometry ID.
- The skin's cluster/bone list.
- Per-control-point bone indices and weights.
- Cluster matrices:
  - `bindPoseMatrix` from `Cluster.Transform`.
  - `transformLinkMatrix` from `Cluster.TransformLink`.
- Optional per-model BindPose matrix from `Pose` / `BindPose`.
- `isCluster`, so cluster-target bones can be distinguished from non-cluster ancestors.

The skin extractor now includes model ancestors above cluster bones. This is necessary for rigs such as 3ds Max Biped, where a non-cluster root above the weighted bones can carry animation or bind-space significance.

### 4. Resolve deformation rigs

The new `src/interpreter/rig.ts` module groups raw skins into conceptual deformation rigs.

Current resolver behavior:

1. For each skin, collect bones that are actual cluster targets.
2. Find a grouping root from the cluster target ancestry.
3. Group skins by that root.
4. Build a rig bone union from cluster targets plus needed parent model ancestors.
5. Prefer cluster sources with `TransformLink` when the same model appears in multiple skins.
6. Preserve source skin bone order where possible, while still ensuring parents come before children.
7. Build a `skinBoneIndexToRigBoneIndex` remap for every skin binding.
8. Record warnings if multiple skins provide conflicting `TransformLink` matrices for the same model.

The source-order preservation was an important Spider fix. An earlier resolver version sorted/reordered bones in a way that looked logically correct but made Spider leg skinning visually diverge from the Babylon bone display. Keeping first-seen source order made the shared-rig path behave much closer to the old single-skin path while still allowing multi-skin rigs.

### 5. Create shared Babylon skeletons

The loader now creates skeletons from resolved rigs before building meshes:

```ts
for (const rig of fbxScene.rigs) {
    const skeleton = this._createSkeleton(rig.id, rig.bones, scene);
    skeletonByRigId.set(rig.id, skeleton);

    for (const binding of rig.skinBindings) {
        skeletonByGeometryId.set(binding.geometryId, skeleton);
        skinByGeometryId.set(binding.geometryId, skin);
        skinBindingByGeometryId.set(binding.geometryId, binding);
    }
}
```

This means a mesh still gets its own skin/weight data, but the target bone indices point into the shared rig skeleton.

### 6. Remap skinning weights into rig bone indices

FBX skin weights are local to each FBX `Skin`. Babylon skinning indices must point into the assigned Babylon `Skeleton`.

The loader now remaps at buffer-build time:

```ts
const rigBoneIndex = skinBinding
    ? skinBinding.skinBoneIndexToRigBoneIndex[skinBoneIndex]
    : skinBoneIndex;
```

If a cluster bone has no rig mapping, the loader throws instead of silently assigning a bad bone index. This was important because silent fallback would produce "successful" imports with subtly broken deformation.

### 7. Build skeleton bind data without overwriting animation rest data

The most important Babylon-specific learning was that bind matrices and animation-local matrices must remain separated.

Current skeleton creation is two-phase:

1. Create each `Bone` with the computed FBX local rest matrix from `Lcl Translation`, `Lcl Rotation`, `Lcl Scaling`, pre/post rotations, pivots, offsets, and rotation order. This is the basis animation curves naturally target.
2. Resolve bind matrices from:
   - `Cluster.TransformLink` for cluster bones.
   - model `BindPose` for helper/ancestor bones when available.
   - computed rest absolute matrix as fallback.
3. Derive local bind from absolute bind and parent absolute bind.
4. Call:

```ts
bone.updateMatrix(localBind, false, false);
bone._updateAbsoluteBindMatrices(undefined, false);
```

The `false, false` arguments are critical. An earlier change updated the bone's local matrix from the bind matrix. That made animation run in the wrong basis and caused broad skinning regressions. The current path uses bind matrices for inverse bind data while preserving the computed local/rest matrix for animation.

### 8. Keep skinned mesh pose space independent from the viewer/root conversion

Another major fix was restoring the skinned mesh pose-space behavior.

The scene has a root conversion node for right-handed to left-handed conversion:

```ts
const rootNode = new TransformNode("__fbx_root__", scene);
rootNode.rotation.y = Math.PI;
rootNode.scaling.z = -1;
```

However, skinned meshes should not fold that scene/root conversion into their pose matrix. The current skinned mesh path applies only the mesh's own FBX transform, computes its world matrix, and stores the inverse as the pose matrix:

```ts
FBXFileLoader._applyFBXTransform(mesh, model);
mesh.computeWorldMatrix(true);
mesh.updatePoseMatrix(Matrix.Invert(mesh.getWorldMatrix()));
```

This was the final change that made Spider, Bristleback, and Phoenix line up visually again. The incorrect version included parent/root world conversion in the skinned mesh bind pose, which made the mesh and skeleton disagree even when the skeleton animation itself looked plausible.

### 9. Animate only bones that have direct curve targets

The current animation path intentionally uses sparse bone animation targets:

1. Build a map from FBX model ID to resolved Babylon bone(s).
2. Group animation curve nodes by target model ID.
3. If the target is a rig bone, build bone animations for that target and clone them to each matching bone.
4. If the target is not a bone, build normal node animations.
5. Keep blend shape `DeformPercent` curves separate.

This restored the old safer behavior after an experimental all-rig-bones bake caused Spider regressions. A future resolved-rig animation bake is still desirable, but it should be implemented with explicit bind/rest compensation and tests rather than by blindly emitting full TRS tracks for every rig bone.

## Rubber Duck / Research Guidance That Shaped the Direction

The previous rig report captured source-level research and rubber-duck critique that pointed away from small per-asset hacks and toward a rig-resolution layer.

The useful guidance was:

- Blender builds an armature from the FBX model hierarchy and can include helper/fake bones where needed.
- Blender reads BindPose data, but for cluster-referenced bones it treats `Cluster.TransformLink` as the stronger bind source.
- Blender evaluates the full FBX transform chain, including pre/post rotations, pivots, offsets, scale, and rotation order.
- three.js also treats `Cluster.TransformLink` as the authoritative inverse-bind source for skinning bones and uses BindPose/rest data as fallback.
- Assimp is stricter: it only creates skinning bones from nodes referenced by skin clusters and uses `TransformLink` for bone offsets.
- If an asset works in Blender without a full Maya dependency graph, the first missing piece is probably transform/bind/armature reconciliation, not a full constraint solver.

That guidance led to the current implementation strategy:

- Resolve the deformation rig from cluster connections before creating Babylon objects.
- Do not let reference skeletons such as Aisha's `FitSkeleton` become the deformation skeleton unless clusters actually target them.
- Use `TransformLink` for cluster bind matrices.
- Preserve non-cluster ancestors only when they are needed to maintain the cluster hierarchy.
- Keep control rigs and non-deforming animated nodes separate from the skinning skeleton unless the FBX skin clusters reference them.

No new formal rubber-duck agent pass was invoked during the final Spider/Bristleback/Phoenix loop. The final direction came from applying the earlier research/critique, comparing against the old working behavior, and iterating with visual overlay screenshots.

## Important Debugging Learnings

### Visual validation must include skeleton alignment

The Spider regression was not obvious from tests alone. The skeleton animation looked reasonable, but leg mesh sections did not follow the Babylon bone display. The useful visual gate was:

- Enable or draw a skeleton overlay.
- Use Spider Idle first because it is slow.
- Confirm mesh segments remain attached to the matching bones.
- Then check the faster Spider Walk.

For future rig work, screenshots without skeleton display are not enough.

### Bone order can matter even when remapping exists

The resolver initially produced a valid parent-before-child rig order, but Spider still regressed. Remapping skin indices to rig indices was necessary but not sufficient. Preserving the source skin's first-seen bone order made the shared-rig path much closer to the known-good path for single-skin assets.

This suggests future resolver changes should treat bone order as observable behavior, not just an internal implementation detail.

### Bind matrices must not become animation local matrices

Calling Babylon APIs in a way that made bind matrices overwrite local animation/rest matrices caused widespread breakage. The correct current convention is:

- Local/rest matrix: computed from FBX transform properties and targeted by animation.
- Absolute bind/inverse bind: derived from `TransformLink`, BindPose, or rest fallback.
- `bone.updateMatrix(localBind, false, false)` updates bind data without changing the local animation basis.

### Baked animation samples are not authored Hermite curves

Cloud Station later exposed an animation-pop failure that looked like an unsupported curve-node gap but was actually two separate issues:

- Dense baked curves were carrying cubic-looking FBX key flags.
- `InheritType = 2` scale compensation was being collapsed into one matrix and decomposed back to TRS.

The curve-side learning is that sampled/baked animation should be evaluated as linear samples, even if exporter metadata includes cubic flags. The interpreter now detects known Maya sampled curves by `FbxMayaSample Curve`, and also detects Blender-style frame-baked curves without relying on that name. The generic detector requires enough keys, uniform spacing near a common frame cadence, and no meaningful cubic tangent deviation.

Do not use density alone as the rule. Dense authored cubic curves can be valid. Sparse curves and dense curves with meaningful tangents should preserve Cubic/Hermite interpolation.

### Mesh pose matrix and root conversion must stay in the same bind-space convention

Including the scene/root conversion parent in the skinned mesh pose matrix caused the skin to disagree with the skeleton. The current passing convention keeps skinned mesh pose in the mesh's own FBX transform space and leaves scene/root conversion out of that pose matrix.

### Phoenix feathers are intentional geometry

The Phoenix asset contains broad wing/feather planes. They can look like sheet artifacts if viewed through the lens of earlier geometry problems, but the user confirmed they are expected. Do not use their existence alone as a failure signal.

### Geometry triangulation was not the core rig fix

The original report mentioned experimental triangulation improvements. During this pass, the rig fixes were isolated from those changes. The current validated rig behavior does not depend on the experimental ear-clipping/convex triangulator. Geometry should be improved separately with focused tests and visual examples, not mixed into the rig change.

## Current Coverage

Automated coverage now includes:

- Spider skin extraction still produces one skin and expected bone/weight data.
- Spider animation stacks are still extracted.
- Bristleback preserves a non-cluster Biped root above cluster bones.
- Bristleback animation stack time span is preserved.
- Bristleback cubic morph interpolation is preserved.
- Aisha resolves skins to a shared deformation rig.
- Aisha's cluster set includes `mainAisha:Root_M`.
- Aisha's `FitSkeleton` controls are not treated as deformation clusters.
- Aisha skin-local cluster indices remap to rig-local bone indices.
- Texture UVSet behavior still passes after removing the corrupt Little Witch fixture test.

Manual visual coverage currently includes:

- Spider Idle with skeleton overlay.
- Spider Walk with skeleton overlay.
- Bristleback with skeleton overlay.
- Phoenix with skeleton overlay.

## Known Gaps and Risks

### Aisha / anime girl is still broken

Aisha is the next focused target. The shared rig resolver gets it onto the intended deformation-rig path, but visual deformation is still wrong. Since it now has the expected deformation skeleton structure, the likely remaining problem is no longer "too many skeletons" by itself.

Likely areas to investigate next:

- Animation is still sparse direct-curve targeting, not a full resolved-rig world/local bake.
- Aisha may require animation transfer from control/MotionSystem nodes to deformation bones, or at least detection that deformation bones lack enough direct animation curves.
- Bind/rest compensation may still be incomplete for this asset's DeformationSystem.
- Some helper/ancestor bones may need BindPose/local derivation that differs from the current fallback.
- `Cluster.Transform` mesh bind world is not currently used directly for mesh pose because an attempted use regressed Bristleback; this needs a smaller isolated test before reintroducing it.

### No synthetic matrix-convention tests yet

The code currently depends on Babylon matrix conventions and the observed visual pass. We still need small deterministic tests for:

- `localBind = childAbsoluteBind * inverse(parentAbsoluteBind)` under Babylon's row-vector convention.
- Recomposition of local bind matrices back to expected absolute bind matrices.
- Mesh pose matrix convention with `needInitialSkinMatrix`.

### Visual validation is not automated as assertions

The overlay screenshots are effective but manual. The project still lacks an automated visual regression harness or numeric skinning comparison that can fail CI when mesh/bone alignment regresses.

### `TransformLink` conflicts are collected but not surfaced

The rig resolver records warnings when the same model has differing `TransformLink` matrices across skins, but the loader does not yet expose those warnings in a diagnostic channel. This could hide important bind inconsistencies in complex assets.

### Non-cluster ancestor inclusion may be too broad

The current extractor includes model ancestors above cluster bones. This fixed/covered Biped-style roots, but it may include more non-cluster nodes than necessary for some assets. Future work should keep this behavior but add diagnostics/tests around assets with helper/control ancestors.

### Full FBX transform semantics are still incomplete

The loader evaluates many important FBX transform properties:

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

Remaining transform-semantics gaps include:

- `InheritType`
- complete geometric transform handling in every bind/animation path
- any constraint/IK/control-rig evaluation

Do not add a full constraint solver until the direct-data path is exhausted and diagnostics show it is required.

## Recommended Next Iteration for Aisha

Before changing more code for Aisha, use the current passing assets as fixed gates:

1. Capture Aisha with skeleton overlay in rest and animated poses.
2. Compare which Aisha deformation bones have direct animation curves versus which MotionSystem/control nodes have curves.
3. Check whether the visible deformation bones move at all when animation plays.
4. Compare `TransformLink`, BindPose, computed rest absolute, and animated local transforms for a small failing chain such as body-to-arm or hand/finger.
5. If deformation bones lack direct curves, add a diagnostic warning first instead of guessing a constraint solution.
6. If deformation bones have curves but skin is still offset, focus on bind/rest compensation and mesh pose convention.
7. After each change, rerun visual gates for Spider Idle, Bristleback, and Phoenix before judging Aisha progress.

The current architecture should remain: resolve deformation rigs first, bind skins to those rigs, keep bind matrices separate from animation locals, and only then iterate on Aisha-specific bind/animation evaluation.
