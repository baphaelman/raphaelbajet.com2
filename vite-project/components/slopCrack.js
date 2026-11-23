// The rupture (SlopRupture.jsx): a split in the page, brimming with ink, and the tear that pulls it open. Drawn from a
// fixed seed, so it's the same split on every visit. Lengths are in css px, from the top left of the crack's box

// mulberry32: a small seeded random
function seeded(seed) {
    return () => {
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp01 = (t) => Math.min(1, Math.max(0, t));
export const smoothstep = (a, b, t) => {
    const x = clamp01((t - a) / (b - a));
    return x * x * (3 - 2 * x);
};

// value noise, tiling every 256, from a fixed seed
const NOISE_SIZE = 256;
const lattice = (() => {
    let seed = 91;
    const grid = new Float32Array(NOISE_SIZE * NOISE_SIZE);
    for (let i = 0; i < grid.length; i++) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        grid[i] = seed / 4294967296;
    }
    return grid;
})();

function noise(x, y) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = x - xi;
    const fy = y - yi;
    const u = fx * fx * (3 - 2 * fx);
    const v = fy * fy * (3 - 2 * fy);
    const m = NOISE_SIZE - 1;
    const x0 = xi & m;
    const y0 = (yi & m) * NOISE_SIZE;
    const x1 = (xi + 1) & m;
    const y1 = ((yi + 1) & m) * NOISE_SIZE;
    const a = lattice[y0 + x0];
    const b = lattice[y0 + x1];
    const c = lattice[y1 + x0];
    const d = lattice[y1 + x1];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// a few octaves of noise, about `size` px across at the coarsest, in 0..1
export function fbm(x, y, size, octaves, offset = 0) {
    let sum = 0;
    let weight = 0.5;
    let total = 0;
    let scale = 1 / size;
    for (let i = 0; i < octaves; i++) {
        sum += noise(x * scale + offset, y * scale + offset * 1.7) * weight;
        total += weight;
        weight *= 0.5;
        scale *= 2.03;
    }
    return sum / total;
}

// how far the painting reaches past the crack's box on every side, for drips, stains and light to land on
export const PAD = 90;

// the split runs down the top of the box; below it is room for what drips off it
const SPLIT = 0.84;
const KNOTS = 15;
// at the width the crack was drawn for: how far the split gapes either side of its middle, at most, and how far the
// ink brims over its edges
const DRAWN_WIDTH = 230;
const GAPE = 30;
const LIP = 9;

function catmull(p0, p1, p2, p3, t) {
    const t2 = t * t;
    const t3 = t2 * t;
    return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

// The split in a box `width` by `height`: where its sides are at any height, how far the ink brims over them, the
// drips and beads of it around them, each a path of [x, y, radius] to be joined smoothly onto the rest (`k` px), and
// the strands of it left across the gap, and the drops of it flung out, when it's torn open
export function crackShape(width, height) {
    const rand = seeded(5);
    const scale = Math.min(1.3, Math.max(0.65, width / DRAWN_WIDTH));
    const length = height * SPLIT;

    // the spine: twisting, gaping widest a little above the middle, pinched and swollen along the way
    const knots = [];
    let x = 0;
    for (let k = 0; k < KNOTS; k++) {
        const t = k / (KNOTS - 1);
        if (k > 0) x += -x * 0.28 + (rand() - 0.5) * width * (rand() < 0.3 ? 0.22 : 0.1) * Math.sin(Math.PI * t) ** 0.4;
        const end = k === 0 || k === KNOTS - 1;
        const broken = Math.exp(-(((t - 0.42) / 0.2) ** 2));
        knots.push({
            x: width / 2 + x,
            gape: end ? 0 : GAPE * scale * (0.25 + 0.75 * broken) * Math.sin(Math.PI * t) ** 0.9 * (0.45 + rand() * 0.9),
        });
    }

    // the split at height `y`: its middle, its sides (`left` > `right` where it's closed), and how far down it `t` is
    function at(y) {
        const t = y / length;
        const u = clamp01(t) * (KNOTS - 1);
        const k = Math.min(KNOTS - 2, Math.floor(u));
        const f = u - k;
        const knot = (i) => knots[Math.max(0, Math.min(KNOTS - 1, i))];
        const cx = catmull(knot(k - 1).x, knot(k).x, knot(k + 1).x, knot(k + 2).x, f);
        const gape = catmull(knot(k - 1).gape, knot(k).gape, knot(k + 1).gape, knot(k + 2).gape, f);
        if (t < 0 || t > 1 || gape <= 0) return { cx, left: cx, right: cx - 1, t };
        // each side lumpy on its own
        const left = cx - gape * (1 + 0.7 * (fbm(0, y, 18, 3, 13) - 0.5));
        const right = cx + gape * (1 + 0.7 * (fbm(0, y, 18, 3, 29) - 0.5));
        return { cx, left, right, t };
    }

    // how far past the split's sides the ink brims at (x, y): lumpy, in runs down the wall, more of it lower down
    function lip(x, y) {
        const t = y / length;
        if (t < 0 || t > 1) return 0;
        const taper = 0.3 + 0.7 * Math.sin(Math.PI * t) ** 0.5;
        return LIP * scale * taper * (0.3 + 1.3 * fbm(x, y / 3.5, 12, 3, 7) ** 1.3) * (0.65 + 0.7 * t);
    }

    const paths = [];
    const floor = height - 4; // nothing runs past the bottom of the box
    const outside = (y, side) => {
        const { left, right } = at(y);
        return (side < 0 ? left : right) + side * LIP * scale * 0.75;
    };

    // a drip: thick where it leaves, necked, with a bead at the end
    function drip(x0, y0, r0, reach) {
        const phase = rand() * 10;
        reach = Math.min(reach, floor - y0 - r0 * 2.4);
        if (reach < 4) return;
        const points = [];
        const n = Math.max(2, Math.ceil(reach / 4));
        for (let j = 0; j <= n; j++) {
            const u = j / n;
            const neck = 1 - 0.55 * Math.sin(Math.PI * Math.min(1, u * 1.1)) ** 0.8;
            points.push([x0 + Math.sin(phase + u * 3) * 0.7 * u, y0 + u * reach, r0 * neck]);
        }
        const [ex, ey] = points[points.length - 1];
        points.push([ex, ey + r0 * 0.6, r0 * 1.25], [ex, ey + r0 * 1.1, r0 * 1.2]);
        paths.push({ points, k: 3 });
    }
    for (let j = 0; j < 8; j++) {
        const side = j % 2 ? 1 : -1;
        const y = length * (0.2 + 0.75 * rand());
        drip(outside(y, side) - side * 2, y, 1.6 + rand() * 2.5, 14 + rand() ** 1.5 * 120);
    }
    // the bottom of the split collects it
    drip(at(length - 4).cx, length - 6, 3.4, 80);
    // beads of it coming through the paint nearby
    for (let j = 0; j < 8; j++) {
        const side = rand() < 0.5 ? -1 : 1;
        const y = length * (0.12 + 0.8 * rand());
        const r = 0.8 + rand() ** 2 * 2.6;
        const bx = outside(y, side) + side * (4 + rand() ** 1.5 * 26);
        paths.push({ points: [[bx, y, r], [bx, y + r * 0.3, r * 1.05]], k: 1 });
        if (r > 1.8 && rand() < 0.6) drip(bx, y, r * 0.6, 6 + rand() * 26);
    }

    // the outline of the split, for the zone's text showing through it: down the left side, back up the right
    function outline() {
        const left = [];
        const right = [];
        for (let y = 0; y <= length; y += 3) {
            const side = at(y);
            if (side.right <= side.left) continue;
            left.push([side.left, y]);
            right.push([side.right, y]);
        }
        return [...left, ...right.reverse()];
    }

    // the middle of the split, where it gapes widest, which it's stretched out from as it's torn open
    const middle = { x: at(length * 0.42).cx, y: length * 0.42 };

    // strands of ink across the gap, hidden in it at rest: each at a height where it's wide enough, sagging a share of
    // its length, and snapping, a share of the way along it, a moment after the one before once the split breaks
    const strands = [];
    for (let j = 0; strands.length < STRANDS && j < 40; j++) {
        const y = length * (0.1 + 0.8 * rand());
        const side = at(y);
        if (side.right - side.left < 8 || strands.some((s) => Math.abs(s.y - y) < length * 0.04)) continue;
        strands.push({ y, radius: 1.2 + rand() * 1.4, sag: 0.2 + rand() * 0.3, cut: 0.3 + rand() * 0.4, tilt: (rand() - 0.5) * 8 });
    }
    strands.forEach((strand, i) => {
        strand.snapsAt = BREAK + 0.004 + 0.07 * ((i + rand() * 0.6) / strands.length);
    });

    // drops of it flung out as it breaks: from somewhere across the gap, toward the side they're nearer, up or down a
    // little, a moment apart
    const drops = [];
    for (let j = 0; j < DROPS; j++) {
        const across = rand();
        drops.push({
            y: length * (0.15 + 0.7 * rand()),
            across,
            side: across < 0.5 ? -1 : 1,
            speed: 500 + rand() * 1400, // px a second
            rise: -380 + rand() * 480,
            radius: 1.2 + rand() ** 2 * 2.6,
            delay: rand() * 0.05, // s
        });
    }

    return { at, lip, paths, outline, middle, length, strands, drops };
}

// The tear, `t` of the way from the crack at rest (0) to the zone (1). First it strains: the split gives a little, then
// less and less, the ink brimming in it stretching into a skin that starts to tear, the strands in it drawn taut. It
// holds there, at full stretch. Then it breaks: the sides are blown apart and off the screen, fast at first, the split
// stretched past the top and bottom of it; the strands snap one after another, each half whipping back to its side,
// and drops of ink are flung out. Sealing (sealStep) runs it back at its own pace, from `SEAL_FROM`, where the sides
// are about at the edges of the screen: they come in, gathering speed, meet, press together a moment, and ease back
// to rest
export const TEAR_MS = { open: 1800 };
const SEAL_MS = { in: 450, press: 250, settle: 550 };
export const STRANDS = 10;
export const DROPS = 20;
const STRAIN = 0.3; // of the way through, where it's stretched as far as it'll go
const BREAK = 0.53; // where it breaks, after holding there
const GONE = 0.83; // where its sides are well off the screen
// how sudden the sides' going is, once it's broken: blown apart, opening; drawn in, sealing
const BURST = { opening: 4, sealing: 1.6 };
const EDGES = 0.76; // how far the sides have been pulled when they're about at the edges of the screen
export const SEAL_FROM = BREAK + (1 - (1 - EDGES) ** (1 / BURST.sealing)) * (GONE - BREAK);
const STRAIN_PX = 30; // how far each side moves out while it strains
const CREEP_PX = 5; // and while it holds

const easeOut = (t) => 1 - (1 - t) ** 3;

// how far to pull the split open at height `y` in it, at rest: a share of `strain` and `pull` (tearAt), most in the
// middle, least at the ends. slopGooGL.js works it out the same way
function pullAt(y, { strain, pull }, length) {
    const middle = Math.max(0, Math.sin(Math.PI * clamp01(y / length)));
    return strain * middle ** 0.8 + pull * middle ** 0.3;
}

// How far the tear has to go for a crack at `rect` (on screen) on a screen `width` by `height`: how many times taller to
// stretch the split, so it runs past the top and bottom, and how far to pull its sides, so they're off the sides
export function tearReach({ middle, length }, rect, width, height) {
    const above = rect.top + middle.y;
    const below = height - rect.top - middle.y;
    const tall = Math.max(2.5, above / (middle.y - 0.1 * length), below / (0.9 * length - middle.y));
    const top = Math.sin(Math.PI * clamp01((middle.y - above / tall) / length));
    const bottom = Math.sin(Math.PI * clamp01((middle.y + below / tall) / length));
    const x = rect.left + middle.x;
    return { tall, pull: (Math.max(x, width - x) + 160) / Math.min(top, bottom) ** 0.3 };
}

// The tear `t` of the way through, going as far as `reach` (tearReach), opening or `sealing`: how much the ink
// swells, how hard the zone's light presses through (`charge`, 0..1), how far the sides are pulled (`strain` and
// `pull`, px), how much taller the split is, how taut the strands are (`taut`, 0..1), how much of the skin across it
// has torn away (`level`), how long since it broke (`since`, s), and, at the very end, how far what's left has faded
export function tearAt(t, reach, sealing = false) {
    const strained = clamp01(t / STRAIN);
    const held = clamp01((t - STRAIN) / (BREAK - STRAIN));
    const burst = clamp01((t - BREAK) / (GONE - BREAK));
    const rip = 1 - (1 - burst) ** (sealing ? BURST.sealing : BURST.opening);
    return {
        t,
        swell: (3.5 * smoothstep(0, 1, strained) + held) * (1 - rip),
        charge: (0.6 * smoothstep(0, 1, strained) + 0.4 * held) * (1 - smoothstep(0, 0.4, burst)),
        strain: STRAIN_PX * easeOut(strained) + CREEP_PX * held,
        pull: reach.pull * rip,
        tall: 1 + (reach.tall - 1) * rip,
        taut: strained,
        level: lerp(-0.2, 0.32, smoothstep(0.5, 1, strained)) + 0.12 * held + 0.9 * smoothstep(0, 0.1, burst),
        since: Math.max(0, t - BREAK) * (TEAR_MS.open / 1000),
        fade: smoothstep(0.95, 1, t),
    };
}

// The tear sealing `elapsed` ms after it was `t` of the way through: the sides coming in, pressing together, and
// settling, each at its own pace
export function sealStep(t, elapsed) {
    const ms = t > BREAK ? SEAL_MS.in / (SEAL_FROM - BREAK) : t > STRAIN ? SEAL_MS.press / (BREAK - STRAIN) : SEAL_MS.settle / STRAIN;
    return Math.max(0, t - elapsed / ms);
}

// The tear, opening `t` of the way through, turned round to seal: where it is sealing with the sides pulled as far
export function turnedToSeal(t) {
    if (t <= BREAK) return t;
    const rip = 1 - (1 - (t - BREAK) / (GONE - BREAK)) ** BURST.opening;
    return BREAK + (1 - (1 - rip) ** (1 / BURST.sealing)) * (GONE - BREAK);
}

// where a height in the split at rest has been stretched to, and back
const stretched = (y, { tall }, { middle }) => middle.y + (y - middle.y) * tall;
const unstretched = (y, { tall }, { middle }) => middle.y + (y - middle.y) / tall;

// the gap the tear's opened, `inset` px in from its sides, as a polygon in the crack's box
export function tearOutline(shape, at, inset) {
    const left = [];
    const right = [];
    for (let y = 0; y <= shape.length; y += 3) {
        const side = shape.at(y);
        const pull = pullAt(y, at, shape.length);
        const l = (side.right > side.left ? side.left : side.cx) - pull + inset;
        const r = (side.right > side.left ? side.right : side.cx) + pull - inset;
        if (r <= l) continue;
        left.push([l, stretched(y, at, shape)]);
        right.push([r, stretched(y, at, shape)]);
    }
    return [...left, ...right.reverse()];
}

// The strands across the gap, for slopGooGL.js: for each, where its ends are (`ends`: x, y, x, y) and how it hangs
// (`look`: how far it sags, less the tauter it's drawn, how thick it is, how far its halves have whipped back once it's
// snapped (0..1), and where along it it snapped), all in the crack's box. They stretch apart less than the split does,
// holding on to its sides wherever those have got to at their height
export function tearStrands(shape, at) {
    const ends = new Float32Array(4 * STRANDS);
    const look = new Float32Array(4 * STRANDS);
    shape.strands.forEach((strand, i) => {
        const y = stretched(strand.y, { tall: 1 + (at.tall - 1) * 0.3 }, shape);
        const from = unstretched(y, at, shape);
        const side = shape.at(from);
        const left = side.right > side.left ? side.left : side.cx;
        const right = side.right > side.left ? side.right : side.cx;
        const pull = pullAt(from, at, shape.length);
        const rest = shape.at(strand.y);
        const span = right - left - 2 + 2 * pull;
        const stretch = Math.max(1, span / (rest.right - rest.left - 2));
        ends.set([left - pull + 1, y, right + pull - 1, y + strand.tilt * Math.sqrt(at.tall)], 4 * i);
        look.set([
            (rest.right - rest.left) * strand.sag * (1 - 0.7 * at.taut) * Math.sqrt(stretch),
            Math.max(1.5, strand.radius / Math.sqrt(stretch)),
            smoothstep(0, 1, (at.t - strand.snapsAt) / 0.07),
            strand.cut,
        ], 4 * i);
    });
    return { count: shape.strands.length, ends, look };
}

// The drops flung out as it breaks, for slopGooGL.js, in the crack's box: for each, a streak from where it is back to
// where it was a moment ago (`ends`: x, y, x, y), and how thick it is (`radius`, 0 once it's gone). They're thrown hard,
// slowed by the air, and fall
export function tearDrops(shape, { since }) {
    const ends = new Float32Array(4 * DROPS);
    const radius = new Float32Array(DROPS);
    const DRAG = 0.16; // s
    shape.drops.forEach((drop, i) => {
        const flying = since - drop.delay;
        if (flying <= 0 || flying > 0.6) return;
        const side = shape.at(drop.y);
        const x = lerp(side.left, side.right, drop.across);
        const at = (s) => {
            const thrown = DRAG * (1 - Math.exp(-s / DRAG));
            return [x + drop.side * drop.speed * thrown, drop.y + drop.rise * thrown + 700 * s * s];
        };
        ends.set([...at(flying), ...at(Math.max(0, flying - 0.03))], 4 * i);
        radius[i] = drop.radius * (1 - smoothstep(0.35, 0.6, flying));
    });
    return { count: DROPS, ends, radius };
}
