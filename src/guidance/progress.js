export const GUIDE_PROGRESS_KEY = ['guide', 'progress', 'v1'].join('.');
const group = (raw) => { const v=raw && typeof raw==='object' ? raw : {}; return ({ consumed: v.consumed === true, ownerPlayId: typeof v.ownerPlayId === 'string' && v.ownerPlayId.length <= 128 ? v.ownerPlayId || null : null, shownMask: Number.isInteger(v.shownMask) ? v.shownMask & 3 : 0, staticDone: v.staticDone === true }); };
export function normalizeGuideProgress(raw, legacyFlags = {}, legacyRun = null) {
  if (raw?.version === 1) {
    const p={version:1,basic:group(raw.basic),brightness:group(raw.brightness)};
    for(const g of [p.basic,p.brightness]) { if(!g.consumed) {g.ownerPlayId=null;g.shownMask=0;g.staticDone=false;} }
    if(new TextEncoder().encode(JSON.stringify(p)).length>1024) {p.basic.ownerPlayId=null;p.brightness.ownerPlayId=null;}
    return p;
  }
  return {version:1,basic:group({consumed:!!legacyRun || legacyFlags.guideSeen === true}),brightness:group({consumed:legacyFlags.brightnessPractice === true || legacyRun?.state?.brightnessUnlocked === true || legacyRun?.snapshot?.state?.brightnessUnlocked === true})};
}
export function claimGroup(raw, name, playId) {
  if (!['basic','brightness'].includes(name) || typeof playId !== 'string' || !playId.length || playId.length > 128) throw new TypeError('invalid_guide_owner');
  const progress=normalizeGuideProgress(raw);const g=progress[name];
  if (!g.consumed) Object.assign(g,{consumed:true,ownerPlayId:playId});
  const bounded=normalizeGuideProgress(progress);
  return {owned:bounded[name].ownerPlayId === playId,progress:bounded};
}
export function updateGroup(raw,{group:name,playId,shownMask=0,staticDone=false}) {
  const progress=normalizeGuideProgress(raw);if (!['basic','brightness'].includes(name)) throw new TypeError('invalid_guide_group');
  const g=progress[name];if(g.ownerPlayId===playId && g.consumed){g.shownMask|=(Number.isInteger(shownMask)?shownMask:0)&3;g.staticDone ||= staticDone===true;}return progress;
}

/** Durable consumption wins ownership conflicts; fallback can only advance progress. */
export function mergeGuideProgress(durable, fallback) {
  const result=normalizeGuideProgress(durable), local=normalizeGuideProgress(fallback);
  for(const name of ['basic','brightness']) {
    const saved=result[name], memory=local[name];
    if(!saved.consumed && memory.consumed) result[name]={...memory};
    else if(saved.consumed && memory.consumed && saved.ownerPlayId===memory.ownerPlayId) {
      saved.shownMask |= memory.shownMask;
      saved.staticDone ||= memory.staticDone;
    }
  }
  return normalizeGuideProgress(result);
}
