# FBX feature support audit

## Scope

This audit compares the current loader implementation with FBX data found in the repository's model fixtures, with extra focus on assets that still have known loading problems:

- `tests\models\behemot-cat\LowPoly_Cat_V04.fbx`
- `tests\models\tamagotchi-pet-sailor-moon\lp_01.fbx`
- `tests\models\the-last-stronghold-animated\Floating_Gate_Chinese1.fbx`
- `tests\models\vino\SM_Vino.fbx`

It also keeps the current visual gates in mind: Aisha, Bristleback, Phoenix, Spider, Spartan, Globophobia, and Mannequin.

## Current support baseline

The loader currently supports these FBX features well enough to render the current passing gates:

- FBX 7-style binary and ASCII node trees with numeric object IDs and `Connections/C` entries.
- Scoped FBX 6 binary static mesh/material import with legacy string object names and `Connect` entries.
- Mesh `Geometry` objects with vertices, polygon vertex indices, normals, UV sets, vertex colors, material indices, and simple fan triangulation.
- Model transform properties: `Lcl Translation`, `Lcl Rotation`, `Lcl Scaling`, `PreRotation`, `PostRotation`, pivots, offsets, rotation order, and Blender-aligned geometric transform composition.
- Standard FBX skin deformers with clusters, weights, `Transform`, `TransformLink`, and bind-pose matrices.
- Shared deformation-rig resolution across multiple skins.
- Basic blend shapes and `DeformPercent` animation.
- Model T/R/S animation curves with constant, linear, and cubic curve sampling.
- Lambert/Phong-ish material properties and common texture slots mapped onto Babylon `StandardMaterial`.
- Embedded texture blobs where the `Video/Content` node contains image data.
- Basic camera and light extraction.

## Blender importer comparison gaps

Blender's importer is a useful reference implementation because it handles a much wider FBX surface area. The current loader is intentionally narrower. Key Blender-supported areas that are missing or partial here:

### Scene graph, connections, and version compatibility

- Blender's `load()` path builds a template-aware import table, object table, connection graph, helper hierarchy, and model/node-attribute attachments before creating runtime objects. The current loader resolves `Objects`/`Connections` into a simpler model hierarchy and supports only the FBX 7 numeric connection model plus scoped FBX 6 static `Connect` handling.
- Blender has a broader FBX-version compatibility layer around parsing, templates, object types, and importer quirks. The current parser handles binary/ASCII node records, zlib arrays, and FBX 7.5+ 64-bit node headers, but compatibility beyond known fixture patterns is limited.
- Blender uses property templates as fallbacks when object-local `Properties70` values are absent. The current interpreter mostly reads object-local properties and has only limited defaulting.

### Geometry and layer elements

- Blender imports more geometry layers: material assignment, UVs, vertex colors, smoothing, edge creases, custom normals, and validation/error recovery across mapping/reference modes.
- The current geometry interpreter supports positions, polygon indices, normals, UV sets, vertex colors, material indices, and reads smoothing groups, but does not use smoothing groups to split/recompute normals.
- Still missing or partial versus Blender: edge creases, tangents, binormals, `LayerElementVisibility`, robust validation for malformed layer lengths, and robust triangulation for concave n-gons.

### Materials, textures, and images

- Blender supports a richer material/texture/image graph, including broader texture properties, texture-image linkage, layered texture handling, and more FBX material variants.
- The current loader maps Lambert/Phong-like material properties to `StandardMaterial`, handles common texture slots, embedded `Video/Content`, and extension fallback for mismatched texture filenames.
- Still missing or partial versus Blender: `LayeredTexture`, PBR/material-extension slots, richer specular/gloss/displacement semantics, broader texture path search behavior, and more precise transparency/alpha interpretation.

### Cameras and lights

- Blender imports more camera node-attribute fidelity, including projection/orthographic behavior, focal length/filmback-style properties, roll, and target/interest-style relationships.
- The current loader creates a basic `FreeCamera` from field of view, near/far planes, and aspect ratio.
- Blender imports richer light attributes and maps more light behavior. The current loader supports point/directional/spot type, color, intensity, and cone angle, but not softness, shadow-related settings, or detailed decay semantics.

### Transforms, inheritance, and geometric transforms

- Blender evaluates a full FBX transform chain with `Lcl` TRS, pivots, offsets, pre/post rotations, rotation order, and mesh-only geometric transforms. The current loader now aligns geometric transform composition with Blender for static mesh baking.
- Blender's helper hierarchy keeps separate matrices for a node's full transform, parent-inherited transform, and geometric transform. The current loader composes and bakes what is needed for Babylon runtime objects rather than mirroring Blender's helper structure.
- `InheritType` / segment-scale compensation remains a gap: the current interpreter parses `InheritType`, but runtime transform evaluation does not implement the alternative FBX inheritance modes.

### Skinning, bind poses, and associate models

- Blender reconciles armature/bone construction from model hierarchy, clusters, bind poses, and helper nodes, including mixed bone/non-bone hierarchies.
- The current loader resolves shared deformation rigs from cluster target ancestry and uses `TransformLink` / bind pose / rest fallback matrices, but does not mirror Blender's armature helper-node system.
- `TransformAssociateModel` is extracted and tested, but not yet used in runtime skinning math. Blender has associate-model handling in its cluster/bind setup path.
- Cluster modes and richer bind-pose reconciliation are still partial compared with Blender.

### Animation and animated properties

- Blender combines animation stacks/layers/curves into sampled object/bone animation and handles more animated property targets.
- The current loader supports model and bone TRS curves plus blend-shape `DeformPercent`, but ignores many animated properties such as visibility, camera focal length/focus, light properties, custom attributes, and rig-control metadata.
- Animation layer blending is preserved in extracted data only; runtime evaluation does not blend layers.

### Blend shapes / shape keys

- Blender supports shape keys, `BlendShapeChannel`, `Shape`, `DeformPercent`, and in-between/full-weight behavior.
- The current interpreter extracts channels and all shape children, but the loader uses only the first shape per channel. `FullWeights` / in-between shape selection remains unsupported.

### Constraints and other deformers

- Blender imports a broader FBX scene/deformer graph and has code paths for constraint-like and helper relationships used by DCC exports.
- The current loader has no constraint module and only supports skin clusters plus blend shapes as deformers.

## Unsupported or partial FBX data found in the fixtures

### FBX 6 legacy object model

`tamagotchi-pet-sailor-moon\lp_01.fbx` is binary FBX 6100. The parser can read its top-level nodes, and the interpreter now supports this fixture's static mesh/material graph.

Implemented scope: the connection resolver synthesizes IDs for string-named FBX 6 objects, adapts `Connect` entries, and creates synthetic `Geometry` objects for mesh data embedded directly under `Model` nodes. The loader also composes mesh-only geometric transforms as scale/rotate/translate so FBX 6 assets that mix `GeometricTranslation` and `Lcl Translation` keep chain/accessory parts aligned. FBX 6 Takes/skinning remain out of scope until a fixture requires them.

### More than four skin influences per vertex

The initial audit incorrectly counted influences across all skins in a file. Corrected per-skin diagnostics show the current problem fixtures do not exceed four influences per control point:

| Asset | Max influences | Weighted vertices over 4 |
| --- | ---: | ---: |
| Behemot Cat | 3 | 0 |
| Last Stronghold | 4 | 0 |

The loader now supports Babylon's extra influence buffers up to eight influences as a compatibility guardrail, but this is no longer considered a likely root cause for Behemot or Last Stronghold.

### Cluster `TransformAssociateModel`

`the-last-stronghold-animated\Floating_Gate_Chinese1.fbx` has `TransformAssociateModel` on all 1,460 clusters. The interpreter now extracts and preserves these matrices on cluster bones. The cluster `Mode` node was absent in this fixture, so runtime associate-model deformation semantics are still deferred until an additive/associate-mode fixture verifies the behavior.

Remaining Stronghold work should verify whether these matrices affect runtime deformation for files without an explicit cluster `Mode` node.

### FBX transform inheritance (`InheritType`) and segment-scale compensation

Several rigs contain non-default inheritance data:

| Asset | Non-default `InheritType` models |
| --- | ---: |
| Aisha | 307 |
| Spider | 47 |
| Behemot Cat | 2 |

The loader now parses `InheritType` into model and bone data, but does not change runtime transform behavior. Aisha and Spider currently pass visual gates despite non-default inheritance data, so parent-scale inheritance semantics remain a diagnostics-only item until a fixture proves they are needed.

### Visibility

The fixtures include both static and animated visibility data:

- Aisha: 59 hidden models and 83 animated visibility targets.
- Behemot Cat: 3 animated visibility targets.
- Other assets also include animated visibility and `LayerElementVisibility`.

The loader does not currently create visibility animations or use `LayerElementVisibility`. Static model visibility is also not treated as a first-class mesh visibility/culling signal.

### Geometry fidelity

The geometry interpreter currently fan-triangulates all polygons. Many fixtures include large numbers of n-gons, and some have polygons up to 8 vertices. Fan triangulation is only safe for convex polygons; concave n-gons can create overlapping or inverted triangles that look like spikes or torn geometry.

Other partial geometry areas:

- `LayerElementTangent` and `LayerElementBinormal` are ignored.
- `LayerElementVisibility` is ignored.
- Smoothing groups are read but not used to recompute or split normals.
- Unknown mapping/reference modes fall back instead of surfacing a diagnostic.

### Materials and textures

The loader creates `StandardMaterial` and maps common texture slots. Partial/ignored material areas found in fixtures include:

- `LayeredTexture` is unsupported.
- PBR-style/material-extension slots are unsupported.
- `ShininessExponent` and displacement textures are intentionally ignored.
- Spartan uses Maya environment texture slots (`Maya|TEX_*`) that are not mapped.
- Transparency semantics need closer validation for assets like Vino that connect `TransparentColor`.
- Texture path resolution currently uses basenames from FBX paths, which may not cover all exported folder layouts.

Vino is non-skinned, so its display problem is likely in this material/visibility/static-geometry group rather than rig resolution.

### Blend shape in-between targets

Aisha, Bristleback, and Mannequin include `FullWeights` on blend shape channels. The interpreter extracts all shape children, but the loader uses only `channel.shapes[0]`. FBX in-between morph targets are therefore unsupported.

### Animation layers and non-TRS properties

The animation extractor preserves layer weight and blend mode, but the loader flattens curve nodes and does not evaluate animation layer blending.

The loader handles model T/R/S and blend shape `DeformPercent`. Other animated properties found in fixtures are ignored, including visibility, camera focal length, lock/control custom attributes, and rig-control metadata curves.

### Global unit and axis settings

Global axis settings are extracted and current coordinate conversion is now gated on `scene.useRightHandedSystem`, but unit scale is not applied consistently to mesh positions and transforms. `UnitScaleFactor` appears in fixtures such as Phoenix (`0.1`) and Mannequin (`2.54`); morph deltas are scaled, but scene geometry and transforms should be audited as a whole before changing this globally.

## Asset-specific hypotheses

### Behemot Cat

Most likely causes:

1. Heavy n-gon fan triangulation.
2. Pivot/offset/post-rotation transforms and two non-default inheritance nodes.
3. Animated visibility.

The focused diagnostics found no geometric transforms on Behemot's skinned meshes, so skinned geometric-transform baking is not the immediate Behemot cause.

### Tamagotchi Pet

Main cause:

1. FBX 6100 legacy object/connection model required scoped compatibility support.
2. Mesh-only geometric transforms needed Blender-aligned composition; the chain uses a valid mix of `GeometricTranslation` and `Lcl Translation`.

This was a compatibility gap rather than a skinning bug; static mesh/material import is now covered.

### Last Stronghold

Most likely causes:

1. `TransformAssociateModel` on all clusters.
2. Many non-uniformly scaled models.
3. Large n-gons.

The first pass has ruled out more-than-four per-skin influences. Remaining work should focus on associate-model semantics, transform inheritance, and geometry fidelity before making broad bind-pose changes.

### Vino

Most likely causes:

1. Material/alpha/texture handling, especially `TransparentColor`.
2. Multi-material/sub-mesh assignment with `LayerElementMaterial: ByPolygon`.
3. Geometric transforms on all three models; transform composition is now Blender-aligned, but material/visibility validation remains.
4. Ignored tangents/binormals and possible culling/visibility differences.

Because Vino is not skinned, rig fixes should not be needed for this asset.

## Prioritized implementation plan

1. Add targeted diagnostics and regression fixtures for the four problem assets: parsed feature assertions, max-influence assertions, FBX 6 object-count assertions, and viewer entries or screenshots where useful.
2. Support more than four skin influences, using Babylon's extra influence buffers where possible and truncating to the highest supported count only after sorting and diagnostics.
3. Investigate and implement `TransformAssociateModel` handling for clusters, using Last Stronghold as the gate and preserving the current bind/rest invariant for Aisha, Spider, Bristleback, and Phoenix.
4. Fix Vino-class static mesh/material issues: validate multi-material splits, alpha/transparent texture semantics, culling, texture path resolution, and geometric transform handling.
5. Add scoped FBX 6 support for static meshes and materials by synthesizing IDs for string-named objects and adapting `Connect` entries. Defer FBX 6 Takes/skinning unless a fixture requires them.
6. Implement FBX transform inheritance modes and segment-scale compensation with strict regression gates. Treat Spider and Aisha as canaries because they currently pass despite containing inheritance data.
7. Improve geometry fidelity: robust triangulation for concave n-gons, smoothing-group normal handling, edge crease handling, tangent/binormal extraction, `LayerElementVisibility`, and validation for malformed layer data.
8. Extend material support: layered textures, better transparency/specular/gloss/displacement handling, optional PBR material mapping, texture-image graph fidelity, and non-basename texture path lookup.
9. Add template-aware property fallback and broader scene graph/node-attribute compatibility where fixtures require it.
10. Support blend shape in-between targets through `FullWeights`.
11. Support animation layer blending and selected non-TRS animated properties, starting with visibility, camera, and light properties.
12. Extend camera/light support beyond the current basic property subset if real assets require those node attributes.

## Guardrails

- Keep parser-layer code Babylon-independent.
- Preserve the current bind/rest convention: rest locals come from FBX model transforms, bind data comes from cluster/bind-pose matrices, and animation drives local model transforms.
- Do not fold Babylon's left-handed conversion root into skin bind or pose matrices.
- Add regression gates before changing transform inheritance or bind math, because Aisha, Spider, Bristleback, and Phoenix are now known-good reference assets.
