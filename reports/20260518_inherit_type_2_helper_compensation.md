# InheritType 2 helper compensation fix

Date: 2026-05-18

## Context

Cloud Station exposed two related `InheritType = 2` (`Rrs`, no parent scale inheritance) failures in the fish rigs:

- Eye disks were sunken or offset under non-uniform scaled parents.
- The middle fish tail/body animation popped at extrema even after sampled curves were linearized.

The GLB reference did not collapse this compensation into one joint. It represented it with explicit `*_scaleCompensation` helper nodes between the scaled parent and the animated joint. That structure kept the compensation transform separate from the source joint rotation.

## Root cause

The loader initially compensated `InheritType = 2` by building one adjusted Babylon local matrix for the source bone:

- Preserve the child translation.
- Apply inverse immediate-parent scale into the local basis.
- Decompose that combined matrix back to Babylon TRS for animation keys.

That was sufficient for simple placement, and improved the eye issue, but it was not robust for animated non-uniform scale/rotation chains. The combined matrix can be sheared or near-sheared relative to Babylon's TRS model. Decomposing that matrix every frame introduced rotation discontinuities, which appeared as a fish tail/body pop.

The unsupported animation curve-node gap was not the cause. Cloud Station's visible fish curves are dense baked `FbxMayaSample Curve` data, and the GLB reference animation samplers are linear. Those curves should be evaluated as linear samples, not Hermite curves, but linearizing them alone did not remove the structural decomposition pop.

The sampled-curve detection is now metadata-first but not Maya-only. The interpreter treats `FbxMayaSample Curve` as sampled data, and also detects Blender-style frame-baked curves by key cadence: enough keys, uniformly spaced at a common frame rate, and no meaningful cubic tangent deviation. Sparse curves and dense curves with meaningful cubic tangents keep their authored Cubic/Hermite interpolation.

## Fix

The runtime now models `InheritType = 2` compensation as synthetic Babylon helper bones named `__fbx_scaleCompensation`.

For each compensated source bone:

1. Insert a helper bone parent-before-child in the Babylon skeleton.
2. Parent the helper to the original source parent.
3. Parent the real source bone to the helper.
4. Put the source local translation plus inverse immediate-parent scale on the helper.
5. Put the source raw rotation/scale on the real source bone, with local translation removed.
6. Give the helper `_index = -1` so shader skinning matrix indices continue to refer to the real source bone index.

This matches the GLB helper-node structure and avoids decomposing the combined compensated transform.

## Important implementation details

- Do not assume `skeleton.bones[sourceIndex]` maps to the original FBX source bone after helpers are inserted. The loader keeps a source-bone map for this.
- Helpers must be inserted parent-before-child. Babylon computes final matrices by iterating `skeleton.bones` in array order, so appending helpers after children would break parent matrix availability.
- Helper `_index = -1` excludes the helper from shader matrix writes, but the helper still exists in `skeleton.bones` and can be animated.
- Source skinning indices remain stable because real source bones keep their original `_index`.
- Non-compensated siblings stay on the normal sparse animation path. Do not globally bake all rig bones.
- For animated compensated bones, helper animation receives translation and inverse sampled parent scale; the real source bone receives raw rotation/scale.
- The bind-rest path remains conservative. Rigs that trigger bind-rest remapping still skip inherited-scale helper animation until a fixture proves the combined semantics.

## Validation

- Cloud Station creates helpers such as `EVSB_FISH1:body_02_JNT__fbx_scaleCompensation`.
- `EVSB_FISH1:body_02_JNT` is parented under its helper, and the helper is parented under `EVSB_FISH1:body_01_JNT`.
- The previous multi-degree tail/body rotation pop dropped to approximately `0.016` degrees per sampled local step in the checked body joint, with no absolute jump detected in that check.
- The user reviewed most animated meshes and did not see regressions.
- `npm test` passed: 157 tests.
- `npm run typecheck` passed.

## Files touched by the fix

- `src\fbxFileLoader.ts`
  - Adds source-bone and helper-bone maps.
  - Splits `InheritType = 2` local matrices into helper/source components.
  - Targets helper/source animations separately.
- `tests\fbxFileLoader.test.ts`
  - Verifies helper insertion, source index preservation, immediate-parent scale compensation, nested compensation, and animated helper/source key targeting.
- `src\interpreter\animation.ts`
  - Treats `FbxMayaSample Curve` data as linear sampled animation while preserving true cubic curves.
- `tests\interpreter\skeleton.test.ts`
  - Covers sampled-curve linear evaluation and preserves existing cubic behavior.
- `viewer\main.ts`
  - Separately documents Cloud Station material/viewer parity: fish materials are unlit in the GLB reference, so viewer overrides set FBX fish PBR materials unlit.

## Future cautions

- Any new skeleton traversal code should use source-bone maps when it needs FBX source indices.
- Any serialization/export path should decide whether to expose or hide synthetic helpers.
- If a future fixture combines severe bind-rest remapping with `InheritType = 2`, add a focused regression before enabling helper animation for that path.
- If another asset still pops after this fix, compare whether the issue is true animation interpolation, Euler order, bind-rest remapping, or a different FBX transform inheritance mode such as `InheritType = 0`.
