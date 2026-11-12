import { h } from '../ui/dom.js';
import { t } from '../i18n/i18n.js';
export function mountGuidance({host,controls}) {
  const el=h('div',{class:'guidance-panel','data-testid':'guidance',hidden:true,role:'status'},t('guidance.wall'));host.append(el);
  return {el,render(v){el.hidden=!v?.step||v.complete;if(el.hidden){controls.setGuideTarget(null);return;}el.textContent=t('guidance.wall');controls.setGuideTarget({...v.target,showBrightness:v.step>=3});},dispose(){controls.setGuideTarget(null);el.remove();}};
}
