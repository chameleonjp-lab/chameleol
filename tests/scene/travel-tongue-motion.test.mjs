import test from 'node:test';
import assert from 'node:assert/strict';
import {createTravelTongueMotion} from '../../src/scene/travel-tongue-motion.js';
const base={running:true,moving:true,hidden:false,drawable:true,blocked:false,reducedMotion:false,building:1};
function advance(m,from,to,extra={}){let value;for(let t=from;t<=to;t+=Math.min(1000,to-t||1000)){value=m.sample({...base,t,...extra});if(t===to)break;}return value;}
test('travel boundary is consumed once and phases follow 150/250/350/450/200ms',()=>{
 const m=createTravelTongueMotion();advance(m,0,9000);assert.equal(m.sample({...base,t:9999}),null);
 const start=m.sample({...base,t:10000});assert.equal(start.phase,'prepare');assert.equal(start.elapsedMs,0);
 assert.equal(m.sample({...base,t:10000}).id,start.id);
 assert.equal(m.sample({...base,t:10150}).phase,'extend');assert.equal(m.sample({...base,t:10400}).phase,'hold');assert.equal(m.sample({...base,t:10750}).phase,'retract');assert.equal(m.sample({...base,t:11200}).phase,'store');assert.equal(m.sample({...base,t:11400}),null);
 assert.equal(advance(m,12000,20000).phase,'prepare');
});
test('paused and hidden clocks freeze; stationary and drawable gaps do not add movement',()=>{
 const m=createTravelTongueMotion();advance(m,0,10000);m.sample({...base,t:10100});
 assert.equal(m.sample({...base,t:10100,running:false}).elapsedMs,100);
 assert.equal(m.sample({...base,t:10100,hidden:true}).elapsedMs,100);
 assert.equal(m.sample({...base,t:10100}).elapsedMs,100);
 assert.equal(m.sample({...base,t:10200}).elapsedMs,200);
 m.sample({...base,t:10200,drawable:false});assert.equal(m.sample({...base,t:10200}),null);
 const n=createTravelTongueMotion();advance(n,0,9000);n.sample({...base,t:9500,moving:false});n.sample({...base,t:10000,moving:false});n.sample({...base,t:10000});assert.equal(n.sample({...base,t:10500}),null);assert.equal(n.sample({...base,t:11000}).phase,'prepare');
});
test('blocked boundaries are never replayed, settings changes cancel and bad clocks cannot create catch-up',()=>{
 const m=createTravelTongueMotion();advance(m,0,9000);assert.equal(m.sample({...base,t:10000,blocked:true}),null);assert.equal(m.sample({...base,t:10001}),null);
 assert.equal(advance(m,11000,20000).phase,'prepare');assert.equal(m.sample({...base,t:20100,reducedMotion:true}),null);
 for(const t of [NaN,Infinity,-1,10000])assert.equal(m.sample({...base,t}),null);
 assert.equal(m.sample({...base,t:90000}),null);assert.equal(m.sample({...base,t:90001}),null);
 m.reset();assert.equal(m.sample({...base,t:90000}),null);m.dispose();assert.equal(m.sample({...base,t:100000}),null);
});
