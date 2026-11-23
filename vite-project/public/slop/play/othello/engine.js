/*
 * Paper Othello — rules engine.
 *
 * Everything about the rules lives here, driven by a plain `rules` object, so the
 * UI, the bots, and the lab all adapt automatically when a rule is toggled.
 *
 * The whole file is one self-contained function on purpose: the browser calls it
 * directly, and the page also stringifies it to build Web Workers (which works
 * even when index.html is opened straight from disk). No imports, no globals.
 *
 * Board cells: 0 = empty, 1 = X, 2 = O, 3 = blocked (a hole nobody may use). Cell index = row * n + col.
 */
function EngineModule() {
  'use strict';

  // First four are orthogonal, last four diagonal.
  const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]];
  const DIR_SETS = { all: [0, 1, 2, 3, 4, 5, 6, 7], orth: [0, 1, 2, 3], diag: [4, 5, 6, 7] };
  const NONE = [];
  const PASS = { cell: -1, fills: NONE, gain: 0, avail: 0 };

  const DEFAULT_RULES = {
    size: 8,
    start: 'empty',      // empty | center | split | spread | corners | custom
    customStart: null,   // { size, cells: '.XO#…' (row-major, # = hole), first: 1|2 }
    holes: 'none',       // none | center: the middle cell (odd sizes) is blocked
    placement: 'opp8',   // opp8: touching an opponent stone (incl. diagonal) | opp4: orthogonal only
                         // any8: touching any stone | free: any empty cell
    lineDirs: 'all',     // all | orth | diag — directions in which lines can form
    lineBlock: 'clear',  // clear: gap must be empty up to the nearest stone, which must be yours
                         // own: lines continue through your own stones
                         // any: lines also jump over opponent stones (only empties get filled)
    maxGap: 0,           // longest run of empties a line may fill; 0 = unlimited
    fill: 'choice',      // choice: pick which lines to fill | all: must fill every line | none: no filling
    noMove: 'pass',      // pass | free (place anywhere) | end (game ends immediately)
    goal: 'most',        // most | fewest stones wins
    komi: 0,             // points given to O (second player) at the end
  };

  const OPTIONS = {
    start: [['empty', 'Empty board'], ['center', 'Centre XO / OX'], ['split', 'Centre XX / OO'],
            ['spread', 'Spread diagonal'], ['corners', 'Four corners'], ['custom', 'Custom (sandbox)']],
    placement: [['opp8', 'Touching an opponent stone (8-way)'], ['opp4', 'Touching an opponent stone (orthogonal)'],
                ['any8', 'Touching any stone'], ['free', 'Anywhere']],
    lineDirs: [['all', 'Rows, columns, diagonals'], ['orth', 'Rows and columns only'], ['diag', 'Diagonals only']],
    lineBlock: [['clear', 'Clear gap to your nearest stone'], ['own', 'Continue through your own stones'],
                ['any', 'Jump over any stones']],
    fill: [['choice', 'Optional — choose lines'], ['all', 'Mandatory — every line'], ['none', 'No filling at all']],
    noMove: [['pass', 'Pass'], ['free', 'Place anywhere'], ['end', 'Game ends']],
    goal: [['most', 'Most stones wins'], ['fewest', 'Fewest stones wins']],
    holes: [['none', 'No blocked cells'], ['center', 'Centre cell blocked (odd sizes)']],
  };

  const geoCache = {};
  function geometry(n) {
    if (geoCache[n]) return geoCache[n];
    const N = n * n, n8 = [], n4 = [], rays = [];
    for (let c = 0; c < N; c++) {
      const r = (c / n) | 0, k = c % n, a8 = [], a4 = [], rr = [];
      for (let d = 0; d < 8; d++) {
        const dr = DIRS[d][0], dc = DIRS[d][1], ray = [];
        let y = r + dr, x = k + dc;
        while (y >= 0 && y < n && x >= 0 && x < n) { ray.push(y * n + x); y += dr; x += dc; }
        rr.push(ray);
        if (ray.length) { a8.push(ray[0]); if (d < 4) a4.push(ray[0]); }
      }
      n8.push(a8); n4.push(a4); rays.push(rr);
    }
    return (geoCache[n] = { n, N, n8, n4, rays });
  }

  function normalizeRules(r) {
    const out = Object.assign({}, DEFAULT_RULES, r || {});
    out.size = Math.max(3, Math.min(16, out.size | 0 || 8));
    out.maxGap = Math.max(0, out.maxGap | 0);
    out.komi = +out.komi || 0;
    for (const key in OPTIONS) {
      if (!OPTIONS[key].some((o) => o[0] === out[key])) out[key] = DEFAULT_RULES[key];
    }
    return out;
  }

  /* ---------- starting positions ---------- */

  function startPosition(rules) {
    const n = rules.size, board = new Int8Array(n * n);
    const put = (r, c, v) => { if (r >= 0 && r < n && c >= 0 && c < n) board[r * n + c] = v; };
    let first = 1;
    const even = n % 2 === 0, h = n >> 1, m = (n - 1) >> 1;
    switch (rules.start) {
      case 'center':
        if (even) { put(h - 1, h - 1, 1); put(h, h, 1); put(h - 1, h, 2); put(h, h - 1, 2); }
        else { put(m - 1, m - 1, 1); put(m + 1, m + 1, 1); put(m - 1, m + 1, 2); put(m + 1, m - 1, 2); }
        break;
      case 'split':
        if (even) { put(h - 1, h - 1, 1); put(h - 1, h, 1); put(h, h - 1, 2); put(h, h, 2); }
        else { put(m - 1, m - 1, 1); put(m - 1, m + 1, 1); put(m + 1, m - 1, 2); put(m + 1, m + 1, 2); }
        break;
      case 'spread': {
        const q = Math.max(1, (n - 1) >> 2), e = n - 1 - q;
        put(q, q, 1); put(e, e, 1); put(q, e, 2); put(e, q, 2);
        break;
      }
      case 'corners':
        put(0, 0, 1); put(n - 1, n - 1, 1); put(0, n - 1, 2); put(n - 1, 0, 2);
        break;
      case 'custom': {
        const cs = rules.customStart;
        if (cs && cs.size === n && typeof cs.cells === 'string') {
          for (let i = 0; i < n * n; i++) { const ch = cs.cells[i]; board[i] = ch === 'X' ? 1 : ch === 'O' ? 2 : ch === '#' ? 3 : 0; }
          first = cs.first === 2 ? 2 : 1;
        }
        break;
      }
      default: break;
    }
    // A hole is blocked for both players: never empty, never owned, and it stops lines like an opponent stone.
    if (rules.holes === 'center' && n % 2 === 1) board[m * n + m] = 3;
    return { board, first };
  }

  function boardToString(board) {
    let s = '';
    for (let i = 0; i < board.length; i++) s += board[i] === 1 ? 'X' : board[i] === 2 ? 'O' : board[i] === 3 ? '#' : '.';
    return s;
  }

  /* ---------- state ---------- */

  function fromPosition(rules, board, turn) {
    rules = normalizeRules(rules);
    const geo = geometry(rules.size);
    const s = {
      rules, geo, n: rules.size,
      board: Int8Array.from(board), turn: turn === 2 ? 2 : 1,
      count: [0, 0, 0, 0], empties: 0, over: false, ply: 0,
      dirs: DIR_SETS[rules.lineDirs],
      nb: rules.placement === 'opp4' ? geo.n4 : geo.n8,
      maxGap: rules.maxGap > 0 ? rules.maxGap : 1e9,
    };
    for (let i = 0; i < geo.N; i++) s.count[s.board[i] & 3]++;
    s.empties = s.count[0];
    updateOver(s);
    return s;
  }

  function newGame(rules) {
    rules = normalizeRules(rules);
    const st = startPosition(rules);
    return fromPosition(rules, st.board, st.first);
  }

  function clone(s) {
    const t = Object.assign({}, s);
    t.board = s.board.slice();
    t.count = s.count.slice();
    return t;
  }

  /* ---------- placement ---------- */

  // How many stones on the board can "anchor" a placement for player p. Zero means
  // the adjacency rule cannot apply yet (e.g. the very first move), so any cell is fine.
  function anchors(s, p) {
    const pl = s.rules.placement;
    return pl === 'free' ? 0 : pl === 'any8' ? s.count[1] + s.count[2] : s.count[3 - p];
  }

  function legalCells(s, p) {
    if (p === undefined) p = s.turn;
    const b = s.board, N = s.geo.N, out = [];
    if (anchors(s, p) === 0) { for (let c = 0; c < N; c++) if (!b[c]) out.push(c); return out; }
    const nb = s.nb, any = s.rules.placement === 'any8', o = 3 - p;
    for (let c = 0; c < N; c++) {
      if (b[c]) continue;
      const a = nb[c];
      for (let i = 0; i < a.length; i++) {
        const v = b[a[i]];
        if (any ? v !== 0 : v === o) { out.push(c); break; }
      }
    }
    if (!out.length && s.rules.noMove === 'free') for (let c = 0; c < N; c++) if (!b[c]) out.push(c);
    return out;
  }

  function hasLegal(s, p) {
    if (s.empties === 0) return false;
    if (s.rules.noMove === 'free' || anchors(s, p) === 0) return true;
    const b = s.board, N = s.geo.N, nb = s.nb, any = s.rules.placement === 'any8', o = 3 - p;
    for (let c = 0; c < N; c++) {
      if (b[c]) continue;
      const a = nb[c];
      for (let i = 0; i < a.length; i++) {
        const v = b[a[i]];
        if (any ? v !== 0 : v === o) return true;
      }
    }
    return false;
  }

  function updateOver(s) {
    if (s.empties === 0) { s.over = true; return; }
    if (hasLegal(s, s.turn)) { s.over = false; return; }
    if (s.rules.noMove === 'end') { s.over = true; return; }
    s.over = !hasLegal(s, 3 - s.turn); // both stuck: nothing more can happen
  }

  /* ---------- lines ---------- */

  // Walk from `cell` in direction d as if player p had just placed a stone there.
  // Returns how many empty cells the resulting line would fill; pushes them to `out` if given.
  function scanLine(s, cell, d, p, out) {
    const ray = s.geo.rays[cell][d], b = s.board, mode = s.rules.lineBlock, maxGap = s.maxGap;
    let pending = 0, committed = 0;
    for (let i = 0; i < ray.length; i++) {
      const v = b[ray[i]];
      if (v === 0) { if (++pending > maxGap) break; }
      else if (v === p) { committed += pending; pending = 0; if (mode === 'clear') break; }
      else if (mode !== 'any') break;
    }
    if (out && committed) {
      for (let i = 0, left = committed; left > 0; i++) if (b[ray[i]] === 0) { out.push(ray[i]); left--; }
    }
    return committed;
  }

  // All lines a placement at `cell` would create: an array of arrays of cells.
  function linesAt(s, cell, p) {
    const lines = [];
    if (s.rules.fill === 'none') return lines;
    if (p === undefined) p = s.turn;
    for (let i = 0; i < s.dirs.length; i++) {
      const out = [];
      if (scanLine(s, cell, s.dirs[i], p, out)) lines.push(out);
    }
    return lines;
  }

  function fillSize(s, cell, p) {
    let g = 0;
    for (let i = 0; i < s.dirs.length; i++) g += scanLine(s, cell, s.dirs[i], p, null);
    return g;
  }

  // What player p could do if it were their move: number of legal cells, and the
  // two biggest fills on offer (on different cells). Used by the evaluator.
  function potential(s, p) {
    const cells = legalCells(s, p);
    let best = 0, second = 0;
    if (s.rules.fill !== 'none') {
      for (let i = 0; i < cells.length; i++) {
        const g = fillSize(s, cells[i], p);
        if (g > best) { second = best; best = g; } else if (g > second) second = g;
      }
    }
    return { best, second, mob: cells.length };
  }

  // One pass over the empty cells collecting everything the evaluator looks at, for
  // both players (index 1 = X, 2 = O):
  //   best / second  biggest fills available on cells that player may legally use
  //   mob            how many cells that player may legally use
  //   lib            empty cells touching that player's stones ("open space")
  //   latent         fills that player's stones could make on any empty cell, legal or not yet
  function survey(s) {
    const b = s.board, N = s.geo.N, n8 = s.geo.n8, n4 = s.geo.n4, pl = s.rules.placement;
    const fills = s.rules.fill !== 'none', opp4 = pl === 'opp4', any = pl === 'any8';
    const openFor = [false, anchors(s, 1) === 0, anchors(s, 2) === 0];
    const out = [null, { best: 0, second: 0, mob: 0, lib: 0, latent: 0, big: 0 }, { best: 0, second: 0, mob: 0, lib: 0, latent: 0, big: 0 }];
    for (let c = 0; c < N; c++) {
      if (b[c]) continue;
      let t1 = false, t2 = false, f1 = false, f2 = false;
      const a = n8[c];
      for (let i = 0; i < a.length; i++) { const v = b[a[i]]; if (v === 1) t1 = true; else if (v === 2) t2 = true; }
      if (opp4) { const q = n4[c]; for (let i = 0; i < q.length; i++) { const v = b[q[i]]; if (v === 1) f1 = true; else if (v === 2) f2 = true; } }
      if (t1) out[1].lib++;
      if (t2) out[2].lib++;
      for (let p = 1; p <= 2; p++) {
        const o = out[p];
        const legal = openFor[p] || (any ? t1 || t2 : opp4 ? (p === 1 ? f2 : f1) : (p === 1 ? t2 : t1));
        if (legal) o.mob++;
        if (!fills || s.count[p] === 0) continue;
        const g = fillSize(s, c, p);
        if (!g) continue;
        o.latent += g;
        if (legal) {
          if (g > o.best) { o.second = o.best; o.best = g; } else if (g > o.second) o.second = g;
          if (g >= 2) o.big++; // a "threat" in the fork sense: a fill of 2+ cells on offer now
        }
      }
    }
    return out;
  }

  /* ---------- moves ---------- */

  function buildMove(cell, chosenLines, avail) {
    const fills = chosenLines.length ? [].concat.apply([], chosenLines) : NONE;
    return { cell, fills, gain: 1 + fills.length, avail: avail === undefined ? fills.length : avail };
  }

  // One move on `cell`, filling every line (or none).
  function moveAt(s, cell, fillAll) {
    if (s.rules.fill === 'none') return { cell, fills: NONE, gain: 1, avail: 0 };
    const lines = linesAt(s, cell, s.turn);
    const avail = lines.reduce((a, l) => a + l.length, 0);
    return buildMove(cell, fillAll || s.rules.fill === 'all' ? lines : [], avail);
  }

  // Every legal move for the side to move. With optional filling, each cell yields one
  // move per subset of its lines. `forSearch` trims the (rare) cells with 5+ lines to
  // all / none / all-but-one / only-one so the search tree stays manageable.
  function genMoves(s, forSearch) {
    if (s.over) return [];
    const cells = legalCells(s);
    if (!cells.length) return [PASS];
    const fm = s.rules.fill, p = s.turn, moves = [];
    for (let ci = 0; ci < cells.length; ci++) {
      const cell = cells[ci];
      const lines = linesAt(s, cell, p);
      if (!lines.length) { moves.push({ cell, fills: NONE, gain: 1, avail: 0 }); continue; }
      const k = lines.length, avail = lines.reduce((a, l) => a + l.length, 0);
      moves.push(buildMove(cell, lines, avail));
      if (fm !== 'choice') continue;
      if (forSearch && k > 4) {
        moves.push(buildMove(cell, [], avail));
        for (let i = 0; i < k; i++) moves.push(buildMove(cell, lines.filter((_, j) => j !== i), avail));
        for (let i = 0; i < k; i++) moves.push(buildMove(cell, [lines[i]], avail));
      } else {
        for (let mask = (1 << k) - 2; mask >= 0; mask--) {
          moves.push(buildMove(cell, lines.filter((_, j) => mask & (1 << j)), avail));
        }
      }
    }
    return moves;
  }

  function play(s, m) {
    const p = s.turn;
    if (m.cell >= 0) {
      const b = s.board, f = m.fills;
      b[m.cell] = p;
      for (let i = 0; i < f.length; i++) b[f[i]] = p;
      s.count[p] += 1 + f.length;
      s.empties -= 1 + f.length;
    }
    s.turn = 3 - p;
    s.ply++;
    updateOver(s);
  }

  function undo(s, m) {
    const p = (s.turn = 3 - s.turn);
    if (m.cell >= 0) {
      const b = s.board, f = m.fills;
      b[m.cell] = 0;
      for (let i = 0; i < f.length; i++) b[f[i]] = 0;
      s.count[p] -= 1 + f.length;
      s.empties += 1 + f.length;
    }
    s.ply--;
    s.over = false; // a move was just played from this position, so it was not over
  }

  /* ---------- settled endgames ---------- */

  // True once no line can ever be filled again, so the rest of the game is just single
  // marks dropped into lone gaps. A fill needs an empty cell somewhere along a ray from the
  // placed mark: with 'clear' lines it must be the very next cell, with 'own'/'any' it can be
  // further out. Empties only ever disappear, so once this holds it holds for good.
  function isSettled(s) {
    if (s.over) return false;
    const b = s.board, N = s.geo.N, rays = s.geo.rays, dirs = s.dirs, near = s.rules.lineBlock === 'clear';
    for (let c = 0; c < N; c++) {
      if (b[c]) continue;
      for (let i = 0; i < dirs.length; i++) {
        const ray = rays[c][dirs[i]];
        if (near) { if (ray.length && b[ray[0]] === 0) return false; }
        else for (let j = 0; j < ray.length; j++) if (b[ray[j]] === 0) return false;
      }
    }
    return true;
  }

  // How a settled game is finished off: take a cell the opponent could also take if there is
  // one, otherwise any cell you can take, otherwise pass. Under the default rules (lines in all
  // 8 directions) the lone gaps never affect each other, so this is perfect play for both sides.
  function settledMove(s) {
    const mine = legalCells(s);
    if (!mine.length) return PASS;
    const theirs = new Set(legalCells(s, 3 - s.turn));
    let cell = mine[0];
    for (let i = 0; i < mine.length; i++) if (theirs.has(mine[i])) { cell = mine[i]; break; }
    return { cell, fills: NONE, gain: 1, avail: 0 };
  }

  // Plays a settled game to the end in place; returns the moves it made.
  function finishSettled(s) {
    const moves = [];
    let guard = 2 * s.geo.N + 4;
    while (!s.over && guard-- > 0) { const m = settledMove(s); play(s, m); moves.push(m); }
    return moves;
  }

  /* ---------- scoring ---------- */

  // Raw margin from X's point of view, komi included.
  function margin(s) { return s.count[1] - s.count[2] - s.rules.komi; }
  // What X is trying to maximise (flips sign for "fewest stones wins").
  function utility(s) { return s.rules.goal === 'fewest' ? -margin(s) : margin(s); }
  function winner(s) { const u = utility(s); return u > 0 ? 1 : u < 0 ? 2 : 0; }

  function cellName(n, c) {
    if (c < 0) return 'pass';
    return String.fromCharCode(97 + (c % n)) + (((c / n) | 0) + 1);
  }

  function describeRules(r) {
    r = normalizeRules(r);
    const label = (k) => (OPTIONS[k].find((o) => o[0] === r[k]) || ['', r[k]])[1];
    const parts = [r.size + '×' + r.size, 'start: ' + label('start'), 'place: ' + label('placement'),
      'lines: ' + label('lineDirs') + ', ' + label('lineBlock').toLowerCase() + (r.maxGap ? ', gap ≤ ' + r.maxGap : ''),
      'fill: ' + label('fill'), 'stuck: ' + label('noMove'), label('goal')];
    if (r.holes !== 'none') parts.push(label('holes'));
    if (r.komi) parts.push('komi ' + r.komi);
    return parts.join(' · ');
  }

  return {
    DEFAULT_RULES, OPTIONS, PASS, normalizeRules, geometry, startPosition, boardToString,
    newGame, fromPosition, clone, legalCells, hasLegal, linesAt, fillSize, potential, survey,
    buildMove, moveAt, genMoves, play, undo, isSettled, settledMove, finishSettled, margin, utility, winner, cellName, describeRules,
  };
}

if (typeof module !== 'undefined' && module.exports) module.exports = EngineModule;
