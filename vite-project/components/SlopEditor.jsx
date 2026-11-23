import { useState, useEffect, useId } from 'react';
import {
    plain, readable, applyEdit, reslop, unslop, share, allTexts, entryTexts, percent, getAt, entryTextPaths, headTextPaths, textPaths,
} from '/components/slopText.js';

// a copy of `text` with the value at `path` (a list of keys and indexes) replaced
function setAt(text, path, value) {
    const next = structuredClone(text);
    let node = next;
    path.slice(0, -1).forEach((key) => { node = node[key]; });
    node[path[path.length - 1]] = value;
    return next;
}

// a copy of `text` with the texts at `paths` re-slopified or unslopified: their words change author, not wording
function reattributed(text, paths, how) {
    const next = structuredClone(text);
    paths.forEach((path) => {
        const parent = getAt(next, path.slice(0, -1));
        parent[path[path.length - 1]] = how(parent[path[path.length - 1]]);
    });
    return next;
}

// Re-slopify (your words become an agent's) and unslopify (an agent's words, approved as they are, become yours)
// for some texts. Facts and quotes stay as they are. A button with nothing to change is faded. For more than one
// field (`what` names them), each asks first
function Reattribute({ values, onChange, what, small }) {
    const { fraction, letters } = share(values);
    const run = (how, question) => () => {
        if (!what || window.confirm(question)) onChange(how);
    };
    return (
        <span className={`slop-reattribute${small ? ' slop-reattribute-small' : ''}`}>
            <button
                type="button"
                className="slop-reslop"
                disabled={!letters || fraction === 1}
                onClick={run(unslop, `Approve all of the AI's words in ${what} as yours?`)}
                title="Approve the AI's words here as yours"
            >
                {what ? `Unslopify ${what}` : 'unslopify'}
            </button>
            <button
                type="button"
                className="slop-reslop"
                disabled={fraction === 0}
                onClick={run(reslop, `Mark all of your words in ${what} as AI-generated?`)}
                title="Mark your words here as AI-generated"
            >
                {what ? `Re-slopify ${what}` : 're-slopify'}
            </button>
        </span>
    );
}

// A text field that keeps track of who wrote what: what you type is yours (slopText.js). Addresses aren't
// anyone's words, so they're `untracked`. A link goes in as [label](address)
function Field({ label, value, onChange, long, list, untracked }) {
    const shown = untracked ? value : plain(value);
    const change = (e) => onChange(untracked ? e.target.value : applyEdit(value, e.target.value));
    const { fraction } = untracked ? { fraction: 0 } : share([value]);
    const id = useId();
    // the label names the box alone: the buttons beside it stay out of it
    return (
        <div className="slop-field">
            <span className="slop-field-label">
                <label htmlFor={id}>{label}</label>
                {fraction > 0 && <span className="slop-field-mine">{fraction === 1 ? 'yours' : `${percent(fraction)} yours`}</span>}
                {!untracked && <Reattribute values={[value]} onChange={(how) => onChange(how(value))} small />}
            </span>
            {long ? (
                <textarea id={id} value={shown} onChange={change} rows={Math.max(2, Math.ceil(shown.length / 46))} />
            ) : (
                <input id={id} value={shown} onChange={change} list={list} />
            )}
        </div>
    );
}

// texts you can add to and remove from: paragraphs, labels
function TextList({ name, values, onChange, long }) {
    return (
        <>
            {values.map((value, i) => (
                <div className="slop-field-removable" key={i}>
                    <Field
                        label={`${name} ${i + 1}`}
                        value={value}
                        onChange={(next) => onChange(values.map((v, j) => (j === i ? next : v)))}
                        long={long}
                    />
                    <button
                        className="slop-button slop-remove"
                        onClick={() => onChange(values.filter((_, j) => j !== i))}
                        aria-label={`Remove ${name.toLowerCase()} ${i + 1}`}
                    >
                        Remove
                    </button>
                </div>
            ))}
            <button className="slop-button" onClick={() => onChange([...values, ''])}>+ Add {name.toLowerCase()}</button>
        </>
    );
}

// one project's fields, or one game's or article's, in the order they read on the page
function EntryFields({ entry, at, headings }) {
    return (
        <>
            <div className="slop-field-pair">
                <Field label="Title" value={entry.title} onChange={at('title')} />
                {'category' in entry && <Field label="Category" value={entry.category} onChange={at('category')} list="slop-categories" />}
            </div>
            <div className="slop-field-pair">
                <Field label="When" value={entry.when} onChange={at('when')} />
                {'status' in entry && <Field label="Status" value={entry.status} onChange={at('status')} />}
            </div>
            <h3>Labels</h3>
            <div className="slop-field-labels">
                <TextList name="Label" values={entry.labels} onChange={at('labels')} />
            </div>
            <Field label="Short description" value={entry.tagline} onChange={at('tagline')} long />

            <h3>{readable(headings.what)}</h3>
            <TextList name="Paragraph" values={entry.what} onChange={at('what')} long />
            <h3>{readable(headings.how)}</h3>
            <TextList name="Paragraph" values={entry.how} onChange={at('how')} long />
            <h3>{readable(headings.role)}</h3>
            <TextList name="Paragraph" values={entry.role} onChange={at('role')} long />

            {(entry.href || entry.links.length > 0) && <h3>Links</h3>}
            {entry.href && (
                <div className="slop-field-pair">
                    <Field label="Open button" value={entry.open} onChange={at('open')} />
                    <Field label="Address" value={entry.href} onChange={at('href')} untracked />
                </div>
            )}
            {entry.links.map((link, i) => (
                <div className="slop-field-pair" key={i}>
                    <Field label={link.icon ? `Label (${link.icon} icon: read aloud, and shown on hover)` : 'Label'} value={link.label} onChange={at('links', i, 'label')} />
                    <Field label="Address" value={link.href} onChange={at('links', i, 'href')} untracked />
                </div>
            ))}

            <h3>Picture</h3>
            {'caption' in entry && <Field label="Caption" value={entry.caption} onChange={at('caption')} long />}
            {'imageAlt' in entry && (
                <Field label="Image description (for screen readers)" value={entry.imageAlt} onChange={at('imageAlt')} long />
            )}
            {entry.prs && entry.prs.map((pr, i) => (
                <Field key={pr.href} label={`Pull request ${i + 1}`} value={pr.title} onChange={at('prs', i, 'title')} long />
            ))}
        </>
    );
}

// The "Edit text" panel: every piece of text in the Slop Zone, changed live on the page, saved back to
// src/slopProjects.json by the dev server (vite.config.js). Only there while running `npm run edit`.
function SlopEditor({ text, savedText, onEdit, onClose, onShowProject }) {
    const [lastSaved, setLastSaved] = useState(() => JSON.stringify(savedText));
    const [status, setStatus] = useState(null); // 'saving', or an error message

    // the file changed and the page took it in (SlopRupture.jsx): what's unsaved is what differs from it now
    useEffect(() => setLastSaved(JSON.stringify(savedText)), [savedText]);

    const dirty = JSON.stringify(text) !== lastSaved;
    const categories = [...new Set(text.projects.filter((project) => !project.items).map((project) => plain(project.category)))];
    const yours = share(allTexts(text));
    const edit = (path) => (value) => onEdit(setAt(text, path, value));
    const reattribute = (paths) => (how) => onEdit(reattributed(text, paths, how));

    async function save() {
        setStatus('saving');
        try {
            const res = await fetch('/__slop-text', { method: 'POST', body: JSON.stringify(text) });
            // the file changed just before this save, and the page takes that in a moment later
            if (res.status === 409) throw new Error('the file changed as you saved. Your edits are still here: save again');
            if (!res.ok) throw new Error(await res.text());
            const saved = { ...text, version: Number(await res.text()) }; // the file's new version (vite.config.js)
            onEdit(saved);
            setLastSaved(JSON.stringify(saved));
            setStatus(null);
        } catch (e) {
            setStatus(`Couldn't save: ${e.message}`);
        }
    }

    useEffect(() => { // ⌘S / Ctrl+S saves, and unsaved edits ask before the page goes away
        const handleKey = (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                e.preventDefault();
                save();
            }
        };
        const handleUnload = (e) => {
            if (dirty) e.preventDefault();
        };
        document.addEventListener('keydown', handleKey);
        window.addEventListener('beforeunload', handleUnload);
        return () => {
            document.removeEventListener('keydown', handleKey);
            window.removeEventListener('beforeunload', handleUnload);
        };
    });

    let statusText = dirty ? 'Unsaved changes' : 'Saved to slopProjects.json';
    if (status === 'saving') statusText = 'Saving…';
    else if (status) statusText = status;

    return (
        <aside className="slop-editor" aria-label="Edit text">
            <div className="slop-editor-head">
                <div>
                    <h2>Edit text</h2>
                    <p className={`slop-editor-status${dirty ? ' slop-editor-dirty' : ''}`} role="status">{statusText}</p>
                </div>
                <div className="slop-editor-actions">
                    <button className="slop-button" onClick={() => onEdit(JSON.parse(lastSaved))} disabled={!dirty}>Discard</button>
                    <button className="slop-button slop-button-primary" onClick={save} disabled={!dirty}>Save</button>
                    <button className="slop-button" onClick={onClose} aria-label="Close the panel">×</button>
                </div>
            </div>

            {/* how much of the zone's text you've written yourself */}
            <div className="slop-coverage">
                <div className="slop-coverage-numbers">
                    <span><span className="slop-mine">Your words</span>: {percent(yours.fraction)} of the text</span>
                    <span>{yours.words === 1 ? '1 word' : `${yours.words.toLocaleString()} words`}</span>
                </div>
                <div className="slop-coverage-track" role="presentation">
                    <span style={{ width: `${yours.fraction * 100}%` }} />
                </div>
                <Reattribute values={allTexts(text)} onChange={reattribute(textPaths(text))} what="the whole zone" />
            </div>

            <div className="slop-editor-body">
                <datalist id="slop-categories">
                    {categories.map((category) => <option key={category} value={category} />)}
                </datalist>
                <details className="slop-editor-group" open>
                    <summary>
                        Rupture, intro and headings
                        <GroupShare values={headTextPaths(text).map((path) => getAt(text, path))} />
                    </summary>
                    <Reattribute
                        values={headTextPaths(text).map((path) => getAt(text, path))}
                        onChange={reattribute(headTextPaths(text))}
                        what="the rupture, intro and headings"
                    />
                    <Field label="Rupture title" value={text.rupture.title} onChange={edit(['rupture', 'title'])} />
                    <Field label="Rupture disclaimer" value={text.rupture.disclaimer} onChange={edit(['rupture', 'disclaimer'])} long />
                    <Field label="Zone title" value={text.intro.title} onChange={edit(['intro', 'title'])} />
                    <Field label="Disclaimer" value={text.intro.disclaimer} onChange={edit(['intro', 'disclaimer'])} long />
                    <Field label="Color key, below it" value={text.intro.colorKey} onChange={edit(['intro', 'colorKey'])} long />
                    <Field label="Overview title" value={text.intro.overviewTitle} onChange={edit(['intro', 'overviewTitle'])} />
                    <Field label="Overview note" value={text.intro.overviewNote} onChange={edit(['intro', 'overviewNote'])} />
                    <Field label="First heading in a card" value={text.headings.what} onChange={edit(['headings', 'what'])} />
                    <div className="slop-field-pair">
                        <Field label="Second heading" value={text.headings.how} onChange={edit(['headings', 'how'])} />
                        <Field label="Third heading" value={text.headings.role} onChange={edit(['headings', 'role'])} />
                    </div>
                </details>

                {text.projects.map((project, p) => {
                    const at = (...path) => edit(['projects', p, ...path]);
                    const paths = entryTextPaths(project).map((path) => ['projects', p, ...path]);
                    return (
                        <details
                            key={project.id}
                            className="slop-editor-group"
                            style={{ '--c': project.color }}
                            onToggle={(e) => e.currentTarget.open && onShowProject(project.id)}
                        >
                            <summary>
                                <span className="slop-editor-swatch" />{readable(project.title)}
                                <GroupShare values={entryTexts(project)} />
                            </summary>
                            <Reattribute values={entryTexts(project)} onChange={reattribute(paths)} what={readable(project.title)} />
                            {project.items ? (
                                <>
                                    <Field label="Section title" value={project.title} onChange={at('title')} />
                                    <Field label="Short description (tile and section)" value={project.tagline} onChange={at('tagline')} long />
                                    {project.items.map((item, i) => (
                                        <div className="slop-editor-item" key={item.id}>
                                            <h4>{readable(item.title)}</h4>
                                            <EntryFields
                                                entry={item}
                                                at={(...path) => at('items', i, ...path)}
                                                headings={text.headings}
                                            />
                                        </div>
                                    ))}
                                </>
                            ) : (
                                <EntryFields
                                    entry={project}
                                    at={at}
                                    headings={text.headings}
                                />
                            )}
                        </details>
                    );
                })}
            </div>
        </aside>
    );
}

// how much of a group's text is yours, beside its name
function GroupShare({ values }) {
    const { fraction } = share(values);
    return <span className={`slop-group-share${fraction > 0 ? ' slop-group-share-some' : ''}`}>{percent(fraction)} yours</span>;
}

export default SlopEditor;
