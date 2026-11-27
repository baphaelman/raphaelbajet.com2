// Summarise cache/results/*.json into the page's <script type="application/json" id="rx-data"> block: the
// numbers the text quotes, the charts' data, one row per song, and the word pool the demos draw from.
// Every figure on the page comes from this block.
//   node tools/build.mjs
import fs from 'node:fs';
import { RX, E, here, PAGE } from './rx.mjs';
const OUT = process.env.ER_RESULTS || 'cache/results';
const R = name => JSON.parse(fs.readFileSync(`${here}${OUT}/${name}.json`, 'utf8'));
const def = R('def'), near = R('near'), perfect = R('perfect'), ends = R('ends'), endsU = R('endsUnique');
const endsN = R('endsNear'), endsA = R('endsAsso'), mcflow = R('mcflow');
const byId = res => new Map(res.songs.map(s => [s.id, s]));
const P = byId(perfect), N = byId(ends), U = byId(endsU), NR = byId(endsN), AS = byId(endsA);
const rows = def.songs;

// Means: syllable shares weighted by syllables, bar shares by bars, counts per song.
const BAR_KEYS = new Set(['endPerfect']), COUNT_KEYS = new Set(['runs', 'longest', 'syl', 'bars']);
const weight = (s, k) => COUNT_KEYS.has(k) ? 1 : BAR_KEYS.has(k) ? s.real.bars : s.real.syl;
const mean = (list, model, k) => list.reduce((a, s) => a + s[model][k] * weight(s, k), 0) / list.reduce((a, s) => a + weight(s, k), 0);
const KEYS = ['share', 'perfect', 'near', 'asso', 'multi', 'endPerfect', 'runs', 'longest'];
const round = (x, d = 4) => +x.toFixed(d);
function setting(res) {
  const o = {};
  for (const m of ['real', 'shuffled', 'random']) o[m] = Object.fromEntries(KEYS.map(k => [k, round(mean(res.songs, m, k))]));
  o.beat = Object.fromEntries(KEYS.map(k => [k, round(res.songs.filter(s => s.real[k] > s.random[k]).length / res.songs.length)]));
  return o;
}
const ranks = v => { const o = v.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]), r = []; o.forEach(([, i], j) => { r[i] = j; }); return r; };
const spearman = (a, b) => {
  const x = ranks(a), y = ranks(b), n = x.length, m = (n - 1) / 2;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (x[i] - m) * (y[i] - m); sxx += (x[i] - m) ** 2; syy += (y[i] - m) ** 2; }
  return sxy / Math.sqrt(sxx * syy);
};
// Per song, end rhymes above chance: perfect rhymes with a different word, real minus random sounds.
const endEx = s => N.get(s.id).real.endPerfect - N.get(s.id).random.endPerfect;

// Profiles by position from the bar's end, pooled over every syllable of every song (defaults).
const profile = {};
for (const m of ['real', 'shuffled', 'random']) {
  const sum = { n: [], pn: [], m: [], c: [] };
  for (const s of rows) for (const q in sum) s[m].prof[q].forEach((v, j) => { sum[q][j] = (sum[q][j] || 0) + v; });
  profile[m] = Object.fromEntries(['pn', 'm', 'c'].map(q => [q, sum[q].slice(1).map((v, j) => round(v / sum.n[j + 1]))]));
}

// Eras, with 95% bootstrap intervals over songs (fixed seed).
const ERAS = [[1989, 1993], [1994, 1998], [1999, 2003], [2004, 2008], [2009, 2013], [2014, 2019]];
const r = RX.rng(2026);
function boot(list, f, B = 2000) {
  const v = [];
  for (let b = 0; b < B; b++) v.push(f(list.map(() => list[Math.floor(r() * list.length)])));
  v.sort((a, b) => a - b);
  return [v[Math.floor(B * 0.025)], v[Math.floor(B * 0.975)]];
}
const barMean = (list, f) => list.reduce((a, s) => a + f(s) * s.real.bars, 0) / list.reduce((a, s) => a + s.real.bars, 0);
const exOf = (M, s) => M.get(s.id).real.endPerfect - M.get(s.id).random.endPerfect;
const eras = ERAS.map(([from, to]) => {
  const L = rows.filter(s => s.year >= from && s.year <= to);
  const real = s => N.get(s.id).real.endPerfect;
  const [lo, hi] = boot(L, l => barMean(l, real));
  const [exLo, exHi] = boot(L, l => barMean(l, s => exOf(N, s)));
  const [uLo, uHi] = boot(L, l => l.reduce((a, s) => a + exOf(U, s) * U.get(s.id).real.bars, 0) / l.reduce((a, s) => a + U.get(s.id).real.bars, 0));
  return {
    from, to, n: L.length,
    real: barMean(L, real), lo, hi, random: barMean(L, s => N.get(s.id).random.endPerfect),
    ex: barMean(L, s => exOf(N, s)), exLo, exHi,
    uEx: L.reduce((a, s) => a + exOf(U, s) * U.get(s.id).real.bars, 0) / L.reduce((a, s) => a + U.get(s.id).real.bars, 0), uLo, uHi,
    // bars that rhyme only by repeating their last word: perfect with repeats counted, minus without
    rep: barMean(L, s => P.get(s.id).real.endPerfect - N.get(s.id).real.endPerfect),
    defReal: barMean(L, s => s.real.endPerfect)
  };
}).map(e => Object.fromEntries(Object.entries(e).map(([k, v]) => [k, typeof v === 'number' && !Number.isInteger(v) ? round(v) : v])));
// Trend of the per-song excess on the year, in points per decade
const slopeOf = (list, f) => {
  const n = list.length, mx = list.reduce((a, s) => a + s.year, 0) / n, ys = list.map(f), my = ys.reduce((a, y) => a + y, 0) / n;
  let sxy = 0, sxx = 0; list.forEach((s, i) => { sxy += (s.year - mx) * (ys[i] - my); sxx += (s.year - mx) ** 2; });
  return sxy / sxx * 10;
};
const slope = list => slopeOf(list, s => exOf(N, s));
const trend = (list, f) => [slopeOf(list, f), ...boot(list, l => slopeOf(l, f))].map(v => round(v));

// End rhymes by how strict the match is (a different word each time): perfect, near or better, a shared vowel
// or better. Real lyrics, by era, beside the perfect ones above.
eras.forEach((e, i) => {
  const L = rows.filter(s => s.year >= ERAS[i][0] && s.year <= ERAS[i][1]);
  for (const [k, M] of [['near', NR], ['asso', AS]]) {
    const f = s => M.get(s.id).real.endRhyme;
    const [lo, hi] = boot(L, l => barMean(l, f));
    Object.assign(e, { [k]: round(barMean(L, f)), [k + 'Lo']: round(lo), [k + 'Hi']: round(hi), [k + 'Random']: round(barMean(L, s => M.get(s.id).random.endRhyme)) });
  }
});

// MCFlow (tools/mcflow.mjs): its hand marks beside the X-ray on its own lines, the songs from 1989 on. Raw
// shares, since hand marks have no random version.
const MC = mcflow.songs.filter(s => s.year >= 1989), lineMean = (l, f) => l.reduce((a, s) => a + f(s) * s.lines, 0) / l.reduce((a, s) => a + s.lines, 0);
const mc = {
  all: mcflow.songs.length, n: MC.length, to: Math.max(...MC.map(s => s.year)),
  hand: round(lineMean(MC, s => s.hand)), handSlope: trend(MC, s => s.hand),
  near: round(lineMean(MC, s => s.near.real)), nearSlope: trend(MC, s => s.near.real),
  perf: round(lineMean(MC, s => s.perf.real)), perfSlope: trend(MC, s => s.perf.real)
};

const html = fs.readFileSync(PAGE, 'utf8');
const doom = RX.measure(E.analyse(RX.text(RX.bars("A little grease always keeps the wheels a-spinnin'\nLike sitting on twenty threes to get the squealers grinnin'")), RX.SETTINGS.def));
const dict = fs.readFileSync(`${here}cache/dictionary.mjs`, 'utf8');
const vowels = new Set([...dict.matchAll(/\b([A-Z]{2})[012]\b/g)].map(m => m[1])).size;
const data = {
  n: rows.length, K: def.K,
  listed: JSON.parse(fs.readFileSync(`${here}tools/songs.json`, 'utf8')).length,
  fetched: fs.readdirSync(`${here}cache/lyrics`).length,
  engine: /rhyme-xray@([0-9a-f]{40})/.exec(html)[1], vowels,
  def: setting(def), near: setting(near), perfect: setting(perfect), ends: setting(ends), endsUnique: setting(endsU),
  rho: { null: round(spearman(rows.map(s => s.real.share), rows.map(s => s.random.share)), 3), end: round(spearman(rows.map(s => s.real.share), rows.map(endEx)), 3) },
  doom: { share: round(doom.share) },
  profile, eras,
  erasChance: round(barMean(rows, s => N.get(s.id).random.endPerfect)),
  slope: [slope(rows), ...boot(rows, slope)].map(v => round(v)),
  mcflow: mc,
  // one row per song: artist, song, year, colored (real, random) at the defaults, end rhyme above chance,
  // perfect multis above chance, LRCLIB id
  songs: rows.map(s => [s.artist, s.song, s.year, round(s.real.share), round(s.random.share), round(endEx(s)), round(P.get(s.id).real.multi - P.get(s.id).random.multi), s.lrclib]),
  pool: JSON.parse(fs.readFileSync(`${here}${OUT}/pool.json`, 'utf8'))
};
const json = JSON.stringify(data).replace(/<\//g, '<\\/');
const re = /(<script type="application\/json" id="rx-data">)[\s\S]*?(<\/script>)/;
if (!re.test(html)) throw new Error('no #rx-data block in the page');
fs.writeFileSync(PAGE, html.replace(re, (_, a, b) => a + json + b));
console.log('rx-data:', (json.length / 1024).toFixed(0), 'KB;', data.n, 'songs');
console.log(JSON.stringify({ def: data.def, perfect: { real: data.perfect.real, random: data.perfect.random }, rho: data.rho, doom: data.doom, slope: data.slope, eras: data.eras, mcflow: data.mcflow }, null, 1));
