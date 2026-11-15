import test from 'node:test';import assert from 'node:assert/strict';
import {createPrecisionBadge} from '../../src/presentation/precision-badge.js';
const segment=(from,to,matchUnits=98000000,building=1)=>({building,from,to,matchUnits,unitsPerPercent:1000000,evaluationEnd:(building-1)*5000+4500});
test('precision badge requires actual 98% for 500 continuous evaluation ms and claims once',async()=>{
 let calls=0;const b=createPrecisionBadge({claim:async()=>{calls++;return true;}});
 assert.equal(await b.consume(segment(1500,1999)),false);assert.equal(b.snapshot(1999),null);
 assert.equal(await b.consume(segment(1999,2000)),true);assert.equal(calls,1);assert.equal(b.snapshot(2000).kind,'nearPerfect');
 await b.consume(segment(2000,3000));assert.equal(calls,1);assert.equal(b.snapshot(3400),null);
});
test('below threshold, gaps and new buildings reset continuity; clip the final frame to evaluation end',async()=>{
 const b=createPrecisionBadge({claim:async()=>true});
 await b.consume(segment(1500,2000,97999000));assert.equal(b.snapshot(2000),null);
 await b.consume(segment(2500,2900));await b.consume(segment(3000,3499));assert.equal(b.snapshot(3499),null);
 assert.equal(await b.consume(segment(4000,4501)),true);assert.equal(b.snapshot(4501).startedAt,4500);
 const c=createPrecisionBadge({claim:async()=>true});await c.consume(segment(4000,4499));await c.consume(segment(6500,6999,98000000,2));assert.equal(c.snapshot(6999),null);assert.equal(await c.consume(segment(6999,7000,98000000,2)),true);
});
test('failed claims, duplicate intervals and delayed completion after disposal do not produce a badge',async()=>{
 let calls=0;const b=createPrecisionBadge({claim:async()=>{calls++;return false;}});await b.consume(segment(1500,2000));await b.consume(segment(1500,2500));assert.equal(calls,1);assert.equal(b.snapshot(2500),null);
 let done;const late=createPrecisionBadge({claim:()=>new Promise(r=>done=r)});const pending=late.consume(segment(1500,2000));late.dispose();done(true);assert.equal(await pending,false);assert.equal(late.snapshot(2000),null);
});
