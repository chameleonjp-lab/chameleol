import test from 'node:test';import assert from 'node:assert/strict';
import {createCameoReservations} from '../../src/presentation/cameo-reservations.js';
import {selectExtendedCameo} from '../../src/presentation/catalog.js';
const initial={count:0,lastStartedAt:null,rngState:1,reservedMidpoint:true,midpointUsed:false};
const opts=(over={})=>({playId:'play',restore:{...initial},claimStart:async()=>true,...over});
test('extended picker retains 10% none, reaches all 13 effects and rejects unavailable placements',()=>{
 const cases=[[.05,12],[.15,13],[.24,14],[.34,15],[.42,16],[.49,36],[.56,61],[.59,65],[.63,70],[.68,20],[.75,67],[.82,68],[.87,69]];
 const placements={railway:true,water:true,robot:true,bird:true};
 for(const [value,id] of cases)assert.equal(selectExtendedCameo(value,{building:1,placements})?.id,id);
 for(const value of [.9,.95,.999])assert.equal(selectExtendedCameo(value,{building:1,placements}),null);
 assert.equal(selectExtendedCameo(.87,{building:1,placements:{bird:false}}),null);assert.equal(selectExtendedCameo(.59,{building:30,placements}),null);
});
test('five normal starts leave midpoint capacity, persist before drawing and never duplicate initial count zero',async()=>{
 const claims=[];let approve;const c=createCameoReservations(opts({claimStart:s=>(claims.push({...s}),new Promise(r=>approve=r))}));
 const pending=c.start({id:12,t:0,building:1});assert.equal(c.snapshot(),null);assert.equal(claims.length,1);assert.equal(claims[0].count,1);approve(true);await pending;assert.equal(c.snapshot().id,12);
 for(let n=1;n<5;n++){c.tick({t:n*15000,building:n+1,canStart:false});const p=c.start({id:12,t:n*15000,building:n+1});approve(true);assert.equal(await p,true);}
 c.tick({t:75000,building:16,canStart:false});assert.equal(await c.start({id:12,t:75000,building:16}),false);assert.equal(c.stats().count,5);
});
test('midpoint reservation blocks ordinary starts and late approval falls back to a static flag',async()=>{
 let approve;const c=createCameoReservations(opts({claimStart:()=>new Promise(r=>approve=r)}));
 c.tick({t:110000,building:23,canStart:false});assert.equal(await c.start({id:12,t:110000,building:23}),false);
 const pending=c.start({id:56,t:125000,building:26});c.tick({t:126501,building:26,canStart:false});approve(true);await pending;
 assert.equal(c.snapshot().id,56);assert.equal(c.snapshot().phase,'static');assert.equal(c.stats().count,1);
});
test('restored five-start state can use only one more; missing, rejected and disposed claims never revive a scene',async()=>{
 const restore={...initial,count:5,lastStartedAt:60000};const c=createCameoReservations(opts({restore}));
 c.tick({t:125000,building:26,canStart:false});assert.equal(await c.start({id:56,t:125000,building:26}),true);assert.equal(c.stats().count,6);
 c.tick({t:145000,building:30,canStart:false});assert.equal(await c.start({id:12,t:145000,building:30}),false);
 const missing=createCameoReservations(opts({restore:null}));assert.equal(await missing.start({id:12,t:0,building:1}),false);
 const denied=createCameoReservations(opts({claimStart:async()=>false}));assert.equal(await denied.start({id:12,t:0,building:1}),false);assert.equal(denied.stats().disabled,true);
 let done;const late=createCameoReservations(opts({claimStart:()=>new Promise(r=>done=r)}));const p=late.start({id:12,t:0,building:1});late.dispose();done(true);assert.equal(await p,false);assert.equal(late.snapshot(),null);
});
