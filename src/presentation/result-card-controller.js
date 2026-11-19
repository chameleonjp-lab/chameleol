import { rulesForVersion } from '../rules/v1/config.js';
import { applyVerifiedScore } from '../net/verified-score.js';
import { resolveResultEvidence } from './result-evidence.js';
import { buildResultCardModel, projectRunResult } from './result-card-data.js';
import { buildResultMiniatureModel } from './result-miniature-data.js';
import { createResultRendererOwner } from './result-renderer-owner.js';
import { startPreparedResultShare } from '../ui/share-card.js';
import { buildResultShareText } from '../ui/share.js';

const portraitKey=hero=>JSON.stringify([hero.status,hero.building,hero.hsv,hero.outlineBuilding]);
const safeDispose=value=>{try{value?.dispose?.();}catch{/* release every other resource too */}};
const waitForPresentation=({signal})=>new Promise(resolve=>{
  if(signal.aborted){resolve();return;}
  const finish=()=>{clearTimeout(timer);signal.removeEventListener('abort',finish);resolve();};
  const timer=setTimeout(finish,600);signal.addEventListener('abort',finish,{once:true});
});
const encodePng=canvas=>new Promise((resolve,reject)=>{
  if(typeof canvas.toBlob!=='function'){reject(Error('PNG encoding unavailable'));return;}
  canvas.toBlob(blob=>blob?resolve(blob):reject(Error('PNG encoding failed')),'image/png');
});

export function createResultCardController({result,locale='en',layoutKey='default',ports={}} = {}) {
  if(!result)throw new TypeError('A result is required');
  result.resultCardController?.dispose();
  let disposed=false,key=null,controller=null,canvas=null,prepared=null,model=null,miniature=null,state='pending',imageUrl=null;
  let revision=Number.isSafeInteger(result.cardRevision)?result.cardRevision:0;
  let currentLocale=locale,currentLayout=layoutKey,run=null;
  let miniatureKey=null;
  const urlApi=ports.urlApi??globalThis.URL;
  const focusTarget=ports.focusTarget??globalThis;
  const visibilityTarget=ports.visibilityTarget??globalThis.document;
  const navigator=ports.navigator??globalThis.navigator;
  // Views borrow the cached image used by drawResultCard; its lifetime stays with the result.
  const snapshot=()=>Object.freeze({model,miniature,state,prepared,revision,
    portraitImage:!disposed&&model&&result.resultPortrait?.signature===portraitKey(model.hero)
      ?result.resultPortrait?.portrait?.image??null:null});
  const notify=()=>{try{ports.onChange?.(snapshot());}catch{/* views do not own the controller */}};
  const revokeImageUrl=()=>{if(imageUrl){try{urlApi?.revokeObjectURL?.(imageUrl);}catch{}imageUrl=null;}};
  const clearCanvas=()=>{if(canvas){canvas.width=0;canvas.height=0;canvas=null;}};
  const current=rev=>!disposed && revision===rev && result.resultCardController===api;

  async function prepare(rev,signal) {
    if(typeof ports.createResultPortrait!=='function' || typeof ports.drawResultCard!=='function'){
      if(current(rev)){state='unavailable';notify();}return;
    }
    const hero=model.hero,signature=portraitKey(hero);
    let lease=null,portrait=null;
    try {
      portrait=result.resultPortrait?.signature===signature?result.resultPortrait.portrait:null;
      if(!portrait){
        // The previous hero is already invalid for sharing; release it before allocating a replacement.
        safeDispose(result.resultPortrait?.portrait);result.resultPortrait=null;
        await (ports.waitForPresentation??waitForPresentation)({signal});
        if(!current(rev)||signal.aborted)return;
        result.resultRendererOwner??=createResultRendererOwner({createRenderer:ports.createRenderer,destroyRenderer:ports.destroyRenderer});
        lease=await result.resultRendererOwner.acquire('portrait',{signal});
        if(!current(rev)||signal.aborted){lease?.release();return;}
        if (lease) {
          try {
            portrait=await ports.createResultPortrait({hero,signal,rendererLease:lease});
          } catch (error) {
            if (!ports.createFallbackPortrait || signal.aborted) throw error;
          } finally { lease.release(); lease=null; }
        }
        if (!current(rev) || signal.aborted) { safeDispose(portrait); return; }
        if (!portrait) {
          if (!ports.createFallbackPortrait) throw Error('Rendering context unavailable');
          portrait=await ports.createFallbackPortrait({hero,signal});
        }
        if(!current(rev)||signal.aborted){safeDispose(portrait);return;}
        const image=portrait?.image,w=image?.width??image?.naturalWidth,h=image?.height??image?.naturalHeight;
        if(!image || !Number.isFinite(w)||!Number.isFinite(h)||w<=0||h<=0||w*h*4>691200){safeDispose(portrait);throw Error('Invalid portrait image');}
        safeDispose(result.resultPortrait?.portrait);
        result.resultPortrait={signature,portrait};
      }
      lease?.release();lease=null;
      if(!current(rev)||signal.aborted)return;
      canvas=ports.createCanvas?.()??globalThis.document?.createElement('canvas');
      if(!canvas)throw Error('Canvas unavailable');
      canvas.width=1200;canvas.height=630;
      ports.drawResultCard(canvas,{model,portrait:portrait.image,locale:currentLocale});
      const blob=await (ports.encodePng??encodePng)(canvas,{signal});
      if(!current(rev)||signal.aborted)return;
      if(!blob || blob.type!=='image/png' || blob.size<=0)throw Error('Invalid PNG');
      prepared=Object.freeze({blob,file:new File([blob],'chameleol-result.png',{type:'image/png'}),revision:rev});
      // Ready subscribers may immediately expand their screen/panel canvases.
      clearCanvas();
      state='ready';notify();
    } catch {
      if(current(rev)&&!signal.aborted){clearCanvas();prepared=null;state='failed';notify();}
    } finally {lease?.release();if(current(rev))clearCanvas();}
  }

  function refresh(options={},force=false) {
    if(disposed)return snapshot();
    currentLocale=options.locale??currentLocale;currentLayout=options.layoutKey??currentLayout;
    let displaySummary;
    try{displaySummary=applyVerifiedScore(result.summary,result.verifiedScore);}catch{displaySummary={};}
    const evidence=resolveResultEvidence(result);
    run=projectRunResult(result,currentLocale,displaySummary);
    const nextKey=JSON.stringify([run,displaySummary.rulesVersion,displaySummary.score,displaySummary.bonus,result.netState??null,currentLayout]);
    // Evidence can finish after the card. Only update the optional miniature in that case.
    const nextMiniatureKey=JSON.stringify([evidence.status,evidence.revision,result.arrivedBuilding,result.targets]);
    const cardChanged=force || nextKey!==key;
    if (cardChanged || nextMiniatureKey!==miniatureKey) {
      miniature=buildResultMiniatureModel({displaySummary,arrivedBuilding:result.arrivedBuilding,targets:result.targets,evidence});
      miniatureKey=nextMiniatureKey;
      if (!cardChanged) notify();
    }
    if (!cardChanged) return snapshot();
    key=nextKey;revision++;result.cardRevision=revision;
    controller?.abort();clearCanvas();revokeImageUrl();prepared=null;
    controller=new AbortController();
    const rules=typeof displaySummary.rulesVersion==='string'?rulesForVersion(displaySummary.rulesVersion):null;
    model=buildResultCardModel({displaySummary,rules,run,locale:currentLocale,revision,verificationState:result.ranked?result.netState:null});
    state=run.appearance.kind==='unknown'?'unavailable':'pending';notify();
    if(state==='pending')void prepare(revision,controller.signal);
    return snapshot();
  }
  const onReturn=()=>{
    if(disposed || visibilityTarget?.hidden)return;
    if(state==='sharing'){state=prepared?'ready':'unavailable';notify();}
  };
  function startShare() {
    refresh();
    if (disposed || !prepared || prepared.revision !== revision || result.cardShareRequest) return null;
    const request = Symbol('native-share');
    const rev = revision;
    result.cardShareRequest = request;
    let share;
    try {
      const text = buildResultShareText({run});
      share = startPreparedResultShare({prepared, currentRevision: rev, text, url: ports.getPublicUrl?.(), navigator, shareImpl: ports.shareImpl});
    } catch {
      share = Promise.resolve('failed');
    }
    if (!share) {
      result.cardShareRequest = null;
      return null;
    }
    state = 'sharing';
    notify();
    return share.then(outcome => {
      if (result.cardShareRequest === request) result.cardShareRequest = null;
      if (current(rev)) {
        state = outcome === 'failed' ? 'failed' : 'ready';
        notify();
      }
      return outcome;
    });
  }
  const api={snapshot,refresh,retry:()=>refresh({},true),revokeImageUrl,
    getImageUrl(){
      refresh();
      if(disposed||!prepared||prepared.revision!==revision)return null;
      if(!imageUrl){try{imageUrl=urlApi?.createObjectURL?.(prepared.blob)??null;}catch{return null;}}
      return imageUrl;
    },
    shareFromX() {
      return Boolean(result.cardShareRequest || startShare());
    },
    async share(){
      const attempted = startShare();
      if (attempted) return attempted;
      if (!disposed && prepared && !result.cardShareRequest) {
        state = 'unavailable';
        notify();
      }
      return 'unavailable';
    },
    dispose(){
      if(disposed)return;disposed=true;controller?.abort();clearCanvas();revokeImageUrl();prepared=null;state='unavailable';
      evidenceUnsubscribe?.();focusTarget?.removeEventListener?.('focus',onReturn);visibilityTarget?.removeEventListener?.('visibilitychange',onReturn);
      if(result.resultCardController===api)result.resultCardController=null;
    },
  };
  result.resultCardController=api;
  const evidenceUnsubscribe=result.evidence?.subscribe?.(()=>refresh());
  focusTarget?.addEventListener?.('focus',onReturn);visibilityTarget?.addEventListener?.('visibilitychange',onReturn);
  refresh();
  return api;
}

export function releaseResultCardResources(result) {
  if(!result)return;
  result.resultCardController?.dispose();
  safeDispose(result.resultPortrait?.portrait);result.resultPortrait=null;
  result.resultRendererOwner?.dispose();result.resultRendererOwner=null;
}
