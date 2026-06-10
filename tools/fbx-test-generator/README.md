# FBX Test Model Generator

Generates small, deterministic **FBX test models** (binary or ASCII) for FBX-loader regression
and visual tests. No Autodesk FBX SDK or Maya required to *author* the files — they are written
directly — and they open in Maya / load through the real FBX SDK.

This lives outside the Babylon.js repo on purpose (per project policy); it is a standalone tool we
can return to and extend whenever new test models are needed.

## Why this exists

The Babylon.js FBX loader needs deterministic test assets that exercise individual loader features
(geometry, triangulation, vertex colors, materials, every texture slot, tangents/normal maps,
transforms, skinning, morph targets, animation, cameras/lights, axis/units). Real DCC exports are
large, noisy, and hard to diff. These generated models are tiny and each isolates a feature.

## Layout

- `lib/` — format writers and helpers
  - `png.mjs` — tiny PNG encoder + procedural textures (checker, letter-F, debossed-F normal map, …)
  - `fbxNode.mjs` — typed FBX property/node builders
  - `fbxBinary.mjs` — **binary** FBX writer (matches the Autodesk SDK byte format)
  - `fbxAscii.mjs` — ASCII FBX writer
  - `fbxScene.mjs` — high-level builders (geometry, material, texture, video, model, document, …)
- `models/` — one file per test model (`m01.mjs`, `m02.mjs`, `m05.mjs`, …). Each is a readable spec.
- `generate.mjs` — emits every model (+ sidecar textures) into `out/` and writes `out/manifest.json`
- `validate.mjs` — loads each `out/*.fbx` through the real FBX SDK (via `fbx2gltf`) and reports
  vertices/nodes/surfaces (a Maya-openable proxy)
- `render.mjs` — screenshots each model via the Babylon dev server for human inspection

## Usage

```bash
npm install            # installs fbx2gltf (bundles the real FBX SDK, used for validation)
npm run generate       # writes out/*.fbx (+ textures) and out/manifest.json
npm run validate       # confirms every file loads in the FBX SDK (== opens in Maya)
npm run render         # optional: screenshots into renders/  (needs the Babylon dev server, below)
```

The renderer expects the Babylon.js dev server running at `http://localhost:1337` (which exposes
`window.BABYLON` with the loaders). From the Babylon.js repo root: `npm start`.

## Binary FBX — important format notes (learned the hard way)

A binary FBX that parses in a lenient loader can still import as **empty** in the Autodesk SDK/Maya.
The writer in `fbxBinary.mjs` handles all of these:

1. **Object names** are stored as `Name\x00\x01Class` (not the ASCII `Class::Name`).
2. **Null-record terminators**: a node needs one iff it has children, OR has zero properties, OR is
   an object header `[int64 id, string name, string class]` (e.g. a childless `AnimationLayer`).
   Both a missing *and* an extra terminator desync the SDK reader.
3. **Footer**: part1 is derived from `FileId` + `CreationTime`. We emit one known-consistent triple
   captured from a real Autodesk export so the SDK's integrity check passes for any content.
4. Top-level `FileId` / `CreationTime` / `Creator` nodes after `FBXHeaderExtension`.

A Model also needs `DefaultAttributeIndex` in its `Properties70`, each Geometry needs a `Layer`
node, and the document needs `FBXHeaderExtension` / `Documents{RootNode}` / `Definitions` / `Takes`.

## Textures & materials (so they actually apply in Maya)

- **Material assignment**: every mesh needs a `LayerElementMaterial` (use `AllSame` index 0 for a
  single material). Without it, the SDK/Maya assign a *default* material and connected textures
  never appear, even though the mesh and material both load.
- **Embedded textures**: a `Video` object holds the image bytes in `Content`; the `Texture` must
  reference it with a `Media: "<name>\x00\x01Video"` child **and** be OO-connected to the Video.
  Maya/the SDK extract embedded images to a `<file>.fbm/` folder on load.
- **External textures**: omit the `Video`; the `Texture.FileName`/`RelativeFilename` resolves a
  sidecar file next to the `.fbx`.

## Adding a model

Create `models/mNN.mjs` exporting `buildMNN()` that returns `{ nodes, version, sidecars? }` using the
`lib/fbxScene.mjs` builders, then register it in `generate.mjs`. Run `npm run generate && npm run validate`.
