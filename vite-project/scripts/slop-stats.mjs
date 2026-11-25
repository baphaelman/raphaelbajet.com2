// Keeps src/slopStats.json up to date: each Slop Zone project's commits (from its git repo), the agents, sessions
// and agent hours that went into it (from Claude Code's transcripts in ~/.claude/projects), the months it was worked
// on (`from`, `to`: its commits and sessions), and the day any of that last changed (`updated`). The slop editor also
// gets its latest version on npm, and the Craft PRs their state, from ~/Desktop/Coding/oss/craft-prs.json (which
// /craft-fix rewrites every run). It runs before `npm run dev`, or on its own with `npm run slop-stats` (or /slop-update).
//
// Claude Code deletes transcripts after a while (30 days unless `cleanupPeriodDays` says otherwise), so every session
// counted is kept in scripts/slopSessions.json and stays counted once its transcript is gone. Only new transcripts,
// and ones that have grown, are read again: one that shrank (part of it cleaned up) keeps what was counted from it,
// so no count ever goes down. `since` is the day the oldest counted session started, which the zone states.
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { env } from 'node:process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TRANSCRIPTS = join(homedir(), '.claude/projects');
const CODING = join(homedir(), 'Desktop/Coding');
const STATS = new URL('../src/slopStats.json', import.meta.url);
const SESSIONS = new URL('./slopSessions.json', import.meta.url);
const SITE = fileURLToPath(new URL('..', import.meta.url));
const CRAFT_PRS = join(CODING, 'oss/craft-prs.json');
// SLOP_RESCAN=1 places every transcript still on disk again, after PROJECTS changes
const RESCAN = Boolean(env.SLOP_RESCAN);

// Each project: what in a session's tool calls points at it, and where its commits are. Othello isn't in git. The
// AI-rticles (`site`) are in this repo since 2026-11-24 (public/slop/play and articles/); The Comma Pump's earlier
// commits are in its old repo. Craft is someone else's repo, so only my commits count
const PROJECTS = {
    'rhyme-xray': { paths: [/rhyme-xray/], repo: join(CODING, 'rhyme-xray-v2') },
    algorhythms: { paths: [/\/algorhythms\b/, /baphaelman\/algorhythms/], repo: join(homedir(), 'algorhythms') },
    'spotify-unwrapped': {
        paths: [/Spotify \(Un\)Wrapped/, /Spotify-Un-Wrapped/, /Spotify Unwrapped/, /Coding\/spotify\b/],
        repo: join(CODING, 'Spotify (Un)Wrapped'),
    },
    'paper-othello': { paths: [/games\/othello/, /othello\//] },
    'comma-pump': { paths: [/tuning-explainer/, /tuning\.html/, /slop\/play\/comma-pump/, /articles\/comma-pump/], repo: join(CODING, 'AIrticles-archived/tuning-explainer'), site: 'comma-pump' },
    'single-cycles': { paths: [/single-cycles/, /singleCycles/], site: 'single-cycles' },
    'craft-prs': { paths: [/craft-libs/, /Coding\/oss\b/], repo: join(CODING, 'oss/craft-libs'), author: '@rapss-MacBook' },
    'slop-editor': { paths: [/Coding\/slop-editor\b/, /Coding\/slopometer\b/], repo: join(CODING, 'slop-editor') },
    // not in the zone, but their sessions shouldn't land in a project that is
    'slop-zone': { paths: [/raphaelbajet\.com(?![\w./-]*\/(?:slop\/play|articles)\/)/] }, // the AI-rticles in it are theirs
    trivia: { paths: [/\/trivia\b/] },
};

// sessions their tool calls don't place: started in ~, or about no project
const PLACED = {
    'cdad85b3-0ffb-485e-a4b7-7609077c80df': 'algorhythms',
    'e4ef60d7-ec54-4b59-8f65-4378b84c898f': 'algorhythms',
    'f7d403d0-89cf-45f8-808e-943c3817d82e': null, // brainstorming
};

const MENTIONS = Object.entries(PROJECTS).map(([id, project]) => [id, new RegExp(project.paths.map((path) => path.source).join('|'), 'g')]);

const GAP_CAP = 30 * 60; // seconds: a longer gap inside a turn is the machine asleep, not work

const readJson = (url, fallback) => (existsSync(url) ? JSON.parse(readFileSync(url, 'utf8')) : fallback);

// a turn starts with a message from a person (or a notification), not a tool result
function startsTurn(entry) {
    if (entry.type !== 'user' || entry.isMeta) return false;
    const content = entry.message?.content;
    if (typeof content === 'string') return true;
    return Array.isArray(content) && !content.some((c) => c?.type === 'tool_result');
}

// one transcript: its working seconds (gaps between entries within a turn), and how often each project shows up
// in its tool calls, and in the folder it ran in
async function scan(path, hits, folders) {
    const turns = [];
    let first = null;
    for await (const line of createInterface({ input: createReadStream(path), crlfDelay: Infinity })) {
        let entry;
        try {
            entry = JSON.parse(line);
        } catch {
            continue;
        }
        if (!entry.timestamp) continue;
        const t = Date.parse(entry.timestamp) / 1000;
        first ??= t;
        if (startsTurn(entry) || !turns.length) turns.push([]);
        turns[turns.length - 1].push(t);
        if (entry.type === 'assistant' && Array.isArray(entry.message?.content)) {
            entry.message.content.filter((c) => c?.type === 'tool_use').forEach((c) => {
                const input = JSON.stringify(c.input ?? {});
                MENTIONS.forEach(([id, mention]) => { hits[id] = (hits[id] ?? 0) + (input.match(mention)?.length ?? 0); });
            });
        }
        if (entry.cwd) {
            MENTIONS.forEach(([id, mention]) => {
                if (entry.cwd.match(mention)) folders[id] = (folders[id] ?? 0) + 1;
            });
        }
    }
    let work = 0;
    turns.forEach((times) => times.slice(1).forEach((t, i) => {
        const gap = t - times[i];
        if (gap > 0 && gap <= GAP_CAP) work += gap;
    }));
    return { work, first };
}

const top = (counts) => Object.entries(counts).sort((a, b) => b[1] - a[1])[0];

// the project an agent's tool calls mention most (its folder breaks a tie), or else `fallback`, or the folder
function place(hits, folders, fallback) {
    const scores = Object.fromEntries(Object.keys(PROJECTS).map((id) => [id, (hits[id] ?? 0) + 0.01 * (folders[id] ?? 0)]));
    const [hit, score] = top(scores);
    if (score >= 1) return hit;
    return fallback ?? top(folders)?.[0] ?? 'unknown';
}

const day = (seconds) => new Date(seconds * 1000).toLocaleDateString('en-CA'); // 2026-11-22, in local time

async function countSessions(known) {
    const sessions = { ...known };
    if (!existsSync(TRANSCRIPTS)) return sessions;
    for (const folder of readdirSync(TRANSCRIPTS)) {
        if (folder.includes('t3code-claude-title')) continue;
        const dir = join(TRANSCRIPTS, folder);
        for (const file of readdirSync(dir).filter((name) => name.endsWith('.jsonl'))) {
            const id = file.slice(0, -'.jsonl'.length);
            const subDir = join(dir, id, 'subagents');
            const subagents = existsSync(subDir) ? readdirSync(subDir).filter((name) => name.endsWith('.jsonl')) : [];
            const paths = [join(dir, file), ...subagents.map((name) => join(subDir, name))];
            const bytes = paths.reduce((sum, path) => sum + statSync(path).size, 0);
            if (known[id]?.bytes > bytes || (known[id]?.bytes === bytes && !RESCAN)) continue;

            // The session counts for the project its own agent worked on, and each of its subagents for the one that
            // subagent did (its session's, if it touched no project's files)
            const agents = [];
            let first = null;
            for (const path of paths) {
                const hits = {};
                const folders = {};
                const result = await scan(path, hits, folders);
                first ??= result.first;
                let project = place(hits, folders, agents[0]?.project);
                if (id in PLACED) project = agents.length ? agents[0].project : PLACED[id];
                agents.push({ project, hours: Math.round((result.work / 3600) * 1000) / 1000 });
            }
            sessions[id] = { project: agents[0].project, started: first && day(first), bytes, agents };
        }
    }
    return sessions;
}

const git = (repo, args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
// each git history a project's commits are in, as `git log` arguments
function histories(project) {
    const out = [];
    if (project.repo && existsSync(project.repo)) out.push([project.repo, project.author ? ['--all', `--author=${project.author}`] : ['HEAD']]);
    if (project.site) out.push([SITE, ['HEAD', '--', `public/slop/play/${project.site}.html`, `articles/${project.site}`]]);
    return out;
}
function commits(project) {
    const here = histories(project);
    if (!here.length) return undefined;
    return here.reduce((sum, [repo, args]) => sum + Number(git(repo, ['rev-list', '--count', ...args])), 0);
}
// the days of a project's commits
const commitDays = (project) => histories(project).flatMap(([repo, args]) => git(repo, ['log', '--format=%ad', '--date=short', ...args]).split('\n').filter(Boolean));

// the slop editor's latest release on npm: { version, released }, or null offline
async function release() {
    try {
        const res = await fetch('https://registry.npmjs.org/slop-editor', { signal: AbortSignal.timeout(4000) });
        const meta = await res.json();
        const version = meta['dist-tags'].latest;
        return { version, released: day(Date.parse(meta.time[version]) / 1000) };
    } catch {
        return null;
    }
}

// my storytold PRs, as /craft-fix last saw them: { href, title (without its "(#N)"), state, reviewed }
function craftPrs() {
    if (!existsSync(CRAFT_PRS)) return null;
    return JSON.parse(readFileSync(CRAFT_PRS, 'utf8')).prs.map((pr) => ({
        href: pr.url,
        title: pr.title.replace(/\s*\(#\d+\)$/, ''),
        state: pr.state,
        reviewed: pr.reviewed,
    }));
}

const before = readJson(STATS, { projects: {} });
const sessions = await countSessions(readJson(SESSIONS, {}));
const today = day(Date.now() / 1000);
const extra = { 'slop-editor': await release(), 'craft-prs': craftPrs() && { prs: craftPrs() } };
const projects = {};
const agents = Object.values(sessions).flatMap((session) => session.agents);
Object.entries(PROJECTS).forEach(([id, project]) => {
    const was = before.projects[id] ?? {};
    const its = agents.filter((agent) => agent.project === id);
    // the months it was worked on: its commits' and its sessions' (a repo that isn't on this machine keeps its last ones)
    const days = [...commitDays(project), ...Object.values(sessions).filter((session) => session.project === id).map((session) => session.started)].filter(Boolean).sort();
    const counts = {
        commits: project.repo || project.site ? commits(project) ?? was.commits ?? null : null, // a repo that isn't on this machine keeps its last count
        agents: its.length,
        sessions: Object.values(sessions).filter((session) => session.project === id).length,
        hours: Math.round(its.reduce((sum, agent) => sum + agent.hours, 0) * 10) / 10,
        from: days[0]?.slice(0, 7) ?? was.from ?? null,
        to: days.at(-1)?.slice(0, 7) ?? was.to ?? null,
        ...(id in extra ? extra[id] ?? Object.fromEntries(Object.entries(was).filter(([key]) => ['version', 'released', 'prs'].includes(key))) : {}), // offline: the last ones
    };
    const { updated, ...last } = was;
    projects[id] = { ...counts, updated: JSON.stringify(counts) === JSON.stringify(last) ? updated ?? before.updated ?? today : today };
});

writeFileSync(SESSIONS, JSON.stringify(sessions, null, 4) + '\n');
const since = Object.values(sessions).map((session) => session.started).filter(Boolean).sort()[0] ?? null;
const changed = JSON.stringify({ since, projects }) !== JSON.stringify({ since: before.since, projects: before.projects });
const updated = Object.values(projects).map((project) => project.updated).sort().at(-1);
if (changed) writeFileSync(STATS, JSON.stringify({ updated, since, projects }, null, 4) + '\n');
const fresh = Object.entries(projects).filter(([id, project]) => project.updated === today && before.projects[id]?.updated !== today).map(([id]) => id);
console.log(`slop stats: ${Object.keys(sessions).length} sessions${changed ? `, numbers updated${fresh.length ? ` (${fresh.join(', ')})` : ''}` : ', no change'}`);
