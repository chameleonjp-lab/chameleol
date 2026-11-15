import test from 'node:test';import assert from 'node:assert/strict';
import {createPoliceExtras} from '../../src/presentation/police-extras.js';
const view=(t,building,over={})=>({t,building,phase:'grace',running:true,policeStage:1,guideActive:false,warningActive:false,actorBusy:{hero:false,police:false},placements:{policeSettled:true},...over});
test('inquiry then footprints each happen once at a low-priority settled one-police grace opportunity',()=>{
 const p=createPoliceExtras();assert.equal(p.step(view(0,1)).kind,'inquiry');p.step(view(2000,1,{phase:'eval'}));assert.equal(p.step(view(5000,2)).kind,'footprints');p.step(view(7000,2,{phase:'eval'}));assert.equal(p.step(view(10000,3)),null);
});
test('police and hero busy facts are separate, and stage changes cancel offsets without replay',()=>{
 const p=createPoliceExtras();assert.equal(p.step(view(0,1,{actorBusy:{hero:true,police:true}})),null);p.step(view(2000,1,{phase:'eval'}));
 assert.equal(p.step(view(5000,2,{actorBusy:{hero:true,police:false}})).kind,'inquiry');assert.equal(p.step(view(5100,2,{policeStage:2})),null);
 p.step(view(7000,2,{phase:'eval'}));assert.equal(p.step(view(10000,3)).kind,'footprints');p.dispose();assert.equal(p.step(view(15000,4)),null);
});
test('resume conservatively suppresses new once-per-play police extras when prior cosmetic actions are not stored',()=>{
 assert.equal(createPoliceExtras({fresh:false}).step(view(100000,21)),null);
});
