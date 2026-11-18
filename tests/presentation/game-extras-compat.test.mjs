import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createGameExtrasController} from '../../src/presentation/game-extras-controller.js';
import {createStreetAccents} from '../../src/presentation/street-accents.js';

const turn=()=>new Promise(resolve=>setImmediate(resolve));
const view=(t,over={})=>({t,building:2,passed:0,phase:'eval',running:true,moving:true,hidden:false,drawable:true,policeStage:0,matchState:null,lastEvalSuccess:false,guideActive:false,guidanceActive:false,warningActive:false,frameIntervalMs:16,bestDistance:null,actorBusy:{hero:false,police:false},placements:{},...over});
function fixture(){
  const claims=[];
  const controller=createGameExtrasController({playId:'compat',extrasPort:{fresh:true,initialState:{count:0,lastStartedAt:null,rngState:1,reservedMidpoint:true,midpointUsed:false},claimCameoStart:async state=>(claims.push(state),true)}});
  const legacy=createStreetAccents({scene:new THREE.Scene(),seed:1});
  return {controller,legacy,claims,tick(v){legacy.setBestDistance(v.bestDistance);legacy.tick(v);controller.step(v);},dispose(){controller.dispose();legacy.dispose();}};
}

test('all legacy play-view priorities suppress starts and cancel an active background story',async()=>{
  const blocks=[{phase:'ended'},{policeStage:2},{policeStage:3},{matchState:'danger'},{matchState:'success'},{lastEvalSuccess:true},{guideActive:true},{guidanceActive:true},...['ending','danger','success','milestone','guidance'].map(priority=>({priority}))];
  for(const block of blocks){
    const f=fixture();
    try{
      f.tick(view(1000));f.tick(view(2000,{phase:'grace',...block}));await turn();
      assert.equal(f.legacy.stats().count,0,JSON.stringify(block));
      assert.equal(f.claims.length,0,JSON.stringify(block));
    }finally{f.dispose();}
    const active=fixture();
    try{
      active.tick(view(1000));active.tick(view(2000,{phase:'grace'}));await turn();
      assert.ok(active.controller.snapshot().cameo);
      active.tick(view(2001,{phase:'grace',...block}));
      assert.equal(active.legacy.stats().backgroundGroups,0,JSON.stringify(block));
      assert.equal(active.controller.snapshot().cameo,null,JSON.stringify(block));
    }finally{active.dispose();}
  }
});

test('initial and district gates suppress for exactly 800ms',async()=>{
  // Building 23 is sampled outside the midpoint reservation to isolate its district gate.
  for(const [building,start] of [[1,0],[20,100000],[23,105000],[30,150000],[40,200000]])for(const offset of [799,800]){
    const f=fixture();
    try{
      if(building!==1)f.tick(view(start-1000,{building:building-1}));
      f.tick(view(start,{building}));f.tick(view(start+offset,{building,phase:'grace'}));await turn();
      assert.equal(f.legacy.stats().count,offset===800?1:0);
      assert.equal(f.claims.length,offset===800?1:0,`${building} + ${offset}`);
    }finally{f.dispose();}
  }
});

test('legacy priority events retain their exact expiry boundary',async()=>{
  for(const [type,building,duration] of [['instantSuccess',2,450],['unlockBrightness',2,600],['enterBuilding',46,800],['enterBuilding',45,0]])for(const offset of [Math.max(0,duration-1),duration]){
    const f=fixture();
    try{
      f.tick(view(1000,{building}));const event={type,t:2000,building};f.legacy.event(event);f.controller.event(event);
      f.tick(view(2000+offset,{building,phase:'grace'}));await turn();
      assert.equal(f.legacy.stats().count,offset>=duration?1:0);
      assert.equal(f.claims.length,offset>=duration?1:0,`${type}/${building}/${offset}`);
    }finally{f.dispose();}
  }
});

test('self-best crossing blocks the next 600ms without restarting for stable bestDistance',async()=>{
  for(const offset of [599,600]){
    const f=fixture();
    try{
      f.legacy.setBestDistance(2);
      f.legacy.tick(view(1000,{bestDistance:2,passed:2}));f.controller.step(view(1000,{bestDistance:2,passed:2}));
      f.legacy.tick(view(2000,{bestDistance:2,passed:3}));f.controller.step(view(2000,{bestDistance:2,passed:3}));
      const v=view(2000+offset,{phase:'grace',bestDistance:2,passed:3});f.legacy.tick(v);f.controller.step(v);await turn();
      assert.equal(f.legacy.stats().count,offset===600?1:0);
      assert.equal(f.claims.length,offset===600?1:0);
    }finally{f.dispose();}
  }
});

test('a self-best crossing on the grace transition is suppressed before claiming an invisible start',async()=>{
  const f=fixture();
  try{
    f.legacy.setBestDistance(2);
    const before=view(1000,{bestDistance:2,passed:2});f.legacy.tick(before);f.controller.step(before);
    const crossing=view(2000,{phase:'grace',bestDistance:2,passed:3});f.legacy.tick(crossing);f.controller.step(crossing);await turn();
    // The old view drew nothing after charging its lottery. The controller preserves
    // that visible suppression while retaining the persisted budget for a future story.
    assert.equal(f.legacy.stats().count,1);assert.equal(f.legacy.stats().backgroundGroups,0);
    assert.equal(f.controller.snapshot().cameo,null);assert.equal(f.claims.length,0);
  }finally{f.dispose();}
});

test('30 consecutive slow intervals permanently suppress future starts; non-slow and stopped frames reset the streak',async()=>{
  for(const reset of [null,{frameIntervalMs:50},{frameIntervalMs:1000},{frameIntervalMs:0},{frameIntervalMs:NaN},{frameIntervalMs:-1},{frameIntervalMs:51,running:false},{frameIntervalMs:51,hidden:true}]){
    const f=fixture();
    try{
      f.controller.step(view(1000,{frameIntervalMs:51}));
      for(let i=1;i<=29;i++)f.controller.step(view(1000+i*51,{frameIntervalMs:51}));
      if(reset)f.controller.step(view(2500,reset));
      f.controller.step(view(2551,{phase:'grace',frameIntervalMs:51}));await turn();
      assert.equal(f.claims.length,reset?1:0,JSON.stringify(reset));
      if(!reset){f.controller.step(view(18000,{phase:'eval',frameIntervalMs:16}));f.controller.step(view(18016,{phase:'grace',frameIntervalMs:16}));await turn();assert.equal(f.claims.length,0);}
    }finally{f.dispose();}
  }
});

test('the first interval is ignored and 29 slow intervals remain eligible, including the 999ms boundary',async()=>{
  for(const interval of [51,999])for(const count of [29,30]){
    const f=fixture();
    try{
      f.controller.step(view(1000,{frameIntervalMs:interval}));
      for(let i=1;i<count;i++)f.controller.step(view(1000+i*interval,{frameIntervalMs:interval}));
      f.controller.step(view(1000+count*interval,{phase:'grace',frameIntervalMs:interval}));await turn();
      assert.equal(f.claims.length,count===29?1:0,`${interval}ms x ${count}`);
    }finally{f.dispose();}
  }
});

test('invalid or missing bestDistance behaves as null and no best gate is invented',async()=>{
  for(const bestDistance of [null,undefined,-1,51,1.5,NaN,Infinity]){
    const f=fixture();
    try{
      f.tick(view(1000,{passed:2,bestDistance}));f.tick(view(2000,{passed:3,bestDistance}));
      f.tick(view(2001,{passed:3,bestDistance,phase:'grace'}));await turn();
      assert.equal(f.claims.length,1,String(bestDistance));
    }finally{f.dispose();}
  }
});

test('stopped frames retain the game-time priority window and do not consume a grace opportunity',async()=>{
  const f=fixture();
  try{
    f.tick(view(1000));const event={type:'instantSuccess',t:2000};f.legacy.event(event);f.controller.event(event);
    f.tick(view(2000,{phase:'grace',running:false}));
    f.tick(view(2000,{phase:'grace',running:false}));
    f.tick(view(2449,{phase:'grace'}));await turn();assert.equal(f.claims.length,0);
    f.tick(view(2450,{phase:'eval'}));f.tick(view(2450,{phase:'grace'}));await turn();
    assert.equal(f.claims.length,1);assert.equal(f.legacy.stats().count,1);
  }finally{f.dispose();}
});

test('a building change within the same grace does not create a second legacy opportunity',async()=>{
  const f=fixture();
  try{
    f.tick(view(1000));f.tick(view(2000,{phase:'grace'}));await turn();
    f.tick(view(20000,{building:5,phase:'grace'}));await turn();
    assert.equal(f.legacy.stats().count,1);assert.equal(f.claims.length,1);
  }finally{f.dispose();}
});
