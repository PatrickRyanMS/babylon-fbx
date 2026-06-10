// High-level FBX scene/object builders on top of the node helpers.
import { n, S, L, I, D, B, R, Dn, In, Fn, P, Pd, objProps } from "./fbxNode.mjs";

function flat(arr) {
    const out = [];
    for (const v of arr) {
        for (const c of v) out.push(c);
    }
    return out;
}

// Encode faces into an FBX PolygonVertexIndex (last index of each face is ~(-idx-1)).
function encodePolygons(faces) {
    const out = [];
    for (const face of faces) {
        for (let i = 0; i < face.length; i++) {
            const idx = face[i];
            out.push(i === face.length - 1 ? -(idx + 1) : idx);
        }
    }
    return out;
}

function layerElement(name, dataChild, data, mapping = "ByPolygonVertex", reference = "Direct", indexChild, indexData) {
    const children = [
        n("MappingInformationType", [S(mapping)]),
        n("ReferenceInformationType", [S(reference)]),
        n(dataChild, [Dn(data)]),
    ];
    if (indexChild) {
        children.push(n(indexChild, [In(indexData || [])]));
    }
    return n(name, [I(0)], children);
}

/**
 * Build a Mesh Geometry object node.
 * positions: array of [x,y,z] control points.
 * faces: array of vertex-index arrays (per polygon).
 * Per-polygon-vertex attribute arrays (normals/uvs/colors/tangents/binormals) are listed in
 * face-vertex order unless the matching *Mapping is "ByControlPoint".
 */
export function geometry(id, name, opts) {
    const { positions, faces, normals, normalsMapping = "ByPolygonVertex", uvs, uvName = "map1", uvMapping = "ByPolygonVertex", colors, tangents, binormals, materialIndices, materialMapping = "ByPolygon" } = opts;

    const children = [
        n("Vertices", [Dn(flat(positions))]),
        n("PolygonVertexIndex", [In(encodePolygons(faces))]),
        n("GeometryVersion", [I(124)]),
    ];

    if (normals) {
        children.push(layerElement("LayerElementNormal", "Normals", flat(normals), normalsMapping));
    }
    if (uvs) {
        const uvNode = layerElement("LayerElementUV", "UV", flat(uvs), uvMapping);
        uvNode.children.unshift(n("Name", [S(uvName)]));
        children.push(uvNode);
    }
    if (colors) {
        children.push(layerElement("LayerElementColor", "Colors", flat(colors), "ByPolygonVertex"));
    }
    if (tangents) {
        children.push(layerElement("LayerElementTangent", "Tangents", flat(tangents), "ByPolygonVertex"));
    }
    if (binormals) {
        children.push(layerElement("LayerElementBinormal", "Binormals", flat(binormals), "ByPolygonVertex"));
    }
    // Material layer: per-polygon indices when given, else a single material (AllSame index 0).
    // Without this the FBX SDK/Maya assign a default material and connected textures never apply.
    const matMapping = materialIndices ? materialMapping : "AllSame";
    const matIndices = materialIndices ?? [0];
    children.push(n("LayerElementMaterial", [I(0)], [
        n("Version", [I(101)]),
        n("Name", [S("")]),
        n("MappingInformationType", [S(matMapping)]),
        n("ReferenceInformationType", [S("IndexToDirect")]),
        n("Materials", [In(matIndices)]),
    ]));

    // Maya requires a Layer node aggregating the present LayerElements.
    const layerTypes = [];
    if (normals) layerTypes.push("LayerElementNormal");
    if (binormals) layerTypes.push("LayerElementBinormal");
    if (tangents) layerTypes.push("LayerElementTangent");
    layerTypes.push("LayerElementMaterial");
    if (colors) layerTypes.push("LayerElementColor");
    if (uvs) layerTypes.push("LayerElementUV");
    const layerChildren = [n("Version", [I(100)])];
    for (const t of layerTypes) {
        layerChildren.push(n("LayerElement", [], [n("Type", [S(t)]), n("TypedIndex", [I(0)])]));
    }
    children.push(n("Layer", [I(0)], layerChildren));

    return n("Geometry", objProps(id, `Geometry::${name}`, "Mesh"), children);
}

/** A Phong/Lambert material with Properties70 color/factor entries. */
export function material(id, name, type, props = {}) {
    const p70 = [];
    const c = (k, key) => {
        if (props[k]) p70.push(P(key, "Color", "", "A", D(props[k][0]), D(props[k][1]), D(props[k][2])));
    };
    const num = (k, key) => {
        if (props[k] !== undefined) p70.push(P(key, "Number", "", "A", D(props[k])));
    };
    c("diffuse", "DiffuseColor");
    num("diffuseFactor", "DiffuseFactor");
    c("ambient", "AmbientColor");
    c("emissive", "EmissiveColor");
    num("emissiveFactor", "EmissiveFactor");
    c("specular", "SpecularColor");
    num("specularFactor", "SpecularFactor");
    num("shininess", "ShininessExponent");
    num("opacity", "Opacity");
    num("transparencyFactor", "TransparencyFactor");

    return n("Material", objProps(id, `Material::${name}`, ""), [
        n("Version", [I(102)]),
        n("ShadingModel", [S(type === "Phong" ? "Phong" : "Lambert")]),
        n("MultiLayer", [I(0)]),
        n("Properties70", [], p70),
    ]);
}

/** A FileTexture node. slot props (uvTranslation/uvScaling/uvRotation/uvSet) optional. */
export function texture(id, name, fileName, relativeFileName, tex = {}) {
    const p70 = [
        P("CurrentTextureBlendMode", "enum", "", "", I(0)),
        P("UVSet", "KString", "", "", S(tex.uvSet || "map1")),
        P("UseMaterial", "bool", "", "", I(1)),
    ];
    if (tex.uvTranslation) p70.push(P("Translation", "Vector", "", "A", D(tex.uvTranslation[0]), D(tex.uvTranslation[1]), D(0)));
    if (tex.uvScaling) p70.push(P("Scaling", "Vector", "", "A", D(tex.uvScaling[0]), D(tex.uvScaling[1]), D(1)));
    if (tex.uvRotation !== undefined) p70.push(P("Rotation", "Vector", "", "A", D(0), D(0), D(tex.uvRotation)));

    const children = [
        n("Type", [S("TextureVideoClip")]),
        n("Version", [I(202)]),
        n("TextureName", [S(`Texture::${name}`)]),
        n("Properties70", [], p70),
    ];
    // Link to an embedded Video by its object name so the FBX SDK / Maya import the embedded image.
    if (tex.media) {
        children.push(n("Media", [S(`Video::${tex.media}`)]));
    }
    children.push(
        n("FileName", [S(fileName)]),
        n("RelativeFilename", [S(relativeFileName)]),
        n("ModelUVTranslation", [D(tex.uvTranslation ? tex.uvTranslation[0] : 0), D(tex.uvTranslation ? tex.uvTranslation[1] : 0)]),
        n("ModelUVScaling", [D(tex.uvScaling ? tex.uvScaling[0] : 1), D(tex.uvScaling ? tex.uvScaling[1] : 1)]),
        n("Texture_Alpha_Source", [S("None")]),
        n("Cropping", [I(0), I(0), I(0), I(0)])
    );
    if (tex.uvSet) children.push(n("UVSet", [S(tex.uvSet)]));
    return n("Texture", objProps(id, `Texture::${name}`, ""), children);
}

/** A Video object carrying embedded image bytes in Content (binary FBX only). */
export function video(id, name, fileName, pngBytes) {
    return n("Video", objProps(id, `Video::${name}`, "Clip"), [
        n("Type", [S("Clip")]),
        n("Properties70", [], [
            P("Path", "KString", "XRefUrl", "", S(fileName)),
            P("RelPath", "KString", "XRefUrl", "", S(fileName)),
        ]),
        n("UseMipMap", [I(0)]),
        n("Filename", [S(fileName)]),
        n("RelativeFilename", [S(fileName)]),
        n("Content", [R(pngBytes)]),
    ]);
}

/** A Model (transform node). subType "Mesh", "LimbNode", "Camera", "Light", "Null". */
export function model(id, name, subType = "Mesh", p70 = [], extraChildren = [], culling = "CullingOff") {
    // DCC importers (FBX SDK/Maya) require DefaultAttributeIndex to bind a node's attribute
    // (mesh/camera/light/skeleton). Without it the geometry never attaches to the node.
    const props = subType === "Null" ? [...p70] : [P("DefaultAttributeIndex", "int", "Integer", "", I(0)), ...p70];
    return n("Model", objProps(id, `Model::${name}`, subType), [
        n("Version", [I(232)]),
        n("Properties70", [], props),
        n("Shading", [B(true)]),
        n("Culling", [S(culling)]),
        ...extraChildren,
    ]);
}

/** Transform Properties70 entries from a plain spec object. */
export function transformProps(t = {}) {
    const p = [];
    const v3 = (key, type, val) => p.push(P(key, type, "A", "A", D(val[0]), D(val[1]), D(val[2])));
    if (t.translation) v3("Lcl Translation", "Lcl Translation", t.translation);
    if (t.rotation) v3("Lcl Rotation", "Lcl Rotation", t.rotation);
    if (t.scaling) v3("Lcl Scaling", "Lcl Scaling", t.scaling);
    if (t.preRotation) v3("PreRotation", "Vector3D", t.preRotation);
    if (t.postRotation) v3("PostRotation", "Vector3D", t.postRotation);
    if (t.rotationPivot) v3("RotationPivot", "Vector3D", t.rotationPivot);
    if (t.scalingPivot) v3("ScalingPivot", "Vector3D", t.scalingPivot);
    if (t.rotationOffset) v3("RotationOffset", "Vector3D", t.rotationOffset);
    if (t.scalingOffset) v3("ScalingOffset", "Vector3D", t.scalingOffset);
    if (t.geometricTranslation) v3("GeometricTranslation", "Vector3D", t.geometricTranslation);
    if (t.geometricRotation) v3("GeometricRotation", "Vector3D", t.geometricRotation);
    if (t.geometricScaling) v3("GeometricScaling", "Vector3D", t.geometricScaling);
    if (t.rotationOrder !== undefined) p.push(P("RotationOrder", "enum", "", "", I(t.rotationOrder)));
    if (t.inheritType !== undefined) p.push(P("InheritType", "enum", "", "", I(t.inheritType)));
    return p;
}

/** GlobalSettings node with axis + unit configuration. */
export function globalSettings({ upAxis = 1, upAxisSign = 1, frontAxis = 2, frontAxisSign = 1, coordAxis = 0, coordAxisSign = 1, unitScaleFactor = 1 } = {}) {
    return n("GlobalSettings", [], [
        n("Version", [I(1000)]),
        n("Properties70", [], [
            P("UpAxis", "int", "Integer", "", I(upAxis)),
            P("UpAxisSign", "int", "Integer", "", I(upAxisSign)),
            P("FrontAxis", "int", "Integer", "", I(frontAxis)),
            P("FrontAxisSign", "int", "Integer", "", I(frontAxisSign)),
            P("CoordAxis", "int", "Integer", "", I(coordAxis)),
            P("CoordAxisSign", "int", "Integer", "", I(coordAxisSign)),
            P("UnitScaleFactor", "double", "Number", "", D(unitScaleFactor)),
        ]),
    ]);
}

/** Assemble a complete, DCC-conformant FBX document (Maya/Autodesk-importable). */
export function doc(objects, connections, settings, version = 7400) {
    const conNodes = connections.map((c) =>
        c.prop !== undefined
            ? n("C", [S(c.type), L(c.child), L(c.parent), S(c.prop)])
            : n("C", [S(c.type), L(c.child), L(c.parent)])
    );

    // FBXHeaderExtension + version handshake.
    const header = n("FBXHeaderExtension", [], [
        n("FBXHeaderVersion", [I(1004)]),
        n("FBXVersion", [I(version)]),
        n("EncryptionType", [I(0)]),
        n("CreationTimeStamp", [], [
            n("Version", [I(1000)]),
            n("Year", [I(2026)]), n("Month", [I(1)]), n("Day", [I(1)]),
            n("Hour", [I(0)]), n("Minute", [I(0)]), n("Second", [I(0)]), n("Millisecond", [I(0)]),
        ]),
        n("Creator", [S("Babylon FBX visual-test generator")]),
    ]);

    // Documents / RootNode 0 — tells the importer node 0 is the scene root.
    const DOC_ID = 1000000000;
    const documents = n("Documents", [], [
        n("Count", [I(1)]),
        n("Document", [L(DOC_ID), S("Scene"), S("Scene")], [
            n("Properties70", [], [P("ActiveAnimStackName", "KString", "", "", S("Take 001"))]),
            n("RootNode", [I(0)]),
        ]),
    ]);

    // Definitions — object-type counts (Maya uses these to instantiate objects).
    const counts = new Map();
    for (const o of objects) {
        counts.set(o.name, (counts.get(o.name) || 0) + 1);
    }
    const defChildren = [n("Version", [I(100)]), n("Count", [I(objects.length + 1)]),
        n("ObjectType", [S("GlobalSettings")], [n("Count", [I(1)])])];
    for (const [type, c] of counts) {
        defChildren.push(n("ObjectType", [S(type)], [n("Count", [I(c)])]));
    }
    const definitions = n("Definitions", [], defChildren);

    const takes = n("Takes", [], [n("Current", [S("Take 001")])]);

    return [
        header,
        settings || globalSettings(),
        documents,
        n("References", [], []),
        definitions,
        n("Objects", [], objects),
        n("Connections", [], conNodes),
        takes,
    ];
}

export const OO = (child, parent) => ({ type: "OO", child, parent });
export const OP = (child, parent, prop) => ({ type: "OP", child, parent, prop });

/** Sequential id generator starting at `start`. */
export function idGen(start = 1000) {
    let n = start;
    return () => n++;
}

/**
 * Build a single mesh: geometry + model + material + their connections.
 * @param next id generator (from idGen)
 * @param name base name
 * @param shape geometry options (from lib/shapes or hand-built)
 * @param opts { type, matProps, transform, parent }
 * @returns { objects, connections, modelId, matId, geomId }
 */
export function meshTriplet(next, name, shape, { type = "Phong", matProps = {}, transform, parent = 0, culling = "CullingOff" } = {}) {
    const geomId = next(), modelId = next(), matId = next();
    const objects = [
        geometry(geomId, name, shape),
        model(modelId, name, "Mesh", transform ? transformProps(transform) : [], [], culling),
        material(matId, name + "Mat", type, matProps),
    ];
    const connections = [OO(modelId, parent), OO(geomId, modelId), OO(matId, modelId)];
    return { objects, connections, modelId, matId, geomId };
}
