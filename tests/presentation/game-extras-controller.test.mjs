import test from 'node:test';import assert from 'node:assert/strict';
import {createGameExtrasController} from '../../src/presentation/game-extras-controller.js';
import {RULES_V1} from '../../src/rules/v1/config.js';
const port=()=>({fresh:true,initialState:{count:0,lastStartedAt:null,rngState:1,reservedMidpoint:true,midpointUsed:false},claimCameoStart:async()=>true,claimPrecisionBadge:async()=>true});
const input=(t,over={})=>({t,building:Math.floor(t/5000)+1,phase:'eval',running:true,moving:true,hidden:false,drawable:true,guideActive:false,warningActive:false,policeStage:0,actorBusy:{hero:false,police:false},reducedMotion:false,placements:{},evaluationSegments:[],...over});
test('controller keeps hero and police suppression separate and emits real badge claims without score writes',async()=>{
 const c=createGameExtrasController({playId:'p',rules:RULES_V1,extrasPort:port(),seed:1});
 for(let t=0;t<10000;t+=1000)c.step(input(t));
 c.step(input(10000,{actorBusy:{hero:false,police:true}}));assert.ok(c.snapshot().travelTongue);
 c.step(input(10100,{actorBusy:{hero:true,police:false}}));assert.equal(c.snapshot().travelTongue,null);
 const segment={building:3,from:11500,to:12000,matchUnits:98000000,unitsPerPercent:1000000,evaluationEnd:14500};
 const value=input(12000,{evaluationSegments:[segment]});const original=JSON.stringify(value);c.step(value);await new Promise(r=>setImmediate(r));
 assert.equal(c.snapshot().precisionBadge.kind,'nearPerfect');assert.equal(JSON.stringify(value),original);assert.equal('score' in c.snapshot(),false);
 c.dispose();c.step(input(13000));assert.deepEqual(c.snapshot(),{travelTongue:null,cameo:null,policeExtra:null,precisionBadge:null});
});
test('warning and guide collisions consume natural 10000/50000 boundaries without queueing',()=>{
 const c=createGameExtrasController({playId:'p',rules:RULES_V1,extrasPort:port()});
 for(let t=0;t<=50000;t+=1000)c.step(input(t,{actorBusy:{hero:t===10000||t===50000,police:false}}));
 assert.equal(c.snapshot().travelTongue,null);c.step(input(50001));assert.equal(c.snapshot().travelTongue,null);
});
