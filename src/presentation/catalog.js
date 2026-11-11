// Original idea numbers are stable; excluded effects must never enter the catalog.
export const EXCLUDED_EFFECT_IDS = Object.freeze([
  20, 34, 39, 44, 45, 51, 56, 67, 68, 69, 72, 75, 76, 84, 86, 87, 88, 90, 94, 97,
]);
export const ACCEPTED_EFFECT_IDS = Object.freeze(
  Array.from({ length: 100 }, (_, index) => index + 1).filter((id) => !EXCLUDED_EFFECT_IDS.includes(id)),
);

// Acceptance budgets; allocation and effect selection belong to later tasks.
export const PRESENTATION_LIMITS = Object.freeze({
  streetSlots: 7,
  staticDecorations: 24,
  backgroundGroups: 1,
  backgroundBirds: 3,
  ambientParticles: 8,
  successRings: 1,
  additionalDrawCalls: 12,
  additionalGeometries: 16,
  additionalTextures: 4,
  compressedImageBytes: 1.5 * 1024 * 1024,
  decodedImageBytes: 16 * 1024 * 1024,
});

// An independent stream: never consumes course/decorations RNG state.
export function createCosmeticRng(seed=0xCA4E1E0) {
  let state=seed>>>0;
  return ()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
}
export const CAMEOS=Object.freeze([{id:12,weight:15,ms:1200},{id:13,weight:12,ms:2000},{id:14,weight:15,ms:1500},{id:15,weight:12,ms:2000},{id:16,weight:10,ms:2000},{id:36,weight:12,ms:2000},{id:61,weight:3,ms:1500},{id:65,weight:6,ms:2000},{id:70,weight:5,ms:1200}]);
export function createCameoDirector({random=createCosmeticRng()}={}) {
  let count=0,last=-Infinity,slow=0,disabled=false;
  return {enter({t,building}){if(disabled||count>=6||t-last<15000)return null;let n=random()*100;const pick=CAMEOS.find(x=>(n-=x.weight)<0);if(!pick||(pick.id===65&&building>=23))return null;count++;last=t;return {...pick,start:t};},frame(ms){slow=ms>50&&ms<1000?slow+1:0;if(slow>=30)disabled=true;},stats:()=>({count,disabled,slow})};
}
export function createSlotRegistry(){const slots=new Map();return {sync(id,building){const old=slots.get(id);if(old?.building!==building)slots.set(id,{building,start:null});},react(building,t){for(const s of slots.values())if(s.building===building)s.start=t;},reaction(id,t){const s=slots.get(id);return s?.start!==null&&s?.start!==undefined&&t-s.start<500?Math.sin(Math.PI*(t-s.start)/500):0;},clear(){slots.clear();}};}
