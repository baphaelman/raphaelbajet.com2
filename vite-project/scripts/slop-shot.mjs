// Screenshots a page the Slop Zone opens (a game or an AIrticle in public/slop/play) for its tile, the same way for
// every one: a 1440×810 window (16:9, the tile's shape, so nothing gets cropped), at 2×, once in dark and once in
// light, taken when the page is at rest, saved as public/slop/NAME.jpg and NAME-light.jpg at 1600×900.
//
//   node scripts/slop-shot.mjs PAGE NAME [--slop] [--ready 'JS'] [--after MS]
//   node scripts/slop-shot.mjs slop/play/comma-pump.html comma-pump --slop
//
// --slop turns on an AI-rticle's Slop-o-meter first (the slop editor's switch, kept in localStorage), so the shot
// shows who wrote each word.
//
// "At rest" is two frames half a second apart coming out the same. A page that never stops moving (Single Cycles'
// cube keeps turning) needs --ready, a JS expression that's true once it's showing what it should, and --after, how
// long to wait past that. Needs the dev server running (npm run edit) and Playwright's WebKit, found under
// ~/algorhythms (its Chromium can't play H.264, so WebKit it is).
import { readdirSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const option = (name) => (args.includes(name) ? args.splice(args.indexOf(name), 2)[1] : undefined);
const slop = args.includes('--slop') && args.splice(args.indexOf('--slop'), 1).length > 0;
const ready = option('--ready');
const after = Number(option('--after') ?? 0);
const base = option('--base') ?? 'http://localhost:5173';
const [path, name] = args;
if (!path || !name) {
    console.error("usage: node scripts/slop-shot.mjs PAGE NAME [--slop] [--ready 'JS'] [--after MS] [--base URL]");
    process.exit(1);
}

const pnpm = join(homedir(), 'algorhythms/node_modules/.pnpm');
const found = readdirSync(pnpm).find((dir) => dir.startsWith('playwright@'));
if (!found) throw new Error(`no Playwright under ${pnpm}`);
const { webkit } = createRequire(import.meta.url)(join(pnpm, found, 'node_modules/playwright'));

const out = new URL('../public/slop/', import.meta.url).pathname;
const scratch = mkdtempSync(join(tmpdir(), 'slop-shot-'));
const browser = await webkit.launch();
const errors = [];
for (const scheme of ['dark', 'light']) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 2, colorScheme: scheme });
    page.on('pageerror', (e) => errors.push(`${scheme}: ${e}`));
    if (slop) await page.addInitScript(() => localStorage.setItem('slop-o-meter', 'on'));
    await page.goto(`${base}/${path.replace(/^\//, '')}`);
    if (ready) {
        await page.waitForFunction(ready, null, { timeout: 240000, polling: 200 });
    } else {
        await page.waitForTimeout(1500);
        let last = await page.screenshot();
        for (let i = 0; ; i++) {
            await page.waitForTimeout(500);
            const now = await page.screenshot();
            if (now.equals(last)) break;
            if (i === 40) { console.warn(`${scheme}: still moving after 20 s, shooting anyway`); break; }
            last = now;
        }
    }
    await page.waitForTimeout(after);
    const png = join(scratch, `${scheme}.png`);
    await page.screenshot({ path: png });
    const jpg = join(out, `${name}${scheme === 'light' ? '-light' : ''}.jpg`);
    execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '86', '--resampleWidth', '1600', png, '--out', jpg], { stdio: 'ignore' });
    console.log(`${scheme}: ${jpg}`);
    await page.close();
}
await browser.close();
if (errors.length) console.warn('page errors:\n' + errors.join('\n'));
