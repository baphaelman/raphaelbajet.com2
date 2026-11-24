from math import comb, factorial as f, e, exp
import random
n=12
naive = (1+sum(comb(n,k)*f(k-1) for k in range(2,n+1)))/f(n)
full  = (1+sum(comb(n,k)*f(k-1)*2**(k-1) for k in range(2,n+1)))/(f(n)*2**11)
print("naive free-start", naive, " full free-start", full)
print("per-k naive", [(k, round(comb(n,k)*f(k-1)/f(n)*100,3)) for k in range(2,13)])
print("per-k full", [(k, round(comb(n,k)*f(k-1)*2**(k-1)/(f(n)*2**11)*100,4)) for k in range(2,13)])
# fixed buffer: buffer cycle length uniform 1..12, rest fixed
fb_naive = sum(1/f(n-k) for k in range(1,n+1))/n
fb_full = sum(1/(f(n-k)*2**(n-k)) for k in range(1,n+1))/n
print("fixed buffer naive", fb_naive, "e/12", e/12, " full", fb_full, "sqrt(e)/12", exp(.5)/12)
# Monte Carlo on (perm, flips) with even flips
random.seed(1); N=400000; a=b=c=d=0
for _ in range(N):
    p=list(range(n)); random.shuffle(p)
    fl=[random.randint(0,1) for _ in range(n-1)]; fl.append(sum(fl)%2)
    seen=[0]*n; cyc=[]
    for i in range(n):
        if not seen[i]:
            c_=[];j=i
            while not seen[j]: seen[j]=1;c_.append(j);j=p[j]
            cyc.append(c_)
    nontriv=[x for x in cyc if len(x)>1]
    bad_or=[i for i in range(n) if p[i]==i and fl[i]]
    a+= len(nontriv)<=1
    b+= len(nontriv)<=1 and not bad_or
    buf=[x for x in cyc if 0 in x][0]
    c+= all(len(x)==1 for x in cyc if 0 not in x)
    d+= all(len(x)==1 for x in cyc if 0 not in x) and not any(fl[i] for i in range(n) if i not in buf)
print("MC", a/N, b/N, c/N, d/N)
# Exact answers as shown on the page (Cuber rows exclude the solved cube, k = 1).
from fractions import Fraction as Fr
mn = Fr(1 + sum(comb(n,k)*f(k-1) for k in range(2,13)), f(n))
mf = Fr(1 + sum(comb(n,k)*f(k-1)*2**(k-1) for k in range(2,13)), f(n)*2**11)
cn = sum(Fr(1, f(n-k)) for k in range(2,13)) / 12
cf = sum(Fr(1, f(n-k)*2**(n-k)) for k in range(2,13)) / 12
for label, v in [("Math, ignoring flips", mn), ("Math, counting flips", mf), ("Cuber, no cycle break", cn), ("Cuber, no break, no flip alg", cf)]:
    print(f"{label:32s} {str(v):30s} {float(v):.4%}")
