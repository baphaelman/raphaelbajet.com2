import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import ExternalLink from '/components/ExternalLink.jsx';
import SlopEditor from '/components/SlopEditor.jsx';
import Words from '/components/SlopWords.jsx';
import { plain, readable, share, unslop, allTexts, percent } from '/components/slopText.js';
import slopStats from '/src/slopStats.json';

// `npm run edit` (vite --mode edit): the Edit text panel, how much of the text is mine, and the parts still to write
const EDITING = import.meta.env.MODE === 'edit';

// the clip's controls, drawn in currentColor
const CLIP_ICONS = {
    play: <path d="M8 5.5v13l10.5-6.5z" className="slop-icon-solid" />,
    pause: <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" className="slop-icon-solid" />,
    muted: (
        <>
            <path d="M3.5 9.5h3.8L12 5.5v13l-4.7-4H3.5z" className="slop-icon-solid" />
            <path d="M15.5 9.5l5 5M20.5 9.5l-5 5" className="slop-icon-line" />
        </>
    ),
    sound: (
        <>
            <path d="M3.5 9.5h3.8L12 5.5v13l-4.7-4H3.5z" className="slop-icon-solid" />
            <path d="M15.5 9a4.2 4.2 0 0 1 0 6M18.3 6.3a8 8 0 0 1 0 11.4" className="slop-icon-line" />
        </>
    ),
};

// A clip that loops while it's on screen, muted until the viewer asks for sound, with a bar along the bottom that
// fills up to the loop. It loads only once it's scrolled to; it doesn't start by itself for viewers who turn motion
// off, or come back on after the viewer pauses it.
// A video's own sound skips when it starts over, so a clip with an `audio` file exactly one loop long plays that
// through Web Audio instead, which loops without a gap, and the picture keeps time with it
function Clip({ entry }) {
    const ref = useRef(null);
    const fillRef = useRef(null);
    const held = useRef(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const audio = useRef(null); // { context, buffer, heard } once the viewer first turns the sound on
    const [playing, setPlaying] = useState(false);
    const [sound, setSound] = useState(false);
    const [ready, setReady] = useState(false); // the loop's sound is decoded
    const [videoSound, setVideoSound] = useState(!entry.audio); // no loop file, or it wouldn't load

    useEffect(() => {
        ref.current.muted = !(sound && videoSound);
    }, [sound, videoSound]);

    useEffect(() => { // the loop plays from where the picture is, so what you hear lines up with what you see
        if (!playing || !sound || !ready) return;
        const { context, buffer } = audio.current;
        const video = ref.current;
        const latency = context.outputLatency || context.baseLatency || 0;
        const from = (video.currentTime + latency) % buffer.duration;
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        source.connect(context.destination);
        source.start(0, from);
        audio.current.heard = { from: from - latency, at: context.currentTime };
        return () => {
            source.stop();
            source.disconnect();
            audio.current.heard = null;
            video.playbackRate = 1;
        };
    }, [playing, sound, ready]);

    useEffect(() => () => audio.current?.context.close(), []);

    // the picture follows the sound: a little faster or slower when it drifts, or a jump when it's far off
    function follow(video) {
        const heard = audio.current?.heard;
        if (!heard || audio.current.context.state !== 'running') return;
        const { context, buffer } = audio.current;
        const length = buffer.duration;
        const now = (((heard.from + context.currentTime - heard.at) % length) + length) % length;
        const ahead = ((now - video.currentTime + 1.5 * length) % length) - length / 2; // the short way round the loop
        if (Math.abs(ahead) > 0.25) video.currentTime = now;
        const rate = Math.abs(ahead) > 0.25 ? 1 : 1 + Math.max(-0.1, Math.min(0.1, ahead * 2));
        if (Math.abs(video.playbackRate - rate) > 0.01) video.playbackRate = rate;
    }

    useEffect(() => {
        const video = ref.current;
        const observer = new IntersectionObserver(([seen]) => {
            if (!seen.isIntersecting) video.pause();
            else if (!held.current) video.play().catch(() => {});
        }, { threshold: 0.25 });
        observer.observe(video);
        return () => observer.disconnect();
    }, []);

    useEffect(() => { // the bar follows the clip every frame while it plays
        if (!playing) return;
        const video = ref.current;
        let frame;
        const draw = () => {
            if (video.duration) fillRef.current.style.transform = `scaleX(${video.currentTime / video.duration})`;
            follow(video);
            frame = requestAnimationFrame(draw);
        };
        draw();
        return () => cancelAnimationFrame(frame);
    }, [playing]);

    function togglePlay() {
        const video = ref.current;
        held.current = !video.paused;
        if (video.paused) video.play().catch(() => {});
        else video.pause();
    }

    function toggleSound() {
        setSound(!sound);
        if (sound || videoSound) return;
        if (audio.current) audio.current.context.resume();
        else loadSound();
    }

    // the first time the sound goes on. The context opens during that click, so the browser lets it play
    function loadSound() {
        let context;
        try {
            context = new AudioContext({ sampleRate: 48000 });
        } catch {
            setVideoSound(true);
            return;
        }
        audio.current = { context };
        fetch(entry.audio)
            .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(new Error(res.statusText))))
            .then((data) => context.decodeAudioData(data))
            .then((buffer) => {
                audio.current.buffer = buffer;
                setReady(true);
            })
            .catch(() => setVideoSound(true));
    }

    return (
        <div className="slop-clip">
            <video
                ref={ref}
                src={entry.video}
                poster={entry.poster}
                muted
                loop
                playsInline
                preload="none"
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onClick={togglePlay}
                aria-label={readable(entry.imageAlt)}
            />
            <div className="slop-clip-controls">
                <button className="slop-clip-button" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}>
                    <svg viewBox="0 0 24 24" aria-hidden="true">{CLIP_ICONS[playing ? 'pause' : 'play']}</svg>
                </button>
                <button
                    className={`slop-clip-button slop-clip-sound${sound ? '' : ' slop-clip-muted'}`}
                    onClick={toggleSound}
                    aria-label="Sound"
                    aria-pressed={sound}
                    title={sound ? 'Mute' : 'Turn the sound on'}
                >
                    <svg viewBox="0 0 24 24" aria-hidden="true">{CLIP_ICONS[sound ? 'sound' : 'muted']}</svg>
                </button>
            </div>
            <div className="slop-clip-progress" aria-hidden="true"><span ref={fillRef} /></div>
        </div>
    );
}

// A screenshot in the viewer's color scheme: dark unless their system asks for light
function Shot({ entry, className }) {
    return (
        <picture>
            {entry.imageLight && <source srcSet={entry.imageLight} media="(prefers-color-scheme: light)" />}
            <img className={className} src={entry.image} alt={readable(entry.imageAlt)} loading="lazy" />
        </picture>
    );
}

function Visual({ project }) {
    switch (project.visual) {
        case 'image':
            return <Shot entry={project} className="slop-shot" />;
        case 'video':
            return <Clip entry={project} />;
        case 'prs':
            return (
                <ul className="slop-prs">
                    {project.prs.map((pr) => (
                        <li key={pr.href}>
                            <span className="slop-pr-state">Open</span>
                            <ExternalLink href={pr.href}><Words value={pr.title} /></ExternalLink>
                        </li>
                    ))}
                </ul>
            );
        default:
            return null;
    }
}

// Each tile's thumbnail, a little drawing of the project (picked by `thumb` in slopProjects.json)
const SKETCHES = {
    // three lines of a verse, the rhyme at the end of each one picked out
    rhymes: (
        <>
            <rect x="8" y="13" width="24" height="8" rx="1.5" className="slop-thumb-faint" />
            <rect x="35" y="13" width="17" height="8" rx="1.5" className="slop-thumb-fill" />
            <rect x="8" y="26" width="18" height="8" rx="1.5" className="slop-thumb-faint" />
            <rect x="29" y="26" width="17" height="8" rx="1.5" className="slop-thumb-fill" />
            <rect x="8" y="39" width="21" height="8" rx="1.5" className="slop-thumb-faint" />
            <rect x="32" y="39" width="17" height="8" rx="1.5" className="slop-thumb-fill" />
        </>
    ),
    // three artists' shares of your listening, stacked over time
    streams: (
        <>
            <path d="M6 28 C16 24 22 32 32 26 C42 20 46 18 54 22 V10 C46 8 42 8 32 13 C22 18 16 12 6 14 Z" className="slop-thumb-stack slop-thumb-faint" />
            <path d="M6 40 C16 34 22 44 32 38 C42 32 46 30 54 34 V22 C46 18 42 20 32 26 C22 32 16 24 6 28 Z" className="slop-thumb-stack slop-thumb-fill-alt" />
            <path d="M6 50 V40 C16 34 22 44 32 38 C42 32 46 30 54 34 V50 Z" className="slop-thumb-stack slop-thumb-fill" />
        </>
    ),
    pitchlines: (
        <>
            <path d="M6 32 H18 C24 32 24 14 30 14 H54" />
            <path d="M6 32 H18 C24 32 24 24 30 24 H54" className="slop-thumb-faint" />
            <path d="M6 32 H18 C24 32 24 40 30 40 H54" className="slop-thumb-faint" />
            <path d="M6 32 H18 C24 32 24 50 30 50 H54" />
        </>
    ),
    comma: (
        <>
            <path d="M6 12 H54" className="slop-thumb-faint" />
            <rect x="9" y="13" width="7" height="8" rx="1.5" className="slop-thumb-fill" />
            <rect x="21" y="13" width="7" height="16" rx="1.5" className="slop-thumb-fill" />
            <rect x="33" y="13" width="7" height="24" rx="1.5" className="slop-thumb-fill" />
            <rect x="45" y="13" width="7" height="32" rx="1.5" className="slop-thumb-fill" />
        </>
    ),
    board: (
        <>
            <path d="M10 10 V50 M20 10 V50 M30 10 V50 M40 10 V50 M50 10 V50 M10 10 H50 M10 20 H50 M10 30 H50 M10 40 H50 M10 50 H50" className="slop-thumb-faint" />
            <path d="M22.5 22.5 l5 5 m0 -5 l-5 5 M32.5 32.5 l5 5 m0 -5 l-5 5 M22.5 42.5 l5 5 m0 -5 l-5 5" />
            <circle cx="35" cy="25" r="3" className="slop-thumb-ink" />
            <circle cx="25" cy="35" r="3" className="slop-thumb-ink" />
        </>
    ),
    pr: (
        <>
            <circle cx="18" cy="16" r="4" />
            <circle cx="18" cy="44" r="4" />
            <circle cx="42" cy="44" r="4" />
            <path d="M18 20 V40 M42 40 V26 C42 20 38 16 32 16 H26 M30 12 l-4 4 l4 4" />
        </>
    ),
};

function Thumb({ project }) {
    const sketch = SKETCHES[project.thumb];
    return (
        <span className="slop-thumb" aria-hidden="true">
            {sketch ? <svg viewBox="0 0 60 60">{sketch}</svg> : <span className="slop-thumb-letter">{readable(project.title).charAt(0)}</span>}
        </span>
    );
}

function Labels({ labels, picked }) {
    if (!labels?.length) return null;
    return (
        <ul className="slop-labels" aria-label="Labels">
            {labels.map((label, i) => (
                <li key={i} className={picked?.has(labelKey(label)) ? 'slop-label-on' : undefined}><Words value={label} /></li>
            ))}
        </ul>
    );
}

// a label by its words, case aside, so "Math" on one card and "math" on another are one label
const labelKey = (label) => readable(label).trim().toLowerCase();

// every label in the zone, in the order they first appear, with how many projects, games and articles carry it
function allLabels(projects) {
    const found = new Map();
    projects.flatMap((project) => project.items ?? [project]).forEach((entry) => {
        const own = new Map((entry.labels ?? []).map((label) => [labelKey(label), readable(label).trim()]));
        own.forEach((name, key) => {
            if (!key) return;
            if (found.has(key)) found.get(key).count++;
            else found.set(key, { key, name, count: 1 });
        });
    });
    return [...found.values()];
}

// whether a project, game or article carries a picked label (a section of games or articles: any of them)
const carries = (entry, picked) => (entry.labels ?? []).some((label) => picked.has(labelKey(label)))
    || (entry.items ?? []).some((item) => carries(item, picked));

// "What is it?", "How did it do it?" (the agents' part) and "What did I do?" (mine). A part with nothing in it
// is left out of the site, and marked as still to write while running `npm run edit`
function Story({ entry, headings }) {
    return ['what', 'how', 'role'].map((part) => {
        const written = entry[part].filter((paragraph) => plain(paragraph).trim());
        if (!written.length && !EDITING) return null;
        // a heading is an agent's until you write anything in its section: then it's yours, in that card alone
        const heading = share(entry[part]).fraction > 0 ? unslop(headings[part]) : headings[part];
        return (
            <section className="slop-story" key={part}>
                <h4><Words value={heading} /></h4>
                {written.map((paragraph, i) => <p key={i}><Words value={paragraph} links /></p>)}
                {!written.length && <p className="slop-story-empty">Not written yet</p>}
            </section>
        );
    });
}

// [key, label, label for one]
const STATS = [['commits', 'commits', 'commit'], ['agents', 'agents', 'agent'], ['sessions', 'sessions', 'session'], ['hours', 'agent hours', 'agent hours']];

// the oldest transcript counted (2026-10-28 → Oct 28, 2026): Claude Code had already deleted the ones before it
const STATS_SINCE = slopStats.since
    && new Date(slopStats.since).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

// What went into a project, counted from git and Claude Code's transcripts by scripts/slop-stats.mjs (which runs
// before `npm run dev`): numbers, so nobody's words. Commits are all of git's; the rest only go back to STATS_SINCE
function Stats({ id }) {
    const counts = slopStats.projects[id];
    if (!counts) return null;
    return (
        <>
            <dl className="slop-card-stats">
                {STATS.map(([key, label, one]) => (
                    <div key={key}>
                        <dt>{counts[key] === null ? `${label} (not in git)` : counts[key] === 1 ? one : label}</dt>
                        <dd>{key === 'hours' && counts.hours < 10 ? counts.hours.toFixed(1) : Math.round(counts[key] ?? 0).toLocaleString('en-US')}</dd>
                    </div>
                ))}
            </dl>
            {STATS_SINCE && <p className="slop-card-stats-since">Agents, sessions and hours since {STATS_SINCE}</p>}
        </>
    );
}

// the icons that stand in for "Try it" and "Code"
const ICONS = {
    web: (
        <svg viewBox="0 0 24 24" className="slop-icon-stroke">
            <circle cx="12" cy="12" r="9" />
            <ellipse cx="12" cy="12" rx="3.8" ry="9" />
            <path d="M3 12h18M4.6 7h14.8M4.6 17h14.8" />
        </svg>
    ),
    github: (
        <svg viewBox="0 0 24 24" className="slop-icon-fill">
            <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
        </svg>
    ),
};

// A link out of a card: an icon where it has one (its label is then read aloud and shown on hover), else its label
function CardLink({ link }) {
    if (link.icon) {
        const label = readable(link.label);
        return (
            <a href={link.href} target="_blank" rel="noopener noreferrer" className="slop-icon-link" aria-label={label} title={label}>
                {ICONS[link.icon]}
            </a>
        );
    }
    return link.internal ? (
        <Link to={link.href} className="external-link"><Words value={link.label} /></Link>
    ) : (
        <ExternalLink href={link.href}><Words value={link.label} /> ↗</ExternalLink>
    );
}

function ProjectCard({ project, headings, lit, picked }) {
    return (
        <article
            className={`slop-card${lit ? ' slop-card-lit' : ''}${picked.size && carries(project, picked) ? ' slop-picked' : ''}`}
            id={`slop-${project.id}`}
            style={{ '--c': project.color }}
        >
            <header className="slop-card-head">
                <div>
                    <h3><span className="slop-card-tab" aria-hidden="true" /><Words value={project.title} /></h3>
                    <p className="slop-card-sub"><Words value={project.when} /> · <Words value={project.status} /></p>
                    <Labels labels={project.labels} picked={picked} />
                </div>
                {project.links.length > 0 && (
                    <div className="slop-card-links">
                        {project.links.map((link) => <CardLink key={link.href} link={link} />)}
                    </div>
                )}
            </header>
            <div className="slop-card-body">
                <div className="slop-card-text">
                    <p className="slop-card-lede"><Words value={project.tagline} links /></p>
                    <Story entry={project} headings={headings} />
                    <Stats id={project.id} />
                </div>
                <figure className={`slop-card-visual slop-visual-${project.visual}`}>
                    <Visual project={project} />
                    {plain(project.caption ?? '') && <figcaption><Words value={project.caption} links /></figcaption>}
                </figure>
            </div>
        </article>
    );
}

// A game or an article, in its section's grid: a preview, its name and its short description, which open on a click
// into the same story as a project's, and the button to the page itself
function EntryCard({ item, color, headings, lit, picked }) {
    const [open, setOpen] = useState(false);
    const more = `slop-${item.id}-more`;
    const opens = { href: item.href, target: '_blank', rel: 'noopener noreferrer' };
    return (
        <article
            className={`slop-card slop-entry${open ? ' slop-entry-open' : ''}${lit ? ' slop-card-lit' : ''}${picked.size && carries(item, picked) ? ' slop-picked' : ''}`}
            id={`slop-${item.id}`}
            style={{ '--c': item.color ?? color }}
        >
            {/* the whole face is the button's to click (see .slop-entry-toggle::after), except the way in: that's
                there from the start, no opening or scrolling needed */}
            <div className="slop-entry-face">
                <div className="slop-entry-preview"><Shot entry={item} /></div>
                <div className="slop-entry-text">
                    <header>
                        <h3>
                            <span className="slop-card-tab" aria-hidden="true" />
                            <button className="slop-entry-toggle" aria-expanded={open} aria-controls={more} onClick={() => setOpen(!open)}>
                                <Words value={item.title} />
                            </button>
                            <span className="slop-entry-chevron" aria-hidden="true" />
                        </h3>
                        <p className="slop-card-sub"><Words value={item.when} /></p>
                        <Labels labels={item.labels} picked={picked} />
                    </header>
                    <p className="slop-card-lede"><Words value={item.tagline} /></p>
                    <a className="slop-button slop-button-primary slop-entry-go" {...opens}><Words value={item.open} /> ↗</a>
                </div>
            </div>
            <div className="slop-entry-text slop-entry-more" id={more} hidden={!open}>
                <Story entry={item} headings={headings} />
                <Stats id={item.id} />
                {item.links.length > 0 && (
                    <div className="slop-entry-actions">
                        <div className="slop-card-links">
                            {item.links.map((link) => <CardLink key={link.href} link={link} />)}
                        </div>
                    </div>
                )}
            </div>
        </article>
    );
}

// The page's sections, in order: one per category of projects (one category per project, for now; labels are
// on top of that), the categories in the order they first appear, and one per section of games or articles
function sections(projects) {
    const out = [];
    projects.forEach((project) => {
        if (project.items) {
            out.push({ key: `collection-${project.id}`, collection: project, projects: [project] });
            return;
        }
        const name = plain(project.category);
        const section = out.find((s) => !s.collection && s.name === name);
        if (section) section.projects.push(project);
        else out.push({ key: `category-${name}`, name, label: project.category, projects: [project] });
    });
    return out;
}

// the labels you can pick: what carries any of them lights up, in the bar, the dock and the cards below
function LabelPicker({ labels, picked, onPick, onClear }) {
    return (
        <div className="slop-label-bar" role="group" aria-label="Labels">
            <span className="slop-label-bar-title">Labels</span>
            {labels.map((label) => (
                <button key={label.key} className="slop-label-pick" aria-pressed={picked.has(label.key)} onClick={() => onPick(label.key)}>
                    {label.name}<span className="slop-label-count">{label.count}</span>
                </button>
            ))}
            {picked.size > 0 && <button className="slop-label-clear" onClick={onClear}>Clear</button>}
        </div>
    );
}

function SlopZone({ text, savedText, onEdit, onLeave, leaveRef }) {
    const [lit, setLit] = useState(null); // the card a tile just jumped to
    const [picked, setPicked] = useState(() => new Set()); // labels picked in the bar: their projects light up
    const [editing, setEditing] = useState(false);
    const [pastBar, setPastBar] = useState(false); // scrolled below the bar, so the top row needs its own edge
    const barRef = useRef(null);
    const topbarRef = useRef(null);
    const dockRef = useRef(null);
    const innerRef = useRef(null);
    const { intro, headings, projects } = text;
    const groups = sections(projects);
    const labels = allLabels(projects);
    const yours = share(allTexts(text));
    const pick = (key) => setPicked((now) => {
        const next = new Set(now);
        if (!next.delete(key)) next.add(key);
        return next;
    });

    useEffect(() => { // Esc closes the text panel first, then leaves
        const handleKey = (e) => {
            if (e.key !== 'Escape') return;
            if (editing) setEditing(false);
            else onLeave();
        };
        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
    });

    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => setPastBar(!entry.isIntersecting),
            { rootMargin: '-72px 0px 0px 0px' }
        );
        observer.observe(barRef.current);
        return () => observer.disconnect();
    }, []);

    useEffect(() => { // where the top row and the dock end, for jumps to land below: they change with the window
        let frame;
        const measure = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => {
                const bottom = topbarRef.current.offsetHeight + dockRef.current.offsetHeight;
                innerRef.current.style.setProperty('--dock-bottom', `${bottom}px`);
            });
        };
        const observer = new ResizeObserver(measure);
        observer.observe(topbarRef.current);
        observer.observe(dockRef.current);
        return () => {
            observer.disconnect();
            cancelAnimationFrame(frame);
        };
    }, []);

    useEffect(() => {
        if (lit === null) return;
        const timer = setTimeout(() => setLit(null), 1800);
        return () => clearTimeout(timer);
    }, [lit]);

    function jumpTo(id) {
        document.getElementById(`slop-${id}`).scrollIntoView({ behavior: 'smooth', block: 'start' });
        setLit(id);
    }

    return (
        <div className={`slop-inner${editing ? ' slop-inner-editing' : ''}${picked.size ? ' slop-picking' : ''}`} ref={innerRef}>
            <div className={`slop-topbar${pastBar ? ' slop-topbar-edge' : ''}`} ref={topbarRef}>
                <div className="slop-topbar-row">
                    <span className="slop-wordmark"><Words value={intro.title} /></span>
                    <div className="slop-topbar-actions">
                        {EDITING && (
                            <button className="slop-button" onClick={() => setEditing(!editing)} aria-pressed={editing}>
                                Edit text
                            </button>
                        )}
                        <button ref={leaveRef} className="slop-button slop-leave" onClick={onLeave}>
                            <span aria-hidden="true">←</span> Leave <Words value={intro.title} /> <kbd>Esc</kbd>
                        </button>
                    </div>
                </div>
                {/* once the bar is scrolled past, a slim copy of it hangs under the top row: every project to jump
                    to, and the labels. It floats over the page, so nothing moves when it shows */}
                <div className={`slop-dock${pastBar ? ' slop-dock-on' : ''}`} ref={dockRef} aria-hidden={!pastBar}>
                    <div className="slop-dock-inner">
                        <div className="slop-dock-row">
                            <span className="slop-dock-title"><Words value={intro.overviewTitle} /></span>
                            <ol className="slop-dock-tiles">
                                {groups.flatMap((group) => group.projects).map((project) => (
                                    <li
                                        key={project.id}
                                        style={{ '--c': project.color }}
                                        className={picked.size && carries(project, picked) ? 'slop-picked' : undefined}
                                    >
                                        <button className="slop-dock-tile" onClick={() => jumpTo(project.id)} tabIndex={pastBar ? 0 : -1}>
                                            <Thumb project={project} />
                                            <Words value={project.title} />
                                        </button>
                                    </li>
                                ))}
                            </ol>
                        </div>
                        <LabelPicker labels={labels} picked={picked} onPick={pick} onClear={() => setPicked(new Set())} />
                    </div>
                </div>
            </div>

            {/* the bar: part of the top band, every project at a glance, by category */}
            <nav className="slop-bar" ref={barRef} aria-label={readable(intro.overviewTitle)}>
                <div className="slop-bar-inner">
                    {/* what the zone is and which color is whose, set apart from the jump-to tiles below by a rule */}
                    <div className="slop-intro">
                        <p className="slop-disclaimer"><Words value={intro.disclaimer} links /></p>
                        <p className="slop-color-key"><Words value={intro.colorKey} links /></p>
                    </div>
                    <div className="slop-bar-head">
                        <h2><Words value={intro.overviewTitle} /></h2>
                        <span><Words value={intro.overviewNote} /></span>
                        <span className="slop-legend">
                            <span className="slop-mine">My words</span>
                            <span className="slop-ai">AI-generated</span>
                            {EDITING && <span>{percent(yours.fraction)} mine so far</span>}
                        </span>
                    </div>
                    <LabelPicker labels={labels} picked={picked} onPick={pick} onClear={() => setPicked(new Set())} />
                    <div className="slop-bar-groups">
                        {groups.map((group) => (
                            <div
                                className="slop-bar-group"
                                key={group.key}
                                style={{ flexGrow: group.projects.length, flexBasis: `${group.projects.length * 170}px`, '--n': group.projects.length }}
                            >
                                {/* a section of games or articles is a tile of its own, named on the tile */}
                                <span className="slop-bar-label">{group.label ? <Words value={group.label} /> : '\u00a0'}</span>
                                <ol className="slop-tiles">
                                    {group.projects.map((project) => (
                                        <li
                                            key={project.id}
                                            style={{ '--c': project.color }}
                                            className={picked.size && carries(project, picked) ? 'slop-picked' : undefined}
                                        >
                                            <button className="slop-tile" onClick={() => jumpTo(project.id)}>
                                                <Thumb project={project} />
                                                <span className="slop-tile-who">
                                                    <span className="slop-tile-name"><Words value={project.title} /></span>
                                                    <span className="slop-tile-by"><Words value={project.tagline} /></span>
                                                </span>
                                            </button>
                                        </li>
                                    ))}
                                </ol>
                            </div>
                        ))}
                    </div>
                </div>
            </nav>

            <main className="slop-main">
                {groups.map((group) => group.collection ? (
                    <section
                        className="slop-category slop-collection"
                        key={group.key}
                        id={`slop-${group.collection.id}`}
                        aria-label={readable(group.collection.title)}
                    >
                        <h2 className="slop-category-title"><Words value={group.collection.title} /></h2>
                        <p className="slop-collection-lede"><Words value={group.collection.tagline} links /></p>
                        <div className="slop-grid">
                            {group.collection.items.map((item) => (
                                <EntryCard
                                    key={item.id}
                                    item={item}
                                    color={group.collection.color}
                                    headings={headings}
                                    lit={lit === item.id}
                                    picked={picked}
                                />
                            ))}
                        </div>
                    </section>
                ) : (
                    <section className="slop-category" key={group.key} aria-label={group.name}>
                        <h2 className="slop-category-title">
                            <Words value={group.label} />
                            <span className="slop-category-count">{group.projects.length === 1 ? '1 project' : `${group.projects.length} projects`}</span>
                        </h2>
                        {group.projects.map((project) => (
                            <ProjectCard key={project.id} project={project} headings={headings} lit={lit === project.id} picked={picked} />
                        ))}
                    </section>
                ))}

                <footer className="slop-footer">
                    <p>That’s everything in the rupture, for now.</p>
                    <button className="slop-button slop-leave" onClick={onLeave}>
                        <span aria-hidden="true">←</span> Leave <Words value={intro.title} />
                    </button>
                </footer>
            </main>

            {editing && (
                <SlopEditor
                    text={text}
                    savedText={savedText}
                    onEdit={onEdit}
                    onClose={() => setEditing(false)}
                    onShowProject={jumpTo}
                />
            )}
        </div>
    );
}

export default SlopZone;
