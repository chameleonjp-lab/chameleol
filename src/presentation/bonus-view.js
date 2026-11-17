import {bonusNameKey} from './bonus-data.js';
const SYMBOLS={precision:'◎',steady:'✓',quick:'➜',milestone:'⚑',allSuccess:'✺'};
const FALLBACK={'bonus.card.title':'Bonus','bonus.precision':'Precision','bonus.precisionHigh':'High precision','bonus.steady':'Steady','bonus.quick':'Quick match','bonus.milestone':'Milestone','bonus.basePoints':'Base points','bonus.passTotal':'This building','bonus.finalBuilding':'Final building bonuses','bonus.allSuccess':'All buildings successful!','bonus.allSuccessDetail':'Successful at all 50 buildings','result.score.clear':'Clear'};
function elements(host,t){const doc=host.ownerDocument??globalThis.document;return {doc,tr:(key)=>{const value=t(key);return value===key?FALLBACK[key]??key:value;},el:(tag,cls,text,parent)=>{const n=doc.createElement(tag);n.className=cls;if(text!=null)n.textContent=String(text);parent.append(n);return n;}};}
/** One card, no animation loop: elapsed time comes exclusively from the game clock. */
export function mountBonusPresentation({host,scope,t=key=>key,reducedMotion}) {
  const {doc,tr,el}=elements(host,t),root=el('aside','bonus-card',null,host);
  root.hidden=true;root.setAttribute('aria-live','polite');root.setAttribute('aria-atomic','true');
  const title=el('strong','bonus-card-title',tr('bonus.card.title'),root),total=el('b','bonus-card-points','',root),rows=el('div','bonus-awards',null,root),detail=el('p','bonus-card-detail','',root),notices=el('p','bonus-card-notices','',root);
  const seen=new Set();let disposed=false,batch=null,quiet=false,activeMs=0,badge=null,renderedNotices=null;
  const reduced=reducedMotion??Boolean(doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  root.classList.toggle('is-reduced',reduced);
  // E044 is a display claim only: the controller owns the 98%/500ms/deadline clock and hands over
  // a value (or null) every frame. Here it is just drawn; there are no points and no sound.
  const badgeEl=doc.createElement('span');badgeEl.className='bonus-card-badge';
  // Agreed language-neutral placeholder until CG05 translates the finished CL/CG interface.
  const badgeText=()=> '◎ 98%';
  const validBadge=b=>b&&typeof b==='object'&&Number.isFinite(b.elapsedMs)&&b.elapsedMs>=0?b:null;
  function setNotices(base,withBadge){
    const key=`${base}|${withBadge?badgeEl.textContent:''}`;
    if(key===renderedNotices)return;renderedNotices=key;
    notices.textContent=base;
    if(withBadge){if(base)notices.append(' · ');notices.append(badgeEl);}
    notices.hidden=!notices.textContent;
  }
  function tick(args={}) {
    const {activeMs:now0=activeMs,t:tt,phase,guideActive=false,warningActive=false,running=true,quiet:nextQuiet=guideActive||warningActive}=args;
    const now=tt??now0;activeMs=now;
    if(disposed)return;
    // Only an explicit precisionBadge entry replaces the badge; show() ticks without one.
    if(Object.prototype.hasOwnProperty.call(args,'precisionBadge'))badge=validBadge(args.precisionBadge);
    quiet=nextQuiet;
    const age=batch?Math.max(0,now-batch.earnedAtT):0;
    const batchVisible=!!batch&&age<1400&&phase!=='eval';
    const badgeVisible=!!badge&&!quiet;
    if(!batchVisible&&!badgeVisible){root.hidden=true;root.classList.remove('is-badge-only');setNotices('',false);return;}
    root.classList.toggle('is-quiet',quiet);root.classList.toggle('is-paused',!running||doc.hidden);
    root.classList.toggle('is-badge-only',!batchVisible);
    if(badgeVisible)badgeEl.textContent=badgeText();
    setNotices(batchVisible?(batch.notices??[]).join(' · '):'',badgeVisible);
    root.hidden=false;
    if(batchVisible){
      root.style.setProperty('--bonus-enter',String(Math.min(1,age/150)));
      root.style.setProperty('--bonus-age',`${age}ms`);
      root.style.setProperty('--bonus-progress',String(Math.min(1,Math.max(0,(age-1150)/250))));
      root.classList.toggle('is-leaving',age>=1150);
    }else{
      const e=badge.elapsedMs;
      root.style.setProperty('--bonus-enter',String(Math.min(1,e/150)));
      root.style.setProperty('--bonus-age',`${e}ms`);
      root.style.setProperty('--bonus-progress',String(Math.min(1,Math.max(0,(e-1250)/150))));
      root.classList.toggle('is-leaving',e>=1250);
    }
  }
  function show(next,now=activeMs,{quiet:nextQuiet=false}={}) {
    if(disposed||!next||seen.has(next.id))return false;
    seen.add(next.id);
    if(now>=next.expiresAtT)return false;
    batch=next;quiet=nextQuiet;total.textContent=`+${next.bonusPoints}`;title.textContent=tr('bonus.card.title');rows.textContent='';
    for(const award of next.awards){const row=el('div',`bonus-award bonus-${award.kind}${award.tier===10?' bonus-tier-high':''}`,null,rows);el('i','bonus-symbol',SYMBOLS[award.kind],row).setAttribute('aria-hidden','true');const key=bonusNameKey(award),shortKey=key.replace('bonus.','bonus.short.'),short=t(shortKey),label=next.awards.length>1&&short!==shortKey?short:tr(key);const name=el('span','bonus-name',`${label}${award.kind==='milestone'?` · ${award.building}`:''}`,row);name.title=tr(key);name.setAttribute('aria-label',tr(key));el('b','bonus-points',`+${award.points}`,row);}
    renderedNotices=null;
    detail.textContent=`${tr('bonus.basePoints')} ${next.basePoints} · ${tr('bonus.passTotal')} +${next.totalPoints}`;
    tick({t:now,quiet});return true;
  }
  const visibility=()=>root.classList.toggle('is-paused',doc.hidden||root.classList.contains('is-paused'));
  doc.addEventListener('visibilitychange',visibility);
  function dispose(){if(disposed)return;disposed=true;doc.removeEventListener('visibilitychange',visibility);seen.clear();batch=null;badge=null;root.remove();}
  scope.own(dispose);
  return {element:root,show,tick,finishNow(){root.hidden=true;batch=null;badge=null;},dispose,stats:()=>({cards:disposed?0:1,visible:!disposed&&!root.hidden,awards:batch?.awards.length??0,badge:!disposed&&!root.hidden&&!!badge&&!quiet,particles:0})};
}
/** Called only after the final save attempt, using the saved in-memory summary. */
export function mountEndingBonus({host,data,scope,t=key=>key}) {
  if(!data)return null;
  const {tr,el}=elements(host,t),root=el('aside','ending-bonus',null,host);
  el('strong','ending-bonus-title',tr('bonus.finalBuilding'),root);
  const rows=el('div','bonus-awards',null,root);
  for(const a of data.awards)el('span','bonus-award',`${SYMBOLS[a.kind]} ${tr(bonusNameKey(a))} +${a.points}`,rows);
  el('p','ending-base',`${tr('bonus.basePoints')} ${data.basePoints} · ${tr('result.score.clear')} +${data.clearPoints}`,root);
  if(data.allSuccessPoints){el('strong','ending-medal',`${SYMBOLS.allSuccess} ${tr('bonus.allSuccess')} +${data.allSuccessPoints}`,root);el('p','ending-medal-detail',tr('bonus.allSuccessDetail'),root);}
  el('b','ending-total',`${tr('bonus.passTotal')} +${data.points}`,root);
  scope.own(()=>root.remove());return {element:root,tick:elapsed=>{root.hidden=elapsed>=1800;}};
}
