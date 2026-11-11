import test from 'node:test';
import assert from 'node:assert/strict';
import { createHudState } from '../../src/presentation/hud-view.js';
const view = (x={})=>({t:0,phase:'eval',matchState:'success',combo:0,passed:0,building:1,policeStage:0,...x});
test('success_band_resets_on_grace',()=>{const h=createHudState();h.tick(view());assert.equal(h.tick(view({t:1000})).success,1);assert.equal(h.tick(view({t:1100,phase:'grace'})).success,0);});
test('combo_11_uses_10_gems',()=>{const h=createHudState();const s=h.tick(view({combo:11}));assert.equal(s.gems,10);assert.equal(s.combo,11);assert.equal(h.tick(view({combo:50})).combo,50);});
test('recovery_once_after_stage2',()=>{const h=createHudState();h.tick(view({policeStage:2}));assert.equal(h.tick(view({t:100,policeStage:0})).recoveryCount,1);assert.equal(h.tick(view({t:200})).recoveryCount,1);});
test('last5_is_46_to_50',()=>{const h=createHudState();for(const n of [45,46,50,51])assert.equal(h.tick(view({building:n})).lastFive,n>=46&&n<=50);});
test('unlock_does_not_wait_for_animation',()=>{const h=createHudState();h.event({type:'unlockBrightness',t:0});assert.equal(h.tick(view()).unlock,true);assert.equal(h.tick(view({t:600})).unlock,false);});

test('recovery_survives_intermediate_stage',()=>{const h=createHudState();h.tick(view({policeStage:2}));h.tick(view({t:100,policeStage:1}));assert.equal(h.tick(view({t:200,policeStage:0})).recoveryCount,1);});
test('combo_break_expires_without_restarting_at_zero',()=>{const h=createHudState();h.tick(view({combo:11}));assert.equal(h.tick(view({t:1})).brokenGems,10);assert.equal(h.tick(view({t:401})).breaking,false);});
test('best_flags_require_strict_improvement_and_known_combo',()=>{const h=createHudState({bestDistance:10,bestCombo:5});assert.equal(h.tick(view({passed:10,combo:5})).distanceRecord,false);const s=h.tick(view({passed:11,combo:6}));assert.equal(s.distanceRecord,true);assert.equal(s.comboRecord,true);assert.equal(createHudState().tick(view({combo:10})).comboRecord,false);});
test('shutter_uses_evaluation_transitions_not_success',()=>{const h=createHudState();h.event({type:'instantSuccess',t:0});assert.equal(h.tick(view()).shutter,false);h.event({type:'evalStart',t:100});assert.equal(h.tick(view({t:100})).shutter,true);assert.equal(h.tick(view({t:300})).shutter,false);h.event({type:'evalEnd',t:400});assert.equal(h.tick(view({t:400,phase:'grace'})).shutter,true);assert.equal(h.tick(view({t:600,phase:'grace'})).shutter,false);});
test('first_area_label_uses_800ms_active_clock',()=>{const h=createHudState();assert.equal(h.tick(view()).area,1);assert.equal(h.tick(view({t:799})).area,1);assert.equal(h.tick(view({t:800})).area,null);h.event({type:'enterBuilding',building:20,t:1000});assert.equal(h.tick(view({t:1000,building:20})).area,20);assert.equal(h.tick(view({t:1800,building:20})).area,null);});
