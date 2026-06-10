// Shared FBX node-tree builders. A model is authored once with these helpers and
// emitted as either binary or ASCII FBX.

// Property descriptors carry a tag + value. Tags mirror FBX binary type codes.
export const I = (v) => ({ tag: "I", value: v | 0 }); // int32
export const L = (v) => ({ tag: "L", value: v }); // int64 (object IDs)
export const D = (v) => ({ tag: "D", value: v }); // float64
export const F = (v) => ({ tag: "F", value: v }); // float32
export const B = (v) => ({ tag: "C", value: !!v }); // boolean
export const S = (v) => ({ tag: "S", value: String(v) }); // string
export const R = (bytes) => ({ tag: "R", value: bytes }); // raw bytes (Uint8Array/Buffer)
export const Dn = (arr, compress = false) => ({ tag: "d", value: Float64Array.from(arr), compress }); // float64[]
export const Fn = (arr, compress = false) => ({ tag: "f", value: Float32Array.from(arr), compress }); // float32[]
export const In = (arr, compress = false) => ({ tag: "i", value: Int32Array.from(arr), compress }); // int32[]
export const Ln = (arr, compress = false) => ({ tag: "l", value: BigInt64Array.from(arr.map((v) => BigInt(Math.round(v)))), compress }); // int64[]

/** Build a node: name, property descriptor array, children node array. */
export function n(name, props = [], children = []) {
    return { name, properties: props, children };
}

/** Standard FBX object header props: [id(L), "Type::Name"(S), "SubType"(S)] */
export function objProps(id, typeName, subType) {
    return [L(id), S(typeName), S(subType)];
}

/** A Properties70 P entry. type/sub/flags are FBX metadata; values follow. */
export function P(name, type, sub, flags, ...values) {
    return n("P", [S(name), S(type), S(sub), S(flags), ...values]);
}

/** Convenience: a double-valued Properties70 entry (e.g. transforms, colors). */
export function Pd(name, type, sub, ...nums) {
    return P(name, type, sub, "A", ...nums.map((x) => D(x)));
}
