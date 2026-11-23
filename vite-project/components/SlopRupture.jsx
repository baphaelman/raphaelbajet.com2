import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import SlopZone from '/components/SlopZone.jsx';
import Words from '/components/SlopWords.jsx';
import { readable } from '/components/slopText.js';
import savedText from '/src/slopProjects.json';

// The tear, top to bottom: [y, centre x, half-width], in % of the rupture's box
const SPINE = [
    [0, 52, 0.5], [5, 47, 2], [11, 56, 4], [18, 45, 7], [26, 55, 10], [34, 42, 13],
    [43, 53, 17], [52, 41, 16], [60, 54, 13], [68, 45, 10], [76, 55, 7], [84, 47, 4],
    [91, 53, 2], [100, 49, 0.5],
];
// how far each edge strays from the spine, so the two sides don't mirror each other
const JAG_LEFT = [0, 0.4, -0.3, 0.3, -0.2, 0.45, -0.1, 0.25, -0.3, 0.2, -0.25, 0.4, -0.1, 0];
const JAG_RIGHT = [0, -0.2, 0.35, -0.3, 0.3, -0.15, 0.4, -0.3, 0.2, -0.35, 0.3, -0.2, 0.3, 0];

// hairline cracks running off the tear: [spine index, side, length, rise]
const BRANCHES = [
    [3, -1, 22, -4], [5, -1, 30, 5], [6, 1, 26, -6], [8, 1, 34, 4], [9, -1, 18, 6], [11, 1, 20, -3],
];

// left edge top to bottom, then right edge bottom to top
function outline(spread) {
    const left = SPINE.map(([y, x, w], i) => [x - w * spread * (1 + JAG_LEFT[i]), y]);
    const right = SPINE.map(([y, x, w], i) => [x + w * spread * (1 + JAG_RIGHT[i]), Math.min(100, y + 2.5)]);
    return [...left, ...right.reverse()];
}

function toPolygon(points) {
    return `polygon(${points.map(([x, y]) => `${x.toFixed(2)}% ${y.toFixed(2)}%`).join(', ')})`;
}

const CRACK = outline(1);
const CRACK_WIDE = outline(1.45);

// the same outline pulled past every edge of the screen, so the tear can open into it
const TORN_OPEN = toPolygon(CRACK.map(([, y], i) => [i < SPINE.length ? -8 : 108, -8 + y * 1.16]));

const branchPaths = BRANCHES.map(([i, side, length, rise]) => {
    const [y, x, w] = SPINE[i];
    const startX = x + side * w;
    return `M${startX} ${y} l${side * length * 0.4} ${rise * 0.6} l${side * length * 0.35} ${-rise * 0.3} l${side * length * 0.25} ${rise * 0.9}`;
});

// what you can make out through the crack
const STATIC_LINES = [
    "You're absolutely right!", 'Let me fix that.', '✓ all tests pass', 'Now I\'ll refactor…',
    'Great question!', 'I see the issue.', 'Let me check the file.', 'Perfect! Now…',
    'The build is green.', 'One more tweak.',
];

// the zone has its own address, so Back leaves it and a link can open straight into it
const ZONE_HASH = '#slop-zone';

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

// `ours` (the page's text) after the file it came from went from `base` to `theirs`: the file's changes come in,
// edits made on the page stay, and where both changed the same thing, the page's wins
function merge(base, ours, theirs) {
    if (same(ours, base)) return theirs;
    if (same(theirs, base) || same(ours, theirs)) return ours;
    if ([base, ours, theirs].every(isObject)) {
        const out = {};
        new Set([...Object.keys(ours), ...Object.keys(theirs)]).forEach((key) => {
            const value = merge(base[key], ours[key], theirs[key]);
            if (value !== undefined) out[key] = value;
        });
        return out;
    }
    if (![base, ours, theirs].every(Array.isArray)) return ours;
    // projects, and the games or articles in a section, are matched by id, in the page's order unless only the
    // file reordered them
    if ([base, ours, theirs].every((list) => list.every((item) => isObject(item) && 'id' in item))) {
        const ids = (list) => list.map((item) => item.id);
        const find = (list, id) => list.find((item) => item.id === id);
        const order = same(ids(ours), ids(base)) ? [...ids(theirs), ...ids(ours)] : [...ids(ours), ...ids(theirs)];
        return [...new Set(order)].flatMap((id) => {
            const value = merge(find(base, id), find(ours, id), find(theirs, id));
            return value === undefined ? [] : [value];
        });
    }
    if (ours.length === base.length && theirs.length === base.length) {
        return ours.map((item, i) => merge(base[i], item, theirs[i]));
    }
    return ours;
}

// In dev, a change to slopProjects.json (saved from this page or another tab, or edited directly) reaches the page
// as a hot update. This takes it in, so the panel never saves an older copy over it
function FollowFile({ file, onEdit }) {
    const seen = useRef(file);
    useEffect(() => {
        if (file === seen.current) return;
        const base = seen.current;
        seen.current = file;
        onEdit((text) => merge(base, text, file));
    }, [file, onEdit]);
    return null;
}

function SlopRupture() {
    // closed -> torn (crack-shaped) -> opening -> open -> closing -> closed
    const [phase, setPhase] = useState(() => (window.location.hash === ZONE_HASH ? 'open' : 'closed'));
    const [crackClip, setCrackClip] = useState(null);
    const [hovered, setHovered] = useState(false);
    const [text, setText] = useState(savedText); // edited live by the text panel in dev

    const wasOpened = useRef(false);
    const pushedHash = useRef(false); // whether Back will take the zone's address off again
    const crackRef = useRef(null);
    const buttonRef = useRef(null);
    const leaveRef = useRef(null);

    // the crack's outline in viewport %, which is where the tear starts and ends
    function crackOnScreen() {
        const r = crackRef.current.getBoundingClientRect();
        const visible = r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth;
        if (!visible) return null;
        return toPolygon(CRACK.map(([x, y]) => [
            ((r.left + (x / 100) * r.width) / window.innerWidth) * 100,
            ((r.top + (y / 100) * r.height) / window.innerHeight) * 100,
        ]));
    }

    function open() {
        if (phase !== 'closed') return;
        wasOpened.current = true;
        window.history.pushState(null, '', ZONE_HASH);
        pushedHash.current = true;
        const clip = reducedMotion() ? null : crackOnScreen();
        if (!clip) {
            setPhase('open');
            return;
        }
        setCrackClip(clip);
        setPhase('torn');
    }

    // seal the zone (the address has already lost its hash, or is about to)
    function seal() {
        if (phase === 'closed' || phase === 'closing') return;
        const clip = reducedMotion() ? null : crackOnScreen();
        if (!clip) {
            setPhase('closed');
            return;
        }
        setCrackClip(clip);
        setPhase('closing');
    }

    // every way out goes through here: the Leave button, Esc, and Back (via popstate)
    function leave() {
        if (pushedHash.current) {
            window.history.back();
        } else {
            window.history.replaceState(null, '', window.location.pathname + window.location.search);
            seal();
        }
    }

    useEffect(() => { // Back (or Forward) moves in and out of the zone
        const handlePop = () => {
            if (window.location.hash === ZONE_HASH) {
                if (phase === 'closed') {
                    pushedHash.current = false;
                    setPhase('open');
                }
            } else {
                pushedHash.current = false;
                seal();
            }
        };
        window.addEventListener('popstate', handlePop);
        return () => window.removeEventListener('popstate', handlePop);
    });

    useEffect(() => { // paint the crack-shaped overlay once, then let it tear open
        if (phase !== 'torn') return;
        let frame = requestAnimationFrame(() => {
            frame = requestAnimationFrame(() => setPhase('opening'));
        });
        return () => cancelAnimationFrame(frame);
    }, [phase]);

    useEffect(() => { // fallback in case transitionend never fires
        if (phase !== 'opening' && phase !== 'closing') return;
        const timer = setTimeout(() => setPhase(phase === 'opening' ? 'open' : 'closed'), 1400);
        return () => clearTimeout(timer);
    }, [phase]);

    useEffect(() => { // focus moves into the zone, and back to the rupture once it's sealed
        if (phase === 'open') leaveRef.current?.focus({ preventScroll: true });
        if (phase === 'closed' && wasOpened.current) buttonRef.current?.focus({ preventScroll: true });
    }, [phase]);

    const isOpen = phase !== 'closed';

    useEffect(() => { // the rest of the site goes quiet while you're inside
        if (!isOpen) return;
        const root = document.getElementById('root');
        root.inert = true;
        return () => {
            root.inert = false;
        };
    }, [isOpen]);

    function handleTransitionEnd(e) {
        if (e.target !== e.currentTarget || e.propertyName !== 'clip-path') return;
        if (phase === 'opening') setPhase('open');
        if (phase === 'closing') setPhase('closed');
    }

    const clipPath = {
        torn: crackClip,
        opening: TORN_OPEN,
        open: TORN_OPEN,
        closing: crackClip,
    }[phase];

    return (
        <>
            <button
                ref={buttonRef}
                className={`rupture${hovered ? ' rupture-hovered' : ''}`}
                onClick={open}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                onFocus={() => setHovered(true)}
                onBlur={() => setHovered(false)}
                aria-haspopup="dialog"
                aria-expanded={isOpen}
            >
                <span className="rupture-crack" ref={crackRef}>
                    <span className="rupture-glow">
                        <span
                            className="rupture-void"
                            style={{ clipPath: toPolygon(hovered ? CRACK_WIDE : CRACK) }}
                        >
                            <span className="rupture-static" aria-hidden="true">
                                {[...STATIC_LINES, ...STATIC_LINES].map((line, i) => (
                                    <span key={i}>{line}</span>
                                ))}
                            </span>
                        </span>
                    </span>
                    <svg className="rupture-fractures" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                        {branchPaths.map((d) => <path key={d} d={d} />)}
                    </svg>
                </span>
                <span className="rupture-label">
                    <span className="rupture-title"><Words value={text.rupture.title} /></span>
                    <span className="rupture-disclaimer"><Words value={text.rupture.disclaimer} /></span>
                </span>
            </button>
            {isOpen && createPortal(
                <div
                    className={`slop-zone slop-zone-${phase}`}
                    style={{ clipPath }}
                    onTransitionEnd={handleTransitionEnd}
                    role="dialog"
                    aria-modal="true"
                    aria-label={readable(text.intro.title)}
                >
                    <SlopZone
                        text={text}
                        savedText={savedText}
                        onEdit={setText}
                        onLeave={leave}
                        leaveRef={leaveRef}
                    />
                </div>,
                document.body
            )}
            <FollowFile file={savedText} onEdit={setText} />
        </>
    );
}

export default SlopRupture;
