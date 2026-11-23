// Works out the shape of the rupture's ink (slopCrack.js) for slopGooGL.js to light: a texture over the crack's box and
// `PAD` around it, one texel a css px, holding at each point how far it is from the edge of the ink (< 0 inside it),
// from the edge of the split, and from the ink again but only outside it (for its stain); and, for each row of it,
// where the split's sides are, for the tear to pull apart. In a worker (slopCrackWorker.js), since it takes a moment
import { PAD, crackShape } from './slopCrack.js';

// how far from the split its distance is worked out exactly; past that, it only matters that it's far
const REACH = 48;

// polynomial smooth min: a and b joined with a fillet `k` across
function smin(a, b, k) {
    const h = Math.max(k - Math.abs(a - b), 0) / k;
    return Math.min(a, b) - h * h * k * 0.25;
}

// squared distance to the nearest set cell along one line (Felzenszwalb & Huttenlocher)
function distanceLine(f, n, d, v, z) {
    let k = 0;
    v[0] = 0;
    z[0] = -Infinity;
    z[1] = Infinity;
    for (let q = 1; q < n; q++) {
        let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
        while (s <= z[k]) {
            k--;
            s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
        }
        k++;
        v[k] = q;
        z[k] = s;
        z[k + 1] = Infinity;
    }
    k = 0;
    for (let q = 0; q < n; q++) {
        while (z[k + 1] < q) k++;
        d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
    }
}

// for every cell, the distance to the nearest cell where `set` is true
function distanceTo(set, width, height) {
    const grid = new Float64Array(width * height);
    for (let i = 0; i < grid.length; i++) grid[i] = set[i] ? 0 : 1e12;
    const n = Math.max(width, height);
    const f = new Float64Array(n);
    const d = new Float64Array(n);
    const v = new Int32Array(n);
    const z = new Float64Array(n + 1);
    for (let x = 0; x < width; x++) {
        for (let y = 0; y < height; y++) f[y] = grid[y * width + x];
        distanceLine(f, height, d, v, z);
        for (let y = 0; y < height; y++) grid[y * width + x] = d[y];
    }
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) f[x] = grid[y * width + x];
        distanceLine(f, width, d, v, z);
        for (let x = 0; x < width; x++) grid[y * width + x] = Math.sqrt(d[x]);
    }
    return grid;
}

// The ink for a crack box `width` by `height` (css px): `data` is `width` + 2 `PAD` by `height` + 2 `PAD` texels of
// RGBA floats, and `rows` one RGBA float a row of them: the split's left side, its right, and its middle (the sides
// both at the middle where it's closed)
export function paintGoo(width, height) {
    const W = Math.round(width) + 2 * PAD;
    const H = Math.round(height) + 2 * PAD;
    const shape = crackShape(width, height);

    // the split's sides along each row of texels (left > right where it's closed)
    const lefts = new Float32Array(H);
    const rights = new Float32Array(H);
    for (let y = 0; y < H; y++) {
        const side = shape.at(y + 0.5 - PAD);
        lefts[y] = side.left + PAD;
        rights[y] = side.right + PAD;
    }

    // how far each texel is from the split's edge, < 0 inside it: exactly, from the sides of the rows around it, so
    // it's smooth enough to light
    const gap = new Float32Array(W * H);
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const px = x + 0.5;
            const inside = px >= lefts[y] && px <= rights[y];
            let best = REACH * REACH;
            for (let step = 0; step <= 2 * REACH; step++) {
                const dy = step % 2 ? (step + 1) / 2 : -step / 2;
                if (dy * dy >= best) break;
                const row = y + dy;
                if (row < 0 || row >= H) continue;
                const l = lefts[row];
                const r = rights[row];
                let d2;
                if (!inside) {
                    if (r <= l) continue;
                    const dx = px < l ? l - px : px > r ? px - r : 0;
                    d2 = dx * dx + dy * dy;
                } else if (r <= l || px < l || px > r) {
                    d2 = dy * dy;
                } else {
                    const dx = Math.min(px - l, r - px);
                    d2 = dx * dx + dy * dy;
                }
                if (d2 < best) best = d2;
            }
            gap[y * W + x] = inside ? -Math.sqrt(best) : Math.sqrt(best);
        }
    }

    // the ink: brimming in the split and over its sides...
    const field = new Float32Array(W * H);
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const i = y * W + x;
            field[i] = gap[i] < REACH ? gap[i] - shape.lip(x + 0.5 - PAD, y + 0.5 - PAD) : gap[i];
        }
    }

    // ...and the drips and beads, each joined up with a plain min, then smoothly onto the rest
    const part = new Float32Array(W * H).fill(1e3);
    shape.paths.forEach(({ points, k }) => {
        let x0 = W;
        let x1 = 0;
        let y0 = H;
        let y1 = 0;
        for (let j = 0; j + 1 < points.length; j++) {
            const [ax, ay, ra] = points[j];
            const [bx, by, rb] = points[j + 1];
            const reach = Math.max(ra, rb) + k + 2;
            const fromX = Math.max(0, Math.floor(Math.min(ax, bx) + PAD - reach));
            const toX = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + PAD + reach));
            const fromY = Math.max(0, Math.floor(Math.min(ay, by) + PAD - reach));
            const toY = Math.min(H - 1, Math.ceil(Math.max(ay, by) + PAD + reach));
            const dx = bx - ax;
            const dy = by - ay;
            const length2 = dx * dx + dy * dy || 1e-6;
            for (let y = fromY; y <= toY; y++) {
                for (let x = fromX; x <= toX; x++) {
                    const X = x + 0.5 - PAD;
                    const Y = y + 0.5 - PAD;
                    const t = Math.min(1, Math.max(0, ((X - ax) * dx + (Y - ay) * dy) / length2));
                    const d = Math.hypot(X - (ax + t * dx), Y - (ay + t * dy)) - (ra + (rb - ra) * t);
                    const i = y * W + x;
                    if (d < part[i]) part[i] = d;
                }
            }
            x0 = Math.min(x0, fromX);
            x1 = Math.max(x1, toX);
            y0 = Math.min(y0, fromY);
            y1 = Math.max(y1, toY);
        }
        for (let y = y0; y <= y1; y++) {
            for (let x = x0; x <= x1; x++) {
                const i = y * W + x;
                if (part[i] < 1e3) field[i] = smin(field[i], part[i], k);
                part[i] = 1e3;
            }
        }
    });

    // how far each texel outside the ink is from it
    const ink = new Uint8Array(W * H);
    for (let i = 0; i < ink.length; i++) ink[i] = field[i] < 0 ? 1 : 0;
    const fromInk = distanceTo(ink, W, H);

    const data = new Float32Array(W * H * 4);
    for (let i = 0; i < field.length; i++) {
        data[i * 4] = field[i];
        data[i * 4 + 1] = gap[i];
        data[i * 4 + 2] = fromInk[i];
    }
    const rows = new Float32Array(H * 4);
    for (let y = 0; y < H; y++) {
        const side = shape.at(y + 0.5 - PAD);
        const open = side.right > side.left;
        rows.set([open ? side.left : side.cx, open ? side.right : side.cx, side.cx], y * 4);
    }
    return { width: W, height: H, data, rows };
}
