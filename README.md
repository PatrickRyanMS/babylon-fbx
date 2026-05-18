# babylon-fbx

Pure TypeScript FBX loader/importer plugin for [Babylon.js](https://www.babylonjs.com/). The loader implements Babylon's `ISceneLoaderPluginAsync` interface and parses FBX files without the Autodesk FBX SDK.

## Status

This project is an active FBX loader implementation with fixture-driven coverage for binary FBX, ASCII FBX, static meshes, skinned meshes, blend shapes, animation curves, materials, textures, and diagnostics. It is intended for Babylon.js projects that need a TypeScript-native FBX import path.

For the latest tangent-space, normal-map, roughness, and viewer diagnostics review, see [`FBX_LOADER_TANGENT_NORMAL_REVIEW.md`](./FBX_LOADER_TANGENT_NORMAL_REVIEW.md).

## Install

```bash
npm install
```

`@babylonjs/core` is a peer dependency. The repository uses Babylon.js packages as dev dependencies for tests and the local viewer.

## Commands

```bash
npm test
npm run typecheck
npm run viewer
npx vitest run tests/parsers/binaryParser.test.ts
npx vitest -t "should parse the version"
```

For visual smoke captures, start the viewer first and then run:

```bash
npx tsx tests/scripts/visual-test.ts
```

Set `VIEWER_URL` if the Vite server is not running at `http://localhost:5173`.

## Usage

Register the plugin with Babylon's scene loader:

```ts
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader.js";
import { FBXFileLoader } from "babylon-fbx";

SceneLoader.RegisterPlugin(new FBXFileLoader());
```

Then load `.fbx` assets through the standard Babylon.js loading APIs:

```ts
const result = await SceneLoader.ImportMeshAsync(
    "",
    "/models/",
    "asset.fbx",
    scene
);
```

The package also exports parser and interpreter primitives for diagnostics or custom pipelines:

```ts
import { parseBinaryFBX, parseAsciiFBX, interpretFBX } from "babylon-fbx";
```

## Architecture

The codebase is split into two layers:

1. `src/parsers/` deserializes binary or ASCII FBX into a common `FBXDocument` node tree. This layer has no Babylon dependency.
2. `src/interpreter/` resolves the FBX object graph and converts the document into geometry, materials, rigs, skins, blend shapes, animation stacks, diagnostics, and scene metadata.
3. `src/fbxFileLoader.ts` maps interpreted data to Babylon.js scene objects and implements the Babylon loader plugin.

Key source areas:

| Path | Purpose |
| --- | --- |
| `src/parsers/fbxBinaryParser.ts` | Binary FBX parser, including compressed array decoding. |
| `src/parsers/fbxAsciiParser.ts` | ASCII FBX parser. |
| `src/parsers/zlibInflate.ts` | Internal zlib/deflate inflater for FBX compressed arrays. |
| `src/interpreter/connections.ts` | FBX `Connections` graph resolution, including legacy FBX 6 `Connect` records. |
| `src/interpreter/geometry.ts` | Mesh geometry, polygon triangulation, normals, UVs, colors, tangents, binormals, and material indices. |
| `src/interpreter/materials.ts` | FBX material properties and texture references. |
| `src/interpreter/skeleton.ts` and `src/interpreter/rig.ts` | Skin clusters, bind poses, deformation rig resolution, and bone mappings. |
| `src/interpreter/animation.ts` | FBX animation stacks, layers, curve nodes, curves, key metadata, and curve sampling. |
| `src/interpreter/blendShapes.ts` | Blend shape channels and in-between shapes. |
| `src/interpreter/sceneDiagnostics.ts` | Recoverable unsupported-feature diagnostics. |
| `viewer/` | Vite/Babylon viewer used for fixture inspection and visual debugging. |
| `tests/` | Vitest coverage and FBX/texture fixtures. |

## Supported FBX features

- Binary FBX and ASCII FBX parsing.
- FBX 7.5+ 64-bit binary node headers.
- Internal zlib inflate support for compressed numeric arrays.
- FBX 6 legacy string-based connection graphs.
- Object-to-object (`OO`) and object-to-property (`OP`) connections.
- Mesh geometry with triangulated polygons.
- Polygon vertex indices using FBX negative-index-minus-one polygon termination.
- Normals, UVs, vertex colors, tangents, binormals, and material indices.
- Tangent generation for meshes with normals and UVs when FBX tangents are missing, including handedness handling for left-handed and right-handed scenes.
- UV mapping modes including `ByPolygonVertex`, `ByControlPoint`, and `AllSame`.
- Reference modes including `Direct` and `IndexToDirect`.
- Standard Babylon materials with diffuse, ambient, specular, emissive, opacity, bump, and reflection texture slots.
- Tangent-space normal map setup for FBX normal-map slots, with `Bump` and `BumpFactor` kept separate from normal-map data texture configuration.
- Texture UV transforms and UV set selection.
- External texture fallback by same basename across common image extensions.
- Embedded texture payloads from FBX `Video` nodes.
- GlobalSettings axis conversion into Babylon's Y-up basis.
- Left-handed and right-handed Babylon scenes, including glTF-style source mesh side orientation.
- Model transforms with pivots, offsets, pre/post rotations, geometric transforms, and rotation order.
- Custom FBX model properties in Babylon metadata.
- Cameras and lights with fidelity metadata for unsupported or diagnostic-only properties.
- Skinned meshes, bind poses, bind-rest correction for severe local/bind scale mismatches, cluster weights, shared rig resolution, and more than four bone influences via Babylon extra skinning buffers.
- Blend shapes and in-between shape weights.
- Animation stacks, layers, curve nodes, curve key metadata, sampled/baked curve detection, and Babylon animation groups.
- Scene/model/animation/skinning diagnostics for unsupported or runtime-gated FBX features.

## Known limitations

The loader preserves several FBX features as diagnostics rather than fully evaluating them at runtime:

- Constraints.
- Helper/control-set data.
- Non-bind poses.
- Unsupported deformer subtypes.
- Unsupported node attributes.
- Layered texture runtime blending.
- Some non-default transform inheritance modes.
- Shader-specific texture graphs that do not map to Babylon `StandardMaterial` slots.

Diagnostics are exposed in interpreted scene data and, where relevant, Babylon metadata.

Some unsupported or partial features should stay fixture-gated until there are targeted models with clear reference behavior. The current priority areas are:

- Visibility: static model visibility, animated visibility curves, and per-polygon `LayerElementVisibility`.
- Animation: layer blending plus non-TRS animated properties such as material, camera, and light curves.
- Scene evaluation: runtime constraints, helper/control rigs, non-bind poses, and unsupported deformer subtypes such as cache or lattice-style deformation.
- Skinning: additive/associate cluster semantics, including `TransformAssociateModel` and non-normalized cluster modes.
- Materials: layered textures, richer PBR/material-extension graphs, transparency conventions, displacement/gloss/reflection semantics, and light/camera fidelity beyond the current basic mapping.
- Geometry/runtime scale: smoothing-group normal generation, edge crease/subdivision data, harder concave n-gon triangulation cases, consistent `UnitScaleFactor` application, and legacy FBX 6 skinning/Takes animation.

For the detailed unsupported-feature inventory and guidance on what models are needed to implement each feature safely, see [`reports/20260518_unsupported_feature_model_needs.md`](./reports/20260518_unsupported_feature_model_needs.md).

## Viewer

Run the local viewer with:

```bash
npm run viewer
```

The viewer registers this loader, loads fixtures from `tests/models/`, and provides a Babylon Inspector-based workflow for visual debugging. Select a model from the dropdown or open a specific fixture directly:

```text
http://localhost:5173/?model=behemot-cat/LowPoly_Cat_V04.fbx
```

Viewer material overrides live in `viewer/main.ts`. These are viewer-only corrections for fixture inspection and reference matching, not loader runtime behavior. They cover cases where source FBX files omit texture connections, contain artist-authored texture naming mistakes, or need presentation-only flags such as culling, opacity clearing, or root rotation.

The viewer status pane reports loaded mesh, skeleton, animation, texture, UV, geometry, material, skeleton, and FBX diagnostic summaries. It also calls out meshes with normals, meshes with tangents, materials/meshes using normal textures, and FBX source geometry counts for normals, tangents, and binormals. Viewer-only ORM packing for comparison fixtures decodes AO, roughness, and metallic source textures as data textures to avoid browser color-space conversion changing roughness values.

The Holotech Bench FBX/GLB comparison fixture is included under `tests/models/holotech-bench/` and is useful for checking tangent-space reflections, normal texture setup, and ORM roughness parity.

## Tests and fixtures

The test suite uses Vitest and fixture assets in `tests/models/`.

```bash
npm test
npm run typecheck
```

Coverage includes:

- Parser correctness for binary, ASCII, parity, and compressed arrays.
- Interpreter behavior for geometry, connections, templates, diagnostics, materials, rigs, skeletons, blend shapes, animations, and fixture snapshots.
- Babylon loader behavior for axis conversion, right-handed scenes, material semantics, texture slots, skinning buffers, bind pose alignment, side orientation, morph targets, camera/light metadata, and legacy FBX 6 static mesh loading.

## Development notes

- Keep the parser layer Babylon-independent.
- Prefer `@babylonjs/core` imports.
- Add fixture regression coverage when changing parser or interpreter behavior.
- Use viewer overrides only for local visual/debug presentation issues; avoid encoding viewer-only asset fixes into the loader.
- Preserve diagnostics for unsupported FBX features instead of silently dropping them.
- Treat frame-baked sampled animation curves as linear samples when they are dense, uniformly spaced at a common frame cadence, and lack meaningful cubic tangent deviation; preserve Cubic/Hermite interpolation for sparse curves and dense curves with meaningful tangents.
- Before pushing repo changes, review and update this README when behavior, fixtures, diagnostics, commands, or workflow details have changed.
