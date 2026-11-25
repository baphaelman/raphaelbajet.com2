# Face-turn search on edges only (corners ignored: they're gray on the page). Meet-in-the-middle, numpy-vectorized.
# Usage: python3 tools/edge_search.py TARGET DEPTH [START]
#   TARGET / START: comma-separated "slot>home" pairs for misplaced pieces (no flips), e.g. "UR>DF,DF>FL,FL>UB,UB>UR"
#   (slot UR holds the piece whose home is DF ...). START defaults to solved. DEPTH 6 searches up to 12 moves (~8 s, ~2 GB peak).
# Prints the moves START -> TARGET. ALWAYS verify the result with the page's turnState (a mismatch means a convention bug).
# Same conventions as the page: slot vectors SV, a piece is flipped when its first sticker is off its slot's first face.
import numpy as np, math, sys, time
FV={'U':(0,1,0),'D':(0,-1,0),'F':(0,0,1),'B':(0,0,-1),'R':(1,0,0),'L':(-1,0,0)}
POS=['UR','UF','UL','UB','FR','FL','BL','BR','DR','DF','DL','DB']; IDX={n:i for i,n in enumerate(POS)}
SV=[tuple(a+b for a,b in zip(FV[p[0]],FV[p[1]])) for p in POS]
AX={'R':(0,1),'L':(0,-1),'U':(1,1),'D':(1,-1),'F':(2,1),'B':(2,-1)}
def rot(v,ax,ang):
    c=round(math.cos(ang)); s=round(math.sin(ang)); i,j=[(1,2),(2,0),(0,1)][ax]; o=list(v); o[i]=v[i]*c-v[j]*s; o[j]=v[i]*s+v[j]*c; return tuple(o)
MOVES=[f+q for f in 'RLUDFB' for q in ['',"'",'2']]
def table(m):
    ax,sg=AX[m[0]]; q=-1 if m[1:]=="'" else 2 if m[1:]=='2' else 1; ang=sg*(-math.pi/2)*q
    src=list(range(12)); x=[0]*12
    for i in range(12):
        if SV[i][ax]!=sg: continue
        j=SV.index(rot(SV[i],ax,ang)); src[j]=i; x[j]=0 if rot(FV[POS[i][0]],ax,ang)==FV[POS[j][0]] else 1
    return np.array(src),np.array(x,dtype=np.uint8)
T=[table(m) for m in MOVES]
W=(np.uint64(1)<<np.arange(0,60,5,dtype=np.uint64))
def enc(S): return (S.astype(np.uint64)*W).sum(axis=1)
def bfs(start, depth):
    layers=[(start[None,:].copy(), np.array([-1]), np.array([-1]))]; seen=enc(start[None,:])
    for d in range(depth):
        S=layers[-1][0]; outs=[];par=[];mv=[]
        for k,(src,x) in enumerate(T):
            N=S[:,src]; N[:,:] ^= x  # piece*2+flip: flip bit is bit 0
            outs.append(N); par.append(np.arange(len(S))); mv.append(np.full(len(S),k))
        N=np.concatenate(outs); P=np.concatenate(par); M=np.concatenate(mv)
        c=enc(N); u,idx=np.unique(c,return_index=True); keep=idx[~np.isin(u,seen)]
        layers.append((N[keep],P[keep],M[keep])); seen=np.union1d(seen,c[keep])
        print('depth',d+1,len(keep),file=sys.stderr,flush=True)
    return layers
def path(layers, d, i):
    out=[]
    while d>0: _,P,M=layers[d]; out.append(M[i]); i=P[i]; d-=1
    return out[::-1]
inv=lambda m: m if m.endswith('2') else (m[0] if m.endswith("'") else m+"'")
def solve(target, D, start=None):
    solved=start if start is not None else np.array([2*i for i in range(12)],dtype=np.uint8)
    A=bfs(solved,D); B=bfs(target,D)
    for da in range(D+1):
        for db in [da, da-1] if da>0 else [0]:
            if db<0 or db>D: continue
            ca=enc(A[da][0]); cb=enc(B[db][0]); com=np.intersect1d(ca,cb)
            if len(com):
                i=int(np.where(ca==com[0])[0][0]); j=int(np.where(cb==com[0])[0][0])
                fw=[MOVES[k] for k in path(A,da,i)]; bw=[MOVES[k] for k in path(B,db,j)]
                return fw+[inv(m) for m in bw[::-1]]
    return None
if __name__=='__main__':
    pairs=[p.split('>') for p in sys.argv[1].split(',')]
    p=list(range(12))
    for a,b in pairs: p[IDX[a]]=IDX[b]
    tgt=np.array([2*h for h in p],dtype=np.uint8)
    st=None
    if len(sys.argv)>3:
        q=list(range(12))
        for a,b in [x.split('>') for x in sys.argv[3].split(',')]: q[IDX[a]]=IDX[b]
        st=np.array([2*h for h in q],dtype=np.uint8)
    t=time.time(); r=solve(tgt,int(sys.argv[2]),st); print(' '.join(r) if r else 'NONE', file=sys.stdout); print('time',round(time.time()-t,1),file=sys.stderr)
