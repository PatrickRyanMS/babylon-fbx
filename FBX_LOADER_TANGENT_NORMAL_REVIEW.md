# FBX Loader Tangent, Normal Map, and Roughness Review

## Context

This note captures the recent Holotech Bench investigation and the loader/viewer changes that came out of it. The visible mismatch had two separate causes:

1. Tangent-space handling produced normal-map reflection artifacts on the table surface.
2. The viewer-only ORM packer gamma-lifted roughness data, making FBX highlights visibly blurrier than the GLB reference.

The loader changes are intended to be generally useful for FBX imports. The roughness fix is intentionally viewer-only because it packs loose comparison textures that are not authored in the FBX.

## Loader changes

### Tangent handling

The loader now creates valid tangent data whenever possible:

- If the FBX provides tangents, tangent XYZ is transformed by the FBX geometric normal matrix along with normals.
- Source tangent handedness (`tangent.w`) is mirrored for the left-handed FBX conversion root, matching the way the loader mirrors the asset hierarchy.
- If the FBX omits tangents but has normals and UVs, the loader generates tangents from positions, normals, UVs, and triangle indices.
- Generated tangent contributions are angle-weighted.
- Expanded duplicate polygon vertices are smoothed by control point when safe.
- Mirrored UV islands and material seams are kept separate so tangent frames do not blend across incompatible tangent spaces.

Expected side effects:

- Many FBX meshes now contain tangent vertex buffers where they previously did not.
- Memory usage can increase for meshes with normals and UVs.
- Normal-mapped materials, including viewer-injected normal maps, now have a tangent basis instead of relying on Babylon fallbacks.
- Assets with already-authored tangents now get their handedness mirrored in left-handed scenes.

Risk assessment:

- This is the right behavior for the loader layer because tangent space is geometry data, not viewer presentation logic.
- The most likely remaining visual mismatch versus GLB is MikkTSpace parity; the current generator is robust but not guaranteed byte-identical to a GLB exporter's authored tangents.

### Normal texture setup

For FBX tangent-space normal map slots (`NormalMap`, `NormalMapTexture`, and `normalCamera`), the loader now:

- Assigns the texture to `StandardMaterial.bumpTexture`.
- Sets `texture.gammaSpace = false` because normal maps are data textures.
- Sets Babylon normal-map inversion flags by scene handedness:
  - Left-handed scene: `invertNormalMapX = true`, `invertNormalMapY = false`.
  - Right-handed scene: `invertNormalMapX = false`, `invertNormalMapY = true`.

`Bump` and `BumpFactor` are deliberately split out from this tangent-space normal-map configuration. They are still assigned to `bumpTexture`, preserving existing routing, but they are not forced to non-color data or channel inversions because FBX bump slots are often grayscale height/bump maps rather than tangent-space normal maps.

Expected side effects:

- FBX files with true normal map connections should render closer to Babylon/glTF normal-map conventions.
- FBX files with OpenGL-authored normal maps may still need convention detection or an override in the future; channel convention is authoring-dependent, not only scene-dependent.
- FBX bump/height maps avoid the most risky part of the previous blanket normal-map setup.

### Bind-rest handling

The loader also has recent bind-rest skeleton changes in the same area of work:

- Rigs with severe authored-local versus bind-local scale mismatch use bind matrices as rest pose.
- The threshold is a max scale ratio of `10`.
- Only cluster bones crossing the threshold are recorded for animation remapping into bind-rest space.
- Ordinary rigs continue to keep authored locals as live rest pose while bind matrices are stored with `updateMatrix(localBind, false, false)`.

Current fixture audit found threshold-triggering rigs in:

- `black-dragon-with-idle-animation`
- `holotech-bench`
- `kuma-heavy-robot-r-9000s`
- `model-47a-loggerhead-sea-turtle`
- `quirky-series-free-animals-pack`
- `the-last-stronghold-animated`
- `truffle-man`

Risk assessment:

- The behavior fixes severe skinning scale mismatches, but it is not theoretical: several current fixtures exercise it.
- If any one cluster in a rig crosses the threshold, the skeleton is built in bind-rest mode. Only threshold bones are animation-remapped, which limits risk, but static non-threshold bones in that rig still inherit the global bind-rest skeleton choice.

## Viewer-only roughness / ORM change

Holotech's FBX does not include the GLB's packed ORM texture. The viewer synthesizes a packed ORM texture from separate AO, roughness, and metallic files for visual comparison.

The bug was in viewer texture packing:

- Browser `Image` decode and canvas readback applied PNG color/gamma conversion to data textures.
- Holotech Body roughness mean changed from about `117` to about `176`.
- That made the FBX material much rougher and blurred the red bottle highlight.

The fix is viewer-only:

- `loadImageData` uses `fetch` + `createImageBitmap` with `colorSpaceConversion: "none"`.
- The packed ORM texture remains `gammaSpace = false`.
- Runtime packed roughness returns to about `116.9`, matching the GLB/source roughness.

This should not move into the loader unless the loader itself starts packing separate loose AO/roughness/metallic texture files.

## Rubber-duck review summary

The independent review found:

- Tangent generation and source tangent handedness mirroring are sound and well covered.
- Highest-risk loader areas were blanket normal-map inversion and the global bind-rest skeleton switch.
- `Bump`/`BumpFactor` should not be treated exactly like tangent-space normal maps.
- Additional useful tests were right-handed normal-map configuration and bump-slot behavior.

Actions taken from that review:

- Split `Bump` and `BumpFactor` out from tangent-space normal-map configuration.
- Added right-handed normal-map coverage.
- Added bump-slot coverage to ensure height/bump slots do not receive normal-map gamma/inversion setup.

## Validation

Recent validation commands:

```bash
npx vitest run tests/fbxFileLoader.test.ts
npm test
npm run typecheck
```

Observed state at the time of this report:

- Focused loader suite passed.
- Full test suite passed.
- TypeScript typecheck passed.

## Follow-up considerations

- Add a loader option or metadata-driven override if we need to support both DirectX and OpenGL normal-map conventions explicitly.
- Consider adding real-asset visual or numeric baselines for FBX files with authored tangents.
- If bind-rest regressions appear, revisit whether bind-rest mode should be per-bone rather than whole-skeleton.
- If the loader gains native PBR material support, keep data texture decode/packing paths color-space safe.
