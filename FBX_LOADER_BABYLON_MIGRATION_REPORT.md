# FBX Loader Babylon.js Migration Report

Date: 2026-05-19

This report summarizes the FBX loader changes made in the Babylon.js repo so the standalone `babylon-fbx` PoC can be kept aligned while the PR is built.

## Babylon.js integration points

The loader is now wired into the Babylon loaders package:

- `packages/dev/loaders/src/index.ts`
  - Added `export * from "./FBX/index";`.
- `packages/dev/loaders/src/dynamic.ts`
  - Imported `FBXFileLoaderMetadata`.
  - Added dynamic built-in registration for `.fbx` that lazy-loads `./FBX/fbxFileLoader`.
- `packages/dev/loaders/src/FBX/index.ts`
  - Re-exports the loader and metadata.
- `packages/dev/loaders/src/FBX/fbxFileLoader.ts`
  - Registers the plugin as a side effect with `RegisterSceneLoaderPlugin(new FBXFileLoader());`.

The side-effect registration is important because `import "loaders/FBX"` must be enough to make `ImportMeshAsync(..., { pluginExtension: ".fbx" })` find the loader.

## Loader source structure

The migrated loader lives under `packages/dev/loaders/src/FBX/`:

- `fbxFileLoader.ts` - Babylon scene construction, mesh/material/animation/skeleton/camera/light creation, handedness and axis conversion.
- `fbxFileLoader.metadata.ts` - plugin metadata for `.fbx`.
- `index.ts` - FBX barrel exports.
- `parsers/`
  - `fbxAsciiParser.ts`
  - `fbxBinaryParser.ts`
  - `zlibInflate.ts`
- `interpreter/`
  - `fbxInterpreter.ts`
  - `geometry.ts`
  - `materials.ts`
  - `transform.ts`
  - `skeleton.ts`
  - `rig.ts`
  - `animation.ts`
  - `blendShapes.ts`
  - `connections.ts`
  - `propertyTemplates.ts`
  - `sceneDiagnostics.ts`
- `types/fbxTypes.ts`

## Important runtime changes

### Scene loader API support

`FBXFileLoader` implements Babylon's async loader plugin surface:

- `importMeshAsync`
- `loadAsync`
- `loadAssetContainerAsync`

`loadAssetContainerAsync` builds into the scene, transfers created entities into an `AssetContainer`, then removes them from the scene so the container owns them.

### Root and axis conversion

The loader creates a root transform named `__fbx_root__`.

For Babylon's default left-handed scene, the root applies the FBX right-handed-to-left-handed conversion:

- `rootNode.rotation.y = Math.PI`
- `rootNode.scaling.z = -1`

If the FBX global settings require a non-identity basis conversion, the loader adds `__fbx_axis_conversion__` under `__fbx_root__`.

### Transform and geometry handling

The loader now centralizes FBX transform math through helpers in `interpreter/transform.ts`:

- local transforms
- geometric transforms
- geometric normal transforms
- rotation order handling
- pivot/offset components

Geometry creation applies geometric transform data to positions, normals, tangents, and morph targets where appropriate. This is separate from node transforms, matching FBX's distinction between model transforms and geometric transforms.

### Materials and textures

Material creation currently uses `StandardMaterial`.

Texture slots mapped:

- `DiffuseColor` -> `material.diffuseTexture`
- `NormalMap`, `NormalMapTexture`, `normalCamera` -> `material.bumpTexture`
- `Bump`, `BumpFactor` -> `material.bumpTexture`
- `EmissiveColor` -> `material.emissiveTexture`
- `AmbientColor` -> `material.ambientTexture`
- `SpecularColor` -> `material.specularTexture`
- `TransparencyFactor`, `TransparentColor` -> `material.opacityTexture`
- `ReflectionColor`, `ReflectionFactor` -> `material.reflectionTexture`

Normal-related slots now call `_configureNormalTexture`.

Current normal map configuration:

```ts
texture.gammaSpace = false;
material.invertNormalMapX = !scene.useRightHandedSystem;
material.invertNormalMapY = !scene.useRightHandedSystem;
```

This means normal maps are treated as non-color data and the default left-handed Babylon scene inverts both X and Y normal map axes.

### Tangent handedness fix

A key fix was made for normal maps that still looked inverted.

The loader had been multiplying tangent `w` handedness by `-1` in left-handed scenes. That was removed. Babylon's tangent shader path uses `tangent.w` to build the bitangent, and it bypasses the material `invertNormalMapY` derivative fallback path when tangents are present. Flipping `tangent.w` in the loader was therefore still inverting the bitangent for assets with tangents.

Current behavior:

- Authored tangents are preserved after geometric normal transforms.
- Generated tangents compute handedness from tangent, bitangent, and normal only.
- No additional scene-handedness multiplier is applied to tangent `w`.

Relevant code paths:

- `fbxFileLoader.ts`: tangent assignment around `_createMesh`
- `generateTangents(...)`
- removed `applyTangentHandednessScale(...)`

## Tests added

FBX unit tests were added under `packages/dev/loaders/test/unit/FBX/`.

Key coverage:

- `dynamic.test.ts`
  - verifies `import "loaders/FBX"` side-effect registration
  - verifies `registerBuiltInLoaders()` dynamic registration
- `materials.test.ts`
  - verifies `NormalMap` textures are configured as normal maps
  - verifies `Bump` textures are also configured as normal maps
  - verifies generated tangent handedness is preserved in a left-handed scene
- `parsers/zlibInflate.test.ts`
  - verifies stored, fixed-Huffman, dynamic-Huffman, overlapping back-reference, corruption, and size mismatch cases
- `interpreter/geometry.test.ts`
  - verifies concave polygon triangulation
  - verifies degenerate n-gon diagnostics
  - verifies tangent/binormal layer expansion
- `interpreter/transform.test.ts`
  - verifies rotation order and transform chain behavior
- `interpreter/connections.test.ts`
  - verifies invalid connection diagnostics and legacy synthetic geometry behavior
- `interpreter/propertyTemplates.test.ts`
  - verifies local properties override template defaults
- `interpreter/blendShapes.test.ts`
  - verifies in-between blend shape weight handling

Validation commands run successfully:

```powershell
npx vitest run --project=unit packages\dev\loaders\test\unit\FBX\materials.test.ts
npx vitest run --project=unit packages\dev\loaders\test\unit\FBX\materials.test.ts packages\dev\loaders\test\unit\FBX\dynamic.test.ts
npm run compile -w @dev/loaders
```

## Devhost validation changes

Manual validation used Babylon devhost at:

```text
http://localhost:1338/?exp=testScene
```

The local validation scene loads:

```ts
import "loaders/FBX";
import { ImportMeshAsync } from "core/Loading/sceneLoader";

const result = await ImportMeshAsync("dice_animation.fbx", scene, {
    rootUrl: "/fbx/",
    pluginExtension: ".fbx",
});
```

The FBX test asset is served from:

```text
packages/tools/devHost/public/fbx/dice_animation.fbx
```

Devhost was also adjusted locally to:

- use `ArcRotateCamera`
- attach camera controls to the canvas
- open Inspector v2 in embedded mode
- fix canvas CSS sizing so the scene center aligns with the visible embedded canvas
- use a directional light at a 45 degree downward angle

These devhost changes were for debugging and may not need to be mirrored into the PoC unless the PoC has the same validation harness.

## Alignment checklist for `babylon-fbx`

To keep the PoC aligned, port these changes back:

1. Ensure `.fbx` plugin metadata and registration match `fbxFileLoader.metadata.ts` and `RegisterSceneLoaderPlugin(new FBXFileLoader())`.
2. Mirror material slot handling for `NormalMap`, `NormalMapTexture`, `normalCamera`, `Bump`, and `BumpFactor`.
3. Ensure normal textures set `gammaSpace = false`.
4. Ensure left-handed Babylon scenes set both `invertNormalMapX` and `invertNormalMapY` to `true`.
5. Remove any extra left-handed multiplier applied to tangent `w`.
6. Preserve or add tests for normal texture setup and tangent handedness.
7. Keep root handedness conversion and optional axis conversion root behavior aligned with the Babylon loader.

## Notes and open investigation areas

- Texture loading currently falls back from `relativeFileName` / `fileName` to basename under `rootUrl`.
- Displacement and shininess textures are recognized but not directly mapped to `StandardMaterial`.
- The mesh centering wrapper `fbxDebugAssetRoot` was only a temporary devhost debugging aid and is not part of the loader.
- If normal maps still appear inverted in a particular asset, inspect whether the mesh has authored tangents. With tangents present, `tangent.w` controls bitangent orientation more directly than `invertNormalMapY`.
