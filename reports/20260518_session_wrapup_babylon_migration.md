# Session wrap-up: FBX loader readiness and Babylon.js migration

Date: 2026-05-18

## Purpose

This report captures the remaining context from the current `babylon-fbx` session that may not be fully obvious from the more focused reports. It is meant to help resume either this standalone loader work or the new Babylon.js integration session without reconstructing the last few decisions from chat history.

## Current state summary

The standalone loader has reached a useful transition point:

- The viewer/debug harness has been improved enough to triage real FBX feature gaps instead of noisy false positives.
- Major recent viewer changes and diagnostic cleanup have been committed and pushed.
- Unsupported FBX feature needs have been documented for targeted model hunting.
- The loader source has been copied into the sibling Babylon.js repo as an initial staging step.
- A Babylon.js-specific migration handoff has been written in the Babylon.js repo.

Latest committed standalone repo state:

```text
Repo:   C:\Users\patricr\sourceControl\github\babylon-fbx
Branch: main
Commit: 118f961 Document unsupported FBX model needs
```

Current standalone working-tree note:

```text
 D tests/models/visible-interactive-human-exploding-skull.zip
```

That deletion was already present when collecting final state for this wrap-up. Do not restore or revert it unless the user explicitly asks; previous context says the user has been cleaning model assets.

Babylon.js staging repo state:

```text
Repo:   C:\Users\patricr\sourceControl\github\Babylon.js
Branch: master
Commit: 42fe9942c5
```

Current Babylon.js working tree:

```text
?? FBX_LOADER_MIGRATION_HANDOFF.md
?? packages/dev/loaders/src/FBX/
```

These untracked Babylon.js files were intentionally created for the next integration agent.

## Reports created or updated near the end of this session

### `reports\20260518_unsupported_feature_model_needs.md`

Purpose: detailed inventory of unsupported or partial FBX features that should remain fixture-gated until targeted models exist.

Important contents:

- Which features are unsupported vs partially supported.
- What existing fixtures already prove.
- What new model packages are needed to safely implement each feature.
- Priority order for model hunting.

Most important unsupported/partial areas called out:

- Static and animated visibility.
- `LayerElementVisibility`.
- Animation layer blending.
- Runtime constraints.
- Non-TRS animated properties.
- Layered textures.
- Cluster additive/associate semantics and `TransformAssociateModel`.
- Unsupported deformer subtypes and non-bind poses.
- Camera/light fidelity beyond current basic mapping.
- PBR/material-extension graphs and transparency semantics.
- Smoothing-group normal generation, edge creases/subdivision, concave n-gon cases, global `UnitScaleFactor`, and legacy FBX 6 skinning/Takes.

### `README.md`

Updated in commit `118f961` with a concise unsupported-feature summary and a link to:

```text
reports\20260518_unsupported_feature_model_needs.md
```

### `C:\Users\patricr\sourceControl\github\Babylon.js\FBX_LOADER_MIGRATION_HANDOFF.md`

Purpose: handoff for the separate agent/session that will do the Babylon.js integration.

Important contents:

- Current copied-file state.
- Integration checklist.
- Dynamic loader registration instructions.
- Expected compile/lint/test work.
- Suggested tests to port.
- Build commands to try.
- Guardrails and PR strategy.
- Ready-to-use prompt for the next agent.

## Files copied into the Babylon.js repo

The source was copied from:

```text
C:\Users\patricr\sourceControl\github\babylon-fbx\src
```

to:

```text
C:\Users\patricr\sourceControl\github\Babylon.js\packages\dev\loaders\src\FBX
```

Copied files:

```text
packages\dev\loaders\src\FBX\
  fbxFileLoader.metadata.ts
  fbxFileLoader.ts
  index.ts
  interpreter\
    animation.ts
    blendShapes.ts
    connections.ts
    fbxInterpreter.ts
    geometry.ts
    materials.ts
    propertyTemplates.ts
    rig.ts
    sceneDiagnostics.ts
    skeleton.ts
    transform.ts
  parsers\
    fbxAsciiParser.ts
    fbxBinaryParser.ts
    zlibInflate.ts
  types\
    fbxTypes.ts
```

Mechanical adjustments already applied in the Babylon.js copy:

- `@babylonjs/core/...` imports changed to `core/...`.
- Relative `.js` import suffixes removed.
- Added `fbxFileLoader.metadata.ts`.
- `FBX\index.ts` exports `FBXFileLoaderMetadata`.
- `FBXFileLoader` uses metadata for `name` and `extensions`.

Not yet done in the Babylon.js repo:

- `packages\dev\loaders\src\index.ts` has not been updated.
- `packages\dev\loaders\src\dynamic.ts` has not been updated.
- Tests have not been ported.
- Package docs have not been updated.
- Compile has not successfully run.

Compile blocker encountered:

```text
'tsc' is not recognized as an internal or external command
```

Most likely next action in Babylon.js is:

```bash
npm install
npm run compile -w @dev/loaders
```

## Recent committed work in `babylon-fbx`

### `34df6ab Update viewer model diagnostics and overrides`

High-level changes:

- Viewer render gating during model switches.
- Chernovan missing texture overrides.
- Chernovan glass translucency/alpha viewer override.
- Dropped inaccurate animated labels from the model dropdown.
- Added model/texture size stats and vertex/face counts.

### `e6ce997 Refine viewer diagnostic severity`

High-level changes:

- Reclassified noisy diagnostics so yellow/orange is reserved for truly actionable gaps.
- Bristleback multi-root skeleton complexity is now an info-tone callout rather than a warning.
- Fixed single-shape blend-shape `FullWeights` false positives for Quirky Series Animals.

### `118f961 Document unsupported FBX model needs`

High-level changes:

- Added the unsupported-feature model-needs report.
- Linked the report from the README.
- Updated the session handoff pointer list.

## Key loader facts to preserve during Babylon integration

### Parser and interpreter layering

Keep parser-layer code independent of Babylon runtime imports:

```text
FBX\parsers\
FBX\types\
```

The interpreter layer should also remain mostly Babylon-independent:

```text
FBX\interpreter\
```

Babylon runtime object creation should stay concentrated in:

```text
FBX\fbxFileLoader.ts
```

### Diagnostics-first approach

When behavior is unsupported, preserve diagnostics/metadata instead of guessing.

Do not silently drop:

- Constraints.
- Helper/control-set data.
- Non-bind poses.
- Unsupported deformer subtypes.
- Layered textures.
- Animation layer blend/weight data.
- Unsupported curve nodes.
- Associate-model skinning data.
- Unsupported transform inheritance behavior.

### Skinning invariants

Important invariants:

- Skin weights are keyed by original FBX control points, so `controlPointIndices` must remain aligned through geometry processing.
- Do not fold Babylon's artificial handedness/axis conversion roots into FBX skin bind or pose space.
- Bone bind matrices must not overwrite animation locals.
- `InheritType = 2` uses synthetic helper bones, so source-bone lookup must use the loader's source-bone map rather than assuming `skeleton.bones[sourceIndex]`.
- `TransformAssociateModel` is extracted but not semantically applied yet.

### Tangents and materials

Important tangent/material lessons:

- Explicit tangents should be used when present.
- Generated tangents are used when normal-mapped geometry has normals and UVs but lacks tangents.
- Tangent handedness is adjusted for left-handed conversion.
- Normal-map slots and bump-height slots are intentionally treated differently.
- Viewer-only PBR/material overrides should not be copied into Babylon loader runtime behavior without a general FBX semantic reason.

## Suggested division of labor between sessions

This `babylon-fbx` session can remain useful for:

- Looking up standalone repo history and reports.
- Answering why certain loader decisions were made.
- Finding which tests or fixtures in `babylon-fbx` prove a behavior.
- Updating standalone reports/README if integration learnings should be recorded here.

The new Babylon.js integration session should own:

- Wiring `FBX` into `packages\dev\loaders`.
- Installing/building Babylon.js dependencies.
- Fixing compile/lint issues in the copied code.
- Porting tests into Babylon's test structure.
- Creating a PR branch and preparing the Babylon.js PR.

Avoid both sessions editing the same Babylon.js files at the same time. If this session needs to inspect the Babylon.js repo while the other agent is working, prefer read-only operations unless explicitly coordinated.

## Recommended next prompts

For the Babylon.js integration agent, point it to:

```text
C:\Users\patricr\sourceControl\github\Babylon.js\FBX_LOADER_MIGRATION_HANDOFF.md
```

Then ask it to:

1. Inspect the copied `packages\dev\loaders\src\FBX` tree.
2. Wire exports and dynamic registration.
3. Run dependency setup and compile.
4. Fix TypeScript/lint issues.
5. Port focused tests from `..\babylon-fbx\tests`.
6. Keep unsupported features diagnostic-only unless there is a targeted fixture.

For this standalone session, if more wrap-up is needed later:

1. Update `reports\20260518_agent_context_handoff.md` with any major integration findings.
2. Update `README.md` only if standalone behavior or public guidance changes.
3. Do not push or commit Babylon.js integration work from this repo session unless the user explicitly asks.

## Final risk list

Largest expected integration risks:

- Babylon.js master may have SceneLoader interface differences from standalone `@babylonjs/core@9.6.2`.
- Babylon lint/TSDoc rules may require more public API comments.
- Package test setup differs from Vitest-only standalone tests.
- Inline/minimal FBX test assets may be verbose; avoid adding large binary fixtures unless maintainers approve.
- Dynamic registration and generated public package outputs may have repo-specific conventions not yet handled.
- The loader is substantial; first PR scope should stay "initial FBX loader + focused tests," not broad unsupported-feature implementation.

The standalone repo remains the source of truth for current loader behavior until the Babylon.js integration is compiling and tested.
