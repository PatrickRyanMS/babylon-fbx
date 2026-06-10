// Animation builder: AnimationStack (clip) -> AnimationLayer -> AnimationCurveNode (T/R/S, bound
// to a model's Lcl property) -> AnimationCurve (per X/Y/Z channel). Times are FBX ticks.
import { n, I, L, D, Fn, In, Ln, P, objProps } from "./fbxNode.mjs";
import { OO, OP } from "./fbxScene.mjs";

const FBX_TIME = 46186158000; // ticks per second
const INTERP_FLAG = { constant: 0x00000002, linear: 0x00000004, cubic: 0x00000008 };

function curveNode(next, keys) {
    const id = next();
    const times = keys.map((k) => k.t * FBX_TIME);
    const values = keys.map((k) => k.v);
    // Group consecutive keys with the same interpolation into KeyAttr entries.
    const flags = [], refcounts = [], data = [];
    let i = 0;
    while (i < keys.length) {
        const flag = INTERP_FLAG[keys[i].interp] ?? INTERP_FLAG.linear;
        let count = 1;
        while (i + count < keys.length && (INTERP_FLAG[keys[i + count].interp] ?? INTERP_FLAG.linear) === flag) count++;
        flags.push(flag);
        refcounts.push(count);
        data.push(0, 0, 0, 0); // rightSlope, nextLeftSlope, rightWeight, nextLeftWeight
        i += count;
    }
    const node = n("AnimationCurve", objProps(id, "AnimCurve::", ""), [
        n("Default", [D(values[0] || 0)]),
        n("KeyVer", [I(4009)]),
        n("KeyTime", [Ln(times)]),
        n("KeyValueFloat", [Fn(values)]),
        n("KeyAttrFlags", [In(flags)]),
        n("KeyAttrDataFloat", [Fn(data)]),
        n("KeyAttrRefCount", [In(refcounts)]),
    ]);
    return { id, node };
}

/**
 * @param next id generator
 * @param clips [{ name, start, stop, tracks: [{ modelId, type:"T"|"R"|"S", prop, defaults:[x,y,z], channels:{X,Y,Z} }] }]
 *   each channel is [{ t:seconds, v:number, interp:"constant"|"linear"|"cubic" }]
 * @returns { objects, connections }
 */
export function buildAnimation(next, clips) {
    const objects = [], connections = [];
    for (const clip of clips) {
        const stackId = next();
        objects.push(n("AnimationStack", objProps(stackId, `AnimStack::${clip.name}`, ""), [
            n("Properties70", [], [
                P("LocalStart", "KTime", "Time", "", L(Math.round(clip.start * FBX_TIME))),
                P("LocalStop", "KTime", "Time", "", L(Math.round(clip.stop * FBX_TIME))),
                P("ReferenceStart", "KTime", "Time", "", L(Math.round(clip.start * FBX_TIME))),
                P("ReferenceStop", "KTime", "Time", "", L(Math.round(clip.stop * FBX_TIME))),
            ]),
        ]));

        const layerId = next();
        objects.push(n("AnimationLayer", objProps(layerId, "AnimLayer::BaseLayer", ""), []));
        connections.push(OO(layerId, stackId));

        for (const track of clip.tracks) {
            const cnId = next();
            // Single-channel track (e.g. a BlendShapeChannel's DeformPercent).
            if (track.keys) {
                objects.push(n("AnimationCurveNode", objProps(cnId, `AnimCurveNode::${track.type}`, ""), [
                    n("Properties70", [], [P(track.channel, "Number", "", "A", D(track.default ?? 0))]),
                ]));
                connections.push(OO(cnId, layerId));
                connections.push(OP(cnId, track.modelId, track.prop));
                const c = curveNode(next, track.keys);
                objects.push(c.node);
                connections.push(OP(c.id, cnId, track.channel));
                continue;
            }
            const d = track.defaults || [0, 0, 0];
            objects.push(n("AnimationCurveNode", objProps(cnId, `AnimCurveNode::${track.type}`, ""), [
                n("Properties70", [], [
                    P("d|X", "Number", "", "A", D(d[0])),
                    P("d|Y", "Number", "", "A", D(d[1])),
                    P("d|Z", "Number", "", "A", D(d[2])),
                ]),
            ]));
            connections.push(OO(cnId, layerId));
            connections.push(OP(cnId, track.modelId, track.prop));
            for (const [axis, chan] of [["X", "d|X"], ["Y", "d|Y"], ["Z", "d|Z"]]) {
                const keys = track.channels[axis];
                if (!keys || keys.length === 0) continue;
                const c = curveNode(next, keys);
                objects.push(c.node);
                connections.push(OP(c.id, cnId, chan));
            }
        }
    }
    return { objects, connections };
}
