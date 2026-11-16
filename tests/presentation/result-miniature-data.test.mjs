import test from 'node:test';
import assert from 'node:assert/strict';
import { buildResultMiniatureModel } from '../../src/presentation/result-miniature-data.js';
const color={h:5000,s:7000,v:10000};
function input(passed=8){return {displaySummary:{rulesVersion:'kamereoru-rules-v1',buildings:passed,endReason:passed===50?'cleared':'quit'},arrivedBuilding:Math.min(50,passed+1),targets:Array.from({length:50},()=>({...color})),evidence:{status:'ready',data:{visualSamples:[{building:1,hsv:{h:6000,s:7000,v:10000}}],finalColors:{available:true,building:9,bodyHsv:{h:8000,s:7000,v:10000}}}}};}
test('miniature distinguishes 8 passed, one arrived and 41 unreached without inventing body colors',()=>{
  const i=input(),before=JSON.stringify(i);const m=buildResultMiniatureModel(i);
  assert.equal(m.available,true);assert.equal(m.cells.length,50);
  assert.equal(m.cells.filter(c=>c.state==='passed').length,8);assert.equal(m.cells.filter(c=>c.state==='arrived').length,1);assert.equal(m.cells.filter(c=>c.state==='unreached').length,41);
  assert.deepEqual(m.cells[0].bodyHsv,{h:6000,s:7000,v:10000});assert.equal(m.cells[1].bodyHsv,null);
  assert.deepEqual(m.cells[8].bodyHsv,{h:8000,s:7000,v:10000});assert.equal(m.cells[9].bodyHsv,null);
  assert.ok(Object.isFrozen(m.cells[0]));assert.equal(JSON.stringify(i),before);
});
test('all 50 passed has no extra arrival; missing wall or body colors remain null',()=>{
  const full=buildResultMiniatureModel(input(50));assert.equal(full.cells.filter(c=>c.state==='passed').length,50);assert.equal(full.cells.some(c=>c.state==='arrived'),false);
  const i=input();i.targets=null;i.evidence={status:'missing'};const m=buildResultMiniatureModel(i);
  assert.equal(m.available,true);assert.equal(m.cells[0].wallHsv,null);assert.equal(m.cells[8].bodyHsv,null);
});
test('invalid counts and arrival do not generate a guessed miniature',()=>{
  for(const patch of [{arrivedBuilding:0},{arrivedBuilding:40},{arrivedBuilding:null},{displaySummary:{rulesVersion:'future',buildings:8,endReason:'quit'}}])assert.equal(buildResultMiniatureModel({...input(),...patch}).available,false);
});
