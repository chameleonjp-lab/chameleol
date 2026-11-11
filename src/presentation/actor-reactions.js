import * as THREE from 'three';

const clamp = n => Math.max(0, Math.min(1, n));
const durations = { glance: 500, sweat: 700, proud: 500, gem: 600, trip: 350, radio: 700, sketch: 1000, binoculars: 800, stop: 500, together: 600, hat: 900 };
const ranks = { glance: 3, sweat: 3, proud: 2, gem: 1, trip: 0, radio: 3, sketch: 1, binoculars: 1, stop: 3, together: 2, hat: 0 };

/** Poses are local visual offsets. Never writes game state, world positions or body materials. */
export function createActorReactions({ hero, police = [], scope, reducedMotion = false } = {}) {
  const officers = police.map(p => p.model ?? p.ferret ?? p);
  let disposed = false, previous = null, heroAction = null, policeAction = null, tailK = 0;
  let lastGlance = -Infinity, sketchUsed = false, tripUsed = false, hatUsed = false, alternate = false;
  const proudUsed = new Set(), gemUsed = new Set(), counts = {};
  let forced = null, pendingSearch = null, searchPropGrace = null;
  const snapshots = new Map(), wrappers = [];
  const resources = [];
  function restore() {
    for (const [node, s] of snapshots) { node.position.copy(s.p); node.rotation.copy(s.r); node.scale.copy(s.s); node.visible = s.v; }
    snapshots.clear();
  }
  function save(node) {
    if (node && !snapshots.has(node)) snapshots.set(node, { p: node.position.clone(), r: node.rotation.clone(), s: node.scale.clone(), v: node.visible });
    return node;
  }
  // Restore before the base animator, then apply offsets after it. This also
  // handles repeated tick calls and fields the base animator does not touch.
  for (const actor of [hero, ...officers].filter(Boolean)) {
    const original = actor.animate;
    if (original) { const wrapped = function (...args) { restore(); return original.apply(this, args); }; actor.animate = wrapped; wrappers.push(() => { if (actor.animate === wrapped) actor.animate = original; }); }
  }
  // Shared immutable prop geometries: one allocation per shape, not per officer.
  const shared = {
    radio: new THREE.BoxGeometry(.15,.25,.12), signal: new THREE.TorusGeometry(.12,.025,4,12,Math.PI),
    sketch: new THREE.BoxGeometry(.42,.55,.04), portrait: new THREE.SphereGeometry(.12,10,8),
    lens: new THREE.CylinderGeometry(.09,.11,.25,10), hat: new THREE.CylinderGeometry(.34,.4,.22,16),
  };
  resources.push(() => Object.values(shared).forEach(g => g.dispose()));
  function mesh(geo, color, parent, position) {
    const material = new THREE.MeshBasicMaterial({ color });
    const object = new THREE.Mesh(geo, material); object.position.set(...position); parent.add(object);
    resources.push(() => { object.removeFromParent(); if (!Object.values(shared).includes(geo)) geo.dispose(); material.dispose(); }); return object;
  }
  const hp = hero?.actorParts;
  const sweat = hp ? mesh(new THREE.SphereGeometry(.07, 8, 6), 0x9fe6ff, hp.head, [-.15,.4,.55]) : null;
  if (sweat) { sweat.scale.set(.6,1.5,.5); sweat.visible = false; }
  const props = officers.map(actor => {
    const parent = actor.actorParts?.head ?? actor.head ?? actor.group;
    if (!parent) return {};
    const radio = mesh(shared.radio, 0x202a3e, parent, [.45,-.12,.48]);
    const signal = mesh(shared.signal, 0xffffc2, parent, [.62,.18,.48]);
    const sketch = mesh(shared.sketch, 0xfff1cc, parent, [.4,-.45,.55]);
    // Fixed comic portrait: deliberately round and unlike the hero, no text.
    const portrait = mesh(shared.portrait,0x7db382,sketch,[0,.04,.04]); portrait.scale.y=.7;
    const binoculars = new THREE.Group(); parent.add(binoculars); binoculars.position.set(.4,.08,.48);
    resources.push(() => binoculars.removeFromParent());
    for (const x of [-.1,.1]) { const lens=mesh(shared.lens,0x222a38,binoculars,[x,0,0]); lens.rotation.x=Math.PI/2; }
    const hat = mesh(shared.hat,0x1f304f,parent,[-.04,.48,0]);
    for (const p of [radio,signal,sketch,binoculars,hat]) p.visible=false;
    return {radio,signal,sketch,binoculars,hat};
  });
  function choose(side, name, t) {
    const current = side === 'hero' ? heroAction : policeAction;
    if (current && t < current.end && ranks[current.name] >= ranks[name]) return false;
    const action = { name, start:t, end:t+durations[name] };
    if (side === 'hero') heroAction=action; else policeAction=action;
    counts[name]=(counts[name]??0)+1; return true;
  }
  function reset() { forced=null; pendingSearch=null; searchPropGrace=null; sketchUsed=tripUsed=hatUsed=alternate=false; proudUsed.clear(); gemUsed.clear(); lastGlance=-Infinity; restore(); hp?.setTailGuard(0); tailK=0; heroAction=policeAction=null; for (const ps of props) for (const p of Object.values(ps)) p.visible=false; if(sweat)sweat.visible=false; previous=null; }
  function event(e) {
    if(disposed || !e || !previous) return;
    const t=Number.isFinite(e.t)?e.t:previous.t;
    if(e.type==='searchStart' && !pendingSearch) pendingSearch={at:t,stage:previous.policeStage,step:0};
  }
  function tick(view) {
    if(disposed || !view) return;
    // Pause retains the rendered pose and props. The scene must also skip base
    // actor animators while paused so their wrapped restoration cannot run.
    if(!view.running && view.phase!=='ended') return;
    restore();
    for(const ps of props) for(const p of Object.values(ps)) p.visible=false;
    if(sweat)sweat.visible=false;
    if(view.phase==='ended'){ reset(); return; }
    if(forced) view={...view,...forced.overrides};
    const t=view.t, old=previous;
    if(old && old.playId!==view.playId) { reset(); sketchUsed=tripUsed=hatUsed=alternate=false; proudUsed.clear();gemUsed.clear();lastGlance=-Infinity; }
    if(!view.running) return;
    const dt=old?Math.max(0,Math.min(100,t-old.t)):0;
    if(heroAction&&t>=heroAction.end)heroAction=null;
    if(policeAction&&t>=policeAction.end)policeAction=null;
    const stage=view.policeStage??0, success=view.matchState==='success';
    if(stage>(old?.policeStage??0)) choose('police','radio',t);
    if(old && stage<old.policeStage) choose('hero','sweat',t);
    const grace=view.phase==='grace' && (!old || old.phase!=='grace' || old.building!==view.building);
    const search=success || (view.phase==='grace' && view.lastEvalSuccess);
    const oldSearch=old && (old.matchState==='success'||(old.phase==='grace'&&old.lastEvalSuccess));
    if(search && !oldSearch && stage && !pendingSearch) pendingSearch={at:t,stage,step:0};
    if(pendingSearch && (!search || !stage || t-pendingSearch.at>1500)) pendingSearch=null;
    if(pendingSearch && !policeAction) {
      const name=pendingSearch.step===0?'stop':'together';
      choose('police',name,t);
      if(pendingSearch.stage===2 && pendingSearch.step===0) pendingSearch.step=1;
      else pendingSearch=null;
    }
    if(success && stage && t-lastGlance>=5000 && stage<2 && choose('hero','glance',t)) lastGlance=t;
    if([3,5,10].includes(view.combo)&&!proudUsed.has(view.combo)) { proudUsed.add(view.combo); if(stage<2)choose('hero','proud',t); }
    if(grace && stage<2 && !heroAction && [10,25,40].includes(view.passed)&&!gemUsed.has(view.passed)) {gemUsed.add(view.passed);choose('hero','gem',t);}
    if(grace && stage<2 && !heroAction && view.building>=30&&!tripUsed){tripUsed=true;choose('hero','trip',t);}
    // Search props follow the radio/stop, without a queue: eligibility remains
    // live only in this successful grace and clears at the next evaluation.
    if(view.phase!=='grace') searchPropGrace=null;
    const graceKey=`${view.playId}:${view.building}`;
    if(stage===1&&view.phase==='grace'&&view.lastEvalSuccess && !policeAction && searchPropGrace!==graceKey) {
      const name=!sketchUsed&&!alternate?'sketch':'binoculars'; if(choose('police',name,t)){searchPropGrace=graceKey;if(name==='sketch')sketchUsed=true;alternate=!alternate;}
    }
    if(grace && stage===1&&view.building>=30&&!hatUsed&&!policeAction){hatUsed=true;choose('police','hat',t);}
    if(heroAction&&t>=heroAction.end)heroAction=null;
    if(policeAction&&t>=policeAction.end)policeAction=null;
    if(stage===2 && heroAction && ranks[heroAction.name]<3)heroAction=null;
    const reduced=typeof reducedMotion==='function'?reducedMotion():reducedMotion;
    const pulse=a=>reduced?1:Math.sin(clamp((t-a.start)/durations[a.name])*Math.PI);
    const target=stage===2?1:0;tailK=reduced?target:tailK+Math.sign(target-tailK)*Math.min(Math.abs(target-tailK),dt/300);hp?.setTailGuard(tailK);
    if(forced?.action){ const side=forced.side; const action={name:forced.action,start:t-100,end:t+durations[forced.action]};if(side==='hero')heroAction=action;else policeAction=action; }
    if(hp){
      if(view.phase==='grace'&&stage<2)for(const leg of hp.legs){save(leg);leg.rotation.z*=.65;} // 21
      if(success){save(hp.jaw);hp.jaw.position.y+=.035;for(const arm of hp.arms){save(arm);arm.rotation.z+=.07;}} // 22
      if(stage===2)for(const arm of hp.arms){save(arm);arm.rotation.z+=.22;} // 23, preserves torso comparison plane
      for(const foot of hp.feet){save(foot);foot.rotation.z*=.8;} // 28 planted soles, base gait owns vertical motion
      if(heroAction){const {name}=heroAction,k=pulse(heroAction);save(hp.head);for(const arm of hp.arms)save(arm);
        if(name==='glance'){hp.head.rotation.y-=.3*k;for(const eye of hp.eyes){save(eye);eye.rotation.y-=.45*k;}}
        if(name==='sweat'){hp.arms[0].rotation.z+=1*k;if(sweat)sweat.visible=true;}
        if(name==='proud'){hp.head.rotation.y+=.35*k;hp.head.rotation.z+=.12*k;for(const eye of hp.eyes){save(eye);eye.scale.y*=.8;}}
        if(name==='gem'){save(hp.jewel);hp.jewel.visible=true;hp.head.rotation.z-=.18*k;hp.setTailGuard(0);}
        if(name==='trip'){hp.arms[0].rotation.z+=.45*k;hp.head.rotation.z-=.13*k;save(hp.legs[0]);hp.legs[0].rotation.z+=.3*k;}
      }
    }
    officers.forEach((actor,i)=>{const p=actor.actorParts;if(!p||i>=stage)return;
      if(stage===2){save(p.head);save(p.arm);p.head.rotation.y+=i===0?-.12:.4;p.arm.rotation.z+=i===0?.25:-.25;} // 31
      if(!policeAction)return;const {name}=policeAction,k=pulse(policeAction);save(p.head);save(p.arm);
      if(name==='radio'&&i===stage-1){
        const radio=save(props[i].radio);
        radio.visible=props[i].signal.visible=true;
        // Head-local rest at the chest, raised to the side of the muzzle.
        radio.position.set(.34+.22*k,-.7+.55*k,.48);
        radio.rotation.z=-.18*k;
        p.arm.rotation.z+=1.1*k;
      }
      if(name==='stop'){for(const leg of p.legs){save(leg);leg.rotation.z=(reduced?0:Math.sin((t-policeAction.start)*.035))*.16;}}
      if(name==='together'){p.head.rotation.y+=(i===0?-.65:.65)*k;}
      if(['sketch','binoculars'].includes(name)&&i===0){
        const prop=save(props[i][name]);prop.visible=true;
        if(name==='binoculars'){
          // Raise from the chest to the existing eye line; no world motion.
          prop.position.set(.32+.08*k,-.65+.73*k,.48);
          prop.rotation.z=-.12*(1-k);
        }
        p.arm.rotation.z+=1.2*k;p.head.rotation.z-=.14*k;
      }
      if(name==='hat'&&i===0){if(p.hat){save(p.hat);p.hat.visible=false;}props[i].hat.visible=true;props[i].hat.position.set(-.04+(reduced?0:.55*k),.48+(reduced?0:.45*k),0);p.arm.rotation.z+=1.2*k;}
    });
    previous={...view};
  }
  function dispose(){if(disposed)return;reset();disposed=true;wrappers.forEach(f=>f());resources.forEach(f=>f());}
  const ids = [21,22,23,24,25,26,27,28,29,30,31,32,33,35,37,38,40];
  function forceEffect(id, view) {
    if(!ids.includes(Number(id))) return false;
    const n=Number(id), heroNames={25:'glance',26:'sweat',27:'trip',29:'proud',30:'gem'}, policeNames={32:'radio',33:'sketch',35:'stop',37:'binoculars',38:'together',40:'hat'};
    forced={ overrides:{running:true,phase:n===22?'eval':'grace',policeStage:[23,24,31,38].includes(n)?2:[25,32,33,35,37,40].includes(n)?1:0,matchState:n===22||n===25?'success':null}, action:heroNames[n]??policeNames[n],side:heroNames[n]?'hero':'police',id:n };
    if(n===24)tailK=1;
    if(view)tick(view);return true;
  }
  scope?.own(dispose);
  return {tick,event,reset,dispose,forceEffect,stats:()=>({activeIds:forced?[forced.id]:[...(previous?.phase==='grace'?[21]:[]),...(previous?.matchState==='success'?[22]:[]),...(previous?.policeStage===2?[23,24,31]:[]),28,...({glance:[25],sweat:[26],trip:[27],proud:[29],gem:[30]}[heroAction?.name]??[]),...({radio:[32],sketch:[33],stop:[35],binoculars:[37],together:[38],hat:[40]}[policeAction?.name]??[])],hero:heroAction?.name??null,police:policeAction?.name??null,tail:tailK,counts:{...counts},props:props.length*5})};
}
