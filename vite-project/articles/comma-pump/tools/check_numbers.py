#!/usr/bin/env python3
"""Check every number the page prints against an independent Python computation.

    python3 tools/check_numbers.py

Renders the page once (tools/render.sh), reads the data-k spans and the
appendix tables from the DOM, and compares them with values computed here from
first principles (fractions, logs, and published Werckmeister III cents).
"""
import math, re, subprocess, sys
from fractions import Fraction as F
from pathlib import Path

root = Path(__file__).resolve().parent.parent
status = subprocess.run(['tools/render.sh', 'numbers', '0'], cwd=root, capture_output=True, text=True).stdout.strip()
dom = (root / 'shots/numbers.dom').read_text()
if status != 'OK':
    sys.exit(f'page reported: {status}')

def cents(r): return 1200 * math.log2(r)
def f1(x): return f'{abs(x):.1f}'.replace('-', '')
P5, M3, m3 = F(3, 2), F(5, 4), F(6, 5)
pyth = P5**12 / 2**7
synt = P5**4 / (4 * M3)
diesis = 2 / M3**3
mt5 = cents(P5) - cents(synt) / 4
wolf = 7 * 1200 - 11 * mt5
et3 = 400.0
expect = {
    'fifthC': f1(cents(P5)), 'thirdC': f1(cents(M3)), 'etThirdC': f1(et3),
    'etThirdBeat': f1(abs(5 * 220 - 4 * 220 * 2 ** (4 / 12))),
    'f12': f'{(P5**12).numerator}/{(P5**12).denominator}', 'pythFrac': f'{pyth.numerator}/{pyth.denominator}', 'pythC': f1(cents(pyth)),
    't3': '125/64', 'diesisFrac': f'{diesis.numerator}/{diesis.denominator}', 'diesisC': f1(cents(diesis)),
    'pumpFrac': f'{(1/synt).numerator}/{(1/synt).denominator}', 'pumpC': f1(cents(synt)),
    'semiLoops': str(math.ceil(100 / cents(synt))),
    'jumpNote': 'A', 'jumpFrac': f'{synt.numerator}/{synt.denominator}', 'jumpC': f1(cents(synt)),
    'etThirdOff': f1(et3 - cents(M3)), 'etFifthOff': f1(cents(P5) - 700),
    'mtFifthOff': f1(cents(synt) / 4), 'wolfName': 'G♯ up to E♭', 'wolfC': f1(wolf), 'wolfOff': f1(wolf - cents(P5)),
    'pythThirdOff': f1(cents(F(81, 64)) - cents(M3)),
    'f4': '(3/2)⁴ = 81/16', 'o2t': '2² × 5/4 = 5 = 80/16',
}
got = dict(re.findall(r'data-k="(\w+)">([^<]*)<', dom))
bad_ = []
for k, v in expect.items():
    if got.get(k) != v: bad_.append(f'{k}: page {got.get(k)!r}, expected {v!r}')
for k in got:
    if k not in expect and k not in ('jiGood', 'jiBad', 'jiD', 'mtGood', 'mtBad', 'pythSchis'): bad_.append(f'{k}: on the page but not checked here')

# Appendix: commas (3 decimals) and the five tunings (1 decimal)
def rows(table_id):
    m = re.search(rf'<table[^>]*id="{table_id}"[^>]*>(.*?)</table>', dom, re.S)
    return [re.findall(r'<td[^>]*>(.*?)</td>', r) for r in re.findall(r'<tr>(.*?)</tr>', m.group(1)) if '<td' in r]
commas = {'Pythagorean comma': pyth, 'Syntonic comma': synt, 'Lesser diesis': diesis, 'Greater diesis': m3**4 / 2, 'Schisma': pyth / synt}
for name, ratio_s, cents_s in ((r[0], r[2], r[3]) for r in rows('tab-commas')):
    q = commas[name]
    if ratio_s != f'{q.numerator}/{q.denominator}' or cents_s != f'{cents(q):.3f}': bad_.append(f'comma {name}: page {ratio_s} {cents_s}')
ji = [F(1), F(16, 15), F(9, 8), F(6, 5), F(5, 4), F(4, 3), F(45, 32), F(3, 2), F(8, 5), F(5, 3), F(9, 5), F(15, 8)]
chain = lambda f5: {(7 * k) % 12: (sum(f5(j) for j in range(k)) if k > 0 else -sum(f5(j) for j in range(k, 0))) % 1200 for k in range(-3, 9)}
tunings = [
    [cents(r) for r in ji],
    [chain(lambda j: cents(P5))[pc] for pc in range(12)],
    [chain(lambda j: mt5)[pc] for pc in range(12)],
    [0, 90.2, 192.2, 294.1, 390.2, 498.0, 588.3, 696.1, 792.2, 888.3, 996.1, 1092.2],   # Werckmeister III, published values
    [100 * pc for pc in range(12)],
]
for pc, r in enumerate(rows('tab-tunings')):
    for t, cell in enumerate(r[1:]):
        if abs(float(cell) - tunings[t][pc]) > 0.051: bad_.append(f'tuning {t} pc {pc}: page {cell}, expected {tunings[t][pc]:.1f}')
# Key quality from the tuning tables above: a triad is unusable when its third is >= 17 c off or its fifth >= 9 c off
def triads(T): return [((T[(r + 4) % 12] - T[r]) % 1200 - cents(M3), (T[(r + 7) % 12] - T[r]) % 1200 - cents(P5)) for r in range(12)]
def bad(T): return [max(abs(a) / 34, abs(b) / 18) >= 0.5 for a, b in triads(T)]
ji_bad, mt_bad = bad(tunings[0]), bad(tunings[2])
for k, v in {'jiGood': str(12 - sum(ji_bad)), 'jiBad': str(sum(ji_bad)), 'jiD': 'D major among them' if ji_bad[2] else 'D major not among them',
             'mtGood': str(12 - sum(mt_bad)), 'mtBad': str(sum(mt_bad)), 'pythSchis': str(sum(abs(a) < 3 for a, _ in triads(tunings[1])))}.items():
    expect[k] = v
    if got.get(k) != v: bad_.append(f'{k}: page {got.get(k)!r}, expected {v!r}')
print('\n'.join(bad_) if bad_ else f'numbers: all {len(expect)} quoted figures, {len(commas)} commas and 60 tuning cells match')
sys.exit(1 if bad_ else 0)
