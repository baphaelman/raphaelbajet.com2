/*
 * Paper Othello — bots.
 *
 * Every bot only talks to the engine (legal moves, play, undo, score), so they all
 * follow whatever ruleset is active. Self-contained for the same reason as engine.js.
 */
function BotsModule(E) {
  'use strict';

  const WIN = 1000;

  // Small seeded generator so lab games can be replayed exactly.
  function rng(seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(arr, rnd) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = (rnd() * (i + 1)) | 0, t = arr[i];
      arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  const now = typeof performance !== 'undefined' && performance.now ? () => performance.now() : () => Date.now();

  /* ---------- the evaluator ---------- */

  // The estimate is in stones: "how far ahead will the side to move finish?"
  // Default weights were fitted by regression on self-play games, then checked in tournaments.
  // The second row was added for the tuner (Tune tab). They start at 0, so the default bot is unchanged;
  // the tuner finds out per ruleset whether they help.
  // The third row (lone gaps and crossings, the Accountant's ideas) was added for the tuner too, also at 0.
  // The fourth row (threats kept after one block, results/32) likewise; it costs a little search speed when non-zero.
  //
  // Weights can also change over the game: `key@end` is the weight once the board is full, and in between the weight
  // slides from `key` to `key@end` with the share of playable cells already taken (phase 0 → 1, any board size).
  // Without `@end` keys a weight is the same all game. The fast engine (fast.js, rust/) computes exactly the same.
  const DEFAULT_WEIGHTS = {
    material: 1.0, myBest: 0.4, mySecond: 0.1, oppBest: 0, oppSecond: 0, space: 0.1, latent: 0.07,
    parity: 0, mobility: 0, threats: 0, edge: 0, corner: 0, frontier: 0,
    privGaps: 0, sharedOdd: 0, crossings: 0,
    myKept: 0, oppKept: 0,
  };
  const EXTRA = ['parity', 'mobility', 'threats', 'edge', 'corner', 'frontier', 'privGaps', 'sharedOdd', 'crossings', 'myKept', 'oppKept'];
  const KEYS = Object.keys(DEFAULT_WEIGHTS);

  const FEATURE_INFO = [
    ['material', 'Stones banked', 'My stones minus theirs (komi included). Stones never flip, so this part is exact.'],
    ['myBest', 'My best fill', 'Cells I could fill with my best line-making move right now.'],
    ['mySecond', 'My 2nd-best fill', 'My next-best fill on a different cell: a threat that survives one block.'],
    ['oppBest', 'Their best fill', 'Cells the opponent could fill if it were their move.'],
    ['oppSecond', 'Their 2nd-best fill', 'The opponent\'s backup threat.'],
    ['space', 'Open space', 'Empty cells touching my stones minus empty cells touching theirs.'],
    ['latent', 'Latent lines', 'Fills my stones could make on any empty cell, reachable yet or not, minus theirs.'],
    ['parity', 'Odd cell', '1 if an odd number of cells is empty, else 0. If nobody fills again, the player to move gets the last cell.'],
    ['mobility', 'Mobility', 'Cells I may play minus cells they may play.'],
    ['threats', 'Big threats', 'Cells where I could fill 2+ right now, minus theirs. Two at once is a fork.'],
    ['edge', 'Edge stones', 'My stones on the board edge minus theirs (corners included).'],
    ['corner', 'Corner stones', 'My stones in the four corners minus theirs.'],
    ['frontier', 'Exposed stones', 'My stones touching an empty cell minus theirs.'],
    ['privGaps', 'Private gaps', 'Lone gaps (no empty neighbour) only I may enter, minus theirs: banked future moves.'],
    ['sharedOdd', 'Shared gaps odd', '1 if an odd number of lone gaps can be entered by both sides.'],
    ['crossings', 'Crossings', 'Cells where one placement would fill along 2+ lines, mine minus theirs.'],
    ['myKept', 'My threat after a block', 'My biggest fill still on offer after the opponent blocks it as well as one move can (on its cell or a gap cell). A loaded cell with two lines keeps one. Slow to measure: the bot searches 2–8× slower once it is not 0, and on 7×7 it gained nothing measurable, so it starts unticked.'],
    ['oppKept', 'Their threat after a block', 'The same for the opponent: their biggest fill left after my best single block. Slow to measure, like the one above.'],
  ];

  // Lone gaps and crossings for the side to move: [private gaps (mine − theirs), shared gaps odd, crossings].
  function gapFeatures(s) {
    const me = s.turn, opp = 3 - me, bd = s.board, N = s.geo.N, n8 = s.geo.n8;
    let priv = 0, shared = 0, cross = 0;
    for (let c = 0; c < N; c++) {
      if (bd[c]) continue;
      const nb = n8[c];
      let empty = false, tMe = false, tOpp = false;
      for (let i = 0; i < nb.length; i++) {
        const v = bd[nb[i]];
        if (v === 0) empty = true; else if (v === me) tMe = true; else if (v === opp) tOpp = true;
      }
      if (!empty) {
        if (tMe && tOpp) shared++; else if (tOpp) priv++; else if (tMe) priv--;
        continue;
      }
      // a crossing: a cell where one placement would fill along two or more lines at once
      if (tOpp && E.linesAt(s, c, me).length >= 2) cross++;
      if (tMe && E.linesAt(s, c, opp).length >= 2) cross--;
    }
    return [priv, shared & 1, cross];
  }

  // Threat kept after one block (results/32): p's biggest fill still on offer after the other side's best single
  // block. The blocker may play any cell it legally can among the launch cell and the gap cells of p's biggest
  // threat(s), filling all its own lines from there; then p's launch cells are scanned again. That catches loaded
  // cells (a launch the blocker cannot reach keeps its other lines) and blocks that hit two threats at once. New
  // launch cells the block creates are not counted. 0 when p has nothing to fill. rust/src/bots.rs: kept_threat.
  function keptThreat(s, p) {
    if (s.rules.fill === 'none' || s.count[p] === 0) return 0;
    const q = 3 - p, bd = s.board, launch = [], size = [];
    let best = 0;
    for (const c of E.legalCells(s, p)) {
      const g = E.fillSize(s, c, p);
      if (g > 0) { launch.push(c); size.push(g); if (g > best) best = g; }
    }
    if (!best) return 0;
    const qLegal = new Set(E.legalCells(s, q)), cand = [];
    for (let i = 0; i < launch.length; i++) {
      if (size[i] !== best) continue;
      const cells = [launch[i]];
      for (const l of E.linesAt(s, launch[i], p)) for (const x of l) cells.push(x);
      for (const x of cells) if (qLegal.has(x) && !cand.includes(x)) cand.push(x);
    }
    let res = best;
    for (const x of cand) {
      const put = [x];
      for (const l of E.linesAt(s, x, q)) for (const y of l) put.push(y);
      for (const y of put) bd[y] = q;
      let r = 0;
      for (let i = 0; i < launch.length; i++) {
        if (bd[launch[i]]) continue;
        const g = E.fillSize(s, launch[i], p);
        if (g > r) r = g;
      }
      for (const y of put) bd[y] = 0;
      if (r < res) res = r;
      if (!res) break;
    }
    return res;
  }

  // Share of the playable cells already taken: 0 on an empty board, 1 when it is full.
  const phase = (s) => 1 - s.empties / (s.geo.N - s.count[3]);
  // A weight at a given phase (see DEFAULT_WEIGHTS).
  function weightAt(w, k, ph) {
    const a = +w[k] || 0, e = k + '@end' in w ? +w[k + '@end'] || 0 : a;
    return e === a ? a : a + (e - a) * ph;
  }
  // What an evaluator with these weights needs measured; worked out once per search.
  function evalCfg(w) {
    const nz = (k) => !!(+w[k] || (k + '@end' in w && +w[k + '@end']));
    return { extra: nz('edge') || nz('corner') || nz('frontier'), gaps: nz('privGaps') || nz('sharedOdd') || nz('crossings'),
      kept: nz('myKept') || nz('oppKept'),
      phased: KEYS.some((k) => k + '@end' in w && (+w[k + '@end'] || 0) !== (+w[k] || 0)) };
  }

  // Raw feature values from the point of view of the side to move. The extra features need one more
  // pass over the board, so they are only measured when asked for (extra: edge/corner/frontier, gaps: the third row,
  // kept: the fourth).
  function features(s, extra, gaps, kept) {
    const me = s.turn, opp = 3 - me, komi = s.rules.komi || 0, sv = E.survey(s), a = sv[me], b = sv[opp];
    const f = {
      material: s.count[me] - s.count[opp] + (me === 2 ? komi : -komi),
      myBest: a.best, mySecond: a.second, oppBest: b.best, oppSecond: b.second,
      space: a.lib - b.lib, latent: a.latent - b.latent, myMob: a.mob, oppMob: b.mob,
      parity: s.empties & 1, mobility: a.mob - b.mob, threats: a.big - b.big, edge: 0, corner: 0, frontier: 0,
    };
    if (extra) {
      const bd = s.board, n8 = s.geo.n8, N = s.geo.N;
      let edge = 0, corner = 0, front = 0;
      for (let c = 0; c < N; c++) {
        const v = bd[c];
        if (v !== 1 && v !== 2) continue;
        const sg = v === me ? 1 : -1, nb = n8[c];
        if (nb.length < 8) { edge += sg; if (nb.length === 3) corner += sg; }
        for (let i = 0; i < nb.length; i++) if (bd[nb[i]] === 0) { front += sg; break; }
      }
      f.edge = edge; f.corner = corner; f.frontier = front;
    }
    f.privGaps = 0; f.sharedOdd = 0; f.crossings = 0;
    if (gaps) { const g = gapFeatures(s); f.privGaps = g[0]; f.sharedOdd = g[1]; f.crossings = g[2]; }
    f.myKept = kept ? keptThreat(s, me) : 0; f.oppKept = kept ? keptThreat(s, opp) : 0;
    return f;
  }

  // Which features apply under the current rules: +1, -1 (reversed), or 0 (ignored).
  function featureSigns(rules) {
    const most = rules.goal !== 'fewest', g = most ? 1 : -1;
    const fills = most && rules.fill !== 'none' ? 1 : 0;
    return { material: g, myBest: fills, mySecond: fills, oppBest: fills, oppSecond: fills, space: g, latent: fills,
      parity: g, mobility: 1, threats: rules.fill !== 'none' ? 1 : 0, edge: 1, corner: 1, frontier: 1,
      privGaps: g, sharedOdd: g, crossings: fills, myKept: fills, oppKept: fills };
  }

  // cfg (from evalCfg) is optional; a search passes it so it is worked out once, not at every leaf.
  function evaluate(s, w, mode, cfg) {
    if (mode === 'accountant') return accountantValue(s);
    const sg = featureSigns(s.rules);
    if (mode === 'material') {
      const komi = s.rules.komi || 0, me = s.turn;
      return sg.material * (s.count[me] - s.count[3 - me] + (me === 2 ? komi : -komi));
    }
    const c = cfg || evalCfg(w), f = features(s, c.extra, c.gaps, c.kept);
    let v = 0;
    if (!c.phased && !c.gaps && !c.kept) {
      for (let i = 0; i < 13; i++) { const k = KEYS[i]; if (w[k]) v += sg[k] * w[k] * f[k]; }
      return v;
    }
    const ph = c.phased ? phase(s) : 0;
    for (let i = 0; i < KEYS.length; i++) {
      const k = KEYS[i], a = +w[k] || 0, wk = c.phased ? a + ((k + '@end' in w ? +w[k + '@end'] || 0 : a) - a) * ph : a;
      if (wk) v += sg[k] * wk * f[k];
    }
    return v;
  }

  /* ---------- pattern tables (an n-tuple evaluator, experiments/results/33) ---------- */
  // Value for the side to move = stones banked (exact) + (sum of table entries) / scale. The sum runs over every
  // placement of every pattern shape on the board; a pattern reads its cells as empty / mine / theirs / wall (off-board
  // cells and holes are both wall), so one table serves any board size. Placements related by a board symmetry share
  // an entry. Each game phase (share of playable cells taken, cut into `stages`) has its own entries plus a bias and a
  // parity entry. Tables hold int8 counts of 1/scale stones, so JS and rust/src/patterns.rs add the same integers.
  // Tables are learned by self-play (TD(lambda)): natively for the shipped one (patterns-data.js), in the Tune tab's
  // workers on the fast engine for your own. A table is registered under an id (addTable) and a spec names it
  // ({ type: 'patterns', table: id }; default 'mix', the shipped one).
  const SHAPE_CACHE = {};
  function shapeCells(name) {
    const num = (p) => { const k = +name.slice(p.length); return k >= 2 && k <= 9 && (k | 0) === k ? k : 0; };
    const sq = (h, w) => Array.from({ length: h * w }, (_, i) => [(i / w) | 0, i % w]);
    if (name === 'sq3') return sq(3, 3);
    if (name === 'sq2') return sq(2, 2);
    if (name === 'r23') return sq(2, 3);
    if (name === 'r24') return sq(2, 4);
    if (name === 'x5') return [[0, 1], [1, 0], [1, 1], [1, 2], [2, 1]];
    if (/^lo\d$/.test(name) && num('lo')) return Array.from({ length: num('lo') }, (_, i) => [0, i]);
    if (/^ld\d$/.test(name) && num('ld')) return Array.from({ length: num('ld') }, (_, i) => [i, i]);
    return null;
  }
  const TRANSFORMS = [(r, c) => [r, c], (r, c) => [c, r], (r, c) => [-r, c], (r, c) => [r, -c], (r, c) => [-r, -c],
    (r, c) => [c, -r], (r, c) => [-c, r], (r, c) => [-c, -r]];
  function normCells(v) {
    const mr = Math.min(...v.map((p) => p[0])), mc = Math.min(...v.map((p) => p[1]));
    return v.map((p) => [p[0] - mr, p[1] - mc]);
  }
  const cellSetKey = (v) => v.map((p) => p[0] + ',' + p[1]).sort().join(' ');
  // A shape: its orientations (cell offsets in the base shape's reading order) and code → symmetry class
  // (rust/src/patterns.rs make_shape: the same classes in the same order).
  function makeShape(name) {
    if (SHAPE_CACHE[name]) return SHAPE_CACHE[name];
    const cells = shapeCells(name);
    if (!cells) throw new Error('unknown pattern shape ' + name);
    const base = normCells(cells), baseKey = cellSetKey(base), orients = [], seen = [], perms = [];
    for (let j = 0; j < 8; j++) {
      const t = normCells(base.map((p) => TRANSFORMS[j](p[0], p[1]))), key = cellSetKey(t);
      if (key === baseKey) perms.push(t.map((p) => base.findIndex((q) => q[0] === p[0] && q[1] === p[1])));
      if (!seen.includes(key)) { seen.push(key); orients.push(t); }
    }
    const k = base.length, size = 1 << (2 * k), canon = new Uint32Array(size).fill(0xffffffff), d = new Array(k), y = new Array(k);
    let next = 0;
    for (let code = 0; code < size; code++) {
      if (canon[code] !== 0xffffffff) continue;
      for (let i = 0; i < k; i++) d[i] = (code >> (2 * (k - 1 - i))) & 3;
      for (const p of perms) {
        for (let i = 0; i < k; i++) y[p[i]] = d[i];
        let yc = 0;
        for (let i = 0; i < k; i++) yc = yc * 4 + y[i];
        canon[yc] = next;
      }
      next++;
    }
    return (SHAPE_CACHE[name] = { name, k, orients, canon, ncanon: next });
  }
  // Shapes + stages: where each entry sits in the flat table. Per stage: each shape's classes, then bias, then parity.
  function patSet(names, stages) {
    const shapes = names.split(',').filter(Boolean).map(makeShape), shapeOff = [];
    let off = 0;
    for (const sh of shapes) { shapeOff.push(off); off += sh.ncanon; }
    const ns = Math.max(1, stages | 0);
    return { names, shapes, ns, shapeOff, featOff: off, perStage: off + 2, len: (off + 2) * ns, layouts: {} };
  }
  // Placements on an n×n board: k cells each (index n·n = a wall); kept when every cell is on the board or the ring
  // around it and at least two are on the board.
  function patLayout(set, n) {
    if (set.layouts[n]) return set.layouts[n];
    const nn = n * n, groups = [];
    set.shapes.forEach((sh, si) => {
      const cells = [];
      for (const o of sh.orients) {
        for (let ar = -n; ar <= n; ar++) for (let ac = -n; ac <= n; ac++) {
          let ok = true, on = 0;
          const cs = [];
          for (const [dr, dc] of o) {
            const r = ar + dr, c = ac + dc;
            if (r < -1 || c < -1 || r > n || c > n) { ok = false; break; }
            if (r >= 0 && c >= 0 && r < n && c < n) { on++; cs.push(r * n + c); } else cs.push(nn);
          }
          if (ok && on >= 2) for (const x of cs) cells.push(x);
        }
      }
      groups.push({ si, k: sh.k, cells: Uint16Array.from(cells) });
    });
    return (set.layouts[n] = { nn, groups });
  }
  const patStage = (set, s) => {
    const play = Math.max(1, s.geo.N - s.count[3]), ph = 1 - s.empties / play;
    return Math.min(set.ns - 1, (ph * set.ns) | 0);
  };
  // Calls f(index) for every entry the position uses; returns its stage's bias index (parity = that + 1).
  const PAT_M = new Uint8Array(257);
  function patVisit(set, s, f) {
    const lay = patLayout(set, s.n), me = s.turn, bd = s.board, m = PAT_M, nn = lay.nn;
    for (let c = 0; c < nn; c++) { const v = bd[c]; m[c] = v === 0 ? 0 : v === me ? 1 : v === 3 ? 3 : 2; }
    m[nn] = 3;
    const base = patStage(set, s) * set.perStage;
    for (const g of lay.groups) {
      const canon = set.shapes[g.si].canon, off = base + set.shapeOff[g.si], k = g.k, cells = g.cells;
      for (let i = 0; i < cells.length; i += k) {
        let code = 0;
        for (let j = 0; j < k; j++) code = code * 4 + m[cells[i + j]];
        f(off + canon[code]);
      }
    }
    return base + set.featOff;
  }
  // Stones banked for the side to move, signed by the goal.
  function banked(s) {
    const me = s.turn, komi = s.rules.komi || 0, L = s.count[me] - s.count[3 - me] + (me === 2 ? komi : -komi);
    return s.rules.goal === 'fewest' ? -L : L;
  }
  function patternValue(s, t) {
    const w = t.w;
    let tot = 0;
    const fb = patVisit(t.set, s, (i) => { tot += w[i]; });
    tot += w[fb] + w[fb + 1] * (s.empties & 1);
    return banked(s) + tot / t.scale;
  }
  // Each entry's index and contribution in one position (the Tune tab draws the biggest ones).
  function patternParts(s, t) {
    const out = [];
    patVisit(t.set, s, (i) => out.push(i));
    return out;
  }
  // Stored form: { shapes, stages, scale, n, data } with data = base64 of, per non-zero entry, the LEB128 gap to the
  // previous non-zero entry and the value as a signed byte (experiments/ntuple `nt export` writes the same).
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  function b64bytes(str) {
    const bin = typeof atob === 'function' ? atob(str) : null, out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function bytesB64(b) {
    let s = '';
    for (let i = 0; i < b.length; i += 3) {
      const n = (b[i] << 16) | ((b[i + 1] || 0) << 8) | (b[i + 2] || 0);
      for (let k = 0; k < 4; k++) s += k <= Math.min(3, b.length - i) ? B64[(n >> (18 - 6 * k)) & 63] : '=';
    }
    return s;
  }
  function decodeTable(d) {
    const set = patSet(d.shapes, d.stages), w = new Int8Array(set.len), b = b64bytes(d.data);
    if ((d.n | 0) !== set.len) throw new Error('pattern table does not fit its shapes');
    let i = 0, prev = -1;
    while (i < b.length) {
      let gap = 0, sh = 0, x;
      do { x = b[i++]; gap += (x & 127) * Math.pow(2, sh); sh += 7; } while (x & 128);
      prev += gap + 1;
      w[prev] = (b[i++] << 24) >> 24;
    }
    return { id: d.id, name: d.name || '', set, scale: +d.scale || 32, w };
  }
  function encodeTable(t) {
    const bytes = [];
    let prev = -1;
    for (let i = 0; i < t.w.length; i++) {
      const v = t.w[i];
      if (!v) continue;
      let gap = i - prev - 1;
      for (;;) { const b = gap & 127; gap = Math.floor(gap / 128); if (gap) bytes.push(b | 128); else { bytes.push(b); break; } }
      bytes.push(v & 255);
      prev = i;
    }
    return { shapes: t.set.names, stages: t.set.ns, scale: t.scale, n: t.w.length, data: bytesB64(bytes) };
  }
  // Float weights (training, in stones) → an int8 table.
  function quantize(set, wf, scale) {
    const w = new Int8Array(set.len), sc = scale || 32;
    for (let i = 0; i < w.length; i++) w[i] = Math.max(-127, Math.min(127, Math.round(wf[i] * sc)));
    return { set, scale: sc, w };
  }
  const TABLES = {};
  // d: a decoded table, or its stored form. Returns the decoded table.
  function addTable(id, d) {
    const t = d.w ? d : decodeTable(d);
    t.id = id;
    return (TABLES[id] = t);
  }
  const getTable = (id) => TABLES[id || 'mix'] || null;

  // Exact value of a finished game for the side to move: a win always beats any estimate.
  function terminalValue(s) {
    const u = s.turn === 1 ? E.utility(s) : -E.utility(s);
    return (u > 0 ? WIN : u < 0 ? -WIN : 0) + u;
  }

  // Exact value of a settled position (see E.isSettled): finish it off and score it.
  function settledValue(s) {
    const t = E.clone(s), me = s.turn;
    E.finishSettled(t);
    const u = me === 1 ? E.utility(t) : -E.utility(t);
    return (u > 0 ? WIN : u < 0 ? -WIN : 0) + u;
  }

  /* ---------- minimax with alpha-beta ---------- */

  const TIMEOUT = { timeout: true };

  // opt.qDepth > 0 switches on a quiescence search (results/32): at the horizon the side to move may, instead of
  // stopping, play on through moves that fill at least opt.qMin cells (default 1: any fill), up to qDepth more plies. Either side
  // may also "stand pat" on the evaluation. That way the evaluation is not taken in the middle of a fill exchange.
  // Off (0) by default, so every existing bot plays exactly as before.
  function search(s0, opt, rnd) {
    const w = opt.weights || DEFAULT_WEIGHTS, mode = opt.evalMode || 'full', aw = opt.acctWeights, cfg = evalCfg(w), tbl = opt.table;
    const maxDepth = Math.max(1, opt.depth | 0 || 3);
    const prune = opt.prune !== false;
    const qDepth = Math.max(0, opt.qDepth | 0), qMin = opt.qMin === undefined ? 1 : +opt.qMin;
    const t0 = now(), deadline = opt.timeMs ? t0 + opt.timeMs : Infinity;
    const gainSign = s0.rules.goal === 'fewest' ? -1 : 1;
    const byGain = (a, b) => gainSign * (b.gain - a.gain);
    let s = null, nodes = 0, leaves = 0, cutoffs = 0, horizon = false;
    const leafValue = () => (mode === 'accountant' ? accountantValue(s, aw) : mode === 'patterns' ? patternValue(s, tbl) : evaluate(s, w, mode, cfg));

    // Quiescence (see above). The node itself was counted by the caller. rust/src/bots.rs: Searcher::qsearch.
    function qsearch(qd, alpha, beta) {
      leaves++; horizon = true;
      const stand = leafValue();
      if (qd <= 0) return stand;
      let best = stand;
      if (prune) { if (best > alpha) alpha = best; if (alpha >= beta) { cutoffs++; return best; } }
      const moves = E.genMoves(s, true).filter((m) => m.cell >= 0 && m.gain - 1 >= qMin);
      if (moves.length > 1) moves.sort(byGain);
      for (let i = 0; i < moves.length; i++) {
        const m = moves[i];
        E.play(s, m);
        nodes++;
        if ((nodes & 1023) === 0 && now() > deadline) throw TIMEOUT;
        const v = s.over ? -terminalValue(s) : E.isSettled(s) ? -settledValue(s) : -qsearch(qd - 1, -beta, -alpha);
        E.undo(s, m);
        if (v > best) best = v;
        if (prune) { if (v > alpha) alpha = v; if (alpha >= beta) { cutoffs++; break; } }
      }
      return best;
    }

    function negamax(depth, alpha, beta, pv) {
      nodes++;
      if ((nodes & 1023) === 0 && now() > deadline) throw TIMEOUT;
      if (s.over) return terminalValue(s);
      if (E.isSettled(s)) { leaves++; return settledValue(s); } // only lone gaps left: the result is known
      if (depth === 0) {
        if (qDepth) return qsearch(qDepth, alpha, beta);
        leaves++; horizon = true; return leafValue();
      }
      const moves = E.genMoves(s, true);
      if (moves.length > 1) moves.sort(byGain); // big fills first: best guess, so cutoffs come early
      let best = -Infinity;
      for (let i = 0; i < moves.length; i++) {
        const m = moves[i], child = [];
        E.play(s, m);
        const v = -negamax(depth - 1, -beta, -alpha, child);
        E.undo(s, m);
        if (v > best) { best = v; pv.length = 0; pv.push(m); for (let j = 0; j < child.length; j++) pv.push(child[j]); }
        if (prune) { if (v > alpha) alpha = v; if (alpha >= beta) { cutoffs++; break; } }
      }
      return best;
    }

    let rootMoves = shuffle(E.genMoves(s0, true), rnd).sort(byGain); // shuffle first: ties break randomly
    let result = { move: rootMoves[0], score: 0, depth: 0, pv: [rootMoves[0]], scores: null };
    if (rootMoves.length > 1 || opt.fullRoot) {
      for (let d = 1; d <= maxDepth; d++) {
        s = E.clone(s0);
        horizon = false;
        try {
          let alpha = -Infinity, bestV = -Infinity, best = null, bestPv = null;
          const scores = [];
          for (let i = 0; i < rootMoves.length; i++) {
            const m = rootMoves[i], child = [];
            E.play(s, m);
            const v = -negamax(d - 1, -Infinity, opt.fullRoot || !prune ? Infinity : -alpha, child);
            E.undo(s, m);
            scores.push({ move: m, score: v });
            if (v > bestV) { bestV = v; best = m; bestPv = [m].concat(child); }
            if (v > alpha) alpha = v;
          }
          result = { move: best, score: bestV, depth: d, pv: bestPv, scores: opt.fullRoot ? scores : null };
          // Search the previous best first next time round.
          if (opt.fullRoot) {
            const order = new Map(scores.map((x) => [x.move, x.score]));
            rootMoves = rootMoves.slice().sort((a, b) => order.get(b) - order.get(a));
          } else {
            rootMoves = [best].concat(rootMoves.filter((m) => m !== best));
          }
          if (!horizon) break; // every line reached the end of the game: solved exactly
        } catch (e) {
          if (e !== TIMEOUT) throw e;
          break;
        }
      }
    }
    return {
      move: result.move,
      info: {
        kind: 'minimax', depth: result.depth, score: result.score, pv: result.pv, scores: result.scores,
        nodes, leaves, cutoffs, ms: now() - t0, solved: result.depth > 0 && !horizon,
        choices: rootMoves.length,
      },
    };
  }

  /* ---------- simpler bots ---------- */

  function randomBot(s, rnd) {
    const cells = E.legalCells(s);
    if (!cells.length) return { move: E.PASS, info: { kind: 'random' } };
    const cell = cells[(rnd() * cells.length) | 0];
    if (s.rules.fill !== 'choice') return { move: E.moveAt(s, cell, true), info: { kind: 'random' } };
    const lines = E.linesAt(s, cell, s.turn);
    const avail = lines.reduce((a, l) => a + l.length, 0);
    return { move: E.buildMove(cell, lines.filter(() => rnd() < 0.5), avail), info: { kind: 'random' } };
  }

  function pickBest(moves, scoreOf, rnd) {
    let best = -Infinity, pool = [];
    for (let i = 0; i < moves.length; i++) {
      const v = scoreOf(moves[i]);
      if (v > best + 1e-9) { best = v; pool = [moves[i]]; } else if (v > best - 1e-9) pool.push(moves[i]);
    }
    return { move: pool[(rnd() * pool.length) | 0], score: best };
  }

  // Takes whatever gains the most stones this turn.
  function greedyBot(s, rnd) {
    const sign = s.rules.goal === 'fewest' ? -1 : 1;
    const r = pickBest(E.genMoves(s, true), (m) => sign * m.gain, rnd);
    return { move: r.move, info: { kind: 'greedy', score: r.score } };
  }

  // Greedy, but subtracts the opponent's best reply — so it also blocks.
  function blockerBot(s, rnd) {
    const sign = s.rules.goal === 'fewest' ? -1 : 1;
    const r = pickBest(E.genMoves(s, true), (m) => {
      E.play(s, m);
      let reply = 0;
      if (!s.over) { const p = E.potential(s, s.turn); reply = p.mob ? 1 + p.best : 0; }
      E.undo(s, m);
      return sign * (m.gain - reply);
    }, rnd);
    return { move: r.move, info: { kind: 'blocker', score: r.score } };
  }

  // Flat Monte Carlo: no game knowledge at all. Tries each move, plays random games to
  // the end, and keeps sampling the moves that look best (UCB1). Adapts to any ruleset.
  function monteCarloBot(s0, spec, rnd) {
    const most = s0.rules.goal !== 'fewest';
    const cells = E.legalCells(s0);
    if (!cells.length) return { move: E.PASS, info: { kind: 'mc' } };
    const arms = cells.map((c) => ({ move: E.moveAt(s0, c, most), n: 0, sum: 0 }));
    if (arms.length === 1) return { move: arms[0].move, info: { kind: 'mc', playouts: 0 } };
    const me = s0.turn, budget = Math.max(arms.length, spec.playouts | 0 || 300), scale = s0.n;
    for (let t = 0; t < budget; t++) {
      let arm = null;
      if (t < arms.length) arm = arms[t];
      else {
        let bestU = -Infinity;
        const lt = Math.log(t);
        for (let i = 0; i < arms.length; i++) {
          const a = arms[i], u = a.sum / a.n + 0.6 * Math.sqrt(lt / a.n);
          if (u > bestU) { bestU = u; arm = a; }
        }
      }
      const s = E.clone(s0);
      E.play(s, arm.move);
      let guard = 4 * s.geo.N + 8;
      while (!s.over && guard-- > 0) {
        const lc = E.legalCells(s);
        if (!lc.length) { E.play(s, E.PASS); continue; }
        E.play(s, E.moveAt(s, lc[(rnd() * lc.length) | 0], most));
      }
      const u = me === 1 ? E.utility(s) : -E.utility(s);
      arm.n++;
      arm.sum += 0.5 + 0.5 * Math.tanh(u / scale);
    }
    let best = arms[0];
    for (let i = 1; i < arms.length; i++) if (arms[i].n > best.n) best = arms[i];
    return {
      move: best.move,
      info: { kind: 'mc', playouts: budget, score: best.sum / best.n,
        scores: arms.map((a) => ({ move: a.move, score: a.sum / a.n, n: a.n })) },
    };
  }

  /* ---------- the ladder's extra bots ---------- */
  // Each one plays on a different idea, so the ladder (Ladder tab, experiments/royale.js) has a spread of
  // styles and strengths to rate against each other, not just one evaluator at different depths.

  // Weight presets for Minimax. 'classic' is what an Othello player would value (corners, edges, mobility,
  // few exposed stones) with no idea of fills; 'forker' prizes fork cells; 'tuned8' is the SPSA result on
  // 8×8 depth 2 (experiments/results/22-tuner-spsa.txt).
  const PRESETS = {
    classic: { material: 1, myBest: 0, mySecond: 0, oppBest: 0, oppSecond: 0, space: 0, latent: 0, mobility: 0.3, edge: 0.2, corner: 1, frontier: -0.3 },
    forker: { threats: 0.6, mySecond: 0.35, oppSecond: 0.15 },
    tuned8: { myBest: 0.479, mySecond: 0.101, oppBest: 0.079, oppSecond: 0.164, space: 0.037, latent: 0.074, parity: -0.013,
      mobility: -0.007, threats: 0.12, edge: 0.028, corner: -0.233, frontier: -0.05 },
  };
  const presetWeights = (name) => Object.assign({}, DEFAULT_WEIGHTS, PRESETS[name] || {});

  // The Accountant's evaluator. The extras identity (experiments/results/29-…) says the final margin is
  // exactly L + d + ((E + d) & 1), so "final − L" always has the parity of E. The Accountant predicts that
  // excess t from the features below (weights fitted by least squares to exact 5×5 values, see
  // experiments/accountant-fit.js), snaps it to the right parity and adds the stones already banked.
  const ACCT_KEYS = ['bias', 'parity', 'myBest', 'mySecond', 'oppBest', 'oppSecond', 'mobility', 'space', 'latent',
    'threats', 'privGaps', 'sharedOdd', 'crossings', 'myKept', 'oppKept'];
  // fitted 2026-11-11 on 30,550 exact 5×5 positions (results 30): rmse 1.04 stones, snapped value exact 68%
  const ACCT_DEFAULT = { bias: 0.581, parity: 0.064, myBest: 0.434, mySecond: 0.01, oppBest: 0.094, oppSecond: -0.065,
    mobility: -0.013, space: -0.141, latent: 0.074, threats: 0.041, privGaps: 1.184, sharedOdd: 0.007, crossings: 0.187,
    myKept: 0, oppKept: 0 }; // the last two came later (results/32), for the tuner
  let ACCT_W = Object.assign({}, ACCT_DEFAULT);
  // Names and meanings for the Tune tab (keys shared with the Minimax evaluator reuse FEATURE_INFO's wording).
  const ACCT_INFO = [
    ['bias', 'Constant', 'A fixed number of extra stones the mover expects. It matters because the estimate is snapped to a whole, parity-correct number.'],
    ['parity', 'Odd cell', '1 if an odd number of cells is empty, else 0.'],
    ['myBest', 'My best fill', 'Cells I could fill with my best line-making move right now.'],
    ['mySecond', 'My 2nd-best fill', 'My next-best fill on a different cell.'],
    ['oppBest', 'Their best fill', 'Cells the opponent could fill if it were their move.'],
    ['oppSecond', 'Their 2nd-best fill', 'The opponent\'s backup threat.'],
    ['mobility', 'Mobility', 'Cells I may play minus cells they may play.'],
    ['space', 'Open space', 'Empty cells touching my stones minus empty cells touching theirs.'],
    ['latent', 'Latent lines', 'Fills my stones could make on any empty cell minus theirs.'],
    ['threats', 'Big threats', 'Cells where I could fill 2+ right now, minus theirs.'],
    ['privGaps', 'Private gaps', 'Lone gaps (no empty neighbour) only I may enter, minus theirs: banked future moves.'],
    ['sharedOdd', 'Shared gaps odd', '1 if an odd number of lone gaps can be entered by both sides.'],
    ['crossings', 'Crossings', 'Cells where one placement would fill along 2+ lines, mine minus theirs.'],
    ['myKept', 'My threat after a block', 'My biggest fill still on offer after the opponent\'s best single block.'],
    ['oppKept', 'Their threat after a block', 'Their biggest fill still on offer after my best single block.'],
  ];

  // Mover's-view features for the Accountant. Lone gaps (no empty neighbour) can never be bridged, and who
  // may enter one is fixed: private gaps are banked future moves, shared gaps go to whoever gets there first.
  // kept: also measure the threats kept after a block (else they read 0; only worth it when their weights are not 0).
  function acctFeatures(s, kept) {
    const me = s.turn, opp = 3 - me, sv = E.survey(s), a = sv[me], b = sv[opp], g = gapFeatures(s);
    return { bias: 1, parity: s.empties & 1, myBest: a.best, mySecond: a.second, oppBest: b.best, oppSecond: b.second,
      mobility: a.mob - b.mob, space: a.lib - b.lib, latent: a.latent - b.latent, threats: a.big - b.big,
      privGaps: g[0], sharedOdd: g[1], crossings: g[2],
      myKept: kept ? keptThreat(s, me) : 0, oppKept: kept ? keptThreat(s, opp) : 0 };
  }

  function accountantValue(s, w) {
    const me = s.turn, komi = s.rules.komi || 0, W = w || ACCT_W, f = acctFeatures(s, !!(+W.myKept || +W.oppKept));
    let t = 0;
    for (const k of ACCT_KEYS) t += (W[k] || 0) * f[k];
    let snap = Math.round(t);
    if (((snap - s.empties) & 1) !== 0) snap += t > snap ? 1 : -1; // final − L has the parity of E
    const L = s.count[me] - s.count[3 - me] + (me === 2 ? komi : -komi);
    const v = L + snap + 0.2 * (t - snap); // the step counts; the remainder only breaks ties
    return s.rules.goal === 'fewest' ? -v : v;
  }

  // Coin-flip: greedy half the time, a random legal move the other half. A rung between Random and Greedy.
  function sloppyBot(s, spec, rnd) {
    return rnd() < (spec.p === undefined ? 0.5 : spec.p) ? randomBot(s, rnd) : greedyBot(s, rnd);
  }

  // Turtle: smothers. Picks the move that leaves the opponent the fewest cells to play; size of the fill breaks ties.
  function turtleBot(s, rnd) {
    const r = pickBest(E.genMoves(s, true), (m) => {
      E.play(s, m);
      const opp = s.over ? 0 : E.legalCells(s).length;
      E.undo(s, m);
      return -opp + 0.01 * m.gain;
    }, rnd);
    return { move: r.move, info: { kind: 'turtle', score: r.score } };
  }

  // Copycat: tries to keep the board a colour-swapped mirror image through the centre (cell c ↔ N−1−c).
  // When no move keeps the mirror as good as it was, it thinks two moves ahead instead.
  function asymmetry(s) {
    const bd = s.board, N = s.geo.N;
    let a = 0;
    for (let c = 0; c < N; c++) {
      const v = bd[c], w = bd[N - 1 - c];
      if ((v === 1 && w !== 2) || (v === 2 && w !== 1) || (v === 0 && (w === 1 || w === 2))) a++;
    }
    return a;
  }
  function copycatBot(s, rnd) {
    const before = asymmetry(s);
    const r = pickBest(E.genMoves(s, true), (m) => { E.play(s, m); const a = asymmetry(s); E.undo(s, m); return -a + 0.01 * m.gain; }, rnd);
    if (-r.score <= before) return { move: r.move, info: { kind: 'copycat', score: r.score } };
    return search(s, { depth: 2 }, rnd);
  }

  // MCTS: a real search tree (UCT) with quick playouts that prefer big fills, and no evaluator at all.
  function mctsBot(s0, spec, rnd) {
    const iters = Math.max(50, spec.playouts | 0 || 800), most = s0.rules.goal !== 'fewest', scale = s0.n;
    const root = { n: 0, w: 0, moves: null, kids: [] };
    const reward = (s, p) => { // from player p's point of view, in [0, 1]
      const u = (p === 1 ? 1 : -1) * E.utility(s);
      return 0.85 * (u > 0 ? 1 : u < 0 ? 0 : 0.5) + 0.15 * (0.5 + 0.5 * Math.tanh(u / scale));
    };
    for (let it = 0; it < iters; it++) {
      const s = E.clone(s0), path = [root];
      let node = root;
      while (!s.over && !E.isSettled(s)) {
        if (!node.moves) node.moves = E.genMoves(s, true).sort((a, b) => b.gain - a.gain);
        if (node.kids.length < node.moves.length) {
          const m = node.moves[node.kids.length], child = { n: 0, w: 0, moves: null, kids: [], p: s.turn };
          E.play(s, m); node.kids.push(child); path.push(child); node = child;
          break;
        }
        let best = null, bi = 0, bu = -Infinity;
        const ln = Math.log(node.n + 1);
        for (let i = 0; i < node.kids.length; i++) {
          const k = node.kids[i], u = k.w / (k.n || 1) + 0.7 * Math.sqrt(ln / (k.n || 1));
          if (u > bu) { bu = u; best = k; bi = i; }
        }
        E.play(s, node.moves[bi]); path.push(best); node = best;
      }
      // playout: of three random legal cells, take the one that fills the most
      let guard = 4 * s.geo.N + 8;
      while (!s.over && guard-- > 0) {
        if (E.isSettled(s)) { E.finishSettled(s); break; }
        const lc = E.legalCells(s);
        if (!lc.length) { E.play(s, E.PASS); continue; }
        let cell = lc[(rnd() * lc.length) | 0], g = E.fillSize(s, cell, s.turn);
        for (let k = 0; k < 2; k++) {
          const c2 = lc[(rnd() * lc.length) | 0], g2 = E.fillSize(s, c2, s.turn);
          if (most ? g2 > g : g2 < g) { cell = c2; g = g2; }
        }
        E.play(s, E.moveAt(s, cell, most));
      }
      for (let i = 0; i < path.length; i++) {
        path[i].n++;
        if (i) path[i].w += reward(s, path[i].p);
      }
    }
    if (!root.moves) return search(s0, { depth: 1 }, rnd);
    let bi = 0;
    for (let i = 1; i < root.kids.length; i++) if (root.kids[i].n > root.kids[bi].n) bi = i;
    const k = root.kids[bi];
    return { move: root.moves[bi], info: { kind: 'mcts', playouts: iters, score: k ? k.w / k.n : 0 } };
  }

  // Perfect play. Experiments plug in the fast exact solver with setExact(fn), fn(s) → [{ m, v }] for every
  // move. Without it: a one-ply book for the guide's 5×5 game, then B.solve, and a deep search if that is too big.
  let exactHook = null;
  function setExact(fn) { exactHook = fn; }
  // Guide 5×5 (empty start, centre hole, default lines): O's perfect replies to each first move (exact,
  // generated by experiments/royale.js book=1). Cell indices, row-major from a1.
  let BOOK5 = {0:[1,5],1:[0,2,7],2:[7],3:[2,4,7],4:[3,9],5:[0,10,11],6:[0,1,2,5,7,10,11],7:[2,11,13],8:[2,3,4,7,9,13,14],
    9:[4,13,14],10:[11],11:[7,10,17],13:[7,14,17],14:[13],15:[10,11,20],16:[10,11,15,17,20,21,22],17:[11,13,22],
    18:[13,14,17,19,22,23,24],19:[13,14,24],20:[15,21],21:[17,20,22],22:[17],23:[17,22,24],24:[19,23]};
  function setBook5(b) { BOOK5 = b; }
  const isGuide5 = (r) => r.size === 5 && r.start === 'empty' && r.holes === 'center' && r.placement === 'opp8' &&
    r.lineDirs === 'all' && r.lineBlock === 'clear' && !r.maxGap && r.fill === 'choice' && r.noMove === 'pass' && r.goal === 'most';
  function perfectBot(s, spec, rnd) {
    // Hustler (spec.hustle): among moves that keep the exact value, prefer the one after which the smallest share
    // of the opponent's replies keeps theirs, i.e. the move that is hardest to answer.
    const replies = (m) => {
      E.play(s, m);
      let list = null;
      if (!s.over) {
        if (exactHook) list = exactHook(s);
        else if (s.empties <= 16) { const r = solve(s, { maxNodes: 1e6 }); if (!r.tooBig) list = r.moves.map((x) => ({ m: x.move, v: x.v })); }
      }
      E.undo(s, m);
      if (!list || !list.length) return 0;
      let bv = -Infinity;
      for (const x of list) if (x.v > bv) bv = x.v;
      return 1 - list.filter((x) => x.v === bv).length / list.length;
    };
    const pick = (list, kind) => {
      let bv = -Infinity;
      for (const x of list) if (x.v > bv) bv = x.v;
      let pool = list.filter((x) => x.v === bv);
      if (spec.hustle && pool.length > 1) {
        const scored = pool.map((x) => ({ x, t: replies(x.m) })), bt = Math.max(...scored.map((y) => y.t));
        pool = scored.filter((y) => y.t === bt).map((y) => y.x);
      }
      return { move: pool[(rnd() * pool.length) | 0].m, info: { kind, score: bv, solved: true } };
    };
    if (exactHook) return pick(exactHook(s), spec.hustle ? 'hustler' : 'perfect');
    if (isGuide5(s.rules)) {
      if (s.empties === 24) { // every first move is worth exactly 0
        const cells = E.legalCells(s);
        return { move: E.moveAt(s, cells[(rnd() * cells.length) | 0], true), info: { kind: 'perfect-book' } };
      }
      if (s.empties === 23 && BOOK5) {
        let first = -1;
        for (let c = 0; c < 25; c++) if (s.board[c] === 1) first = c;
        const replies = BOOK5[first];
        if (replies && replies.length) return { move: E.moveAt(s, replies[(rnd() * replies.length) | 0], true), info: { kind: 'perfect-book' } };
      }
    }
    if (s.n <= 6 && s.empties <= 22) { // beyond this B.solve rarely finishes in a browser
      const r = solve(s, { maxNodes: spec.maxNodes || 5e6 });
      if (!r.tooBig && r.moves.length) return pick(r.moves.map((x) => ({ m: x.move, v: x.v })), 'perfect');
    }
    return search(s, { depth: 5 }, rnd); // too big to be perfect here: plays Default d5 instead
  }

  // Closer: Default d3 until few cells are left, then exact play to the end.
  function closerBot(s, spec, rnd) {
    if (s.empties <= (spec.exactAt || 12)) {
      const r = solve(s, { maxNodes: 1.5e6 });
      if (!r.tooBig && r.moves.length) {
        const bv = r.moves[0].v, pool = r.moves.filter((x) => x.v === bv);
        return { move: pool[(rnd() * pool.length) | 0].move, info: { kind: 'closer', score: bv, solved: true } };
      }
    }
    return search(s, { depth: spec.depth || 3, weights: spec.weights, qDepth: spec.qDepth, qMin: spec.qMin }, rnd);
  }

  // Patterns: minimax + quiescence (3 plies unless the spec says otherwise) on a pattern table. A table nobody
  // registered plays the Default weights instead (rust/src/bots.rs does the same).
  const patQ = (spec) => (spec.qDepth === undefined ? 3 : spec.qDepth);
  function patternsBot(s, spec, rnd) {
    const t = getTable(spec.table);
    if (!t) return search(s, { depth: spec.depth, timeMs: spec.timeMs, qDepth: patQ(spec), qMin: spec.qMin }, rnd);
    return search(s, { depth: spec.depth, timeMs: spec.timeMs, evalMode: 'patterns', table: t, qDepth: patQ(spec), qMin: spec.qMin }, rnd);
  }

  /* ---------- registry ---------- */

  const BOT_TYPES = [
    ['random', 'Random'],
    ['greedy', 'Greedy'],
    ['blocker', 'Blocker'],
    ['mc', 'Monte Carlo'],
    ['minimax', 'Minimax'],
    ['material', 'Minimax (stones only)'],
    ['sloppy', 'Coin-flip'],
    ['turtle', 'Turtle'],
    ['copycat', 'Copycat'],
    ['mcts', 'MCTS'],
    ['classic', 'Classic (Othello wisdom)'],
    ['forker', 'Forker'],
    ['tuned8', 'Tuned (8×8 weights)'],
    ['accountant', 'Accountant'],
    ['closer', 'Closer'],
    ['patterns', 'Patterns (learned tables)'],
    ['perfect', 'Perfect (small boards)'],
    ['hustler', 'Hustler (small boards)'],
  ];

  /* ---------- exact solver (small boards only) ---------- */

  // Perfect-play value of EVERY legal move (including each choice of lines to fill): alpha-beta all the way
  // to the end of the game, with a table that remembers positions already solved. Values are final margins
  // for the side to move (komi and "fewest wins" included). Not a bot type: on big boards it would never
  // finish, so it gives up after maxNodes and says so ({ tooBig: true }).
  const TOO_BIG = { tooBig: true };
  function solve(s0, opt) {
    opt = opt || {};
    const s = E.clone(s0), TT = new Map(), maxNodes = opt.maxNodes || 4e6;
    const gainSign = s0.rules.goal === 'fewest' ? -1 : 1, byGain = (a, b) => gainSign * (b.gain - a.gain);
    let nodes = 0;
    function negamax(alpha, beta) {
      if (++nodes > maxNodes) throw TOO_BIG;
      if (s.over) return s.turn === 1 ? E.utility(s) : -E.utility(s);
      const key = s.turn + E.boardToString(s.board), e = TT.get(key), a0 = alpha;
      if (e) {
        if (e.f === 0) return e.v;
        if (e.f === 1) { if (e.v >= beta) return e.v; if (e.v > alpha) alpha = e.v; }
        else { if (e.v <= alpha) return e.v; if (e.v < beta) beta = e.v; }
        if (alpha >= beta) return e.v;
      }
      const moves = E.genMoves(s, false).sort(byGain);
      let best = -Infinity;
      for (let i = 0; i < moves.length; i++) {
        E.play(s, moves[i]);
        const v = -negamax(-beta, -alpha); // a pass also hands the move over, so negation is right
        E.undo(s, moves[i]);
        if (v > best) best = v;
        if (v > alpha) alpha = v;
        if (alpha >= beta) break;
      }
      TT.set(key, { v: best, f: best <= a0 ? 2 : best >= beta ? 1 : 0 });
      return best;
    }
    if (s.over) return { moves: [], over: true, nodes: 0 };
    try {
      const out = [];
      for (const m of E.genMoves(s, false)) {
        E.play(s, m);
        out.push({ move: m, v: -negamax(-Infinity, Infinity) });
        E.undo(s, m);
      }
      out.sort((a, b) => b.v - a.v); // stable: equal moves keep engine order (fill everything first)
      return { moves: out, nodes };
    } catch (e) {
      if (e === TOO_BIG) return { tooBig: true, nodes };
      throw e;
    }
  }

  // Endgame solver for spec.endAt (perfect play once that many empty cells are left; results/38). Like solve(), plus:
  // lone-gap moves collapsed to one per class (exact with lineBlock=clear), settled positions scored by the door law
  // (exact with all 8 line directions, clear gaps, noMove=pass), the table's best move tried first, and root moves after
  // the first only tested against the best so far (window best−½). Returns { pool (best moves, engine order), v, nodes }
  // or null past maxNodes. rust/src/bots.rs: end_solve (same nodes, same order).
  const END_NODES = 4e6;
  function gapClass(s, c) {
    const b = s.board, a = s.geo.n8[c];
    let t = 1;
    for (let i = 0; i < a.length; i++) { const v = b[a[i]]; if (v === 0) return 0; if (v === 1) t |= 2; else if (v === 2) t |= 4; }
    return t;
  }
  function endSolve(s0, maxNodes) {
    if (s0.over) return null;
    const s = E.clone(s0), TT = new Map(), r = s0.rules;
    const gainSign = r.goal === 'fewest' ? -1 : 1, byGain = (a, b) => gainSign * (b.gain - a.gain);
    const settle = r.lineDirs === 'all' && r.lineBlock === 'clear' && r.noMove === 'pass', collapse = r.lineBlock === 'clear';
    let nodes = 0;
    const mover = () => (s.turn === 1 ? E.utility(s) : -E.utility(s));
    function negamax(alpha, beta) {
      if (++nodes > maxNodes) throw TOO_BIG;
      if (s.over) return mover();
      if (settle && E.isSettled(s)) {
        const me = s.turn, played = E.finishSettled(s), u = me === 1 ? E.utility(s) : -E.utility(s);
        for (let i = played.length - 1; i >= 0; i--) E.undo(s, played[i]);
        return u;
      }
      const key = s.turn + E.boardToString(s.board), e = TT.get(key), a0 = alpha;
      let hint = null;
      if (e) {
        if (e.f === 0) return e.v;
        if (e.f === 1) { if (e.v >= beta) return e.v; if (e.v > alpha) alpha = e.v; }
        else { if (e.v <= alpha) return e.v; if (e.v < beta) beta = e.v; }
        if (alpha >= beta) return e.v;
        hint = e;
      }
      let moves = E.genMoves(s, false);
      if (collapse && moves.length > 1) {
        let seen = 0;
        moves = moves.filter((m) => {
          if (m.cell < 0 || m.gain !== 1) return true;
          const k = gapClass(s, m.cell);
          if (!k) return true;
          if (seen & (1 << k)) return false;
          seen |= 1 << k;
          return true;
        });
      }
      moves.sort(byGain);
      if (hint) {
        const i = moves.findIndex((m) => m.cell === hint.c && sameFills(m.fills, hint.fl));
        if (i > 0) moves.unshift(moves.splice(i, 1)[0]);
      }
      let best = -Infinity, bm = null;
      for (let i = 0; i < moves.length; i++) {
        E.play(s, moves[i]);
        const v = -negamax(-beta, -alpha);
        E.undo(s, moves[i]);
        if (v > best) { best = v; bm = moves[i]; }
        if (v > alpha) alpha = v;
        if (alpha >= beta) break;
      }
      TT.set(key, { v: best, f: best <= a0 ? 2 : best >= beta ? 1 : 0, c: bm ? bm.cell : -1, fl: bm ? bm.fills : null });
      return best;
    }
    try {
      const root = E.genMoves(s, false), order = root.map((_, i) => i).sort((a, b) => byGain(root[a], root[b]));
      const vals = new Array(root.length).fill(-Infinity);
      let best = -Infinity;
      for (const i of order) {
        const alpha = best === -Infinity ? -Infinity : best - 0.5;
        E.play(s, root[i]);
        const v = -negamax(-Infinity, -alpha);
        E.undo(s, root[i]);
        vals[i] = v;
        if (v > best) best = v;
      }
      return { pool: root.filter((_, i) => vals[i] === best), v: best, nodes };
    } catch (e) {
      if (e === TOO_BIG) return null;
      throw e;
    }
  }
  // Same move, same lines (the Rust twin compares the line mask; fills come in line order, so this is the same test).
  function sameFills(a, b) {
    if (!b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }
  function endMove(s, maxNodes, rnd) {
    const r = endSolve(s, maxNodes);
    if (!r || !r.pool.length) return null;
    return { move: r.pool[(rnd() * r.pool.length) | 0], info: { kind: 'exact', score: r.v, solved: true, nodes: r.nodes } };
  }
  const NO_END = new Set(['closer', 'perfect', 'hustler']);

  function chooseMove(s, spec, rnd) {
    // Every bot recognises a settled game (no line can ever be filled again) and just ends it.
    if (E.isSettled(s)) return { move: E.settledMove(s), info: { kind: 'settled', score: settledValue(s) } };
    // Perfect endgame (opt-in, strong bots only: spec.endAt = empty cells left; off for the ladder's levelled bots).
    if (spec.endAt > 0 && s.empties <= spec.endAt && !NO_END.has(spec.type)) {
      const r = endMove(s, END_NODES, rnd);
      if (r) return r;
    }
    switch (spec.type) {
      case 'greedy': return greedyBot(s, rnd);
      case 'blocker': return blockerBot(s, rnd);
      case 'mc': return monteCarloBot(s, spec, rnd);
      case 'minimax': return search(s, { depth: spec.depth, timeMs: spec.timeMs, weights: spec.weights, prune: spec.prune, qDepth: spec.qDepth, qMin: spec.qMin }, rnd);
      case 'material': return search(s, { depth: spec.depth, timeMs: spec.timeMs, evalMode: 'material', qDepth: spec.qDepth, qMin: spec.qMin }, rnd);
      case 'sloppy': return sloppyBot(s, spec, rnd);
      case 'turtle': return turtleBot(s, rnd);
      case 'copycat': return copycatBot(s, rnd);
      case 'mcts': return mctsBot(s, spec, rnd);
      case 'classic': case 'forker': case 'tuned8':
        return search(s, { depth: spec.depth, timeMs: spec.timeMs, weights: presetWeights(spec.type), qDepth: spec.qDepth, qMin: spec.qMin }, rnd);
      case 'accountant': return search(s, { depth: spec.depth, timeMs: spec.timeMs, evalMode: 'accountant', acctWeights: spec.weights, qDepth: spec.qDepth, qMin: spec.qMin }, rnd);
      case 'closer': return closerBot(s, spec, rnd);
      case 'patterns': return patternsBot(s, spec, rnd);
      case 'perfect': return perfectBot(s, spec, rnd);
      case 'hustler': return perfectBot(s, Object.assign({ hustle: true }, spec), rnd);
      default: return randomBot(s, rnd);
    }
  }

  // Bot types whose strength is a look-ahead depth, and those whose strength is a number of playouts.
  const DEPTH_TYPES = ['minimax', 'material', 'classic', 'forker', 'tuned8', 'accountant', 'closer', 'patterns'];
  const PLAYOUT_TYPES = ['mc', 'mcts'];

  // "+q2" for a search with quiescence (2 extra plies of fills; "≥3" when only fills of 3+ cells count).
  // Perfect endgame (spec.endAt): "+end16" = exact play once 16 cells are left.
  const endLabel = (spec) => (spec.endAt > 0 && !NO_END.has(spec.type) ? ' +end' + (spec.endAt | 0) : '');
  const qLabel = (spec) => (spec.qDepth > 0 ? ' +q' + (spec.qDepth | 0) + (spec.qMin !== undefined && +spec.qMin !== 1 ? '≥' + spec.qMin : '') : '');
  function label(spec) {
    const name = spec.name || (BOT_TYPES.find((b) => b[0] === spec.type) || ['', 'Human'])[1];
    if (spec.name) return name;
    if (spec.type === 'patterns') return 'Patterns d' + (spec.depth || 3) + qLabel({ qDepth: patQ(spec), qMin: spec.qMin }) + endLabel(spec);
    if (DEPTH_TYPES.includes(spec.type)) return name + ' d' + (spec.depth || 3) + qLabel(spec) + endLabel(spec);
    if (spec.type === 'mc') return name + ' ' + (spec.playouts || 300);
    if (spec.type === 'mcts') return name + ' ' + (spec.playouts || 800);
    return name;
  }

  return { WIN, rng, shuffle, DEFAULT_WEIGHTS, KEYS, EXTRA, FEATURE_INFO, features, featureSigns, evaluate, evalCfg, weightAt, phase,
    gapFeatures, keptThreat, terminalValue, qLabel, endLabel, endSolve, endMove, gapClass, END_NODES,
    search, solve, settledValue, chooseMove, BOT_TYPES, DEPTH_TYPES, PLAYOUT_TYPES, label, PRESETS, presetWeights,
    ACCT_KEYS, ACCT_INFO, ACCT_DEFAULT, acctFeatures, accountantValue, setAccountantWeights: (w) => { ACCT_W = Object.assign({}, ACCT_W, w); },
    setExact, setBook5, isGuide5,
    patSet, patLayout, patStage, patternValue, patternParts, makeShape, decodeTable, encodeTable, quantize, addTable, getTable, banked, patQ };
}

if (typeof module !== 'undefined' && module.exports) module.exports = BotsModule;
