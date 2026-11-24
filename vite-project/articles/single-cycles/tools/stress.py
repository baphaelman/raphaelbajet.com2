#!/usr/bin/env python3
"""Random back-and-forth navigation over a run of stops, then check the cube settles exactly (edges and corners).

Usage: python3 tools/stress.py "scene:build,scene:build,..." [RUNS] [SEED]
Each run starts at a random stop, makes 6-14 presses (each to the next or previous stop, gaps 0.08-1.6 s, so many
land mid-animation), then settles for 14 s. Pass = near the last stop's state, corners match its cornerSet, no flying,
nothing left turning. Uses tools/drive.py.
"""
import sys, random, subprocess, json, os
stops = [tuple(x.split(':')) for x in sys.argv[1].split(',')]
runs = int(sys.argv[2]) if len(sys.argv) > 2 else 12; random.seed(int(sys.argv[3]) if len(sys.argv) > 3 else 1)
here = os.path.dirname(os.path.abspath(__file__)); bad = 0
for r in range(runs):
    k = random.randrange(len(stops)); t = 0.0; plan = [[0, stops[k][0], int(stops[k][1])]]; t = 2.5
    for _ in range(random.randint(6, 14)):
        k = max(0, min(len(stops) - 1, k + random.choice([-1, 1])))
        plan.append([round(t, 2), stops[k][0], int(stops[k][1])]); t += random.choice([0.08, 0.15, 0.3, 0.5, 0.9, 1.6])
    sc, b = stops[k]; fx = f"Object.assign({{}}, DEF, S['{sc}'].f({b}, 0))"
    ps = json.dumps(plan).replace('"', "'")
    out = subprocess.run(['python3', os.path.join(here, 'drive.py'), f's{r}', ps, fx + '.state', str(t + 14), fx + '.cornerSet'], capture_output=True, text=True).stdout.strip()
    try: d = json.loads(out); ok = d['near'] and d['corners'] is not False and not d['flyFrames'] and not d['turnNow'] and not d['anim']
    except Exception: d, ok = out, False
    bad += not ok
    print('ok ' if ok else 'BAD', ps if not ok else '', d if not ok else '')
print(f'{runs - bad}/{runs} passed')
