import test from 'node:test';import assert from 'node:assert/strict';
import {GameSession} from '../../src/game/session.js';
import {createEvaluationSegmentCollector} from '../../src/presentation/evaluation-segments.js';
import {createPrecisionBadge} from '../../src/presentation/precision-badge.js';
const session=()=>new GameSession({playId:'p',seed:17,rulesVersion:'kamereoru-rules-v4'});
test('collector clips a 4501ms frame exactly to the real evaluation and never changes score or history',()=>{
 const s=session(),collector=createEvaluationSegmentCollector({session:s});s.apply({type:'color',t:100,...s.game.course.targets[0]});s.apply({type:'tick',t:4501});
 const inspect=()=>JSON.stringify({state:s.state,history:s.recorder.entries,saveSeq:s.saveSeq});
 const before=inspect(),segments=collector.drain();
 assert.deepEqual(segments,[{building:1,from:1500,to:4500,matchUnits:100000000,unitsPerPercent:1000000,evaluationEnd:4500}]);
 assert.equal(inspect(),before);assert.deepEqual(collector.drain(),[]);assert.ok(Object.isFrozen(segments[0]));
});
test('same-time inputs contribute no phantom interval and different actual inputs break continuity',async()=>{
 const s=session(),c=createEvaluationSegmentCollector({session:s}),wall=s.game.course.targets[0];s.apply({type:'color',t:100,...wall});
 s.apply({type:'color',t:1700,h:(wall.h+18000)%36000,s:wall.s,v:10000});s.apply({type:'color',t:2000,...wall});s.apply({type:'tick',t:2400});
 const segments=c.drain();assert.deepEqual(segments.map(x=>[x.from,x.to]),[[1500,1700],[1700,2000],[2000,2400]]);assert.ok(segments[1].matchUnits<98000000);
 let claims=0;const badge=createPrecisionBadge({claim:async()=>{claims++;return true;}});for(const x of segments)await badge.consume(x);assert.equal(claims,0);
 s.apply({type:'color',t:2400,h:(wall.h+18000)%36000,s:wall.s,v:10000});s.apply({type:'color',t:2400,...wall});s.apply({type:'tick',t:2500});
 for(const x of c.drain())await badge.consume(x);assert.equal(claims,1);
});
test('resume recovers only the current 500ms evaluation window from existing history',async()=>{
 const s=session(),wall=s.game.course.targets[0];s.apply({type:'color',t:100,...wall});s.apply({type:'tick',t:1750});
 const restored=GameSession.fromSnapshot(s.snapshot()).session;
 const c=createEvaluationSegmentCollector({session:restored,restore:true});restored.apply({type:'tick',t:2000});
 const segments=c.drain();assert.equal(segments[0].from,1500);assert.equal(segments.at(-1).to,2000);
 let claimed=0;const badge=createPrecisionBadge({claim:async()=>{claimed++;return true;}});for(const x of segments)await badge.consume(x);assert.equal(claimed,1);
});
