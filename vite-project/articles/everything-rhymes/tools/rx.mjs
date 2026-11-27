// The study in Node: Rhyme X-ray's engine and the CMU dictionary at the versions the page loads (downloaded
// once into cache/), and the page's own analysis code, read out of its <script id="rx-lib">, so the tools
// and the page can't drift apart.
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const here = new URL('..', import.meta.url).pathname;
export const PAGE = new URL('../../../public/slop/play/everything-rhymes.html', import.meta.url).pathname;
const html = fs.readFileSync(PAGE, 'utf8');
// The versions are the page's: the engine's script tag and the dictionary's import.
const ENGINE = /<script src="(https:\/\/cdn\.jsdelivr\.net\/gh\/baphaelman\/rhyme-xray@[0-9a-f]{40}\/engine\.js)"/.exec(html)[1];
const DICT = /DICT_URL = '(https:\/\/cdn\.jsdelivr\.net\/npm\/cmu-pronouncing-dictionary@[\d.]+\/index\.js)'/.exec(html)[1];
async function cached(url, name) {
  const f = here + 'cache/' + name;
  if (!fs.existsSync(f) || !fs.readFileSync(f, 'utf8').includes(url)) {
    fs.mkdirSync(here + 'cache', { recursive: true });
    const res = await fetch(url);
    if (!res.ok) throw new Error(url + ' ' + res.status);
    fs.writeFileSync(f, `// ${url}\n` + await res.text());
  }
  return f;
}
const require = createRequire(import.meta.url);
globalThis.RhymeEngine = require(await cached(ENGINE, 'engine.cjs'));
const { dictionary } = await import(await cached(DICT, 'dictionary.mjs'));
RhymeEngine.setDictionary(dictionary);
vm.runInThisContext(/<script id="rx-lib">([\s\S]*?)<\/script>/.exec(html)[1], { filename: 'everything-rhymes.html#rx-lib' });
export const RX = globalThis.RX, E = globalThis.RhymeEngine;
export { here };

export const slug = r => (r.artist + ' - ' + r.song).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
// Not in English, so the dictionary can't read them.
export const NOT_ENGLISH = new Set(['Gangnam Style', 'I Like It']);
/** Every song with lyrics in the cache, minus the ones not in English. */
export function songs() {
  const list = JSON.parse(fs.readFileSync(here + 'tools/songs.json', 'utf8'));
  return list.filter(r => !NOT_ENGLISH.has(r.song)).map(r => {
    const f = `${here}cache/lyrics/${slug(r)}.json`;
    return fs.existsSync(f) ? { ...r, id: slug(r), lyrics: JSON.parse(fs.readFileSync(f, 'utf8')) } : null;
  }).filter(Boolean);
}
