import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import SlopZone from '/components/SlopZone.jsx';
import Backdrop from '/components/SlopBackdrop.jsx';
import { PAD, crackShape, tearAt, tearReach, tearOutline, tearStrands, tearDrops, sealStep, turnedToSeal, TEAR_MS, SEAL_FROM, smoothstep } from '/components/slopCrack.js';
import { gooRenderer } from '/components/slopGooGL.js';
import Words from '/components/SlopWords.jsx';
import { readable } from '/components/slopText.js';
import savedText from '/src/slopProjects.json';

function toPolygon(points, dx = 0, dy = 0) {
    return `polygon(${points.map(([x, y]) => `${(x + dx).toFixed(1)}px ${(y + dy).toFixed(1)}px`).join(', ')})`;
}

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


// the canvas's device px to a css px: as sharp as the screen at rest, a little softer for the tear, which fills it
const restScale = () => Math.min(2, window.devicePixelRatio || 1);
const tearScale = () => Math.min(1.5, window.devicePixelRatio || 1);

const HOVER_MS = 350;

function SlopRupture() {
    // closed -> opening -> open -> closing -> closed
    const [phase, setPhase] = useState(() => (window.location.hash === ZONE_HASH ? 'open' : 'closed'));
    const [hovered, setHovered] = useState(false);
    const [painted, setPainted] = useState(false);
    const [text, setText] = useState(savedText); // edited live by the text panel in dev

    const wasOpened = useRef(false);
    const pushedHash = useRef(false); // whether Back will take the zone's address off again
    // the ink: its canvas (in the crack, or over the screen while it's torn open), what draws it, and the shape it's
    // drawing (the crack's size when it was worked out, crackShape for that size)
    const ink = useRef({ canvas: null, renderer: null, size: null, shape: null });
    const tear = useRef({ t: 0, direction: 0, frame: 0, rect: null, reach: null }); // while it tears open or seals
    const hover = useRef({ value: 0, frame: 0 }); // 0..1, how far the ink has risen to meet the pointer
    const crackRef = useRef(null);
    const voidRef = useRef(null);
    const staticRef = useRef(null);
    const buttonRef = useRef(null);
    const leaveRef = useRef(null);
    const zoneRef = useRef(null);
    const tearRef = useRef(null);

    // the ink at rest in the crack, risen a little if the pointer's on it
    function drawRest() {
        const { canvas, renderer, size, shape } = ink.current;
        if (!renderer || !size || tear.current.frame) return;
        const width = size.width + 2 * PAD;
        const height = size.height + 2 * PAD;
        canvas.width = Math.round(width * restScale());
        canvas.height = Math.round(height * restScale());
        const risen = smoothstep(0, 1, hover.current.value);
        renderer.draw({
            origin: { x: -PAD, y: -PAD },
            scale: canvas.width / width,
            shape,
            swell: 2.5 * risen,
            glow: 0.5 + 0.3 * risen,
        });
    }

    // the tear, `t` of the way from the crack to the zone, and the zone showing through the gap it's opened
    function drawTear(t) {
        const { canvas, renderer, shape } = ink.current;
        const { rect, reach, direction } = tear.current;
        const at = tearAt(t, reach, direction < 0);
        const risen = smoothstep(0, 1, hover.current.value);
        renderer.draw({
            origin: { x: -rect.left, y: -rect.top },
            scale: canvas.width / window.innerWidth,
            shape,
            swell: Math.max(at.swell, 2.5 * risen),
            glow: 0.5 + Math.max(0.3 * risen, 0.45 * at.charge),
            tear: at,
            strands: tearStrands(shape, at),
            drops: direction > 0 ? tearDrops(shape, at) : undefined, // only when it's breaking, not sealing
        });
        // a little in from the gap's sides, under the ink rolled over them
        zoneRef.current.style.clipPath = toPolygon(tearOutline(shape, at, 2), rect.left, rect.top);
    }

    // whether the crack can tear open: drawn, in sight, and motion's welcome
    function canTear() {
        const { renderer, size } = ink.current;
        if (!renderer || !size || renderer.lost() || reducedMotion()) return false;
        const r = crackRef.current.getBoundingClientRect();
        return r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth;
    }

    function open() {
        if (phase !== 'closed') return;
        wasOpened.current = true;
        window.history.pushState(null, '', ZONE_HASH);
        pushedHash.current = true;
        setPhase(canTear() ? 'opening' : 'open');
    }

    // seal the zone (the address has already lost its hash, or is about to)
    function seal() {
        if (phase === 'closed' || phase === 'closing') return;
        setPhase(phase === 'opening' || canTear() ? 'closing' : 'closed');
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

    useLayoutEffect(() => { // tear the crack open onto the zone, or seal it back up
        if (phase !== 'opening' && phase !== 'closing') return;
        const run = tear.current;
        run.direction = phase === 'opening' ? 1 : -1;
        if (run.frame) { // already under way: it turns round where it is
            run.t = turnedToSeal(run.t);
            return;
        }

        // take over from the ink at rest: the same drawing, over the whole screen
        const { canvas, shape } = ink.current;
        run.t = run.direction > 0 ? 0 : SEAL_FROM;
        run.rect = crackRef.current.getBoundingClientRect();
        run.reach = tearReach(shape, run.rect, window.innerWidth, window.innerHeight);
        tearRef.current.append(canvas);
        canvas.width = Math.round(window.innerWidth * tearScale());
        canvas.height = Math.round(window.innerHeight * tearScale());
        drawTear(run.t);

        let last = null;
        const step = (now) => {
            // no time passes on the first frame, which can be late while the zone first lays out
            const elapsed = last === null ? 0 : now - last;
            last = now;
            run.t = run.direction > 0 ? Math.min(1, run.t + elapsed / TEAR_MS.open) : sealStep(run.t, elapsed);
            const done = run.direction > 0 ? run.t >= 1 : run.t <= 0;
            if (!done) {
                drawTear(run.t);
                run.frame = requestAnimationFrame(step);
                return;
            }
            // back in the crack, at rest, before the zone goes or the screen's all zone
            run.frame = 0;
            crackRef.current.append(canvas);
            drawRest();
            zoneRef.current.style.clipPath = run.direction > 0 ? '' : 'inset(50%)';
            setPhase(run.direction > 0 ? 'open' : 'closed');
        };
        run.frame = requestAnimationFrame(step);
    }, [phase]);

    useEffect(() => () => cancelAnimationFrame(tear.current.frame), []);

    useEffect(() => { // the ink rises a little to meet the pointer, and settles when it goes
        const target = hovered && !reducedMotion() ? 1 : 0;
        const rise = hover.current;
        let last = null;
        const step = (now) => {
            const elapsed = last === null ? 0 : now - last;
            last = now;
            const move = elapsed / HOVER_MS;
            rise.value = target > rise.value ? Math.min(target, rise.value + move) : Math.max(target, rise.value - move);
            drawRest();
            if (rise.value !== target) rise.frame = requestAnimationFrame(step);
        };
        cancelAnimationFrame(rise.frame);
        rise.frame = requestAnimationFrame(step);
        return () => cancelAnimationFrame(rise.frame);
    }, [hovered]);

    useLayoutEffect(() => { // the ink's canvas, and its shape, worked out to fit the crack whenever that changes size
        const canvas = document.createElement('canvas');
        canvas.className = 'rupture-goo';
        canvas.setAttribute('aria-hidden', 'true');
        crackRef.current.append(canvas);
        const connect = () => {
            try {
                ink.current.renderer = gooRenderer(canvas);
            } catch (error) {
                console.error(error); // and the zone opens without the tear
                ink.current.renderer = null;
            }
        };
        ink.current.canvas = canvas;
        connect();

        const worker = new Worker(new URL('./slopCrackWorker.js', import.meta.url), { type: 'module' });
        const asked = { id: 0, width: 0, height: 0 };
        const ask = () => {
            asked.id += 1;
            worker.postMessage(asked);
        };
        worker.onmessage = ({ data }) => {
            if (data.id !== asked.id || !ink.current.renderer) return; // the crack's changed size again since
            ink.current.renderer.setGoo(data);
            ink.current.size = { width: asked.width, height: asked.height };
            ink.current.shape = crackShape(asked.width, asked.height);
            drawRest();
            setPainted(true);
        };
        canvas.addEventListener('webglcontextlost', (event) => event.preventDefault());
        canvas.addEventListener('webglcontextrestored', () => {
            connect();
            ask();
        });

        let timer;
        const observer = new ResizeObserver(([entry]) => {
            const { width, height } = entry.contentRect;
            // the zone's text shows through the split straight away; the ink over it follows once it's worked out
            voidRef.current.style.clipPath = toPolygon(crackShape(width, height).outline());
            clearTimeout(timer);
            timer = setTimeout(() => {
                asked.width = width;
                asked.height = height;
                if (ink.current.renderer) ask();
            }, asked.id ? 250 : 0);
        });
        observer.observe(crackRef.current);
        return () => {
            observer.disconnect();
            clearTimeout(timer);
            worker.terminate();
            canvas.remove();
        };
    }, []);

    useLayoutEffect(() => { // the text in the crack lines up with the zone's, which fills the screen the projects fill
        const place = () => {
            staticRef.current.style.left = `${-(buttonRef.current.offsetLeft + crackRef.current.offsetLeft)}px`;
            staticRef.current.style.top = `${-(buttonRef.current.offsetTop + crackRef.current.offsetTop)}px`;
        };
        place();
        window.addEventListener('resize', place);
        return () => window.removeEventListener('resize', place);
    }, []);

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

    return (
        <>
            <button
                ref={buttonRef}
                className={`rupture${hovered ? ' rupture-hovered' : ''}${painted ? ' rupture-painted' : ''}`}
                onClick={open}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                onFocus={() => setHovered(true)}
                onBlur={() => setHovered(false)}
                aria-haspopup="dialog"
                aria-expanded={isOpen}
            >
                <span className="rupture-crack" ref={crackRef} style={{ '--pad': `${PAD}px` }}>
                    <span className="rupture-void" ref={voidRef}>
                        <span className="rupture-static" ref={staticRef}>
                            <Backdrop />
                        </span>
                    </span>
                </span>
                <span className="rupture-label">
                    <span className="rupture-title"><Words value={text.rupture.title} /></span>
                    <span className="rupture-disclaimer"><Words value={text.rupture.disclaimer} /></span>
                </span>
            </button>
            {isOpen && createPortal(
                <>
                    <div
                        ref={zoneRef}
                        className={`slop-zone slop-zone-${phase}`}
                        role="dialog"
                        aria-modal="true"
                        aria-label={readable(text.intro.title)}
                    >
                        <Backdrop />
                        <SlopZone
                            text={text}
                            savedText={savedText}
                            onEdit={setText}
                            onLeave={leave}
                            leaveRef={leaveRef}
                        />
                    </div>
                    {phase !== 'open' && <div ref={tearRef} className="slop-tear" aria-hidden="true" />}
                </>,
                document.body
            )}
            <FollowFile file={savedText} onEdit={setText} />
        </>
    );
}

export default SlopRupture;
