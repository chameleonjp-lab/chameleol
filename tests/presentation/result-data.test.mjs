import test from 'node:test';
import assert from 'node:assert/strict';
import {buildResultData} from '../../src/presentation/result-data.js';
const make=(perBuilding=[], extra={})=>buildResultData({summary:{buildings:perBuilding.length,perBuilding,maxCombo:11,score:{pass:1,accuracy:2,combo:3,clear:4,total:10}},...extra});
test('zero_passed_has_no_extrema',()=>{assert.equal(make().bestBuilding,null);assert.equal(make().mapCells.length,50)});
test('ties_choose_first_index',()=>assert.equal(make([[85e6,1,0],[170e6,2,0]]).bestBuilding.building,1));
test('invalid_tuple_keeps_original_index',()=>{for(const bad of [null,[],[1,-1,0],[1,NaN,0],[1,3001,0],[NaN,1,0],[Infinity,1,0],[.5,1,0],[-1,1,0],[101e6,1,0]])assert.equal(make([bad,[85e6,1,0]]).bestBuilding.building,2)});
test('unrounded_fractions_choose_extrema',()=>assert.equal(make([[85000000,1,0],[85004000,1,0]]).bestBuilding.building,2));
test('score_components_sum_without_rescoring',()=>assert.equal(make().summary.score.total,10));
test('district_mean_uses_equal_building_weights',()=>assert.equal(make([[0,1,0],[200e6,2,0]]).districts[0].rankAverage,5000));
test('district_at_unpassed_building_boundary',()=>assert.equal(make([], {arrivedBuilding:20}).backgroundId,20));
test('targets_are_optional_and_not_persisted',()=>{assert.deepEqual(make().colors,[]);const targets=[{h:0,s:10000,v:10000}];const data=make([],{targets});targets[0].h=40;assert.equal(data.colors[0].color.h,0)});
test('reached_district_without_passed_cells_is_explicit',()=>{const data=make(Array.from({length:19},()=>[100e6,1,0]),{arrivedBuilding:20});assert.equal(data.districts.length,2);assert.deepEqual(data.districts[1],{from:20,to:22,main:'shop',time:'day',buildings:0,count:0,rankAverage:null})});

test('first-clear ticket keeps its recorded date and rejects missing or invalid dates', () => {
  const at = Date.parse('2026-11-13T12:00:00.000Z');
  const context = { summary: { buildings: 50, endReason: 'cleared', score: {} }, firstClearNow: true };
  assert.equal(buildResultData({ ...context, firstClearAt: at }).firstClearAt, at);
  for (const firstClearAt of [undefined, null, NaN, Infinity, -1, 0.5, 8640000000000001]) {
    assert.equal(buildResultData({ ...context, firstClearAt }).firstClearAt, null);
  }
  assert.equal(buildResultData({ ...context, firstClearNow: false, firstClearAt: at }).firstClearAt, null);
});
