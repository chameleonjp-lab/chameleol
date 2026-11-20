// E044 is a display claim, not a new bonus award.
export function createPrecisionBadge({claim=async()=>false}={}) {
  let disposed=false,attempted=false,building=null,lastEnd=null,since=null,badge=null;
  return {
    async consume(segment){
      if(disposed||attempted||!segment)return false;
      const {from,to,matchUnits,unitsPerPercent,evaluationEnd}=segment;
      if(!Number.isInteger(segment.building)||segment.building<1||segment.building>50||
        ![from,to,evaluationEnd,matchUnits,unitsPerPercent].every(Number.isSafeInteger)||unitsPerPercent<=0||to<=from||from<0)return false;
      if(building!==segment.building){if(building!==null&&segment.building<building)return false;building=segment.building;lastEnd=null;since=null;}
      const end=Math.min(to,evaluationEnd),start=Math.max(from,lastEnd??from);
      if(end<=start)return false;
      if(lastEnd!==null&&start>lastEnd)since=null;
      lastEnd=end;
      if(matchUnits<98*unitsPerPercent||matchUnits>100*unitsPerPercent){since=null;return false;}
      since??=start;
      if(end-since<500)return false;
      attempted=true;
      const startedAt=since+500;
      let saved=false;
      try{saved=await claim();}catch{/* optional display must never fail the run */}
      if(disposed||saved!==true)return false;
      badge={id:`precision:${building}:${startedAt}`,kind:'nearPerfect',building,startedAt,phase:'notice',elapsedMs:0};
      return true;
    },
    snapshot(t){return !disposed&&badge&&t>=badge.startedAt&&t<badge.startedAt+1400?{...badge,elapsedMs:t-badge.startedAt}:null;},
    dispose(){disposed=true;badge=null;},
  };
}
