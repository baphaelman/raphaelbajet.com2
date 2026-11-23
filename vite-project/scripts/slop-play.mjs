// Copies the AI-rticles the Slop Zone opens into public/slop/play, so the site shows them as they are now: their
// text as last saved in edit mode, and who wrote each word. The originals live in ~/Desktop/Coding/AIrticles and are
// edited there (node tools/edit.mjs). This runs before `npm run dev`, `npm run edit` and `npm run build`, or on its
// own with `npm run slop-play`. Where the originals aren't around (Vercel's build), the committed copies stay as they
// are, so commit the copies after editing an article.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const AIRTICLES = join(homedir(), 'Desktop/Coding/AIrticles');
const PLAY = new URL('../public/slop/play/', import.meta.url);

const PAGES = {
    'comma-pump.html': 'tuning-explainer/tuning.html',
    'single-cycles.html': 'single-cycles/single-cycles.html',
};

for (const [name, source] of Object.entries(PAGES)) {
    const from = join(AIRTICLES, source);
    if (!existsSync(from)) {
        console.log(`slop-play: ${source} isn't here, keeping the committed ${name}`);
        continue;
    }
    const html = readFileSync(from, 'utf8');
    const to = new URL(name, PLAY);
    if (existsSync(to) && readFileSync(to, 'utf8') === html) continue;
    writeFileSync(to, html);
    console.log(`slop-play: updated ${name}`);
}
