import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mountBonusPresentation} from '../../src/presentation/bonus-view.js';
import {createPresentationScope} from '../../src/presentation/scope.js';
import {buildBonusBatch} from '../../src/presentation/bonus-data.js';
const event={building:10,t:50000,basePoints:118,bonusPoints:40,points:158,bonusAwards:[['precision',10,10],['steady',null,5],['quick',null,5],['milestone',null,20]].map(([kind,tier,points])=>({id:`v3:10:${kind}`,building:10,kind,tier,points,earnedAtT:50000}))};
function mount(){const {document}=parseHTML('<html><body><main></main></body></html>');const host=document.querySelector('main'),scope=createPresentationScope({id:'bonus',kind:'game'});return {host,scope,view:mountBonusPresentation({host,scope})};}
test('deadline_is_event_time_not_receipt_time',()=>{const {host,view}=mount();view.show(buildBonusBatch({playId:'p',passEvent:event}),51000);assert.equal(host.querySelectorAll('.bonus-card').length,1);assert.equal(host.querySelectorAll('.bonus-award').length,4);view.tick({t:51400,running:true});assert.equal(host.querySelector('.bonus-card').hidden,true);assert.equal(view.show(buildBonusBatch({playId:'p',passEvent:event}),51450),false);});
test('destroyed_scope_cannot_show_card',()=>{const {host,view,scope}=mount();scope.dispose();assert.equal(view.show(buildBonusBatch({playId:'p',passEvent:event}),50000),false);assert.equal(host.querySelector('.bonus-card'),null);});
test('pause_warning_reduced_motion_and_duplicate_keep_scoring_static',()=>{const {view,host}=mount();const b=buildBonusBatch({playId:'p',passEvent:event});view.show(b,50000);assert.equal(view.show(b,50001),false);view.tick({t:50500,running:false,quiet:true});assert.ok(host.querySelector('.bonus-card').classList.contains('is-paused'));assert.ok(host.querySelector('.bonus-card').classList.contains('is-quiet'));assert.match(host.textContent,/40/);view.tick({t:50500,running:true,quiet:true});assert.equal(host.querySelector('.bonus-card').hidden,false);});
