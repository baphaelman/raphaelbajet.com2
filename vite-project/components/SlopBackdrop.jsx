import { useState } from 'react';
import { CATCHPHRASES } from '/components/slopCatchphrases.js';

// Behind the Slop Zone, and what you can make out through the rupture: the classics in dim rows, each in its own
// order, drifting sideways at its own pace and its own way, picked fresh on every visit. Plain random clumps (two rows
// in step read as one band), so this is random that looks it: speeds spread evenly by ratio, never close to a nearby
// row's, and no direction more than two rows running
const SLOWEST = 0.6; // characters a second
const FASTEST = 4;

function shuffled(list) {
    const copy = [...list];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

// how different two speeds look: by ratio, so 1 to 2 is as far as 2 to 4
const apart = (a, b) => Math.max(a / b, b / a);

function backdropRows(count) {
    const rows = [];
    while (rows.length < count) {
        const near = rows.slice(-2);
        const reverse = near.length === 2 && near[0].reverse === near[1].reverse ? !near[1].reverse : Math.random() < 0.5;
        // a row going the same way as one just above needs a clearly different speed; one going the other way, less so
        let speed;
        do speed = SLOWEST * (FASTEST / SLOWEST) ** Math.random();
        while (near.some((row) => apart(speed, row.speed) < (row.reverse === reverse ? 1.5 : 1.2)));
        const text = shuffled(CATCHPHRASES).join('   ·   ');
        const seconds = text.length / speed;
        rows.push({ text, speed, reverse, seconds, phase: Math.random() * seconds }); // starting anywhere in its loop
    }
    return rows;
}

const ROWS = backdropRows(40);

// Every copy (the rupture's, and the zone's each time it opens) runs on the page's clock, so they all show the same
// rows in the same places: the text in the crack is the zone's, and doesn't jump when the crack tears open
function Backdrop() {
    const [mountedAt] = useState(() => performance.now() / 1000);
    return (
        <span className="slop-backdrop" aria-hidden="true">
            {ROWS.map((row, i) => (
                <span
                    className={`slop-backdrop-row${row.reverse ? ' slop-backdrop-reverse' : ''}`}
                    key={i}
                    style={{ animationDuration: `${row.seconds}s`, animationDelay: `${-((mountedAt + row.phase) % row.seconds)}s` }}
                >
                    <span>{row.text}</span>
                    <span>{row.text}</span>
                </span>
            ))}
        </span>
    );
}

export default Backdrop;
