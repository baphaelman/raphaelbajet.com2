// Keeps src/slopStats.json up to date: each Slop Zone project's commits (from its git repo), and the agents,
// sessions and agent hours that went into it (from Claude Code's transcripts in ~/.claude/projects). It runs before
// `npm run dev`, or on its own with `npm run slop-stats`.
//
// Claude Code deletes transcripts after a while (30 days unless `cleanupPeriodDays` says otherwise), so every session
// counted is kept in scripts/slopSessions.json and stays counted once its transcript is gone. Only new transcripts,
// and ones that have grown, are read again.
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';

const TRANSCRIPTS = join(homedir(), '.claude/projects');
const CODING = join(homedir(), 'Desktop/Coding');
const STATS = new URL('../src/slopStats.json', import.meta.url);
const SESSIONS = new URL('./slopSessions.json', import.meta.url);

// Each project: what in a session's tool calls points at it, and where its commits are. Othello and Single Cycles
// aren't in git. Craft is someone else's repo, so only my commits count
const PROJECTS = {
    'rhyme-xray': { paths: [/rhyme-xray/], repo: join(CODING, 'rhyme-xray-v2') },
    algorhythms: { paths: [/\/algorhythms\b/, /baphaelman\/algorhythms/], repo: join(homedir(), 'algorhythms') },
    'spotify-unwrapped': {
        paths: [/Spotify \(Un\)Wrapped/, /Spotify-Un-Wrapped/, /Spotify Unwrapped/, /Coding\/spotify\b/],
        repo: join(CODING, 'Spotify (Un)Wrapped'),
    },
    'paper-othello': { paths: [/games\/othello/, /othello\//] },
    'comma-pump': { paths: [/tuning-explainer/, /tuning\.html/], repo: join(CODING, 'AIrticles/tuning-explainer') },
    'single-cycles': { paths: [/single-cycles/, /singleCycles/] },
    'craft-prs': { paths: [/craft-libs/, /Coding\/oss\b/], repo: join(CODING, 'oss/craft-libs'), author: '@rapss-MacBook' },
    // not in the zone, but their sessions shouldn't land in a project that is
    'slop-zone': { paths: [/raphaelbajet\.com/] },
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
            if (known[id]?.bytes === bytes) continue;

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

function commits(project) {
    if (!project.repo || !existsSync(project.repo)) return undefined;
    const args = project.author ? ['--all', `--author=${project.author}`] : ['HEAD'];
    return Number(execFileSync('git', ['-C', project.repo, 'rev-list', '--count', ...args], { encoding: 'utf8' }).trim());
}

const before = readJson(STATS, { projects: {} });
const sessions = await countSessions(readJson(SESSIONS, {}));
const projects = {};
const agents = Object.values(sessions).flatMap((session) => session.agents);
Object.entries(PROJECTS).forEach(([id, project]) => {
    const its = agents.filter((agent) => agent.project === id);
    projects[id] = {
        commits: project.repo ? commits(project) ?? before.projects[id]?.commits ?? null : null, // a repo that isn't on this machine keeps its last count
        agents: its.length,
        sessions: Object.values(sessions).filter((session) => session.project === id).length,
        hours: Math.round(its.reduce((sum, agent) => sum + agent.hours, 0) * 10) / 10,
    };
});

writeFileSync(SESSIONS, JSON.stringify(sessions, null, 4) + '\n');
const changed = JSON.stringify(projects) !== JSON.stringify(before.projects);
if (changed) writeFileSync(STATS, JSON.stringify({ updated: day(Date.now() / 1000), projects }, null, 4) + '\n');
console.log(`slop stats: ${Object.keys(sessions).length} sessions${changed ? ', numbers updated' : ', no change'}`);
