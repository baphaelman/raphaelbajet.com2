// Who wrote what in the Slop Zone. Text in slopProjects.json is either a plain string (an agent's words), or a
// list of pieces where each piece is a string (an agent's), {"me": "..."} (yours: typed in the Edit text panel,
// or dictated word for word) or {"data": "..."} (nobody's: a fact, or someone else's words quoted),
// e.g. ["Paste a verse and ", {"me": "watch every rhyme light up"}].
// Any text can hold a link, written [label](address): only the label shows on the page.

// 'ai', 'mine' or 'data'
const authorOf = (piece) => {
    if (typeof piece === 'string') return 'ai';
    return 'me' in piece ? 'mine' : 'data';
};
const textOf = (piece) => (typeof piece === 'string' ? piece : piece.me ?? piece.data);
const PIECE = { ai: (text) => text, mine: (text) => ({ me: text }), data: (text) => ({ data: text }) };

// the text with its link markup, as the panel edits it
export function plain(value) {
    return typeof value === 'string' ? value : value.map(textOf).join('');
}

// who wrote each character
function authorsByChar(value) {
    if (typeof value === 'string') return new Array(value.length).fill('ai');
    return value.flatMap((piece) => new Array(textOf(piece).length).fill(authorOf(piece)));
}

function fromChars(text, authors) {
    if (authors.every((author) => author === 'ai')) return text;
    const pieces = [];
    for (let i = 0; i < text.length;) {
        let j = i;
        while (j < text.length && authors[j] === authors[i]) j++;
        pieces.push(PIECE[authors[i]](text.slice(i, j)));
        i = j;
    }
    return pieces;
}

// `value` after its plain text became `next` in the panel. An edit is one stretch replaced (typing, deleting,
// pasting): what both versions share at the start and the end keeps its author, and the new middle is yours
export function applyEdit(value, next) {
    const prev = plain(value);
    if (prev === next) return value;
    let start = 0;
    while (start < prev.length && start < next.length && prev[start] === next[start]) start++;
    let end = 0;
    while (end < prev.length - start && end < next.length - start
        && prev[prev.length - 1 - end] === next[next.length - 1 - end]) end++;
    const authors = authorsByChar(value);
    return fromChars(next, [
        ...authors.slice(0, start),
        ...new Array(next.length - start - end).fill('mine'),
        ...authors.slice(prev.length - end),
    ]);
}

const LINK = /\[([^\]]+)\]\(([^)\s]+)\)/g;

// the text as it reads: runs of one author's words (`by`: 'ai', 'mine' or 'data'), each with the link it sits
// in, if any
export function runs(value) {
    const text = plain(value);
    const authors = authorsByChar(value);
    const out = [];
    const add = (from, to, link) => {
        for (let i = from; i < to;) {
            let j = i;
            while (j < to && authors[j] === authors[i]) j++;
            out.push({ text: text.slice(i, j), by: authors[i], link });
            i = j;
        }
    };
    let at = 0;
    for (const match of text.matchAll(LINK)) {
        add(at, match.index);
        add(match.index + 1, match.index + 1 + match[1].length, { href: match[2] });
        at = match.index + match[0].length;
    }
    add(at, text.length);
    return out;
}

// the text as it reads, in one string (for alt text and labels)
export function readable(value) {
    return runs(value).map((run) => run.text).join('');
}

// every piece of text a reader sees in a project, or in a section of games or articles and what's in it
export function entryTexts(entry) {
    return [
        entry.title, entry.category ?? '', entry.when ?? '', entry.status ?? '', entry.tagline,
        ...(entry.labels ?? []), ...(entry.what ?? []), ...(entry.how ?? []), ...(entry.role ?? []),
        ...(entry.links ?? []).map((link) => link.label),
        entry.open ?? '', entry.caption ?? '', entry.imageAlt ?? '',
        ...(entry.prs ?? []).map((pr) => pr.title),
        ...(entry.items ?? []).flatMap(entryTexts),
    ];
}

export function allTexts(text) {
    return [
        text.rupture.title, text.rupture.disclaimer, ...Object.values(text.intro), ...Object.values(text.headings),
        ...text.projects.flatMap(entryTexts),
    ];
}

// how much of these texts is yours, as they read: a share of the written letters (spaces, facts and quotes
// aside), and your word count
export function share(values) {
    let mine = 0;
    let total = 0;
    let words = 0;
    values.forEach((value) => {
        runs(value).forEach((run) => {
            if (run.by === 'data') return;
            const letters = run.text.replace(/\s/g, '').length;
            total += letters;
            if (run.by !== 'mine') return;
            mine += letters;
            words += run.text.split(/\s+/).filter(Boolean).length;
        });
    });
    return { fraction: total ? mine / total : 0, words };
}

export function percent(fraction) {
    if (fraction > 0 && fraction < 0.01) return '<1%';
    return `${Math.round(fraction * 100)}%`;
}
