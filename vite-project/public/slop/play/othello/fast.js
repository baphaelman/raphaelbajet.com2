/*
 * Paper Othello — the fast engine (Rust compiled to WebAssembly, source in rust/, embedded by rust/build.sh in
 * fast-wasm.js). It is a port of engine.js + the search bots of bots.js with the same random number generator, so a
 * game it plays from a seed is move for move the game Lab.playGame would play (checked by experiments/fast-check.js).
 * It plays Random, Greedy, Blocker, Minimax with any weights (and the Classic/Forker/Tuned8 presets), Stones-only,
 * the Accountant, the Closer, Coin-flip, Turtle, Copycat, Monte Carlo and MCTS; `supports(spec)` says whether a spec can run here.
 *
 * Self-contained like engine.js: the page stringifies it into Blob Web Workers. Compiles synchronously, so use it
 * inside a worker (or in Deno); the main thread only needs it for the odd single position.
 */
function FastModule(E, B, b64) {
  'use strict';

  const bin = atob(b64), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const X = new WebAssembly.Instance(new WebAssembly.Module(bytes), { env: { js_log: Math.log, js_tanh: Math.tanh } }).exports;
  // (Monte Carlo and MCTS use V8's own log/tanh, so their tie-breaks match bots.js bit for bit.)

  function call(cmd, arr) {
    const ptr = X.po_input(arr.length);
    new Float64Array(X.memory.buffer, ptr, arr.length).set(arr);
    if (X.po_run(cmd) !== 0) throw new Error('fast engine: unknown command ' + cmd);
    return new Float64Array(X.memory.buffer, X.po_output_ptr(), X.po_output_len()).slice();
  }
  const CMD = { pairs: 1, trace: 2, features: 3, selfplay: 4, search: 5, addTable: 6, tdTrain: 7, patValue: 8 };
  const COLS = 31; // selfplay row width: see rust/src/api.rs

  /* ---------- encoding ---------- */

  const code = (r, k) => Math.max(0, E.OPTIONS[k].findIndex((o) => o[0] === r[k]));
  function rulesArr(rules) {
    const r = E.normalizeRules(rules), st = E.startPosition(r);
    return [r.size, code(r, 'placement'), code(r, 'lineDirs'), code(r, 'lineBlock'), r.maxGap, code(r, 'fill'),
      code(r, 'noMove'), code(r, 'goal'), +r.komi || 0, st.first].concat(Array.from(st.board));
  }
  // Weights as bots.js reads them: a missing or zero weight is skipped (0); no weights at all means the defaults.
  // Minimax: 18 weights for the start of the game, then 18 for its end (`key@end`, the same as the start when absent).
  const KEYS = Object.keys(B.DEFAULT_WEIGHTS).concat(['privGaps', 'sharedOdd', 'crossings'].filter((k) => !(k in B.DEFAULT_WEIGHTS)));
  const AKEYS = B.ACCT_KEYS;
  const wArr = (w, keys) => keys.map((k) => +w[k] || 0);
  function mmArr(w) {
    const a = wArr(w, KEYS);
    return a.concat(KEYS.map((k, i) => (k + '@end' in w ? +w[k + '@end'] || 0 : a[i])));
  }
  const TYPES = ['random', 'greedy', 'blocker', 'minimax', 'material', 'classic', 'forker', 'tuned8', 'accountant', 'closer', 'sloppy', 'turtle', 'copycat', 'mc', 'mcts', 'patterns'];
  function supports(spec) {
    return !!spec && TYPES.includes(spec.type) && !spec.timeMs && spec.prune !== false;
  }
  // Every spec ends with its quiescence settings (B.search opt.qDepth / qMin; 0 plies = off).
  // (Patterns search 3 plies of quiescence unless told otherwise: B.patQ.)
  const qArr = (spec) => [Math.max(0, (spec.type === 'patterns' ? B.patQ(spec) : spec.qDepth) | 0), spec.qMin === undefined ? 1 : spec.qMin | 0];
  // ...and then its perfect-endgame setting (B.chooseMove spec.endAt; 0 = off).
  function specArr(spec) { return specBody(spec).concat(qArr(spec), [Math.max(0, spec.endAt | 0)]); }
  function specBody(spec) {
    const t = spec.type, d = spec.depth | 0;
    switch (t) {
      case 'random': return [0, 0, 0, 0];
      case 'greedy': return [1, 0, 0, 0];
      case 'blocker': return [2, 0, 0, 0];
      case 'minimax': return [3, d, 0, 2 * KEYS.length].concat(mmArr(spec.weights || B.DEFAULT_WEIGHTS));
      case 'material': return [4, d, 0, 0];
      case 'classic': case 'forker': case 'tuned8': return [3, d, 0, 2 * KEYS.length].concat(mmArr(B.presetWeights(t)));
      case 'accountant': return [5, d, 0, AKEYS.length].concat(wArr(spec.weights || B.ACCT_DEFAULT, AKEYS));
      case 'closer': return [6, d, spec.exactAt | 0, 2 * KEYS.length].concat(mmArr(spec.weights || B.DEFAULT_WEIGHTS));
      case 'sloppy': return [7, 0, 0, 1, spec.p === undefined ? 0.5 : spec.p];
      case 'turtle': return [8, 0, 0, 0];
      case 'copycat': return [9, 0, 0, 0];
      case 'mc': return [10, 0, spec.playouts | 0, 0];
      case 'mcts': return [11, 0, spec.playouts | 0, 0];
      case 'patterns': return [12, d, slotOf(spec.table), 0];
      default: throw new Error('fast engine cannot play ' + t);
    }
  }
  const u32 = (x) => x >>> 0; // B.rng(seed) uses seed >>> 0

  /* ---------- pattern tables (B.addTable's twin: rust/src/patterns.rs) ---------- */
  // Shape names as numbers (patterns.rs shape_code).
  const shapeCode = (n) => ({ sq3: 1, sq2: 2, r23: 3, r24: 4, x5: 5 }[n] || (/^lo\d$/.test(n) ? 100 + +n.slice(2) : /^ld\d$/.test(n) ? 200 + +n.slice(2) : 0));
  const setArr = (set) => { const names = set.names.split(',').filter(Boolean); return [names.length].concat(names.map(shapeCode), [set.ns]); };
  const SLOTS = {};
  // Registers a decoded table (B.addTable / B.decodeTable) under an id; registering the same id again replaces it.
  function addTable(id, t) {
    const o = call(CMD.addTable, [id in SLOTS ? SLOTS[id] : -1].concat(setArr(t.set), [t.scale, t.w.length], Array.from(t.w)));
    if (o[0] < 0) throw new Error('fast engine: pattern table does not fit its shapes');
    SLOTS[id] = o[0];
  }
  // An unknown table plays the Default weights, as in bots.js.
  const slotOf = (id) => (SLOTS[id || 'mix'] === undefined ? -1 : SLOTS[id || 'mix']);
  // TD(lambda) self-play training (patterns.rs td_train) on float weights w (stones, the layout of B.patSet(set)):
  // returns { positions, err (mean |error|), w (the new weights, Float32Array) }.
  function tdTrain(rules, set, w, o) {
    const r = call(CMD.tdTrain, rulesArr(rules).concat(setArr(set), [w.length], Array.from(w),
      [o.games | 0, +o.alpha, +o.lambda, +o.eps, o.opening | 0, u32(o.seed || 1)]));
    return { positions: r[0], err: r[1], w: Float32Array.from(r.subarray(2)) };
  }
  // B.patternValue of one position on a registered table (for checks).
  function patValue(rules, board, turn, id) {
    return call(CMD.patValue, rulesArr(rules).concat(Array.from(board), [turn, slotOf(id)]))[0];
  }

  /* ---------- commands ---------- */

  // Colour-swapped pairs from the same seed (like T.pairJobs + Lab.runBatch). Per pair: A's points (0..2) and A's
  // final margin (its own point of view, komi included) in the game where it is X and in the one where it is O.
  function pairs(rules, specA, specB, seeds, opening) {
    const o = call(CMD.pairs, rulesArr(rules).concat(specArr(specA), specArr(specB), [opening | 0, seeds.length], seeds.map(u32)));
    const out = [];
    for (let i = 0; i < seeds.length; i++) out.push({ pts: o[5 * i], uX: o[5 * i + 1], uO: o[5 * i + 2], plies: o[5 * i + 3] + o[5 * i + 4] });
    return out;
  }

  // Lab.runBatch for a job made by T.pairJobs (seeds [s, s], alternate): games without move lists.
  function runBatch(job) {
    const games = [];
    for (let i = 0; i < job.seeds.length; i += 2) {
      const p = pairs(job.rules, job.botA, job.botB, [job.seeds[i]], job.openingPlies)[0];
      const w = (u, aIsX) => (u > 0 ? (aIsX ? 1 : 2) : u < 0 ? (aIsX ? 2 : 1) : 0);
      games.push({ winner: w(p.uX, true), aIsX: true, margin: null }, { winner: w(p.uO, false), aIsX: false, margin: null });
    }
    return games;
  }

  // One game, move by move: { margin, winner, plies, moves: [[cell, ...fills]] } like Lab.playGame's move list.
  function trace(rules, specX, specO, seed, opening) {
    const o = call(CMD.trace, rulesArr(rules).concat(specArr(specX), specArr(specO), [opening | 0, u32(seed)]));
    const moves = [];
    for (let i = 3; i < o.length;) {
      const cell = o[i], nf = o[i + 1];
      moves.push(cell < 0 ? [-1] : [cell].concat(Array.from(o.subarray(i + 2, i + 2 + nf))));
      i += 2 + nf;
    }
    return { margin: o[0], winner: o[1], plies: o[2], moves };
  }

  // Everything the evaluators see in one position (for checks against bots.js).
  function features(rules, board, turn) {
    const o = call(CMD.features, rulesArr(rules).concat(Array.from(board), [turn]));
    const moves = [];
    for (let i = 0, n = o[42]; i < n; i++) moves.push({ cell: o[43 + 3 * i], mask: o[44 + 3 * i], gain: o[45 + 3 * i] });
    const kept = Array.from(o.subarray(43 + 3 * o[42], 45 + 3 * o[42])); // [mover's, the other side's] (B.keptThreat)
    return { mm: Array.from(o.subarray(0, 13)), acct: Array.from(o.subarray(13, 26)), evalDefault: o[26], evalAcct: o[27],
      settled: !!o[28], over: !!o[29], survey: [null, Array.from(o.subarray(30, 36)), Array.from(o.subarray(36, 42))], moves, kept };
  }

  // Self-play for the tuner: one row of COLS numbers per position where a bot moved (after the opening, before the
  // game settled). eps = chance of a random move instead (exploration); labelDepth > 0 adds specX's search score.
  function selfplay(rules, specX, specO, seeds, opening, eps, labelDepth) {
    return call(CMD.selfplay, rulesArr(rules).concat(specArr(specX), specArr(specO), [opening | 0, +eps || 0, labelDepth | 0, seeds.length], seeds.map(u32)));
  }

  // B.chooseMove for one position: { cell, mask, gain }.
  function choose(rules, board, turn, spec, seed) {
    const o = call(CMD.search, rulesArr(rules).concat(Array.from(board), [turn], specArr(spec), [u32(seed)]));
    return { cell: o[0], mask: o[1], gain: o[2] };
  }

  return { supports, rulesArr, specArr, pairs, runBatch, trace, features, selfplay, choose, COLS, KEYS, AKEYS, addTable, tdTrain, patValue };
}

if (typeof module !== 'undefined' && module.exports) module.exports = FastModule;
