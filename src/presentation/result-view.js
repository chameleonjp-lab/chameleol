import {PORTRAIT_BOUNDS} from './assets/result-atlas-bounds.js';
import {formatRankAverage} from '../rules/v1/engine.js';
import {getLanguage} from '../i18n/i18n.js';
import {getLanguageLocale} from '../i18n/languages.js';
const ATLAS=new URL('./assets/result-atlas.webp',import.meta.url).href;
/** Static DOM presentation. The caller supplies the sole shared active clock. */
export function mountResultPresentation({host,data,scope,t=(key)=>key}){
 const doc=host.ownerDocument,root=doc.createElement('section');root.className='result-presentation';let disposed=false,finished=false,now=0,rankSignature='';
 const el=(tag,cls,text,parent=root)=>{const node=doc.createElement(tag);node.className=cls;if(text!=null)node.textContent=String(text);parent.append(node);return node;};
 const tr=(key,fallback,params={})=>{const value=t(key,params);return String(!value||value===key?fallback:value).replace(/\{(\w+)\}/g,(all,key)=>params[key]??all)};
 const sprite=(node,rect)=>{node.style.backgroundImage=`url("${ATLAS}")`;node.style.backgroundSize=`${2048/rect[2]*100}% ${2048/rect[3]*100}%`;node.style.backgroundPosition=`${rect[0]/(2048-rect[2])*100}% ${rect[1]/(2048-rect[3])*100}%`;};
 const scene=el('div','result-scene result-photo');sprite(scene,[([1,20,23,30,40].indexOf(data.backgroundId)%3)*640,Math.floor([1,20,23,30,40].indexOf(data.backgroundId)/3)*400,640,400]);
 const portrait=el('button','result-portrait',null,scene);portrait.type='button';portrait.setAttribute('aria-label',tr('resultPortraitReaction','Greet the chameleon'));sprite(portrait,[['clear','detected','quit','proud'].indexOf(data.portraitId)*480,960,480,720]);
 const restingPortraitRect=[['clear','detected','quit','proud'].indexOf(data.portraitId)*480,960,480,720];
 const report=el('div','result-report result-details');
 const score=el('div','result-score',null,report);score.setAttribute('aria-label',`${tr('resultTotal','Total score')}: ${data.summary.score.total}`);const visualScore=el('span','result-score-visual','0',score);visualScore.setAttribute('aria-hidden','true');
 const components=el('div','result-components',null,report);for(const [key,label] of [['pass','Passed'],['accuracy','Accuracy'],['combo','Combo'],['clear','Clear']]){const box=el('div',`result-component result-component-${key}`,`${tr('resultComponent'+key,label)}: ${data.summary.score[key]??0}`,components);box.style.setProperty('--component-fill',`${data.summary.score.total>0?Math.max(0,Math.min(100,(data.summary.score[key]??0)/data.summary.score.total*100)):0}%`);}
 const map=el('div','result-map',null,report);map.setAttribute('aria-label',`${data.summary.buildings}/50`);for(const cell of data.mapCells){const n=el('span',`result-map-cell${cell.passed?' is-passed':''}`,cell.building,map);n.setAttribute('aria-hidden','true')}
 el('p','result-combo',`${tr('resultMaxCombo','Maximum combo')}: ${'◆'.repeat(data.gems)} ${data.maxCombo}`,report);
 for(const [key,b] of [['resultBestBuilding',data.bestBuilding],['resultWorstBuilding',data.worstBuilding]])el('p','result-extreme',`${tr(key,key==='resultBestBuilding'?'Best building':'Toughest building')}: ${b?`${b.building} · ${formatRankAverage(b.rankAverage)}%`:'—'}`,report);
 if(data.newBest)el('p','result-new-best',tr('resultNewBest','New personal best'),report);
 if(data.firstClearNow){
   const ticket=el('aside','result-first-clear result-ticket',null,report);
   const stamp=el('span','result-ticket-stamp','50',ticket);stamp.setAttribute('aria-hidden','true');
   const body=el('div','result-ticket-body',null,ticket);
   el('strong','result-ticket-title',tr('resultFirstClear','First clear on this device!'),body);
   if(data.firstClearAt!==null&&data.firstClearAt!==undefined){
     const date=new Date(data.firstClearAt),iso=date.toISOString();
     let label=iso.slice(0,10);
     try{label=new Intl.DateTimeFormat(getLanguageLocale(getLanguage()),{year:'numeric',month:'short',day:'numeric'}).format(date);}catch{}
     const time=el('time','result-ticket-date',label,body);time.setAttribute('datetime',iso);
   }
 }
 const badges=el('div','result-badges',null,report);for(const b of data.badges)el('span','result-badge',tr('resultBadge'+b,b),badges);
 el('p','result-speech',tr(data.speechKey,{resultSpeechClear:'We escaped!',resultSpeechBest:'A new personal best!',resultSpeechCombo:'What a streak!',resultSpeechOther:'Every street is another chance.'}[data.speechKey]),report);
 const cards=el('div','result-districts',null,report);for(const d of data.districts){const card=el('article','result-district',null,cards);const districtIndex=[1,20,23,30,40].indexOf(d.from);sprite(card,[(districtIndex%3)*640,Math.floor(districtIndex/3)*400,640,400]);el('span','result-district-range',`${d.from}–${d.to}`,card);el('strong','result-district-average',d.rankAverage===null?tr('resultNoData','No results for this district yet.'):`${formatRankAverage(d.rankAverage)}%`,card)}
 const colors=el('div','result-colors',null,report);if(!data.colors.length)el('p','result-colors-unavailable',tr('resultColorsUnavailable','Colors for this run are unavailable.'),colors);
 for(const c of data.colors){const n=el('span',`result-color${c.reached?' is-reached':''}`,null,colors);n.style.backgroundColor=c.hex;n.title=String(c.building)}
 if(data.comparison){el('p','result-comparison-label',tr('resultPreviousDevice','Compared with the previous run on this device (all names)'),report);for(const key of ['buildings','rankAverage','maxCombo']){const n=data.comparison[key];el('span','result-comparison',`${tr('resultCompare'+key,key)}: ${n==null?'—':n===0?'±0':`${n>0?'+':''}${key==='rankAverage'?(n/100).toFixed(2):n}`}`,report)}}
 const rank=el('p','result-rank',null,report);rank.hidden=true;host.append(root);
 const reduced=doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
 function finishNow(){if(disposed)return;finished=true;root.closest('.screen.result')?.classList.add('presentation-complete');root.classList.add('is-complete');scene.classList.add('is-complete');visualScore.textContent=String(data.summary.score.total)}
 function tick(activeMs){if(disposed)return;now=Math.max(now,Number.isFinite(activeMs)?activeMs:now);if(!finished){visualScore.textContent=String(Math.round((data.summary.score.total||0)*Math.min(1,now/600)));if(now>=600)finishNow()}}
 const skip=()=>finishNow(),react=(event)=>{event.stopPropagation();finishNow();root.classList.remove('is-reacting');scene.classList.remove('is-reacting');sprite(portrait,[0,1680,240,360]);void portrait.offsetWidth;root.classList.add('is-reacting');scene.classList.add('is-reacting');scope.schedule('result-reaction',400,()=>{root.classList.remove('is-reacting');scene.classList.remove('is-reacting');sprite(portrait,restingPortraitRect)})};
 root.addEventListener('pointerdown',skip);scene.addEventListener('pointerdown',skip);portrait.addEventListener('click',react);
 const visibility=()=>{root.closest('.screen.result')?.classList.toggle('is-paused',doc.hidden);root.classList.toggle('is-paused',doc.hidden);scene.classList.toggle('is-paused',doc.hidden)};doc.addEventListener('visibilitychange',visibility);visibility();
 function dispose(){if(disposed)return;disposed=true;root.removeEventListener('pointerdown',skip);scene.removeEventListener('pointerdown',skip);portrait.removeEventListener('click',react);doc.removeEventListener('visibilitychange',visibility);scene.remove();report.remove();root.remove()}
 scope.own(dispose);if(reduced)finishNow();
 function stats(){
  const activeIds=[];
  const shown=node=>!disposed&&node?.isConnected&&!node.hidden;
  const mark=(id,condition)=>{if(condition)activeIds.push(id)};
  const has=selector=>shown(report)&&!!report.querySelector(selector);
  mark(71,shown(scene)&&shown(portrait));mark(73,shown(report));mark(74,shown(visualScore));
  mark(77,has('.result-combo'));mark(78,shown(components)&&components.children.length===4);
  mark(79,has('.result-new-best'));mark(80,shown(scene)&&scene.classList.contains('result-photo'));
  mark(81,shown(map)&&map.children.length===50);mark(82,shown(report)&&data.bestBuilding!==null);mark(83,shown(report)&&data.worstBuilding!==null);
  mark(85,has('.result-first-clear'));mark(89,has('.result-district'));mark(91,has('.result-badge'));mark(92,has('.result-color'));
  mark(93,shown(scene)&&!!scene.style.backgroundImage);mark(95,has('.result-speech'));mark(96,shown(rank)&&rank.textContent.length>0);
  mark(98,has('.result-comparison'));mark(99,shown(scene)&&scene.classList.contains('is-replaying'));mark(100,shown(scene)&&scene.classList.contains('is-reacting'));
  return {activeIds,rendererCount:0,renderers:0,webglRenderers:0,rafCount:0,disposed,finished,score:Number(visualScore.textContent),mapCells:shown(map)?map.children.length:0,gems:shown(report)?data.gems:0,districts:shown(report)?cards.children.length:0,colors:shown(colors)?colors.querySelectorAll('.result-color').length:0,badges:shown(badges)?badges.children.length:0};
 }

 return {stats,element:root,sceneElement:scene,detailsElement:report,tick,finishNow,dispose,replayAccepted(){if(!disposed){finishNow();sprite(portrait,restingPortraitRect);root.classList.remove('is-reacting');scene.classList.remove('is-reacting');const target=doc.querySelector('[data-testid="result-again"]');if(target){const from=portrait.getBoundingClientRect(),to=target.getBoundingClientRect(),bounds=PORTRAIT_BOUNDS[data.portraitId];const feetX=from.left+from.width*((bounds.minX+bounds.maxX+1)/2/bounds.width),feetY=from.top+from.height*((bounds.maxY+1)/bounds.height);portrait.style.setProperty('--result-jump-x',`${to.left+to.width/2-feetX}px`);portrait.style.setProperty('--result-jump-y',`${to.top-feetY}px`)}root.classList.add('is-replaying');scene.classList.add('is-replaying');scope.schedule('result-replay',150,()=>{root.classList.remove('is-replaying');scene.classList.remove('is-replaying')})}},updateRank(view){if(disposed)return;const valid=view?.state==='official'&&Number.isSafeInteger(view.rank)&&view.rank>0&&['current','personalBest'].includes(view.label);rank.hidden=!valid;if(!valid){rank.textContent='';return}const signature=`${view.rank}:${view.label}`;rank.textContent=tr(view.label==='current'?'resultCurrentRank':'resultPersonalBestRank',view.label==='current'?'This run’s official rank: {rank}':'Personal best rank: {rank}',{rank:view.rank});if(signature!==rankSignature){rank.classList.add('is-open');rankSignature=signature}}};
}
