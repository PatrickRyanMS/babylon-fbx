// Minimal RGBA PNG encoder (no deps beyond Node zlib).
import zlib from "node:zlib";

const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }
        t[n] = c >>> 0;
    }
    return t;
})();

function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
        c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, "ascii");
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([len, typeBuf, data, crc]);
}

/**
 * Encode an RGBA pixel buffer (Uint8Array length w*h*4) into a PNG Buffer.
 */
export function encodePNG(width, height, rgba) {
    const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 6; // color type RGBA
    ihdr[10] = 0; // compression
    ihdr[11] = 0; // filter
    ihdr[12] = 0; // interlace

    // Add filter byte (0) at the start of each scanline.
    const stride = width * 4;
    const raw = Buffer.alloc((stride + 1) * height);
    for (let y = 0; y < height; y++) {
        raw[y * (stride + 1)] = 0;
        Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
    }
    const idat = zlib.deflateSync(raw, { level: 9 });

    return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

/**
 * Build an RGBA buffer from a per-pixel callback fn(x,y) -> [r,g,b,a] (0-255).
 */
export function makeImage(width, height, fn) {
    const rgba = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const [r, g, b, a] = fn(x, y);
            const i = (y * width + x) * 4;
            rgba[i] = r;
            rgba[i + 1] = g;
            rgba[i + 2] = b;
            rgba[i + 3] = a === undefined ? 255 : a;
        }
    }
    return rgba;
}

// ── A few reusable procedural textures ───────────────────────────────────────

export function checker(size = 64, n = 8, a = [230, 230, 230, 255], b = [40, 40, 40, 255]) {
    return encodePNG(size, size, makeImage(size, size, (x, y) => {
        const cell = (Math.floor((x / size) * n) + Math.floor((y / size) * n)) % 2;
        return cell === 0 ? a : b;
    }));
}

/** A blocky "F" in the upper-left so orientation (flip/rotation) is unambiguous. */
export function letterF(size = 64, fg = [230, 60, 60, 255], bg = [245, 245, 245, 255]) {
    return encodePNG(size, size, makeImage(size, size, (x, y) => {
        const u = x / size;
        const v = y / size;
        const inStem = u >= 0.30 && u <= 0.42 && v >= 0.20 && v <= 0.80;
        const inTop = v >= 0.20 && v <= 0.32 && u >= 0.30 && u <= 0.70;
        const inMid = v >= 0.46 && v <= 0.56 && u >= 0.30 && u <= 0.60;
        return inStem || inTop || inMid ? fg : bg;
    }));
}

/** Flat normal map (pointing +Z) with a sine ridge pattern for visible relief. */
export function normalMap(size = 64) {
    return encodePNG(size, size, makeImage(size, size, (x, y) => {
        const fx = Math.sin((x / size) * Math.PI * 8);
        const fy = Math.sin((y / size) * Math.PI * 8);
        const nx = fx * 0.5;
        const ny = fy * 0.5;
        const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
        return [Math.round((nx * 0.5 + 0.5) * 255), Math.round((ny * 0.5 + 0.5) * 255), Math.round((nz * 0.5 + 0.5) * 255), 255];
    }));
}

/** Blocky "F" mask: 1 inside the F strokes, 0 elsewhere (matches letterF). */
function fMask(u, v) {
    const inStem = u >= 0.30 && u <= 0.42 && v >= 0.20 && v <= 0.80;
    const inTop = v >= 0.20 && v <= 0.32 && u >= 0.30 && u <= 0.70;
    const inMid = v >= 0.46 && v <= 0.56 && u >= 0.30 && u <= 0.62;
    return inStem || inTop || inMid ? 1 : 0;
}

/**
 * Tangent-space normal map of an "F" debossed (carved) into the surface, derived from a blurred
 * height field. When lit at a grazing angle the F reads as a concave groove, so it's obvious
 * whether the normal map is being sampled/oriented correctly (vs. a flat painted F).
 * @param size texture size
 * @param strength bevel slope strength
 * @param emboss if true the F is raised instead of carved
 */
export function debossedF(size = 96, strength = 6, emboss = false) {
    const sign = emboss ? 1 : -1;
    let H = new Float32Array(size * size);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            H[y * size + x] = sign * fMask((x + 0.5) / size, (y + 0.5) / size);
        }
    }
    const blur = (src) => {
        const dst = new Float32Array(size * size);
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                let s = 0, c = 0;
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        const xx = x + dx, yy = y + dy;
                        if (xx < 0 || yy < 0 || xx >= size || yy >= size) continue;
                        s += src[yy * size + xx];
                        c++;
                    }
                }
                dst[y * size + x] = s / c;
            }
        }
        return dst;
    };
    for (let i = 0; i < 4; i++) H = blur(H);

    const at = (x, y) => H[Math.max(0, Math.min(size - 1, y)) * size + Math.max(0, Math.min(size - 1, x))];
    return encodePNG(size, size, makeImage(size, size, (x, y) => {
        const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
        const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
        // Tangent space, Y-up convention (V increases upward): flip the image-space dy.
        let nx = -dx, ny = dy, nz = 1;
        const len = Math.hypot(nx, ny, nz);
        nx /= len; ny /= len; nz /= len;
        return [Math.round((nx * 0.5 + 0.5) * 255), Math.round((ny * 0.5 + 0.5) * 255), Math.round((nz * 0.5 + 0.5) * 255), 255];
    }));
}

/** Alpha cutout: opaque ring, transparent center + corners (visible holes). */
export function holes(size = 64) {
    return encodePNG(size, size, makeImage(size, size, (x, y) => {
        const dx = x / size - 0.5;
        const dy = y / size - 0.5;
        const r = Math.sqrt(dx * dx + dy * dy);
        const opaque = r > 0.18 && r < 0.42;
        return opaque ? [220, 200, 60, 255] : [220, 200, 60, 0];
    }));
}

/** Solid color tile. */
export function solid(rgb, size = 8) {
    return encodePNG(size, size, makeImage(size, size, () => [rgb[0], rgb[1], rgb[2], 255]));
}
