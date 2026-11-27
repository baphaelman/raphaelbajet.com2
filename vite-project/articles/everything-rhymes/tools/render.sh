#!/bin/zsh
# Render one moment of the page headlessly and report script errors / warnings.
#
#   tools/render.sh NAME STOP [W,H] [JS]
#
# STOP is an index into the page's `stops` (every step × build), or -1 for the appendix. The frame loop is
# forced onto it through the `/* @render-hook */` marker, and only that step's card is shown, so it's on screen
# without scrolling. JS (optional) runs 300 ms after load, e.g. "document.documentElement.dataset.theme='light';
# redraw()" or "runSong({...})". The test copy has slop-editor inlined (../page.py), and the engine and the
# dictionary from cache/ inlined as plain scripts (run tools/corpus.mjs once first), since module imports don't
# work from file://. Reduced motion is forced, so layers land at once. BUDGET=ms raises the virtual time.
# Output: shots/NAME.png, shots/NAME.dom, and one line: OK or ERR ... .
set -e
cd "$(dirname "$0")/.."
NAME=$1; STOP=$2; WIN=${3:-1400,900}; JS=${4:-}
W=${WIN%,*}; H=${WIN#*,}
BRAVE="/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"
run() { perl -e 'alarm 90; exec @ARGV' "$BRAVE" "$@"; }   # no hung runs
mkdir -p shots
python3 - "$NAME" "$STOP" "$JS" <<'PY'
import re, sys
sys.path.insert(0, '..')
from page import page
name, stop, js = sys.argv[1:4]
s = page('everything-rhymes')
hook = '/* @render-hook */'
assert s.count(hook) == 1, 'render hook marker missing from everything-rhymes.html'
s = s.replace(hook, 'if (window.__force != null) { const st = stops[__force]; activeIdx = st.i; activeBuild = st.b; glide = null; } else', 1)
# show only the current step's card, at the top, so it's on screen without scrolling (the appendix: only it)
only = ('<style>.step:not(.cur){display:none!important}.step.cur{min-height:100vh!important;align-items:center!important}'
        '.step.cur .card{position:static!important}.after{display:none}</style>')
if int(stop) == -1: only = '<style>.scrolly{display:none}</style>'
s = s.replace('</head>', only + '</head>', 1)
inl = lambda code: code.replace('</script', '<\\/script')
eng = re.search(r'<script src="https://cdn\.jsdelivr\.net/gh/baphaelman/rhyme-xray@[0-9a-f]{40}/engine\.js"></script>', s).group(0)
s = s.replace(eng, '<script>' + inl(open('cache/engine.cjs').read()) + '</script>', 1)
dic = open('cache/dictionary.mjs').read().replace('export const dictionary', 'window.__DICT', 1)
s = s.replace('<script src="/slop/slop.js">', '<script>' + inl(dic) + '</script><script src="/slop/slop.js">', 1) if '<script src="/slop/slop.js">' in s else s.replace('<script id="slop-js">', '<script>' + inl(dic) + '</script><script id="slop-js">', 1)
assert s.count('import(DICT_URL)') == 1
s = s.replace('import(DICT_URL)', 'Promise.resolve({dictionary: window.__DICT})', 1)
probe = ('<script>window.__errs=[];onerror=(m,s,l)=>{__errs.push(m+" @"+l)};'
         'addEventListener("unhandledrejection",e=>__errs.push("rejection "+e.reason));'
         'for(const k of ["warn","error"]){const o=console[k];console[k]=(...a)=>{__errs.push(k+": "+a.join(" "));o(...a)}}'
         'setInterval(()=>{document.title=__errs.length?"ERR "+__errs.join(" | "):"OK"},100)</script>')
s = s.replace('<head>', '<head>' + probe, 1)
s = s.replace('</body>', '<script>window.__force=%s;setTimeout(()=>{%s},300)</script></body>' % ('stops.length - 1' if int(stop) == -1 else stop, js), 1)
open(f'shots/t_{name}.html', 'w').write(s)
raf = '<script>window.requestAnimationFrame=cb=>setTimeout(()=>cb(performance.now()),33)</script>'
open(f'shots/d_{name}.html', 'w').write(s.replace('<head>', '<head>' + raf, 1))
PY
URL=file://$PWD/shots
FLAGS=(--force-prefers-reduced-motion --headless=new --use-angle=swiftshader --enable-unsafe-swiftshader --hide-scrollbars --virtual-time-budget=${BUDGET:-6000})
if (( W < 500 )); then
  print "<body style='margin:0;background:#777'><iframe src='t_$NAME.html' style='width:${W}px;height:${H}px;border:0'></iframe>" > shots/f_$NAME.html
  run $FLAGS --window-size=500,$H --screenshot="shots/$NAME.png" "$URL/f_$NAME.html" >/dev/null 2>&1
  run $FLAGS --window-size=500,$H --dump-dom "$URL/d_$NAME.html" 2>/dev/null > shots/$NAME.dom
else
  rm -f shots/f_$NAME.html
  run $FLAGS --window-size=$WIN --screenshot="shots/$NAME.png" "$URL/t_$NAME.html" >/dev/null 2>&1
  run $FLAGS --window-size=$WIN --dump-dom "$URL/d_$NAME.html" 2>/dev/null > shots/$NAME.dom
fi
grep -o '<title>[^<]*' shots/$NAME.dom | head -1 | sed 's/<title>//'
