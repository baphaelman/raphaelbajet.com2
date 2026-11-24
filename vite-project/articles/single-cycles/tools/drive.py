#!/usr/bin/env python3
"""Drive the page's frame loop synchronously (simulated time) and report state at the end.

Headless Brave runs too few animation frames to finish animations, so this builds shots/t_NAME.html from
single-cycles.html with (1) the same forced-scene PLAN hook as tools/render.sh, and (2) a loop that calls frame(ms)
every 16 ms of simulated time for SECONDS, then writes a JSON probe into <body data-st>.

Usage: python3 tools/drive.py NAME "PLAN" TARGET [SECONDS] [CORNERS]
  PLAN   e.g. "[[0,'tperm',0],[0.8,'tperm',1],[1.35,'tperm',0]]"  (seconds, scene, build)
  TARGET a state expression in page scope, e.g. SOLVED, DEMO, S.tperm.f(1, 0).state
  CORNERS optional setCubies() argument the corners should match, e.g. "S.tperm.f(1, 0).cornerSet" (adds "corners": ok?)
Prints: {"anim":..., "near": cube at TARGET?, "moved": corners off home, "flyFrames": frames of the old flying
         motion (should be 0), "xfFrames": frames of fade transitions, "turnNow": a layer left mid-turn?}
"""
import sys, re, subprocess, time, os, html
name, plan, target = sys.argv[1:4]; secs = float(sys.argv[4]) if len(sys.argv) > 4 else 10; corners = sys.argv[5] if len(sys.argv) > 5 else None
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); os.chdir(root)
sys.path.insert(0, '..'); from page import page
s = page('single-cycles')
anchor = "    const nAct = S[active].n, sk = activeIdx + '/' + activeBuild;"
assert anchor in s, 'anchor changed; update tools/drive.py and tools/render.sh'
hook = ("    if(!window.__t0)window.__t0=now; {const pl=" + plan + "; let pick=pl[0]; for(const x of pl) if(now-window.__t0>=x[0]) pick=x; "
        "if(pick[1]!==active){active=pick[1]; enterT=now;} activeBuild=pick[2]; activeIdx=stepEls.findIndex(s=>s.dataset.scene===active);}\n")
s = s.replace(anchor, hook + anchor)
i = s.rindex("    requestAnimationFrame(frame);\n  }")
s = s[:i] + "    if (!window.__sync) requestAnimationFrame(frame);\n" + s[i + len("    requestAnimationFrame(frame);\n"):]
cc = corners if corners else "undefined"
probe = os.environ.get("PROBE", "null")  # optional extra expression, reported as "probe"
drive = f"""  window.__sync = 1; let __fly = 0, __xf = 0;
  for (let ms = 16; ms < {int(secs * 1000)}; ms += 16) {{ frame(ms); if (xf) __xf++; if (anim && anim.steps.some(st => st.fly)) __fly++; }}
  const __cc = {cc};
  let __cok = null; if (__cc !== undefined) {{ const was = cubies.map(cb => [cb.p.clone(), cb.q.clone()]); setCubies(__cc || 'home');
    __cok = cubies.every((cb, i) => cb.p.distanceTo(was[i][0]) < 1e-3 && cb.q.angleTo(was[i][1]) < 1e-3); }}
  document.body.dataset.st = JSON.stringify({{anim: !!anim, near: near({target}), corners: __cok, moved: cubies.slice(0, 8).filter(cb => cb.p.distanceTo(cb.home) > 1e-3).length, flyFrames: __fly, xfFrames: __xf, turnNow: !!turnNow, probe: {probe}}});
"""
j = s.rindex("  requestAnimationFrame(frame);\n"); s = s[:j] + drive + s[j + len("  requestAnimationFrame(frame);\n"):]
os.makedirs('shots', exist_ok=True)
out = f'shots/t_{name}.html'
open(out, 'w').write('<!doctype html><html><head><meta charset="utf-8"><script>window.onerror=(m,s,l)=>{document.title="ERR "+m+" @"+l};</script></head><body>' + s + '</body></html>')
brave = "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"
p = subprocess.Popen([brave, '--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1400,900',
                      '--virtual-time-budget=3000', '--dump-dom', 'file://' + os.path.abspath(out)], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
try: dom = p.communicate(timeout=90)[0].decode()
except subprocess.TimeoutExpired: p.kill(); print('TIMEOUT (headless hang; retry)'); sys.exit(1)
err = re.search(r'<title>(ERR[^<]*)', dom); m = re.search(r'data-st="([^"]*)"', dom)
print(err.group(1) if err else html.unescape(m.group(1)) if m else 'no probe output')
