import * as THREE from 'three';
import { createCameoDirector, createSlotRegistry, createCosmeticRng, CAMEOS } from './catalog.js';

const CELLS=['pavement0','pavement1','pavement2','pavement3','pavement4','interior0','interior1','interior2','alley0','alley1','sign','plant','laundry','awning','fan','leaf','smoke','steam','vending','can','poster0','poster1','poster2','chameleon','manhole0','manhole1','manhole2','manhole3','manhole4','windows','resident','cat','bird','bicycle','bus','policeCar','ufo','rainbow','flag','remaining1','remaining2','remaining3','remaining4','remaining5','chimney','windowsWave','chameleonWink','manholeWink0','manholeWink1','manholeWink2','manholeWink3','manholeWink4','landmark0','landmark1','landmark2','landmark3','landmark4','awningFlip','vendingLit','pipe','residentFace'];
const district=b=>b<20?0:b<23?1:b<30?2:b<40?3:4;
const ENTRY=[1,20,23,30,40];
const streetFeature=b=>({0:5,1:6,2:7,3:8,4:18,5:19,6:62,7:63,8:64,9:66}[b%10]);
const DURATIONS=new Map(CAMEOS.map(x=>[x.id,x.ms]));
const CAMEO_IMAGES={12:'resident',13:'cat',14:'bird',15:'bicycle',16:'bus',36:'policeCar',61:'ufo',65:'rainbow',70:'chameleon'};

/** Read-only street presentation. Slots retain the existing index/cx/height/width contract. */
export function createStreetAccents({scene,camera=null,slots=[],atlas=null,scope=null,seed,reducedMotion=false}={}) {
  const registry=createSlotRegistry(),director=createCameoDirector(seed===undefined?{}:{random:createCosmeticRng(seed)});
  let disposed=false,t=0,priorityUntil=-Infinity,previousT=null,previousPhase=null,current=1,gateStart=0,best=null,bestPassed=false,bestPassedAt=-Infinity,cameo=null,forced=null,forcedStart=0,graceStart=-Infinity,graceBuilding=1,blink=-Infinity;
  const winked=new Set();
  const group=new THREE.Group();group.name='street-accents';scene.add(group);
  const texture=atlas?.isTexture?atlas:atlas?.texture?.isTexture?atlas.texture:typeof document!=='undefined'?new THREE.TextureLoader().load(new URL('./assets/atlas.webp',import.meta.url).href):null;
  const ownsTexture=texture&&texture!==atlas&&texture!==atlas?.texture;
  if(texture){texture.colorSpace=THREE.NoColorSpace;texture.minFilter=THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;}
  // Every added pixel obeys the same comparison-face stencil as the street's shadows.
  const safe=m=>{m.fog=false;m.toneMapped=false;m.stencilWrite=true;m.stencilRef=1;m.stencilWriteMask=0;m.stencilFunc=THREE.NotEqualStencilFunc;m.stencilFail=THREE.KeepStencilOp;m.stencilZFail=THREE.KeepStencilOp;m.stencilZPass=THREE.KeepStencilOp;return m;};
  const planeGeometry=new THREE.PlaneGeometry(1,1);
  const tile=new THREE.InstancedBufferAttribute(new Float32Array(48*2),2);planeGeometry.setAttribute('atlasOffset',tile);
  const spriteMaterial=safe(new THREE.MeshBasicMaterial({map:texture,alphaTest:.2,side:THREE.DoubleSide,depthWrite:true}));
  spriteMaterial.onBeforeCompile=shader=>{shader.vertexShader='attribute vec2 atlasOffset;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>','#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = (vMapUv + atlasOffset) / 8.0;\n#endif');};
  spriteMaterial.customProgramCacheKey=()=> 'street-atlas-v1';
  const sprites=new THREE.InstancedMesh(planeGeometry,spriteMaterial,48);sprites.name='street-accent-atlas';sprites.frustumCulled=false;sprites.renderOrder=5;group.add(sprites);
  // Window-only exception: each quad is bounded by an existing opaque decorative glass pane.
  // It shares the atlas/plane geometry; reserved instance indices 40..46 avoid changing sprite UVs.
  const interiorMaterial=spriteMaterial.clone();interiorMaterial.stencilWrite=false;
  interiorMaterial.onBeforeCompile=spriteMaterial.onBeforeCompile;interiorMaterial.customProgramCacheKey=spriteMaterial.customProgramCacheKey;
  const interiors=new THREE.InstancedMesh(planeGeometry,interiorMaterial,48);interiors.name='street-shop-interiors';interiors.frustumCulled=false;interiors.renderOrder=5;group.add(interiors);
  const hiddenMatrix=new THREE.Matrix4().makeScale(0,0,0);for(let i=0;i<48;i++)interiors.setMatrixAt(i,hiddenMatrix);
  const cameoMaterial=safe(spriteMaterial.clone());cameoMaterial.depthTest=false;cameoMaterial.depthWrite=false;
  cameoMaterial.onBeforeCompile=spriteMaterial.onBeforeCompile;cameoMaterial.customProgramCacheKey=spriteMaterial.customProgramCacheKey;
  const cameoSprites=new THREE.InstancedMesh(planeGeometry,cameoMaterial,48);cameoSprites.name='street-cameos';cameoSprites.frustumCulled=false;cameoSprites.renderOrder=6;group.add(cameoSprites);
  for(let i=0;i<48;i++)cameoSprites.setMatrixAt(i,hiddenMatrix);
  const boxGeometry=new THREE.BoxGeometry(1,1,1),roofGeometry=new THREE.ConeGeometry(1,1,4);
  const solidMaterial=safe(new THREE.MeshBasicMaterial({color:0xffffff}));
  const boxes=new THREE.InstancedMesh(boxGeometry,solidMaterial,24),roofs=new THREE.InstancedMesh(roofGeometry,solidMaterial,7);
  for(const mesh of [boxes,roofs]){mesh.frustumCulled=false;mesh.renderOrder=5;group.add(mesh);}
  const dummy=new THREE.Object3D(),color=new THREE.Color();let np=0,nb=0,nr=0,ni=0,residentWindows=0,staticN=0,particles=0,visibleCameos=0;const artwork=[];
  const place=(mesh,i,x,y,z,sx,sy,sz=1,rz=0,rx=0,ry=0)=>{dummy.position.set(x,y,z);dummy.scale.set(sx,sy,sz);dummy.rotation.set(rx,ry,rz);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);};
  const sprite=(name,x,y,z,w,h,rz=0,rx=0,kind='static')=>{if(np>=40||kind==='static'&&staticN>=24)return;if(kind==='cameo'){const index=45+visibleCameos;if(index>=48)return;artwork.push(name);const cell=CELLS.indexOf(name);tile.setXY(index,cell%8,7-Math.floor(cell/8));place(cameoSprites,index,x,y,z,w,h,1,rz,rx);visibleCameos++;return;}artwork.push(name);const cell=Math.max(0,CELLS.indexOf(name));tile.setXY(np,cell%8,7-Math.floor(cell/8));place(sprites,np++,x,y,z,w,h,1,rz,rx);if(kind==='static')staticN++;else if(kind==='particle')particles++;};
  const box=(x,y,z,w,h,d,c=0xaab3bc,rz=0)=>{if(staticN>=24)return;place(boxes,nb,x,y,z,w,h,d,rz);boxes.setColorAt(nb++,color.setHex(c));staticN++;};
  function syncSlot(id,building){if(disposed)return;registry.sync(id,building);}
  function draw(view={}) {
    np=nb=nr=ni=residentWindows=staticN=particles=visibleCameos=0;for(let i=40;i<48;i++)interiors.setMatrixAt(i,hiddenMatrix);for(let i=45;i<48;i++)cameoSprites.setMatrixAt(i,hiddenMatrix);artwork.length=0;
    const area=district(current),cx=(current-1)*10+5;
    const visible=slots.filter(s=>s.index>0&&s.group?.visible!==false);
    const residentSlot=cameo?.id===12?visible.find(s=>s.index===cameo.building&&s.deco?.windows>0):null;
    if(cameo?.id===12&&(!residentSlot||t-cameo.start>=cameo.ms))cameo=null;
    const windowWave=current>=40&&view.phase==='grace'&&t-graceStart<800;
    const furnishingSlots=[...visible].sort((a,b)=>Math.abs(a.index-current)-Math.abs(b.index-current)).slice(0,Math.max(1,(forced===59?2:5-(windowWave?1:0)-(t-gateStart<800||forced===11?1:0))-(visible.some(s=>s.index===current&&s.deco?.kind==='shop')?1:0)));
    const sourceAge=t-graceStart,sourceFeature=forced??streetFeature(graceBuilding);
    const reacting=visible.find(s=>registry.reaction(slots.indexOf(s),t)>0);
    for(const s of visible){
      const b=s.index,a=district(b),x=s.cx??(b-1)*10+5,h=s.height??7;
      // Three roof silhouettes, shared pyramid/flat geometry. Never cover the front wall.
      if(b%3===0){box(x,h+.35,-2,s.width??8,.5,3,0xb8aa98);}else{
        place(roofs,nr,x,h+.65,-2,(s.width??8)*.68,b%3===1?1.3:2.1,b%3===1?2.5:1.4,0,0,Math.PI/4);roofs.setColorAt(nr++,color.setHex([0xbba38e,0x9fbdaf,0xc2a08b,0x99adbd,0x7e8ca7][a]));staticN++;
      }
      sprite(`pavement${a}`,x,.235,3.7,8.6,1.0,0,-Math.PI/2);
      let name=`alley${Math.floor(b/4)%2}`;
      let px=name.startsWith('alley')?x+(s.width??8.7)/2+.6:x,py=name.startsWith('alley')?2:h+.85,pz=-.12,w=name.startsWith('alley')?1.05:2.0,ph=name.startsWith('alley')?3.4:1.4,rz=0,rx=0;
      const retainSource=b===graceBuilding&&sourceAge>=0&&(sourceFeature===19&&sourceAge<1500||sourceFeature===8&&b%20>=10&&sourceAge<1000);
      if(b===current||retainSource){
        const type=retainSource?sourceFeature:forced??streetFeature(b);
        if((type===5||type===47)&&(!reacting||reacting===s)){name='sign';py=h+1;ph=1.2;w=2.5;rz=registry.reaction(slots.indexOf(s),t)*.13||(reducedMotion?0:Math.sin(t/1200*Math.PI*2)*Math.PI/60);}
        if(type===6&&(s.deco?.kind==='house'||forced===6)){name=b%20<10?'plant':'laundry';py=h+.4;w=1.6;ph=1.7;rz=!reducedMotion&&name==='laundry'?Math.sin(t/2000*Math.PI*2)*Math.PI/90:0;}
        if(type===7){name='awning';py=h+.15;w=2.5;ph=1;if(!reducedMotion&&(view.phase==='grace'||forced===7)&&t-graceStart<800&&t-graceStart>=0)name='awningFlip';}
        if(type===8){name=b%20<10?'fan':'pipe';py=h+.7;w=ph=1;rz=reducedMotion||name==='pipe'?0:t/8000*Math.PI*2;}
        if(type===18){name=!reducedMotion&&(view.phase==='grace'||forced===18)&&t-graceStart<1000?'vendingLit':'vending';px=x+5;py=1.05;w=1.2;ph=2;}
        if(type===19){name='chimney';py=h+1;w=ph=1.3;}
        if(type===64){name='chameleon';py=h+.8;w=1.6;ph=1;if(b===current&&(view.phase==='grace'||forced===64)&&t-graceStart<400&&!reducedMotion)name='chameleonWink';}
        if(type===66&&(current>=40||forced===66)){name='windows';py=h+1;w=2.4;ph=1;if(!reducedMotion&&(view.phase==='grace'||forced===66)&&t-graceStart<800&&Math.floor((t-graceStart)/200)%2===1)name='windowsWave';}
      }
      const response=registry.reaction(slots.indexOf(s),t);
      if(response>0){name='sign';px=x;py=h+1;w=2.5;ph=1.2;rx=0;rz=reducedMotion?0:response*.13;}
      if(b===current&&(b>=46||forced===58)){name=`remaining${b>=46?51-b:5}`;py=h+1;w=1.4;ph=1.4;rx=0;pz=-.1;}
      if(furnishingSlots.includes(s)&&!(forced===59&&visible.indexOf(s)>=3)){
        if(cameo?.id===12&&s===residentSlot){
          const n=s.deco.windows,k=Math.floor(n/2),instance=40+ni++,cell=CELLS.indexOf('residentFace');
          const reveal=reducedMotion?1:Math.max(0,Math.sin((t-cameo.start)/cameo.ms*Math.PI));
          const cy=Math.min(Math.max(h-1.15,5.95),6.9);
          tile.setXY(instance,cell%8,7-Math.floor(cell/8));
          place(interiors,instance,x+(k-(n-1)/2)*2.15,cy-.28+.3*reveal,.31,1.08,.5+.3*reveal);
          artwork.push('residentFace');residentWindows++;
        }else if(s.deco?.kind==='shop'&&s.deco.windows>0&&staticN<24){
          const n=s.deco.windows,k=Math.floor(n/2),cell=CELLS.indexOf(`interior${b%3}`),instance=40+ni++;
          tile.setXY(instance,cell%8,7-Math.floor(cell/8));
          place(interiors,instance,x+(k-(n-1)/2)*2.15,Math.min(Math.max(h-1.15,5.95),6.9),.3,1.2,1.08);
          artwork.push(`interior${b%3}`);staticN++;
          if(b===current&&!name.startsWith('alley'))sprite(name,px,py,pz,w,ph,rz,rx);
        }else sprite(name,px,py,pz,w,ph,rz,rx);
      }
    }
    // Persistent district and progress props do not depend on the decorative lottery.
    sprite(!reducedMotion&&t-blink<150?`manholeWink${area}`:`manhole${area}`,cx,.245,3.6,1.15,1.15,0,-Math.PI/2);
    const currentHeight=visible.find(s=>s.index===current)?.height??8;
    sprite(`poster${current>=40?2:current>=20?1:0}`,cx-2.5,currentHeight+.9,-.1,.9,1.3);
    // One district-specific skyline landmark, entirely behind the buildings.
    const lx=cx+14;
    sprite(`landmark${area}`,lx,11,-14,area===3?7:5,area===4?16:9);
    if(forced===59){const p=reducedMotion?1:Math.max(0,Math.min(1,(t-forcedStart)/800));box(cx-3,7,-3,.5,10,1,0xd8c29e);box(cx+3,7,-3,.5,10,1,0xd8c29e);box(cx,12,-3,7,.7,1,0xd8c29e);box(cx-1.5-p*1.5,7,-3,3*(1-p)+.02,8,.3,0xb19f78);box(cx+1.5+p*1.5,7,-3,3*(1-p)+.02,8,.3,0xb19f78);}
    else if(t-gateStart<800||forced===11){box(cx+5,7,-3,.7,9,1,0xd8c29e);box(cx+9,7,-3,.7,9,1,0xd8c29e);box(cx+7,11,-3,4.5,.8,1,0xd8c29e);}
    else {
      if(windowWave){sprite(!reducedMotion&&Math.floor((t-graceStart)/200)%2===1?'windowsWave':'windows',lx+7,11,-13,5,4);}
      if(current>=40||forced===57)box(cx+5,9,-10,24,.7,2,0x74869c);
      if(best!==null&&Math.abs(current-best)<=3||forced===53){sprite('flag',(forced===53?current:best)*10,.9,-.6,1.8,2.4,bestPassed&&t-bestPassedAt<600&&!reducedMotion?Math.sin(t/130)*.07:0);}
    }
    if(!reducedMotion&&(view.phase==='grace'||[7,17,18,19,64,66].includes(forced))){
      const age=t-graceStart;
      const particleX=(graceBuilding-1)*10+5;
      const feature=forced??({0:5,1:6,2:7,3:8,4:18,5:19,6:62,7:63,8:64,9:66}[graceBuilding%10]);
      if(age>=0&&age<800)for(let i=0;i<3;i++)sprite('leaf',particleX-3+i*1.3+age/800,.36,3.8+i*.13,.3,.3,age/400+i,-Math.PI/2,'particle');
      // At most one chimney and two steam cards: the eight-card shared pool.
      if(feature===19&&age>=0&&age<1500)for(let i=0;i<3;i++)sprite('smoke',particleX+.1+Math.sin(i+age/700)*.2,(slots.find(s=>s.index===graceBuilding)?.height??7)+1+i*.6+age/1500,-1,.6,.6,0,0,'particle');
      if(feature===8&&graceBuilding%20>=10&&age>=0&&age<1000)for(let i=0;i<2;i++)sprite('steam',particleX+.2,(slots.find(s=>s.index===graceBuilding)?.height??7)+1+i*.4+age/1000,-.3,.4,.5,0,0,'particle');
      if(feature===18&&age>=0&&age<1000){sprite('can',cx+5,1.3-Math.sin(age/1000*Math.PI)*.35,-.2,.25,.45,0,0,'reaction');}
    }
    if(cameo){const elapsed=t-cameo.start,progress=elapsed/cameo.ms,p=reducedMotion?.5:progress;if(progress>=1||progress<0||Math.abs(current-cameo.building)>1)cameo=null;else if(cameo.id!==12){
      const id=cameo.id,name=CAMEO_IMAGES[id],anchor=(cameo.building-1)*10+5,height=slots.find(s=>s.index===cameo.building)?.height??7;
      const travel=[14,15,16,36,61].includes(id);let x=anchor+(travel?(p*28-14):2),y=[12,13,70].includes(id)?height+Math.sin(p*Math.PI)*.6+.7:id===65?height+6:id===61?height+4:id===14?height+3:1.3;
      if(id===65){x=anchor-.8;y=height+1.8;}
      if(id===12){x=anchor-3;y=height+1.5+Math.sin(p*Math.PI)*.35;}
      if(id===13||id===70){x=anchor-2.8;y=height+1.6+Math.sin(p*Math.PI)*.3;}
      const count=id===14?3:1;for(let i=0;i<count;i++)sprite(name,x-i*1.2,y+(i%2)*.6,-8,id===65?3.6:id===16?5:id===36?3.5:id===15?2.8:id===13?1.4+Math.sin(p*Math.PI)*.6:1.4,id===65?2.2:id===16?2:1.4,id===14&&!reducedMotion?Math.sin(p*24)*.15:0,0,'cameo');
      if(camera){
        camera.updateMatrixWorld();
        const moving=[14,15,16,36,61].includes(id),ndcX=moving?-1.15+p*2.3:.22;
        const ndcY=[15,16,36].includes(id)?-.53:id===65?.65:id===12?.64+Math.sin(p*Math.PI)*.015:.61+Math.sin(p*Math.PI)*.04;
        const widthNdc=id===65?.48:id===16?.34:id===36?.26:id===15?.2:id===12?.26:.16;
        const heightNdc=id===65?.18:id===16?.15:id===12?.28:.17;
        const distance=18,worldHeight=2*Math.tan(camera.fov*Math.PI/360)*distance;
        for(let i=0;i<count;i++){
          const point=new THREE.Vector3(ndcX-i*.13,ndcY+(i%2)*.04,0).unproject(camera);
          point.sub(camera.position).normalize().multiplyScalar(distance).add(camera.position);
          dummy.position.copy(point);dummy.scale.set(widthNdc*worldHeight*camera.aspect/2,heightNdc*worldHeight/2,1);
          dummy.quaternion.copy(camera.quaternion);if(id===14&&!reducedMotion)dummy.rotateZ(Math.sin(p*24)*.15);dummy.updateMatrix();cameoSprites.setMatrixAt(45+i,dummy.matrix);
        }
      }
    }}
    cameoSprites.count=visibleCameos?45+visibleCameos:0;cameoSprites.instanceMatrix.needsUpdate=true;sprites.count=np;boxes.count=nb;roofs.count=nr;interiors.count=ni?40+ni:0;interiors.instanceMatrix.needsUpdate=true;tile.needsUpdate=true;for(const mesh of [sprites,boxes,roofs]){mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;}
  }
  function higherPriority(view){return t<priorityUntil||view.phase==='ended'||(view.policeStage??0)>=2||view.matchState==='danger'||view.matchState==='success'||view.lastEvalSuccess===true||view.guideActive===true||view.guidanceActive===true||['ending','danger','success','milestone','guidance'].includes(view.priority)||t-gateStart<800||bestPassed&&t-bestPassedAt<600;}
  function tick(view){if(disposed)return;if(!view.running){previousT=null;director.frame(0);if(Number.isInteger(view.building))current=view.building;draw(view);return;}
    const next=Number.isFinite(view.t)?view.t:t;director.frame(previousT===null?0:Math.max(0,next-previousT));previousT=next;t=next;
    if(view.building!==current){current=view.building;if(ENTRY.includes(current))gateStart=t;}
    if(previousPhase!==view.phase&&view.phase==='grace'){graceStart=t;graceBuilding=current;if(!higherPriority(view)){const pick=director.enter({t,building:current});if(pick)cameo={...pick,building:current};}if(!winked.has(current)){winked.add(current);} }
    if(t-blink>=2000)blink=t;
    if(best!==null&&!bestPassed&&(view.passed??0)>best){bestPassed=true;bestPassedAt=t;}
    if(higherPriority(view)&&!CAMEO_IMAGES[forced])cameo=null;
    previousPhase=view.phase;draw(view);
  }
  function event(e){if(disposed)return;if(['instantSuccess','unlockBrightness','enterBuilding'].includes(e.type)){const duration=e.type==='instantSuccess'?450:e.type==='unlockBrightness'?600:(e.building>=46?800:0);priorityUntil=Math.max(priorityUntil,(e.t??t)+duration);if(duration)cameo=null;}if(e.type==='pass'&&e.success===true)registry.react(e.building??current,e.t??t);}
  function setBestDistance(value){best=Number.isInteger(value)&&value>=0&&value<=50?value:null;bestPassed=false;bestPassedAt=-Infinity;}
  function ending(kind,elapsed){if(disposed)return;cameo=null;particles=visibleCameos=0;artwork.length=0;if(kind!=='cleared'){draw({phase:'ended'});return;}np=nb=nr=staticN=0;const x=500,p=reducedMotion?1:Math.max(0,Math.min(1,elapsed/800));box(x,5,-2,.6,10,1,0xc6b58b);box(x+9,5,-2,.6,10,1,0xc6b58b);box(x+4.5,10,-2,10,.6,1,0xc6b58b);box(x+2.2-p*2.2,4,-2,4.4*(1-p)+.02,8,.3,0xb19f78);box(x+6.8+p*2.2,4,-2,4.4*(1-p)+.02,8,.3,0xb19f78);sprites.count=0;roofs.count=0;interiors.count=0;cameoSprites.count=0;boxes.count=nb;boxes.instanceMatrix.needsUpdate=true;}
  function forceEffect(id){if(![1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,36,47,53,57,58,59,61,62,63,64,65,66,70].includes(id)||disposed)return false;forced=id;forcedStart=t;if([7,17,18,19,64,66].includes(id))graceStart=t;if(id===47)registry.react(current,t-1);if(CAMEO_IMAGES[id])cameo={id,start:t,ms:DURATIONS.get(id),building:current};if(id===11)gateStart=t;return true;}
  function stats(){return {visibleArtwork:[...artwork],activeIds:forced&&(!CAMEO_IMAGES[forced]||cameo?.id===forced)?[forced]:[],staticDecorations:staticN,ambientParticles:particles,backgroundGroups:cameo?1:0,backgroundBirds:cameo?.id===14?visibleCameos:0,shopInteriors:ni-residentWindows,residentWindows,drawCalls:5,geometries:3,textures:texture?1:0,...director.stats()};}
  function dispose(){if(disposed)return;disposed=true;registry.clear();winked.clear();cameo=null;group.removeFromParent();planeGeometry.dispose();boxGeometry.dispose();roofGeometry.dispose();spriteMaterial.dispose();interiorMaterial.dispose();cameoMaterial.dispose();solidMaterial.dispose();if(ownsTexture)texture.dispose();}
  scope?.own(dispose);draw({phase:'eval'});
  return {tick,event,syncSlot,setBestDistance,ending,stats,dispose,forceEffect};
}
