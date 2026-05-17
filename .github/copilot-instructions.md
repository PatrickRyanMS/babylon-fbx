# Copilot Instructions — babylon-fbx

## Project Overview

Pure TypeScript FBX file loader/importer plugin for [Babylon.js](https://www.babylonjs.com/). Implements `ISceneLoaderPluginAsync` to parse FBX files (both binary and ASCII formats) and produce Babylon.js scene objects. No Autodesk FBX SDK dependency.

## Build & Test

```bash
npm test              # Run full test suite (Vitest)
npx vitest run tests/parsers/binaryParser.test.ts   # Run a single test file
npx vitest -t "should parse the version"            # Run tests matching a name
npm run typecheck     # TypeScript type checking (tsc --noEmit)
```

## Architecture

Two-layer design:

1. **Parser layer** (`src/parsers/`) — Deserializes raw FBX bytes (binary) or text (ASCII) into an `FBXDocument` node tree. No Babylon dependency. Both parsers produce the same `FBXDocument` intermediate representation.
2. **Interpreter layer** (`src/interpreter/`) — Walks the parsed node tree, resolves Connections, and maps FBX objects to Babylon.js meshes/materials. The `FBXFileLoader` class (`src/fbxFileLoader.ts`) is the thin `ISceneLoaderPluginAsync` wrapper on top.

### Key FBX format details

- **Binary vs ASCII**: Binary starts with `Kaydara FBX Binary` magic; ASCII starts with `; FBX`. Version 7.5+ uses 64-bit node header offsets.
- **Connections**: FBX uses a flat object list + `Connections` section. `OO` = object-to-object, `OP` = object-to-property (e.g. texture → material's "DiffuseColor").
- **Polygon indices**: `PolygonVertexIndex` uses negative-index-minus-one (`-(idx+1)`) to mark polygon boundaries.
- **Layer elements**: Normals/UVs use mapping modes (`ByPolygonVertex`, `ByControlPoint`, `AllSame`) and reference modes (`Direct`, `IndexToDirect`).
- **Compressed arrays**: Binary FBX may zlib-compress large float/int arrays (decoded by the internal parser-layer zlib inflater).

## Conventions

- Follow Babylon.js loader plugin patterns. The loader implements `ISceneLoaderPluginAsync`.
- Use `@babylonjs/core` imports (not legacy `babylonjs` package).
- Parser layer must remain Babylon-independent (pure TypeScript data transformation).
- Test fixtures live in `tests/fixtures/`.

