// Verify the real shader marker passes retain a useful flat region and still detect corruption.
import test from 'node:test';
import assert from 'node:assert/strict';
import {launch,openHome} from './helpers.mjs';

test('comparison readback excludes shaded marker aliases, detects an actual overlay and restores ordinary drawing even after readback failure',async()=>{
 const env=await launch({width:402,height:874});
 try{
  await openHome(env.page,env.url);
  const got=await env.page.evaluate(async()=>{
   const a=__kamereoru;await a.debugStart({atMs:20250,seed:1});cancelAnimationFrame(a.raf);
   const {readPlayView}=await import('/src/presentation/events.js');
   const view={...readPlayView(a.session,0,{lastEvalSuccess:false}),running:true};
   a.stage.update({t:view.t,color:view.color,policeStage:0,walking:true,presentation:view});
   const stage=a.stage,renderer=stage.renderer,gl=renderer.getContext(),render=renderer.render;
   const hero=stage.verificationHero(),colors=()=>hero.comparisonMaterials.map(m=>m.uniforms.uColor.value.toArray());
   let scene,camera;
   let base;
   try{renderer.render=function(s,c){scene=s;camera=c;return render.call(this,s,c);};base=stage.checkComparisonSurfaces();}
   finally{renderer.render=render;}
   const pixels=()=>{const c=renderer.domElement,data=new Uint8Array(c.width*c.height*4);gl.readPixels(0,0,c.width,c.height,gl.RGBA,gl.UNSIGNED_BYTE,data);return data;};
   const before=pixels(),savedColors=colors();stage.checkComparisonSurfaces();
   // Compare one restored normal frame, never the temporary black/white marker buffers.
   const after=pixels(),normalRestored=before.every((value,i)=>value===after[i]);
   const THREE=await import('three'),geometry=new THREE.PlaneGeometry(100,100);
   const material=new THREE.MeshBasicMaterial({color:0xff00ff,transparent:true,opacity:.2,depthTest:false,depthWrite:false,fog:false,toneMapped:false});
   const overlay=new THREE.Mesh(geometry,material);overlay.renderOrder=9999;
   overlay.quaternion.copy(camera.quaternion);overlay.position.copy(camera.position).add(camera.getWorldDirection(new THREE.Vector3()));scene.add(overlay);
   let polluted;
   try{polluted=stage.checkComparisonSurfaces();}
   finally{overlay.removeFromParent();geometry.dispose();material.dispose();}
   const clean=stage.checkComparisonSurfaces();
   const readPixels=gl.readPixels;let calls=0,error;
   try{
    gl.readPixels=function(...args){if(++calls===3)throw new Error('verification-readback-failed');return readPixels.apply(this,args);};
    stage.checkComparisonSurfaces();
   }catch(e){error=e.message;}
   finally{gl.readPixels=readPixels;}
   const afterFailure=stage.checkComparisonSurfaces(),failureFrame=pixels();
   return {base,polluted,clean,afterFailure,normalRestored,error,colorsRestored:JSON.stringify(savedColors)===JSON.stringify(colors()),failureFrameRestored:before.every((value,i)=>value===failureFrame[i])};
  });
  assert.ok(got.base.bodyPixels>0);assert.ok(got.base.wallPixels>0);
  assert.equal(got.base.bodyMismatches,0);assert.equal(got.base.wallMismatches,0);
  assert.equal(got.polluted.bodyPixels,got.base.bodyPixels,'an overlay does not remove eligible body pixels from the marker passes');
  assert.ok(got.polluted.bodyMismatches>0);assert.ok(got.polluted.wallMismatches>0);
  assert.deepEqual(got.clean,got.base);assert.deepEqual(got.afterFailure,got.base);
  assert.equal(got.error,'verification-readback-failed');assert.equal(got.normalRestored,true);
  assert.equal(got.colorsRestored,true);assert.equal(got.failureFrameRestored,true);
  assert.deepEqual(env.errors,[]);
 }finally{await env.close();}
});
