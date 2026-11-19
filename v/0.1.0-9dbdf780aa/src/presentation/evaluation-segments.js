// Observe append-only input history, without replaying or changing the authoritative session.
// Each returned interval has positive real evaluation time and the actual applied body color.
export function createEvaluationSegmentCollector({session,restore=false}={}) {
  const rules=session.rules,history=session.recorder.entries;
  let cursor=session.state.t,color={...session.state.color},index=history.length,historyT=session.recorder.lastT;
  let seedEvents=[],seedIndex=0,disposed=false;
  if(restore&&session.state.evalBuilding>0){
    const start=Math.max((session.state.evalBuilding-1)*rules.buildingMs+rules.evalStartMs,cursor-500);
    let absolute=historyT,scan=history.length-1,found=false,steps=0,base={...rules.initialColor};
    while(scan>=0&&steps++<1000){
      const entry=history[scan];
      if(entry[0]===0){
        const hsv={h:entry[2],s:entry[3],v:entry[4]};
        if(absolute<=start){base=hsv;found=true;break;}
        seedEvents.push({t:absolute,color:hsv});
      }
      absolute-=entry[1];scan--;
    }
    if(found||scan<0){cursor=start;color=base;seedEvents.reverse();}
    else seedEvents=[]; // No guessed pre-resume color if a pathological input burst exceeds the bound.
  }
  return {
    drain(){
      if(disposed)return [];
      const T=Math.min(session.state.t,rules.buildingCount*rules.buildingMs);
      if(!Number.isSafeInteger(T)||T<cursor)return [];
      const segments=[];
      const emitUntil=end=>{
        while(cursor<end){
          const building=Math.floor(cursor/rules.buildingMs)+1,base=(building-1)*rules.buildingMs;
          const limit=Math.min(end,base+rules.buildingMs),from=Math.max(cursor,base+rules.evalStartMs),to=Math.min(limit,base+rules.evalEndMs);
          if(to>from)segments.push(Object.freeze({building,from,to,matchUnits:session.game.matchFn(color,session.game.course.targets[building-1]),unitsPerPercent:rules.match.unitsPerPercent,evaluationEnd:base+rules.evalEndMs}));
          cursor=limit;
        }
      };
      let processed=0;
      while(processed<1000){
        const seed=seedEvents[seedIndex],entry=seed?null:history[index];
        if(!seed&&!entry)break;
        const t=seed?seed.t:historyT+entry[1];
        if(t>T)break;
        if(t>=cursor)emitUntil(t);
        if(seed){color={...seed.color};seedIndex++;}
        else {historyT=t;index++;if(entry[0]===0)color={h:entry[2],s:entry[3],v:entry[4]};}
        processed++;
      }
      const nextSeed=seedEvents[seedIndex],nextEntry=nextSeed?null:history[index];
      const nextT=nextSeed?.t??(nextEntry?historyT+nextEntry[1]:T);
      emitUntil(Math.min(T,nextT));
      if(seedIndex===seedEvents.length){seedEvents=[];seedIndex=0;}
      return Object.freeze(segments);
    },
    dispose(){disposed=true;seedEvents=[];},
  };
}
