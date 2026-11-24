#!/bin/zsh
# Render one moment of the page headlessly and report script errors.
#
#   tools/render.sh NAME "PLAN" BUDGET_MS [W,H]
#
# PLAN is a JS array of [secondsFromStart, sceneName, buildIndex] entries; the
# page is forced into the latest entry whose time has passed, so you can script
# transitions, e.g.  "[[0,'swaps',0],[1.0,'swaps',1]]"  then shoot at 1450 ms to
# catch the first swap mid-flight.  Output: shots/NAME.png (+ "ERR ..." if a
# script error fired).  Headless virtual time runs few animation frames, so
# judge layout and end states here, not smoothness.
# PRE (env, optional): JS run in <head> before the page's scripts, e.g.
#   PRE="document.documentElement.dataset.theme='dark';localStorage.setItem('slop-o-meter','on')"
set -e
cd "$(dirname "$0")/.."
NAME=$1; PLAN=$2; BUDGET=${3:-2500}; WIN=${4:-1400,900}
BRAVE="/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"
run() { perl -e 'alarm 60; exec @ARGV' "$BRAVE" "$@"; }   # headless Brave sometimes hangs
mkdir -p shots
python3 - "$NAME" "$PLAN" "${PRE:-}" <<'EOF'
import sys
sys.path.insert(0, '..')
from page import page
name, plan, pre = sys.argv[1:4]
body = page('single-cycles')
anchor = "    const nAct = S[active].n, sk = activeIdx + '/' + activeBuild;"
assert anchor in body, "anchor line changed; update tools/render.sh"
hook = ("    if(!window.__t0)window.__t0=now; {const pl=" + plan + "; let pick=pl[0]; for(const x of pl) if(now-window.__t0>=x[0]) pick=x; "
        "if(pick[1]!==active){active=pick[1]; enterT=now;} activeBuild=pick[2]; activeIdx=stepEls.findIndex(s=>s.dataset.scene===active);}\n")
body = body.replace(anchor, hook + anchor)
# Same skeleton the Artifact publish step wraps around the file.
open(f'shots/t_{name}.html', 'w').write('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light}body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style><script>window.onerror=(m,s,l)=>{document.title="ERR "+m+" @"+l};for(const k of ["warn","error"]){const o=console[k];console[k]=(...a)=>{document.title="ERR "+k+": "+a.join(" ");o(...a)}};' + pre + '</script></head><body>' + body + '</body></html>')
EOF
FLAGS=(--headless=new --use-angle=swiftshader --enable-unsafe-swiftshader --window-size=$WIN --virtual-time-budget=$BUDGET)
run $FLAGS --hide-scrollbars --screenshot="shots/$NAME.png" "file://$PWD/shots/t_$NAME.html" >/dev/null 2>&1
run $FLAGS --dump-dom "file://$PWD/shots/t_$NAME.html" 2>/dev/null | grep -o "<title>ERR[^<]*" || echo "no script errors"
echo "shots/$NAME.png"
