// ASCII FBX writer. Mirrors the shape the repo's fbxAsciiParser expects.
// Arrays are emitted as `Name: *N {\n  a: v0,v1,... \n}` (always float64 to the parser).

function fmtScalar(prop) {
    switch (prop.tag) {
        case "I":
        case "L":
            return String(Math.trunc(prop.value));
        case "F":
        case "D": {
            const v = prop.value;
            return Number.isInteger(v) ? v.toFixed(1) : String(v);
        }
        case "C":
            return prop.value ? "1" : "0";
        case "S":
            return `"${String(prop.value).replace(/"/g, '\\"')}"`;
        case "R":
            throw new Error("ASCII FBX cannot embed raw (R) properties");
        default:
            throw new Error(`Not a scalar property tag: ${prop.tag}`);
    }
}

function fmtArrayValues(typed) {
    const parts = new Array(typed.length);
    for (let i = 0; i < typed.length; i++) {
        const v = typed[i];
        parts[i] = Number.isInteger(v) ? String(v) : String(v);
    }
    return parts.join(",");
}

function isArrayProp(prop) {
    return prop.tag === "d" || prop.tag === "f" || prop.tag === "i" || prop.tag === "l";
}

function writeNode(node, indent, lines) {
    const pad = "    ".repeat(indent);
    const props = node.properties || [];
    const children = node.children || [];

    // Array node: single array property, no children.
    if (props.length === 1 && isArrayProp(props[0]) && children.length === 0) {
        const arr = props[0].value;
        lines.push(`${pad}${node.name}: *${arr.length} {`);
        lines.push(`${pad}    a: ${fmtArrayValues(arr)}`);
        lines.push(`${pad}}`);
        return;
    }

    if (props.some(isArrayProp)) {
        throw new Error(`Node '${node.name}' mixes array and other properties; not valid FBX`);
    }

    const scalarText = props.map(fmtScalar).join(", ");

    if (children.length === 0) {
        if (props.length === 0) {
            // Empty container node (e.g. References, empty Properties70) — needs an empty body.
            lines.push(`${pad}${node.name}:  {`);
            lines.push(`${pad}}`);
        } else {
            // Leaf with values: "Name: a, b"
            lines.push(`${pad}${node.name}: ${scalarText}`);
        }
        return;
    }

    lines.push(`${pad}${node.name}:${scalarText ? " " + scalarText : ""} {`);
    for (const child of children) {
        writeNode(child, indent + 1, lines);
    }
    lines.push(`${pad}}`);
}

/**
 * Serialize top-level FBX nodes to an ASCII FBX string.
 * @param {object[]} nodes top-level node tree
 * @param {number} version FBX version (e.g. 7400)
 */
export function writeAsciiFBX(nodes, version = 7400) {
    const major = Math.floor(version / 1000);
    const minor = Math.floor((version % 1000) / 100);
    const patch = version % 100;
    const lines = [`; FBX ${major}.${minor}.${patch} project file`, "; ----------------------------------------------------", ""];
    for (const node of nodes) {
        writeNode(node, 0, lines);
    }
    return lines.join("\n") + "\n";
}
