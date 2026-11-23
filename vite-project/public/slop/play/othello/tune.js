/*
 * Paper Othello — evaluator tuner (the Tune tab, and experiments/tune-cli.js).
 *
 * Self-improvement by SPSA: each step nudges every tunable weight up or down at random, giving two
 * evaluators θ+ and θ−, lets each play the same seeded colour-swapped pairs of games against a FIELD of other bots
 * (Default, Accountant, Forker, Tuned-8×8, Stones-only at the same depth), and moves θ toward whichever scored more.
 * (`train: 'self'`: θ+ plays θ− instead, the original self-play.) Every few steps the current θ plays the bot it started
 * from (or a fixed ladder panel) at the same depth, and the score is turned into an Elo difference.
 *
 * Why the field (results/31): self-play rewards beating near-copies of yourself. On 7×7 that still generalised, but on
 * the 5×5 guide game it drifted: 30 s of self-play from 1-move openings ended ~875 on the ladder, below the untuned
 * bot's 943; the field run reached 1045 (19-bot panel, ±14).
 *
 * Minimax weights can change over the game (`key@end`, see bots.js): with `phased` on, every tuned weight gets an
 * end-of-game twin (an option: no measurable gain). Regression fits to game results did not make stronger bots
 * (+3…+43); bigger nudges or step sizes made it worse. Pair jobs are marked `lite`, so the page's workers play them on
 * the fast engine (fast.js) whenever both bots are supported: the same games, ~5× faster.
 *
 * Weights are tuned for one ruleset. `rulesKey` gives a canonical key, so the same rules entered again
 * (in any order, or after a page reload) find their earlier session and saved bots.
 *
 * Reading a run (results/32): the weights alone top out within a minute or two. The training score (θ± against the
 * field) climbs and then flattens; past that, more time mostly moves weights along directions the field can't tell
 * apart. So every check now replays the SAME openings (checkSeed), the training score is kept per check
 * (noteTrain/takeTrain), `levelled` says when it has stopped rising, and `afterCheck` remembers the best checkpoint
 * (smoothed over three checks) to go back to. For more than the weights can give: the "threat kept after a block"
 * variables (bots.js keptThreat) and quiescence search (`qDepth`/`qMin`, carried by sessions, specs and saved bots).
 *
 * Pattern tables (results/33) are a different kind of bot: hundreds of thousands of entries learned by self-play
 * (TD(lambda), the fast engine's tdTrain), not a handful of weights nudged by SPSA. Their start ('patterns', family
 * `td`) keeps its table outside the session's weights: the page trains float weights in its workers and stores the
 * int8 table in sess.patterns at every check (B.encodeTable form); playSpec names it by sess.tableId.
 *
 * Pure functions only; whoever drives it (page or CLI) plays the games. Self-contained like engine.js.
 */
function TunerModule(E, B) {
  'use strict';

  /* ---------- ruleset identity ---------- */

  // Every rule in a fixed order; the custom start only counts when it is in use.
  function rulesKey(rules) {
    const r = E.normalizeRules(rules), o = {};
    for (const k of Object.keys(E.DEFAULT_RULES).sort()) {
      if (k === 'customStart') {
        if (r.start === 'custom' && r.customStart) {
          const c = r.customStart;
          o[k] = { size: c.size, cells: c.cells, first: c.first || 1 };
        }
        continue;
      }
      o[k] = r[k];
    }
    return JSON.stringify(o);
  }

  // Short, stable label for a key (FNV-1a), for display only.
  function shortId(key) {
    let h = 0x811c9dc5;
    for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return ('00000' + (h >>> 0).toString(36)).slice(-5);
  }

  // The other way: every ruleset whose id is `id`, found by trying every combination of the menu rules (no custom
  // start) with boards 3–14, longest gap 0–6 and komi −5…5 in halves (~11M rulesets, ~0.3 s). FNV runs left to right
  // over the key, so each prefix is hashed once. Ids are 5 base-36 characters (~60M values), so an id from outside
  // this range finds nothing and about one id in five also matches a second, unrelated ruleset: callers check the
  // rulesets they already know first and let the user pick when several come back.
  function findRules(id) {
    id = String(id || '').trim().toLowerCase();
    if (!/^[0-9a-z]{5}$/.test(id)) return [];
    const range = (n, f) => Array.from({ length: n }, (_, i) => f(i));
    const keys = Object.keys(E.DEFAULT_RULES).sort().filter((k) => k !== 'customStart');
    const doms = keys.map((k) => E.OPTIONS[k] ? E.OPTIONS[k].map((o) => o[0]).filter((v) => v !== 'custom')
      : k === 'size' ? range(12, (i) => i + 3) : k === 'maxGap' ? range(7, (i) => i) : k === 'komi' ? range(21, (i) => (i - 10) / 2)
      : [E.DEFAULT_RULES[k]]);
    const last = keys.length - 1, codes = keys.map((k, i) => doms[i].map((v) =>
      Array.from((i ? ',' : '{') + JSON.stringify(k) + ':' + JSON.stringify(v) + (i === last ? '}' : ''), (c) => c.charCodeAt(0))));
    const target = parseInt(id, 36), pick = new Array(keys.length), out = [];
    (function walk(i, h0) {
      for (let j = 0; j < codes[i].length; j++) {
        let h = h0;
        const c = codes[i][j];
        for (let a = 0; a < c.length; a++) { h ^= c[a]; h = Math.imul(h, 0x01000193); }
        pick[i] = j;
        if (i < last) walk(i + 1, h);
        else if ((h >>> 0) % 60466176 === target) {
          const r = {};
          keys.forEach((k, a) => { r[k] = doms[a][pick[a]]; });
          out.push(E.normalizeRules(r));
        }
      }
    })(0, 0x811c9dc5);
    return out.filter((r) => shortId(rulesKey(r)) === id);
  }

  /* ---------- SPSA ---------- */

  // Size of one nudge per weight, chosen so a nudge moves a typical position's estimate by ~½ stone.
  // An end-of-game weight (`key@end`) is nudged like its key.
  const SCALE = {
    material: 0.1, myBest: 0.1, mySecond: 0.1, oppBest: 0.1, oppSecond: 0.1, space: 0.05, latent: 0.03,
    parity: 0.5, mobility: 0.05, threats: 0.2, edge: 0.05, corner: 0.2, frontier: 0.05,
    privGaps: 0.2, sharedOdd: 0.25, crossings: 0.1, myKept: 0.1, oppKept: 0.1,
  };
  const KEYS = Object.keys(B.DEFAULT_WEIGHTS);
  const baseKey = (k) => k.replace(/@end$/, '');
  const isEnd = (k) => /@end$/.test(k);
  // The Accountant predicts extra stones, so its nudges are in the same ½-stone spirit.
  const ACCT_SCALE = {
    bias: 0.25, parity: 0.25, myBest: 0.1, mySecond: 0.1, oppBest: 0.1, oppSecond: 0.1, mobility: 0.05, space: 0.05,
    latent: 0.03, threats: 0.2, privGaps: 0.2, sharedOdd: 0.25, crossings: 0.1, myKept: 0.1, oppKept: 0.1,
  };

  /* ---------- what can be tuned ---------- */
  // A family is a set of weights and how to play with them; a start is a bot to begin tuning from.
  // `type` is the bot type that plays the weights; `base` is the untouched bot, used as the "started from" yardstick.
  // `phase`: the family's weights may change over the game (Minimax only).
  // `optIn`: weights a new run leaves unticked. The "threat kept after a block" pair costs 2–8× the search time once
  // non-zero and gained nothing measurable on ysbvl (results/32), so it is there to try, not on by default.
  const OPT_IN = ['myKept', 'oppKept'];
  const FAMILIES = {
    minimax: { keys: KEYS, scale: SCALE, info: B.FEATURE_INFO, hold: ['material'], defaults: B.DEFAULT_WEIGHTS, phase: true, optIn: OPT_IN },
    accountant: { keys: B.ACCT_KEYS, scale: ACCT_SCALE, info: B.ACCT_INFO, hold: [], defaults: B.ACCT_DEFAULT, phase: false, optIn: OPT_IN },
    // learned by TD self-play in the workers (see the top of this file); no weights for SPSA
    patterns: { keys: [], scale: {}, info: [], hold: [], defaults: {}, phase: false, optIn: [], td: true },
  };
  // The weights a new run tunes unless told otherwise.
  const defaultTune = (fam) => fam.keys.filter((k) => !fam.hold.includes(k) && !fam.optIn.includes(k));
  const STARTS = [
    { id: 'default', name: 'Minimax (Default)', family: 'minimax', type: 'minimax', base: { type: 'minimax' },
      idea: 'The default evaluator: stones banked plus fill threats.' },
    { id: 'classic', name: 'Classic (Othello wisdom)', family: 'minimax', type: 'minimax', base: { type: 'classic' }, preset: 'classic',
      idea: 'Minimax with Othello-player weights (corners, edges, mobility), no idea of fills.' },
    { id: 'forker', name: 'Forker', family: 'minimax', type: 'minimax', base: { type: 'forker' }, preset: 'forker',
      idea: 'Minimax that prizes fork cells and backup threats.' },
    { id: 'tuned8', name: 'Tuned (8×8 weights)', family: 'minimax', type: 'minimax', base: { type: 'tuned8' }, preset: 'tuned8',
      idea: 'Minimax with the SPSA weights found on 8×8 at look-ahead 2.' },
    { id: 'accountant', name: 'Accountant', family: 'accountant', type: 'accountant', base: { type: 'accountant' },
      idea: 'Predicts the extra stones still to come from lone gaps, crossings and threats, snapped to the right parity.' },
    { id: 'closer', name: 'Closer', family: 'minimax', type: 'closer', base: { type: 'closer' },
      idea: 'Minimax weights until 12 cells are left, then exact play. Slower: the endgame is solved every move.' },
    { id: 'patterns', name: 'Patterns (learned tables)', family: 'patterns', type: 'patterns', base: { type: 'patterns' },
      idea: 'Values every 3×3 neighbourhood and every 6-cell row, column and diagonal from a table learned by playing itself, looks 2 moves ahead and 3 more while fills are on offer. Tuning keeps it playing itself on these rules.' },
  ];
  const startById = (id) => STARTS.find((x) => x.id === id) || STARTS[0];
  const familyOf = (id) => FAMILIES[startById(id).family];
  function startWeights(id) {
    const st = startById(id);
    return Object.assign({}, FAMILIES[st.family].defaults, st.preset ? B.PRESETS[st.preset] : {});
  }
  // Opponents for the progress check: the bot the run started from, or any search bot at the same look-ahead.
  const VERSUS = [
    { id: 'ladder', name: 'A panel of ladder bots around its level' },
    { id: 'start', name: 'the bot it started from' },
    { id: 'minimax', name: 'Minimax (Default)' }, { id: 'accountant', name: 'Accountant' }, { id: 'classic', name: 'Classic' },
    { id: 'forker', name: 'Forker' }, { id: 'tuned8', name: 'Tuned (8×8)' }, { id: 'material', name: 'Minimax (stones only)' },
    { id: 'closer', name: 'Closer' },
  ];
  function versusSpec(sess, depth) {
    const vs = sess.vs || 'minimax';
    const base = vs === 'start' ? startById(sess.start).base : { type: vs };
    return Object.assign({}, base, { depth: depth || sess.vsDepth || sess.depth });
  }
  function versusName(sess) {
    const vs = sess.vs || 'minimax';
    if (vs === 'ladder') return 'a panel of ladder bots around its level';
    return (vs === 'start' ? startById(sess.start).name : VERSUS.find((v) => v.id === vs).name) + ' d' + (sess.vsDepth || sess.depth);
  }
  // Ladder checks. The first guess is the ladder rating of the untouched starting bot at this depth if the pool has it,
  // else Default at the nearest depth; after that, the previous check's fit. Opponents are the nearest cheap pool bots,
  // alternating above and below the guess, so the fit is anchored on both sides when it can be.
  // A tuning run plays a fixed panel (ladderPanel, 8 bots around its level) and only re-picks it when the bot's rating
  // has moved away: when the mean of its last three ladder checks is more than PANEL_DRIFT from where the panel was
  // centred. Re-picking 4 bots near every single fit made the checks swing by ~300 Elo, because tuned bots are
  // non-transitive (results/31: a 5×5 run read 916 that way; against all 19 cheap pool bots it was 1002, untuned 943);
  // the smoothing and the dead band keep the panel still between real moves, so it follows the bot without churning.
  function ladderGuess(l, sess) {
    if (typeof sess.ladderElo === 'number' && sess.ladderId === l.id) return sess.ladderElo;
    const base = startById(sess.start).base;
    const same = l.bots.find((b) => b.spec && b.spec.type === base.type && (b.spec.depth || 0) === sess.depth);
    if (same) return same.elo;
    const ds = l.bots.filter((b) => /^d\d$/.test(b.id));
    if (ds.length) return ds.reduce((a, b) => (Math.abs(+b.id.slice(1) - sess.depth) < Math.abs(+a.id.slice(1) - sess.depth) ? b : a)).elo;
    return 0;
  }
  function ladderOpponents(l, guess, slow, count) {
    const pool = l.bots.filter((b) => b.spec && !(slow && slow.has(b.id)));
    const above = pool.filter((b) => b.elo >= guess).sort((a, b) => a.elo - b.elo);
    const below = pool.filter((b) => b.elo < guess).sort((a, b) => b.elo - a.elo);
    const out = [];
    let i = 0, j = 0;
    while (out.length < (count || 4) && (i < above.length || j < below.length)) {
      if (i < above.length && (out.length % 2 === 0 || j >= below.length)) out.push(above[i++]); else out.push(below[j++]);
    }
    return out;
  }

  const PANEL = 8, PANEL_DRIFT = 40;
  function ladderCentre(l, sess) {
    const pts = (sess.history || []).filter((p) => p.kind === 'ladder' && p.ladder === l.id).slice(-3);
    return pts.length ? pts.reduce((a, p) => a + p.elo, 0) / pts.length : ladderGuess(l, sess);
  }
  function ladderPanel(l, sess, slow) {
    const centre = ladderCentre(l, sess);
    if (sess.panel && sess.panelLadder === l.id && typeof sess.panelAt !== 'number') { // runs from before the panel could move
      const bots = sess.panel.map((id) => l.bots.find((b) => b.id === id)).filter(Boolean);
      sess.panelAt = bots.length ? bots.reduce((a, b) => a + b.elo, 0) / bots.length : centre;
    }
    if (!sess.panel || sess.panelLadder !== l.id || Math.abs(centre - sess.panelAt) > PANEL_DRIFT) {
      sess.panel = ladderOpponents(l, centre, slow, PANEL).map((b) => b.id);
      sess.panelLadder = l.id;
      sess.panelAt = centre;
    }
    return sess.panel.map((id) => l.bots.find((b) => b.id === id)).filter(Boolean);
  }

  // The spec a set of weights plays as (also used for saved bots: { start, weights, depth }).
  // `src` (a session or a saved bot) may carry quiescence settings: qDepth > 0 plays on through big fills at the horizon.
  function playSpec(startId, weights, depth, name, src) {
    const st = startById(startId), fam = FAMILIES[st.family];
    if (st.type === 'patterns') { // its table: the session's (tableId), a saved bot's (bot:<id>) or the shipped one
      const table = (src && src.tableId) || (src && src.patterns && src.id ? 'bot:' + src.id : 'mix');
      const sp = { type: 'patterns', depth, table, name, qDepth: src && src.qDepth !== undefined ? src.qDepth | 0 : 3 };
      if (src && src.qMin !== undefined) sp.qMin = +src.qMin;
      if (src && src.endAt > 0) sp.endAt = src.endAt | 0;
      return sp;
    }
    const sp = { type: st.type, depth, weights: Object.assign({}, fam.defaults, weights), name };
    if (src && src.qDepth > 0) { sp.qDepth = src.qDepth | 0; sp.qMin = src.qMin === undefined ? 1 : +src.qMin; }
    if (src && src.endAt > 0) sp.endAt = src.endAt | 0; // perfect endgame (results/38)
    return sp;
  }
  // Quiescence and perfect-endgame settings as a label (B.qLabel, B.endLabel): '' when both are off.
  const searchLabel = (src) => (src ? (B.qLabel({ qDepth: src.qDepth, qMin: src.qMin }) + B.endLabel({ endAt: src.endAt })).trim() : '');

  // gain 0.4 / 16 pairs: +44 Elo [+25, +63] over the default evaluator in 4 minutes on 8×8, depth 2
  // (experiments/results/22-tuner-spsa.txt). gain 2 was a random walk: no gain after 6,400 games.
  // On the fast engine (results/31): gain 1 or nudges ×2 halved the gain; 32–48 pairs and a slower decay were a little
  // better than 16 / 150; a 200-pair check is good to about ±35 Elo (the old 50-pair one to ±70).
  // Start/end-of-game weights (`phased`) looked good in a first comparison but that one also changed the settings above;
  // like for like through this loop they did not help (ysbvl d2 +54/+79 on vs +78/+71 off, d3 +50 vs +69), so they are
  // an option, off by default.
  // qDepth/qMin: quiescence for the tuned bot (0 = off; see bots.js search). The field and check opponents never use it.
  // endAt: perfect play once that many cells are left (bots.js endSolve, results/38): +50–70 Elo for the Accountant on
  // ysbvl, about +10 for Patterns. Checks, saved bots and games use it; training steps don't (each game would cost
  // 20–50× more, and the weights don't matter once the solver takes over). Sessions from before it have none (off).
  const DEFAULTS = { depth: 2, pairs: 32, opening: 4, gain: 0.4, checkEvery: 100, checkPairs: 200, stepDecay: 1000, phased: false, train: 'field',
    qDepth: 0, qMin: 1, endAt: 16 };
  // The field a 'field' run trains against (same depth as the tuned bot); all run on the fast engine.
  const FIELD = ['minimax', 'accountant', 'forker', 'tuned8', 'material'];
  // A new run's settings for a start (DEFAULTS, plus the pattern bot's own: it searches with 3 plies of quiescence).
  const draftFor = (startId) => Object.assign({}, DEFAULTS, familyOf(startId).td ? { qDepth: 3, checkEvery: 10 } : {});
  // Pattern training (TD self-play, per worker per step): where the table starts ('mix' = the shipped table, 'blank'
  // = all zeros), games, learning rate (shrinking as the run goes on), trace decay, share of random moves.
  // The shipped table: 1-ply TD, 1M games/min natively, flat after about a minute (results/33).
  const TD = { from: 'mix', games: 600, alpha: 0.03, lambda: 0.7, eps: 0.05, shapes: 'sq3,lo6,ld6', stages: 6 };
  const tdAlpha = (sess) => Math.max(sess.td.alpha / 5, sess.td.alpha / Math.sqrt(1 + sess.iter / 50));
  const TRAIN = [
    { id: 'field', name: 'Other bots: Default, Accountant, Forker, Tuned 8×8, Stones-only (recommended)' },
    { id: 'self', name: 'Itself: the nudged-up copy against the nudged-down copy (self-play)' },
  ];

  // The weights a session tunes: the family's keys minus the held ones (stones are banked: they stay the unit), each
  // with its end-of-game twin when the session is phased.
  function tunedKeys(fam, base, phased) {
    return phased && fam.phase ? base.flatMap((k) => [k, k + '@end']) : base.slice();
  }
  const endOf = (w, k) => (k + '@end' in w ? w[k + '@end'] : w[k]);

  // opts.start picks the starting bot (default 'default'); weights, if given, replace its weights.
  // opts.tune lists the base keys to tune (their @end twins follow when phased).
  function newSession(weights, opts) {
    const o = Object.assign({}, DEFAULTS, opts || {});
    const start = startById(o.start).id, fam = familyOf(start), w0 = weights || startWeights(start);
    const phased = !!o.phased && fam.phase, theta = {};
    for (const k of fam.keys) theta[k] = typeof w0[k] === 'number' ? w0[k] : fam.defaults[k] || 0;
    if (fam.phase) for (const k of fam.keys) { const e = w0[k + '@end']; if (phased || (typeof e === 'number' && e !== theta[k])) theta[k + '@end'] = typeof e === 'number' ? e : theta[k]; }
    const base = (o.tune ? o.tune.filter((k) => !isEnd(k)) : defaultTune(fam));
    const td = fam.td ? { td: Object.assign({}, TD, o.td || {}), patterns: null, tableId: o.tableId || null } : {};
    return {
      ...td,
      theta, initial: Object.assign({}, theta), start, vs: o.vs || 'start', vsDepth: o.vsDepth || 0, iter: 0, games: 0, seed: (o.seed >>> 0) || 1,
      phased, train: o.train === 'self' ? 'self' : 'field', tune: tunedKeys(fam, base, phased),
      depth: o.depth, pairs: o.pairs, opening: o.opening, gain: o.gain, checkEvery: o.checkEvery,
      checkPairs: o.checkPairs, stepDecay: o.stepDecay, history: [], steps: [],
      qDepth: Math.max(0, o.qDepth | 0), qMin: o.qMin === undefined ? 1 : +o.qMin, endAt: Math.max(0, o.endAt | 0),
    };
  }
  // Ticking a weight on or off in the table: its end-of-game twin follows.
  function setTuned(sess, k, on) {
    const fam = familyOf(sess.start), keys = sess.phased && fam.phase ? [k, k + '@end'] : [k];
    for (const x of keys) { const i = sess.tune.indexOf(x); if (on && i < 0) sess.tune.push(x); if (!on && i >= 0) sess.tune.splice(i, 1); }
    if (on && sess.phased && !(k + '@end' in sess.theta)) sess.theta[k + '@end'] = sess.theta[k];
  }
  // Switching phases on mid-run: every tuned weight gets a twin, back at its old end value if it had one (sess.ends),
  // else at its current value. Off: the twins leave the weights (kept aside in sess.ends) and each weight keeps its
  // start-of-game value.
  function setPhased(sess, on) {
    const fam = familyOf(sess.start);
    if (!fam.phase || !!sess.phased === !!on) return;
    sess.phased = !!on;
    const base = sess.tune.filter((k) => !isEnd(k));
    if (on) {
      for (const k of base) if (!(k + '@end' in sess.theta)) sess.theta[k + '@end'] = sess.ends && k + '@end' in sess.ends ? sess.ends[k + '@end'] : sess.theta[k];
      delete sess.ends;
    } else {
      sess.ends = {};
      for (const k of Object.keys(sess.theta)) if (isEnd(k)) { sess.ends[k] = sess.theta[k]; delete sess.theta[k]; }
    }
    sess.tune = tunedKeys(fam, base, sess.phased);
  }

  // Standard SPSA schedules: the step shrinks as the run goes on, the nudge shrinks much more slowly.
  function schedule(sess) {
    const k = sess.iter;
    return { a: sess.gain / Math.pow(1 + k / sess.stepDecay, 0.602), c: 1 / Math.pow(1 + k / 50, 0.101) };
  }

  const scaleOf = (sess) => familyOf(sess.start).scale;
  const nudge = (sc, k) => sc[baseKey(k)] || 0.05;

  function propose(sess, rnd) {
    const { c } = schedule(sess), delta = {}, plus = Object.assign({}, sess.theta), minus = Object.assign({}, sess.theta);
    for (const k of sess.tune) {
      if (!(k in sess.theta)) sess.theta[k] = isEnd(k) ? sess.theta[baseKey(k)] || 0 : 0;
      const d = rnd() < 0.5 ? -1 : 1, h = c * nudge(scaleOf(sess), k);
      delta[k] = d;
      plus[k] = sess.theta[k] + d * h;
      minus[k] = sess.theta[k] - d * h;
    }
    return { delta, plus, minus };
  }

  // r = mean result of θ+ against θ− per game, in [-1, 1].
  function update(sess, delta, r) {
    const { a, c } = schedule(sess);
    const sc = scaleOf(sess);
    for (const k in delta) sess.theta[k] += a * c * nudge(sc, k) * r * delta[k];
    sess.iter++;
    sess.steps.push(+r.toFixed(4));
    if (sess.steps.length > 400) sess.steps.shift();
  }

  /* ---------- games ---------- */

  // spec(weights, depth) plays plain Minimax (older callers); sessSpec plays the session's own bot type.
  const spec = (weights, depth, name) => ({ type: 'minimax', depth, weights, name });
  const sessSpec = (sess, weights) => playSpec(sess.start, weights, sess.depth, undefined, sess);

  // One job per pair: the same seed twice, colours swapped, so both games share the random opening.
  // `lite`: only the winners are needed, so a worker may play it on the fast engine.
  // perJob > 1 groups several pairs into one job (fewer messages; points then come per group).
  function pairJobs(rules, specA, specB, seeds, opening, perJob) {
    const k = Math.max(1, perJob | 0 || 1), out = [];
    for (let i = 0; i < seeds.length; i += k) {
      const ss = [];
      for (const x of seeds.slice(i, i + k)) ss.push(x, x);
      out.push({ rules, botA: specA, botB: specB, seeds: ss, alternate: true, indexBase: 0, openingPlies: opening, lite: true });
    }
    return out;
  }

  // One SPSA step's games. 'self': θ+ vs θ−. 'field': θ+ and θ− each play the same seeded pairs against every field bot.
  // Returns { jobs, games, signal(pts) } where pts[i] = bot A's points in jobs[i]; signal is r in [-1, 1].
  function stepJobs(sess, rules, p, seedBase, workers) {
    const train = (sp) => { delete sp.endAt; return sp; }; // training games skip the perfect endgame (see DEFAULTS)
    const plus = train(sessSpec(sess, p.plus)), minus = train(sessSpec(sess, p.minus)), w = Math.max(1, workers | 0 || 1);
    const seeds = (n, b) => Array.from({ length: n }, (_, j) => (b + j) >>> 0);
    if (sess.train === 'self') {
      const jobs = pairJobs(rules, plus, minus, seeds(sess.pairs, seedBase), sess.opening, Math.ceil(sess.pairs / w)), n = 2 * sess.pairs;
      return { jobs, games: n, signal: (pts) => (2 * pts.reduce((a, x) => a + x, 0) - n) / n, score: () => null };
    }
    const per = Math.max(1, Math.ceil(sess.pairs / FIELD.length)), jobs = [], side = [];
    FIELD.forEach((t, i) => {
      const f = { type: t, depth: sess.depth }, ss = seeds(per, seedBase + i * 7919);
      for (const j of pairJobs(rules, plus, f, ss, sess.opening, per)) { jobs.push(j); side.push(1); }
      for (const j of pairJobs(rules, minus, f, ss, sess.opening, per)) { jobs.push(j); side.push(-1); }
    });
    const n = 2 * per * FIELD.length;
    // score: the training score, θ+ and θ− together against the field (0..1), i.e. how the current weights do there.
    return { jobs, games: 2 * n, signal: (pts) => pts.reduce((a, x, i) => a + side[i] * x, 0) / n,
      score: (pts) => pts.reduce((a, x) => a + x, 0) / (2 * n) };
  }

  /* ---------- reading a run (results/32) ---------- */

  // Checks replay the same openings every time (seeds from the session, not the step), so two checks differ only
  // because the weights did. The set itself is a sample (200 pairs ≈ ±35 Elo against the truth), but that error is
  // the same at every check, so the shape of the curve is real.
  const checkSeed = (sess) => (sess.seed * 7 + 5e8) >>> 0;

  // Training score: what SPSA itself optimises, averaged over the steps since the last check.
  function noteTrain(sess, score, games) {
    if (score === null || score === undefined || !(games > 0)) return;
    const t = sess.trainAcc || (sess.trainAcc = { s: 0, n: 0 });
    t.s += score * games; t.n += games;
  }
  function takeTrain(sess) {
    const t = sess.trainAcc;
    delete sess.trainAcc;
    return t && t.n ? t.s / t.n : null;
  }

  // Which checks can be compared with each other: the same opponent(s), measured the same way.
  const measureKey = (pt) => (pt.kind === 'ladder' ? 'ladder:' + pt.ladder : 'vs:' + (pt.vs || ''));

  // After a check has been pushed onto sess.history: store its training score and weights, and update the best
  // checkpoint. "Best" is the middle of three neighbouring checks with the highest mean (a single lucky check doesn't
  // win). Only the last two checks keep their weights (that is all the next update needs), plus sess.best.
  function afterCheck(sess, pt) {
    pt.fixed = true;
    pt.theta = Object.fromEntries(Object.entries(sess.theta).map(([k, v]) => [k, +v.toFixed(5)]));
    const h = sess.history, n = h.length, key = measureKey(pt);
    if (sess.best && sess.best.key !== key) delete sess.best; // a different yardstick: start afresh
    if (n >= 3) {
      const tri = h.slice(n - 3);
      if (tri.every((q) => q.fixed && q.theta && measureKey(q) === key)) {
        const mean = (tri[0].elo + tri[1].elo + tri[2].elo) / 3;
        if (!sess.best || mean > sess.best.elo) sess.best = { iter: tri[1].iter, elo: mean, theta: tri[1].theta, key };
      }
    }
    for (let i = 0; i < n - 2; i++) delete h[i].theta;
  }
  // The smoothed value of the latest checks (same yardstick as sess.best), for comparing with the best one.
  function recentMean(sess) {
    const h = sess.history, last = h[h.length - 1];
    if (!last) return null;
    const tri = h.slice(-3).filter((q) => measureKey(q) === measureKey(last));
    return tri.reduce((a, q) => a + q.elo, 0) / tri.length;
  }
  // Whether the best checkpoint is worth going back to: clearly better than where the run is now.
  function bestWorthIt(sess) {
    const m = recentMean(sess);
    return !!(sess.best && m !== null && sess.best.iter < sess.iter && sess.best.elo - m >= 10);
  }
  // Back to the best checkpoint's weights (the step count and schedule carry on). The next check measures them.
  function goBack(sess) {
    if (!sess.best) return false;
    for (const k of Object.keys(sess.best.theta)) sess.theta[k] = sess.best.theta[k];
    sess.recheck = true;
    return true;
  }

  // Has the training score stopped rising? Compares the mean of the last five checks' training scores with the five
  // before. Returns { since, now, before } (since = the step the flat stretch began) or null (still rising, or too few).
  function levelled(history) {
    const pts = history.filter((p) => typeof p.train === 'number');
    if (pts.length < 10) return null;
    const avg = (a) => a.reduce((x, p) => x + p.train, 0) / a.length;
    const now = avg(pts.slice(-5)), before = avg(pts.slice(-10, -5));
    return now - before < 0.003 ? { since: pts[pts.length - 10].iter, now, before } : null;
  }

  // Cross-check jobs: weights (from any ruleset or look-ahead) against an opponent at each listed look-ahead, on these
  // rules. specAt(depth) / vsAt(depth) make the two specs. Returns { jobs, owner } (owner[i] = index into depths).
  function crossJobs(rules, specAt, vsAt, depths, pairsEach, opening, seedBase) {
    const jobs = [], owner = [];
    depths.forEach((d, i) => {
      const seeds = Array.from({ length: pairsEach }, (_, j) => (seedBase + i * 104729 + j * 2654435761) >>> 0);
      for (const j of pairJobs(rules, specAt(d), vsAt(d), seeds, opening)) { jobs.push(j); owner.push(i); }
    });
    return { jobs, owner };
  }
  // Look-aheads typed as "1-4" or "2, 3, 5" (1..8).
  function parseDepths(text) {
    const out = new Set();
    for (const part of String(text).split(/[\s,]+/)) {
      const m = part.match(/^(\d)(?:-(\d))?$/);
      if (!m) continue;
      const a = +m[1], b = m[2] ? +m[2] : a;
      for (let d = Math.min(a, b); d <= Math.max(a, b); d++) if (d >= 1 && d <= 8) out.add(d);
    }
    return [...out].sort((x, y) => x - y);
  }

  // Points for bot A in a list of games (win 1, draw ½).
  function points(games) {
    let p = 0;
    for (const g of games) p += g.winner === 0 ? 0.5 : (g.winner === 1) === g.aIsX ? 1 : 0;
    return p;
  }

  /* ---------- Elo ---------- */

  const toElo = (s) => -400 * Math.log10(1 / s - 1);

  // pairPts: points for A in each pair (0..2). Error bars from the spread of pair results (95%).
  function eloStats(pairPts) {
    const n = pairPts.length;
    if (!n) return null;
    const g = 2 * n, s = pairPts.reduce((a, x) => a + x, 0) / g;
    let v = 0;
    for (const x of pairPts) v += (x / 2 - s) * (x / 2 - s);
    // Floor on the spread: a short run where every pair split 1–1 would otherwise claim ±0.
    const se = Math.max(n > 1 ? Math.sqrt(v / (n - 1) / n) : 0.5, 0.15 / Math.sqrt(n));
    const clamp = (x) => Math.min(1 - 0.5 / g, Math.max(0.5 / g, x)); // a clean sweep is not infinite Elo
    return { elo: toElo(clamp(s)), lo: toElo(clamp(s - 1.96 * se)), hi: toElo(clamp(s + 1.96 * se)), score: s, games: g };
  }

  return { rulesKey, shortId, findRules, SCALE, ACCT_SCALE, KEYS, FAMILIES, STARTS, VERSUS, startById, familyOf, startWeights, versusSpec,
    versusName, draftFor, TD, tdAlpha, ladderGuess, ladderOpponents, ladderPanel, ladderCentre, PANEL, PANEL_DRIFT, FIELD, TRAIN, stepJobs, playSpec, sessSpec, searchLabel, DEFAULTS, newSession, setTuned, setPhased, tunedKeys, endOf, isEnd, baseKey,
    defaultTune, checkSeed, noteTrain, takeTrain, afterCheck, recentMean, bestWorthIt, goBack, levelled, measureKey,
    schedule, propose, update, spec, pairJobs, crossJobs, parseDepths, points, eloStats, toElo };
}

if (typeof module !== 'undefined' && module.exports) module.exports = TunerModule;
