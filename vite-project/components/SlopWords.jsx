import { Fragment } from 'react';
import { runs } from '/components/slopText.js';

// one author's words: an agent's in the zone's purple, anything else (yours, facts and quotes) in the text color.
// Approved words look like yours (slop-mine), with slop-ok as well. Line breaks are kept
function Run({ run }) {
    return (
        <span className={run.by === 'ok' ? 'slop-mine slop-ok' : `slop-${run.by}`}>
            {run.text.split('\n').map((line, i) => <Fragment key={i}>{i > 0 && <br />}{line}</Fragment>)}
        </span>
    );
}

// A text from slopProjects.json as it reads on the page (see slopText.js). Where `links` is set, a link written
// [label](address) becomes a real one (in a new tab, like every link on the site); elsewhere, inside a button or
// another link, only its label shows
function Words({ value, links }) {
    const parts = [];
    runs(value).forEach((run) => {
        const last = parts[parts.length - 1];
        if (!links || !run.link) parts.push(run);
        else if (last?.link === run.link) last.runs.push(run);
        else parts.push({ link: run.link, runs: [run] });
    });
    return parts.map((part, i) => {
        if (!part.runs) return <Run key={i} run={part} />;
        return (
            <a key={i} href={part.link.href} target="_blank" rel="noopener noreferrer" className="slop-text-link">
                {part.runs.map((run, j) => <Run key={j} run={run} />)}
            </a>
        );
    });
}

export default Words;
