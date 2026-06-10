# FBX loader migration handoff

Date: 2026-05-18

## Goal

Integrate the standalone `babylon-fbx` loader into the Babylon.js monorepo as a peer loader to OBJ, STL, SPLAT, BVH, and glTF.

The intended target is:

```text
packages\dev\loaders\src\FBX\
```

This should become part of the `@babylonjs/loaders` package through the normal Babylon.js build pipeline.

## Current repo state

Source repo:

```text
C:\Users\patricr\sourceControl\github\babylon-fbx
branch: main
commit: 118f961
```

Target repo:

```text
C:\Users\patricr\sourceControl\github\Babylon.js
branch: master
```

Files have already been copied into the Babylon.js repo:

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

Current `git status --short` in Babylon.js should show:

```text
?? packages/dev/loaders/src/FBX/
```

The copied files have already had the first mechanical import pass applied:

- `@babylonjs/core/...` imports were changed to `core/...`.
- Relative `.js` import suffixes were removed.
- A Babylon-style `fbxFileLoader.metadata.ts` was added.
- `FBX\index.ts` exports `FBXFileLoaderMetadata`.
- `FBXFileLoader` now uses `FBXFileLoaderMetadata.name` and `FBXFileLoaderMetadata.extensions`.

The loader is **not yet wired** into the package barrels or dynamic registration.

## What the FBX loader currently supports

The standalone loader is a pure TypeScript FBX importer that implements Babylon `ISceneLoaderPluginAsync`.

Supported or substantially implemented areas:

- Binary and ASCII FBX parsing.
- FBX 7.5+ 64-bit binary node headers.
- Internal zlib/deflate inflater for compressed FBX numeric arrays.
- Scoped FBX 6 legacy static mesh/material support with string-named object connections.
- FBX `Objects` and `Connections` graph resolution.
- Mesh geometry with polygon triangulation, normals, UV sets, vertex colors, material indices, tangents, binormals, and control-point index preservation.
- Tangent generation when normal-mapped meshes lack explicit tangents.
- Standard-material mapping for Lambert/Phong-style material properties and common texture slots.
- Embedded texture data from `Video/Content` nodes.
- Texture UV transforms and named UV set selection.
- Axis conversion and left-handed/right-handed scene handling.
- Model transforms: local TRS, pivots, offsets, pre/post rotation, rotation order, geometric transforms.
- Skins, clusters, bind poses, shared deformation rig resolution, and up to 8 bone influencers using Babylon extra influence buffers.
- `InheritType = 2` scale compensation using synthetic helper bones.
- Blend shapes and `FullWeights`-aware in-between morph target influence mapping.
- Animation stacks/layers/curves, model/bone TRS animation, sampled/baked curve detection, cubic/linear/constant curve sampling, and blend-shape `DeformPercent`.
- Basic cameras and lights.
- Diagnostic preservation for unsupported or runtime-gated FBX features.

Known diagnostic-only/runtime-gated areas include constraints, helper/control-set data, non-bind poses, unsupported deformer subtypes, layered textures, many non-TRS animated properties such as visibility/camera/light/material curves, `TransformAssociateModel` associate semantics, some cluster modes, and global `UnitScaleFactor` consistency.

## Architecture of copied code

The loader has three layers:

1. Parser layer: `FBX\parsers\`
   - `fbxBinaryParser.ts`
   - `fbxAsciiParser.ts`
   - `zlibInflate.ts`
   - Produces the shared `FBXDocument` tree.
   - Must remain Babylon-core independent.

2. Interpreter layer: `FBX\interpreter\`
   - Resolves FBX graph data into semantic scene data.
   - Still mostly Babylon-independent.
   - Handles geometry, materials, skins, rigs, blend shapes, animations, cameras, lights, global settings, and diagnostics.

3. Babylon runtime layer: `FBX\fbxFileLoader.ts`
   - Implements SceneLoader plugin methods.
   - Converts interpreted FBX data into Babylon meshes/materials/skeletons/morph targets/animation groups/cameras/lights.

## Integration tasks still needed

### 1. Wire exports

Update:

```text
packages\dev\loaders\src\index.ts
```

Add:

```ts
export * from "./FBX/index";
```

### 2. Wire dynamic loader registration

Update:

```text
packages\dev\loaders\src\dynamic.ts
```

Add import:

```ts
import { FBXFileLoaderMetadata } from "./FBX/fbxFileLoader.metadata";
```

Add registration in `registerBuiltInLoaders()`:

```ts
RegisterSceneLoaderPlugin({
    ...FBXFileLoaderMetadata,
    createPlugin: async () => {
        const { FBXFileLoader } = await import("./FBX/fbxFileLoader");
        return new FBXFileLoader();
    },
} satisfies ISceneLoaderPluginFactory);
```

If an options object is added later, mirror the OBJ/glTF pattern:

```ts
return new FBXFileLoader(options[FBXFileLoaderMetadata.name]);
```

### 3. Add SceneLoader options declaration if desired

The current standalone loader has no public loading options. If keeping it optionless, this may not be needed.

If Babylon conventions require every loader to augment `SceneLoaderPluginOptions`, add a small declaration in `fbxFileLoader.ts`, similar to STL:

```ts
declare module "core/Loading/sceneLoader" {
    export interface SceneLoaderPluginOptions {
        /**
         * Defines options for the FBX loader.
         */
        [FBXFileLoaderMetadata.name]: {};
    }
}
```

Do not introduce options unless there is a concrete need; the first PR should minimize API surface.

### 4. Confirm metadata style

Current added file:

```text
packages\dev\loaders\src\FBX\fbxFileLoader.metadata.ts
```

Current contents:

```ts
import { type ISceneLoaderPluginExtensions, type ISceneLoaderPluginMetadata } from "core/index";

export const FBXFileLoaderMetadata = {
    name: "fbx",

    extensions: {
        ".fbx": { isBinary: true },
    } as const satisfies ISceneLoaderPluginExtensions,
} as const satisfies ISceneLoaderPluginMetadata;
```

This mirrors STL/glTF metadata. Confirm maintainers want `.fbx` treated as binary even though ASCII FBX exists. This is probably correct because forcing `ArrayBuffer` lets the loader inspect the magic/header and choose binary vs ASCII itself.

### 5. Compile and fix TypeScript issues

Attempted command:

```bash
npm run compile -w @dev/loaders
```

Current environment result:

```text
'tsc' is not recognized as an internal or external command
```

Likely next step is to run dependency setup in the Babylon.js repo:

```bash
npm install
```

Then retry:

```bash
npm run compile -w @dev/loaders
```

Potential compile fixes to expect:

- Missing imports due to internal Babylon path differences.
- TSDoc/JSDoc requirements for exported public APIs.
- ESLint formatting/naming rules.
- `Blob`, `TextDecoder`, `ArrayBufferView`, or DOM type availability in the loaders tsconfig.
- `Readonly`/mutable type friction from metadata `as const` extension typing.
- Loader interface signature drift between standalone `@babylonjs/core@9.6.2` and current Babylon.js master.

### 6. Run formatter/linter after compile

Use Babylon repo commands where possible:

```bash
npm run lint:changed
npm run lint:changed:fix
```

or package-local equivalents if available.

If formatting only:

```bash
npx prettier --write "packages/dev/loaders/src/FBX/**/*.ts"
```

Prefer repo scripts over ad hoc commands.

### 7. Add tests

Do not copy the full standalone `tests\models` fixture library into Babylon.js.

Recommended first PR tests:

```text
packages\dev\loaders\test\unit\FBX\
  parsers\
    fbxBinaryParser.test.ts
    fbxAsciiParser.test.ts
    zlibInflate.test.ts
  interpreter\
    geometry.test.ts
    connections.test.ts
    animationDiagnostics.test.ts
    blendShapes.test.ts
    transform.test.ts
    skinningDiagnostics.test.ts
  fbxFileLoader.test.ts
```

Port tests from the standalone repo selectively:

```text
C:\Users\patricr\sourceControl\github\babylon-fbx\tests\
```

Best first candidates:

- `tests\parsers\binaryParser.test.ts`
- `tests\parsers\asciiParser.test.ts`
- `tests\parsers\zlibInflate.test.ts`
- `tests\interpreter\geometry.test.ts`
- `tests\interpreter\connections.test.ts`
- `tests\interpreter\animationDiagnostics.test.ts`
- `tests\interpreter\blendShapes.test.ts`
- `tests\interpreter\transform.test.ts`
- `tests\interpreter\skinningDiagnostics.test.ts`
- Focused pieces of `tests\fbxFileLoader.test.ts`

Avoid or defer tests that depend on large real-world fixture models unless maintainers approve adding those assets.

### 8. Add a minimal integration smoke test

Consider updating:

```text
packages\dev\loaders\test\integration\babylon.sceneLoader.test.ts
packages\dev\loaders\test\integration\testData.ts
```

Add a tiny ASCII FBX raw string or base64 payload that creates one triangle/mesh/material, then verify SceneLoader can import `.fbx`.

Pattern to follow:

- OBJ/STL/glTF tests in `babylon.sceneLoader.test.ts`.
- Inline data in `testData.ts`.

Potential challenge: a minimal valid FBX string can still be verbose. It may be easier to port a tiny synthetic document unit test first and leave browser SceneLoader integration for a second PR if payload size becomes noisy.

### 9. Documentation updates

Likely files:

```text
packages\dev\loaders\readme.md
packages\public\@babylonjs\loaders\readme.md
```

The public package is usually generated, so avoid manually editing generated outputs unless the repo workflow expects it.

Potential dev readme addition:

```js
import "@babylonjs/loaders/FBX";
```

Also consider docs-site updates later, but probably not in the first code migration PR unless required.

## Build/test commands to try

After dependency install:

```bash
npm run compile -w @dev/loaders
npm run test -w @dev/loaders
npm run build:source
npm run lint:changed
```

Before PR, Babylon contributing guidance currently asks for:

```bash
npm run build:dev
npm run test:unit
```

Those may be expensive. For iteration, start with package-local compile/tests, then run broader commands before opening the PR or when CI-like confidence is needed.

## Standalone tests and fixtures context

The standalone repo has many real-world fixtures and visual debugging reports. They are useful context, but should not all move into Babylon.

Important standalone files:

```text
C:\Users\patricr\sourceControl\github\babylon-fbx\README.md
C:\Users\patricr\sourceControl\github\babylon-fbx\reports\20260518_agent_context_handoff.md
C:\Users\patricr\sourceControl\github\babylon-fbx\reports\20260518_unsupported_feature_model_needs.md
C:\Users\patricr\sourceControl\github\babylon-fbx\reports\20260518_inherit_type_2_helper_compensation.md
C:\Users\patricr\sourceControl\github\babylon-fbx\reports\20260516_135207_fbx_feature_support_audit.md
C:\Users\patricr\sourceControl\github\babylon-fbx\tests\
```

The report `20260518_unsupported_feature_model_needs.md` is especially useful for deciding which unsupported FBX features should stay diagnostic-only until there are targeted models.

## Important implementation guardrails

### Keep parser/interpreter layering

The parser layer should remain Babylon-independent:

```text
FBX\parsers\
FBX\types\
```

Most interpreter files should also stay independent of Babylon runtime classes. Babylon-specific imports should remain concentrated in:

```text
FBX\fbxFileLoader.ts
```

### Preserve diagnostics rather than guessing

This project intentionally preserves unsupported FBX features as diagnostics/metadata instead of adding speculative runtime behavior.

Diagnostic-first features include:

- Constraints.
- Helper/control-set data.
- Non-bind poses.
- Unsupported deformer subtypes.
- Layered textures.
- Animation layer blending.
- Unsupported/non-TRS curve nodes.
- `TransformAssociateModel` associate skinning semantics.
- Some non-default transform inheritance behavior.

Do not silently drop these.

### Be careful with skinning and transform invariants

Important skinning rules from the standalone loader:

- Skin weights are keyed by original FBX control point indices, not expanded Babylon vertex indices.
- Keep `controlPointIndices` aligned through geometry processing.
- Use `Cluster.TransformLink` and bind-pose data carefully; do not conflate animation local matrices with bind matrices.
- For ordinary rigs, create authored local/rest bones first, then set bind data without overwriting animation locals.
- `InheritType = 2` uses synthetic helper bones named `__fbx_scaleCompensation`; do not assume `skeleton.bones[sourceIndex]` always points to the source bone because helper bones are inserted.
- The artificial `__fbx_root__` handedness conversion root must not be folded into skin bind/pose matrices.

### Be careful with tangent/normal-map behavior

Important tangent/material rules:

- Explicit FBX tangents are used when present.
- If tangents are absent but normals and UVs exist, the loader generates tangents.
- Tangent handedness is adjusted for Babylon left-handed conversion.
- `NormalMap`, `NormalMapTexture`, and `normalCamera` are tangent-space normal maps.
- `Bump` and `BumpFactor` are not forced through the same normal-map inversion/data-texture path because they are often height/bump maps.

### Do not move viewer-specific behavior

Do not copy:

```text
C:\Users\patricr\sourceControl\github\babylon-fbx\viewer\
```

The viewer contains asset-specific material/texture/culling overrides for debugging and visual comparison. Those are not general loader behavior.

Examples of viewer-only behavior that should not be promoted blindly:

- Chernovan texture overrides.
- Chernovan glass translucency override.
- WW1 Plane texture/culling overrides.
- Cloud Station fish unlit/PBR reference tweaks.
- Dropdown/status-pane logic.

## PR strategy recommendation

Keep the first Babylon.js PR scoped:

1. Add the FBX loader source under `packages\dev\loaders\src\FBX`.
2. Wire the package exports and dynamic registration.
3. Add focused unit tests for parser/interpreter/runtime basics.
4. Add a very small SceneLoader smoke test if practical.
5. Document unsupported/diagnostic-only areas.
6. Avoid large fixtures, visual viewer infrastructure, or broad unsupported feature work in the first PR.

Suggested PR framing:

> Add an initial TypeScript FBX loader to `@babylonjs/loaders`. This supports binary/ASCII FBX parsing, static and skinned meshes, materials/textures including embedded texture payloads, skeletons, blend shapes, basic animation, cameras/lights, and diagnostics for unsupported FBX features. The implementation is fixture-driven and intentionally preserves unsupported FBX data as diagnostics rather than silently dropping it.

## Suggested first prompt for an agent in Babylon.js

Use this prompt when opening a new agent session in the Babylon.js repo:

> You are in the Babylon.js repo. A standalone FBX loader has already been copied into `packages\dev\loaders\src\FBX`. Please integrate it into the loaders package following existing OBJ/STL/glTF conventions. First inspect `packages\dev\loaders\src\FBX`, `packages\dev\loaders\src\index.ts`, `packages\dev\loaders\src\dynamic.ts`, and nearby loader patterns. Wire FBX exports and dynamic registration using `FBXFileLoaderMetadata`. Then install/build dependencies if needed and run `npm run compile -w @dev/loaders`. Fix compile/lint issues while preserving the parser/interpreter/runtime layering. Port focused tests from the sibling standalone repo `..\babylon-fbx\tests` into `packages\dev\loaders\test\unit\FBX`, preferring synthetic/minimal fixtures and not copying the large model fixture set or viewer. Add a minimal SceneLoader smoke test only if practical. Keep unsupported FBX features diagnostic-only unless there is a targeted fixture proving runtime behavior.

## Current known blocker

Package compile was attempted but failed before TypeScript ran:

```text
'tsc' is not recognized as an internal or external command
```

This likely means dependencies are not installed or the repo setup has not been completed in this checkout. Run `npm install` in the Babylon.js repo before compile/build work.

## Useful source-to-target mapping

Standalone source:

```text
C:\Users\patricr\sourceControl\github\babylon-fbx\src\fbxFileLoader.ts
C:\Users\patricr\sourceControl\github\babylon-fbx\src\index.ts
C:\Users\patricr\sourceControl\github\babylon-fbx\src\interpreter\*.ts
C:\Users\patricr\sourceControl\github\babylon-fbx\src\parsers\*.ts
C:\Users\patricr\sourceControl\github\babylon-fbx\src\types\*.ts
```

Babylon target:

```text
C:\Users\patricr\sourceControl\github\Babylon.js\packages\dev\loaders\src\FBX\
```

Standalone tests:

```text
C:\Users\patricr\sourceControl\github\babylon-fbx\tests\
```

Babylon test target:

```text
C:\Users\patricr\sourceControl\github\Babylon.js\packages\dev\loaders\test\unit\FBX\
```

## Final note

The copied code is a starting point, not a finished Babylon.js integration. The next agent should treat the current FBX directory as staged source material that still needs Babylon repo compile/lint/test adaptation.
