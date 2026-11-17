import test from 'node:test';
import assert from 'node:assert/strict';
import {isByteFlatBody,measureComparisonPixels} from '../../src/scene/comparison-pixels.js';

const target=[114,255,78];
const image=(rgb,size=9)=>Uint8Array.from(Array.from({length:size*size},()=>[...rgb,255]).flat());
const pixel=(x,y)=>(y*9+x)*4;
function fixture(){return {width:9,height:9,normal:image(target),mask:image([0,128,0]),bodyBlack:image([0,0,0]),bodyWhite:image([255,255,255]),bodyTarget:target,wallTargets:[],slotIndices:[],wallMarkStep:36};}
// The exact affine part of TOON_FRAG, evaluated at byte colours rather than its geometry inputs.
const toon=(rgb,r,s)=>rgb.map(c=>Math.round((c*(1-.30*r))*(1-s)+255*s));

test('CI83 regression: rim can preserve green128 while changing source255; real black/white endpoints reject that pixel',()=>{
 const f=fixture(),i=pixel(4,4),r=.01,s=0;
 const marker=toon([0,128,0],r,s),normal=toon(target,r,s),white=toon([255,255,255],r,s);
 assert.deepEqual(marker,[0,128,0],'the former single marker falsely identified a flat pixel');
 assert.deepEqual(normal,[114,254,78],'the CI83 byte difference is reproduced');
 f.normal.set(normal,i);f.bodyBlack.set(toon([0,0,0],r,s),i);f.bodyWhite.set(white,i);
 assert.equal(isByteFlatBody(f.bodyBlack,f.bodyWhite,i),false);
 const got=measureComparisonPixels(f);
 assert.equal(got.bodyPixels,24,'all 24 other flat pixels stay in the comparison region');
 assert.equal(got.bodyMismatches,0);assert.equal(got.maxDev,0);
});

test('true flat pixels remain checked and a one-byte corruption is still an exact mismatch',()=>{
 const f=fixture(),before=measureComparisonPixels(f);
 assert.equal(before.bodyPixels,25);assert.equal(before.bodyMismatches,0);
 f.normal[pixel(4,4)+1]-=1;
 const after=measureComparisonPixels(f);
 assert.equal(after.bodyPixels,before.bodyPixels,'the target region is independent of normal-frame corruption');
 assert.equal(after.bodyMismatches,1);assert.equal(after.maxDev,1);
 assert.deepEqual(after.bodyBad.got,[114,254,78]);assert.deepEqual(after.bodyBad.want,target);
 assert.deepEqual(after.bodyBad.blackPx,[0,0,0]);assert.deepEqual(after.bodyBad.whitePx,[255,255,255]);
});

test('an overlay affecting every flat body pixel cannot turn an empty/unchecked region into a pass',()=>{
 const f=fixture();f.normal=image([100,220,70]);
 const got=measureComparisonPixels(f);
 assert.equal(got.bodyPixels,25);assert.equal(got.bodyMismatches,25);assert.equal(got.maxDev,35);
});

test('byte-flat endpoint classification keeps all byte colours exact for the toon affine response',()=>{
 let accepted=0,rejected=0;
 for(const r of [0,.0001,.001,.005,.01,.5,1])for(const s of [0,.0001,.001,.003,.05,.2475]){
  const black=Uint8Array.from(toon([0,0,0],r,s)),white=Uint8Array.from(toon([255,255,255],r,s));
  const flat=isByteFlatBody(black,white,0);
  if(!flat){rejected++;continue;}accepted++;
  for(let c=0;c<=255;c++)assert.deepEqual(toon([c,c,c],r,s),[c,c,c],`r=${r},s=${s},byte=${c}`);
 }
 assert.ok(accepted>0&&rejected>0);
});

test('green identity and its 5x5 interior are still required, including over flat endpoint responses',()=>{
 const f=fixture();f.mask=image([0,0,0]);
 for(let y=2;y<=6;y++)for(let x=2;x<=6;x++)f.mask.set([0,128,0,255],pixel(x,y));
 assert.equal(measureComparisonPixels(f).bodyPixels,1,'only the 5x5 region centre is eligible');
 f.mask[pixel(4,4)+1]=127;assert.equal(measureComparisonPixels(f).bodyPixels,0,'a non-marker shade is never compared');
});

test('wall identity and exact corruption detection do not depend on body endpoint passes',()=>{
 const f=fixture();f.mask=image([36,0,0]);f.wallTargets=[target];f.slotIndices=[5];
 f.normal[pixel(3,3)]-=1;const got=measureComparisonPixels(f);
 assert.equal(got.wallPixels,25);assert.equal(got.wallMismatches,1);assert.equal(got.bodyPixels,0);
 assert.deepEqual(got.perSlot,[{index:5,pixels:25,mismatches:1}]);
});
