# Behemot Cat Visual Bug

## Status

Behemot Cat is still visually broken in the runtime viewer. Recent fixes corrected one confirmed issue where the `Flame_Outer` skinned mesh was placed near the origin instead of aligning with `Flame_Inner`, but the asset still appears as an exploded mess of geometry in visual inspection.

Vino and Last Stronghold orientation issues are confirmed fixed by applying FBX `GlobalSettings` axis conversion for non-Y-up scenes. Behemot should be treated as a separate skinning/deformation bug, not as part of the scene-axis issue.

## Confirmed recent fix

The loader now uses the mesh model's FBX `BindPose` matrix for skinned mesh transform and pose setup when available:

- `src\interpreter\skeleton.ts` extracts `meshBindPoseMatrix` from `Pose/PoseNode` data for the mesh model associated with a skinned geometry.
- `src\fbxFileLoader.ts` applies that bind matrix to skinned meshes and uses its inverse as the pose matrix.
- `tests\fbxFileLoader.test.ts` verifies Behemot `Flame_Outer` is spatially near `Flame_Inner`.

This fixed a placement bug for one skinned submesh, but it did not fix the full Behemot deformation.

## Likely cause

The remaining issue is likely in skin deformation bind-space math rather than mesh object placement. Behemot probably has at least one skinned mesh whose vertices are transformed with an incorrect relationship between:

- mesh bind pose,
- cluster/link bind matrices,
- inverse bind matrices,
- Babylon bone rest matrices,
- geometric transforms,
- and the loader's FBX-to-Babylon handedness / axis conversion root.

The visual symptom, "exploded geometry," usually points to vertices being weighted against bones whose inverse bind matrices or rest transforms do not match the space used by the mesh vertices. Since the object-level `Flame_Outer` placement is now covered, the next investigation should focus on per-vertex skinning output and bind/rest matrix compatibility.

## Places to investigate

1. `src\interpreter\skeleton.ts`
   - `extractSkin`
   - `extractCluster`
   - `computeClusterMatrices`
   - bind-pose extraction and mapping between geometry, mesh model, cluster link model, and pose nodes
   - whether Behemot uses cluster modes or associate models that need different handling

2. `src\fbxFileLoader.ts`
   - `_createSkeleton`
   - bone matrix creation and parent-child composition
   - `bone.updateMatrix(...)` / rest matrix setup
   - assignment of `skeleton.needInitialSkinMatrix`
   - skinned mesh `updatePoseMatrix(...)`
   - interaction between skinned meshes and `__fbx_root__` / `__fbx_axis_conversion__`

3. `src\interpreter\transform.ts`
   - local transform composition order
   - geometric transform composition
   - whether bind matrices and evaluated model transforms are built in the same FBX coordinate space

4. `tests\fbxFileLoader.test.ts`
   - add a stronger Behemot regression once the failing component is isolated
   - compare skinned mesh bounding boxes after skeleton binding, not only object centers
   - consider testing transformed vertex extents for each Behemot skinned mesh

## Suggested diagnostic path

1. Inventory Behemot skinned meshes, their skeletons, cluster counts, cluster link model names, and available bind-pose matrices.
2. Compare each skinned mesh's raw geometry bounds, object world bounds, and post-skeleton rendered bounds.
3. For broken meshes, compute expected cluster inverse bind matrices from FBX `Transform` and `TransformLink` values and compare them to Babylon bone inverse bind behavior.
4. Check whether geometric transforms are applied twice or omitted for skinned meshes.
5. Check whether bind matrices are being mixed across coordinate spaces when the asset is parented under the handedness / axis conversion roots.
6. Add a fixture-specific regression that catches the actual exploded bounds, not just the `Flame_Outer` placement bug.

## Notes

- Do not treat `transparencyFactor` as the primary Behemot issue unless visual inspection shows the cat is invisible rather than deformed. Current material handling keeps `Cat_Material` opaque because explicit opacity is `1`.
- Vino and Last Stronghold should remain covered by scene-axis conversion tests; Behemot should be debugged independently as a skinning/bind-space issue.
