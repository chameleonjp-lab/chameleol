import { t } from '../i18n/i18n.js';

/** Passive feedback: consumes rule views and events without changing input or rules. */
export function createHudState({bestDistance=null,bestCombo=0}={}) {
  let successStart=null, previousCombo=0, dangerSeen=false, recovered=false, recoveryStart=-Infinity;
  let breakStart=-Infinity, brokenGems=0, flashStart=-Infinity, shutterStart=-Infinity, unlockStart=-Infinity, now=0;
  let distanceRecord=false,comboRecord=false, areaStart=-Infinity, areaBuilding=1, firstTick=true;
  return {
    event(e) { const time=Number.isFinite(e.t)?e.t:now;if(e.type==='instantSuccess')flashStart=time;if(e.type==='evalStart'||e.type==='evalEnd')shutterStart=time;if(e.type==='unlockBrightness')unlockStart=time;if(e.type==='enterBuilding'&&[1,20,23,30,40].includes(e.building)){areaStart=time;areaBuilding=e.building;} },
    tick(v) {
      now=v.t;
      if(firstTick){firstTick=false;if(v.building===1&&areaStart===-Infinity)areaStart=now;}
      if(v.phase==='eval'&&v.matchState==='success') successStart??=now; else successStart=null;
      const combo=Math.max(0,Math.min(50,v.combo??0));
      if(previousCombo>0&&combo===0){breakStart=now;brokenGems=Math.min(10,previousCombo);}
      if(v.policeStage===2)dangerSeen=true;
      if(dangerSeen&&v.policeStage===0&&!recovered){recovered=true;recoveryStart=now;}
      previousCombo=combo;
      if(bestDistance!==null&&v.passed>bestDistance)distanceRecord=true;
      if(bestCombo>0&&combo>bestCombo)comboRecord=true;
      return {success:successStart===null?0:Math.min(1,(now-successStart)/1000),combo,gems:Math.min(10,combo),
        brokenGems:now-breakStart<400?brokenGems:0,breaking:now-breakStart<400,breakProgress:Math.max(0,Math.min(1,(now-breakStart)/400)),
        recovery:now-recoveryStart<800,recoveryCount:recovered?1:0,
        flash:now-flashStart<450,flashProgress:Math.max(0,Math.min(1,(now-flashStart)/450)),shutter:now-shutterStart<200,unlock:now-unlockStart<600,
        progress:Math.max(0,Math.min(1,v.passed/50)),bestDistance,distanceRecord,comboRecord,
        area:now-areaStart<800?areaBuilding:null,lastFive:v.building>=46&&v.building<=50,remaining:51-v.building};
    },
  };
}

export function mountPresentationHud({host,scope,bestDistance=null,bestCombo=0,verification=false}) {
  const state=createHudState({bestDistance,bestCombo});
  const document=host.ownerDocument??globalThis.document;
  const root=document.createElement('div');root.className='presentation-hud';root.setAttribute('aria-hidden','true');
  root.innerHTML='<div class="presentation-success-frame"></div><div class="presentation-success-band"><i></i></div><div class="presentation-shutter">◆</div><div class="presentation-combo"><span class="presentation-gems"></span> <b></b></div><div class="presentation-route"><i class="presentation-hero">🦎</i><i class="presentation-best-flag">⚑</i></div><div class="presentation-notice"></div><div class="presentation-unlock-lock">🔓</div><div class="presentation-record"></div><div class="presentation-last-five"></div>';
  host.append(root);let disposed=false,guide=false,last=null,forced=null,lastRunning=false;
  const q=s=>root.querySelector(s);
  function tick(view){if(disposed)return;const s=state.tick(view);if(forced)Object.assign(s,forced);last=s;
    lastRunning=view.running;root.classList.toggle('is-paused',!view.running||document.hidden);root.style.setProperty('--success-sweep',String(s.flashProgress??0));root.classList.toggle('is-unlock',s.unlock&&!guide);root.classList.toggle('is-success',s.flash);root.classList.toggle('is-shutter',s.shutter);root.classList.toggle('is-breaking',s.breaking);
    q('.presentation-success-band i').style.transform=`scaleX(${s.success})`;
    const gems=q('.presentation-gems');gems.style.opacity=String(s.breaking?1-.65*s.breakProgress:1);gems.style.transform=s.breaking?`translateY(${5*s.breakProgress}px)`:'none';gems.textContent='◆'.repeat(s.breaking?s.brokenGems:s.gems);q('.presentation-combo b').textContent=String(s.combo);
    q('.presentation-hero').style.left=`${s.progress*100}%`;
    const flag=q('.presentation-best-flag');flag.hidden=bestDistance===null;flag.style.left=`${Math.min(1,(bestDistance??0)/50)*100}%`;
    q('.presentation-notice').textContent=guide?'':s.unlock?t('presentation.unlock'):s.recovery?t('presentation.recovery'):s.area?t(`presentation.area${s.area}`):'';
    q('.presentation-record').textContent=s.comboRecord?t('presentation.comboRecord'):s.distanceRecord?t('presentation.distanceRecord'):'';
    q('.presentation-last-five').textContent=s.lastFive?t('presentation.lastFive',{n:s.remaining}):'';
    return s;
  }
  const visibility=()=>{if(document.hidden||!lastRunning)root.classList.add('is-paused');};document.addEventListener('visibilitychange',visibility);
  function dispose(){if(disposed)return;disposed=true;document.removeEventListener('visibilitychange',visibility);root.remove();}
  scope?.own(dispose);
  function stats(){const s=last??{};return {activeIds:[...(s.flash?[42]:[]),...(s.success>0?[43]:[]),...(s.shutter?[46]:[]),...(s.combo>0?[48]:[]),...(s.breaking?[49]:[]),...(s.recovery?[50]:[]),52,...(s.distanceRecord?[53]:[]),...(s.comboRecord?[54]:[]),...(!guide&&s.unlock?[55]:[]),...(s.lastFive?[58]:[]),...(!guide&&s.area?[11]:[])],gems:s.gems??0,combo:s.combo??0,guideActive:guide};}
  function forceEffect(id,view={t:0,passed:0,combo:0,policeStage:0,building:1,phase:'eval',matchState:null}){if(!verification)return null;forced=({11:{area:20},42:{flash:true,flashProgress:.5},43:{success:1},46:{shutter:true},48:{combo:11,gems:10},49:{breaking:true,brokenGems:10},50:{recovery:true},52:{progress:.5},53:{distanceRecord:true},54:{comboRecord:true},55:{unlock:true},58:{lastFive:true,remaining:5}})[id]??null;return tick(view);}
  return {tick,event:state.event,forceEffect,stats,setGuideActive(value){guide=Boolean(value);if(guide)q('.presentation-notice').textContent='';},dispose,element:root};
}
