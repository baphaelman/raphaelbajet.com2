// ER_RESULTS=dir and ER_LIMIT=n make a quick test run (a few songs, into another folder).
// Run the study over every song: the X-ray on the real bars, K "same words, shuffled" and K "random sounds"
// versions, at each setting. Writes cache/pool.json (the random words) and cache/results/<setting>.json.
//   node tools/corpus.mjs [K=8] [setting …]      settings: def near perfect ends endsUnique endsNear endsAsso
import fs from 'node:fs';
import { RX, songs, here } from './rx.mjs';
const K = +(process.argv[2] || 8);
const RUNS = { def: ['def'], near: ['near'], perfect: ['perfect'], ends: ['ends'], endsUnique: ['ends', true], endsNear: ['endsNear'], endsAsso: ['endsAsso'] };
const which = process.argv.slice(3).length ? process.argv.slice(3) : Object.keys(RUNS);
const OUT = process.env.ER_RESULTS || 'cache/results';
const ALL = songs(), LIMIT = +(process.env.ER_LIMIT || ALL.length);
const S = ALL.filter((_, i) => Math.floor(i * LIMIT / ALL.length) !== Math.floor((i - 1) * LIMIT / ALL.length)); // n evenly spaced
console.error(S.length, 'songs');

// The pool: every content word the songs use, by stress pattern, with how often. Slurs and the crudest words
// are left out, so a random version the page shows never puts them in someone's mouth.
const BLOCK = /^(nigg|niga|fag|retard)|^(bitch(es|in'?|ing)?|hoes?|hos|pussy|pussies|dicks?|cocks?|cunts?|whores?|sluts?|dykes?|tranny|chinks?|spics?|kikes?)$/;
const secsOf = new Map(S.map(s => [s.id, RX.bars(s.lyrics.plain)]));
const counts = new Map();
for (const s of S) for (const [w, p] of RX.patterns(secsOf.get(s.id))) {
  const k = RX.key(w);
  if (!p || RX.isStop(w) || BLOCK.test(k)) continue;
  if (!counts.has(p)) counts.set(p, new Map());
  counts.get(p).set(k, (counts.get(p).get(k) || 0) + 1);
}
const poolObj = {};
for (const [p, m] of [...counts].sort((a, b) => b[1].size - a[1].size))
  poolObj[p] = [...m].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([w, n]) => n > 1 ? `${w}*${n}` : w).join(' ');
fs.mkdirSync(here + OUT, { recursive: true });
fs.writeFileSync(here + OUT + '/pool.json', JSON.stringify(poolObj));
const pool = RX.pool(poolObj);

for (const name of which) {
  const [setting, unique] = RUNS[name];
  const t0 = Date.now(), out = [];
  for (const [i, s] of S.entries()) {
    const secs = unique ? RX.bars(s.lyrics.plain, true) : secsOf.get(s.id);
    const r = await RX.study(secs, RX.SETTINGS[setting], pool, K, 1000 + i);
    out.push({ id: s.id, song: s.song, artist: s.artist, year: s.year, lrclib: s.lyrics.lrclib.id, ...r });
    if ((i + 1) % 50 === 0) console.error(name, i + 1, '/', S.length);
  }
  fs.writeFileSync(`${here}${OUT}/${name}.json`, JSON.stringify({ K, setting, unique: !!unique, songs: out }));
  console.error(name, 'done in', Math.round((Date.now() - t0) / 1000), 's');
}
