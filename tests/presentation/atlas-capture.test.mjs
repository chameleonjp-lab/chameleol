import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {captureAtlasCell,captureAtlasCells} from './atlas-capture.mjs';

function fixture(){
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(44,1,.5,100);
  camera.position.z=10;camera.updateMatrixWorld();
  const geometry=new THREE.PlaneGeometry(1,1);
  geometry.setAttribute('atlasOffset',new THREE.InstancedBufferAttribute(new Float32Array([0,11,3,3,1,11]),2));
  const mesh=new THREE.InstancedMesh(geometry,new THREE.MeshBasicMaterial(),3);mesh.name='street-accent-atlas';
  for(let i=0;i<3;i++)mesh.setMatrixAt(i,new THREE.Matrix4().makeTranslation(i-1,0,0));
  scene.add(mesh);
  const matrices=()=>Array.from({length:3},(_,i)=>{const m=new THREE.Matrix4();mesh.getMatrixAt(i,m);return [...m.elements];});
  return {scene,camera,mesh,matrices,renderer:{render(){scene.updateMatrixWorld(true);}}};
}

test('atlas capture removes only the flag instance, preserves every other decoration, and restores the original scene',()=>{
  const f=fixture(),before=f.matrices();
  const got=captureAtlasCell({...f,cellIndex:67,columns:8,rows:12,viewport:{width:402,height:420},read:f.matrices});
  assert.deepEqual(got.shown,before);
  assert.deepEqual(got.hidden[0],before[0]);assert.deepEqual(got.hidden[2],before[2]);
  assert.equal(new THREE.Matrix4().fromArray(got.hidden[1]).determinant(),0);
  assert.deepEqual(f.matrices(),before);
  assert.ok(got.projected.l<got.projected.r&&got.projected.t<got.projected.b);
});

test('a failed pixel read restores the flag matrix before propagating the error',()=>{
  const f=fixture(),before=f.matrices();let reads=0;
  assert.throws(()=>captureAtlasCell({...f,cellIndex:67,columns:8,rows:12,viewport:{width:402,height:420},read:()=>{if(++reads===2)throw new Error('pixel-read-failed');return f.matrices();}}),/pixel-read-failed/);
  assert.equal(reads,2);assert.deepEqual(f.matrices(),before);
});

test('a missing flag fails instead of attributing unrelated changed artwork to the flag',()=>{
  const f=fixture(),before=f.matrices();
  assert.throws(()=>captureAtlasCell({...f,cellIndex:68,columns:8,rows:12,viewport:{width:402,height:420},read:f.matrices}),/exactly one/);
  assert.deepEqual(f.matrices(),before);
});


test('grouped capture hides exactly the requested atlas instances and restores all matrices after a failed read',()=>{
 const f=fixture(),before=f.matrices();let reads=0;
 assert.throws(()=>captureAtlasCells({...f,cellIndices:[0,67],columns:8,rows:12,viewport:{width:402,height:420},read:()=>{
  reads++;if(reads===2){const during=f.matrices();
   assert.equal(new THREE.Matrix4().fromArray(during[0]).determinant(),0);
   assert.equal(new THREE.Matrix4().fromArray(during[1]).determinant(),0);
   assert.deepEqual(during[2],before[2]);throw new Error('group-read-failed');
  }return before;
 }}),/group-read-failed/);
 assert.deepEqual(f.matrices(),before);assert.equal(reads,2);
});
