# 2026-05-16 Progress Report

## Summary

Today focused on closing the Blender FBX importer parity plan and then responding to visual validation from real assets. The loader gained broader FBX feature coverage, stronger diagnostics, safer runtime metadata preservation, and two confirmed visual fixes for non-Y-up assets.

The major outcome is that the planned Blender-parity implementation pass is complete, the full test suite passes, and Vino plus Last Stronghold are visually confirmed correct. Behemot Cat remains open as a separate skinning/bind-space bug and now has a dedicated follow-up report.

## Implementation completed

### Blender parity roadmap

Completed the remaining phases of the Blender parity plan:

1. Feature inventory and fixture regression snapshot helpers.
2. Property template parsing and conservative runtime fallback.
3. Connection graph preservation and diagnostics.
4. Geometry fidelity improvements, including safer concave n-gon triangulation and layer diagnostics.
5. Material and texture improvements, including color factors, transparency handling, opacity textures, and broader texture slot aliases.
6. Shared transform helper foundation.
7. Skinning and bind-pose diagnostics.
8. Animation diagnostics for layers, unsupported curve nodes, and unsupported-only stacks.
9. Blend shape in-between support via `FullWeights`.
10. Camera and light metadata fidelity.
11. Scene diagnostics for constraints, helpers, unsupported deformers, layered textures, poses, and graph issues.

Also completed deferred gates from the plan:

1. Non-default `InheritType` is surfaced as gated diagnostics/metadata instead of silently ignored.
2. Unsupported-only animation stacks are preserved diagnostically instead of being dropped.
3. Constraint runtime behavior remains diagnostic-only until a fixture proves visible impact.

### Visual parity fixes

Fixed the root cause for two confirmed visual orientation issues:

1. **Vino**: no longer stands on its nose.
2. **Last Stronghold**: no longer loads rotated on its side.

Both assets declare non-Y-up FBX scene axes in `GlobalSettings`. The loader previously applied Babylon handedness conversion but ignored the FBX source up/front/coord axes. The loader now creates a dedicated `__fbx_axis_conversion__` root beneath the existing `__fbx_root__` when the FBX scene basis is not Babylon's default basis.

This keeps ordinary Y-up assets unchanged while correctly converting Z-up assets.

### Behemot investigation

Fixed one confirmed Behemot placement issue:

1. `Flame_Outer` was using a computed hierarchy transform that placed it near the origin.
2. The loader now uses the mesh model's FBX `BindPose` matrix for skinned mesh transform and pose setup when available.
3. A regression verifies `Flame_Outer` stays spatially aligned near `Flame_Inner`.

However, visual inspection still shows Behemot Cat is broken. The likely remaining issue is deeper skinning deformation bind-space math, not scene-axis conversion or the already-fixed object-level placement issue.

Created a dedicated bug report:

`reports\20260516_behemot_visual_bug.md`

That report captures the likely cause and recommended investigation path.

## Gains made

### Loader capability

The loader now preserves and exposes substantially more FBX data that Blender's importer also considers:

1. Property template defaults.
2. Raw object and connection graph metadata.
3. Unsupported and unusual connection diagnostics.
4. Tangent/binormal layer data.
5. Recoverable geometry diagnostics.
6. Material color/transparency factors and expanded texture slots.
7. Camera filmback, focal length, orthographic, roll, and related metadata.
8. Light attenuation, spot, and shadow metadata.
9. Animation layer and unsupported curve-node diagnostics.
10. Blend shape in-between weights.
11. Scene-level unsupported feature diagnostics.

### Runtime safety

Most newly supported data is additive or gated. Risky behavior, such as runtime constraints, non-default `InheritType` composition, and non-TRS animation application, remains diagnostic-only until fixture-driven visual baselines justify changing runtime output.

This reduces the chance of broad visual regressions while still making the loader much easier to debug and extend.

### Regression protection

Added broad test coverage for:

1. Fixture feature inventory.
2. Stable fixture regression snapshots.
3. Property templates.
4. Connection diagnostics.
5. Geometry triangulation and diagnostics.
6. Template-driven runtime fallback.
7. Skinning diagnostics.
8. Animation diagnostics.
9. Blend shape in-between support.
10. Scene diagnostics.
11. Camera/light runtime metadata.
12. Non-Y-up FBX scene-axis conversion.
13. Behemot skinned mesh bind-pose placement.

Current validation state:

1. `npm run typecheck` passes.
2. `npm test` passes with 19 test files and 114 tests.

## Remaining known work

Behemot Cat remains the main known visual defect. The next likely fix area is the relationship between mesh bind pose, cluster bind matrices, bone rest matrices, geometric transforms, and Babylon inverse bind behavior.

Other future runtime expansions should remain fixture-gated:

1. Full `InheritType` parent-scale composition.
2. Runtime constraint evaluation.
3. Runtime non-TRS animation behavior for cameras, lights, visibility, or custom properties.

## Bottom line

Today moved the loader from a mostly documented Blender-parity gap list to a substantially implemented, test-backed parity layer. The strongest confirmed user-visible gains are correct orientation for Vino and Last Stronghold, broader FBX data preservation, and a much clearer path to fixing the remaining Behemot skinning issue.
