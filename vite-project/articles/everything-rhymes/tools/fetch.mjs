// Lyrics for tools/songs.json from LRCLIB (https://lrclib.net), into cache/lyrics/<slug>.json. The cache is
// gitignored: lyrics are never committed or published, only the numbers measured from them.
//   node tools/fetch.mjs
import fs from 'node:fs';
const here = new URL('..', import.meta.url).pathname;
const list = JSON.parse(fs.readFileSync(here + 'tools/songs.json', 'utf8'));
fs.mkdirSync(here + 'cache/lyrics', { recursive: true });
const slug = r => (r.artist + ' - ' + r.song).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const lead = a => a.split(/\s+(?:featuring|feat\.?|ft\.?|with|and|&|x|vs\.?)\s+|,\s*/i)[0];
const wait = ms => new Promise(z => setTimeout(z, ms));
let ok = 0, miss = 0;
for (const r of list) {
  const f = `${here}cache/lyrics/${slug(r)}.json`;
  if (fs.existsSync(f)) { ok++; continue; }
  const title = r.song.replace(/\s*\(.*?\)\s*/g, ' ').trim();
  let best = null;
  for (const q of [`track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(lead(r.artist))}`, `q=${encodeURIComponent(title + ' ' + lead(r.artist))}`]) {
    let res = [];
    try { res = await (await fetch(`https://lrclib.net/api/search?${q}`, { headers: { 'User-Agent': 'everything-rhymes (raphaelbajet.com)' } })).json(); }
    catch (e) { console.error('fetch failed', r.song, e.message); }
    const want = norm(lead(r.artist)).split(' ')[0], wt = norm(title).split(' ').slice(0, 2).join(' ');
    // the right artist and title, with lyrics; the plain studio version first, then the longest lyrics
    const cands = (res || []).filter(x => x.plainLyrics && !x.instrumental && norm(x.artistName).includes(want) && norm(x.trackName).startsWith(wt));
    const alt = x => /(remix|live|clean|instrumental|edit|acapella|version|mix)/i.test(x.trackName + ' ' + (x.albumName || '')) ? 1 : 0;
    cands.sort((a, b) => alt(a) - alt(b) || b.plainLyrics.length - a.plainLyrics.length);
    if ((best = cands[0])) break;
    await wait(300);
  }
  if (best) {
    fs.writeFileSync(f, JSON.stringify({ ...r, lrclib: { id: best.id, trackName: best.trackName, artistName: best.artistName, albumName: best.albumName }, plain: best.plainLyrics }));
    ok++;
  } else { miss++; console.log('no lyrics:', r.year, r.artist, '-', r.song); }
  await wait(300);
}
console.log(ok, 'with lyrics,', miss, 'without');
