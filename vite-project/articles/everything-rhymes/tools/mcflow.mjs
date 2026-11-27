// The end-rhyme trend, checked on MCFlow (N. Condit-Schultz, "MCFlow: A Digital Corpus of Rap Transcriptions",
// Empirical Musicology Review 11(2), 2016): 124 hit rap songs, 1979–2014, transcribed by hand with every rhyme
// marked. Readings per song, all of lines ending on a rhyme with a different word:
//   hand            what MCFlow marks: the line's last syllable shares a rhyme letter with a syllable of another
//                   word within reach (as in rhyme-xray's test/score.mjs, "~" repeats and "?" weak rhymes left out)
//   perf near asso  the study on MCFlow's own lines at "ends", "endsNear" and "endsAsso", real and K random
//                   copies, as for the #1s
// A line is a main prosodic phrase (**break 3 or more). MCFlow holds lyrics and has no license: it is cloned
// into cache/ and only numbers leave it. Writes cache/results/mcflow.json, which build.mjs summarises.
//   node tools/mcflow.mjs [K=8]
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { RX, here } from './rx.mjs';
const K = +(process.argv[2] || 8), REACH = 4;
const OUT = process.env.ER_RESULTS || 'cache/results';
const DIR = here + 'cache/MCFlow';
if (!fs.existsSync(DIR)) execFileSync('git', ['clone', '-q', '--depth', '1', 'https://github.com/Computational-Cognitive-Musicology-Lab/MCFlow.git', DIR]);

// One .rap file: its reference records, and its syllables as lines of words.
function parse(file) {
  const meta = {}, syls = [];
  let head = null, sec = 0;
  for (const r of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = /^!!!([^:]+):(.*)$/.exec(r);
    if (m) { meta[m[1]] = m[2].trim(); continue; }
    if (r.startsWith('!')) continue;
    const c = r.split('\t');
    if (r.startsWith('**')) { head = Object.fromEntries(c.map((h, i) => [h.slice(2), i])); continue; }
    if (!head) continue;
    if (r.startsWith('*>')) { sec++; continue; }
    if (r.startsWith('*') || r.startsWith('=') || !c[head.lyrics] || c[head.lyrics] === '.') continue;
    syls.push({ lyr: c[head.lyrics], sec, brk: +c[head.break] || 0, rhyme: c[head.rhyme] });
  }
  const words = [];
  syls.forEach(s => { if (s.lyr.startsWith('-') && words.length) words.at(-1).syls.push(s); else words.push({ syls: [s] }); });
  words.forEach(w => { w.text = w.syls.map(s => s.lyr.replace(/^-|-$/g, '')).join(''); });
  const lines = [];
  words.forEach(w => {
    const s = w.syls[0];
    if (!lines.length || s.brk >= 3 || s.sec !== lines.at(-1).sec) lines.push({ sec: s.sec, words: [] });
    lines.at(-1).words.push(w);
  });
  const year = /^\d{4}/.test(meta.BPD || '') ? +meta.BPD.slice(0, 4) : null;
  return { meta, year, lines };
}
const letters = s => s.rhyme.split(' ').filter(t => t !== '.' && !/[~?]/.test(t)).map(t => t.replace(/[()[\]_]/g, '')).filter(t => /^[A-Za-z]+$/.test(t));
// as the page's stem(): "Monie's" and "Monie" are one word
const stem = t => t.toLowerCase().replace(/[’‘`]/g, "'").replace(/[^a-z0-9']/g, '').replace(/'s$|s'$|'$/, '').replace(/^'/, '').replace(/([^s])s$/, '$1');

/** Share of lines whose last syllable MCFlow rhymes with another word within reach, in the same section. */
function hand(lines) {
  let n = 0, hit = 0;
  lines.forEach((L, li) => {
    const w = L.words.at(-1), s = w.syls.at(-1), mine = new Set(letters(s));
    n++;
    if (!mine.size) return;
    for (let lj = Math.max(0, li - REACH + 1); lj < Math.min(lines.length, li + REACH); lj++) {
      if (lines[lj].sec !== L.sec) continue;
      for (const v of lines[lj].words) if (v !== w && stem(v.text) !== stem(w.text) && v.syls.some(t => letters(t).some(l => mine.has(l)))) { hit++; return; }
    }
  });
  return { lines: n, hand: hit / n };
}

const pool = RX.pool(JSON.parse(fs.readFileSync(`${here}${OUT}/pool.json`, 'utf8')));
const files = fs.readdirSync(DIR + '/Humdrum').filter(f => f.endsWith('.rap')).sort();
const out = [];
for (const [i, f] of files.entries()) {
  const { meta, year, lines } = parse(`${DIR}/Humdrum/${f}`);
  const text = lines.map((L, j) => (j && L.sec !== lines[j - 1].sec ? '\n' : '') + L.words.map(w => w.text).join(' ')).join('\n');
  const row = { file: f, artist: meta.COC || '', song: meta.OTL || '', year, ...hand(lines) };
  for (const [k, setting] of [['perf', 'ends'], ['near', 'endsNear'], ['asso', 'endsAsso']]) {
    const r = await RX.study(RX.bars(text), RX.SETTINGS[setting], pool, K, 5000 + i);
    row[k] = { real: r.real.endRhyme, random: r.random.endRhyme };
    row.bars = r.real.bars;
  }
  out.push(row);
  if ((i + 1) % 25 === 0) console.error(i + 1, '/', files.length);
}
fs.writeFileSync(`${here}${OUT}/mcflow.json`, JSON.stringify({ K, reach: REACH, songs: out }));
console.error(out.length, 'songs,', out.filter(s => s.year).length, 'with a Billboard date');
