# FBX loader migration reply report

Date: 2026-05-19

This report replies to `FBX_LOADER_BABYLON_MIGRATION_REPORT.md` from the standalone `babylon-fbx` repo and records the follow-up decisions made in the standalone loader after reviewing embedded normal-map behavior. It is intended to guide the Babylon.js integration work so the copied `packages\dev\loaders\src\FBX` code is updated to match the current standalone source before PR preparation.

## Executive summary

The biggest correction to the migration report is normal-map convention handling.

The prior migration report described normal-map setup as scene-handedness based:

```ts
texture.gammaSpace = false;
material.invertNormalMapX = !scene.useRightHandedSystem;
material.invertNormalMapY = !scene.useRightHandedSystem;
```

That is no longer the intended behavior. Normal-map channel convention is independent from Babylon scene handedness. It describes the tangent-space meaning of the normal texture's green/Y channel after all scene and mesh coordinate conversions are already accounted for.

The standalone loader now treats FBX normal-map slots as **Y-up** by default and exposes an explicit option for **Y-down** normal maps:

```ts
new FBXFileLoader({ normalMapCoordinateSystem: "y-down" })
```

The default is:

```ts
new FBXFileLoader({ normalMapCoordinateSystem: "y-up" })
```

or simply:

```ts
new FBXFileLoader()
```

## Why this changed

The embedded-texture fixtures changed the conclusion about normal-map defaults.

Most earlier visual testing used FBX files with sibling PBR texture files. Those textures were often assigned or converted through the standalone viewer path, not purely by the FBX loader's embedded texture path. That made the loader's true normal-map behavior harder to isolate.

Two embedded FBX fixtures then exposed the issue more directly:

```text
tests\models\dice_animation\dice_animation.fbx
tests\models\test_plate\test_plate.fbx
```

Both connect embedded PNG textures through true FBX normal-map slots, not through `Bump` or `BumpFactor`. The source geometry lacks FBX tangents/binormals, so the loader generates tangents. These normal maps are authored as Y-up normal maps. Interpreting the green/Y channel as Y-down makes the test plate read backwards: concave detail appears convex and convex detail appears concave.

The team decided to make a clear policy choice:

- FBX itself does not standardize tangent-space normal-map Y direction.
- glTF requires the Y-up/OpenGL-style convention.
- USD workflows commonly use Y-up normal maps.
- Modern asset pipelines increasingly expect glTF/USD-style tangent-space normal maps.
- Therefore, the FBX loader should default to Y-up, while allowing an explicit Y-down option for assets authored the other way.

## Terminology decision

Avoid naming the public API after graphics APIs such as `opengl` and `directx`.

Those names require users to already know what the APIs imply. The clearer user-facing concept is the direction of the normal texture coordinate system's Y/green channel:

```ts
export type FBXNormalMapCoordinateSystem = "y-up" | "y-down";
```

The loader option is:

```ts
export interface FBXFileLoaderOptions {
    /**
     * Source convention for tangent-space normal maps connected through FBX normal-map slots.
     * FBX does not standardize this, so the loader defaults to the glTF/USD-style Y-up convention.
     * Set to "y-down" for assets authored with inverted green/Y normal maps.
     */
    normalMapCoordinateSystem?: FBXNormalMapCoordinateSystem;
}
```

## Required Babylon.js loader API shape

Update the Babylon.js copy of `FBXFileLoader` to accept options:

```ts
export type FBXNormalMapCoordinateSystem = "y-up" | "y-down";

export interface FBXFileLoaderOptions {
    /**
     * Source convention for tangent-space normal maps connected through FBX normal-map slots.
     * FBX does not standardize this, so the loader defaults to the glTF/USD-style Y-up convention.
     * Set to "y-down" for assets authored with inverted green/Y normal maps.
     */
    normalMapCoordinateSystem?: FBXNormalMapCoordinateSystem;
}

export class FBXFileLoader implements ISceneLoaderPluginAsync {
    private readonly _options: Required<FBXFileLoaderOptions>;

    public constructor(options: FBXFileLoaderOptions = {}) {
        this._options = {
            normalMapCoordinateSystem: options.normalMapCoordinateSystem ?? "y-up",
        };
    }
}
```

If the Babylon.js integration uses `FBXFileLoaderMetadata.name` instead of the hardcoded standalone `name = "fbx"`, keep that metadata pattern. The option still belongs on the loader instance.

## Required SceneLoader options wiring in Babylon.js

The original handoff suggested not introducing options unless there was a concrete need. There is now a concrete need.

Add or update the SceneLoader plugin options declaration in the Babylon.js `fbxFileLoader.ts` copy, following the pattern used by other loaders:

```ts
declare module "core/Loading/sceneLoader" {
    export interface SceneLoaderPluginOptions {
        /**
         * Defines options for the FBX loader.
         */
        [FBXFileLoaderMetadata.name]: FBXFileLoaderOptions;
    }
}
```

Then make dynamic loader registration pass the per-plugin options through:

```ts
RegisterSceneLoaderPlugin({
    ...FBXFileLoaderMetadata,
    createPlugin: async (options) => {
        const { FBXFileLoader } = await import("./FBX/fbxFileLoader");
        return new FBXFileLoader(options[FBXFileLoaderMetadata.name]);
    },
} satisfies ISceneLoaderPluginFactory);
```

If the exact `createPlugin` callback signature differs on Babylon.js master, follow the existing glTF/OBJ/STL loader option pattern in `packages\dev\loaders\src\dynamic.ts`. The important requirement is that:

```ts
pluginOptions.fbx.normalMapCoordinateSystem
```

or the current repo's equivalent plugin-options path reaches the `FBXFileLoader` constructor.

## Side-effect registration instruction

The Babylon.js copy currently registers the side-effect plugin with:

```ts
RegisterSceneLoaderPlugin(new FBXFileLoader());
```

That is still fine for default behavior. It should preserve the default Y-up behavior.

Do not hardcode Y-down in side-effect registration. Y-down should be opt-in through SceneLoader/plugin options or direct loader construction.

## Correct normal texture configuration

Replace scene-handedness-based normal texture configuration with normal-map-coordinate-system-based configuration.

Standalone current behavior:

```ts
private static _configureNormalTexture(
    texture: Texture,
    material: StandardMaterial,
    normalMapCoordinateSystem: FBXNormalMapCoordinateSystem
): void {
    texture.gammaSpace = false;
    material.invertNormalMapX = false;
    material.invertNormalMapY = normalMapCoordinateSystem === "y-down";
}
```

Important details:

- `texture.gammaSpace = false` remains required because normal maps are data textures.
- `invertNormalMapX` is not driven by scene handedness.
- `invertNormalMapY` is not driven by scene handedness.
- `invertNormalMapY` is true only for Y-down normal-map source textures.
- The setting applies only to tangent-space normal-map slots:
  - `NormalMap`
  - `NormalMapTexture`
  - `normalCamera`
- Do not apply this data/inversion setup to:
  - `Bump`
  - `BumpFactor`

`Bump` and `BumpFactor` often represent grayscale height/bump data rather than tangent-space normal maps. They may still be routed to `material.bumpTexture` for existing StandardMaterial behavior, but they should not be forced through normal-map channel convention handling.

## Follow-up on `Bump` / `BumpFactor` compatibility risk

The Babylon.js integration agent raised a valid concern: although FBX `Bump` and `BumpFactor` are conceptually height/bump slots, real FBX exporters sometimes put tangent-space RGB normal maps in those slots. A hard policy of "never treat Bump as a normal map" is conservative and semantically clean, but it can regress assets that rely on exporter quirks.

The standalone repo currently keeps `Bump` and `BumpFactor` separate from normal-map convention handling because:

- the embedded fixtures that proved the Y-up/Y-down issue use true `NormalMap` connections;
- FBX bump slots can be grayscale height data;
- applying normal-map green-channel convention to height maps is wrong;
- assigning everything to `StandardMaterial.bumpTexture` already conflates height/bump and tangent-space normal concepts because `StandardMaterial` has one slot.

For Babylon.js integration, the best compromise is not to go back to unconditional normal-map handling for `Bump`, but to expose explicit policy and leave room for heuristics.

Recommended additional option:

```ts
export type FBXBumpTextureMode = "height" | "normal" | "auto";

export interface FBXFileLoaderOptions {
    /**
     * Source convention for tangent-space normal maps connected through FBX normal-map slots.
     */
    normalMapCoordinateSystem?: FBXNormalMapCoordinateSystem;

    /**
     * Controls how FBX Bump and BumpFactor texture slots are interpreted.
     *
     * - "height": treat Bump/BumpFactor as height/bump data and do not apply tangent-space normal-map convention handling.
     * - "normal": treat Bump/BumpFactor as tangent-space normal maps.
     * - "auto": classify Bump/BumpFactor textures using connection metadata and filename heuristics.
     */
    bumpTextureMode?: FBXBumpTextureMode;
}
```

Suggested default:

```ts
bumpTextureMode: "height"
```

for the standalone PoC, because it is semantically conservative and matches the current verified tests.

For the Babylon.js PR, consider whether maintainers prefer:

```ts
bumpTextureMode: "auto"
```

as the package default to preserve compatibility with exporter quirks. If `"auto"` is chosen, it must be tested with real or targeted FBX fixtures before claiming broad support.

Suggested `"auto"` heuristic:

1. Always treat `NormalMap`, `NormalMapTexture`, and `normalCamera` as tangent-space normal maps.
2. For `Bump` / `BumpFactor`, treat as tangent-space normal maps only when there is evidence, such as:
   - texture filename contains `normal`, `norm`, `nrm`, or common normal-map suffixes;
   - texture filename contains API/convention hints such as `directx`, `dx`, `opengl`, or `gl` only as heuristic inputs, while the public option remains Y-up/Y-down;
   - FBX texture or material metadata explicitly identifies normal-map usage;
   - a future image inspection path identifies RGB normal-map-like data, if implemented.
3. Otherwise treat `Bump` / `BumpFactor` as height/bump data and do not apply normal-map convention handling.

If a `Bump` texture is classified as a tangent-space normal map, then all the same normal-map rules apply:

- `texture.gammaSpace = false`;
- apply `normalMapCoordinateSystem`;
- apply tangent `w` scaling for explicit/generated tangent paths.

If a `Bump` texture is classified as height/bump data:

- do not apply Y-up/Y-down convention handling;
- do not flip tangent `w` because of this texture;
- do not force normal-map inversion flags;
- keep the texture assignment as a best-effort `StandardMaterial.bumpTexture` mapping unless a better Babylon material path is chosen later.

This means the Babylon.js integration can preserve flexibility without pretending FBX `Bump` is always one thing.

## Texture creation API note

The Babylon.js `Texture` constructor supports `ITextureCreationOptions`, and the glTF loader already uses that path:

```ts
const textureCreationOptions = {
    noMipmap: samplerData.noMipMaps,
    invertY: false,
    samplingMode: samplerData.samplingMode,
    mimeType: image.mimeType ?? GetMimeType(image.uri ?? ""),
    loaderOptions: textureLoaderOptions,
    useSRGBBuffer: !!useSRGBBuffer && this._parent.useSRGBBuffers,
};

const babylonTexture = new Texture(null, this._babylonScene, textureCreationOptions);
```

The FBX loader should consider using `ITextureCreationOptions` for both embedded and external textures, especially during Babylon.js integration.

Where it helps:

- loading embedded texture bytes directly through `buffer` instead of creating a `Blob` URL;
- setting `mimeType`;
- setting `forcedExtension` when FBX filenames are unreliable;
- setting `gammaSpace` at creation time for known data textures;
- setting `useSRGBBuffer` consistently with Babylon package policy;
- setting `invertY` for image upload orientation if needed;
- passing image-loader-specific options through `loaderOptions`.

Where it does not solve the normal-map issue:

- `invertY` flips image rows/UV upload orientation; it is not the same as flipping the green/Y normal channel;
- `gammaSpace` / `useSRGBBuffer` handle color-space sampling, not tangent-space Y direction;
- `ITextureCreationOptions` does not replace the need to adjust tangent handedness for explicit/generated tangent paths.

So yes, `ITextureCreationOptions` can reduce custom texture-loading code and make embedded texture handling cleaner, but the normal-map coordinate-system option is still required at the FBX material/tangent interpretation layer.

## Why material `invertNormalMapY` is not enough

Babylon's shader path matters.

When explicit tangents are present, Babylon builds the TBN basis from tangent data:

```glsl
vec3 tbnBitangent = cross(tbnNormal, tbnTangent) * tangentUpdated.w;
vTBN = mat3(finalWorld) * mat3(tbnTangent, tbnBitangent, tbnNormal);
```

In that path, the sampled normal's Y direction is controlled by the bitangent basis and `tangent.w`. Material inversion flags do not reliably fix a green-channel convention mismatch after explicit/generated tangents exist.

The standalone FBX loader also generates tangents whenever geometry has normals and UVs but omits FBX tangent layers. That means most normal-mapped FBX geometry will use an explicit tangent path after import, even if the source FBX did not author tangents.

Therefore, the loader must handle the normal-map Y convention in tangent data as well as material setup.

## Correct tangent handedness behavior

The standalone loader now uses the normal-map coordinate system, not scene handedness, to decide whether to flip tangent-space Y interpretation.

Add this helper:

```ts
private _getNormalMapTangentHandednessScale(): 1 | -1 {
    return this._options.normalMapCoordinateSystem === "y-down" ? -1 : 1;
}
```

Use it for authored/source tangents:

```ts
if (geomData.tangents) {
    const tangents = float64To32(geomData.tangents);

    // Keep existing geometric normal/tangent transform handling here.

    applyTangentHandednessScale(tangents, this._getNormalMapTangentHandednessScale());
    vertexData.tangents = tangents;
}
```

Use it for generated tangents:

```ts
vertexData.tangents = generateTangents(
    positions,
    normals,
    vertexData.uvs,
    geomData.indices,
    this._getNormalMapTangentHandednessScale(),
    geomData.controlPointIndices,
    geomData.materialIndices
);
```

The important change is to remove this old scene-handedness multiplier:

```ts
scene.useRightHandedSystem ? 1 : -1
```

from tangent `w` handling.

Default Y-up behavior should preserve source/generated tangent handedness. Y-down behavior should multiply tangent `w` by `-1`, which flips the bitangent and is equivalent to flipping the normal map green/Y channel for tangent-space interpretation.

## Response to specific migration report sections

### Babylon.js integration points

The integration points listed in the migration report are still broadly correct:

- package barrel export
- dynamic loader registration
- `FBX\index.ts`
- metadata
- side-effect registration

Required update: because the loader now has a real option, dynamic registration should pass loader-specific options into `new FBXFileLoader(...)` instead of always constructing an optionless loader.

### Materials and textures

The texture slot mapping list is still correct except for the way normal-map setup was described.

Replace the old "left-handed scenes invert both X and Y" statement with:

- FBX normal-map slots are treated as Y-up by default.
- Y-down is opt-in through `normalMapCoordinateSystem: "y-down"`.
- Scene handedness does not determine normal texture coordinate system.
- `Bump` and `BumpFactor` are not treated as tangent-space normal-map convention slots.

### Tangent handedness fix

The migration report correctly identified that extra left-handed tangent `w` multiplication caused embedded normal maps to look inverted.

Update the report's implementation note:

- Do not say `applyTangentHandednessScale(...)` was removed entirely.
- Instead, the helper may remain, but its scale is driven by normal-map coordinate system:
  - `"y-up"` -> `+1`
  - `"y-down"` -> `-1`
- It must not be driven by `scene.useRightHandedSystem`.

### Tests added

The Babylon.js materials tests should be updated to match the new names and behavior.

Recommended tests:

1. `NormalMap` defaults to Y-up:
   - `texture.gammaSpace === false`
   - `material.invertNormalMapX === false`
   - `material.invertNormalMapY === false`
2. `normalMapCoordinateSystem: "y-down"` flips tangent-space Y:
   - `material.invertNormalMapY === true`
   - generated tangent `w` values are multiplied by `-1`
   - authored/source tangent `w` values are multiplied by `-1`
3. `Bump` and `BumpFactor` are not affected by the normal-map coordinate-system option:
   - do not force `gammaSpace = false`
   - do not set normal-map inversion flags because of this option
4. Default Y-up embedded normal-map fixture or synthetic equivalent:
   - verifies generated tangent `w` stays unmirrored
   - verifies concave/convex normal-map detail is not interpreted backwards, if a visual or pixel test exists

Avoid naming tests `OpenGL` or `DirectX` unless the test is specifically about a filename or external compatibility note. Prefer `Y-up` and `Y-down`.

### Alignment checklist

Replace the prior checklist items 3-6 with this updated version:

1. Ensure normal textures from `NormalMap`, `NormalMapTexture`, and `normalCamera` set `gammaSpace = false`.
2. Ensure FBX normal-map slots default to `normalMapCoordinateSystem: "y-up"`.
3. Ensure `normalMapCoordinateSystem: "y-down"` flips tangent-space Y interpretation.
4. Ensure scene handedness does not select normal-map coordinate system.
5. Remove any extra left-handed multiplier applied to tangent `w`.
6. Keep or add tests for:
   - default Y-up normal texture setup
   - Y-down option material setup
   - generated tangent Y flip under Y-down
   - authored tangent Y flip under Y-down
   - `Bump`/`BumpFactor` remaining separate

## Exact source references in standalone `babylon-fbx`

Use these standalone files as the source of truth when updating the Babylon.js copy:

```text
C:\Users\patricr\sourceControl\github\babylon-fbx\src\fbxFileLoader.ts
C:\Users\patricr\sourceControl\github\babylon-fbx\src\index.ts
C:\Users\patricr\sourceControl\github\babylon-fbx\tests\fbxFileLoader.test.ts
C:\Users\patricr\sourceControl\github\babylon-fbx\README.md
C:\Users\patricr\sourceControl\github\babylon-fbx\FBX_LOADER_TANGENT_NORMAL_REVIEW.md
C:\Users\patricr\sourceControl\github\babylon-fbx\reports\20260518_agent_context_handoff.md
```

Important standalone symbols:

```ts
FBXNormalMapCoordinateSystem
FBXFileLoaderOptions
normalMapCoordinateSystem
_configureNormalTexture(...)
_getNormalMapTangentHandednessScale()
applyTangentHandednessScale(...)
generateTangents(...)
```

## Direct construction examples

Default Y-up:

```ts
const loader = new FBXFileLoader();
```

Explicit Y-up:

```ts
const loader = new FBXFileLoader({ normalMapCoordinateSystem: "y-up" });
```

Y-down:

```ts
const loader = new FBXFileLoader({ normalMapCoordinateSystem: "y-down" });
```

## SceneLoader usage examples

The exact Babylon.js public option shape should follow the repo's current SceneLoader plugin-options conventions, but the intended user-facing concept is:

```ts
await SceneLoader.ImportMeshAsync(
    "",
    "/models/",
    "asset.fbx",
    scene,
    undefined,
    ".fbx",
    undefined,
    {
        fbx: {
            normalMapCoordinateSystem: "y-down",
        },
    }
);
```

If Babylon.js master uses a different overload or option object shape, adapt the example to that shape. The key requirement is that FBX loader options expose:

```ts
normalMapCoordinateSystem?: "y-up" | "y-down";
```

## Documentation wording

Recommended docs wording:

> FBX does not standardize tangent-space normal map channel convention. The FBX loader treats `NormalMap`, `NormalMapTexture`, and `normalCamera` slots as Y-up normal maps by default, matching common glTF-style authoring. For Y-down normal maps, use `normalMapCoordinateSystem: "y-down"`. This setting is independent of scene handedness. `Bump` and `BumpFactor` are treated separately because they commonly represent height/bump maps rather than tangent-space normal maps.

Avoid:

```text
OpenGL normal maps
DirectX normal maps
```

as the primary public API terminology. Those can be mentioned parenthetically in explanatory docs if necessary, but the option names should remain `y-up` and `y-down`.

## Validation performed in standalone repo

The standalone repo was updated and validated with:

```powershell
npm run typecheck
npx vitest run tests\fbxFileLoader.test.ts
npm test
```

Results after the normal-map coordinate-system change:

```text
npm run typecheck: passed
npx vitest run tests\fbxFileLoader.test.ts: 38 tests passed
npm test: 20 test files passed, 164 tests passed
```

## Current caution

There is one subtle shader-path point worth preserving in code review:

Material `invertNormalMapY` can cover derivative/fallback paths, but it is not sufficient for explicit/generated tangent paths where Babylon uses `tangent.w` to build the bitangent. Since the FBX loader generates tangents for normal-mapped geometry with normals and UVs, the Y-up/Y-down option must affect tangent handedness as well as material normal-map flags.

Do not regress this into scene-handedness logic. Scene handedness answers how the FBX scene is transformed into Babylon space. `normalMapCoordinateSystem` answers how to interpret the normal texture's green/Y channel inside tangent space.

