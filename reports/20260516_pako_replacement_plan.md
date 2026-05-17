# Pako Replacement Plan

## Implementation status

Implemented in this repository:

- `src\parsers\zlibInflate.ts` now provides a dependency-free, synchronous zlib inflater for FBX binary array payloads.
- `src\parsers\fbxBinaryParser.ts` now calls `inflateZlib(...)` instead of `pako.inflate(...)`.
- `pako` and `@types/pako` have been removed from `package.json` and `package-lock.json`.
- `tests\parsers\zlibInflate.test.ts` covers stored, fixed-Huffman, dynamic-Huffman, back-reference, real FBX fixture, malformed stream, checksum, and dependency-removal cases.

## Decision

Babylon does not currently provide a dependency-free zlib inflater that this FBX loader can directly reuse.

Local Babylon package findings:

- `@babylonjs/core` EXR loading calls `fflate.unzlibSync(...)`, but `fflate` is expected as an external/global script loaded from `ExrLoaderGlobalConfiguration.FFLATEUrl`.
- `@babylonjs/loaders` SPLAT loading can load `fflate` externally, and another path uses browser `DecompressionStream("gzip")`.
- Neither path satisfies this loader's requirement: no external dependency, no vendored library, no browser-only platform API, and no async decompression requirement.

Therefore the viable path is to replace `pako` with a small internal FBX-specific zlib inflate implementation.

## Current dependency problem

`pako` is used only by the binary FBX parser:

- `src\parsers\fbxBinaryParser.ts`
- binary array properties with `encoding === 1`
- these arrays are zlib-compressed payloads in binary FBX files

This affects large FBX arrays such as positions, normals, UVs, polygon indices, skin weights, animation keys, and other numeric data.

Even though `pako` is currently in `devDependencies`, the source imports it at runtime, so the loader still depends on it being available or bundled. That makes it unsuitable for a Babylon upstream path.

## Scope of the internal implementation

Create a focused pure TypeScript zlib inflater for binary FBX array properties.

Supported:

1. Zlib wrapper streams, not gzip and not zip archives.
2. Deflate stored blocks.
3. Deflate fixed Huffman blocks.
4. Deflate dynamic Huffman blocks.
5. Adler-32 validation.
6. Exact output-size validation using FBX's known `arrayLength * elementSize`.
7. Synchronous API suitable for the existing parser.
8. Browser and Node compatibility with no platform-specific APIs.

Not supported:

1. Compression/deflate output.
2. Gzip streams.
3. Zip archives.
4. Preset dictionaries.
5. Streaming/incremental decompression.
6. External fallback libraries.
7. Browser `DecompressionStream`.

The implementation should fail loudly on unsupported or corrupt data rather than silently returning partial output.

## Proposed files

1. `src\parsers\zlibInflate.ts`
   - internal inflate implementation
   - exports `inflateZlib(data: Uint8Array, expectedLength?: number): Uint8Array`

2. `src\parsers\fbxBinaryParser.ts`
   - replace `import * as pako from "pako";`
   - call `inflateZlib(compressed, arrayLength * elementSize)`

3. `tests\parsers\zlibInflate.test.ts`
   - unit tests for zlib wrapper and deflate block behavior

4. `tests\parsers\binaryParser.test.ts`
   - keep fixture-level coverage proving compressed binary FBX arrays still parse

5. `package.json` and `package-lock.json`
   - remove `pako`
   - remove `@types/pako`

## Implementation design

### Public internal API

```ts
export function inflateZlib(data: Uint8Array, expectedLength?: number): Uint8Array;
```

Behavior:

1. Validate zlib header:
   - compression method must be deflate (`CM = 8`)
   - window size must be valid (`CINFO <= 7`)
   - header check bits must pass (`(CMF << 8 | FLG) % 31 === 0`)
   - preset dictionary flag must be rejected
2. Inflate the deflate stream.
3. Validate Adler-32 trailer against decompressed output.
4. Validate `expectedLength` when provided.
5. Return a `Uint8Array` with exactly decompressed bytes.

### Deflate support

Implement a small bit-reader for least-significant-bit deflate fields:

1. Read `BFINAL`.
2. Read `BTYPE`.
3. Dispatch:
   - `00`: stored block, byte-align, copy LEN bytes, validate one's-complement NLEN.
   - `01`: fixed Huffman block.
   - `10`: dynamic Huffman block.
   - `11`: throw invalid block type.

For compressed blocks:

1. Build Huffman decode tables from code lengths.
2. Decode literal/length symbols.
3. Copy distance references from the already written output.
4. Stop on end-of-block symbol `256`.

Use the RFC 1951 length and distance base/extra-bit tables. Since FBX gives the expected output length, preallocate when possible and throw if output would exceed the expected length.

### Huffman table approach

Keep the table simple and readable:

1. Count codes by bit length.
2. Generate canonical Huffman codes.
3. Reverse codes for deflate's LSB bit order.
4. Store decode entries by bit length/code.
5. Decode one bit at a time up to the maximum code length.

This is not the fastest possible approach, but it is small, auditable, dependency-free, and suitable for loader parsing. If performance becomes an issue, optimize the table later without changing the parser API.

### Output buffer

Use exact preallocation when `expectedLength` is available:

1. Allocate `new Uint8Array(expectedLength)`.
2. Track write offset.
3. Throw if a literal or back-reference would exceed the expected length.
4. At end, throw if fewer bytes were written than expected.

Allow growable output only when `expectedLength` is omitted for unit-test flexibility.

## Test plan

### Unit tests

Add deterministic byte-vector tests for:

1. Valid zlib stored block.
2. Valid fixed Huffman block.
3. Valid dynamic Huffman block.
4. Multiple blocks in one stream.
5. Back-reference copies, including overlapping distance copies.
6. Adler-32 mismatch.
7. Invalid zlib header.
8. Preset dictionary flag.
9. Truncated input.
10. Invalid distance before output exists.
11. Expected length too short.
12. Expected length too long.

Test vectors should be checked into the test source as byte arrays or hex strings. They should not rely on `pako`, `fflate`, Node `zlib`, or any generated dependency at test time.

### FBX integration tests

Run the existing binary FBX parser/interpreter/loader fixture tests after removing `pako`. These fixtures already exercise compressed arrays from real FBX assets.

Also add or update a targeted parser assertion that confirms at least one fixture reads an `encoding === 1` array successfully through the internal inflater.

### Dependency regression test

Add a simple test or scripted assertion that source files no longer import `pako`, and confirm `package.json` no longer declares `pako` or `@types/pako`.

## Validation commands

1. `npm install`
2. `npm run typecheck`
3. `npm test`

## Risks and mitigations

### Risk: incorrect dynamic Huffman decoding

Mitigation: include known dynamic-block vectors, real FBX fixture parsing, and corrupt-data tests that fail loudly.

### Risk: poor performance on large geometry arrays

Mitigation: preallocate exact output size from FBX metadata and avoid per-byte array resizing in normal parser use.

### Risk: accepting corrupt FBX data

Mitigation: validate zlib header, stored block length checks, invalid Huffman symbols, invalid distances, output length, and Adler-32.

### Risk: licensing concerns

Mitigation: write the implementation from the zlib/deflate format specification and do not vendor or copy an existing inflate implementation.

## Completion criteria

This work is complete when:

1. `pako` and `@types/pako` are removed from `package.json` and `package-lock.json`.
2. `src\parsers\fbxBinaryParser.ts` no longer imports or references `pako`.
3. Compressed FBX binary arrays parse through `src\parsers\zlibInflate.ts`.
4. The full current fixture suite passes.
5. `npm run typecheck` passes.
6. `npm test` passes.
7. The implementation remains parser-layer only and has no Babylon runtime dependency.
