#!/bin/zsh
# Render one moment of the page headlessly and report script errors / warnings.
#
#   tools/render.sh NAME STOP [W,H] [JS]
#
# STOP is an index into the page's `stops` (every step × build, then the
# appendix); the frame loop is forced onto it through the `/* @render-hook */`
# marker, so no scrolling is needed. JS (optional) runs 300 ms after load.
# The DOM-dump pass loads a copy whose requestAnimationFrame runs on timers,
# because headless fires no rAF there and frame() errors would go unseen.
# Widths under 500 px are shot through an iframe, because headless Brave will
# not make a window narrower than 500 px.
# Output: shots/NAME.png, shots/NAME.dom, and one line: OK or ERR ... .
set -e
cd "$(dirname "$0")/.."
NAME=$1; STOP=$2; WIN=${3:-1400,900}; JS=${4:-}
W=${WIN%,*}; H=${WIN#*,}
BRAVE="/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"
run() { perl -e 'alarm 90; exec @ARGV' "$BRAVE" "$@"; }   # no hung runs
mkdir -p shots
python3 - "$NAME" "$STOP" "$JS" <<'PY'
import sys
sys.path.insert(0, '..')
from page import page
name, stop, js = sys.argv[1:4]
s = page('comma-pump')
hook = '/* @render-hook */'
assert s.count(hook) == 1, 'render hook marker missing from comma-pump.html'
s = s.replace(hook, 'if (window.__force != null) { const st = stops[__force]; activeIdx = st.i; activeBuild = st.b; glide = null; } else', 1)
probe = ('<script>window.__errs=[];onerror=(m,s,l)=>{__errs.push(m+" @"+l)};'
         'addEventListener("unhandledrejection",e=>__errs.push("rejection "+e.reason));'
         'for(const k of ["warn","error"]){const o=console[k];console[k]=(...a)=>{__errs.push(k+": "+a.join(" "));o(...a)}}'
         'setInterval(()=>{document.title=__errs.length?"ERR "+__errs.join(" | "):"OK"},100)</script>')
s = s.replace('<head>', '<head>' + probe, 1)
s = s.replace('</body>', '<script>window.__force=%s;setTimeout(()=>{%s},300)</script></body>' % (stop, js), 1)
open(f'shots/t_{name}.html', 'w').write(s)
# DOM-dump copy: frames driven by timers (headless fires no rAF in that pass), so frame() runs too
raf = '<script>window.requestAnimationFrame=cb=>setTimeout(()=>cb(performance.now()),33)</script>'
open(f'shots/d_{name}.html', 'w').write(s.replace('<head>', '<head>' + raf, 1))
PY
FLAGS=(--headless=new --use-angle=swiftshader --enable-unsafe-swiftshader --hide-scrollbars --virtual-time-budget=${BUDGET:-4000})
if (( W < 500 )); then
  print "<body style='margin:0;background:#777'><iframe src='t_$NAME.html' style='width:${W}px;height:${H}px;border:0'></iframe>" > shots/f_$NAME.html
  run $FLAGS --window-size=500,$H --screenshot="shots/$NAME.png" "file://$PWD/shots/f_$NAME.html" >/dev/null 2>&1
  run $FLAGS --window-size=500,$H --dump-dom "file://$PWD/shots/d_$NAME.html" 2>/dev/null > shots/$NAME.dom
else
  rm -f shots/f_$NAME.html
  run $FLAGS --window-size=$WIN --screenshot="shots/$NAME.png" "file://$PWD/shots/t_$NAME.html" >/dev/null 2>&1
  run $FLAGS --window-size=$WIN --dump-dom "file://$PWD/shots/d_$NAME.html" 2>/dev/null > shots/$NAME.dom
fi
grep -o '<title>[^<]*' shots/$NAME.dom | head -1 | sed 's/<title>//'
