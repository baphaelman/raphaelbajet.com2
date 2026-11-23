/*
 * Paper Othello — lab: plays whole games between bots and summarises them.
 * Shared by the page (inside Web Workers) and by cli.js. Self-contained like engine.js.
 */
function LabModule(E, B) {
  'use strict';

  const BINS = 20; // the lead is sampled at 0%, 5%, … 100% of the board filled

  // One full game. Deterministic for a given seed (as long as no bot uses a time limit).
  function playGame(rules, specX, specO, seed, opts) {
    opts = opts || {};
    const rnd = B.rng(seed), s = E.newGame(rules), specs = [null, specX, specO];
    const N = s.geo.N, moves = [], leadAt = [];
    let passes = 0, placeMoves = 0, fillMoves = 0, maxFill = 0, chances = 0, declined = 0;
    let leadChanges = 0, lastSign = 0, settledAt = -1, opening = opts.openingPlies | 0, guard = 4 * N + 8;
    const mark = () => {
      const filled = N - s.empties, lead = s.count[1] - s.count[2];
      while (leadAt.length <= BINS && filled * BINS >= leadAt.length * N) leadAt.push(lead);
    };
    mark();
    while (!s.over && guard-- > 0) {
      // Once no line can ever be filled again the bots agree to end it: the lone gaps are
      // shared out instantly (E.settledMove) instead of searched for.
      if (settledAt < 0 && E.isSettled(s)) settledAt = moves.length;
      const spec = opening > 0 ? { type: 'random' } : specs[s.turn];
      if (opening > 0) opening--;
      const m = settledAt >= 0 ? E.settledMove(s) : B.chooseMove(s, spec, rnd).move;
      E.play(s, m);
      if (m.cell < 0) { passes++; moves.push([-1]); }
      else {
        const f = m.fills.length;
        placeMoves++;
        if (f) { fillMoves++; if (f > maxFill) maxFill = f; }
        if (m.avail) { chances++; if (f < m.avail) declined++; }
        moves.push([m.cell].concat(m.fills));
      }
      const sign = Math.sign(s.count[1] - s.count[2]);
      if (sign && lastSign && sign !== lastSign) leadChanges++;
      if (sign) lastSign = sign;
      mark();
    }
    while (leadAt.length <= BINS) leadAt.push(s.count[1] - s.count[2]);
    return {
      seed, x: s.count[1], o: s.count[2], empties: s.empties, margin: E.margin(s), winner: E.winner(s),
      plies: moves.length, settledAt, passes, placeMoves, fillMoves, maxFill, chances, declined, leadChanges, leadAt, moves,
    };
  }

  // job: { rules, botA, botB, seeds, alternate, indexBase, openingPlies }
  function runBatch(job) {
    const games = [];
    for (let i = 0; i < job.seeds.length; i++) {
      const swap = !!job.alternate && ((job.indexBase + i) & 1) === 1;
      const g = playGame(job.rules, swap ? job.botB : job.botA, swap ? job.botA : job.botB, job.seeds[i], job);
      g.aIsX = !swap;
      g.index = job.indexBase + i;
      games.push(g);
    }
    return games;
  }

  function quantile(sorted, q) {
    if (!sorted.length) return 0;
    const i = (sorted.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
  }

  function summarize(games, rules) {
    rules = E.normalizeRules(rules);
    const n = games.length, N = rules.size * rules.size, start = E.startPosition(rules);
    const out = {
      n, xWins: 0, oWins: 0, draws: 0, aWins: 0, bWins: 0, meanMargin: 0, meanAbsMargin: 0,
      meanTurns: 0, minTurns: Infinity, maxTurns: 0, medianTurns: 0, passes: 0, fillShare: 0, stonesPerTurn: 0,
      meanMaxFill: 0, declineRate: 0, chances: 0, leadChanges: 0, meanEmpties: 0,
      turnCounts: {}, lead: [], xShare: new Array(N).fill(0), emptyShare: new Array(N).fill(0),
      takenAt: new Array(N).fill(0), takenN: new Array(N).fill(0),
    };
    if (!n) return out;
    let place = 0, fills = 0, declined = 0, stones = 0;
    const turns = [];
    for (const g of games) {
      if (g.winner === 1) out.xWins++; else if (g.winner === 2) out.oWins++; else out.draws++;
      if (g.winner) { if ((g.winner === 1) === g.aIsX) out.aWins++; else out.bWins++; }
      out.meanMargin += g.margin; out.meanAbsMargin += Math.abs(g.margin);
      out.meanTurns += g.plies; turns.push(g.plies);
      out.minTurns = Math.min(out.minTurns, g.plies); out.maxTurns = Math.max(out.maxTurns, g.plies);
      out.turnCounts[g.plies] = (out.turnCounts[g.plies] || 0) + 1;
      out.passes += g.passes; place += g.placeMoves; fills += g.fillMoves;
      out.meanMaxFill += g.maxFill; out.chances += g.chances; declined += g.declined;
      out.leadChanges += g.leadChanges; out.meanEmpties += g.empties;
      // Replay the move list to learn who took each cell, and when.
      const owner = Array.from(start.board);
      let p = start.first;
      for (let t = 0; t < g.moves.length; t++) {
        const mv = g.moves[t];
        if (mv[0] >= 0) for (let j = 0; j < mv.length; j++) {
          owner[mv[j]] = p; out.takenAt[mv[j]] += t + 1; out.takenN[mv[j]]++; stones++;
        }
        p = 3 - p;
      }
      for (let c = 0; c < N; c++) { if (owner[c] === 1) out.xShare[c]++; else if (owner[c] === 0) out.emptyShare[c]++; }
    }
    for (const k of ['meanMargin', 'meanAbsMargin', 'meanTurns', 'passes', 'meanMaxFill', 'leadChanges', 'meanEmpties']) out[k] /= n;
    turns.sort((a, b) => a - b);
    out.medianTurns = quantile(turns, 0.5);
    out.fillShare = place ? fills / place : 0;
    out.stonesPerTurn = place ? stones / place : 0;
    out.declineRate = out.chances ? declined / out.chances : 0;
    for (let c = 0; c < N; c++) {
      out.takenAt[c] = out.takenN[c] ? out.takenAt[c] / out.takenN[c] : null;
      const owned = n - out.emptyShare[c];
      out.xShare[c] = owned ? out.xShare[c] / owned : null; // share of finished games where X holds the cell
      out.emptyShare[c] /= n;
    }
    for (let b = 0; b <= BINS; b++) {
      const v = games.map((g) => g.leadAt[b]).sort((x, y) => x - y);
      out.lead.push({ pct: (b * 100) / BINS, q25: quantile(v, 0.25), q50: quantile(v, 0.5), q75: quantile(v, 0.75),
        mean: v.reduce((a, x) => a + x, 0) / n });
    }
    return out;
  }

  // Random starting position with k stones a side. `symmetric` mirrors each X stone
  // into an O stone through the centre, so neither side gets a better shape.
  function randomStart(n, k, symmetric, rnd) {
    const N = n * n, cells = new Array(N).fill('.');
    const free = () => { let c; do { c = (rnd() * N) | 0; } while (cells[c] !== '.'); return c; };
    k = Math.max(1, Math.min(k, (N / 2 - 1) | 0));
    for (let i = 0; i < k; i++) {
      if (symmetric) {
        let c;
        do { c = free(); } while (c === N - 1 - c);
        cells[c] = 'X'; cells[N - 1 - c] = 'O';
      } else { cells[free()] = 'X'; cells[free()] = 'O'; }
    }
    return { size: n, cells: cells.join(''), first: 1 };
  }

  return { BINS, playGame, runBatch, summarize, randomStart, quantile };
}

if (typeof module !== 'undefined' && module.exports) module.exports = LabModule;
