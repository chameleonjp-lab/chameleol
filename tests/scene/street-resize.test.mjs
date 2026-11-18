// CPU execution of street.js's complete real resize function, with a real Three camera and
// street-accents instances. Only WebGL/canvas/sky hosts are replaced; no resize body is copied.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {makeDecorations} from '../../src/rules/v1/index.js';
import {createStreetAccents} from '../../src/presentation/street-accents.js';
import {captureAtlasCell} from '../presentation/atlas-capture.mjs';

const source=readFileSync(new URL('../../src/scene/street.js',import.meta.url),'utf8');
function wholeFunction(start,next){
 assert.equal(source.split(start).length,2,`real source boundary must occur exactly once: ${start}`);
 assert.equal(source.split(next).length,2,`real source boundary must occur exactly once: ${next}`);
 const begin=source.indexOf(start),end=source.indexOf(next,begin);
 assert.ok(end>begin,'the next source boundary must follow the whole function');
 const body=source.slice(begin,end).trim();assert.ok(body.endsWith('}'),'read the complete function through its closing brace');
 // Compilation also rejects a missing closing brace or any trailing partial declaration.
 return env=>new Function('env',`with(env){return (${body});}`)(env);
}
const bindResize=wholeFunction('  function resize() {','\n  function assignSlots(current) {');
const bindNdc=wholeFunction('  function ndcToCam(nx, ny, depth, out) {','\n  let disposed = false;');
const atlas=JSON.parse(readFileSync(new URL('../../src/presentation/assets/atlas.json',import.meta.url),'utf8'));

function fixture(width,height){
 let rect={width,height};const canvasSizes=[];
 const skyPos=new Float32Array(18),skyGeo=new THREE.BufferGeometry();skyGeo.setAttribute('position',new THREE.BufferAttribute(skyPos,3));
 const starGeo=new THREE.BufferGeometry();starGeo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(6),3));
 const env={disposed:false,lastArgs:null,opening:false,extended:true,viewW:1,viewH:1,hudBottom:76,
  container:{getBoundingClientRect:()=>rect},renderer:{setSize:(w,h)=>canvasSizes.push([w,h])},
  camera:new THREE.PerspectiveCamera(44,.78,.5,700),THREE,CAM:{dx:3.2,y:5.2,z:22,lookDx:6,lookY:4.2,lookZ:0,fov:44},
  SCREEN_X:.38,SCREEN_Y:.31,SIDEWALK_Y:.22,HERO_Z:2.5,
  camQuat:new THREE.Quaternion(),heroNdc:{},horizonNdc:0,v3:new THREE.Vector3(),
  sky:new THREE.Object3D(),skyPos,skyGeo,starGeo,STAR_N:2,starNdc:[-.2,.5,.3,.7],
  moon:new THREE.Object3D(),darkPlane:new THREE.Object3D(),refreshGlass:{dirty:false}};
 env.ndcToCam=bindNdc(env);const resize=bindResize(env);
 const windowEvents=new EventTarget();windowEvents.addEventListener('resize',resize);
 const setRect=(w,h)=>{rect={width:w,height:h};};
 return {env,resize,windowResize:()=>windowEvents.dispatchEvent(new Event('resize')),setRect,canvasSizes,dispose(){skyGeo.dispose();starGeo.dispose();}};
}
const pose=camera=>({position:camera.position.toArray(),quaternion:camera.quaternion.toArray()});
const project=(camera,p,w,h)=>{const q=p.clone().project(camera);return {x:(q.x+1)*w/2,y:(1-q.y)*h/2};};
const assertNear=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);

for(const [width,height] of [[402,420],[402,514],[454,402]])test(`real resize ${width}x${height}: constructor calibrates, deferred/window layout retain the current camera and real three-part projection`,()=>{
 const f=fixture(width,height),{env}=f,{camera}=env;f.resize();
 assert.deepEqual(camera.position.toArray(),[3.2,5.2,22],'constructor still calibrates at the original origin');
 const target=project(camera,new THREE.Vector3(0,1.62,2.5),width,height);
 assertNear(target.x,.38*width);assertNear(target.y,.69*height);
 const scene=new THREE.Scene(),texture=new THREE.Texture(),decorations=makeDecorations(1);
 const slots=Array.from({length:7},(_,i)=>{const index=3+i;return {index,cx:(index-1)*10+5,width:8.7,height:9*.92*decorations[index-1].heightScale/100,deco:decorations[index-1],group:{visible:true}};});
 const accents=createStreetAccents({scene,camera,slots,atlas:texture,mode:'extended96',seed:1});
 const setCamera=x=>{camera.position.set(x+3.2,5.2,22);camera.quaternion.copy(env.camQuat);camera.updateMatrixWorld(true);};
 const info=()=>({viewport:{width:env.viewW,height:env.viewH},hudBottom:76,heroX:project(camera,new THREE.Vector3(camera.position.x-3.2,1.72,2.5),env.viewW,env.viewH).x,policeX:[0,0],policeVisible:[false,false]});
 const view=t=>({t,building:5,passed:4,phase:'grace',running:true,policeStage:0});
 const capture=(captureCamera=camera)=>{
  const names=[accents.stats().visibleArtwork.includes('birdCarryA')?'birdCarryA':'birdCarryB','parcel','rope'];
  return names.map(name=>({name,box:captureAtlasCell({scene,camera:captureCamera,renderer:{render(){scene.updateMatrixWorld(true);}},cellIndex:atlas.street[name].index,columns:atlas.columns,rows:atlas.rows,viewport:{width:env.viewW,height:env.viewH},read:()=>null}).projected}));
 };
 try{
  setCamera(40);assert.equal(accents.placements(view(20000),info()).bird,true,'plan at the real first grace');
  accents.tick(view(20000),{cameo:null,actors:info()});
  // Elapsed1000 belongs to t=21000/world42; it must not use the t=20000/world40 camera.
  setCamera(42);env.lastArgs={t:21000};
  accents.tick(view(21000),{cameo:{id:69,startedAt:20000,elapsedMs:1000,durationMs:2000,building:5,phase:'story'},actors:info()});
  assert.equal(accents.stats().storySprites,3);const before=capture(),saved=pose(camera);
  for(const {box:b} of before)assert.ok(b.l>=8&&b.t>=8&&b.r<=width-8&&b.b<=height-8,JSON.stringify(b));
  // Invoke the whole real resize, just as showGame's deferred layout callback does.
  f.resize();assert.deepEqual(pose(camera),saved);assert.deepEqual(capture(),before);
  assert.deepEqual(f.canvasSizes.at(-1),[width,height]);
  // A later window resize must update projection/aspect while preserving this exact pose.
  const next=width===454?[402,514]:[454,402];f.setRect(...next);f.windowResize();
  assert.deepEqual(pose(camera),saved);assert.equal(camera.aspect,next[0]/next[1]);assert.deepEqual(f.canvasSizes.at(-1),next);
  const expected=fixture(...next);expected.resize();expected.env.camera.position.fromArray(saved.position);expected.env.camera.quaternion.fromArray(saved.quaternion);expected.env.camera.updateMatrixWorld(true);
  assert.deepEqual(camera.projectionMatrix.elements,expected.env.camera.projectionMatrix.elements,'new aspect uses the original calibration');
  assert.deepEqual(capture(),capture(expected.env.camera),'all three real sprite bounds use the new projection and retained world pose');
  const at=new THREE.Vector3(45,9,1),actual=project(camera,at,...next),want=project(expected.env.camera,at,...next);
  assertNear(actual.x,want.x);assertNear(actual.y,want.y);expected.dispose();
 }finally{accents.dispose();texture.dispose();f.dispose();}
});

test('real resize retains a current quaternion as well as translation and leaves the source camera unadvanced',()=>{
 const f=fixture(402,420);f.resize();const c=f.env.camera;
 c.position.set(123.4,5.17,22);c.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),.025));c.updateMatrixWorld(true);
 const before=pose(c);f.env.lastArgs={t:60100};f.resize();
 assert.deepEqual(pose(c),before);assert.equal(f.env.lastArgs.t,60100);f.dispose();
});

test('resizing before the tutorial keeps the camera outside the shop', () => {
  const f = fixture(402, 514);
  try {
    f.resize();
    f.env.opening = true;
    f.env.camera.position.x -= 6;
    const before = pose(f.env.camera);
    f.setRect(874, 402);
    f.resize();
    assert.deepEqual(pose(f.env.camera), before);
    assert.equal(f.env.camera.aspect, 874 / 402);
  } finally { f.dispose(); }
});
