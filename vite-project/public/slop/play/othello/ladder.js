/*
 * Paper Othello — the bot ladder (Ladder tab, experiments/royale.js).
 *
 * One fixed standard for Elo: a roster of bots with different ideas plays a full round robin (colour-swapped
 * pairs of games from the same opening), and the ratings are the maximum-likelihood Bradley–Terry fit over every
 * game, with Random pinned at 0. After a run the pool is frozen into ladder-data.js; any newcomer (a saved bot
 * from the Tune tab, say) is rated by playing the frozen pool and fitting its one rating with theirs held fixed,
 * so every number on the page means the same thing.
 *
 * Pure functions; whoever drives it (page or CLI) plays the games. Self-contained like engine.js.
 */
function LadderModule(E, B) {
  'use strict';

  const SCALE = 400 / Math.LN10; // Elo points per natural-log unit of odds

  /* ---------- the roster ---------- */
  // id, display name, spec, one-line idea. `only` limits an entry to boards of that size.
  const ROSTER = [
    ['random', 'Random', { type: 'random' }, 'Any legal cell, fills or not at random. The anchor: always 0 Elo.'],
    ['coinflip', 'Coin-flip', { type: 'sloppy', p: 0.5 }, 'Greedy half the time, random the other half.'],
    ['greedy', 'Greedy', { type: 'greedy' }, 'Takes whatever fills the most cells right now.'],
    ['blocker', 'Blocker', { type: 'blocker' }, 'Greedy minus the opponent\'s best reply, so it also blocks.'],
    ['turtle', 'Turtle', { type: 'turtle' }, 'Smothers: leaves the opponent as few cells to play as possible.'],
    ['copycat', 'Copycat', { type: 'copycat' }, 'Keeps the board a colour-swapped mirror image through the centre; thinks 2 ahead when it can\'t.'],
    ['mc300', 'Monte Carlo 300', { type: 'mc', playouts: 300 }, 'No knowledge: random games from each move, keeps sampling the best (flat UCB).'],
    ['mcts400', 'MCTS 400', { type: 'mcts', playouts: 400 }, 'A real search tree grown by 400 playouts that prefer big fills. No evaluator.'],
    ['mcts2000', 'MCTS 2000', { type: 'mcts', playouts: 2000 }, 'The same tree search with 2,000 playouts per move.'],
    ['d1', 'Default d1', { type: 'minimax', depth: 1 }, 'The default evaluator, one move ahead.'],
    ['d2', 'Default d2', { type: 'minimax', depth: 2 }, 'The default evaluator, two moves ahead.'],
    ['d3', 'Default d3', { type: 'minimax', depth: 3 }, 'The default evaluator, three moves ahead.'],
    ['d4', 'Default d4', { type: 'minimax', depth: 4 }, 'The default evaluator, four moves ahead.'],
    ['d5', 'Default d5', { type: 'minimax', depth: 5 }, 'The default evaluator, five moves ahead.'],
    ['d6', 'Default d6', { type: 'minimax', depth: 6 }, 'The default evaluator, six moves ahead.'],
    ['stones4', 'Stones-only d4', { type: 'material', depth: 4 }, 'Four ahead, but counts only the marks on the board.'],
    ['classic3', 'Classic d3', { type: 'classic', depth: 3 }, 'Othello wisdom (corners, edges, mobility, few exposed stones), no idea of fills.'],
    ['forker3', 'Forker d3', { type: 'forker', depth: 3 }, 'Prizes cells that would fill along two lines at once.'],
    ['tuned3', 'Tuned-8×8 d3', { type: 'tuned8', depth: 3 }, 'The Tune tab\'s best 8×8 weights (+44 Elo there), tried on this board.'],
    ['acct3', 'Accountant d3', { type: 'accountant', depth: 3 }, 'Predicts the exact final margin from banked marks, lone gaps and threats (fitted to solved 5×5 positions).'],
    ['acct5', 'Accountant d5', { type: 'accountant', depth: 5 }, 'The Accountant, five moves ahead.'],
    ['closer3', 'Closer d3', { type: 'closer', depth: 3, exactAt: 14 }, 'Default d3, then perfect play once 14 cells are left.'],
    ['acct3e', 'Accountant d3 +q3 +end16', { type: 'accountant', depth: 3, qDepth: 3, endAt: 16 }, 'The Accountant three ahead, looking further through fills, and perfect once 16 cells are left (results/38).'],
    ['pat2', 'Patterns d2', { type: 'patterns', depth: 2 }, 'Learned pattern tables (the shipped table), two moves ahead plus 3 of fills.'],
    ['pat2e', 'Patterns d2 +end16', { type: 'patterns', depth: 2, endAt: 16 }, 'The pattern bot, perfect once 16 cells are left.'],
    ['pat3e', 'Patterns d3 +end16', { type: 'patterns', depth: 3, endAt: 16 }, 'The pattern bot three moves ahead, perfect once 16 cells are left.'],
    ['perfect', 'Perfect', { type: 'perfect' }, 'Exact play: the game is solved on this board.', 5],
    ['hustler', 'Hustler', { type: 'hustler' }, 'Exact play, and among equally good moves the one that leaves the opponent the fewest good replies.', 5],
  ].map(([id, name, spec, idea, only]) => ({ id, name, spec: Object.assign({ name }, spec), idea, only: only || 0 }));

  // Too slow to play in a browser worker (or, for Perfect, only perfect with the headless solver).
  const SLOW = new Set(['d6', 'mcts2000', 'acct5', 'perfect', 'hustler']);
  const rosterFor = (size) => ROSTER.filter((r) => !r.only || r.only === size);

  // The boards with a frozen ladder, named by their ruleset id (T.shortId): ysbvl = 7×7, empty start, centre hole,
  // komi ½, mandatory fills (the main ruleset for tuning). The 5×5 / 7×7 guide-game ladders were dropped on
  // 2026-11-13; their games are still in experiments/results/30-ladder-5x5|7x7.jsonl.
  // Random opening moves before the bots take over, for every ladder (frozen or built in the browser) and every game
  // counted on one. 4 since 2026-11-13 (was 1): with 1 move the strong, nearly deterministic bots kept replaying a few
  // openings, and Patterns d3 lost to d2 on the ladder while beating it by +62 from 4-move openings (results/38).
  // Games are only counted on a ladder with the same opening (app.js batch `op`; merge-games.js).
  const OPENING = 4;
  const BOARDS = [
    { id: 'ysbvl', name: 'ysbvl', rules: { size: 7, start: 'empty', holes: 'center', komi: 0.5, fill: 'all' }, opening: OPENING },
  ];

  /* ---------- games ---------- */

  // One job per pair of games: the same seed twice, colours swapped, so both share the random opening.
  function pairJobs(rules, a, b, seeds, opening) {
    return seeds.map((s) => ({ rules, botA: a, botB: b, seeds: [s, s], alternate: true, indexBase: 0, openingPlies: opening }));
  }
  const pointsA = (games) => games.reduce((p, g) => p + (g.winner === 0 ? 0.5 : (g.winner === 1) === g.aIsX ? 1 : 0), 0);

  /* ---------- ratings ---------- */

  // results: [{ i, j, s, n }] = player i scored s points out of n games against j.
  // Maximum likelihood Bradley–Terry (Newton steps), with one virtual drawn game per pair that met so a clean sweep
  // doesn't send a rating to infinity. Ratings in Elo, anchor pinned at 0; 95% ranges from the inverse Hessian.
  function fit(k, results, anchor) {
    if (anchor === undefined) anchor = 0;
    if (anchor < 0 || anchor >= k) throw new Error('Random has to be on the ladder: it is the 0 point every rating is measured from.');
    const S = Array.from({ length: k }, () => new Float64Array(k)), N = Array.from({ length: k }, () => new Float64Array(k));
    for (const r of results) { S[r.i][r.j] += r.s; S[r.j][r.i] += r.n - r.s; N[r.i][r.j] += r.n; N[r.j][r.i] += r.n; }
    for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) if (i !== j && N[i][j]) { S[i][j] += 0.5; N[i][j] += 1; }
    const x = new Float64Array(k), free = [];
    for (let i = 0; i < k; i++) if (i !== anchor) free.push(i);
    const m = free.length;
    let H = null;
    for (let iter = 0; iter < 100; iter++) {
      const g = new Float64Array(m);
      H = Array.from({ length: m }, () => new Float64Array(m));
      const pos = new Int32Array(k).fill(-1);
      free.forEach((i, a) => { pos[i] = a; });
      for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) {
        if (!N[i][j]) continue;
        const p = 1 / (1 + Math.exp(x[j] - x[i])), w = N[i][j] * p * (1 - p), gi = S[i][j] - N[i][j] * p;
        const a = pos[i], b = pos[j];
        if (a >= 0) { g[a] += gi; H[a][a] += w; }
        if (b >= 0) { g[b] -= gi; H[b][b] += w; }
        if (a >= 0 && b >= 0) { H[a][b] -= w; H[b][a] -= w; }
      }
      const d = solveLinear(H.map((r) => Array.from(r)), Array.from(g));
      let step = 0;
      for (let a = 0; a < m; a++) { const dd = Math.max(-3, Math.min(3, d[a])); x[free[a]] += dd; step = Math.max(step, Math.abs(dd)); }
      if (step < 1e-7) break;
    }
    const inv = invert(H.map((r) => Array.from(r)));
    return Array.from({ length: k }, (_, i) => {
      const a = free.indexOf(i), se = a >= 0 ? Math.sqrt(Math.max(0, inv[a][a])) : 0;
      return { elo: SCALE * x[i], se: SCALE * se };
    });
  }

  // Adds more pair results [[idA, idB, scoreA, games], ...] to a ladder and refits every rating from all its games,
  // so a run among a few bots (say the top 8) tightens their numbers without dropping anyone. Pairs of bots that are
  // not on the ladder are ignored. Returns a new ladder object; the old one is left alone.
  function merge(l, extra) {
    const m = new Map();
    const add = (p) => {
      const [a, b, s, n] = p, lo = a < b ? a : b, hi = a < b ? b : a, key = lo + '|' + hi;
      const e = m.get(key) || { a: lo, b: hi, s: 0, n: 0 };
      e.s += a === lo ? s : n - s; e.n += n; m.set(key, e);
    };
    l.pairs.forEach(add); (extra || []).forEach(add);
    const idx = new Map(l.bots.map((b, i) => [b.id, i])), k = l.bots.length;
    const res = [...m.values()].filter((e) => idx.has(e.a) && idx.has(e.b)).map((e) => ({ i: idx.get(e.a), j: idx.get(e.b), s: e.s, n: e.n }));
    const fitted = fit(k, res, l.bots.findIndex((b) => b.id === 'random'));
    const tot = l.bots.map(() => ({ s: 0, n: 0 }));
    for (const r of res) { tot[r.i].s += r.s; tot[r.i].n += r.n; tot[r.j].s += r.n - r.s; tot[r.j].n += r.n; }
    return Object.assign({}, l, {
      bots: l.bots.map((b, i) => Object.assign({}, b, { elo: Math.round(fitted[i].elo), ci: Math.round(1.96 * fitted[i].se),
        score: tot[i].n ? +(tot[i].s / tot[i].n).toFixed(4) : 0, games: tot[i].n })),
      pairs: [...m.values()].map((e) => [e.a, e.b, e.s, e.n]),
      games: res.reduce((a, r) => a + r.n, 0),
    });
  }

  // One newcomer against a frozen pool: results [{ elo, s, n }] = it scored s of n against a bot rated elo.
  function fitOne(results) {
    let x = 0, info = 0;
    const rs = results.filter((r) => r.n > 0).map((r) => ({ y: r.elo / SCALE, s: r.s + 0.5, n: r.n + 1 }));
    if (!rs.length) return null;
    x = rs.reduce((a, r) => a + r.y, 0) / rs.length;
    for (let it = 0; it < 100; it++) {
      let g = 0; info = 0;
      for (const r of rs) { const p = 1 / (1 + Math.exp(r.y - x)); g += r.s - r.n * p; info += r.n * p * (1 - p); }
      const d = Math.max(-3, Math.min(3, g / info));
      x += d;
      if (Math.abs(d) < 1e-8) break;
    }
    const games = results.reduce((a, r) => a + r.n, 0), score = results.reduce((a, r) => a + r.s, 0);
    return { elo: SCALE * x, se: SCALE / Math.sqrt(info), games, score: games ? score / games : 0 };
  }

  // Which frozen bots should a newcomer with a rough guess play: the nearest ratings, spread on both sides.
  function opponentsFor(pool, guess, count) {
    const sorted = pool.slice().sort((a, b) => Math.abs(a.elo - guess) - Math.abs(b.elo - guess));
    return sorted.slice(0, count || 6);
  }

  function solveLinear(A, b) {
    const n = b.length;
    for (let c = 0; c < n; c++) {
      let p = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
      const piv = A[c][c] || 1e-12;
      for (let r = c + 1; r < n; r++) {
        const f = A[r][c] / piv;
        if (!f) continue;
        for (let q = c; q < n; q++) A[r][q] -= f * A[c][q];
        b[r] -= f * b[c];
      }
    }
    const x = new Array(n).fill(0);
    for (let r = n - 1; r >= 0; r--) {
      let v = b[r];
      for (let q = r + 1; q < n; q++) v -= A[r][q] * x[q];
      x[r] = v / (A[r][r] || 1e-12);
    }
    return x;
  }
  function invert(A) {
    const n = A.length, out = [];
    for (let c = 0; c < n; c++) { const e = new Array(n).fill(0); e[c] = 1; out.push(solveLinear(A.map((r) => r.slice()), e)); }
    return out.map((_, i) => out.map((col) => col[i]));
  }

  return { SLOW, ROSTER, rosterFor, BOARDS, OPENING, pairJobs, pointsA, fit, merge, fitOne, opponentsFor, SCALE };
}

if (typeof module !== 'undefined' && module.exports) module.exports = LadderModule;
