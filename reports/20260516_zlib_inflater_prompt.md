# Prompt: Implement a Clean-Room Zlib Inflater for FBX Binary Arrays

> **Important:** Do **not** read, open, fetch, search for, or paraphrase the source of any existing zlib/deflate library (pako, zlib, miniz, fflate, tiny-inflate, browserify-zlib, etc.). Do not search GitHub, npm, or the web for "how X library implements inflate." This is a clean-room implementation written from the **public format specifications** (RFC 1950, RFC 1951) and the requirements below. If you find yourself wanting to consult an existing implementation for "how it's normally done," stop and re-read the RFCs instead — they fully specify the format.

## Task

Write a synchronous, dependency-free TypeScript zlib inflater that can decompress the compressed binary array payloads found inside FBX files. The module replaces our current third-party dependency. Output must be byte-exact with the original compressor.

## Scope and constraints

- **Language / runtime:** TypeScript, targeting both Node and modern browsers. No Node-only APIs (no `zlib`, no `Buffer` in the public surface — use `Uint8Array`). No WebAssembly. No async.
- **Direction:** **Decompression only.** No compression / deflate encoder is required.
- **Format:** zlib-wrapped deflate streams as defined by RFC 1950 (zlib container) and RFC 1951 (deflate block format).
- **Input:** a `Uint8Array` containing one complete zlib stream.
- **Output:** a `Uint8Array` containing the inflated bytes.
- **Known expected length:** the FBX caller always knows the uncompressed length up front (it is stored in the array header). Accept it as an argument and pre-allocate the output buffer of exactly that size. Treat any mismatch between produced length and expected length as an error.
- **No streaming / chunked API.** One-shot inflate with both input and expected output length known is sufficient.
- **No global state.** The function must be reentrant and safe to call concurrently.

## Public API (suggested)

```ts
export function inflateZlib(input: Uint8Array, expectedLength: number): Uint8Array;
```

You may add a small internal helper for raw-deflate (no zlib wrapper) if it keeps the code clean, but it does not need to be exported.

## What the implementation must support

From RFC 1951, all three deflate block types:

1. **Stored (uncompressed) blocks** — including the byte-alignment step before reading `LEN`/`NLEN`, and the `LEN == ~NLEN` consistency check.
2. **Fixed Huffman blocks** — using the literal/length and distance code tables defined by the RFC. The tables must be derived from the bit-length specification in the RFC, not copy-pasted from another implementation.
3. **Dynamic Huffman blocks** — including:
   - Reading `HLIT`, `HDIST`, `HCLEN`.
   - Reading the code-length-alphabet code lengths in their RFC-specified permutation order.
   - Building the code-length Huffman tree.
   - Decoding the literal/length and distance code-length sequences, honoring the repeat codes (16: copy previous 3–6 times; 17: zero-fill 3–10; 18: zero-fill 11–138).
   - Building the literal/length and distance Huffman trees from those code lengths.
4. **Length/distance back-references** — including the extra-bits tables defined in RFC 1951 §3.2.5 for length codes 257–285 and distance codes 0–29. Copies may overlap the current output position (run-length style), so the copy loop must read one byte at a time from the output buffer, not use a bulk memcpy that snapshots the source first.
5. **End-of-block** symbol (256) terminates a block; the `BFINAL` bit on the block header terminates the stream.

From RFC 1950, the zlib container:

1. **2-byte header:** validate `CMF` and `FLG`.
   - The compression method (low nibble of `CMF`) must be 8 (deflate).
   - The compression info / window size (high nibble of `CMF`) must be ≤ 7 (window ≤ 32 KiB).
   - `(CMF * 256 + FLG)` must be a multiple of 31 (header checksum).
   - The `FDICT` bit (bit 5 of `FLG`) must be 0 — **reject streams with a preset dictionary**. FBX never uses one.
   - The `FLEVEL` bits are informational; ignore them.
2. **Trailing 4-byte Adler-32** of the uncompressed data, big-endian. Compute Adler-32 incrementally as bytes are emitted and verify it equals the trailer. Mismatch is an error.

## Validation requirements

The inflater must reject malformed input with a clear thrown `Error` (not silently produce garbage). Required checks:

- Truncated input (ran out of bits/bytes mid-stream, mid-header, or mid-trailer).
- Invalid zlib header (method, window size, FCHECK, or FDICT set).
- Reserved deflate block type (`BTYPE == 3`).
- Stored block with `LEN != ~NLEN`.
- Huffman code lengths that do not form a valid prefix code (over-subscribed or incomplete tree, with the standard RFC 1951 allowance for a single-symbol tree).
- Decoded literal/length symbol > 285 or distance symbol > 29.
- Back-reference distance that points before the start of the output stream.
- Output length not equal to `expectedLength` at end of stream.
- Adler-32 mismatch.

Use distinct, greppable error messages so failures in FBX files are diagnosable (e.g. `"zlib: invalid header"`, `"deflate: invalid block type"`, `"deflate: distance out of range"`, `"zlib: adler32 mismatch"`, `"zlib: unexpected end of input"`).

## Implementation notes (high-level only)

These are constraints, not a design. Choose your own internal structure.

- Bits in deflate are read **LSB-first within each byte**, and multi-bit fields are assembled with the first bit read becoming the least-significant bit of the value. Huffman codes are the exception: they are packed MSB-first **within the code**, so the natural way to decode is to accumulate bits LSB-first into an integer and walk a table or tree built to match that bit order.
- A common technique is a small bit-reader that maintains an integer accumulator and a bit count, refilling from the input one byte at a time. You are free to implement it however you like; just keep it correct around byte alignment for stored blocks and end-of-stream.
- Output buffer is pre-allocated to `expectedLength`. Maintain a write cursor. Back-references read from earlier positions in this same buffer.
- Adler-32 is defined in RFC 1950 §9. The naive implementation (two running sums mod 65521) is fine; you may defer the modulo when convenient as long as the result is correct.
- Performance target: must inflate the largest payloads in our FBX corpus (a few MB at a time) in well under a second on a modern machine. Pure-JS inflate at roughly 30–100 MB/s is acceptable; we do not need to beat hand-tuned C.

Do **not** import or transliterate precomputed tables from another library. Where the RFC defines a table (e.g. length/distance base values and extra bits, code-length permutation order), transcribe it directly from the RFC text or derive it in code at module load.

## Test vectors

Include unit tests for at least the following. Hex strings are the **input** (the zlib stream) unless noted; expected output is given as either an ASCII string or hex.

1. **Empty payload (stored block).**
   - Input: `78 9c 03 00 00 00 00 01`
   - Expected output: `""` (zero bytes), expectedLength `0`.

2. **Short ASCII, fixed Huffman.** Round-trip `"Hello, World!"`.
   - Input: `78 9c f3 48 cd c9 c9 d7 51 08 cf 2f ca 49 51 04 00 1f 9e 04 6a`
   - Expected output bytes: `48 65 6c 6c 6f 2c 20 57 6f 72 6c 64 21`, expectedLength `13`.

3. **Stored block.** A short literal payload that the compressor chose not to compress.
   - Input: `78 01 01 05 00 fa ff 41 42 43 44 45 06 1e 01 c4`
   - Expected output: `"ABCDE"` (`41 42 43 44 45`), expectedLength `5`.

4. **Repetition (exercises back-references).** Inflate of `"abcabcabcabcabcabcabcabc"` (24 bytes).
   - You may generate this fixture at test time by deflating with Node's built-in `zlib.deflateSync` in a one-off script, capturing the bytes, and pasting them into the test as a hex constant. Do **not** call `zlib.inflateSync` from the implementation; it may only appear in the test harness to generate fixtures or as an oracle for comparison.

5. **Dynamic Huffman.** A payload large and varied enough that the reference compressor emits a dynamic Huffman block (e.g. the first 4 KiB of Lorem Ipsum, or 4 KiB of pseudo-random printable ASCII with a fixed seed). Compare byte-for-byte against the original.

6. **Real FBX payload.** Pick one compressed array from a small fixture in `tests/fixtures/` (or `tests/models/`), inflate it with the new code, and compare the resulting `Uint8Array` against the bytes produced by the current implementation for that same input. They must match exactly.

7. **Error cases** (each must throw):
   - Truncated input (drop the last byte of vector #2).
   - Corrupted Adler-32 (flip the last byte of vector #2).
   - Bad zlib header (`00 00 ...`).
   - `FDICT` bit set (synthesize a header with bit 5 of `FLG` on and a valid FCHECK).
   - Stored block with `LEN != ~NLEN`.
   - Output length less than `expectedLength`.

## Integration

- Add the module under `src/parsers/` (or a sibling location that keeps the parser layer Babylon-independent — see the project's copilot-instructions). The parser layer must remain pure TypeScript with no runtime dependencies.
- Replace the existing third-party inflate call sites with calls to the new function. The expected uncompressed length is already known at every call site from the FBX array header (`ArrayLength * sizeof(elementType)`); pass it through.
- Remove the third-party dependency from `package.json` once all call sites are migrated and tests pass.
- Run `npm test` and `npm run typecheck`. All existing tests must still pass. Add the new unit tests under `tests/parsers/`.

## Deliverables

1. New inflater module + unit tests.
2. Updated FBX binary parser call sites.
3. `package.json` change removing the old dependency.
4. A short note in the PR description listing which RFC sections were used and confirming no third-party inflate source was consulted.
