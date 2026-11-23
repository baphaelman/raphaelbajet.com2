import Slop from '/components/slop.js';

const LINK = /\[([^\]]+)\]\(([^)\s]+)\)/g;
const pieces = (value) => (typeof value === 'string' ? [value] : value);

// the part of a text between two places in its plain text, each piece keeping who wrote it
function cut(value, from, to) {
    const out = [];
    let at = 0;
    pieces(value).forEach((piece) => {
        const s = typeof piece === 'string' ? piece : Object.values(piece)[0];
        const a = Math.max(from, at);
        const b = Math.min(to, at + s.length);
        if (a < b) out.push(typeof piece === 'string' ? s.slice(a - at, b - at) : { [Object.keys(piece)[0]]: s.slice(a - at, b - at) });
        at += s.length;
    });
    return out;
}

// the text with each [label](address) down to its label
function unlinked(value) {
    const text = Slop.plain(value);
    const out = [];
    let at = 0;
    for (const match of text.matchAll(LINK)) {
        out.push(...cut(value, at, match.index), ...cut(value, match.index + 1, match.index + 1 + match[1].length));
        at = match.index + match[0].length;
    }
    out.push(...cut(value, at, text.length));
    return out;
}

// A text from src/slopText.json, by its path, as it reads on the page: each author's words in a span of their own
// (slop-ai, slop-me, slop-ok, slop-data), line breaks kept. data-slop lets the editor find it on the page and fill it
// in again after an edit. Where `links` is set, a link written [label](address) becomes a real one, in a new tab;
// elsewhere (inside a button or another link) only its label shows. `approved` shows an agent's words as approved
function Words({ path, links, approved }) {
    const value = Slop.get(path);
    if (approved) {
        Slop.html(path); // on the page, for the editor
        return <span dangerouslySetInnerHTML={{ __html: Slop.render(Slop.unslop(value)) }} />;
    }
    if (!links && Slop.plain(value).match(LINK)) {
        Slop.html(path);
        return <span dangerouslySetInnerHTML={{ __html: Slop.render(unlinked(value)) }} />;
    }
    return <span data-slop={path} dangerouslySetInnerHTML={{ __html: Slop.render(value) }} />;
}

export default Words;
