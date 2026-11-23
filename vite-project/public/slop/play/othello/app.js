/* Paper Othello — page logic: board, sandbox, bot panel, and the lab. */
(function () {
  'use strict';

  const E = EngineModule(), B = BotsModule(E), Lab = LabModule(E, B), T = TunerModule(E, B), Lad = LadderModule(E, B);
  const LDATA = typeof LADDER_DATA !== 'undefined' ? LADDER_DATA : {}; // ladder-data.js, made by experiments/royale.js
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = (v, d) => Number(v).toLocaleString(undefined, { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 });
  const pct = (v) => Math.round(v * 100) + '%';
  const signed = (v, d) => (v > 0 ? '+' : v < 0 ? '−' : '') + fmt(Math.abs(v), d === undefined ? 1 : d);
  const NAME = ['', 'X', 'O'];
  const clampInt = (v, lo, hi, def) => { v = Math.round(+v); return isFinite(v) ? Math.max(lo, Math.min(hi, v)) : def; };

  /* ---------- saved settings ---------- */
  const KEY = 'paper-othello-v1';
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { saved = {}; }
  const pickKeys = (src, shape) => { const o = {}; for (const k in shape) o[k] = src && typeof src[k] === typeof shape[k] ? src[k] : shape[k]; return o; };

  const state = {
    rules: E.normalizeRules(saved.rules),
    players: { 1: Object.assign({ type: 'human' }, saved.players && saved.players[1]), 2: Object.assign({ type: 'minimax', depth: 4 }, saved.players && saved.players[2]) },
    // the Minimax weights, with any end-of-game weights (key@end) a tuned bot brought along
    weights: Object.assign(pickKeys(saved.weights, B.DEFAULT_WEIGHTS), Object.fromEntries(B.KEYS.filter((k) => saved.weights && typeof saved.weights[k + '@end'] === 'number').map((k) => [k + '@end', saved.weights[k + '@end']]))),
    opts: pickKeys(saved.opts, { hints: true, manual: false, speed: 450, showScores: false, scoreDepth: 3 }),
    lab: Object.assign({ botA: { type: 'minimax', depth: 2 }, botB: { type: 'minimax', depth: 2 }, games: 200, opening: 4,
      alternate: true, mode: 'match', sweepParam: 'size', stones: 2, count: 20, sym: true, presets: true }, saved.lab),
    base: null, history: [], game: null, legal: [], token: 0, timer: 0,
    sandbox: false, brush: 1, pending: null, paused: false, thinking: false, scores: null, lastInfo: null,
    run: null, replay: null, rated: null,
  };
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify({ rules: state.rules, players: state.players, weights: state.weights, opts: state.opts, lab: state.lab })); } catch (e) { /* private mode */ }
  }

  /* ---------- workers ---------- */
  // The worker runs the same engine/bot/lab code; it is built from the functions' own source
  // so the page works when opened straight from disk.
  // F is the fast engine (fast.js, WebAssembly) or null. A `lite` job (pairs of games from one seed each, only the
  // winners wanted) goes to it when it can play both bots: the same games, several times faster.
  function WorkerMain(E, B, Lab, F) {
    const pairShaped = (j) => j.alternate && !((j.indexBase | 0) & 1) && j.seeds.length % 2 === 0 && j.seeds.every((x, i) => !(i & 1) || x === j.seeds[i - 1]);
    return function handle(m) {
      // pattern tables this message needs that this worker has not seen (or an older version of): see tablesFor
      if (m.tables) for (const id in m.tables) { const t = B.addTable(id, m.tables[id]); if (F) F.addTable(id, t); }
      if (m.type === 'table') return {};
      // one step of pattern training (TD self-play on the fast engine): the weights after m.games games
      if (m.type === 'td') {
        if (!F) throw new Error('Training pattern tables needs the fast engine (WebAssembly), which this browser did not start.');
        const r = F.tdTrain(m.rules, B.patSet(m.shapes, m.stages), m.w, m);
        return { td: { positions: r.positions, err: r.err, w: r.w } };
      }
      if (m.type === 'batch') {
        const j = m.job;
        if (F && j.lite && pairShaped(j) && F.supports(j.botA) && F.supports(j.botB)) return { games: F.runBatch(j), fast: true };
        return { games: Lab.runBatch(j), fast: false };
      }
      const s = E.fromPosition(m.rules, m.board, m.turn), rnd = B.rng(m.seed || 1);
      if (m.type === 'move') { const r = B.chooseMove(s, m.spec, rnd); return { move: r.move, info: r.info }; }
      if (m.type === 'solve') return B.solve(s, { maxNodes: m.maxNodes });
      if (m.type === 'analyze') return { info: B.search(s, { depth: m.depth, weights: m.weights, fullRoot: true, timeMs: m.timeMs }, rnd).info };
      if (m.type === 'prune') {
        return { a: B.search(s, { depth: m.depth, weights: m.weights }, B.rng(1)).info,
          b: B.search(s, { depth: m.depth, weights: m.weights, prune: false, timeMs: m.timeMs }, B.rng(1)).info };
      }
      return {};
    };
  }
  const handleInline = WorkerMain(E, B, Lab, null); // no fast engine on the page itself (it compiles synchronously)
  let workerUrl = null;
  try {
    const fastSrc = typeof FastModule === 'function' && typeof FAST_WASM === 'string' && typeof WebAssembly === 'object'
      ? `try{F=(${FastModule})(E,B,${JSON.stringify(FAST_WASM)})}catch(e){F=null}` : '';
    const src = `const E=(${EngineModule})();const B=(${BotsModule})(E);const Lab=(${LabModule})(E,B);let F=null;${fastSrc}const handle=(${WorkerMain})(E,B,Lab,F);` +
      'onmessage=function(e){var out;try{out=handle(e.data)}catch(err){out={error:String(err&&err.stack||err)}}out.id=e.data.id;postMessage(out)};';
    workerUrl = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
  } catch (e) { workerUrl = null; }

  /* ---------- pattern tables (B.addTable) ---------- */
  // Every table a bot may play with, by id: 'mix' (the shipped one, patterns-data.js), 'bot:<id>' (a saved bot),
  // 'run:<rules id>' (a Patterns tuning run). Stored form (B.encodeTable) + a version; workers are sent a table with
  // the first message that needs it (Remote.call), and again whenever its version changes.
  const PTAB = {};
  let ptabVer = 0;
  function putTable(id, data) { PTAB[id] = { v: ++ptabVer, data }; return PTAB[id]; }
  function tableEntry(id) {
    if (PTAB[id]) return PTAB[id];
    let data = null;
    if (id === 'mix') data = typeof PATTERNS_DATA !== 'undefined' ? PATTERNS_DATA : null;
    else if (id.startsWith('bot:')) { const f = findBot(id.slice(4)); data = f && f.bot.patterns; }
    else if (id.startsWith('run:')) {
      for (const k in tstore.rulesets) for (const x of Object.values(tstore.rulesets[k].sessions)) if (x.tableId === id && x.patterns) data = x.patterns;
    }
    return data ? putTable(id, data) : null;
  }
  // The tables a worker message needs: [{ id, v, data }].
  function tablesFor(msg) {
    const specs = [msg.spec, msg.job && msg.job.botA, msg.job && msg.job.botB], out = [];
    for (const sp of specs) {
      if (!sp || sp.type !== 'patterns') continue;
      const id = sp.table || 'mix', e = tableEntry(id);
      if (e && !out.some((x) => x.id === id)) out.push({ id, v: e.v, data: e.data });
    }
    return out;
  }
  // The page's own B (no workers, or the Tune tab's pattern pictures): decode a table when it is first needed.
  const pageVer = {};
  function pageTable(id) {
    const e = tableEntry(id);
    if (!e) return null;
    if (pageVer[id] !== e.v) { B.addTable(id, e.data); pageVer[id] = e.v; }
    return B.getTable(id);
  }

  function Remote() { this.w = null; this.jobs = new Map(); this.seq = 0; this.inline = !workerUrl; this.sent = {}; }
  Remote.prototype.runInline = function (id, msg) {
    for (const t of tablesFor(msg)) pageTable(t.id);
    setTimeout(() => {
      let out;
      try { out = handleInline(msg); } catch (err) { out = { error: String(err) }; }
      out.id = id; this.settle(out);
    }, 0);
  };
  Remote.prototype.settle = function (d) {
    const j = this.jobs.get(d.id);
    if (!j) return;
    this.jobs.delete(d.id);
    if (d.error) j.reject(new Error(d.error)); else j.resolve(d);
  };
  Remote.prototype.call = function (msg) {
    return new Promise((resolve, reject) => {
      const id = ++this.seq;
      this.jobs.set(id, { resolve, reject, msg });
      if (!this.w && !this.inline) {
        try {
          this.w = new Worker(workerUrl);
          this.w.onmessage = (e) => this.settle(e.data);
          this.w.onerror = () => { // workers unavailable: fall back to running on the page itself
            this.w = null; this.inline = true; this.sent = {};
            for (const [jid, j] of this.jobs) this.runInline(jid, j.msg);
          };
        } catch (err) { this.inline = true; }
      }
      if (this.w) {
        const send = tablesFor(msg).filter((t) => this.sent[t.id] !== t.v);
        const out = Object.assign({ id }, msg);
        if (send.length) { out.tables = Object.fromEntries(send.map((t) => [t.id, t.data])); for (const t of send) this.sent[t.id] = t.v; }
        this.w.postMessage(out);
      } else this.runInline(id, msg);
    });
  };
  Remote.prototype.cancel = function () {
    if (this.w) { this.w.terminate(); this.w = null; }
    this.sent = {};
    for (const j of this.jobs.values()) j.resolve({ cancelled: true, games: [] });
    this.jobs.clear();
  };

  const botRemote = new Remote(), analysis = new Remote();
  // A set of workers that share out a list of game batches. The Lab, the tuner and bot rating each
  // have their own, so one can run while another is busy (they then split the CPU).
  const makePool = () => ({
    remotes: [], cancelled: false,
    size: Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 1)),
    async run(jobs, onDone) {
      this.cancelled = false;
      let next = 0;
      while (this.remotes.length < this.size) this.remotes.push(new Remote());
      const loop = async (r) => {
        while (!this.cancelled && next < jobs.length) {
          const job = jobs[next++], res = await r.call({ type: 'batch', job });
          if (this.cancelled || res.cancelled) return;
          if (job.lite) this.fast = !!res.fast;
          onDone(job, res.games, res);
        }
      };
      await Promise.all(this.remotes.map(loop));
    },
    cancel() { this.cancelled = true; this.remotes.forEach((r) => r.cancel()); this.remotes = []; },
  });
  const pool = makePool();

  /* ---------- small UI helpers ---------- */
  let toastTimer = 0;
  function toast(text) {
    const t = $('#toast');
    t.textContent = text; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2800);
  }

  const tip = $('#tip');
  document.addEventListener('pointermove', (e) => {
    const t = e.target.closest ? e.target.closest('[data-tip]') : null;
    if (!t) { tip.hidden = true; return; }
    tip.textContent = t.getAttribute('data-tip');
    tip.hidden = false;
    const w = tip.offsetWidth, x = Math.min(window.innerWidth - w - 8, e.clientX + 14);
    tip.style.left = Math.max(8, x) + 'px';
    tip.style.top = (e.clientY + 16 + tip.offsetHeight > window.innerHeight ? e.clientY - tip.offsetHeight - 10 : e.clientY + 16) + 'px';
  });

  function showTab(name) {
    $$('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
    for (const t of ['play', 'puzzles', 'lab', 'tune', 'ladder', 'bots', 'research']) $('#tab-' + t).hidden = t !== name;
    // the puzzles have fixed rules and the research is reading, so the rules panel would only confuse there
    const solo = name === 'puzzles' || name === 'research';
    rulesEl.hidden = solo;
    $('.shell').classList.toggle('solo', solo);
    if (name === 'lab') $('#lab-rules').textContent = 'Now: ' + E.describeRules(state.rules) + '.';
    if (name === 'bots' || name === 'research') renderArts(name);
    if (name === 'tune') renderTune();
    if (name === 'ladder') renderLadder();
    if (name === 'puzzles') renderPuzzle();
  }
  $$('.tabs button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
  $$('[data-goto]').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.goto)));

  // Bot menus also list the saved (tuned) bots: the ones tuned for the current rules first.
  // A saved bot is stored as { type: 'saved', id, depth } and turned into a Minimax spec by resolveSpec.
  const pickers = [];
  function refreshPickers() { for (const p of pickers.splice(0)) botPicker(p.host, p.spec, p.onChange, p.allowHuman); }
  function botPicker(host, spec, onChange, allowHuman) {
    pickers.push({ host, spec, onChange, allowHuman });
    const types = (allowHuman ? [['human', 'Human']] : []).concat(B.BOT_TYPES);
    const here = T.rulesKey(state.rules), mine = [], other = [];
    const recOf = new Map();
    for (const { rec, bot } of allBots()) { (rec.key === here ? mine : other).push(bot); recOf.set(bot.id, rec.key); }
    const opt = (b) => {
      const r = ratingOf(ladderForKey(recOf.get(b.id)), 'saved:' + b.id);
      return `<option value="saved:${esc(b.id)}">${esc(b.name)} (${r ? fmt(r.elo) + ' Elo' : 'unrated'})</option>`;
    };
    if (spec.type === 'saved' && !findBot(spec.id)) Object.assign(spec, { type: 'minimax', id: undefined }); // it was deleted
    host.innerHTML = '<select aria-label="Player type">' + types.map((t) => `<option value="${t[0]}">${t[1]}</option>`).join('') +
      (mine.length ? '<optgroup label="Tuned for these rules">' + mine.map(opt).join('') + '</optgroup>' : '') +
      (other.length ? '<optgroup label="Tuned for other rules">' + other.map(opt).join('') + '</optgroup>' : '') +
      '</select><input type="number" aria-label="Strength" hidden><span class="unit" hidden></span>';
    const sel = $('select', host), inp = $('input', host), unit = $('.unit', host);
    const isDepth = () => B.DEPTH_TYPES.includes(spec.type) || spec.type === 'saved';
    const isPlayouts = () => B.PLAYOUT_TYPES.includes(spec.type);
    const sync = () => {
      sel.value = spec.type === 'saved' ? 'saved:' + spec.id : spec.type;
      inp.hidden = unit.hidden = !(isDepth() || isPlayouts());
      if (isDepth()) { inp.min = 1; inp.max = 8; inp.step = 1; inp.value = spec.depth = spec.depth || 3; unit.textContent = 'moves ahead'; }
      if (isPlayouts()) { inp.min = 50; inp.max = 5000; inp.step = 50; inp.value = spec.playouts = spec.playouts || (spec.type === 'mcts' ? 800 : 300); unit.textContent = 'games per move'; }
    };
    sel.addEventListener('change', () => {
      if (sel.value.startsWith('saved:')) {
        const f = findBot(sel.value.slice(6));
        Object.assign(spec, { type: 'saved', id: f.bot.id, depth: f.bot.depth });
      } else { spec.type = sel.value; delete spec.id; delete spec.name; }
      sync(); onChange();
    });
    inp.addEventListener('change', () => {
      if (isPlayouts()) spec.playouts = clampInt(inp.value, 20, 20000, 300); else spec.depth = clampInt(inp.value, 1, 8, 3);
      delete spec.name;
      sync(); onChange();
    });
    sync();
  }

  /* ---------- drawing a board ---------- */
  const U = 40;
  function markSVG(c, p, n, cls) {
    const x = (c % n) * U, y = ((c / n) | 0) * U, cx = x + U / 2, cy = y + U / 2;
    if (p === 3) return `<rect class="mk hole ${cls || ''}" x="${x + 3}" y="${y + 3}" width="${U - 6}" height="${U - 6}" rx="4"/>`;
    const tilt = (((c * 7919 + p * 31) % 9) - 4) * 1.6; // a little wobble so it looks hand-drawn
    if (p === 1) {
      const a = 11;
      return `<path class="mk x ${cls || ''}" transform="rotate(${tilt} ${cx} ${cy})" d="M${x + a} ${y + a}L${x + U - a} ${y + U - a}M${x + U - a} ${y + a}L${x + a} ${y + U - a}"/>`;
    }
    const w = ((c * 13) % 3) - 1;
    return `<ellipse class="mk o ${cls || ''}" transform="rotate(${tilt * 4} ${cx} ${cy})" cx="${cx}" cy="${cy}" rx="${10.5 + w * 0.6}" ry="${10.5 - w * 0.5}"/>`;
  }

  function boardSVG(n, board, o) {
    o = o || {};
    const W = n * U, L = o.labels ? 16 : 1, N = n * n;
    const cx = (c) => (c % n) * U + U / 2, cy = (c) => ((c / n) | 0) * U + U / 2;
    const cell = (c, cls) => `<rect class="${cls}" x="${(c % n) * U + 1}" y="${((c / n) | 0) * U + 1}" width="${U - 2}" height="${U - 2}" rx="3"/>`;
    let s = `<svg class="bd${o.mini ? ' mini' : ''}" viewBox="${-L} ${-L} ${W + L + 1} ${W + L + 1}" role="img" aria-label="Game board">`;
    s += `<rect class="paper" x="0" y="0" width="${W}" height="${W}"/>`;
    // tinted moves: o.last (the Play tab's last move), plus any extra in o.tints (the Puzzles tab)
    for (const t of (o.tints || []).concat(o.last ? [o.last] : [])) {
      if (!t || t.cell < 0) continue;
      const pc = t.p === 1 ? 'tx' : 'to';
      s += cell(t.cell, 'tint strong ' + pc);
      for (const f of t.fills) s += cell(f, 'tint ' + pc);
    }
    for (let i = 0; i <= n; i++) s += `<path class="gl${i === 0 || i === n ? ' edge' : ''}" d="M${i * U} 0V${W}M0 ${i * U}H${W}"/>`;
    if (o.labels) {
      for (let i = 0; i < n; i++) {
        s += `<text class="lb" x="${i * U + U / 2}" y="-5" text-anchor="middle">${String.fromCharCode(97 + i)}</text>`;
        s += `<text class="lb" x="-5" y="${i * U + U / 2 + 3}" text-anchor="end">${i + 1}</text>`;
      }
    }
    for (let c = 0; c < N; c++) if (board[c]) s += markSVG(c, board[c], n);
    const busy = new Set();
    if (o.pending) {
      const pd = o.pending;
      busy.add(pd.cell);
      s += markSVG(pd.cell, o.mover, n, 'pend');
      s += `<circle class="ring" cx="${cx(pd.cell)}" cy="${cy(pd.cell)}" r="17"/>`;
      pd.lines.forEach((line, i) => line.forEach((f) => { busy.add(f); s += markSVG(f, o.mover, n, 'pend' + (pd.on[i] ? '' : ' off')); }));
    }
    if (o.legal) {
      for (const c of o.legal) {
        if (busy.has(c)) continue;
        const sc = o.scores && o.scores.get(c), hint = o.hints && o.hints.get(c);
        if (sc) s += `<text class="hint sc${sc.best ? ' best' : ''}" x="${cx(c)}" y="${cy(c) + 4}" text-anchor="middle">${sc.text}</text>`;
        else if (hint) s += `<text class="hint" x="${cx(c)}" y="${cy(c) + 4}" text-anchor="middle">${hint}</text>`;
        else s += `<circle class="dot ${o.mover === 1 ? 'x' : 'o'}" cx="${cx(c)}" cy="${cy(c)}" r="2.8"/>`;
      }
    }
    s += '<g class="ghost"></g>';
    if (o.interactive) {
      const can = o.clickable === 'all' ? null : new Set(o.clickable || []);
      for (let c = 0; c < N; c++) {
        s += `<rect class="hit${!can || can.has(c) || busy.has(c) ? ' can' : ''}" data-c="${c}" x="${(c % n) * U}" y="${((c / n) | 0) * U}" width="${U}" height="${U}"/>`;
      }
    }
    return s + '</svg>';
  }

  /* ---------- rules panel ---------- */
  const RULE_SELECTS = {
    start: 'Starting position', placement: 'Where you may place', lineDirs: 'Lines run along',
    lineBlock: 'A line needs', fill: 'Filling a line is', noMove: 'With no legal move', goal: 'Goal',
    holes: 'Blocked cells',
  };
  const rulesEl = $('#rules');
  function buildRules() {
    const r = state.rules;
    const sel = (key) => `<label class="fld"><span>${RULE_SELECTS[key]}</span><select data-rule="${key}">` +
      E.OPTIONS[key].map((o) => `<option value="${o[0]}"${o[0] === r[key] ? ' selected' : ''}>${esc(o[1])}</option>`).join('') + '</select></label>';
    const customOk = r.customStart && r.customStart.size === r.size;
    const id = T.shortId(T.rulesKey(r));
    rulesEl.innerHTML = '<h2>Rules</h2>' +
      `<div class="rid"><label class="fld"><span>Ruleset name</span><span class="inline"><input type="text" id="rid-in" class="rid-in" value="${esc(id)}" maxlength="40" spellcheck="false" autocomplete="off" aria-describedby="rid-msg" data-tip="Click to copy this name. Type or paste another ruleset's name (or a name you gave it on the Tune tab) to switch to those rules."><span class="rid-own" id="rid-own"></span></span></label><div class="note" id="rid-msg" aria-live="polite"></div></div>` +
      `<label class="fld"><span>Board size</span><span class="inline"><input type="range" data-rule="size" min="3" max="14" value="${r.size}"><output>${r.size} × ${r.size}</output></span></label>` +
      sel('start') +
      (r.start === 'custom' && !customOk ? '<p class="note">No position saved for this size yet, so the board starts empty. Draw one in the sandbox and save it.</p>' : '') +
      sel('placement') + sel('lineDirs') + sel('lineBlock') +
      `<label class="fld"><span>Longest gap a line may fill</span><span class="inline"><input type="number" data-rule="maxGap" min="0" max="16" value="${r.maxGap}"><span class="note">${r.maxGap ? 'cells' : '0 = no limit'}</span></span></label>` +
      sel('fill') + sel('noMove') + sel('goal') + sel('holes') +
      `<label class="fld"><span>Komi: bonus points for O</span><span class="inline"><input type="number" data-rule="komi" min="-20" max="20" step="0.5" value="${r.komi}"></span></label>` +
      '<div class="foot"><p class="note" id="rules-id"></p><button id="rules-reset">Reset rules</button><p class="note">Changing a rule starts a new game. The bots and the lab follow whatever is set here.</p></div>';
    refreshRulesId();
  }
  rulesEl.addEventListener('input', (e) => {
    if (e.target.dataset.rule === 'size') e.target.nextElementSibling.textContent = e.target.value + ' × ' + e.target.value;
  });
  rulesEl.addEventListener('change', (e) => {
    const key = e.target.dataset.rule;
    if (!key) return;
    const next = Object.assign({}, state.rules);
    next[key] = e.target.type === 'number' || e.target.type === 'range' ? +e.target.value : e.target.value;
    applyRules(next);
  });
  rulesEl.addEventListener('click', (e) => {
    if (e.target.id === 'rid-in') { copyRulesId(e.target); return; }
    const pick = e.target.closest('[data-rid-pick]');
    if (pick) { const r = ridChoices[+pick.dataset.ridPick]; if (r) switchRules(r); return; }
    if (e.target.closest('[data-goto-tune]')) { showTab('tune'); return; }
    if (e.target.id === 'rules-reset') applyRules(Object.assign({}, E.DEFAULT_RULES, { customStart: state.rules.customStart }));
  });
  // Ruleset names (T.shortId) in the rules panel: clicking the name copies it; typing or pasting a name switches to
  // those rules. Names are one-way hashes, so a name is looked up among the rulesets this browser knows (ladders, tuned
  // rulesets, your rated games, every ruleset you have used: SEENKEY), then, failing that, by T.findRules, which tries
  // every menu combination (no custom starts). When several rulesets share the name you pick one.
  const SEENKEY = 'paper-othello-rules-seen-v1';
  let seenRules = {};
  try { seenRules = JSON.parse(localStorage.getItem(SEENKEY) || '{}') || {}; } catch (e) { seenRules = {}; }
  function noteSeen(rules) {
    seenRules[T.rulesKey(rules)] = Date.now();
    const keys = Object.keys(seenRules);
    if (keys.length > 300) keys.sort((a, b) => seenRules[a] - seenRules[b]).slice(0, keys.length - 300).forEach((k) => delete seenRules[k]);
    try { localStorage.setItem(SEENKEY, JSON.stringify(seenRules)); } catch (e) { /* only a convenience */ }
  }
  function knownRuleKeys() {
    const keys = new Set([T.rulesKey(state.rules), T.rulesKey(E.DEFAULT_RULES), ...Object.keys(seenRules), ...Object.keys(tstore.rulesets)]);
    for (const id in LDATA) keys.add(LDATA[id].rulesKey);
    for (const k in lstore) keys.add(k);
    for (const g of mestore.games) keys.add(g.key);
    return [...keys];
  }
  const keyRules = (key) => { try { return E.normalizeRules(JSON.parse(key)); } catch (e) { return null; } };
  // Rulesets called `text`: by id, or by the name you gave them on the Tune tab.
  function rulesNamed(text, search) {
    const t = text.trim().toLowerCase();
    if (!t) return [];
    const known = knownRuleKeys().filter((k) => T.shortId(k) === t || ((tstore.rulesets[k] || {}).name || '').trim().toLowerCase() === t);
    if (known.length || !search) return known.map(keyRules).filter(Boolean);
    const near = (r) => Object.keys(E.DEFAULT_RULES).filter((k) => k !== 'customStart' && r[k] !== state.rules[k]).length;
    return T.findRules(t).sort((a, b) => near(a) - near(b));
  }
  let ridChoices = [], ridTimer = 0;
  function copyRulesId(input) {
    const id = T.shortId(T.rulesKey(state.rules));
    if (input.value.trim() !== id) return;
    input.select();
    const done = () => toast(`Copied the ruleset name ${id}. Paste it into this box to come back to these rules.`);
    const fallback = () => { try { document.execCommand('copy'); done(); } catch (e) { /* the name is selected: Ctrl/Cmd+C works */ } };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(id).then(done, fallback);
    else fallback();
  }
  function switchRules(rules) {
    ridChoices = [];
    if (T.rulesKey(rules) === T.rulesKey(state.rules)) { buildRules(); return; }
    applyRules(rules);
    toast(`Switched to ruleset ${T.shortId(T.rulesKey(rules))}: ${E.describeRules(rules)}`);
  }
  function lookUpRulesId(input) {
    clearTimeout(ridTimer);
    const msg = $('#rid-msg'), text = input.value.trim(), id = T.shortId(T.rulesKey(state.rules));
    ridChoices = [];
    msg.innerHTML = '';
    if (!text || text.toLowerCase() === id) return;
    const known = rulesNamed(text, false);
    if (known.length === 1) { switchRules(known[0]); return; }
    if (!known.length && !/^[0-9a-z]{5}$/i.test(text)) {
      if (text.length > 5 || !/^[0-9a-z]*$/i.test(text)) msg.textContent = `No ruleset is called “${text}”. Names are 5 letters and digits, like ysbvl.`;
      return;
    }
    const show = (list) => {
      if (input.value.trim() !== text) return;
      if (list.length === 1) { switchRules(list[0]); return; }
      if (!list.length) { msg.textContent = `No ruleset is called “${text}” (custom starts can only be found once used in this browser).`; return; }
      ridChoices = list;
      msg.innerHTML = `${list.length} rulesets are called “${esc(text)}”. Pick one:` +
        list.map((r, i) => `<button class="link rid-pick" data-rid-pick="${i}">${esc(E.describeRules(r))}</button>`).join('');
    };
    if (known.length) { show(known); return; }
    msg.textContent = 'Looking up ' + text + '…';
    ridTimer = setTimeout(() => show(rulesNamed(text, true)), 30);
  }
  rulesEl.addEventListener('input', (e) => { if (e.target.id === 'rid-in') lookUpRulesId(e.target); });
  rulesEl.addEventListener('focusout', (e) => {
    if (e.target.id !== 'rid-in' || ridChoices.length) return;
    const id = T.shortId(T.rulesKey(state.rules));
    setTimeout(() => { if (document.activeElement !== e.target && e.target.isConnected) { clearTimeout(ridTimer); e.target.value = id; $('#rid-msg').textContent = ''; } }, 150);
  });
  rulesEl.addEventListener('keydown', (e) => {
    if (e.target.id !== 'rid-in') return;
    if (e.key === 'Escape') { e.target.value = T.shortId(T.rulesKey(state.rules)); ridChoices = []; $('#rid-msg').textContent = ''; e.target.blur(); }
    if (e.key === 'Enter') lookUpRulesId(e.target);
  });

  function applyRules(next) {
    const before = T.rulesKey(state.rules);
    state.rules = E.normalizeRules(next);
    noteSeen(state.rules);
    if (tn.running && T.rulesKey(state.rules) !== before) { tuneStop(); toast('Tuning paused: the rules changed. It resumes when you come back to these rules.'); }
    save(); buildRules(); buildSweepValues(); newGame(); refreshPickers();
    if (!$('#tab-tune').hidden) renderTune();
  }

  /* ---------- game flow ---------- */
  const boardEl = $('#board');
  const isHuman = (p) => state.players[p].type === 'human';
  const canAct = () => !state.game.over && !state.thinking && (isHuman(state.game.turn) || state.paused);
  const startBase = () => { const st = E.startPosition(state.rules); return { board: Array.from(st.board), turn: st.first }; };
  function buildGame() {
    const g = E.fromPosition(state.rules, state.base.board, state.base.turn);
    for (const h of state.history) E.play(g, h.move);
    return g;
  }
  function newGame() { state.base = startBase(); state.history = []; state.lastInfo = null; state.paused = false; state.rated = meStart(); rebuild(); }
  function rebuild() { state.game = buildGame(); changed(); }
  function changed() {
    state.token++;
    state.pending = null;
    clearTimeout(state.timer);
    if (state.thinking) { botRemote.cancel(); state.thinking = false; }
    render(); meWatch(); renderMe(); requestScores(); schedule();
  }
  function commit(move, info) {
    state.history.push({ move, p: state.game.turn, info });
    E.play(state.game, move);
    changed();
  }
  function schedule() {
    const g = state.game;
    if (state.sandbox || g.over) return;
    if (!isHuman(g.turn) && !state.paused && E.isSettled(g)) { // a bot sees only lone gaps left and ends it
      const token = state.token;
      state.timer = setTimeout(() => { if (token === state.token) endNow(); }, state.opts.speed);
      return;
    }
    if (!state.legal.length) { // forced pass
      const token = state.token;
      state.timer = setTimeout(() => { if (token === state.token) commit(E.PASS); }, 900);
      return;
    }
    if (!isHuman(g.turn) && !state.paused) botMove();
  }
  function playSpec(spec) {
    const out = resolveSpec(spec);
    if (out.type === 'minimax' || out.type === 'material') out.timeMs = 6000;
    return out;
  }
  function botMove() {
    const g = state.game, p = g.turn, token = state.token, t0 = performance.now(), spec = playSpec(state.players[p]);
    state.thinking = true;
    renderStatus(); renderBoard();
    botRemote.call({ type: 'move', rules: g.rules, board: Array.from(g.board), turn: p, spec, seed: (Math.random() * 2147483647) | 0 }).then((r) => {
      if (r.cancelled || token !== state.token) return;
      state.timer = setTimeout(() => {
        if (token !== state.token) return;
        state.thinking = false;
        state.lastInfo = { p, label: B.label(spec), info: r.info };
        commit(r.move, r.info);
      }, Math.max(0, state.opts.speed - (performance.now() - t0)));
    }).catch((err) => { state.thinking = false; toast('Bot error: ' + err.message); render(); });
  }
  // Finish a settled game at once. The moves go into the history marked `auto`, so Undo takes them all back.
  function endNow() {
    const g = state.game;
    if (state.sandbox || g.over || !E.isSettled(g)) return;
    const t = E.clone(g);
    let p = t.turn;
    for (const m of E.finishSettled(t)) { state.history.push({ move: m, p, auto: true }); p = 3 - p; }
    state.lastInfo = null;
    rebuild();
  }
  function undoMove() {
    if (!state.history.length) return;
    meSpoil('you took a move back');
    const anyHuman = isHuman(1) || isHuman(2);
    const stop = () => { const g = buildGame(); return !anyHuman || (isHuman(g.turn) && E.legalCells(g).length); };
    let hadAuto = false; // an "End game now" finish is taken back as one step
    while (state.history.length && state.history[state.history.length - 1].auto) { state.history.pop(); hadAuto = true; }
    if (!hadAuto || !stop()) {
      while (state.history.length) { state.history.pop(); if (stop()) break; }
    }
    if (!anyHuman) state.paused = true;
    rebuild();
  }

  function onCell(c) {
    const g = state.game;
    if (state.sandbox) {
      state.base.board[c] = state.base.board[c] === state.brush ? 0 : state.brush;
      rebuild();
      return;
    }
    if (!canAct()) return;
    const pd = state.pending;
    if (pd) {
      if (c === pd.cell) return confirmPending();
      const li = pd.lines.findIndex((l) => l.includes(c));
      if (li >= 0) { pd.on[li] = !pd.on[li]; renderBoard(); return; }
    }
    if (!state.legal.includes(c)) { if (pd) { state.pending = null; renderBoard(); } return; }
    const lines = E.linesAt(g, c);
    if (g.rules.fill === 'choice' && state.opts.manual && lines.length) {
      state.pending = { cell: c, lines, on: lines.map(() => true) };
      renderBoard();
      return;
    }
    commit(E.buildMove(c, lines));
  }
  function confirmPending() {
    const pd = state.pending;
    if (!pd) return;
    const avail = pd.lines.reduce((a, l) => a + l.length, 0);
    commit(E.buildMove(pd.cell, pd.lines.filter((_, i) => pd.on[i]), avail));
  }

  boardEl.addEventListener('click', (e) => { const t = e.target.closest('.hit'); if (t) onCell(+t.dataset.c); });
  boardEl.addEventListener('pointerover', (e) => {
    const gh = $('.ghost', boardEl), t = e.target.closest('.hit');
    if (!gh) return;
    const c = t ? +t.dataset.c : -1, g = state.game;
    if (c < 0 || state.sandbox || state.pending || !canAct() || !state.legal.includes(c)) { gh.innerHTML = ''; return; }
    gh.innerHTML = markSVG(c, g.turn, g.n, 'gh') + [].concat.apply([], E.linesAt(g, c)).map((f) => markSVG(f, g.turn, g.n, 'gh')).join('');
  });
  boardEl.addEventListener('pointerleave', () => { const gh = $('.ghost', boardEl); if (gh) gh.innerHTML = ''; });
  document.addEventListener('keydown', (e) => {
    if (!state.pending) return;
    if (e.key === 'Enter') confirmPending();
    if (e.key === 'Escape') { state.pending = null; renderBoard(); }
  });
  $('#confirm-ok').addEventListener('click', confirmPending);
  $('#confirm-cancel').addEventListener('click', () => { state.pending = null; renderBoard(); });

  $('#btn-new').addEventListener('click', newGame);
  $('#btn-undo').addEventListener('click', undoMove);
  $('#btn-pause').addEventListener('click', () => {
    state.paused = !state.paused;
    if (state.paused) meSpoil('the bots were paused');
    if (state.paused) { clearTimeout(state.timer); if (state.thinking) { botRemote.cancel(); state.thinking = false; } state.token++; render(); }
    else { render(); schedule(); }
  });
  $('#btn-end').addEventListener('click', endNow);
  $('#btn-step').addEventListener('click', () => { if (state.paused && !state.thinking && !state.game.over && !isHuman(state.game.turn) && state.legal.length) botMove(); });

  /* ---------- sandbox ---------- */
  function setSandbox(on) {
    state.sandbox = on;
    if (on) { state.base = { board: Array.from(state.game.board), turn: state.game.turn }; state.history = []; state.lastInfo = null; }
    rebuild();
  }
  $('#btn-sandbox').addEventListener('click', () => setSandbox(!state.sandbox));
  $('#sb-play').addEventListener('click', () => setSandbox(false));
  $('#sb-clear').addEventListener('click', () => { state.base.board.fill(0); rebuild(); });
  $('#sb-save').addEventListener('click', () => {
    state.rules = E.normalizeRules(Object.assign({}, state.rules, { start: 'custom',
      customStart: { size: state.rules.size, cells: E.boardToString(state.base.board), first: state.base.turn } }));
    save(); buildRules(); buildSweepValues();
    toast('Saved. New games and lab runs now start from this position.');
  });
  $('#brush').addEventListener('click', (e) => { if (e.target.dataset.v !== undefined) { state.brush = +e.target.dataset.v; renderChrome(); } });
  $('#tomove').addEventListener('click', (e) => { if (e.target.dataset.v !== undefined) { state.base.turn = +e.target.dataset.v; rebuild(); } });

  /* ---------- rendering the Play tab ---------- */
  function renderBoard() {
    const g = state.game, mover = g.turn;
    state.legal = g.over || state.sandbox ? [] : E.legalCells(g);
    let hints = null;
    if (state.opts.hints && g.rules.fill !== 'none') {
      hints = new Map();
      for (const c of state.legal) { const k = E.fillSize(g, c, mover); if (k) hints.set(c, '+' + k); }
    }
    const last = state.history[state.history.length - 1];
    boardEl.innerHTML = boardSVG(g.n, g.board, {
      labels: true, interactive: true, mover, hints, scores: state.scores, pending: state.pending, legal: state.legal,
      last: last && { cell: last.move.cell, fills: last.move.fills, p: last.p },
      clickable: state.sandbox ? 'all' : canAct() ? state.legal : [],
    });
    const pd = state.pending;
    $('#confirm').hidden = !pd;
    if (pd) {
      const k = pd.lines.reduce((a, l, i) => a + (pd.on[i] ? l.length : 0), 0);
      $('#confirm-text').textContent = `Placing at ${E.cellName(g.n, pd.cell)} and filling ${k} cell${k === 1 ? '' : 's'}. Click a faded line to switch it on or off.`;
    }
  }

  function renderStatus() {
    const g = state.game, who = `<b>${NAME[g.turn]}</b>`;
    $('#score-x').textContent = g.count[1];
    $('#score-o').textContent = g.count[2];
    const bar = $('#score-bar');
    $('.sx', bar).style.flexGrow = g.count[1]; $('.se', bar).style.flexGrow = g.empties; $('.so', bar).style.flexGrow = g.count[2];
    let t;
    if (state.sandbox) t = `Sandbox: click cells to draw. ${who} moves next.`;
    else if (g.over) {
      const w = E.winner(g);
      t = (w ? `<b>${NAME[w]} wins</b>` : '<b>Draw</b>') + ` ${g.count[1]}–${g.count[2]}`;
      if (g.rules.komi) t += ` (O also gets ${g.rules.komi} komi)`;
      if (g.empties) t += `, ${g.empties} cell${g.empties === 1 ? '' : 's'} left empty`;
      const auto = state.history.filter((h) => h.auto && h.move.cell >= 0).length;
      if (auto) t += ` (ended early: the last ${auto} lone gap${auto === 1 ? ' was' : 's were'} shared out automatically)`;
    } else if (state.thinking) t = `${who} is thinking…`;
    else if (!state.legal.length) t = `${who} has no legal move and passes`;
    else {
      const where = state.legal.length === g.empties ? 'anywhere'
        : g.rules.placement === 'any8' ? 'next to any mark' : `next to an ${NAME[3 - g.turn]}`;
      t = `${who} to move: ${where}` + (!isHuman(g.turn) && state.paused ? ' (bots paused)' : '');
    }
    $('#status').innerHTML = t;
  }

  function renderChrome() {
    const g = state.game, botTurn = !g.over && !isHuman(g.turn);
    $('#btn-sandbox').setAttribute('aria-pressed', String(state.sandbox));
    $('#sandbox-bar').hidden = !state.sandbox;
    $('#btn-undo').disabled = state.sandbox || !state.history.length;
    $('#btn-pause').disabled = state.sandbox;
    $('#btn-pause').textContent = state.paused ? 'Resume bots' : 'Pause bots';
    $('#btn-end').disabled = state.sandbox || g.over || state.thinking || !E.isSettled(g);
    $('#btn-step').disabled = state.sandbox || !state.paused || !botTurn || state.thinking;
    $$('#brush button').forEach((b) => b.classList.toggle('on', +b.dataset.v === state.brush));
    $$('#tomove button').forEach((b) => b.classList.toggle('on', +b.dataset.v === g.turn));
    $('#opt-manual-wrap').hidden = g.rules.fill !== 'choice';
  }

  function renderLog() {
    const n = state.game.n, log = $('#log');
    log.innerHTML = state.history.map((h) => {
      const f = h.move.fills;
      return `<li${h.auto ? ' class="small"' : ''}><b>${NAME[h.p]}</b> ${E.cellName(n, h.move.cell)}${h.auto ? ' (auto)' : ''}` +
        (f.length ? ` +${f.length} <span class="small">(${f.map((c) => E.cellName(n, c)).join(' ')})</span>` : '') + '</li>';
    }).join('');
    log.scrollTop = log.scrollHeight;
  }

  /* ---------- bot brain ---------- */
  function buildBrain() {
    $('#eval tbody').innerHTML = B.FEATURE_INFO.map((f) =>
      `<tr data-k="${f[0]}"><td><span data-tip="${esc(f[2])}">${esc(f[1])}</span><span class="tag"></span></td><td class="num v"></td>` +
      `<td class="num"><input type="number" step="0.05" aria-label="Weight for ${esc(f[1])}" value="${state.weights[f[0]]}"></td><td class="num c"></td></tr>`).join('');
  }
  $('#eval').addEventListener('change', (e) => {
    const row = e.target.closest('tr[data-k]');
    if (!row) return;
    state.weights[row.dataset.k] = +e.target.value || 0;
    save(); renderBrain(); requestScores();
  });
  $('#weights-reset').addEventListener('click', () => {
    state.weights = Object.assign({}, B.DEFAULT_WEIGHTS);
    save(); buildBrain(); renderBrain(); requestScores();
  });

  function scoreWords(v) {
    if (v > B.WIN / 2) return 'a certain win by ' + fmt(v - B.WIN, 1);
    if (v < -B.WIN / 2) return 'a certain loss by ' + fmt(-(v + B.WIN), 1);
    return signed(v) + ' stones';
  }
  function renderBrain() {
    const g = state.game, f = B.features(g, true, true, true), sg = B.featureSigns(g.rules), ph = B.phase(g);
    let total = 0;
    for (const row of $$('#eval tbody tr')) {
      // weights tuned to change over the game (key@end) count at their value for this stage of the game
      const k = row.dataset.k, s = sg[k], wk = B.weightAt(state.weights, k, ph), c = s * wk * f[k];
      total += c;
      row.classList.toggle('off', s === 0);
      const moving = k + '@end' in state.weights && state.weights[k + '@end'] !== state.weights[k];
      $('.tag', row).textContent = s === 0 ? 'unused in these rules' : (s < 0 ? 'reversed' : '') + (moving ? ` now ${fmt(wk, 2)} (→ ${fmt(state.weights[k + '@end'], 2)} at the end)` : '');
      $('.v', row).textContent = signed(f[k], 0);
      $('.c', row).textContent = s === 0 ? '–' : signed(c, 2);
    }
    $('#brain-head').textContent = g.over ? 'The game is over, so there is nothing left to estimate.'
      : `How Minimax sizes up this position for ${NAME[g.turn]}, who is about to move. Hover a row for what it measures.`;
    $('#eval-label').textContent = `Estimated final lead for ${NAME[g.turn]}`;
    $('#eval-total').textContent = g.over ? '–' : signed(total, 2);

    const li = state.lastInfo, out = $('#search-info');
    if (!li) { out.textContent = ''; return; }
    const i = li.info, n = g.n, head = `Last bot move (${NAME[li.p]}, ${li.label}): `;
    if (i.kind === 'minimax') {
      out.textContent = head + (i.depth === 0 ? 'only one legal move, so no search was needed.'
        : `searched ${i.depth} move${i.depth === 1 ? '' : 's'} ahead${i.solved ? ' to the end of the game' : ''}, visiting ${fmt(i.nodes)} positions and pruning ${fmt(i.cutoffs)} branches in ${fmt(i.ms)} ms. ` +
          `It expects ${scoreWords(i.score)}. Planned line: ${i.pv.map((m) => E.cellName(n, m.cell)).join(', ')}.`);
    } else if (i.kind === 'mc') {
      out.textContent = head + (i.playouts ? `played ${fmt(i.playouts)} random games; its move averaged ${fmt(i.score, 2)} (0.5 is even, 1 is a sure win).` : 'only one legal move.');
    } else if (i.kind === 'random') out.textContent = head + 'picked at random.';
    else out.textContent = head + `best immediate swing ${signed(i.score, 0)} stones.`;
  }

  function requestScores() {
    state.scores = null;
    analysis.cancel();
    const g = state.game;
    if (!state.opts.showScores || state.sandbox || g.over || !state.legal.length) return;
    const token = state.token;
    analysis.call({ type: 'analyze', rules: g.rules, board: Array.from(g.board), turn: g.turn, depth: state.opts.scoreDepth,
      weights: state.weights, timeMs: 5000, seed: 1 }).then((r) => {
      if (r.cancelled || token !== state.token || !r.info.scores) return;
      const best = new Map();
      for (const s of r.info.scores) if (s.move.cell >= 0 && (!best.has(s.move.cell) || s.score > best.get(s.move.cell))) best.set(s.move.cell, s.score);
      const top = Math.max.apply(null, Array.from(best.values()));
      state.scores = new Map();
      for (const [c, v] of best) {
        const text = v > B.WIN / 2 ? 'W' + signed(v - B.WIN, 0) : v < -B.WIN / 2 ? 'L' + signed(v + B.WIN, 0) : signed(v, 1);
        state.scores.set(c, { text, best: v >= top - 1e-9 });
      }
      renderBoard();
    }).catch(() => {});
  }

  function render() { renderBoard(); renderStatus(); renderChrome(); renderLog(); renderBrain(); }

  /* ---------- Play tab options ---------- */
  function bindOptions() {
    // A new opponent before the first move still makes a rated game; after it, the game no longer counts.
    const onPlayers = () => { if (state.history.length) meSpoil('the players changed mid-game'); else state.rated = meStart(); save(); changed(); };
    botPicker($('#pick-x'), state.players[1], onPlayers, true);
    botPicker($('#pick-o'), state.players[2], onPlayers, true);
    const sp = $('#opt-speed'), spOut = $('#opt-speed-out');
    const showSpeed = () => { spOut.textContent = state.opts.speed ? (state.opts.speed / 1000).toFixed(2) + ' s' : 'instant'; };
    sp.value = state.opts.speed; showSpeed();
    sp.addEventListener('input', () => { state.opts.speed = +sp.value; showSpeed(); save(); });
    const check = (id, key, after) => {
      const el = $(id);
      el.checked = state.opts[key];
      el.addEventListener('change', () => { state.opts[key] = el.checked; save(); after(); });
    };
    check('#opt-hints', 'hints', renderBoard);
    check('#opt-manual', 'manual', () => { state.pending = null; renderBoard(); });
    check('#opt-scores', 'showScores', () => { requestScores(); renderBoard(); });
    const sd = $('#opt-score-depth');
    sd.value = state.opts.scoreDepth;
    sd.addEventListener('change', () => { state.opts.scoreDepth = +sd.value; save(); requestScores(); renderBoard(); });
  }

  /* ---------- Bots tab ---------- */
  function renderFeatureTable() {
    if (!$('#feature-table tbody')) return; // only there while the evaluator article is open
    $('#feature-table tbody').innerHTML = B.FEATURE_INFO.map((f) =>
      `<tr><th>${esc(f[1])}</th><td>${esc(f[2])}</td><td class="num w">× ${fmt(state.weights[f[0]], 2)}</td></tr>`).join('');
  }
  // The button lives inside an article that is drawn on demand, so listen on the document.
  document.addEventListener('click', (e) => { if (e.target.closest('#prune-run')) runPrune(); });
  function runPrune() {
    const g = state.game, out = $('#prune-out'), depth = +$('#prune-depth').value;
    if (g.over || !E.legalCells(g).length) { out.textContent = 'The game on the Play tab is over. Start a new one first.'; return; }
    out.textContent = 'Searching…';
    analysis.call({ type: 'prune', rules: g.rules, board: Array.from(g.board), turn: g.turn, depth, weights: state.weights, timeMs: 20000 }).then((r) => {
      if (r.cancelled) { out.textContent = 'Interrupted by a move on the Play tab. Try again.'; return; }
      const a = r.a, b = r.b;
      out.textContent = b.depth < a.depth
        ? `With pruning: ${fmt(a.nodes)} positions in ${fmt(a.ms)} ms to look ${a.depth} moves ahead. Without pruning the search was still going after 20 seconds and had only finished depth ${b.depth}.`
        : `Looking ${a.depth} moves ahead for ${NAME[g.turn]}: ${fmt(a.nodes)} positions with pruning (${fmt(a.ms)} ms) against ${fmt(b.nodes)} without (${fmt(b.ms)} ms). ` +
          `That is ${fmt(b.nodes / a.nodes, 1)} times less work for the same answer (${scoreWords(a.score)}).`;
    }).catch((err) => { out.textContent = 'Search failed: ' + err.message; });
  }

  /* ---------- Research + Bots tabs: icon tiles that open articles ----------
   * ARTICLES comes from articles-data.js, generated by paper/web.js (text + engine-checked SVG figures).
   * The URL hash (#research/komi) remembers the open article, so the browser's back button works. */
  const artView = { bots: null, research: null };
  const ART_INTRO = {
    research: 'What the experiments behind this site found. Pick a topic to read it in full, with its figures and tables.',
    bots: 'How the computer players choose their moves, from the six bots on the Play tab to the perfect solvers behind the puzzles and the research.',
  };
  const ART_BACK = { research: 'All research', bots: 'All about the bots' };

  // Featured at the top of the Research tab: the beginner's strategy book (guide/guide.pdf, built by guide/build.js).
  // Cover board in chess orientation (row 1 at the bottom), like the book: X has just built c1+b1.
  const GUIDE = {
    href: 'guide/guide.pdf',
    title: 'Bobby Fissure Teaches Paper Othello',
    sub: 'The strategy book: a beginner\'s course in 57 frames, after Bobby Fischer Teaches Chess. Every answer was checked by perfect play.',
    points: [
      ['The extras rule', 'X wins only by earning more extras (bridged cells and opponent passes) than O. Exact on 5×5 and 7×7.'],
      ['A new opening theory', 'Every first move is a 12–12 draw, yet O walks a minefield: after the Crown (c1) only one reply is safe.'],
      ['Counting doors', 'Once only lone gaps remain, the result can be counted exactly, moves before the end.'],
      ['And more', 'Threats and reach, forks, the middle-game X-ray, and a chapter on 7×7.'],
    ],
  };
  function guideCover() {
    const y = (r) => 5 - r, xs = 'abcde';
    const X = (c) => { const x = xs.indexOf(c[0]) + 0.5, yy = y(+c[1]) + 0.5; return `<path class="fc-x" d="M${x - 0.27} ${yy - 0.27}L${x + 0.27} ${yy + 0.27}M${x - 0.27} ${yy + 0.27}L${x + 0.27} ${yy - 0.27}"/>`; };
    const O = (c) => `<circle class="fc-o" cx="${xs.indexOf(c[0]) + 0.5}" cy="${y(+c[1]) + 0.5}" r="0.29"/>`;
    let grid = '';
    for (let i = 1; i < 5; i++) grid += `<path class="fc-grid" d="M${i} 0V5M0 ${i}H5"/>`;
    return `<svg class="feature-cover" viewBox="-0.15 -0.15 5.3 5.3" aria-hidden="true">
      <rect class="fc-paper" x="0" y="0" width="5" height="5"/>
      <rect class="fc-fill" x="1" y="4" width="1" height="1"/><rect class="fc-place" x="2" y="4" width="1" height="1"/>
      ${grid}<rect class="fc-hole" x="2" y="2" width="1" height="1"/>
      <path class="fc-band" d="M0.5 4.5H2.5"/>
      ${['a1', 'b1', 'c1', 'a3', 'd4'].map(X).join('')}${['b2', 'd2', 'b4', 'e5'].map(O).join('')}
      <rect class="fc-edge" x="0" y="0" width="5" height="5"/></svg>`;
  }
  function guideCard() {
    return `<a class="feature" href="${GUIDE.href}" target="_blank" rel="noopener">${guideCover()}
      <div class="feature-text"><span class="feature-tag">Start here · the strategy book</span>
      <h2 class="feature-title">${esc(GUIDE.title)}</h2><p class="feature-sub">${esc(GUIDE.sub)}</p>
      <ul class="feature-points">${GUIDE.points.map(([h, t]) => `<li><b>${esc(h)}.</b> ${esc(t)}</li>`).join('')}</ul>
      <span class="feature-btn">Open the book (PDF) →</span></div></a>`;
  }
  function renderArts(set) {
    const box = $(`.arts[data-set="${set}"]`), data = ARTICLES[set], cur = artView[set];
    const items = data.items, i = items.findIndex((a) => a.id === cur);
    const icon = (a, cls) => `<svg class="ic ${cls || ''}" aria-hidden="true"><use href="#${a.icon}"/></svg>`;
    if (i < 0) {
      box.innerHTML = (set === 'research' ? guideCard() : '') + `<p class="cards-intro muted">${ART_INTRO[set]}</p>` + data.groups.map((g) =>
        `<h2 class="rgroup">${esc(g)}</h2><div class="tgrid">${items.filter((a) => a.group === g).map((a) =>
          `<button class="atile" data-art="${set}/${a.id}">${icon(a, 'big')}<span class="at-t">${esc(a.title)}</span><span class="at-b">${esc(a.blurb)}</span></button>`).join('')}</div>`).join('');
      return;
    }
    const a = items[i], prev = items[i - 1], next = items[i + 1];
    const navBtn = (b, dir) => b ? `<button class="art-step ${dir}" data-art="${set}/${b.id}"><span class="muted small">${dir === 'prev' ? '← Previous' : 'Next →'}</span><span>${esc(b.title)}</span></button>` : '<span></span>';
    box.innerHTML = `<div class="reader">
      <button class="link back" data-back="${set}">← ${ART_BACK[set]}</button>
      <article class="art card"><header class="art-head">${icon(a, 'big')}<div><div class="art-group">${esc(a.group)}</div><h1>${esc(a.title)}</h1></div></header>
      <div class="art-body">${a.html}</div></article>
      <nav class="art-nav">${navBtn(prev, 'prev')}${navBtn(next, 'next')}</nav></div>`;
    if (set === 'bots') renderFeatureTable();
  }
  function openArt(set, id, push) {
    artView[set] = id || null;
    if (push) history.pushState(null, '', '#' + set + (id ? '/' + id : ''));
    showTab(set);
    window.scrollTo(0, 0);
  }
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-art], [data-back]');
    if (!t) return;
    if (t.dataset.back) openArt(t.dataset.back, null, true);
    else { const [set, id] = t.dataset.art.split('/'); openArt(set, id, true); }
  });
  function routeFromHash() {
    const [set, id] = location.hash.slice(1).split('/');
    if (!ARTICLES[set]) return false;
    openArt(set, ARTICLES[set].items.some((a) => a.id === id) ? id : null, false);
    return true;
  }
  window.addEventListener('popstate', routeFromHash);
  setTimeout(routeFromHash, 0);

  /* =====================================================================
   *  LAB
   * ===================================================================== */
  const SWEEPS = {
    size: { label: 'Board size', values: [4, 5, 6, 7, 8, 9, 10, 12], on: [4, 6, 8, 10], fmt: (v) => v + ' × ' + v },
    start: { label: RULE_SELECTS.start }, placement: { label: RULE_SELECTS.placement }, lineDirs: { label: RULE_SELECTS.lineDirs },
    lineBlock: { label: RULE_SELECTS.lineBlock }, fill: { label: RULE_SELECTS.fill }, noMove: { label: RULE_SELECTS.noMove },
    goal: { label: RULE_SELECTS.goal }, holes: { label: RULE_SELECTS.holes },
    maxGap: { label: 'Longest gap a line may fill', values: [0, 1, 2, 3, 4], fmt: (v) => (v ? String(v) : 'No limit') },
    komi: { label: 'Komi for O', values: [0, 1, 2, 3, 4, 6, 8], on: [0, 2, 4], fmt: (v) => String(v) },
  };
  function sweepInfo(key) {
    const s = SWEEPS[key];
    if (s.values) return s;
    let opts = E.OPTIONS[key];
    if (key === 'start' && !(state.rules.customStart && state.rules.customStart.size === state.rules.size)) opts = opts.filter((o) => o[0] !== 'custom');
    return { label: s.label, values: opts.map((o) => o[0]), fmt: (v) => (opts.find((o) => o[0] === v) || ['', v])[1] };
  }
  function buildSweepValues() {
    const info = sweepInfo(state.lab.sweepParam);
    $('#sweep-values').innerHTML = info.values.map((v) =>
      `<label><input type="checkbox" value="${esc(v)}"${!info.on || info.on.includes(v) ? ' checked' : ''}>${esc(info.fmt(v))}</label>`).join('');
  }

  function bindLab() {
    const L = state.lab;
    botPicker($('#lab-a'), L.botA, save, false);
    botPicker($('#lab-b'), L.botB, save, false);
    const num = (id, key, lo, hi) => {
      const el = $(id);
      el.value = L[key];
      el.addEventListener('change', () => { L[key] = clampInt(el.value, lo, hi, L[key]); el.value = L[key]; save(); });
    };
    num('#lab-games', 'games', 2, 20000); num('#lab-opening', 'opening', 0, 12);
    num('#st-stones', 'stones', 1, 8); num('#st-count', 'count', 0, 200);
    const chk = (id, key) => { const el = $(id); el.checked = !!L[key]; el.addEventListener('change', () => { L[key] = el.checked; save(); }); };
    chk('#lab-alt', 'alternate'); chk('#st-sym', 'sym'); chk('#st-presets', 'presets');
    const setMode = (m) => {
      L.mode = m;
      $$('#lab-mode button').forEach((b) => b.classList.toggle('on', b.dataset.v === m));
      $$('.mode').forEach((d) => { d.hidden = d.dataset.mode !== m; });
    };
    $('#lab-mode').addEventListener('click', (e) => { if (e.target.dataset.v) { setMode(e.target.dataset.v); save(); } });
    setMode(SWEEPS[L.sweepParam] && ['match', 'sweep', 'starts'].includes(L.mode) ? L.mode : 'match');
    const sp = $('#sweep-param');
    sp.innerHTML = Object.keys(SWEEPS).map((k) => `<option value="${k}">${esc(SWEEPS[k].label)}</option>`).join('');
    if (!SWEEPS[L.sweepParam]) L.sweepParam = 'size';
    sp.value = L.sweepParam;
    sp.addEventListener('change', () => { L.sweepParam = sp.value; save(); buildSweepValues(); });
    buildSweepValues();
    $('#lab-run').addEventListener('click', labRun);
    $('#lab-stop').addEventListener('click', () => pool.cancel());
  }

  const labSpec = (spec) => resolveSpec(spec);

  // A Lab match between two ladder bots under ladder rules counts like any ladder game, provided the openings vary
  // (random opening moves); otherwise two fixed bots replay one game over and over and it would count many times.
  function logLabMatch(L, conds) {
    if (L.mode !== 'match' || !(L.opening >= 1) || !conds.length) return;
    const c = conds[0], l = ladderForKey(T.rulesKey(c.rules));
    if (!l) return;
    const a = memberOf(l, L.botA), b = memberOf(l, L.botB);
    if (!a || !b || a === b) return;
    if (L.opening !== ladderOp(l)) { toast(`Not counted on the ${l.name} ladder: its games start with ${ladderOp(l)} random move${ladderOp(l) === 1 ? '' : 's'}, this match with ${L.opening}.`); return; }
    const n = logGames(l.rulesKey, [[a, b, Lad.pointsA(c.games), c.games.length]], c.games.filter((g) => g.winner === 1).length, 'Lab match', L.opening);
    if (n) { refreshPickers(); toast(`These ${fmt(n)} games went into the ${l.name} ratings.`); }
  }

  async function labRun() {
    const L = state.lab, rules = E.normalizeRules(state.rules);
    let conds = [];
    if (L.mode === 'match') conds = [{ label: 'Match', rules }];
    else if (L.mode === 'sweep') {
      const info = sweepInfo(L.sweepParam);
      const picked = $$('#sweep-values input:checked').map((el) => el.value);
      conds = info.values.filter((v) => picked.includes(String(v))).map((v) => ({ label: info.fmt(v), rules: E.normalizeRules(Object.assign({}, rules, { [L.sweepParam]: v })) }));
    } else {
      if (L.presets) {
        for (const o of E.OPTIONS.start) {
          if (o[0] === 'custom' && !(rules.customStart && rules.customStart.size === rules.size)) continue;
          conds.push({ label: o[1], rules: E.normalizeRules(Object.assign({}, rules, { start: o[0] })) });
        }
      }
      const rnd = B.rng((Math.random() * 2147483647) | 0);
      for (let i = 0; i < L.count; i++) {
        conds.push({ label: 'Random ' + (i + 1), rules: E.normalizeRules(Object.assign({}, rules, { start: 'custom', customStart: Lab.randomStart(rules.size, L.stones, L.sym, rnd) })) });
      }
    }
    if (!conds.length) { toast('Nothing selected to run.'); return; }

    const per = L.games, total = per * conds.length, chunk = Math.max(1, Math.min(20, Math.ceil(per / (pool.size * 3))));
    const baseSeed = (Math.random() * 1e9) | 0, jobs = [], botA = labSpec(L.botA), botB = labSpec(L.botB);
    for (let i = 0; i < per; i += chunk) {
      conds.forEach((c, ci) => {
        c.games = c.games || [];
        const k = Math.min(chunk, per - i);
        jobs.push({ ci, rules: c.rules, botA, botB, alternate: L.alternate, openingPlies: L.opening, indexBase: i,
          seeds: Array.from({ length: k }, (_, j) => baseSeed + ci * 1000003 + i + j) });
      });
    }
    const status = $('#lab-status'), barEl = $('#lab-progress i'), t0 = performance.now();
    let done = 0, failed = null;
    $('#lab-run').disabled = true; $('#lab-stop').disabled = false;
    barEl.style.width = '0'; status.textContent = `0 of ${fmt(total)} games`;
    try {
      await pool.run(jobs, (job, games) => {
        for (const g of games) conds[job.ci].games.push(g);
        done += games.length;
        barEl.style.width = (100 * done / total) + '%';
        const sec = (performance.now() - t0) / 1000;
        status.textContent = `${fmt(done)} of ${fmt(total)} games, ${fmt(done / Math.max(sec, 0.05))} per second`;
      });
    } catch (err) { failed = err; }
    $('#lab-run').disabled = false; $('#lab-stop').disabled = true;
    if (failed) { status.textContent = 'Run failed: ' + failed.message; return; }
    const sec = (performance.now() - t0) / 1000;
    status.textContent = (pool.cancelled ? `Stopped after ${fmt(done)} of ${fmt(total)} games` : `${fmt(done)} games`) + ` in ${fmt(sec, 1)} s`;
    conds = conds.filter((c) => c.games.length);
    if (!conds.length) { $('#lab-results').innerHTML = ''; return; }
    for (const c of conds) { c.games.sort((a, b) => a.index - b.index); c.summary = Lab.summarize(c.games, c.rules); }
    logLabMatch(L, conds);
    state.run = { mode: L.mode, conds, botA: L.botA, botB: L.botB, labelA: B.label(resolveSpec(L.botA)), labelB: B.label(resolveSpec(L.botB)),
      param: L.mode === 'sweep' ? sweepInfo(L.sweepParam).label : '', sort: L.mode === 'starts' ? 'balance' : 'index' };
    state.replay = null;
    renderRun();
  }

  /* ---------- charts ---------- */
  const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const hexRgb = (h) => { h = h.replace('#', ''); return [0, 2, 4].map((i) => parseInt(h.substr(i, 2), 16)); };
  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;
  const inkOn = (c) => ((0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255 > 0.58 ? '#0b0b0b' : '#ffffff');
  function niceMax(v) {
    const p = Math.pow(10, Math.floor(Math.log10(Math.max(v, 1)))), m = v / p;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
  }
  const leadWords = (v) => (Math.abs(v) < 0.05 ? 'level' : (v > 0 ? 'X' : 'O') + ' ahead by ' + fmt(Math.abs(v), 1));

  function turnBins(s) {
    const lo = s.minTurns, span = s.maxTurns - lo + 1, size = Math.ceil(span / 22), nb = Math.ceil(span / size);
    const bins = Array.from({ length: nb }, (_, i) => ({ from: lo + i * size, to: Math.min(s.maxTurns, lo + (i + 1) * size - 1), n: 0 }));
    for (const k in s.turnCounts) bins[Math.floor((k - lo) / size)].n += s.turnCounts[k];
    for (const b of bins) b.label = b.from === b.to ? String(b.from) : b.from + '–' + b.to;
    return bins;
  }
  function histogramSVG(s) {
    const W = 440, H = 210, l = 34, r = 10, t = 12, b = 34, pw = W - l - r, ph = H - t - b, y0 = t + ph;
    const bins = turnBins(s), top = niceMax(Math.max.apply(null, bins.map((x) => x.n))), slot = pw / bins.length;
    const bw = Math.max(2, Math.min(24, slot - 2));
    let o = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Histogram of game length in turns">`;
    for (const f of [0.5, 1]) o += `<path class="ch-grid" d="M${l} ${y0 - ph * f}H${W - r}"/><text class="ch-tick" x="${l - 6}" y="${y0 - ph * f + 3}" text-anchor="end">${fmt(top * f)}</text>`;
    o += `<text class="ch-tick" x="${l - 6}" y="${y0 + 3}" text-anchor="end">0</text>`;
    const every = Math.ceil(bins.length / 9);
    bins.forEach((bin, i) => {
      const x = l + i * slot + (slot - bw) / 2, h = (bin.n / top) * ph, y = y0 - h, rr = Math.min(4, bw / 2, h);
      if (bin.n) o += `<path class="ch-bar" d="M${x} ${y0}V${y + rr}Q${x} ${y} ${x + rr} ${y}H${x + bw - rr}Q${x + bw} ${y} ${x + bw} ${y + rr}V${y0}Z"/>`;
      if (i % every === 0) o += `<text class="ch-tick" x="${l + i * slot + slot / 2}" y="${y0 + 14}" text-anchor="middle">${bin.label}</text>`;
      o += `<rect class="ch-hit" x="${l + i * slot}" y="${t}" width="${slot}" height="${ph}" data-tip="${bin.label} turns: ${bin.n} game${bin.n === 1 ? '' : 's'}"/>`;
    });
    o += `<path class="ch-axis" d="M${l} ${y0}H${W - r}"/><text class="ch-note" x="${W - r}" y="${H - 4}" text-anchor="end">turns in the game</text>`;
    return o + '</svg>';
  }

  function leadSVG(s) {
    const W = 440, H = 210, l = 34, r = 44, t = 12, b = 34, pw = W - l - r, ph = H - t - b, mid = t + ph / 2;
    const A = niceMax(Math.max.apply(null, s.lead.map((p) => Math.max(Math.abs(p.q25), Math.abs(p.q75), 1))));
    const X = (p) => l + (p.pct / 100) * pw, Y = (v) => mid - (v / A) * (ph / 2);
    let o = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Typical lead through the game">`;
    for (const v of [A, -A]) o += `<path class="ch-grid" d="M${l} ${Y(v)}H${W - r}"/><text class="ch-tick" x="${l - 6}" y="${Y(v) + 3}" text-anchor="end">${fmt(A)}</text>`;
    o += `<path class="ch-axis" d="M${l} ${mid}H${W - r}"/><text class="ch-tick" x="${l - 6}" y="${mid + 3}" text-anchor="end">0</text>`;
    o += `<text class="ch-note" x="${l + 6}" y="${t + 10}">X ahead</text><text class="ch-note" x="${l + 6}" y="${t + ph - 5}">O ahead</text>`;
    o += '<path class="ch-band" d="M' + s.lead.map((p) => X(p) + ' ' + Y(p.q75)).join('L') + 'L' + s.lead.slice().reverse().map((p) => X(p) + ' ' + Y(p.q25)).join('L') + 'Z"/>';
    o += '<path class="ch-line" d="M' + s.lead.map((p) => X(p) + ' ' + Y(p.q50)).join('L') + '"/>';
    const end = s.lead[s.lead.length - 1];
    o += `<circle class="ch-dot" cx="${X(end)}" cy="${Y(end.q50)}" r="4"/><text class="ch-note" x="${X(end) + 8}" y="${Y(end.q50) + 3}">${end.q50 > 0 ? 'X +' : end.q50 < 0 ? 'O +' : ''}${fmt(Math.abs(end.q50), 1)}</text>`;
    for (const v of [0, 25, 50, 75, 100]) o += `<text class="ch-tick" x="${l + (v / 100) * pw}" y="${t + ph + 14}" text-anchor="middle">${v}%</text>`;
    o += `<text class="ch-note" x="${W - r}" y="${H - 4}" text-anchor="end">share of the board filled</text>`;
    const cw = pw / (s.lead.length - 1);
    for (const p of s.lead) {
      o += `<rect class="ch-hit" x="${X(p) - cw / 2}" y="${t}" width="${cw}" height="${ph}" data-tip="${p.pct}% filled: typical game ${leadWords(p.q50)}; middle half of games from ${leadWords(p.q25)} to ${leadWords(p.q75)}"/>`;
    }
    return o + '</svg>';
  }

  function heatSVG(s, n, kind) {
    const S = 300 / n, mid = hexRgb(cssVar('--div-mid')), cx = hexRgb(cssVar('--x')), co = hexRgb(cssVar('--o'));
    const lo = hexRgb(cssVar('--seq-lo')), hi = hexRgb(cssVar('--seq-hi'));
    const vals = kind === 'own' ? s.xShare : s.takenAt, known = vals.filter((v) => v !== null);
    const vmin = Math.min.apply(null, known), vmax = Math.max.apply(null, known);
    let o = `<svg class="heat" viewBox="0 0 300 300" role="img" aria-label="${kind === 'own' ? 'Who ends up holding each cell' : 'When each cell gets taken'}">`;
    for (let c = 0; c < n * n; c++) {
      const v = vals[c], name = E.cellName(n, c), x = (c % n) * S + 1, y = ((c / n) | 0) * S + 1;
      let col = mid, label = '', tipText = name + ': never taken';
      if (v !== null && kind === 'own') {
        col = mix(mid, v >= 0.5 ? cx : co, Math.abs(v - 0.5) * 2);
        label = String(Math.round(v * 100));
        tipText = `${name}: X holds it at the end of ${pct(v)} of games, O ${pct(1 - v)}`;
      } else if (v !== null) {
        col = mix(lo, hi, vmax > vmin ? (v - vmin) / (vmax - vmin) : 0.5);
        label = String(Math.round(v));
        tipText = `${name}: taken on turn ${fmt(v, 1)} on average`;
      }
      o += `<rect class="cell" x="${x}" y="${y}" width="${S - 2}" height="${S - 2}" rx="3" fill="${rgb(col)}" data-tip="${tipText}"/>`;
      if (n <= 10 && label) o += `<text x="${x + S / 2 - 1}" y="${y + S / 2 + 2.5}" text-anchor="middle" fill="${inkOn(col)}">${label}</text>`;
    }
    return o + '</svg>';
  }

  const outcomeBar = (s) => `<div class="outcome" data-tip="X wins ${pct(s.xWins / s.n)}, draws ${pct(s.draws / s.n)}, O wins ${pct(s.oWins / s.n)}">` +
    `<i class="c-x" style="flex:${s.xWins}"></i><i class="c-d" style="flex:${s.draws}"></i><i class="c-o" style="flex:${s.oWins}"></i></div>`;
  const OUTCOME_LEGEND = '<div class="legend"><span><i class="c-x"></i>X (moves first) wins</span><span><i class="c-d"></i>Draw</span><span><i class="c-o"></i>O wins</span></div>';

  /* ---------- lab results ---------- */
  function renderRun() {
    const run = state.run, host = $('#lab-results');
    if (run.mode === 'match') host.innerHTML = matchHTML(run);
    else host.innerHTML = tableHTML(run);
    if (run.mode === 'match') renderReplay();
  }

  function matchHTML(run) {
    const c = run.conds[0], s = c.summary, r = c.rules, same = JSON.stringify(run.botA) === JSON.stringify(run.botB);
    const tiles = [
      ['X wins (moves first)', pct(s.xWins / s.n), `${fmt(s.xWins)} of ${fmt(s.n)} games`],
      ['Draws', pct(s.draws / s.n), `${fmt(s.draws)} games`],
      ['O wins', pct(s.oWins / s.n), `${fmt(s.oWins)} games`],
    ];
    if (!same) tiles.push([`A wins: ${run.labelA}`, pct(s.aWins / s.n), `B (${run.labelB}) wins ${pct(s.bWins / s.n)}`]);
    tiles.push(['Game length', fmt(s.meanTurns, 1) + ' turns', `from ${s.minTurns} to ${s.maxTurns}`],
      ['Final margin', fmt(s.meanAbsMargin, 1) + ' stones', 'average gap between the players'],
      ['Lead changes', fmt(s.leadChanges, 1), 'per game'],
      ['Turns that fill a line', pct(s.fillShare), `${fmt(s.stonesPerTurn, 2)} stones per turn`]);
    if (r.fill === 'choice') tiles.push(['Fills turned down', pct(s.declineRate), `of ${fmt(s.chances)} chances to fill`]);
    if (s.passes > 0.004) tiles.push(['Passes', fmt(s.passes, 2), 'per game']);
    if (s.meanEmpties > 0.004) tiles.push(['Cells left empty', fmt(s.meanEmpties, 1), 'per game']);
    const bins = turnBins(s);
    return '<div class="card">' +
      `<div class="head-row"><h2>Match: ${esc(run.labelA)} against ${esc(run.labelB)}</h2><span class="muted small">${esc(E.describeRules(r))}</span></div>` +
      '<div class="tiles">' + tiles.map((t) => `<div class="tile"><div class="k">${esc(t[0])}</div><div class="v">${esc(t[1])}</div><div class="s">${esc(t[2])}</div></div>`).join('') + '</div>' +
      `<div style="margin-top:14px">${outcomeBar(s)}${OUTCOME_LEGEND}</div></div>` +
      '<div class="card"><div class="charts">' +
      `<div class="chart"><h3>How long games last</h3><p class="sub">Number of games by length in turns</p>${histogramSVG(s)}` +
      `<details class="tbl"><summary>Show as a table</summary><table><tr><th>Turns</th><th class="num">Games</th></tr>${bins.map((b) => `<tr><td>${b.label}</td><td class="num">${b.n}</td></tr>`).join('')}</table></details></div>` +
      `<div class="chart"><h3>Who leads, and when</h3><p class="sub">X's stones minus O's: the typical game (line) and the middle half of games (band)</p>${leadSVG(s)}` +
      `<details class="tbl"><summary>Show as a table</summary><table><tr><th>Board filled</th><th class="num">Lower quarter</th><th class="num">Typical</th><th class="num">Upper quarter</th></tr>${s.lead.filter((_, i) => i % 2 === 0).map((p) => `<tr><td>${p.pct}%</td><td class="num">${signed(p.q25)}</td><td class="num">${signed(p.q50)}</td><td class="num">${signed(p.q75)}</td></tr>`).join('')}</table></details></div>` +
      `<div class="chart"><h3>Who ends up with each cell</h3><p class="sub">Percent of games in which X holds the cell at the end</p>${heatSVG(s, r.size, 'own')}<div class="scale"><span>O</span><i class="own"></i><span>X</span></div></div>` +
      `<div class="chart"><h3>When each cell is taken</h3><p class="sub">Average turn number on which the cell is marked</p>${heatSVG(s, r.size, 'when')}<div class="scale"><span>early</span><i class="when"></i><span>late</span></div></div>` +
      '</div></div>' +
      '<div class="card"><div class="head-row"><h2>Replay a game</h2><label class="muted">Order by <select id="games-sort">' +
      [['index', 'Order played'], ['close', 'Closest finish'], ['blowout', 'Biggest win'], ['long', 'Longest'], ['short', 'Shortest'], ['swings', 'Most lead changes'], ['fill', 'Biggest single fill']]
        .map((o) => `<option value="${o[0]}"${o[0] === run.sort ? ' selected' : ''}>${o[1]}</option>`).join('') +
      '</select></label></div><div class="replay"><div id="replay-box"></div><div class="scroll" id="games-box"></div></div></div>';
  }

  const GAME_SORTS = {
    index: (a, b) => a.index - b.index, close: (a, b) => Math.abs(a.margin) - Math.abs(b.margin),
    blowout: (a, b) => Math.abs(b.margin) - Math.abs(a.margin), long: (a, b) => b.plies - a.plies, short: (a, b) => a.plies - b.plies,
    swings: (a, b) => b.leadChanges - a.leadChanges, fill: (a, b) => b.maxFill - a.maxFill,
  };
  function gamesTableHTML(run) {
    const games = run.conds[0].games.slice().sort(GAME_SORTS[run.sort] || GAME_SORTS.index).slice(0, 200);
    const sel = state.replay ? state.replay.game : null;
    return '<table class="data"><thead><tr><th>#</th><th>X</th><th>O</th><th>Result</th><th class="num">Turns</th><th class="num">Biggest fill</th><th class="num">Lead changes</th></tr></thead><tbody>' +
      games.map((g) => `<tr class="pickable${g === sel ? ' sel' : ''}" data-game="${g.index}"><td class="num">${g.index + 1}</td>` +
        `<td>${esc(g.aIsX ? run.labelA : run.labelB)}</td><td>${esc(g.aIsX ? run.labelB : run.labelA)}</td>` +
        `<td>${g.winner ? NAME[g.winner] + ' wins ' : 'Draw '}${g.x}–${g.o}</td><td class="num">${g.plies}</td><td class="num">${g.maxFill}</td><td class="num">${g.leadChanges}</td></tr>`).join('') +
      '</tbody></table>' + (run.conds[0].games.length > 200 ? '<p class="muted small">Showing the first 200 in this order.</p>' : '');
  }

  function replayBoard(rules, game, k) {
    const st = E.startPosition(rules), board = Array.from(st.board);
    let p = st.first, last = null;
    for (let i = 0; i < k; i++) {
      const mv = game.moves[i];
      if (mv[0] >= 0) for (const c of mv) board[c] = p;
      last = { cell: mv[0], fills: mv.slice(1), p };
      p = 3 - p;
    }
    return { board, turn: p, last };
  }
  function renderReplay() {
    const run = state.run, rules = run.conds[0].rules;
    if (!state.replay) { const g = run.conds[0].games[0]; state.replay = { game: g, k: g.plies, timer: 0 }; }
    const rp = state.replay, g = rp.game, pos = replayBoard(rules, g, rp.k), n = rules.size;
    const lastTxt = pos.last ? `${NAME[pos.last.p]} ${E.cellName(n, pos.last.cell)}${pos.last.fills.length ? ' +' + pos.last.fills.length : ''}` : 'Start position';
    $('#replay-box').innerHTML = boardSVG(n, pos.board, { last: pos.last }) +
      `<input type="range" id="replay-k" min="0" max="${g.plies}" value="${rp.k}" aria-label="Turn">` +
      `<div class="row-between"><span class="muted">Game ${g.index + 1}, turn ${rp.k} of ${g.plies}: ${esc(lastTxt)}</span></div>` +
      `<div class="bar"><button id="replay-play">${rp.timer ? 'Pause' : 'Play'}</button><button id="replay-open">Continue on the Play tab</button></div>`;
    $('#games-box').innerHTML = gamesTableHTML(run);
  }
  function stopReplayTimer() { if (state.replay && state.replay.timer) { clearInterval(state.replay.timer); state.replay.timer = 0; } }

  $('#lab-results').addEventListener('input', (e) => {
    if (e.target.id !== 'replay-k') return;
    stopReplayTimer();
    state.replay.k = +e.target.value;
    // Redraw only the board and caption so the slider keeps its grip.
    const rules = state.run.conds[0].rules, pos = replayBoard(rules, state.replay.game, state.replay.k);
    const old = $('#replay-box svg'), tmp = document.createElement('div');
    tmp.innerHTML = boardSVG(rules.size, pos.board, { last: pos.last });
    old.replaceWith(tmp.firstChild);
    const lastTxt = pos.last ? `${NAME[pos.last.p]} ${E.cellName(rules.size, pos.last.cell)}${pos.last.fills.length ? ' +' + pos.last.fills.length : ''}` : 'Start position';
    $('#replay-box .muted').textContent = `Game ${state.replay.game.index + 1}, turn ${state.replay.k} of ${state.replay.game.plies}: ${lastTxt}`;
  });
  $('#lab-results').addEventListener('change', (e) => {
    if (e.target.id === 'games-sort') { state.run.sort = e.target.value; $('#games-box').innerHTML = gamesTableHTML(state.run); }
    if (e.target.id === 'table-sort') { state.run.sort = e.target.value; renderRun(); }
  });
  $('#lab-results').addEventListener('click', (e) => {
    const run = state.run;
    const row = e.target.closest('tr[data-game]');
    if (row) {
      stopReplayTimer();
      const g = run.conds[0].games.find((x) => x.index === +row.dataset.game);
      state.replay = { game: g, k: g.plies, timer: 0 };
      renderReplay();
      return;
    }
    if (e.target.id === 'replay-play') {
      const rp = state.replay;
      if (rp.timer) { stopReplayTimer(); renderReplay(); return; }
      if (rp.k >= rp.game.plies) rp.k = 0;
      rp.timer = setInterval(() => {
        if (state.replay !== rp || rp.k >= rp.game.plies) { clearInterval(rp.timer); rp.timer = 0; if (state.replay === rp) renderReplay(); return; }
        rp.k++; renderReplay();
      }, 350);
      renderReplay();
      return;
    }
    if (e.target.id === 'replay-open') {
      stopReplayTimer();
      const rules = run.conds[0].rules, pos = replayBoard(rules, state.replay.game, state.replay.k);
      state.rules = E.normalizeRules(rules);
      save(); buildRules(); buildSweepValues();
      state.base = { board: pos.board, turn: pos.turn }; state.history = []; state.lastInfo = null; state.sandbox = false; state.paused = true;
      rebuild(); showTab('play');
      toast('Position loaded with the bots paused. Move for either side, or press Resume bots.');
      return;
    }
    const use = e.target.closest('[data-use]');
    if (use) {
      applyRules(run.conds[+use.dataset.use].rules);
      toast('Loaded into the rules panel. A new game on the Play tab uses it.');
    }
  });

  const TABLE_SORTS = {
    index: () => 0,
    balance: (a, b) => Math.abs(a.summary.xWins - a.summary.oWins) / a.summary.n - Math.abs(b.summary.xWins - b.summary.oWins) / b.summary.n,
    close: (a, b) => a.summary.meanAbsMargin - b.summary.meanAbsMargin,
    swings: (a, b) => b.summary.leadChanges - a.summary.leadChanges,
    long: (a, b) => b.summary.meanTurns - a.summary.meanTurns,
  };
  function tableHTML(run) {
    const starts = run.mode === 'starts', same = JSON.stringify(run.botA) === JSON.stringify(run.botB);
    const rows = run.conds.map((c, i) => ({ c, i })).sort((a, b) => (TABLE_SORTS[run.sort] || TABLE_SORTS.index)(a.c, b.c));
    const head = (starts ? '<th></th><th>Start</th>' : `<th>${esc(run.param)}</th>`) +
      '<th class="num">X wins</th><th class="num">Draw</th><th class="num">O wins</th><th>Split</th>' +
      (same ? '' : '<th class="num">A wins</th><th class="num">B wins</th>') +
      '<th class="num">Turns</th><th class="num">Final margin</th><th class="num">Lead changes</th><th class="num">Fill turns</th><th></th>';
    const body = rows.map(({ c, i }) => {
      const s = c.summary, st = E.startPosition(c.rules);
      return '<tr>' + (starts ? `<td class="thumb">${boardSVG(c.rules.size, st.board, { mini: true })}</td>` : '') + `<td>${esc(c.label)}</td>` +
        `<td class="num">${pct(s.xWins / s.n)}</td><td class="num">${pct(s.draws / s.n)}</td><td class="num">${pct(s.oWins / s.n)}</td><td>${outcomeBar(s)}</td>` +
        (same ? '' : `<td class="num">${pct(s.aWins / s.n)}</td><td class="num">${pct(s.bWins / s.n)}</td>`) +
        `<td class="num">${fmt(s.meanTurns, 1)}</td><td class="num">${fmt(s.meanAbsMargin, 1)}</td><td class="num">${fmt(s.leadChanges, 1)}</td><td class="num">${pct(s.fillShare)}</td>` +
        `<td><button data-use="${i}">Use</button></td></tr>`;
    }).join('');
    const sorts = [['balance', 'Most even between X and O'], ['close', 'Closest finishes'], ['swings', 'Most lead changes'], ['long', 'Longest games'], ['index', 'Order run']];
    return '<div class="card"><div class="head-row">' +
      `<h2>${starts ? 'Start positions' : 'Rule sweep: ' + esc(run.param)}: ${esc(run.labelA)} against ${esc(run.labelB)}, ${fmt(run.conds[0].summary.n)} games each</h2>` +
      `<label class="muted">Order by <select id="table-sort">${sorts.map((o) => `<option value="${o[0]}"${o[0] === run.sort ? ' selected' : ''}>${o[1]}</option>`).join('')}</select></label></div>` +
      `<table class="data"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>${OUTCOME_LEGEND}` +
      '<p class="muted small" style="margin-top:8px">Final margin is the average gap in stones at the end. Fill turns is the share of turns that filled at least one line. Use loads that row\'s rules into the panel on the left.</p></div>';
  }

  /* ---------- Puzzles tab ---------- */
  // Text, positions and the first-move answers come from puzzles-data.js (generated by experiments/puzzle-export.js).
  // Anything beyond that (other fill choices, playing on against the perfect bot, scores on every cell) is solved
  // on the spot by B.solve in a worker: alpha-beta to the end of the game, exact and quick on boards this small.
  const PZ = window.PAPER_OTHELLO_PUZZLES || null;
  const PZ_KEY = 'paper-othello-puzzles-v1';
  const pz = { idx: 0, phase: 'ask', tried: null, step: 1, solved: new Set(), fills: false, scores: true, choose: false,
    ex: null, pending: null, msg: '', checking: false, lineScores: null };
  try {
    const s = JSON.parse(localStorage.getItem(PZ_KEY) || '{}') || {};
    if (Array.isArray(s.solved)) s.solved.forEach((id) => pz.solved.add(id));
    if (PZ && s.idx >= 0 && s.idx < PZ.puzzles.length) pz.idx = s.idx;
    pz.fills = !!s.fills; pz.choose = !!s.choose;
    if (typeof s.scores === 'boolean') pz.scores = s.scores;
  } catch (e) { /* storage blocked: progress just isn't remembered */ }
  function pzSave() {
    try {
      localStorage.setItem(PZ_KEY, JSON.stringify({ solved: [...pz.solved], idx: pz.idx, fills: pz.fills, scores: pz.scores, choose: pz.choose }));
    } catch (e) { /* ignore */ }
  }
  const pzCur = () => PZ.puzzles[pz.idx];
  const pzCell = (name) => (+name[1] - 1) * PZ.rules.size + (name.charCodeAt(0) - 97);
  const pzName = (m) => (m.cell < 0 ? 'pass' : E.cellName(PZ.rules.size, m.cell) + (m.fills.length ? '+' + m.fills.map((c) => E.cellName(PZ.rules.size, c)).join(',') : ''));
  const pzBoard = (p) => Int8Array.from(p.board.split(''), (ch) => '.XO#'.indexOf(ch));
  const sameMove = (a, b) => a.cell === b.cell && a.fills.length === b.fills.length && a.fills.every((f) => b.fills.includes(f));
  const pzList = (ms) => ms.slice(0, 5).map((m) => `<b>${pzName(m)}</b>`).join(', ') + (ms.length > 5 ? ` and ${ms.length - 5} more` : '');
  // final result under perfect play, as a clause: "O wins by 2", "it's a draw", "X loses by 2"
  function pzValue(v, who) {
    return v > 0 ? `<b>${who} wins by ${v}</b>` : v < 0 ? `<b>${who} loses by ${-v}</b>` : 'it\'s <b>a draw</b>';
  }
  const chipSVG = (p) => `<svg class="chip" viewBox="0 0 20 20">${p === 1 ? '<path class="mk x" d="M5 5L15 15M15 5L5 15"/>' : '<ellipse class="mk o" cx="10" cy="10" rx="5.5" ry="5.5"/>'}</svg>`;

  // the puzzle position with a list of moves ({p, cell, fills}) played on it; passes are moves with cell -1
  function pzState(p, moves) {
    const s = E.fromPosition(PZ.rules, pzBoard(p), p.turn);
    for (const m of moves) E.play(s, { cell: m.cell, fills: m.fills, gain: 1 + m.fills.length });
    return s;
  }

  /* exact values, solved in a worker and remembered per position */
  const pzSolver = new Remote(), pzSolved = new Map();
  function pzSolve(s) {
    const key = s.turn + E.boardToString(s.board);
    if (!pzSolved.has(key)) {
      pzSolved.set(key, pzSolver.call({ type: 'solve', rules: PZ.rules, board: Array.from(s.board), turn: s.turn, maxNodes: 4e6 })
        .then((r) => { if (r.cancelled || r.tooBig) pzSolved.delete(key); return r; }));
    }
    return pzSolved.get(key);
  }
  const pzTop = (r) => (r.moves.length ? r.moves[0].v : 0);
  const pzBestMoves = (r) => r.moves.filter((x) => x.v === pzTop(r)).map((x) => x.move);
  const pzValueOf = (r, m) => { const x = r.moves.find((y) => sameMove(y.move, m)); return x ? x.v : null; };
  // per-cell scores for the board: the best value among that cell's fill choices, from the mover's side
  function pzScoreMap(r) {
    const best = new Map(), top = pzTop(r);
    for (const x of r.moves) if (x.move.cell >= 0 && (!best.has(x.move.cell) || x.v > best.get(x.move.cell))) best.set(x.move.cell, x.v);
    const out = new Map();
    for (const [c, v] of best) out.set(c, { text: v > 0 ? '+' + v : v < 0 ? '−' + -v : '0', best: v === top });
    return out;
  }

  /* ---------- playing on against the perfect bot ---------- */
  // ex.start: moves from the puzzle position to where you stepped in; ex.moves: the moves played since.
  function pzExplore(start, label, queued) {
    const s = pzState(pzCur(), start);
    pz.ex = { start, label, side: s.turn, moves: [], token: 0, thinking: false, ready: null, startV: null, queued };
    pz.pending = null; pz.msg = '';
    pzAdvance();
  }
  const pzExState = () => pzState(pzCur(), pz.ex.start.concat(pz.ex.moves));
  function pzAdvance() { // after any change: let the bot answer, or get the player's turn ready
    const ex = pz.ex;
    if (!ex) return;
    const s = pzExState(), token = ++ex.token;
    ex.ready = null; ex.thinking = s.turn !== ex.side && !s.over;
    renderPuzzle();
    if (s.over) return;
    pzSolve(s).then((r) => {
      if (pz.ex !== ex || token !== ex.token) return;
      if (r.tooBig || r.cancelled) { ex.thinking = false; pz.msg = 'This position is too big to solve here.'; renderPuzzle(); return; }
      if (s.turn === ex.side) {
        if (ex.startV === null) ex.startV = pzTop(r);
        if (r.moves.length === 1 && r.moves[0].move.cell < 0) { // no legal cell: the player passes
          ex.moves.push({ p: s.turn, cell: -1, fills: [], note: { pass: true } });
          pzAdvance(); return;
        }
        ex.ready = r; renderPuzzle();
        if (ex.queued !== undefined) { const c = ex.queued; ex.queued = undefined; pzExploreClick(c); }
        return;
      }
      setTimeout(() => { // the bot plays one of its best moves (the first, in engine order) and lists the others
        if (pz.ex !== ex || token !== ex.token) return;
        const best = pzBestMoves(r);
        ex.thinking = false;
        ex.moves.push({ p: s.turn, cell: best[0].cell, fills: Array.from(best[0].fills), note: { v: pzTop(r), alts: best } });
        pzAdvance();
      }, 420);
    }).catch((err) => { ex.thinking = false; pz.msg = 'The solver failed: ' + esc(err.message || err); renderPuzzle(); });
  }
  function pzExploreMove(m) {
    const ex = pz.ex, r = ex.ready, s = pzExState();
    if (!r) return;
    ex.moves.push({ p: s.turn, cell: m.cell, fills: Array.from(m.fills), note: { v: pzValueOf(r, m), top: pzTop(r), best: pzBestMoves(r) } });
    pz.pending = null; pz.msg = '';
    pzAdvance();
  }
  function pzUndo() { // take back your last real move and the bot's answers to it (forced passes go too)
    const ex = pz.ex;
    ex.queued = undefined;
    for (;;) {
      while (ex.moves.length && ex.moves[ex.moves.length - 1].p !== ex.side) ex.moves.pop();
      const m = ex.moves.pop();
      if (!m || m.cell >= 0) break;
    }
    pz.pending = null; pz.msg = '';
    pzAdvance();
  }
  function pzSwapReply(i) { // show one of the bot's other best answers instead
    const ex = pz.ex, last = ex.moves[ex.moves.length - 1];
    if (!last || last.p === ex.side || !last.note.alts || !last.note.alts[i]) return;
    const alt = last.note.alts[i];
    ex.moves[ex.moves.length - 1] = { p: last.p, cell: alt.cell, fills: Array.from(alt.fills), note: last.note };
    pz.pending = null; pz.msg = '';
    pzAdvance();
  }

  /* ---------- rendering ---------- */
  function renderPuzzleNav() {
    $('#pz-nav').innerHTML = PZ.puzzles.map((p, i) =>
      `<button data-pz="${i}" class="${i === pz.idx ? 'on' : ''}${pz.solved.has(p.id) ? ' done' : ''}" ` +
      `aria-label="Puzzle ${p.id}: ${esc(p.title)}${pz.solved.has(p.id) ? ' (solved)' : ''}" data-tip="${esc(p.title)}">${p.id}</button>`).join('');
    $('#pz-count').textContent = `${pz.solved.size} of ${PZ.puzzles.length} solved`;
  }

  // the position the board is showing, and whose clicks count there (null = clicks don't play a move)
  function pzView() {
    const p = pzCur();
    if (pz.ex) {
      const s = pzExState(), ex = pz.ex;
      return { s, active: !s.over && s.turn === ex.side && !ex.thinking && !!ex.ready };
    }
    if (pz.phase === 'ask') return { s: pzState(p, []), active: !pz.checking };
    if (pz.phase === 'wrong') {
      const t = pz.tried;
      return { s: pzState(p, [t.move].concat(t.reply ? [t.reply] : [])), active: false };
    }
    const k = Math.max(0, Math.min(pz.step, p.pv.length)), s = pzState(p, p.pv.slice(0, k));
    return { s, active: !s.over };
  }

  function renderPuzzle() {
    if (!PZ) { $('#tab-puzzles').innerHTML = '<div class="card">The puzzle data (puzzles-data.js) did not load.</div>'; return; }
    const p = pzCur(), g = pzState(p, []), mover = p.turn, opp = 3 - mover, n = PZ.rules.size;
    const open = pz.phase === 'right' || pz.phase === 'shown', ex = pz.ex;
    renderPuzzleNav();
    $('#pz-title').textContent = `Puzzle ${p.id}: ${p.title}`;
    $('#pz-who').innerHTML = `${chipSVG(mover)}<b>${NAME[mover]}</b> to move · score ${NAME[mover]} ${g.count[mover]} – ${NAME[opp]} ${g.count[opp]}`;
    $('#pz-prompt').innerHTML = p.prompt;
    $('#pz-prev').disabled = pz.idx === 0;
    $('#pz-next').disabled = pz.idx === PZ.puzzles.length - 1;
    $('#pz-fills').checked = pz.fills; $('#pz-scores').checked = pz.scores; $('#pz-choose').checked = pz.choose;
    $('#pz-fills-wrap').hidden = !(pz.phase === 'ask' && !ex);
    $('#pz-scores-wrap').hidden = !(open || ex);

    const view = pzView(), s = view.s, legal = view.active ? E.legalCells(s) : [];
    const opts = { labels: true, interactive: true, clickable: 'all', legal, mover: s.turn };
    const fb = $('#pz-feedback');
    if (ex) {
      const all = ex.start.concat(ex.moves);
      opts.tints = all.slice(-2, -1); opts.last = all[all.length - 1];
      if (view.active && pz.scores) opts.scores = pzScoreMap(ex.ready);
      fb.className = 'pz-feedback';
      fb.innerHTML = `You are playing on from ${ex.label} as <b>${NAME[ex.side]}</b>; the perfect bot plays <b>${NAME[3 - ex.side]}</b>.`;
    } else if (pz.phase === 'ask') {
      if (pz.fills) { opts.hints = new Map(); for (const c of legal) { const k = E.fillSize(s, c, mover); if (k) opts.hints.set(c, '+' + k); } }
      fb.className = 'pz-feedback' + (pz.msg ? ' bad' : '');
      fb.innerHTML = pz.msg || (pz.checking ? 'Checking…' : `Find the best move for <b>${NAME[mover]}</b>. Click a cell to play it` +
        (pz.choose ? '; then pick which lines to fill and click the cell again.' : ' (it fills every line it makes). Hover a cell to preview.'));
    } else if (pz.phase === 'wrong') {
      const t = pz.tried;
      opts.tints = [t.move]; if (t.reply) opts.last = t.reply;
      fb.className = 'pz-feedback bad';
      fb.innerHTML = `<b>${pzName(t.move)}</b> isn't the best move. ` +
        (t.reply ? `${NAME[opp]}'s best answer is <b>${pzName(t.reply)}</b>${t.reply.fills.length ? ` (fills ${t.reply.fills.length})` : ''}. ` : '') +
        `With perfect play from here, ${pzValue(t.v, NAME[mover])}. ` +
        `One move does better: with it ${pzValue(p.bestV, NAME[mover])}. ` +
        'Click the board to try again, or play on from here against the perfect bot.';
    } else {
      const k = Math.max(0, Math.min(pz.step, p.pv.length));
      if (k > 0) opts.last = p.pv[k - 1];
      if (view.active && pz.scores && pz.lineScores && pz.lineScores.key === s.turn + E.boardToString(s.board)) opts.scores = pz.lineScores.map;
      const best = { p: mover, cell: p.best, fills: p.moves[p.best].fills };
      const second = Math.max(...Object.entries(p.moves).filter(([c]) => +c !== p.best).map(([, x]) => x.v));
      fb.className = 'pz-feedback ' + (pz.phase === 'right' ? 'good' : '');
      fb.innerHTML = (pz.phase === 'right' ? `<b>${pzName(best)}</b> is right! ` : `The answer is <b>${pzName(best)}</b>. `) +
        `With perfect play, ${pzValue(p.bestV, NAME[mover])}. After the next best move, ${pzValue(second, NAME[mover])}.`;
    }
    if (pz.pending && view.active) { opts.pending = pz.pending; }
    $('#pz-board').innerHTML = boardSVG(n, s.board, opts);

    $('#pz-solution').hidden = !open;
    $('#pz-solution-text').innerHTML = open ? p.solution : '';
    $('#pz-show').hidden = open || !!ex;
    $('#pz-retry').hidden = pz.phase === 'ask' || !!ex;
    $('#pz-playon').hidden = pz.phase !== 'wrong' || !!ex;
    $('#pz-line').hidden = !open || !!ex;
    $('#pz-explore').hidden = !ex;
    if (open && !ex) renderPuzzleLine(p, s);
    if (ex) renderExplore(p, s);
  }

  function renderPuzzleLine(p, s) {
    const k = Math.max(0, Math.min(pz.step, p.pv.length)), m = p.pv[k - 1];
    $('#pz-step-back').disabled = k === 0;
    $('#pz-step-fwd').disabled = k === p.pv.length;
    $('#pz-line-play').disabled = s.over;
    $('#pz-step-text').innerHTML = k === 0 ? 'Start position.' :
      `Move ${k} of ${p.pv.length}: <b>${NAME[m.p]} ${pzName(m)}</b>` +
      (k === p.pv.length ? ` · final score X ${p.final[0]} – O ${p.final[1]}` : '');
    $('#pz-line-hint').innerHTML = s.over ? '' : `To try something else, click any cell for <b>${NAME[s.turn]}</b> on the board: ` +
      'you take over that side from this point and the perfect bot answers.';
    $('#pz-moves').innerHTML = p.pv.map((x, i) => `<li class="${i < k ? 'done' : ''}" data-step="${i + 1}"><b>${NAME[x.p]}</b> ${pzName(x)}</li>`).join('');
    // scores on the board for this step (cached per position)
    const key = s.turn + E.boardToString(s.board);
    if (pz.scores && !s.over && (!pz.lineScores || pz.lineScores.key !== key)) {
      pzSolve(s).then((r) => {
        if (r.tooBig || r.cancelled || pz.ex) return;
        const cur = pzView().s;
        if (cur.turn + E.boardToString(cur.board) !== key) return;
        pz.lineScores = { key, map: pzScoreMap(r) };
        renderPuzzle();
      }).catch(() => {});
    }
  }

  function renderExplore(p, s) {
    const ex = pz.ex, me = NAME[ex.side], bot = NAME[3 - ex.side];
    $('#pz-ex-sub').innerHTML = `From ${ex.label}, perfect play gives: ` +
      (ex.startV === null ? '…' : pzValue(ex.startV, me)) + '. Each of your moves is measured against that.';
    let st;
    if (s.over) {
      const mine = s.count[ex.side], theirs = s.count[3 - ex.side], diff = mine - theirs;
      st = `<b>Game over</b>: ${me} ${mine} – ${bot} ${theirs}. ` + (diff > 0 ? `${me} wins by ${diff}.` : diff < 0 ? `${me} loses by ${-diff}.` : 'A draw.') +
        (ex.startV !== null ? ` Perfect play from where you stepped in: ${pzValue(ex.startV, me)}.` : '');
    } else if (pz.msg) st = pz.msg;
    else if (ex.thinking) st = `${bot} is thinking…`;
    else if (!ex.ready) st = 'Working out the position…';
    else st = `Your move as <b>${me}</b>. With perfect play from here, ${pzValue(pzTop(ex.ready), me)}.` +
      (pz.scores ? ' The numbers on the board are the final result of each move for you.' : '') +
      (pz.pending ? ' Click a faded line to switch it on or off, then click the cell again.' : '');
    $('#pz-ex-status').innerHTML = st;
    $('#pz-ex-status').className = 'pz-feedback' + (pz.msg ? ' bad' : '');

    // the last move of yours and the bot's answer to it
    let last = '';
    const lastMine = [...ex.moves].reverse().find((m) => m.p === ex.side && m.cell >= 0);
    if (lastMine) {
      const nt = lastMine.note, cost = nt.top - nt.v;
      last += `<p>You played <b>${pzName(lastMine)}</b>. ` + (cost === 0 ? `That's a best move (${pzValue(nt.v, me)}).` :
        `With perfect play that leaves ${pzValue(nt.v, me)}; the best ${nt.best.length > 1 ? 'moves were' : 'move was'} ` +
        `${pzList(nt.best)} (${pzValue(nt.top, me)}). <span class="cost">It cost ${cost} stone${cost === 1 ? '' : 's'}.</span>`) + '</p>';
    }
    const lastMove = ex.moves[ex.moves.length - 1];
    if (lastMove && lastMove.p !== ex.side) {
      const nt = lastMove.note, others = nt.alts.map((a, i) => ({ a, i })).filter((x) => !sameMove(x.a, lastMove));
      last += `<p>${bot} answered <b>${pzName(lastMove)}</b>` + (lastMove.cell < 0 ? ' (no legal move)' : '') + '. ' +
        (others.length ? `It has ${nt.alts.length} equally good moves; see another instead: ` +
          others.map((x) => `<button class="link" data-alt="${x.i}">${pzName(x.a)}</button>`).join(', ') + '.' :
          (lastMove.cell >= 0 ? 'It was its only best move.' : '')) + '</p>';
    }
    $('#pz-ex-last').innerHTML = last;
    $('#pz-ex-undo').disabled = !ex.moves.some((m) => m.p === ex.side && m.cell >= 0);
    $('#pz-ex-exit').textContent = pz.phase === 'wrong' ? 'Stop playing' : 'Back to the perfect line';
    $('#pz-ex-log').innerHTML = ex.moves.map((m) => {
      const nt = m.note || {};
      let tag = '';
      if (m.p === ex.side && m.cell >= 0) { const c = nt.top - nt.v; tag = c > 0 ? `<span class="cost">−${c}</span>` : '<span class="ok">best</span>'; }
      if (m.p !== ex.side && nt.alts && nt.alts.length > 1) tag = `<span class="muted">1 of ${nt.alts.length} best</span>`;
      return `<li><b>${NAME[m.p]}</b> ${pzName(m)} ${tag}</li>`;
    }).join('');
  }

  /* ---------- input ---------- */
  function pzPick(i) {
    pz.idx = i; pz.phase = 'ask'; pz.tried = null; pz.step = 1; pz.ex = null; pz.pending = null; pz.msg = ''; pz.lineScores = null;
    pzSave(); renderPuzzle();
  }
  function pzIllegal(s, c) {
    const v = s.board[c], n = PZ.rules.size;
    return v === 3 ? 'That is the blocked centre cell.' : v ? `${E.cellName(n, c)} is already taken.` :
      `${E.cellName(n, c)} doesn't touch an ${NAME[3 - s.turn]} mark, so ${NAME[s.turn]} can't play there.`;
  }
  // shared by every mode: a click either builds a move (calls done(move)), opens the line chooser, or explains
  function pzTakeClick(s, c, done) {
    const pd = pz.pending;
    if (pd) {
      if (c === pd.cell) { pz.pending = null; return done({ cell: pd.cell, fills: [].concat(...pd.lines.filter((_, i) => pd.on[i])) }); }
      const li = pd.lines.findIndex((l) => l.includes(c));
      if (li >= 0) { pd.on[li] = !pd.on[li]; renderPuzzle(); return; }
      pz.pending = null;
    }
    if (!E.legalCells(s).includes(c)) { pz.msg = pzIllegal(s, c); renderPuzzle(); return; }
    pz.msg = '';
    const lines = E.linesAt(s, c);
    if (pz.choose && lines.length) { pz.pending = { cell: c, lines, on: lines.map(() => true) }; renderPuzzle(); return; }
    done({ cell: c, fills: [].concat(...lines) });
  }
  function pzExploreClick(c) { const v = pzView(); if (v.active) pzTakeClick(v.s, c, pzExploreMove); }

  function pzAnswer(m) { // grade a first try
    const p = pzCur(), full = p.moves[m.cell], mine = { p: p.turn, cell: m.cell, fills: m.fills };
    const finish = (v, reply) => {
      pz.checking = false;
      pz.tried = { move: mine, v, reply };
      if (v === p.bestV) { pz.phase = 'right'; pz.step = 1; pz.solved.add(p.id); pzSave(); } else pz.phase = 'wrong';
      renderPuzzle();
    };
    if (full && sameMove({ cell: m.cell, fills: full.fills }, m)) return finish(full.v, full.line[0] || null);
    // another choice of lines: not in the data file, so solve it
    pz.checking = true; renderPuzzle();
    const after = pzState(p, [mine]), idx = pz.idx;
    Promise.all([pzSolve(pzState(p, [])), after.over ? null : pzSolve(after)]).then(([r0, r1]) => {
      if (pz.idx !== idx || pz.phase !== 'ask') return;
      if (r0.tooBig || (r1 && r1.tooBig)) { pz.checking = false; pz.msg = 'Too big to solve here.'; renderPuzzle(); return; }
      const rb = r1 && r1.moves.length ? r1.moves[0].move : null;
      finish(pzValueOf(r0, m), rb && { p: after.turn, cell: rb.cell, fills: Array.from(rb.fills) });
    }).catch((err) => { pz.checking = false; pz.msg = 'The solver failed: ' + esc(err.message || err); renderPuzzle(); });
  }

  function pzClick(c) {
    const p = pzCur();
    if (pz.ex) return pzExploreClick(c);
    if (pz.phase === 'wrong') { pz.phase = 'ask'; pz.tried = null; }
    if (pz.phase === 'ask') { if (!pz.checking) pzTakeClick(pzState(p, []), c, pzAnswer); return; }
    // perfect line on screen: a click steps in for the side to move at this step
    const v = pzView();
    if (!v.active) return;
    if (!E.legalCells(v.s).includes(c) && !pz.pending) { pz.msg = ''; return; }
    const k = Math.max(0, Math.min(pz.step, p.pv.length));
    pzExplore(p.pv.slice(0, k), k === 0 ? 'the puzzle position' : `move ${k} of the perfect line`, c);
  }

  function bindPuzzles() {
    if (!PZ) return;
    $('#pz-lead').innerHTML = PZ.lead;
    $('#pz-intro').innerHTML = PZ.intro;
    const st = E.newGame(PZ.rules);
    $('#pz-start').innerHTML = boardSVG(PZ.rules.size, st.board, { labels: true });
    $('#pz-lessons').innerHTML = PZ.lessons;
    $('#pz-nav').addEventListener('click', (e) => { const b = e.target.closest('[data-pz]'); if (b) pzPick(+b.dataset.pz); });
    $('#pz-prev').addEventListener('click', () => { if (pz.idx > 0) pzPick(pz.idx - 1); });
    $('#pz-next').addEventListener('click', () => { if (pz.idx < PZ.puzzles.length - 1) pzPick(pz.idx + 1); });
    $('#pz-show').addEventListener('click', () => { pz.phase = 'shown'; pz.step = 1; pz.pending = null; pz.msg = ''; renderPuzzle(); });
    $('#pz-retry').addEventListener('click', () => { pz.phase = 'ask'; pz.tried = null; pz.msg = ''; renderPuzzle(); });
    $('#pz-playon').addEventListener('click', () => {
      const t = pz.tried;
      pzExplore([t.move].concat(t.reply ? [t.reply] : []), 'your first try');
    });
    $('#pz-fills').addEventListener('change', (e) => { pz.fills = e.target.checked; pzSave(); renderPuzzle(); });
    $('#pz-scores').addEventListener('change', (e) => { pz.scores = e.target.checked; pzSave(); renderPuzzle(); });
    $('#pz-choose').addEventListener('change', (e) => { pz.choose = e.target.checked; pz.pending = null; pzSave(); renderPuzzle(); });
    const step = (d) => { pz.step += d; pz.pending = null; renderPuzzle(); };
    $('#pz-step-back').addEventListener('click', () => step(-1));
    $('#pz-step-fwd').addEventListener('click', () => step(1));
    $('#pz-line-play').addEventListener('click', () => {
      const p = pzCur(), k = Math.max(0, Math.min(pz.step, p.pv.length));
      pzExplore(p.pv.slice(0, k), k === 0 ? 'the puzzle position' : `move ${k} of the perfect line`);
    });
    $('#pz-moves').addEventListener('click', (e) => { const li = e.target.closest('[data-step]'); if (li) { pz.step = +li.dataset.step; pz.pending = null; renderPuzzle(); } });
    $('#pz-ex-undo').addEventListener('click', pzUndo);
    $('#pz-ex-exit').addEventListener('click', () => { pz.ex = null; pz.pending = null; pz.msg = ''; renderPuzzle(); });
    $('#pz-ex-last').addEventListener('click', (e) => { const b = e.target.closest('[data-alt]'); if (b) pzSwapReply(+b.dataset.alt); });
    const bd = $('#pz-board');
    bd.addEventListener('click', (e) => { const t = e.target.closest('.hit'); if (t) pzClick(+t.dataset.c); });
    bd.addEventListener('pointerover', (e) => { // preview the mark and its fills, like the Play tab
      const gh = $('.ghost', bd), t = e.target.closest('.hit');
      if (!gh) return;
      const v = pzView(), c = t ? +t.dataset.c : -1;
      if (!v.active || pz.pending || c < 0 || !E.legalCells(v.s).includes(c)) { gh.innerHTML = ''; return; }
      gh.innerHTML = [c].concat(...E.linesAt(v.s, c)).map((f) => markSVG(f, v.s.turn, PZ.rules.size, 'gh')).join('');
    });
    bd.addEventListener('pointerleave', () => { const gh = $('.ghost', bd); if (gh) gh.innerHTML = ''; });
    // cell names in the text light up their cell on the board
    $('#tab-puzzles').addEventListener('pointerover', (e) => {
      const r = e.target.closest && e.target.closest('.cellref'), gh = $('.ghost', bd);
      if (!gh || bd.contains(e.target)) return;
      if (!r) { if (gh.dataset.ref) { gh.innerHTML = ''; delete gh.dataset.ref; } return; }
      const c = pzCell(r.dataset.cell), U2 = U / 2, n = PZ.rules.size;
      gh.dataset.ref = '1';
      gh.innerHTML = `<rect class="refmark" x="${(c % n) * U + 2}" y="${((c / n) | 0) * U + 2}" width="${U - 4}" height="${U - 4}" rx="5"/>` +
        `<circle class="ring" cx="${(c % n) * U + U2}" cy="${((c / n) | 0) * U + U2}" r="17"/>`;
    });
    document.addEventListener('keydown', (e) => {
      if ($('#tab-puzzles').hidden || e.target.closest('input, select, textarea')) return;
      if (pz.pending && e.key === 'Escape') { pz.pending = null; renderPuzzle(); return; }
      const open = (pz.phase === 'right' || pz.phase === 'shown') && !pz.ex;
      if (open && e.key === 'ArrowRight' && pz.step < pzCur().pv.length) step(1);
      if (open && e.key === 'ArrowLeft' && pz.step > 0) step(-1);
    });
  }

  /* =====================================================================
   *  TUNE: self-improving evaluator, saved bots
   * ===================================================================== */
  // Everything is filed under a ruleset key (T.rulesKey), so the same rules entered again find their
  // earlier tuning session and bots. { rulesets: { key: { key, id, name, rules, created, session, bots } } }
  const TKEY = 'paper-othello-tuning-v1';
  let tstore = null;
  try { tstore = JSON.parse(localStorage.getItem(TKEY) || 'null'); } catch (e) { tstore = null; }
  if (!tstore || typeof tstore.rulesets !== 'object' || !tstore.rulesets) tstore = { rulesets: {} };
  // One tuning run per starting bot: rec.sessions[startId]. Older data had a single Minimax run in rec.session.
  function upgradeSession(sess) {
    if (!sess || !sess.theta) return null;
    if (!sess.start || typeof sess.start === 'object') { sess.initial = sess.initial || sess.start; sess.start = 'default'; }
    sess.vs = sess.vs || 'minimax';
    sess.train = sess.train || 'field'; // older runs were self-play; they carry on against the field (results/31)
    // older runs checked with 50 pairs every 25 steps (±70 Elo per check); measure them like new runs
    if (sess.checkEvery === 25 && sess.checkPairs === 50) { sess.checkEvery = T.DEFAULTS.checkEvery; sess.checkPairs = T.DEFAULTS.checkPairs; }
    return sess;
  }
  function upgradeRec(r) {
    r.sessions = r.sessions || {};
    const old = upgradeSession(r.session);
    if (old && !r.sessions[old.start]) r.sessions[old.start] = old;
    delete r.session;
    for (const k in r.sessions) if (!upgradeSession(r.sessions[k])) delete r.sessions[k];
    r.bots = r.bots || [];
    return r;
  }
  for (const k in tstore.rulesets) upgradeRec(tstore.rulesets[k]);
  if (!T.STARTS.some((x) => x.id === tstore.pick)) tstore.pick = 'default';
  const recSteps = (rec) => Object.values(rec.sessions).reduce((a, x) => a + (x.iter || 0), 0);
  function tsave() {
    try { localStorage.setItem(TKEY, JSON.stringify(tstore)); } catch (e) { toast('Could not save tuning data: browser storage is full or blocked. Export your bots.'); }
  }
  function recFor(rules, create) {
    const key = T.rulesKey(rules);
    let rec = tstore.rulesets[key];
    if (!rec && create) {
      rec = tstore.rulesets[key] = { key, id: T.shortId(key), name: '', rules: E.normalizeRules(rules), created: Date.now(), sessions: {}, bots: [] };
    }
    return rec || null;
  }
  const recLabel = (rec) => (rec.name ? rec.name + ' (' + rec.id + ')' : 'ruleset ' + rec.id);
  function allBots() {
    const out = [];
    for (const k in tstore.rulesets) for (const bot of tstore.rulesets[k].bots) out.push({ rec: tstore.rulesets[k], bot });
    return out;
  }
  function findBot(id) { return allBots().find((x) => x.bot.id === id) || null; }
  const eloText = (v) => (v >= 0 ? '+' : '−') + fmt(Math.abs(v));
  const botStart = (bot) => T.startById(bot.start || 'default');
  function resolveSpec(spec) {
    if (spec.type === 'saved') {
      const f = findBot(spec.id);
      if (f) return T.playSpec(botStart(f.bot).id, f.bot.weights, spec.depth || f.bot.depth, f.bot.name, f.bot);
      return { type: 'minimax', depth: spec.depth || 3, weights: state.weights };
    }
    const out = Object.assign({}, spec);
    if (out.type === 'minimax') out.weights = state.weights;
    return out;
  }

  const tunePool = makePool(), ratePool = makePool();
  const tn = { running: false, rec: null, pick: null, t0: 0, g0: 0, lastSave: 0, lastPaint: 0, rating: null, drafts: {}, cross: null };
  const tnDraft = () => (tn.drafts[tstore.pick] = tn.drafts[tstore.pick] || Object.assign(T.draftFor(tstore.pick), { tune: null, vs: 'ladder' }, T.familyOf(tstore.pick).td ? { td: Object.assign({}, T.TD) } : {}));
  // Whether the session (or the draft for a new one) lets weights change over the game.
  const tnPhased = () => { const s = tnSess(); return s ? !!s.phased : tnDraft().phased !== false && tnFam().phase; };
  const tnSess = () => { const r = recFor(state.rules, false); return (r && r.sessions[tstore.pick]) || null; };
  const tnOpts = () => tnSess() || tnDraft();
  const tnFam = () => T.familyOf(tstore.pick);
  const tnTuneList = () => T.defaultTune(tnFam());

  // Plays the jobs (one per game pair) and returns bot A's points per pair, or null if stopped.
  function playPairs(p, jobs, onTick) {
    const pts = new Array(jobs.length).fill(null);
    let done = 0;
    jobs.forEach((j, i) => { j.idx = i; });
    return p.run(jobs, (job, games) => { pts[job.idx] = T.points(games); done++; if (onTick) onTick(done, jobs.length); })
      .then(() => (p.cancelled || pts.some((x) => x === null) ? null : pts));
  }
  const seedsFor = (n, base) => Array.from({ length: n }, (_, j) => (base + j) >>> 0);

  // A run measured against its start only because its rules had no ladder goes back to ladder checks once they have
  // one (a frozen pool such as ysbvl's, or one built on the Ladder tab). A choice made in the menu (vsChosen) stays.
  function ladderAgain(o, key) {
    if (o && o.vs === 'start' && !o.vsChosen && ladderForKey(key)) o.vs = 'ladder';
  }
  async function tuneLoop() {
    const rec = recFor(state.rules, true), pick = tstore.pick;
    if (!rec.sessions[pick]) {
      const o = Object.assign({}, tnDraft(), { start: pick, seed: ((Math.random() * 1e6) | 0) + 1 });
      if (!o.tune) delete o.tune;
      if (o.vs === 'ladder' && !ladderForKey(rec.key)) o.vs = 'start';
      rec.sessions[pick] = T.newSession(o.weights || null, o);
    }
    const sess = rec.sessions[pick], rules = E.normalizeRules(rec.rules);
    ladderAgain(sess, rec.key);
    Object.assign(tn, { running: true, rec, pick, t0: performance.now(), g0: sess.games });
    tsave(); renderTune(); refreshRulesId();
    try {
      if (T.familyOf(pick).td) await tdLoop(sess, rules, rec);
      while (tn.running && !T.familyOf(pick).td) {
        // Check first (so a new run shows where its starting bot stands), then every checkEvery steps.
        // (After "go back to the best checkpoint", sess.recheck asks for a check of those weights straight away.)
        const last = sess.history[sess.history.length - 1];
        if (sess.recheck || (sess.iter % sess.checkEvery === 0 && !(last && last.iter === sess.iter && last.vs === T.versusName(sess)))) {
          const pt = await tuneCheck(sess, rules, rec);
          if (!pt) break;
          sess.games += pt.games;
          pt.train = T.takeTrain(sess); // the training score since the previous check
          sess.history.push(pt);
          if (sess.history.length > 1000) sess.history.shift();
          T.afterCheck(sess, pt); // keeps the best checkpoint
          delete sess.recheck;
          renderTuneLive();
        }
        const p = T.propose(sess, B.rng(sess.seed * 7919 + sess.iter));
        const st = T.stepJobs(sess, rules, p, sess.seed * 100003 + sess.iter * 1009, tunePool.size); // field or self-play
        const pts = await playPairs(tunePool, st.jobs);
        if (!pts) break;
        T.noteTrain(sess, st.score(pts), st.games);
        T.update(sess, p.delta, st.signal(pts));
        sess.games += st.games;
        const now = performance.now();
        if (now - tn.lastSave > 4000) { tsave(); tn.lastSave = now; }
        if (now - tn.lastPaint > 400) { tn.lastPaint = now; renderTuneLive(); }
      }
    } catch (err) { toast('Tuning failed: ' + err.message); }
    tn.running = false; tn.rec = null; tn.pick = null;
    tsave(); renderTune(); refreshRulesId();
  }
  // Pattern tables (results/33): instead of SPSA steps, every worker plays sess.td.games self-play games from the
  // current float weights and learns from them (TD), and the page merges what the workers changed (per entry, the
  // mean change of the workers that changed it). Checks quantise the weights to the int8 table the bot plays with (sess.patterns, under
  // sess.tableId) and measure it like any other run. The float weights live in tn.master while the page is open; after
  // a reload a run carries on from its last check's table.
  function tdMaster(sess) {
    if (tn.master && tn.masterSess === sess) return tn.master;
    const set = B.patSet(sess.td.shapes, sess.td.stages), w = new Float32Array(set.len);
    const src = sess.patterns || (sess.td.from === 'mix' && typeof PATTERNS_DATA !== 'undefined' ? PATTERNS_DATA : null);
    if (src) {
      const t = B.decodeTable(src);
      if (t.set.names === set.names && t.set.ns === set.ns) for (let i = 0; i < w.length; i++) w[i] = t.w[i] / t.scale;
    }
    tn.master = w; tn.masterSess = sess;
    return w;
  }
  function tdPublish(sess) {
    const set = B.patSet(sess.td.shapes, sess.td.stages);
    sess.patterns = B.encodeTable(B.quantize(set, tdMaster(sess), 32));
    putTable(sess.tableId, sess.patterns);
  }
  async function tdLoop(sess, rules, rec) {
    if (!sess.tableId) sess.tableId = 'run:' + rec.id;
    const master = tdMaster(sess), set = B.patSet(sess.td.shapes, sess.td.stages);
    let err = { s: 0, n: 0 };
    while (tn.running) {
      const last = sess.history[sess.history.length - 1];
      if (sess.iter % sess.checkEvery === 0 && !(last && last.iter === sess.iter && last.vs === T.versusName(sess))) {
        tdPublish(sess);
        const pt = await tuneCheck(sess, rules, rec);
        if (!pt) break;
        sess.games += pt.games;
        if (err.n) pt.tdErr = +(err.s / err.n).toFixed(3); // mean |prediction error| (stones) since the last check
        err = { s: 0, n: 0 };
        sess.history.push(pt);
        if (sess.history.length > 1000) sess.history.shift();
        tsave(); renderTuneLive(); renderPatViz();
      }
      tunePool.cancelled = false;
      while (tunePool.remotes.length < tunePool.size) tunePool.remotes.push(new Remote());
      const alpha = T.tdAlpha(sess), td = sess.td;
      const res = await Promise.all(tunePool.remotes.map((r, k) => r.call({ type: 'td', rules, shapes: set.names, stages: set.ns, w: master,
        games: td.games, alpha, lambda: td.lambda, eps: td.eps, opening: sess.opening, seed: (sess.seed * 7919 + sess.iter * 64 + k) >>> 0 })));
      if (!tn.running || res.some((r) => r.cancelled || !r.td)) break;
      // Each entry moves by the AVERAGE change of the workers that changed it. (Adding the changes up diverged: every
      // worker corrects common entries such as the bias almost fully, so k workers overshot k-fold.) Rare entries,
      // seen by one worker, still move at full speed.
      const add = new Float32Array(master.length), cnt = new Uint8Array(master.length);
      for (const r of res) {
        const w = r.td.w;
        for (let i = 0; i < w.length; i++) { const d = w[i] - master[i]; if (d) { add[i] += d; cnt[i]++; } }
        err.s += r.td.err * r.td.positions; err.n += r.td.positions;
      }
      for (let i = 0; i < master.length; i++) if (cnt[i]) master[i] += add[i] / cnt[i];
      sess.iter++;
      sess.games += res.length * td.games;
      const now = performance.now();
      if (now - tn.lastSave > 15000) { tdPublish(sess); tsave(); tn.lastSave = now; }
      if (now - tn.lastPaint > 400) { tn.lastPaint = now; renderTuneLive(); }
    }
    if (sess.iter) tdPublish(sess);
  }

  // One progress check. Against the ladder: a few cheap pool bots near the bot's current rating, then its ladder Elo
  // fitted with the pool held fixed (as on the Ladder tab). Otherwise: one opponent, Elo relative to it.
  async function tuneCheck(sess, rules, rec) {
    const me = T.sessSpec(sess, Object.assign({}, sess.theta)), base = T.checkSeed(sess); // the same openings every check
    const l = sess.vs === 'ladder' ? ladderForKey(rec.key) : null;
    if (sess.vs === 'ladder' && !l) sess.vs = 'start'; // the ladder for these rules is gone
    if (!l) {
      const cp = await playPairs(tunePool, T.pairJobs(rules, me, T.versusSpec(sess), seedsFor(sess.checkPairs, base), sess.opening));
      if (!cp) return null;
      const st = T.eloStats(cp);
      return { iter: sess.iter, depth: sess.depth, vs: T.versusName(sess), elo: st.elo, lo: st.lo, hi: st.hi, score: st.score, games: st.games, t: Date.now() };
    }
    const opps = T.ladderPanel(l, sess, SLOW), per = Math.max(2, Math.ceil(sess.checkPairs / opps.length)); // re-centred only when the rating has moved
    const jobs = [], owner = [];
    opps.forEach((o, k) => { for (const j of T.pairJobs(rules, me, o.spec, seedsFor(per, base + k * 7919), ladderOp(l))) { jobs.push(j); owner.push(k); } });
    const pts = await playPairs(tunePool, jobs);
    if (!pts) return null;
    const res = opps.map((o) => ({ id: o.id, name: o.name, elo: o.elo, s: 0, n: 0 }));
    pts.forEach((p, i) => { res[owner[i]].s += p; res[owner[i]].n += 2; });
    const f = Lad.fitOne(res);
    sess.ladderElo = f.elo; sess.ladderId = l.id;
    return { iter: sess.iter, depth: sess.depth, kind: 'ladder', ladder: l.id, vs: T.versusName(sess), elo: f.elo, lo: f.elo - 1.96 * f.se,
      hi: f.elo + 1.96 * f.se, score: f.score, games: f.games, opps: res.map((r) => [r.id, r.name, r.elo, r.s, r.n]), t: Date.now() };
  }
  function tuneStop() { if (!tn.running) return; tn.running = false; tunePool.cancel(); }

  // Rates a saved bot on the ladder for its rules: its games go into the game log and every rating is refitted.
  // Rules without a ladder have no Elo scale yet, so the bot stays unrated until one is built (Ladder tab).
  async function rateBot(bot, rec, pairs) {
    if (tn.rating) { toast('Already rating a bot. Wait for it to finish.'); return; }
    const l = ladderForKey(rec.key);
    if (!l) { toast(`${bot.name} is unrated: these rules have no ladder yet. Build one on the Ladder tab, then rate it.`); renderTune(); return; }
    tn.rating = { id: bot.id, done: 0, total: pairs };
    renderTuneBots();
    const tick = (d, t) => { tn.rating.done = d; tn.rating.total = t; if (!$('#tab-tune').hidden) renderRatingProgress(); };
    try {
      const f = await ladderFit(l, bot, pairs, ratePool, tick);
      if (f) toast(`${bot.name}: ${fmt(f.elo)} Elo on the ${l.name} ladder.`);
    } catch (err) { toast('Rating failed: ' + err.message); }
    tn.rating = null;
    refreshPickers(); renderTune();
  }

  /* ---------- rendering ---------- */
  function refreshRulesId() {
    const el = $('#rules-id');
    if (!el) return;
    const rec = recFor(state.rules, false), own = $('#rid-own');
    if (own) own.textContent = rec && rec.name ? rec.name : '';
    if (!rec) { el.textContent = 'Not tuned yet.'; return; }
    const parts = [];
    if (recSteps(rec)) parts.push(fmt(recSteps(rec)) + ' tuning steps');
    if (rec.bots.length) parts.push(rec.bots.length + ' saved bot' + (rec.bots.length === 1 ? '' : 's'));
    el.innerHTML = `<button class="link" data-goto-tune>Tuned</button>` + (parts.length ? ': ' + parts.join(', ') : '');
  }

  function renderTune() {
    $('#tn-rules').textContent = E.describeRules(state.rules);
    const rec = recFor(state.rules, false), sess = tnSess(), o = tnOpts(), st0 = T.startById(tstore.pick);
    if (!tn.running) ladderAgain(o, T.rulesKey(state.rules));
    const id = T.shortId(T.rulesKey(state.rules));
    let seen;
    if (!rec) seen = `<b>New ruleset</b> (${esc(id)}). Nothing has been tuned or saved for these rules yet.`;
    else {
      const bits = [];
      for (const k in rec.sessions) if (rec.sessions[k].iter) bits.push(`${esc(T.startById(k).name)}: ${fmt(rec.sessions[k].iter)} steps (${fmt(rec.sessions[k].games)} games)`);
      if (rec.bots.length) bits.push(`${rec.bots.length} saved bot${rec.bots.length === 1 ? '' : 's'}`);
      seen = `<b>You have tuned these rules before</b>: ${bits.join(', ') || 'no steps yet'}. Starting carries on where you left off.`;
    }
    $('#tn-seen').innerHTML = `<p>${seen}</p>` + (rec ? `<label class="tn-rname">Name for these rules <input type="text" id="tn-rname" maxlength="40" value="${esc(rec.name || '')}" placeholder="${esc(id)}"></label>` : '');
    const setv = (sel, v) => { $(sel).value = v; };
    setv('#tn-depth', o.depth); setv('#tn-vsdepth', o.vsDepth || 0); setv('#tn-pairs', o.pairs); setv('#tn-gain', o.gain); setv('#tn-opening', o.opening);
    setv('#tn-every', o.checkEvery); setv('#tn-checkpairs', o.checkPairs);
    setv('#tn-q', o.qDepth | 0); setv('#tn-qmin', o.qMin === undefined ? 1 : o.qMin); setv('#tn-end', o.endAt | 0);
    $('#tn-qmin').disabled = !(o.qDepth > 0);
    const steps = (k) => (rec && rec.sessions[k] && rec.sessions[k].iter ? ` · ${fmt(rec.sessions[k].iter)} steps` : '');
    $('#tn-start').innerHTML = T.STARTS.map((x) => `<option value="${x.id}">${esc(x.name + steps(x.id))}</option>`).join('');
    $('#tn-start').value = tstore.pick;
    $('#tn-start').disabled = tn.running;
    const lad = ladderForKey(T.rulesKey(state.rules));
    $('#tn-vs').innerHTML = T.VERSUS.map((v) => {
      const txt = v.id === 'start' ? st0.name + ' (where it started)' : v.id === 'ladder' ? (lad ? `A panel of ladder bots around its level (${lad.name})` : 'A panel of ladder bots (no ladder for these rules yet)') : v.name;
      return `<option value="${v.id}"${v.id === 'ladder' && !lad ? ' disabled' : ''}>${esc(txt)}</option>`;
    }).join('');
    $('#tn-vs').value = o.vs === 'ladder' && !lad ? 'start' : o.vs || 'start'; // without a ladder a run measures against its start
    $('#tn-vsdepth').disabled = $('#tn-vs').value === 'ladder';
    $('#tn-idea').textContent = st0.idea + (st0.family === 'accountant' ? ' Its own weights are tuned (the 15 below), not Minimax\'s.' : '');
    $('#tn-train').innerHTML = T.TRAIN.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('');
    $('#tn-train').value = o.train === 'self' ? 'self' : 'field';
    $('#tn-phased-wrap').hidden = !tnFam().phase;
    $('#tn-phased').checked = tnPhased();
    // pattern bots train by self-play (TD), not SPSA: their own settings instead of pairs, step size and training field
    const isTd = !!tnFam().td;
    $('#tn-td').hidden = !isTd;
    for (const sel of ['#tn-train', '#tn-pairs', '#tn-gain']) $(sel).closest('.fld').hidden = isTd;
    if (isTd) {
      const td = Object.assign({}, T.TD, o.td || {});
      setv('#tn-tdfrom', td.from); setv('#tn-tdgames', td.games); setv('#tn-tdalpha', td.alpha); setv('#tn-tdeps', Math.round(100 * td.eps));
      $('#tn-tdfrom').disabled = !!sess;
    }
    $('#tn-weights').hidden = isTd; $('#tn-patviz').hidden = !isTd;
    $('#tn-wh').textContent = isTd ? 'What the table has learned' : 'Weights';
    $('#tn-run').textContent = tn.running ? 'Pause' : sess && sess.iter ? 'Resume tuning' : 'Start tuning';
    $('#tn-restart').disabled = tn.running || !(sess && sess.iter);
    $('#tn-restart').textContent = 'Start over from ' + st0.name;
    const fam = tnFam(), canUse = st0.type === 'minimax';
    $('#tn-use').hidden = !canUse;
    $('#tn-wnote').textContent = isTd ? 'The patterns worth most and least to the side to move at one stage of the game, as the table values them now (it adds up one value per placement on the board, on top of the stones already banked). Blue = the side to move, orange = the opponent, grey = the edge or a hole, blank = empty. Pick a stage of the game:'
      : 'Untick a weight to hold it still. ' + (st0.family === 'minimax'
      ? 'Stones stay at 1 by default: they are the unit everything else is measured in. The bottom eleven are variables the default evaluator does not use.' +
        (tnPhased() ? ' With weights changing over the game, each has a value for the start and one for the end; in between it slides with the share of cells taken.' : '')
      : 'The Accountant adds the stones already banked exactly; these weights predict the extra stones still to come, which it then rounds to a number of the right parity.') +
      (canUse ? '' : ' To play this bot, save it: saved bots appear in the player menus.');
    buildTuneWeights();
    renderTuneLive();
    renderPatViz();
    renderTuneBots();
    renderCross();
  }

  /* ---------- what a pattern table has learned ---------- */
  // For each shape: the patterns with the biggest and smallest values at one stage of the game, drawn as tiny boards.
  const pv = { stage: 2 };
  const REPS = {};
  // The smallest code in every symmetry class (B.makeShape numbers classes in order of their smallest code).
  function shapeReps(sh) {
    if (REPS[sh.name]) return REPS[sh.name];
    const rep = new Uint32Array(sh.ncanon).fill(0xffffffff);
    for (let c = 0; c < sh.canon.length; c++) if (rep[sh.canon[c]] === 0xffffffff) rep[sh.canon[c]] = c;
    return (REPS[sh.name] = rep);
  }
  const SHAPE_NAMES = { sq3: '3×3 neighbourhoods', sq2: '2×2 blocks', r23: '2×3 blocks', r24: '2×4 blocks', x5: 'plus signs' };
  const shapeTitle = (n) => SHAPE_NAMES[n] || (n.startsWith('lo') ? n.slice(2) + ' cells in a row or column' : n.slice(2) + ' cells on a diagonal (drawn straight)');
  function patSVG(sh, code, U) {
    const cells = sh.name.startsWith('ld') ? sh.orients[0].map((_, i) => [0, i]) : sh.orients[0], k = sh.k, R = Math.max(...cells.map((c) => c[0])) + 1, C = Math.max(...cells.map((c) => c[1])) + 1;
    let o = `<svg viewBox="0 0 ${C * U} ${R * U}" width="${C * U}" height="${R * U}" aria-hidden="true">`;
    cells.forEach(([r, c], i) => {
      const d = (code >> (2 * (k - 1 - i))) & 3, x = c * U, y = r * U;
      o += `<rect class="pv-cell${d === 3 ? ' pv-wall' : ''}" x="${x + 0.5}" y="${y + 0.5}" width="${U - 1}" height="${U - 1}" rx="2"/>`;
      if (d === 1 || d === 2) o += `<circle class="${d === 1 ? 'pv-me' : 'pv-them'}" cx="${x + U / 2}" cy="${y + U / 2}" r="${U * 0.32}"/>`;
    });
    return o + '</svg>';
  }
  function patVizHTML(t, stage, title) {
    const set = t.set, ns = set.ns, st = Math.min(stage, ns - 1), base = st * set.perStage, sc = t.scale;
    const stageName = (i) => `${Math.round((100 * i) / ns)}–${Math.round((100 * (i + 1)) / ns)}% of cells taken`;
    let o = `<div class="seg pv-stages" role="group" aria-label="Stage of the game">` +
      Array.from({ length: ns }, (_, i) => `<button data-pvstage="${i}" class="${i === st ? 'on' : ''}">${esc(stageName(i))}</button>`).join('') + '</div>';
    let nz = 0;
    for (let i = 0; i < t.w.length; i++) if (t.w[i]) nz++;
    o += `<p class="muted small">${esc(title)}: ${fmt(nz)} of ${fmt(t.w.length)} entries learned (the rest never came up, or came out at 0). ` +
      `At this stage a lone move is worth ${signed(t.w[base + set.featOff] / sc, 2)} stones on its own, and ${signed(t.w[base + set.featOff + 1] / sc, 2)} more when an odd number of cells is empty.</p>`;
    const U = 15;
    set.shapes.forEach((sh, si) => {
      const off = base + set.shapeOff[si], vals = [];
      for (let c = 0; c < sh.ncanon; c++) { const v = t.w[off + c]; if (v) vals.push([c, v]); }
      if (!vals.length) return;
      vals.sort((a, b) => b[1] - a[1]);
      const reps = shapeReps(sh), k = sh.k > 6 ? 8 : 5, top = vals.slice(0, k), bottom = vals.slice(-k).reverse();
      const tile = ([c, v]) => `<figure class="pv-tile">${patSVG(sh, reps[c], U)}<figcaption>${signed(v / sc, 2)}</figcaption></figure>`;
      o += `<h3 class="pv-h">${esc(shapeTitle(sh.name))} <span class="muted small">${fmt(vals.length)} learned</span></h3>` +
        `<div class="pv-row"><span class="pv-lab">Best for the mover</span>${top.map(tile).join('')}</div>` +
        `<div class="pv-row"><span class="pv-lab">Worst</span>${bottom.map(tile).join('')}</div>`;
    });
    return o;
  }
  function renderPatViz() {
    const box = $('#tn-patviz');
    if (!box || box.hidden) return;
    const sess = tnSess(), o = tnOpts(), fromBlank = !sess && o.td && o.td.from === 'blank';
    const id = sess && sess.patterns ? sess.tableId : fromBlank ? null : 'mix';
    const t = id ? pageTable(id) : null;
    box.innerHTML = t ? patVizHTML(t, pv.stage, sess && sess.patterns ? 'This run\'s table (as of its last check)' : 'The shipped table, where a new run starts')
      : '<p class="muted">An empty table: nothing learned yet. Start tuning and the patterns appear here after the first check.</p>';
  }

  function buildTuneWeights() {
    const sess = tnSess(), fam = tnFam(), w0 = T.startWeights(tstore.pick), ph = tnPhased();
    const tune = sess ? sess.tune.filter((k) => !T.isEnd(k)) : tnDraft().tune || tnTuneList();
    const info = Object.fromEntries(fam.info.map((f) => [f[0], f])), split = fam === T.FAMILIES.minimax ? 7 : -1;
    $('#tn-weights').innerHTML = '<thead><tr><th>Tune</th><th>Variable</th><th class="num">Started at</th>' +
      (ph ? '<th class="num">Now: start of game</th><th class="num">Now: end of game</th>' : '<th class="num">Now</th>') + '<th class="num">Change</th></tr></thead><tbody>' +
      fam.keys.map((k, i) => `<tr data-k="${k}"${i === split ? ' class="tn-new"' : ''}><td><input type="checkbox" aria-label="Tune ${esc(info[k][1])}"${tune.includes(k) ? ' checked' : ''}></td>` +
        `<td><span data-tip="${esc(info[k][2])}">${esc(info[k][1])}</span></td><td class="num">${fmt(w0[k], 2)}</td><td class="num now"></td>` +
        (ph ? '<td class="num end"></td>' : '') + '<td class="num chg"></td></tr>').join('') + '</tbody>';
  }

  function renderTuneLive() {
    const rec = recFor(state.rules, false), sess = tnSess(), w0 = T.startWeights(tstore.pick);
    const th = sess ? sess.theta : w0;
    const chg = (d) => (Math.abs(d) < 0.0005 ? '–' : signed(d, 3));
    for (const row of $$('#tn-weights tbody tr')) {
      const k = row.dataset.k, a = th[k] || 0, e = T.endOf(th, k) || 0, end = $('.end', row);
      $('.now', row).textContent = fmt(a, 3);
      if (end) end.textContent = fmt(e, 3);
      $('.chg', row).textContent = end && Math.abs(e - a) >= 0.0005 ? chg(a - w0[k]) + ' / ' + chg(e - w0[k]) : chg(a - w0[k]);
    }
    const h = sess ? sess.history : [], last = h[h.length - 1];
    let st = '';
    if (sess && sess.iter) {
      st = `Step ${fmt(sess.iter)} · ${fmt(sess.games)} games`;
      if (tn.running && tn.rec === rec && tn.pick === tstore.pick) {
        const sec = (performance.now() - tn.t0) / 1000;
        st += ` · ${fmt((sess.games - tn.g0) / Math.max(sec, 0.1))} games per second` + (tunePool.fast === undefined ? '' : tunePool.fast ? ' (fast engine)' : ' (JavaScript engine)');
      }
      if (last && last.tdErr) st += ` · prediction error ${fmt(last.tdErr, 2)} stones`;
      if (last) st += last.kind === 'ladder' ? ` · last check ${fmt(last.elo)} ladder Elo (${fmt(last.lo)} to ${fmt(last.hi)})` : ` · last check ${eloText(last.elo)} Elo (${eloText(last.lo)} to ${eloText(last.hi)})`;
    }
    $('#tn-status').textContent = st;
    const o = tnOpts(), lad = ladderForKey(T.rulesKey(state.rules));
    const vsEff = o.vs === 'ladder' && !lad ? 'start' : o.vs;
    const vsNow = vsEff === 'ladder' ? 'a panel of ladder bots around its level (' + lad.name + ')' : T.versusName({ start: tstore.pick, depth: o.depth, vs: vsEff, vsDepth: o.vsDepth });
    const vsOf = (p) => p.vs || 'Minimax (Default) d' + p.depth;
    const isLad = (p) => p.kind === 'ladder';
    const oppKey = (p) => p.opps.map((x) => x[0]).sort().join(',');
    // The chart shows the run of points measured the same way as the latest one (ladder Elo and relative Elo don't mix).
    const series = last ? h.filter((p) => (isLad(last) ? isLad(p) && p.ladder === last.ladder : !isLad(p) && vsOf(p) === vsOf(last))) : [];
    const name = T.startById(tstore.pick).name;
    $('#tn-chart-h').textContent = last && isLad(last) ? `${name} (tuned) on the ladder` : `${name} (tuned) against ${last ? vsOf(last) : vsNow}`;
    let sub;
    if (!last) sub = `Nothing measured yet. Starting plays ${vsNow} first, so you see where the untuned bot stands.`;
    else if (isLad(last)) {
      const l = ladderById(last.ladder);
      const moves = series.filter((p, i) => i > 0 && oppKey(p) !== oppKey(series[i - 1])).length;
      sub = `Each point is one check: ${fmt(last.games)} games against ${last.opps.length} ladder bots around its level (slow ones skipped), then its ladder Elo fitted with theirs held fixed (Random = 0). ` +
        `Tuned bots beat some styles and not others, so the panel only moves when the average of the last three checks is more than ${T.PANEL_DRIFT} Elo from where it was centred; then it picks the bots nearest the new level` +
        (moves ? ` (it has moved ${moves === 1 ? 'once' : moves + ' times'}: the dotted vertical lines)` : '') + '. The band is the 95% range; dashed lines are ladder bots for scale. Current opponents: ' +
        last.opps.map((x) => `${x[1]} (${fmt(x[2])}, scored ${fmt((100 * x[3]) / x[4])}%)`).join(', ') + '.' +
        (l ? '' : ' That ladder is no longer on this page.');
    } else {
      sub = `Each point is one check: ${fmt(last.games)} games against ${vsOf(last)}. The band is the 95% range. Above 0 means the tuned bot wins more often. The first point is the bot before any tuning.`;
    }
    if (last && series.length < h.length) sub += ' Earlier checks measured against something else: see the table.';
    if (sess && last && (isLad(last) ? vsEff !== 'ladder' : vsOf(last) !== vsNow)) sub += ` The next check plays ${vsNow}.`;
    if (series.length > 2) sub += ' The thick line is the average of the last five checks.';
    if (sess && (sess.qDepth > 0 || sess.endAt > 0)) sub += ` This bot also ${sess.qDepth > 0 ? "looks further while fills are on offer" : ""}${sess.qDepth > 0 && sess.endAt > 0 ? " and " : ""}${sess.endAt > 0 ? "plays perfectly once " + sess.endAt + " cells are left" : ""} (${T.searchLabel(sess)}) and its opponents don't, so that alone already shows in the first point.`;
    $('#tn-chart-sub').textContent = sub;
    $('#tn-chart').innerHTML = series.length ? tuneChartSVG(series, isLad(last) ? ladderById(last.ladder) : null) : '';
    renderTuneReading(sess, last);
    const eloCell = (p) => (isLad(p) ? fmt(p.elo) + ' <span class="muted small">ladder</span>' : eloText(p.elo));
    const rangeCell = (p) => (isLad(p) ? `${fmt(p.lo)} to ${fmt(p.hi)}` : `${eloText(p.lo)} to ${eloText(p.hi)}`);
    const vsCell = (p) => (isLad(p) ? `<span data-tip="${esc(p.opps.map((x) => `${x[1]} (${fmt(x[2])}): ${fmt(x[3])} of ${x[4]}`).join('; '))}">ladder: ${esc(p.opps.map((x) => x[1]).join(', '))}</span>` : esc(vsOf(p)));
    $('#tn-history').innerHTML = h.length ? '<table class="data"><thead><tr><th class="num">Step</th><th>Against</th><th class="num">Score</th><th class="num">Elo</th><th class="num">95% range</th><th class="num">Games</th></tr></thead><tbody>' +
      h.slice().reverse().map((p) => `<tr><td class="num">${fmt(p.iter)}</td><td>${vsCell(p)}</td><td class="num">${fmt(100 * p.score, 1)}%</td><td class="num">${eloCell(p)}</td><td class="num">${rangeCell(p)}</td><td class="num">${fmt(p.games)}</td></tr>`).join('') + '</tbody></table>' : '';
  }

  // Under the chart: whether training has levelled off, the best checkpoint, and the training score (results/32).
  function renderTuneReading(sess, last) {
    const h = sess ? sess.history : [], tr = h.filter((p) => typeof p.train === 'number');
    const ladderish = last && last.kind === 'ladder', e = (v) => (ladderish ? fmt(v) : eloText(v));
    const lv = sess ? T.levelled(h) : null, parts = [];
    if (lv) {
      parts.push(`<p><b>Training has levelled off</b> since about step ${fmt(lv.since)}: the training score was ${fmt(100 * lv.now, 1)}% over the last five checks and ${fmt(100 * lv.before, 1)}% over the five before. ` +
        'More steps will mostly shuffle the weights. To go further, give the bot more to work with: tick the "threat after a block" variables in the table below, or set "Look further while big fills are on offer" (that starts a different bot: start over, or save this one first).</p>');
    }
    if (sess && sess.best) {
      const m = T.recentMean(sess);
      if (T.bestWorthIt(sess)) {
        parts.push(`<p>Best checkpoint: <b>step ${fmt(sess.best.iter)}</b>, ${e(sess.best.elo)} (three checks around it), against ${e(m)} for the last three. ` +
          `<button class="link" data-act="tn-goback"${tn.running ? ' disabled' : ''}>Go back to step ${fmt(sess.best.iter)}'s weights</button>${tn.running ? ' <span class="muted small">(pause first)</span>' : ''}</p>`);
      } else parts.push(`<p class="muted small">Best checkpoint so far: step ${fmt(sess.best.iter)}, ${e(sess.best.elo)} (mean of three checks). The run is at or near it.</p>`);
    }
    $('#tn-best').innerHTML = parts.join('');
    $('#tn-train-box').hidden = tr.length < 2;
    if (tr.length >= 2) {
      $('#tn-train-sub').textContent = 'What the tuner itself maximises: how its current weights score against the bots it trains against (Default, Accountant, Forker, Tuned 8×8 and Stones-only at the same look-ahead), averaged over the steps between checks. ' +
        'When this stops rising, the weights have learned what they can from these games; when it keeps rising but the chart above does not, the bot is learning tricks that only work on its training partners.';
      $('#tn-train-chart').innerHTML = trainChartSVG(tr, lv ? lv.since : null);
    }
  }
  function trainChartSVG(h, since) {
    const W = 620, H = 150, l = 44, r = 16, t = 10, b = 26, pw = W - l - r, ph = H - t - b;
    const xMin = h[0].iter, xMax = Math.max(xMin + 1, h[h.length - 1].iter);
    let lo = Math.min(...h.map((p) => p.train)) * 100, hi = Math.max(...h.map((p) => p.train)) * 100;
    if (hi - lo < 4) { const m = (hi + lo) / 2; lo = m - 2; hi = m + 2; }
    const step = niceMax((hi - lo) / 3);
    lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
    const X = (i) => l + ((i - xMin) / (xMax - xMin)) * pw, Y = (v) => t + ((hi - v) / (hi - lo)) * ph;
    let o = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Training score against the field, by tuning step">`;
    for (let v = lo; v <= hi + 1e-9; v += step) o += `<path class="ch-grid" d="M${l} ${Y(v)}H${W - r}"/><text class="ch-tick" x="${l - 6}" y="${Y(v) + 3}" text-anchor="end">${fmt(v, step < 1 ? 1 : 0)}%</text>`;
    if (since !== null && since !== undefined) {
      o += `<path class="ch-axis" stroke-dasharray="3 4" d="M${X(since)} ${t}V${t + ph}"/><text class="ch-note" x="${X(since) + 4}" y="${t + 10}">levelled off</text>`;
    }
    o += '<path class="ch-line ch-train" d="M' + h.map((p) => X(p.iter) + ' ' + Y(100 * p.train)).join('L') + '"/>';
    for (let i = 0; i <= 5; i++) { const v = Math.round(xMin + ((xMax - xMin) * i) / 5); o += `<text class="ch-tick" x="${X(v)}" y="${t + ph + 14}" text-anchor="middle">${fmt(v)}</text>`; }
    const cw = Math.max(6, pw / Math.max(1, h.length));
    for (const q of h) o += `<rect class="ch-hit" x="${X(q.iter) - cw / 2}" y="${t}" width="${cw}" height="${ph}" data-tip="${esc(`Up to step ${fmt(q.iter)}: ${fmt(100 * q.train, 1)}% against the training field`)}"/>`;
    return o + '</svg>';
  }

  // h: checks to plot. ladder: when given, the values are ladder ratings (absolute) and its bots are drawn for scale.
  function tuneChartSVG(h, ladder) {
    const W = 620, H = 220, l = 44, r = 16, t = 12, b = 30, pw = W - l - r, ph = H - t - b;
    const xMin = h[0].iter, xMax = Math.max(xMin + 1, h[h.length - 1].iter);
    const lab = (v) => (ladder ? fmt(v) : v === 0 ? '0' : eloText(v));
    let lo = Math.min(...h.map((p) => p.lo)), hi = Math.max(...h.map((p) => p.hi));
    if (ladder) { lo -= 30; hi += 30; } else { lo = Math.min(-50, lo); hi = Math.max(50, hi); }
    const step = niceMax((hi - lo) / 4);
    lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
    const X = (i) => l + ((i - xMin) / (xMax - xMin)) * pw, Y = (v) => t + ((hi - v) / (hi - lo)) * ph;
    let o = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${ladder ? 'Ladder Elo of the tuned bot' : 'Elo of the tuned bot against its opponent'}, by tuning step">`;
    for (let v = lo; v <= hi + 1e-9; v += step) {
      o += `<path class="${!ladder && v === 0 ? 'ch-axis' : 'ch-grid'}" d="M${l} ${Y(v)}H${W - r}"/><text class="ch-tick" x="${l - 6}" y="${Y(v) + 3}" text-anchor="end">${lab(v)}</text>`;
    }
    if (ladder) {
      // Pool bots inside the visible range, thinned so their labels don't collide.
      let lastY = -1e9;
      for (const bt of ladder.bots.filter((x) => x.elo > lo && x.elo < hi).sort((a, c) => c.elo - a.elo)) {
        const y = Y(bt.elo);
        o += `<path class="ch-axis" stroke-dasharray="3 4" d="M${l} ${y}H${W - r}"/>`;
        if (y - lastY >= 11) { o += `<text class="ch-note" x="${W - r}" y="${y - 3}" text-anchor="end">${esc(bt.name)} ${fmt(bt.elo)}</text>`; lastY = y; }
      }
    } else o += `<text class="ch-note" x="${W - r}" y="${Y(0) - 5}" text-anchor="end">${esc(h[h.length - 1].vs || 'default evaluator')}</text>`;
    // Where the ladder panel was re-centred on the bot's new level.
    const panelOf = (q) => (q.opps ? q.opps.map((x) => x[0]).sort().join(',') : '');
    const moved = new Set();
    if (ladder) for (let i = 1; i < h.length; i++) if (panelOf(h[i]) !== panelOf(h[i - 1])) {
      moved.add(i);
      o += `<path class="ch-grid" stroke-dasharray="1 3" d="M${X(h[i].iter)} ${t}V${t + ph}"/><text class="ch-note" x="${X(h[i].iter) + 3}" y="${t + ph - 3}">new panel</text>`;
    }
    if (h.length > 1) {
      o += '<path class="ch-band" d="M' + h.map((p) => X(p.iter) + ' ' + Y(p.hi)).join('L') + 'L' + h.slice().reverse().map((p) => X(p.iter) + ' ' + Y(p.lo)).join('L') + 'Z"/>';
      // Each check alone is noisy (±35 Elo for 200 pairs): the thin line is every check, the thick one the mean of the
      // last five (weighted by games), which is what to read the trend from.
      const avg = h.map((p, i) => { const w = h.slice(Math.max(0, i - 4), i + 1); const g = w.reduce((a, q) => a + q.games, 0); return w.reduce((a, q) => a + q.elo * q.games, 0) / g; });
      o += '<path class="ch-line ch-raw" d="M' + h.map((p) => X(p.iter) + ' ' + Y(p.elo)).join('L') + '"/>';
      if (h.length > 2) o += '<path class="ch-line ch-avg" d="M' + h.map((p, i) => X(p.iter) + ' ' + Y(avg[i])).join('L') + '"/>';
    } else {
      const p = h[0];
      o += `<path class="ch-line" d="M${X(p.iter)} ${Y(p.lo)}V${Y(p.hi)}"/>`;
    }
    const ticks = 5;
    for (let i = 0; i <= ticks; i++) {
      const v = Math.round(xMin + ((xMax - xMin) * i) / ticks);
      o += `<text class="ch-tick" x="${X(v)}" y="${t + ph + 14}" text-anchor="middle">${fmt(v)}</text>`;
    }
    o += `<text class="ch-note" x="${W - r}" y="${H - 2}" text-anchor="end">tuning step</text>`;
    const p = h[h.length - 1];
    o += `<circle class="ch-dot" cx="${X(p.iter)}" cy="${Y(p.elo)}" r="4"/>`;
    const cw = Math.max(6, pw / Math.max(1, h.length));
    for (const q of h) {
      const tip = q.kind === 'ladder'
        ? `Step ${fmt(q.iter)}: ladder Elo ${fmt(q.elo)} (95% range ${fmt(q.lo)} to ${fmt(q.hi)}) from ${fmt(q.games)} games against ${q.opps.map((x) => x[1]).join(', ')}${moved.has(h.indexOf(q)) ? ' (new panel from here)' : ''}`
        : `Step ${fmt(q.iter)}: ${eloText(q.elo)} Elo (95% range ${eloText(q.lo)} to ${eloText(q.hi)}); scored ${fmt(100 * q.score, 1)}% in ${fmt(q.games)} games against ${q.vs || 'Default d' + q.depth}`;
      o += `<rect class="ch-hit" x="${X(q.iter) - cw / 2}" y="${t}" width="${cw}" height="${ph}" data-tip="${esc(tip)}"/>`;
    }
    return o + '</svg>';
  }

  function renderRatingProgress() {
    const el = tn.rating && $(`[data-rating="${tn.rating.id}"]`);
    if (el) el.textContent = `rating… ${Math.round((100 * tn.rating.done) / tn.rating.total)}%`;
  }

  function botRowsHTML(rec, current) {
    return rec.bots.map((b) => {
      const rating = tn.rating && tn.rating.id === b.id, l = ladderForKey(rec.key), lr = ratingOf(l, 'saved:' + b.id);
      const elo = rating ? `<span data-rating="${esc(b.id)}">rating…</span>`
        : lr ? `<span data-tip="Fitted with everyone on the ${esc(l.name)} ladder from all their games (Random = 0); 95% range ${fmt(lr.elo - lr.ci)} to ${fmt(lr.elo + lr.ci)}"><b>${fmt(lr.elo)}</b> <span class="muted small">±${fmt(lr.ci)}</span></span>`
        : `<span class="muted" data-tip="${l ? 'No games on the ' + esc(l.name) + ' ladder yet: press Re-rate' : 'These rules have no ladder yet: build one on the Ladder tab'}">unrated</span>`;
      return `<tr data-bot="${esc(b.id)}" data-rec="${esc(rec.key)}"><td><b>${esc(b.name)}</b></td><td>${esc(botStart(b).name)}</td><td class="num">${b.depth}${T.searchLabel(b) ? ' <span class="muted small">' + esc(T.searchLabel(b)) + '</span>' : ''}</td><td class="num">${elo}</td>` +
        `<td class="num">${lr ? fmt(lr.games) : '–'}</td><td class="muted small">${new Date(b.created).toLocaleDateString()}${b.steps ? ' · step ' + fmt(b.steps) : ''}</td><td class="acts">` +
        `<button class="link" data-act="load"${tn.running ? ' disabled' : ''} data-tip="${current ? 'Carry on tuning from these weights' : 'Start tuning the rules on the left from these weights'}">Tune from here</button>` +
        (botStart(b).type === 'minimax' ? '<button class="link" data-act="use">Use on Play tab</button>' : '') +
        `<button class="link" data-act="rate"${tn.rating ? ' disabled' : ''}>Re-rate</button><button class="link" data-act="rename">Rename</button><button class="link" data-act="del">Delete</button></td></tr>`;
    }).join('');
  }
  const BOT_HEAD = '<thead><tr><th>Name</th><th>Kind</th><th class="num">Depth</th><th class="num">Elo</th><th class="num">Games</th><th>Saved</th><th></th></tr></thead>';

  function renderTuneBots() {
    const rec = recFor(state.rules, false);
    $('#tn-bots').innerHTML = rec && rec.bots.length
      ? `<table class="data tn-bots">${BOT_HEAD}<tbody>${botRowsHTML(rec, true)}</tbody></table>`
      : '<p class="muted">No bots saved for these rules yet.</p>';
    const others = Object.values(tstore.rulesets).filter((r) => r !== rec && (r.bots.length || recSteps(r)));
    $('#tn-other').innerHTML = others.length ? '<h3 class="tn-oh">Other rulesets you have tuned</h3>' + others.map((r) =>
      `<div class="tn-orec" data-rec="${esc(r.key)}"><div class="head-row"><span><b>${esc(recLabel(r))}</b> <span class="muted small">${esc(E.describeRules(r.rules))}</span></span>` +
      `<span class="muted small">${recSteps(r) ? fmt(recSteps(r)) + ' steps · ' : ''}<button class="link" data-act="switch">Switch to these rules</button> · <button class="link" data-act="forget">Forget</button></span></div>` +
      (r.bots.length ? `<table class="data tn-bots">${BOT_HEAD}<tbody>${botRowsHTML(r, false)}</tbody></table>` : '') + '</div>').join('') : '';
    $('#tn-save').disabled = !!tn.rating;
  }

  /* ---------- try weights at other look-aheads / on other rules ---------- */
  // Any weights (this tuning run, or a saved bot of any ruleset) against an opponent at each listed look-ahead,
  // on the rules on the left. The games run on the fast engine when it can play both bots.
  const crossPool = makePool();
  function crossBotSpec(v, d) {
    if (v === 'current') { const sess = tnSess(); return T.playSpec(tstore.pick, sess ? sess.theta : T.startWeights(tstore.pick), d, 'This tuning run', sess || tnDraft()); }
    const f = findBot(v.slice(6));
    return f ? T.playSpec(botStart(f.bot).id, f.bot.weights, d, f.bot.name, f.bot) : null;
  }
  function crossVsSpec(bv, vv, d) {
    if (vv === 'start') { // the untouched bot the chosen weights were tuned from
      const f = bv === 'current' ? null : findBot(bv.slice(6)), st = f ? botStart(f.bot) : T.startById(tstore.pick);
      return Object.assign({}, st.base, { depth: d });
    }
    if (vv === 'current' || vv.startsWith('saved:')) return crossBotSpec(vv, d);
    return { type: vv, depth: d };
  }
  function renderCross() {
    const bsel = $('#tx-bot'), vsel = $('#tx-vs');
    if (!bsel) return;
    const bv = bsel.value, vv = vsel.value, here = T.rulesKey(state.rules), groups = new Map();
    for (const { rec, bot } of allBots()) {
      const key = rec.key === here ? '' : recLabel(rec) + ' · ' + rec.rules.size + '×' + rec.rules.size;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(bot);
    }
    const sv = (b) => `<option value="saved:${esc(b.id)}">${esc(b.name)} (tuned at look-ahead ${b.depth})</option>`;
    const saved = [...groups].sort((a, b) => (a[0] ? 1 : 0) - (b[0] ? 1 : 0))
      .map(([k, list]) => `<optgroup label="${esc(k ? 'Tuned for ' + k : 'Tuned for these rules')}">${list.map(sv).join('')}</optgroup>`).join('');
    bsel.innerHTML = `<option value="current">The weights being tuned here (${esc(T.startById(tstore.pick).name)})</option>` + saved;
    vsel.innerHTML = '<option value="start">The bot it was tuned from, untouched</option>' +
      T.VERSUS.filter((v) => v.id !== 'ladder' && v.id !== 'start').map((v) => `<option value="${v.id}">${esc(v.name)}</option>`).join('') +
      '<option value="current">The weights being tuned here</option>' + saved;
    if ([...bsel.options].some((o) => o.value === bv)) bsel.value = bv;
    if ([...vsel.options].some((o) => o.value === vv)) vsel.value = vv;
    $('#tx-run').textContent = tn.cross ? 'Stop' : 'Play';
  }
  async function runCross() {
    if (tn.cross) { crossPool.cancel(); return; }
    const bv = $('#tx-bot').value, vv = $('#tx-vs').value, depths = T.parseDepths($('#tx-depths').value);
    const per = clampInt($('#tx-pairs').value, 10, 2000, 200);
    if (!depths.length) { toast('List the look-aheads to try, for example 1-4.'); return; }
    if (!crossBotSpec(bv, 1) || !crossVsSpec(bv, vv, 1)) { toast('That bot no longer exists.'); return; }
    const rules = E.normalizeRules(state.rules), names = [$('#tx-bot').selectedOptions[0].textContent, $('#tx-vs').selectedOptions[0].textContent];
    const { jobs, owner } = T.crossJobs(rules, (d) => crossBotSpec(bv, d), (d) => crossVsSpec(bv, vv, d), depths, per, T.DEFAULTS.opening, (Math.random() * 1e9) >>> 0);
    tn.cross = { t0: performance.now() };
    renderCross();
    $('#tx-out').innerHTML = '';
    let pts = null;
    try {
      pts = await playPairs(crossPool, jobs, (d, t) => { $('#tx-status').textContent = `${fmt(d)} of ${fmt(t)} game pairs`; });
    } catch (err) { toast('Playing the games failed: ' + err.message); }
    const secs = (performance.now() - tn.cross.t0) / 1000;
    tn.cross = null;
    renderCross();
    if (!pts) { $('#tx-status').textContent = 'Stopped.'; return; }
    $('#tx-status').textContent = `${fmt(2 * pts.length)} games in ${fmt(secs, 1)} s` + (crossPool.fast ? ' on the fast engine' : '');
    const by = depths.map(() => []);
    pts.forEach((p, i) => by[owner[i]].push(p));
    $('#tx-out').innerHTML = `<p class="muted small">${esc(names[0])} against ${esc(names[1])}, both at the same look-ahead, on ruleset ${esc(T.shortId(T.rulesKey(rules)))} (${esc(E.describeRules(rules))}).</p>` +
      '<table class="data"><thead><tr><th class="num">Look-ahead</th><th class="num">Score</th><th class="num">Elo</th><th class="num">95% range</th><th class="num">Games</th></tr></thead><tbody>' +
      depths.map((d, i) => {
        const st = T.eloStats(by[i]);
        return `<tr><td class="num">${d}</td><td class="num">${fmt(100 * st.score, 1)}%</td><td class="num"><b>${eloText(st.elo)}</b></td><td class="num">${eloText(st.lo)} to ${eloText(st.hi)}</td><td class="num">${fmt(st.games)}</td></tr>`;
      }).join('') + '</tbody></table>';
  }

  /* ---------- controls ---------- */
  function bindTune() {
    $('#tx-run').addEventListener('click', runCross);
    const optKeys = { '#tn-depth': ['depth', 1, 6], '#tn-vsdepth': ['vsDepth', 0, 6], '#tn-pairs': ['pairs', 2, 64], '#tn-opening': ['opening', 0, 12],
      '#tn-every': ['checkEvery', 1, 500], '#tn-checkpairs': ['checkPairs', 10, 1000], '#tn-q': ['qDepth', 0, 4], '#tn-qmin': ['qMin', 1, 4], '#tn-end': ['endAt', 0, 20] };
    for (const sel in optKeys) {
      const [k, lo, hi] = optKeys[sel];
      $(sel).addEventListener('change', (e) => {
        const o = tnOpts(); o[k] = clampInt(e.target.value, lo, hi, o[k] || 0); e.target.value = o[k];
        if (k === 'qDepth') $('#tn-qmin').disabled = !(o.qDepth > 0);
        tsave(); renderTuneLive();
      });
    }
    $('#tn-gain').addEventListener('change', (e) => {
      const o = tnOpts(), v = +e.target.value;
      o.gain = isFinite(v) && v > 0 ? Math.min(5, v) : o.gain; e.target.value = o.gain; tsave();
    });
    $('#tn-run').addEventListener('click', () => { if (tn.running) tuneStop(); else tuneLoop(); });
    const tdSet = (k, v) => { const o = tnOpts(); o.td = Object.assign({}, T.TD, o.td || {}, { [k]: v }); tsave(); };
    $('#tn-tdfrom').addEventListener('change', (e) => { if (!tnSess()) { tdSet('from', e.target.value === 'blank' ? 'blank' : 'mix'); renderPatViz(); } });
    $('#tn-tdgames').addEventListener('change', (e) => { const v = clampInt(e.target.value, 50, 5000, T.TD.games); e.target.value = v; tdSet('games', v); });
    $('#tn-tdalpha').addEventListener('change', (e) => { const v = +e.target.value; const a = isFinite(v) && v > 0 ? Math.min(0.2, Math.max(0.002, v)) : T.TD.alpha; e.target.value = a; tdSet('alpha', a); });
    $('#tn-tdeps').addEventListener('change', (e) => { const v = clampInt(e.target.value, 0, 50, 5); e.target.value = v; tdSet('eps', v / 100); });
    $('#tn-patviz').addEventListener('click', (e) => { const b = e.target.closest('[data-pvstage]'); if (b) { pv.stage = +b.dataset.pvstage; renderPatViz(); } });
    $('#tn-start').addEventListener('change', (e) => { if (tn.running) return; tstore.pick = T.startById(e.target.value).id; tsave(); renderTune(); });
    $('#tn-vs').addEventListener('change', (e) => { tnOpts().vs = e.target.value; tnOpts().vsChosen = true; $('#tn-vsdepth').disabled = e.target.value === 'ladder'; tsave(); renderTuneLive(); });
    $('#tn-restart').addEventListener('click', () => {
      const rec = recFor(state.rules, false), s = tnSess(), name = T.startById(tstore.pick).name;
      if (!s || !confirm(`Throw away this tuning run and start again from ${name}'s own weights? Saved bots are kept.`)) return;
      tn.drafts[tstore.pick] = { vsDepth: s.vsDepth || 0, depth: s.depth, pairs: s.pairs, opening: s.opening, gain: s.gain, checkEvery: s.checkEvery, checkPairs: s.checkPairs, stepDecay: s.stepDecay, tune: s.tune.filter((k) => !T.isEnd(k)), vs: s.vs, phased: !!s.phased, train: s.train, qDepth: s.qDepth | 0, qMin: s.qMin === undefined ? 1 : s.qMin, endAt: s.endAt | 0, td: s.td };
      if (tn.masterSess === s) { tn.master = null; tn.masterSess = null; }
      delete rec.sessions[tstore.pick]; tsave(); renderTune(); refreshRulesId();
    });
    $('#tn-weights').addEventListener('change', (e) => {
      const row = e.target.closest('tr[data-k]');
      if (!row) return;
      const sess = tnSess(), k = row.dataset.k;
      if (sess) T.setTuned(sess, k, e.target.checked); // its end-of-game twin follows
      else {
        const d = tnDraft(), list = (d.tune = d.tune || tnTuneList()), i = list.indexOf(k);
        if (e.target.checked && i < 0) list.push(k);
        if (!e.target.checked && i >= 0) list.splice(i, 1);
      }
      tsave();
    });
    $('#tn-train').addEventListener('change', (e) => { tnOpts().train = e.target.value === 'self' ? 'self' : 'field'; tsave(); });
    $('#tn-phased').addEventListener('change', (e) => {
      const sess = tnSess();
      if (sess) T.setPhased(sess, e.target.checked); else tnDraft().phased = e.target.checked;
      tsave(); renderTune();
    });
    $('#tn-use').addEventListener('click', () => {
      const sess = tnSess();
      if (!sess) { toast('Nothing tuned yet for these rules.'); return; }
      if (T.startById(sess.start).type !== 'minimax') { toast('Only Minimax weights can drive the Play tab\'s Minimax. Save this bot and pick it as a player instead.'); return; }
      state.weights = Object.assign({}, B.DEFAULT_WEIGHTS, sess.theta);
      save(); buildBrain(); renderBrain(); requestScores();
      toast('Minimax (and the Bot brain panel) now use the tuned weights. "Reset weights" there undoes it.');
    });
    $('#tn-seen').addEventListener('change', (e) => {
      if (e.target.id !== 'tn-rname') return;
      const rec = recFor(state.rules, false);
      if (rec) { rec.name = e.target.value.trim().slice(0, 40); tsave(); refreshRulesId(); refreshPickers(); renderTuneBots(); }
    });
    $('#tn-save').addEventListener('click', () => {
      const sess = tnSess();
      if (!sess) { toast('Tune first: there are no weights to save for these rules yet.'); return; }
      const rec = recFor(state.rules, true);
      const name = $('#tn-name').value.trim().slice(0, 40) || T.startById(sess.start).name.split(' (')[0] + ' tuned ' + rec.id + ' #' + (rec.bots.length + 1);
      const bot = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name, depth: sess.depth, start: sess.start,
        weights: Object.assign({}, sess.theta), created: Date.now(), steps: sess.iter, rating: null };
      if (sess.qDepth > 0) { bot.qDepth = sess.qDepth; bot.qMin = sess.qMin === undefined ? 1 : sess.qMin; } // its search setting
      if (sess.endAt > 0) bot.endAt = sess.endAt; // and its perfect endgame
      if (T.familyOf(sess.start).td) { // a pattern bot keeps its own copy of the run's table
        if (tn.masterSess === sess) tdPublish(sess);
        if (!sess.patterns) { toast('Train first: this run has no table yet.'); return; }
        bot.patterns = sess.patterns; bot.qDepth = sess.qDepth | 0;
        putTable('bot:' + bot.id, bot.patterns);
      }
      rec.bots.push(bot);
      $('#tn-name').value = '';
      tsave(); refreshPickers(); refreshRulesId();
      rateBot(bot, rec, clampInt($('#tn-ratepairs').value, 20, 2000, 150));
    });
    $('#tab-tune').addEventListener('click', (e) => {
      const act = e.target.dataset && e.target.dataset.act;
      if (!act) return;
      if (act === 'tn-goback') {
        const sess = tnSess();
        if (!sess || tn.running || !T.goBack(sess)) return;
        tsave(); renderTune();
        toast(`Back to step ${fmt(sess.best.iter)}'s weights. Resume tuning to check them (and carry on from there).`);
        return;
      }
      const recEl = e.target.closest('[data-rec]'), rec = recEl && tstore.rulesets[recEl.dataset.rec];
      if (!rec) return;
      if (act === 'switch') { applyRules(rec.rules); toast('Rules switched to ' + recLabel(rec) + '.'); return; }
      if (act === 'forget') {
        if (!confirm(`Forget ${recLabel(rec)}: its tuning run and ${rec.bots.length} saved bot(s)?`)) return;
        delete tstore.rulesets[rec.key]; tsave(); refreshPickers(); renderTune(); return;
      }
      const bot = rec.bots.find((b) => b.id === e.target.closest('[data-bot]').dataset.bot);
      if (!bot) return;
      if (act === 'rate') rateBot(bot, rec, clampInt($('#tn-ratepairs').value, 20, 2000, 150));
      else if (act === 'use') {
        if (botStart(bot).type !== 'minimax') return;
        state.weights = Object.assign({}, B.DEFAULT_WEIGHTS, bot.weights);
        save(); buildBrain(); renderBrain(); requestScores();
        toast(`Minimax on the Play tab now uses ${bot.name}'s weights. You can also pick "${bot.name}" as a player.`);
      } else if (act === 'load') {
        // works for a bot of any ruleset: its weights seed the tuning run for the rules on the left
        if (tn.running) return;
        tstore.pick = botStart(bot).id;
        const cur = recFor(state.rules, true), d = tnDraft(), fam = tnFam();
        const phased = d.phased !== false || Object.keys(bot.weights).some(T.isEnd);
        if (!cur.sessions[tstore.pick]) cur.sessions[tstore.pick] = T.newSession(bot.weights, Object.assign({}, d, { start: tstore.pick, seed: ((Math.random() * 1e6) | 0) + 1, tune: d.tune || undefined, phased }));
        const sess = cur.sessions[tstore.pick];
        sess.theta = Object.assign({}, fam.defaults, bot.weights);
        if (phased && !sess.phased) T.setPhased(sess, true);
        sess.depth = bot.depth;
        sess.endAt = bot.endAt | 0;
        if (bot.patterns) { // a pattern bot: its table seeds the run (float weights rebuilt from it)
          sess.patterns = bot.patterns; sess.tableId = sess.tableId || 'run:' + cur.id;
          if (bot.qDepth !== undefined) sess.qDepth = bot.qDepth;
          if (tn.masterSess === sess) { tn.master = null; tn.masterSess = null; }
          putTable(sess.tableId, sess.patterns);
        }
        tsave(); renderTune(); refreshRulesId();
        toast(`The ${T.startById(tstore.pick).name} tuner for these rules now starts from ${bot.name}'s weights` + (cur === rec ? '.' : ` (tuned for ${recLabel(rec)}).`));
      } else if (act === 'rename') {
        const n = prompt('New name', bot.name);
        if (n && n.trim()) { bot.name = n.trim().slice(0, 40); tsave(); refreshPickers(); renderTuneBots(); }
      } else if (act === 'del') {
        if (!confirm(`Delete ${bot.name}?`)) return;
        rec.bots.splice(rec.bots.indexOf(bot), 1); tsave(); refreshPickers(); renderTuneBots(); refreshRulesId();
      }
    });
    $('#tn-export').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(Object.assign({ format: TKEY, exported: new Date().toISOString() }, tstore), null, 1)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'paper-othello-bots.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
    $('#tn-import').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      let data;
      try { data = JSON.parse(await file.text()); } catch (err) { toast('That file is not valid JSON.'); return; }
      if (!data || typeof data.rulesets !== 'object') { toast('That file has no bots in it.'); return; }
      let added = 0;
      for (const k in data.rulesets) {
        const src = data.rulesets[k];
        if (!src || !src.rules || !Array.isArray(src.bots)) continue;
        const rec = recFor(src.rules, true); // keyed afresh from the rules, not the file's own key
        if (!rec.name && src.name) rec.name = src.name;
        const inc = upgradeRec({ session: src.session, sessions: src.sessions, bots: [] });
        for (const k in inc.sessions) if (!rec.sessions[k]) rec.sessions[k] = inc.sessions[k];
        for (const b of src.bots) {
          if (!b || !b.id || !b.weights || rec.bots.some((x) => x.id === b.id)) continue;
          rec.bots.push(b); added++;
        }
      }
      tsave(); refreshPickers(); renderTune(); refreshRulesId();
      toast(`Imported ${added} bot${added === 1 ? '' : 's'}.`);
    });
  }

  /* ---------- start ---------- */
  /* ---------- the ladder (Ladder tab) ---------- */
  // One Elo per bot per ruleset. A ladder's games = the games in ladder-data.js (experiments/royale.js, or a local
  // ladder built in this browser) + this browser's game log (glog). Every rating shown anywhere is the Bradley–Terry
  // fit over all of them (Lad.merge, Random = 0), so any game between two ladder bots refines both their numbers.
  // Your own Play-tab games are not in the log: they move only your rating (meFit).
  const LKEY = 'paper-othello-ladders-v1';
  let lstore = {};
  try { lstore = JSON.parse(localStorage.getItem(LKEY) || '{}') || {}; } catch (e) { lstore = {}; }
  const lsave = () => { try { localStorage.setItem(LKEY, JSON.stringify(lstore)); } catch (e) { toast('Could not save the ladder: browser storage is full or blocked.'); } };
  const ladderPool = makePool();
  const ld = { sel: null, busy: null, picked: {} }; // busy: { kind: 'rate' | 'build' | 'train', id, done, total }; picked: ladder id → Set of bot ids
  const pickedFor = (id) => (ld.picked[id] = ld.picked[id] || new Set());
  const SLOW = Lad.SLOW;

  // The game log: per rules key, batches of games between ladder bots played in this browser (Ladder tab, rating a
  // saved bot, Lab matches). glog[key] = { batches: [{ id, t, src, pairs: [[idA, idB, scoreA, games]], games, xw }] }.
  // "Export games" downloads it; experiments/merge-games.js folds it into ladder-data.js and records the batch ids in
  // the ladder's `merged` list, so a batch already in the file is never counted twice (and is pruned here).
  const GKEY = 'paper-othello-games-v1', XKEY = 'paper-othello-ladder-extra-v1';
  let glog = null;
  try { glog = JSON.parse(localStorage.getItem(GKEY) || 'null'); } catch (e) { glog = null; }
  const gsave = () => { try { localStorage.setItem(GKEY, JSON.stringify(glog)); } catch (e) { toast('Could not save the game log: browser storage is full or blocked. Export it from the Ladder tab.'); } };
  const newBatchId = () => 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const foldPairs = (pairs) => {
    const m = new Map();
    for (const [a, b, s, n] of pairs) {
      if (!n || a === b) continue;
      const lo = a < b ? a : b, k = lo + '|' + (a < b ? b : a), e = m.get(k) || [lo, a < b ? b : a, 0, 0];
      e[2] += a === lo ? s : n - s; e[3] += n; m.set(k, e);
    }
    return [...m.values()];
  };
  // Adds one batch of games to the log. Returns the number of games added.
  // `op`: the random opening moves the games started from; a ladder counts only batches with its own (Lad.OPENING since
  // 2026-11-13; batches from before carry none and count as 1).
  function logGames(key, pairs, xw, src, op) {
    const p = foldPairs(pairs), games = p.reduce((a, e) => a + e[3], 0);
    if (!games) return 0;
    const g = glog[key] = glog[key] || { batches: [] };
    g.batches.push({ id: newBatchId(), t: Date.now(), src, pairs: p, games, xw: xw || 0, op: op || 1 });
    gsave();
    return games;
  }
  const mergedIds = (key) => { const s = new Set(); for (const id in LDATA) if (LDATA[id].rulesKey === key) for (const b of LDATA[id].merged || []) s.add(b); return s; };
  const liveBatches = (key) => { const done = mergedIds(key); return ((glog[key] || {}).batches || []).filter((b) => !done.has(b.id)); };
  (function loadLog() {
    if (glog && typeof glog === 'object') { // drop batches that ladder-data.js already holds
      for (const key in glog) { const live = liveBatches(key); if (live.length !== (glog[key].batches || []).length) { glog[key].batches = live; gsave(); } }
      return;
    }
    // First load: bring over the older stores. "Play more games" extras (per ladder id) and the rating games each saved
    // bot kept as bot.ladder[ladderId].opps ([name, elo, s, n]) become batches; the snapshots themselves go.
    glog = {};
    const byId = {};
    for (const id in LDATA) byId[id] = LDATA[id];
    for (const key in lstore) byId[lstore[key].id] = lstore[key];
    let old = {};
    try { old = JSON.parse(localStorage.getItem(XKEY) || '{}') || {}; } catch (e) { old = {}; }
    for (const id in old) { const l = byId[id], x = old[id]; if (l && x && x.pairs) logGames(l.rulesKey, x.pairs, x.xw, 'Ladder tab (older)'); }
    let touched = false;
    for (const key in tstore.rulesets) for (const bot of tstore.rulesets[key].bots) {
      for (const lid in bot.ladder || {}) {
        const l = byId[lid], r = bot.ladder[lid];
        if (l && r.opps) {
          const pairs = r.opps.map(([name, , s, n]) => { const o = l.bots.find((b) => b.name === name); return o ? ['saved:' + bot.id, o.id, s, n] : null; }).filter(Boolean);
          logGames(l.rulesKey, pairs, Math.round((l.xWinShare || 0.5) * pairs.reduce((a, p) => a + p[3], 0)), 'Rating (older)');
        }
      }
      if (bot.ladder) { delete bot.ladder; touched = true; }
    }
    gsave();
    if (touched) tsave();
    try { localStorage.removeItem(XKEY); } catch (e) { /* ignore */ }
  })();

  const mergedCache = new Map();
  // A saved bot of yours joins a ladder as a full member as soon as it has games in the log; a deleted bot simply drops
  // out (merge ignores pairs with non-members).
  const savedMember = (id) => {
    const f = findBot(id.slice(6));
    return f && { id, name: f.bot.name, spec: savedSpec(f.bot), elo: 0, ci: 0, score: 0, games: 0,
      idea: `Your saved bot from the Tune tab (${botStart(f.bot).name}, look-ahead ${f.bot.depth}).` };
  };
  const batchOp = (b) => b.op || 1;
  const ladderOp = (l) => l.opening || 1;
  function withLog(l) {
    const bs = liveBatches(l.rulesKey).filter((b) => batchOp(b) === ladderOp(l)); // other openings: kept, not counted
    if (!bs.length) return l;
    const pairs = bs.flatMap((b) => b.pairs), ids = new Set(pairs.flatMap((p) => [p[0], p[1]]));
    const joins = [...ids].filter((id) => id.startsWith('saved:') && !l.bots.some((b) => b.id === id)).map(savedMember).filter(Boolean);
    const games = bs.reduce((a, b) => a + b.games, 0), xw = bs.reduce((a, b) => a + b.xw, 0);
    const ck = l.id + '|' + l.name + '|' + l.games + '|' + bs.map((b) => b.id).join(',') + '|' + joins.map((b) => b.id + b.name).join(',');
    if (!mergedCache.has(ck)) {
      const m = Lad.merge(joins.length ? Object.assign({}, l, { bots: l.bots.concat(joins) }) : l, pairs);
      m.extraGames = games;
      m.xWinShare = ((l.xWinShare || 0) * l.games + xw) / (l.games + games);
      mergedCache.set(ck, m);
    }
    return mergedCache.get(ck);
  }
  // A bot's current rating on a ladder (a row of l.bots), or null when it has no games there.
  const ratingOf = (l, id) => { const r = l && l.bots.find((b) => b.id === id); return r && r.games ? r : null; };
  // Which ladder bot a player spec is (a saved bot at its own look-ahead, or a pool bot with the same settings), or null.
  function memberOf(l, spec) {
    if (spec.type === 'saved') { const f = findBot(spec.id); return f && (!spec.depth || spec.depth === f.bot.depth) ? 'saved:' + spec.id : null; }
    const o = oppOf(spec), b = l.bots.find((x) => !x.id.startsWith('saved:') && specSig(x.spec) === o.sig);
    return b ? b.id : null;
  }
  // Pool bots that can be used as opponents here: quick ones, and saved bots only when this browser has them.
  const playableOpps = (l, not) => l.bots.filter((b) => !SLOW.has(b.id) && b.id !== not && (!b.id.startsWith('saved:') || findBot(b.id.slice(6))));

  // One ladder per ruleset, named after it (its id, or the name you gave the rules on the Tune tab). A ladder built in
  // this browser for rules that also have a frozen one is left out.
  const ladderName = (key) => { const rec = tstore.rulesets[key], id = T.shortId(key); return rec && rec.name ? `${rec.name} (${id})` : id; };
  function ladders() {
    const out = [], frozen = new Set();
    for (const id in LDATA) { frozen.add(LDATA[id].rulesKey); out.push(withLog(Object.assign({ frozen: true }, LDATA[id], { name: ladderName(LDATA[id].rulesKey) }))); }
    for (const key in lstore) if (!frozen.has(key)) out.push(withLog(Object.assign({ frozen: false }, lstore[key], { name: ladderName(key) })));
    return out;
  }
  const ladderById = (id) => ladders().find((l) => l.id === id) || null;
  // Bots you can tick on a ladder: its pool plus your saved bots for its rules (rated there or not).
  function pickable(l) {
    const out = l.bots.slice(), rec = tstore.rulesets[l.rulesKey];
    if (rec) for (const bot of rec.bots) if (!out.some((b) => b.id === 'saved:' + bot.id)) out.push(savedMember('saved:' + bot.id));
    return out;
  }
  const ladderForKey = (key) => ladders().find((l) => l.rulesKey === key) || null;
  const savedSpec = (bot) => T.playSpec(botStart(bot).id, bot.weights, bot.depth, bot.name, bot);

  // Downloads every ruleset's unmerged games, the saved bots they involve, and ladders built in this browser, for
  // `deno run --allow-read --allow-write experiments/merge-games.js <file>` to fold into ladder-data.js.
  function exportGames() {
    const out = { format: 'paper-othello-games', v: 1, exported: new Date().toISOString(), rulesets: {} };
    const keys = new Set(Object.keys(glog).concat(Object.keys(lstore)));
    for (const key of keys) {
      const batches = liveBatches(key), frozen = Object.values(LDATA).some((l) => l.rulesKey === key);
      const ladder = !frozen && lstore[key] ? lstore[key] : null;
      if (!batches.length && !ladder) continue;
      const ids = new Set(batches.flatMap((b) => b.pairs.flatMap((p) => [p[0], p[1]])));
      if (ladder) ladder.bots.forEach((b) => ids.add(b.id));
      const bots = {};
      for (const id of ids) if (id.startsWith('saved:')) { const m = savedMember(id); if (m) bots[id] = { id, name: m.name, spec: m.spec, idea: m.idea }; }
      out.rulesets[key] = { rules: (ladder || ladderForKey(key) || {}).rules, batches, bots, ladder };
    }
    const n = Object.values(out.rulesets).reduce((a, r) => a + r.batches.reduce((c, b) => c + b.games, 0), 0);
    if (!Object.keys(out.rulesets).length) { toast('Nothing to export: every game here is already in ladder-data.js.'); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(out)], { type: 'application/json' }));
    a.download = `paper-othello-games-${out.exported.slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast(`Exported ${fmt(n)} games. Merge them with experiments/merge-games.js; once ladder-data.js has them they are not counted twice.`);
  }

  // Where to start looking for a saved bot's opponents (never shown): its rating, else the pool bot it was tuned from.
  function guessFor(l, bot) {
    const r = ratingOf(l, 'saved:' + bot.id);
    return r ? r.elo : T.ladderGuess(l, { start: bot.start || 'default', depth: bot.depth });
  }

  // Everyone on a ladder with games there (your saved bots join through the log).
  function ladderRows(l) {
    return l.bots.filter((b) => b.games || b.id === 'random').map((b) => Object.assign({ mine: b.id.startsWith('saved:') }, b)).sort((a, b) => b.elo - a.elo);
  }

  function renderLadder() {
    const all = ladders();
    if (!ld.sel || !ladderById(ld.sel)) {
      const here = ladderForKey(T.rulesKey(state.rules));
      ld.sel = here ? here.id : (all.find((l) => l.id === 'ysbvl') || all[0] || {}).id || null;
    }
    $('#ld-boards').innerHTML = all.map((l) => `<button role="tab" data-ladder="${esc(l.id)}" class="${l.id === ld.sel ? 'on' : ''}" aria-selected="${l.id === ld.sel}">${esc(l.name)}</button>`).join('');
    const l = ladderById(ld.sel);
    renderLadderBuild();
    if (!l) {
      $('#ld-meta').textContent = '';
      $('#ld-table').innerHTML = '<p class="muted">No ladder yet. Run <code>experiments/royale.js</code>, or build one for the current rules below.</p>';
      $('#ld-mine').innerHTML = ''; $('#ld-h2h').innerHTML = ''; $('#ld-me').innerHTML = '';
      return;
    }
    $('#ld-meta').innerHTML = `${esc(E.describeRules(l.rules))}<br>${fmt(l.games)} games between ${l.bots.length} bots` +
      ` · ${l.frozen ? 'frozen' : 'built in this browser'} ${esc(l.generated)}` +
      (l.extraGames ? ` · <b>includes ${fmt(l.extraGames)} games played in this browser</b> (<button class="link" data-ld-export data-tip="Downloads them; experiments/merge-games.js adds them to ladder-data.js">export them</button> · <button class="link" data-ld-discard>discard them</button>)`
        : !l.frozen ? ' (<button class="link" data-ld-export data-tip="Downloads it; experiments/merge-games.js adds it to ladder-data.js">export it</button>)' : '') +
      ` · X won ${pct(l.xWinShare)} of games · games start with ${ladderOp(l)} random move${ladderOp(l) === 1 ? '' : 's'}` +
      (!l.frozen && ladderOp(l) !== Lad.OPENING ? ` · <b>built before ladders moved to ${Lad.OPENING} random opening moves: build it again below to use them</b>` : '');
    const rows = ladderRows(l), mf = meFit(l);
    if (mf) rows.push({ id: 'me', name: 'You', me: true, elo: Math.round(mf.elo), ci: Math.round(1.96 * mf.se), score: mf.score, games: mf.games,
      idea: 'Your games against these bots on the Play tab, fitted with their ratings held fixed (recent games count more).' });
    rows.sort((a, b) => b.elo - a.elo);
    let lo = Math.min(0, ...rows.map((r) => r.elo - r.ci)), hi = Math.max(...rows.map((r) => r.elo + r.ci));
    const step = niceMax((hi - lo) / 4);
    lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
    const W = 200, H = 18, pad = 6, X = (v) => pad + ((v - lo) / (hi - lo || 1)) * (W - 2 * pad);
    let axis = `<svg class="ld-axis" viewBox="0 0 ${W} 14" width="${W}" height="14" aria-hidden="true">`;
    for (let v = lo; v <= hi + 1e-9; v += step) axis += `<text class="ch-tick" x="${X(v)}" y="11" text-anchor="middle">${fmt(v)}</text>`;
    axis += '</svg>';
    const zero = X(0);
    const picked = pickedFor(l.id), inPool = new Set(pickable(l).map((b) => b.id));
    $('#ld-table').innerHTML = `<div class="ld-wrap"><table class="data ld-table"><thead><tr><th class="ld-pick" title="Pick bots to play more games">Pick</th><th class="num">#</th><th>Bot</th><th class="num">Elo</th><th class="ld-bar">${axis}</th><th class="num">Score</th><th class="num">Games</th><th></th></tr></thead><tbody>` +
      rows.map((r, i) => {
        const tip = `${r.name}: ${fmt(r.elo)} Elo, 95% range ${fmt(r.elo - r.ci)} to ${fmt(r.elo + r.ci)}; scored ${pct(r.score)} in ${fmt(r.games)} games`;
        const bar = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(tip)}"><path class="ch-axis" d="M${zero} 0V${H}"/>` +
          `<path class="ld-ci" d="M${X(r.elo - r.ci)} ${H / 2}H${X(r.elo + r.ci)}"/><circle class="ch-dot${r.mine || r.me ? ' ld-dot-mine' : ''}" cx="${X(r.elo)}" cy="${H / 2}" r="4.5"/></svg>`;
        const box = inPool.has(r.id) ? `<input type="checkbox" data-pick="${esc(r.id)}" aria-label="Pick ${esc(r.name)}"${picked.has(r.id) ? ' checked' : ''}${ld.busy ? ' disabled' : ''}>` : '';
        return `<tr class="${r.mine ? 'ld-mine' : r.me ? 'ld-mine ld-me' : ''}"><td class="ld-pick">${box}</td><td class="num">${i + 1}</td><td><b>${esc(r.name)}</b>${r.mine ? ' <span class="ld-tag">yours</span>' : r.me ? ' <span class="ld-tag">you</span>' : ''}<div class="muted small">${esc(r.idea || '')}</div></td>` +
          `<td class="num"><b>${fmt(r.elo)}</b><div class="muted small">±${fmt(r.ci)}</div></td><td class="ld-bar" data-tip="${esc(tip)}">${bar}</td>` +
          `<td class="num">${pct(r.score)}</td><td class="num">${fmt(r.games)}</td><td>${r.me ? '' : `<button class="link" data-play="${esc(r.id)}">Play it</button>`}</td></tr>`;
      }).join('') + '</tbody></table></div>';
    renderLadderMine(l);
    renderLadderMe(l);
    renderH2H(l, rows);
    renderTrainBar(l);
  }

  // The "play more games among the picked bots" bar above the table.
  function renderTrainBar(l) {
    const el = $('#ld-train');
    if (!l) { el.innerHTML = ''; return; }
    const can = pickable(l), picked = [...pickedFor(l.id)].filter((id) => can.some((b) => b.id === id)), m = picked.length;
    const pairs = clampInt(ld.trainPairs || 20, 1, 500, 20), games = (m * (m - 1)) / 2 * pairs * 2;
    const running = ld.busy && ld.busy.kind === 'train';
    const slow = picked.filter((id) => ['perfect', 'hustler', 'd6', 'mcts2000', 'acct5'].includes(id));
    el.innerHTML = `<button data-ld-top="8"${ld.busy ? ' disabled' : ''}>Pick the top 8</button><button data-ld-clear${ld.busy || !m ? ' disabled' : ''}>Clear</button>` +
      `<label>pairs per pairing <input type="number" id="ld-tpairs" min="1" max="500" value="${pairs}"${ld.busy ? ' disabled' : ''}></label>` +
      `<button class="primary" data-ld-train${(ld.busy && !running) || (!running && m < 2) ? ' disabled' : ''}>${running ? 'Stop' : m < 2 ? 'Pick 2 or more bots to play more games' : `Play ${fmt(games)} more games among the ${m} picked`}</button>` +
      `<span class="muted small">${running ? `${fmt(ld.busy.done)} of ${fmt(ld.busy.total)} game pairs played (finished pairs are kept if you stop)`
        : slow.length && m >= 2 ? 'Includes slow bots (' + slow.map((id) => esc(can.find((b) => b.id === id).name)).join(', ') + '): expect a few minutes.' : ''}</span>`;
  }

  async function trainLadder(l) {
    if (ld.busy) { if (ld.busy.kind === 'train') ladderPool.cancel(); return; }
    const can = pickable(l), ids = [...pickedFor(l.id)].filter((id) => can.some((b) => b.id === id));
    if (ids.length < 2) return;
    const PAIRS = clampInt(ld.trainPairs || 20, 1, 500, 20), rules = E.normalizeRules(l.rules), bots = ids.map((id) => can.find((b) => b.id === id));
    const acc = new Map(), jobs = [];
    for (let p = 0; p < PAIRS; p++) {
      const seed = (Math.random() * 1e9) >>> 0;
      for (let i = 0; i < bots.length; i++) for (let j = i + 1; j < bots.length; j++) {
        const job = Lad.pairJobs(rules, bots[i].spec, bots[j].spec, [seed], ladderOp(l))[0];
        job.ab = [bots[i].id, bots[j].id]; jobs.push(job);
      }
    }
    ld.busy = { kind: 'train', id: l.id, done: 0, total: jobs.length };
    renderLadder();
    let xw = 0;
    try {
      await ladderPool.run(jobs, (job, games) => {
        const key = job.ab.join('|'), e = acc.get(key) || [job.ab[0], job.ab[1], 0, 0];
        e[2] += Lad.pointsA(games); e[3] += games.length; acc.set(key, e);
        for (const g of games) if (g.winner === 1) xw++;
        ld.busy.done++;
        if (!$('#tab-ladder').hidden) { const sp = $('#ld-train span'); if (sp) sp.textContent = `${fmt(ld.busy.done)} of ${fmt(ld.busy.total)} game pairs played (finished pairs are kept if you stop)`; }
      });
    } catch (err) { toast('Playing the games failed: ' + err.message); }
    ld.busy = null;
    const n = logGames(l.rulesKey, [...acc.values()], xw, 'Ladder tab', ladderOp(l));
    if (n) toast(`Added ${fmt(n)} games; every rating on the ladder was refitted.`);
    renderLadder();
  }

  function renderLadderMine(l) {
    const rec = tstore.rulesets[l.rulesKey];
    if (!rec || !rec.bots.length) {
      $('#ld-mine').innerHTML = `<p class="muted">No saved bots for these rules yet. <button class="link" data-ld-tune>Switch to these rules and tune one</button>.</p>`;
      return;
    }
    const picked = pickedFor(l.id);
    $('#ld-mine').innerHTML = '<table class="data"><thead><tr><th class="ld-pick" title="Pick bots to play more games">Pick</th><th>Name</th><th class="num">Look-ahead</th><th class="num">Elo</th><th class="num">Games</th><th></th></tr></thead><tbody>' +
      rec.bots.map((bot) => {
        const busy = ld.busy && ld.busy.id === bot.id, r = ratingOf(l, 'saved:' + bot.id);
        const box = `<input type="checkbox" data-pick="saved:${esc(bot.id)}" aria-label="Pick ${esc(bot.name)}"${picked.has('saved:' + bot.id) ? ' checked' : ''}${ld.busy ? ' disabled' : ''}>`;
        const elo = busy ? `<span data-ld-progress>rating… ${Math.round((100 * ld.busy.done) / (ld.busy.total || 1))}%</span>`
          : r ? `<b>${fmt(r.elo)}</b> <span class="muted small">±${fmt(r.ci)}</span>`
          : '<span class="muted" data-tip="No games on this ladder yet">unrated</span>';
        return `<tr data-bot="${esc(bot.id)}"><td class="ld-pick">${box}</td><td><b>${esc(bot.name)}</b></td><td class="num">${bot.depth}</td><td class="num">${elo}</td>` +
          `<td class="num">${r ? fmt(r.games) : '–'}</td><td class="acts"><button class="link" data-ld-rate${ld.busy ? ' disabled' : ''}>${r ? 'Rate again (more games)' : 'Rate on the ladder'}</button>` +
          ` <button class="link" data-play="saved:${esc(bot.id)}">Play it</button></td></tr>`;
      }).join('') + '</tbody></table>';
  }

  function renderH2H(l, rows) {
    const pool = rows.filter((r) => l.bots.some((b) => b.id === r.id));
    const idx = new Map(pool.map((r, i) => [r.id, i])), k = pool.length;
    const S = Array.from({ length: k }, () => new Array(k).fill(null));
    for (const [a, b, s, n] of l.pairs) {
      if (!idx.has(a) || !idx.has(b) || !n) continue;
      S[idx.get(a)][idx.get(b)] = { s: s / n, n }; S[idx.get(b)][idx.get(a)] = { s: 1 - s / n, n };
    }
    const cell = (i, j) => {
      if (i === j) return '<td class="ld-self"></td>';
      const c = S[i][j];
      if (!c) return '<td></td>';
      const d = Math.round(Math.min(1, Math.abs(c.s - 0.5) * 2) * 70), col = c.s >= 0.5 ? 'var(--x)' : 'var(--o)';
      return `<td style="background:color-mix(in oklab, ${col} ${d}%, var(--div-mid))" data-tip="${esc(pool[i].name)} scored ${pct(c.s)} against ${esc(pool[j].name)} in ${fmt(c.n)} games">${Math.round(100 * c.s)}</td>`;
    };
    $('#ld-h2h').innerHTML = '<table class="ld-grid"><thead><tr><th></th>' + pool.map((r, j) => `<th data-tip="${esc(r.name)}">${j + 1}</th>`).join('') + '</tr></thead><tbody>' +
      pool.map((r, i) => `<tr><th>${i + 1}. ${esc(r.name)}</th>${pool.map((_, j) => cell(i, j)).join('')}</tr>`).join('') + '</tbody></table>';
  }

  function renderLadderBuild() {
    const b = ld.busy && ld.busy.kind === 'build';
    $('#ld-build').textContent = b ? 'Stop' : ladderForKey(T.rulesKey(state.rules)) && !LDATA[(ladderForKey(T.rulesKey(state.rules)) || {}).id] ? 'Rebuild the ladder for the current rules' : 'Build a ladder for the current rules';
    $('#ld-build').disabled = !!ld.busy && !b;
    $('#ld-status').textContent = b ? `${fmt(ld.busy.done)} of ${fmt(ld.busy.total)} game pairs played` : '';
  }

  function ladderTick() {
    if ($('#tab-ladder').hidden) return;
    if (ld.busy.kind === 'build') renderLadderBuild();
    else { const el = $('[data-ld-progress]'); if (el) el.textContent = `rating… ${Math.round((100 * ld.busy.done) / (ld.busy.total || 1))}%`; }
  }

  // Two rounds against the pool bots nearest the bot's strength (the second round re-centred on the first fit).
  // Rates a saved bot on a ladder: two rounds against the 6 pool bots nearest its strength (the second round re-centred on
  // the first fit), its one rating fitted with the pool held fixed. `pairs` is the total number of game pairs.
  // Returns the fit, or null if stopped. Used by the Ladder tab and by saving/re-rating on the Tune tab.
  // The games go into the log (finished pairs are kept even if stopped), so they refine the opponents' ratings too.
  // Returns the bot's refitted row on the ladder, or null if nothing was played.
  async function ladderFit(l, bot, pairs, workers, onTick) {
    const pool = playableOpps(l, 'saved:' + bot.id), me = savedSpec(bot), rules = E.normalizeRules(l.rules), sid = 'saved:' + bot.id;
    const res = new Map(), per = Math.max(2, Math.round(pairs / (2 * Math.min(6, pool.length)))), total = 2 * Math.min(6, pool.length) * per;
    let guess = guessFor(l, bot), done = 0, xw = 0;
    for (let round = 0; round < 2 && !workers.cancelled; round++) {
      const opps = Lad.opponentsFor(pool, guess, 6), jobs = [];
      const seeds = Array.from({ length: per }, () => (Math.random() * 1e9) >>> 0);
      for (const o of opps) for (const j of Lad.pairJobs(rules, me, o.spec, seeds, ladderOp(l))) { j.opp = o; jobs.push(j); }
      await workers.run(jobs, (job, games) => {
        const r = res.get(job.opp.id) || { id: job.opp.id, elo: job.opp.elo, s: 0, n: 0 };
        r.s += Lad.pointsA(games); r.n += games.length; res.set(job.opp.id, r);
        for (const g of games) if (g.winner === 1) xw++;
        if (onTick) onTick(++done, total);
      });
      const f = Lad.fitOne([...res.values()]); // only to centre the second round
      if (f) guess = f.elo;
    }
    if (!logGames(l.rulesKey, [...res.values()].map((r) => [sid, r.id, r.s, r.n]), xw, `Rating ${bot.name}`, ladderOp(l))) return null;
    return ratingOf(ladderForKey(l.rulesKey), sid);
  }

  async function rateOnLadder(l, bot) {
    if (ld.busy) { toast('The ladder is busy. Wait for it to finish.'); return; }
    ld.busy = { kind: 'rate', id: bot.id, done: 0, total: 1 };
    renderLadder();
    let fitted = null;
    try {
      fitted = await ladderFit(l, bot, 96, ladderPool, (d, t) => { ld.busy.done = d; ld.busy.total = t; ladderTick(); });
    } catch (err) { toast('Rating failed: ' + err.message); }
    ld.busy = null;
    if (fitted) {
      refreshPickers();
      toast(`${bot.name}: ${fmt(fitted.elo)} Elo on the ${l.name} ladder (everyone it played was refitted too).`);
    }
    renderLadder();
  }

  // A round robin of the quicker roster bots (plus your saved bots for these rules) under the current rules.
  async function buildLadder() {
    if (ld.busy) { if (ld.busy.kind === 'build') ladderPool.cancel(); return; }
    const rules = E.normalizeRules(state.rules), key = T.rulesKey(rules);
    if (Object.values(LDATA).some((l) => l.rulesKey === key)) { toast('These rules already have a frozen ladder above.'); return; }
    const roster = Lad.rosterFor(rules.size).filter((r) => !SLOW.has(r.id)).map((r) => ({ id: r.id, name: r.name, spec: r.spec, idea: r.idea }));
    const rec = tstore.rulesets[key];
    if (rec) for (const bot of rec.bots) roster.push({ id: 'saved:' + bot.id, name: bot.name, spec: savedSpec(bot), idea: `Your saved bot from the Tune tab (look-ahead ${bot.depth}).` });
    const PAIRS = clampInt($('#ld-pairs').value, 2, 200, 10), k = roster.length, jobs = [], pairings = [];
    for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) pairings.push({ i, j, s: 0, n: 0, x: 0 });
    for (let p = 0; p < PAIRS; p++) {
      const seed = (Math.random() * 1e9) >>> 0;
      for (const pr of pairings) { const j = Lad.pairJobs(rules, roster[pr.i].spec, roster[pr.j].spec, [seed], Lad.OPENING)[0]; j.pr = pr; jobs.push(j); }
    }
    ld.busy = { kind: 'build', id: key, done: 0, total: jobs.length };
    renderLadderBuild();
    const t0 = performance.now();
    try {
      await ladderPool.run(jobs, (job, games) => {
        job.pr.s += Lad.pointsA(games); job.pr.n += games.length;
        for (const g of games) if (g.winner === 1) job.pr.x++;
        ld.busy.done++; ladderTick();
      });
    } catch (err) { toast('Building the ladder failed: ' + err.message); }
    const stopped = ladderPool.cancelled;
    ld.busy = null;
    const played = pairings.filter((p) => p.n);
    if (played.length < pairings.length) {
      toast(stopped ? 'Stopped: every pair of bots has to meet at least once. Nothing was saved.' : 'Not every pair of bots met. Nothing was saved.');
      renderLadder(); return;
    }
    const fitted = Lad.fit(k, pairings.map((p) => ({ i: p.i, j: p.j, s: p.s, n: p.n })), roster.findIndex((r) => r.id === 'random'));
    const tot = roster.map(() => ({ s: 0, n: 0 }));
    for (const p of pairings) { tot[p.i].s += p.s; tot[p.i].n += p.n; tot[p.j].s += p.n - p.s; tot[p.j].n += p.n; }
    const games = pairings.reduce((a, p) => a + p.n, 0), id = 'local:' + T.shortId(key);
    lstore[key] = { id, name: T.shortId(key), rules, rulesKey: key, opening: Lad.OPENING, generated: new Date().toISOString().slice(0, 10),
      games, secs: Math.round((performance.now() - t0) / 1000), xWinShare: pairings.reduce((a, p) => a + p.x, 0) / games,
      bots: roster.map((r, i) => ({ id: r.id, name: r.name, spec: r.spec, idea: r.idea, elo: Math.round(fitted[i].elo), ci: Math.round(1.96 * fitted[i].se),
        score: tot[i].s / tot[i].n, games: tot[i].n })),
      pairs: pairings.map((p) => [roster[p.i].id, roster[p.j].id, p.s, p.n]) };
    delete glog[key]; gsave(); // a rebuilt ladder starts clean
    lsave(); refreshPickers();
    ld.sel = id; renderLadder();
    toast(`Ladder built: ${fmt(games)} games in ${fmt(lstore[key].secs)} s.`);
  }

  // side: the colour you play (1 = X, the default; 2 = O).
  function playFromLadder(l, rowId, side, why) {
    side = side || 1;
    const setPlayer = (p, spec) => { const t = state.players[p]; for (const k in t) delete t[k]; Object.assign(t, spec); };
    let spec;
    if (rowId.startsWith('saved:')) {
      const f = findBot(rowId.slice(6));
      if (!f) { toast('That bot was deleted.'); return; }
      spec = { type: 'saved', id: f.bot.id, depth: f.bot.depth };
    } else {
      const b = l.bots.find((x) => x.id === rowId);
      spec = Object.assign({}, b.spec);
      delete spec.weights;
    }
    if (T.rulesKey(state.rules) !== l.rulesKey) applyRules(l.rules);
    setPlayer(side, { type: 'human' }); setPlayer(3 - side, spec);
    save(); refreshPickers(); newGame(); showTab('play');
    toast(`You are ${NAME[side]} against ${rowId.startsWith('saved:') ? findBot(rowId.slice(6)).bot.name : spec.name}${why || ''} on the ${l.name} rules.`);
  }

  /* ---------- your rating (Play tab games against bots) ---------- */
  // Every finished Play-tab game of you against one bot, from the normal start, with no take-backs, no paused bots and
  // no move scores, is kept per ruleset. Your rating on a ladder is fitted the way a newcomer bot joins it: the ratings
  // of the bots you played held fixed (meMap: like Lad.fitOne, but with one prior instead of a draw per opponent), recent games weighted more (a game counts half after ME_HALF more
  // games), so it follows you as you improve. Games against bots that aren't on the ladder are kept but not counted
  // (they will be if that bot gets a ladder rating later, e.g. a saved bot you rate).
  const MEKEY = 'paper-othello-me-v1', ME_HALF = 40;
  let mestore = { games: [] };
  try { mestore = Object.assign(mestore, JSON.parse(localStorage.getItem(MEKEY) || '{}')); } catch (e) { /* fresh start */ }
  const mesave = () => { try { localStorage.setItem(MEKEY, JSON.stringify(mestore)); } catch (e) { toast('Could not save your games: browser storage is full or blocked.'); } };

  // What makes a bot that bot, for matching a Play-tab opponent to a ladder bot: its settings, defaults filled in.
  function specSig(spec) {
    const o = {};
    for (const k of Object.keys(spec).sort()) if (!['name', 'timeMs', 'weights', 'id'].includes(k) && spec[k] !== undefined) o[k] = spec[k];
    if (o.type === 'sloppy' && o.p === undefined) o.p = 0.5;
    if (o.type === 'closer' && o.exactAt === undefined) o.exactAt = 12;
    if (!o.qDepth) { delete o.qDepth; delete o.qMin; }
    if (!(o.endAt > 0)) delete o.endAt;
    if (!B.DEPTH_TYPES.includes(o.type)) delete o.depth;
    if (!B.PLAYOUT_TYPES.includes(o.type)) delete o.playouts;
    return JSON.stringify(o);
  }
  const sameWeights = (w) => B.KEYS.every((k) => (w[k] || 0) === (B.DEFAULT_WEIGHTS[k] || 0)) && !Object.keys(w).some((k) => k.endsWith('@end'));
  // The opponent as stored with a game: a saved bot by id, anything else by its settings (Minimax with your own
  // Play-tab weights is not Default, so it gets a signature no ladder bot has).
  function oppOf(spec) {
    if (spec.type === 'saved') { const f = findBot(spec.id); return { saved: spec.id, name: f ? f.bot.name : 'a saved bot' }; }
    const custom = spec.type === 'minimax' && !sameWeights(state.weights);
    return { sig: specSig(spec) + (custom ? '+own weights' : ''), name: B.label(spec) + (custom ? ' (your weights)' : '') };
  }
  function oppOnLadder(l, o) {
    if (o.saved) { const r = ladderRows(l).find((x) => x.id === 'saved:' + o.saved); return r ? { elo: r.elo, name: r.name } : null; }
    const b = l.bots.find((x) => specSig(x.spec) === o.sig);
    return b ? { elo: b.elo, name: b.name } : null;
  }
  // Your fit on ladder l (null without a rated game). upto: only the first `upto` games (for "how much the last one moved it").
  function meFit(l, upto) {
    let gs = mestore.games.filter((g) => g.key === l.rulesKey);
    if (upto !== undefined) gs = gs.slice(0, upto);
    const rated = gs.map((g) => ({ g, o: oppOnLadder(l, g.opp) })).filter((x) => x.o);
    if (!rated.length) return null;
    const by = new Map(), k = rated.length;
    rated.forEach((x, i) => {
      const w = Math.pow(0.5, (k - 1 - i) / ME_HALF), e = by.get(x.o.elo) || { elo: x.o.elo, s: 0, n: 0 };
      e.s += w * x.g.s; e.n += w; by.set(x.o.elo, e);
    });
    const f = meMap([...by.values()], l);
    return Object.assign(f, { games: k, score: rated.reduce((a, x) => a + x.g.s, 0) / k, all: gs.length, rated });
  }
  // Maximum a posteriori rating: the games' likelihood (bots' ratings fixed) times one prior, a bell curve around the
  // ladder's median bot (sd ME_SD). Unlike a virtual draw per opponent, a single fixed prior means a loss can only
  // lower your rating and a win only raise it.
  const ME_SD = 350;
  function meMap(res, l) {
    const els = l.bots.map((b) => b.elo).sort((a, b) => a - b), mu = els[els.length >> 1] / Lad.SCALE, tau = 1 / (ME_SD / Lad.SCALE) ** 2;
    let x = mu, info = tau;
    for (let it = 0; it < 100; it++) {
      let g = -tau * (x - mu); info = tau;
      for (const r of res) { const p = 1 / (1 + Math.exp(r.elo / Lad.SCALE - x)); g += r.s - r.n * p; info += r.n * p * (1 - p); }
      const d = Math.max(-3, Math.min(3, g / info));
      x += d;
      if (Math.abs(d) < 1e-9) break;
    }
    return { elo: x * Lad.SCALE, se: Lad.SCALE / Math.sqrt(info) };
  }

  // Can the game that has just started count? null when there is nothing to rate (no human, or two humans).
  function meStart() {
    const hs = [1, 2].filter(isHuman);
    if (hs.length !== 1) return null;
    const side = hs[0], opp = oppOf(state.players[3 - side]);
    return { key: T.rulesKey(state.rules), side, opp, ok: true, why: '', done: false };
  }
  function meSpoil(why) { if (state.rated && state.rated.ok && !state.rated.done) { state.rated.ok = false; state.rated.why = why; } }
  // Called on every change of the Play-tab game: notices assistance, and records the game once it is over.
  function meWatch() {
    const r = state.rated, g = state.game;
    if (!r || r.done) return;
    if (state.sandbox) meSpoil('it was edited in the sandbox');
    if (!g.over && state.opts.showScores && isHuman(g.turn)) meSpoil('the bot brain was scoring your moves');
    if (!g.over || !r.ok) return;
    r.done = true;
    const w = E.winner(g), s = w === 0 ? 0.5 : w === r.side ? 1 : 0;
    mestore.games.push({ t: Date.now(), key: r.key, side: r.side, s, mine: g.count[r.side], theirs: g.count[3 - r.side], opp: r.opp });
    mesave();
    const l = ladderForKey(r.key), n = mestore.games.filter((x) => x.key === r.key).length;
    const after = l && meFit(l), before = l && meFit(l, n - 1), res = s === 1 ? 'You beat' : s === 0 ? 'You lost to' : 'You drew with';
    if (after && oppOnLadder(l, r.opp)) toast(`${res} ${r.opp.name}. Your rating: ${fmt(after.elo)}` + (before ? ` (${signed(after.elo - before.elo, 0)})` : '') + '.');
    else toast(`${res} ${r.opp.name}. Kept, but not rated: ${l ? 'that bot is not on the ladder' : 'these rules have no ladder'}.`);
    if (!$('#tab-ladder').hidden) renderLadder();
  }
  function renderMe() {
    const el = $('#me-line');
    if (!el) return;
    const key = T.rulesKey(state.rules), l = ladderForKey(key), r = state.rated, f0 = l && meFit(l);
    $('#me-elo').innerHTML = f0 ? `<b>${fmt(f0.elo)}</b> <span class="muted small">±${fmt(1.96 * f0.se)}</span>` : '<span class="muted">unrated</span>';
    $('#me-fair').disabled = !l;
    $('#me-fair').dataset.tip = l ? `A random ladder bot within ${ME_FAIR} Elo of ${f0 ? 'your rating' : 'the middle of the ladder (you have no rating yet)'}, and a random colour.` : 'These rules have no ladder yet.';
    let t = '';
    if (!l) t = '<span class="muted small">These rules have no ladder yet, so your games here are kept but not rated. <button class="link" data-me-ladder>Build one on the Ladder tab</button>.</span>';
    else {
      const f = meFit(l), n = f ? f.all : mestore.games.filter((g) => g.key === key).length;
      if (f) {
        const prev = meFit(l, f.all - 1), last = mestore.games.filter((g) => g.key === key).pop();
        const moved = prev && last && oppOnLadder(l, last.opp) ? ` · last game ${signed(f.elo - prev.elo, 0)}` : '';
        const near = ladderRows(l).filter((x) => !x.me).sort((a, b) => Math.abs(a.elo - f.elo) - Math.abs(b.elo - f.elo))[0];
        t = `<span class="muted small" data-tip="Fitted from ${fmt(f.games)} rated game${f.games === 1 ? '' : 's'} with the bots' ladder ratings held fixed (Random = 0), recent games counting more. 95% range ${fmt(f.elo - 1.96 * f.se)} to ${fmt(f.elo + 1.96 * f.se)}.">` +
          `${esc(l.name)} ladder · ${fmt(f.games)} rated game${f.games === 1 ? '' : 's'}${f.games < 5 ? ' (provisional)' : ''}${moved}${near ? ` · about as strong as ${esc(near.name)} (${fmt(near.elo)})` : ''} · <button class="link" data-me-ladder>where you stand</button></span>`;
      } else t = `<span class="muted small">${esc(l.name)} ladder: no rated games yet${n ? ` (${fmt(n)} against bots not on the ladder)` : ''}. Play a fair opponent, or any ladder bot, to the end to get a rating.</span>`;
      if (r && !r.done && !state.game.over) {
        const o = oppOnLadder(l, r.opp);
        t += '<br><span class="muted small">' + (!r.ok ? `This game won't count: ${esc(r.why)}.`
          : o ? `This game counts: ${esc(o.name)} is rated ${fmt(o.elo)}.` + (state.opts.showScores ? ' (Turn off move scores in the bot brain, or it won\'t.)' : '')
          : `${esc(r.opp.name)} is not on this ladder, so this game is kept but not rated. Pick a ladder bot (or "Play it" on the Ladder tab).`) + '</span>';
      }
    }
    el.innerHTML = t;
  }
  $('#me-line').addEventListener('click', (e) => { if (e.target.closest('[data-me-ladder]')) showTab('ladder'); });

  // "Play a fair opponent": a random ladder bot within ME_FAIR Elo of you (expected score roughly 30–70%), or the
  // ME_FAIR_MIN nearest if fewer are that close, avoiding the last one when there is a choice; random colour.
  // Without a rating yet, "you" are the prior's centre (the ladder's median bot). Perfect and Hustler are left out:
  // in the browser they fall back to Default d5 when the solver can't finish, so their rating doesn't apply.
  const ME_FAIR = 150, ME_FAIR_MIN = 3;
  function playFair() {
    const l = ladderForKey(T.rulesKey(state.rules));
    if (!l) { toast('These rules have no ladder yet. Build one on the Ladder tab.'); return; }
    const f = meFit(l), els = l.bots.map((b) => b.elo).sort((a, b) => a - b), me = f ? f.elo : els[els.length >> 1];
    const all = ladderRows(l).filter((x) => !x.me && x.id !== 'perfect' && x.id !== 'hustler')
      .sort((a, b) => Math.abs(a.elo - me) - Math.abs(b.elo - me));
    let pool = all.filter((x) => Math.abs(x.elo - me) <= ME_FAIR);
    if (pool.length < ME_FAIR_MIN) pool = all.slice(0, ME_FAIR_MIN);
    const last = mestore.games.filter((g) => g.key === l.rulesKey).pop(), lastId = last && (last.opp.saved ? 'saved:' + last.opp.saved : (l.bots.find((b) => specSig(b.spec) === last.opp.sig) || {}).id);
    if (pool.length > 1) pool = pool.filter((x) => x.id !== lastId);
    const pick = pool[(Math.random() * pool.length) | 0];
    playFromLadder(l, pick.id, Math.random() < 0.5 ? 1 : 2, ` (rated ${fmt(pick.elo)}; you are ${fmt(me)}${f ? '' : ', a starting guess'})`);
  }
  $('#me-fair').addEventListener('click', playFair);

  // The "You on this ladder" card: your rating and your record against each bot.
  function renderLadderMe(l) {
    const el = $('#ld-me');
    const gs = mestore.games.filter((g) => g.key === l.rulesKey), f = meFit(l);
    if (!gs.length) { el.innerHTML = '<p class="muted">No games yet. Press "Play it" next to a bot (you play X), or pick one on the Play tab, and play a game to the end.</p>'; return; }
    const per = new Map();
    for (const g of gs) {
      const o = oppOnLadder(l, g.opp), id = g.opp.saved ? 'saved:' + g.opp.saved : g.opp.sig;
      const e = per.get(id) || { name: o ? o.name : g.opp.name, elo: o ? o.elo : null, w: 0, d: 0, l: 0, last: 0 };
      if (g.s === 1) e.w++; else if (g.s === 0) e.l++; else e.d++;
      e.last = g.t; per.set(id, e);
    }
    const rows = [...per.values()].sort((a, b) => (b.elo === null ? -1e9 : b.elo) - (a.elo === null ? -1e9 : a.elo));
    el.innerHTML = (f ? `<p>Your rating: <b>${fmt(f.elo)}</b> <span class="muted">±${fmt(1.96 * f.se)} · ${fmt(f.games)} rated games · you scored ${pct(f.score)}</span></p>` : '') +
      '<table class="data"><thead><tr><th>Bot</th><th class="num">Its Elo</th><th class="num">Won</th><th class="num">Drawn</th><th class="num">Lost</th><th>Last played</th></tr></thead><tbody>' +
      rows.map((e) => `<tr><td><b>${esc(e.name)}</b></td><td class="num">${e.elo === null ? '<span class="muted" data-tip="Not on this ladder, so these games are not rated">–</span>' : fmt(e.elo)}</td>` +
        `<td class="num">${e.w}</td><td class="num">${e.d}</td><td class="num">${e.l}</td><td class="muted small">${new Date(e.last).toLocaleDateString()}</td></tr>`).join('') +
      '</tbody></table><p class="muted small">Only games played to the end count; a game you leave with New game is not kept. <button class="link" data-me-forget>Forget my games on these rules</button></p>';
  }
  $('#ld-me').addEventListener('click', (e) => {
    if (!e.target.closest('[data-me-forget]')) return;
    const l = ladderById(ld.sel);
    if (!l || !confirm(`Forget your ${fmt(mestore.games.filter((g) => g.key === l.rulesKey).length)} games on the ${l.name} rules? Your rating there starts again.`)) return;
    mestore.games = mestore.games.filter((g) => g.key !== l.rulesKey); mesave(); renderLadder(); renderMe();
  });

  function bindLadder() {
    $('#tab-ladder').addEventListener('click', (e) => {
      const t = e.target;
      if (t.dataset.ladder) { ld.sel = t.dataset.ladder; renderLadder(); return; }
      const l = ladderById(ld.sel);
      if (t.dataset.play && l) { playFromLadder(l, t.dataset.play); return; }
      if (t.hasAttribute('data-ld-rate') && l) {
        const rec = tstore.rulesets[l.rulesKey], bot = rec && rec.bots.find((b) => b.id === t.closest('[data-bot]').dataset.bot);
        if (bot) rateOnLadder(l, bot);
        return;
      }
      if (t.dataset.ldTop && l) {
        const set = pickedFor(l.id), n = +t.dataset.ldTop;
        set.clear();
        const can = pickable(l);
        ladderRows(l).filter((r) => can.some((b) => b.id === r.id)).slice(0, n).forEach((r) => set.add(r.id));
        renderLadder(); return;
      }
      if (t.hasAttribute('data-ld-clear') && l) { pickedFor(l.id).clear(); renderLadder(); return; }
      if (t.hasAttribute('data-ld-train') && l) { trainLadder(l); return; }
      if (t.hasAttribute('data-ld-discard') && l) {
        if (!confirm(`Discard the ${fmt(l.extraGames)} games played in this browser on the ${l.name} ladder (including your saved bots' rating games)? The ratings go back to the ones in ladder-data.js. Export them first if you may want them.`)) return;
        delete glog[l.rulesKey]; gsave(); refreshPickers(); renderLadder(); return;
      }
      if (t.hasAttribute('data-ld-export')) { exportGames(); return; }
      if (t.hasAttribute('data-ld-tune') && l) { if (T.rulesKey(state.rules) !== l.rulesKey) applyRules(l.rules); showTab('tune'); }
    });
    $('#ld-build').addEventListener('click', buildLadder);
    $('#tab-ladder').addEventListener('change', (e) => {
      const t = e.target, l = ladderById(ld.sel);
      if (!l) return;
      if (t.dataset.pick) { const set = pickedFor(l.id); if (t.checked) set.add(t.dataset.pick); else set.delete(t.dataset.pick); renderLadder(); }
      if (t.id === 'ld-tpairs') { ld.trainPairs = clampInt(t.value, 1, 500, 20); renderTrainBar(l); }
    });
  }

  noteSeen(state.rules); buildRules(); bindOptions(); buildBrain(); bindLab(); bindTune(); bindLadder(); renderFeatureTable(); bindPuzzles();
  newGame();
  window.PaperOthello = { state, E, B, Lab }; // handy from the browser console
})();
