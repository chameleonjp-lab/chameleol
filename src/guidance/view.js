import { h } from '../ui/dom.js';
import { t } from '../i18n/i18n.js';
export function mountGuidance({host,controls,onContinue=()=>{},onSkip=()=>{}}) {
  const title=h('span',{class:'guidance-title'}),value=h('strong',{class:'guidance-match'}),status=h('span',{class:'guidance-status'});
  const next=h('button',{class:'btn primary','data-testid':'guide-go',onClick:onContinue},t('guidance.continue'));
  const skip=h('button',{class:'btn','data-testid':'guide-skip',onClick:onSkip},t('guidance.skip'));
  const el=h('div',{class:'guidance-panel','data-testid':'guidance'},[title,value,status,h('span',{class:'guidance-instruction'},t('guidance.instruction')),h('div',{class:'guidance-actions'},[next,skip])]);host.append(el);
  return {el,render(v){el.hidden=!v?.step;if(!v?.step){controls.setGuideTarget(null);return;}title.textContent=t(`guidance.step${v.step}`);value.textContent=`${(v.matchUnits/1000000).toFixed(2)}%`;status.textContent=t(v.matchUnits>=95000000?'guidance.ready':'guidance.almost');next.hidden=!v.stationary;next.disabled=!v.canContinue;controls.setGuideTarget({...v.target,showBrightness:v.step>=3});},dispose(){controls.setGuideTarget(null);el.remove();}};
}
