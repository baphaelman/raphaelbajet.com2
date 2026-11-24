#!/bin/zsh
# Render every stop at desktop and phone size and report any script error,
# then drive every sound path once (headless audio stays suspended, but the
# scheduling code runs). Screenshots land in shots/ for a look.
cd "$(dirname "$0")/.."
N=$(python3 -c "
import re;s=open('../../public/slop/play/comma-pump.html').read()
print(sum(int(m) for m in re.findall(r'data-n=\"(\d+)\"',s))+len(re.findall(r'class=\"step\"',s))+1)")
fail=0
for k in $(seq 0 $((N-1))); do
  for size in 1400,900 390,844; do
    tag=d; [[ $size == 390,* ]] && tag=p
    r=$(tools/render.sh smoke_${tag}$k $k $size)
    [[ $r == OK ]] || { echo "stop $k ($tag): $r"; fail=1; }
  done
done
AUDIO="try{ensureAudio();playInterval(false);playInterval(true);playStack('fifths');playCompare('thirds');pumpStart('just');pumpTick();
setTimeout(()=>{try{pumpStart('fixed');pumpTick();pumpStart('et');SC.temper.t='mean';SC.temper.root=8;SC.temper.update();playTriad(true);
const w=worstFifth('mean');playDyad(w.fl,w.fh);latWalk();SC.lattice.sel=[[0,0],[-4,1]];document.querySelector('[data-act=lat-et]').click();stopAll();
document.title=__errs.length?'ERR '+__errs.join(' | '):'OK audio'}catch(e){__errs.push(e.message)}},1200)}catch(e){__errs.push(e.message)}"
r=$(tools/render.sh smoke_audio 10 1400,900 "$AUDIO"); [[ $r == OK* ]] || { echo "audio: $r"; fail=1; }
(( fail )) && echo "smoke: FAILED" || echo "smoke: all $N stops OK at desktop and phone size, audio paths OK"
