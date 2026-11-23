import { useEffect, useLayoutEffect, useReducer, useRef } from 'react';

// The slop editor (the slop-editor package on npm): vite.config.js puts its slop.js in the page, with the zone's
// words from src/slopText.json as the text block it reads. It's a classic script's global, so this hands it to the
// modules. A text is a plain string (an agent's words) or a list of pieces: a string (an agent's), {"me": "..."}
// (mine: typed in the editor, or dictated word for word), {"ok": "..."} (an agent's, approved as they are) or
// {"data": "..."} (a fact, or someone else's words quoted). Before 2026-11-23, approving wrote {"me": ...}, so older
// "me" pieces are typed or approved
/* global Slop */
export default Slop;

// the text at `path` ("algorhythms.what.p1"), or undefined, without the warning Slop.get gives for a missing one
export const textAt = (path) => path.split('.').reduce((node, key) => node?.[key], Slop.text);

// the text as it reads, in one string, for working things out (Slop.words is for what's shown: alt text and labels)
export const readable = (path) => Slop.readable(Slop.get(path));

// the keys of a group's texts that match `pattern`, in order: a part's paragraphs (p1, p2…), an entry's labels
export const keysOf = (path, pattern) => Object.keys(textAt(path) ?? {}).filter((key) => pattern.test(key));

// What readers see, picked in the editor ("Readers see", saved as `_show`): nothing, a pie of who wrote what, or
// that and the Slop-o-meter switch. vite.config.js puts its element in the page for slop.js to build when it
// starts; this moves it to wherever the hook's ref is, and back out when that goes
const meter = document.querySelector('[data-slop-meter]');
export function useMeter() {
    const ref = useRef(null);
    useLayoutEffect(() => {
        if (!meter) return undefined;
        ref.current.append(meter);
        return () => meter.remove();
    }, []);
    return ref;
}

// redraws after an edit in the editor (Slop.onChange takes no unsubscribe, so it's registered once, for all)
const redraws = new Set();
Slop.onChange(() => redraws.forEach((redraw) => redraw()));
export function useSlop() {
    const [, redraw] = useReducer((n) => n + 1, 0);
    useEffect(() => {
        redraws.add(redraw);
        return () => redraws.delete(redraw);
    }, []);
}
