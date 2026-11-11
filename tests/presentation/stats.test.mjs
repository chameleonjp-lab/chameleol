import test from 'node:test';import assert from 'node:assert/strict';
import {sanitizeStats,mergePresentationStats} from '../../src/presentation/stats.js';
const end=(extra={})=>({playId:'one',buildings:4,rankAverage:8000,maxCombo:3,endedAt:100,cleared:false,...extra});
test('duplicate_finish_is_idempotent',()=>{const a=mergePresentationStats(null,end()).next;assert.deepEqual(mergePresentationStats(a,end()).next,a)});
test('late_result_does_not_replace_previous',()=>{const a=mergePresentationStats(null,end()).next;assert.equal(mergePresentationStats(a,end({playId:'old',endedAt:99})).next.previousResult.playId,'one')});
test('new_best_combo_uses_max',()=>assert.equal(mergePresentationStats({version:1,bestCombo:9,firstClearAt:null,previousResult:null},end()).next.bestCombo,9));
test('first_clear_date_never_overwritten',()=>{const a=mergePresentationStats(null,end({cleared:true})).next;assert.equal(mergePresentationStats(a,end({playId:'two',endedAt:200,cleared:true})).next.firstClearAt,100)});
test('bad_optional_data_does_not_block_result',()=>{assert.equal(sanitizeStats({version:1,bestCombo:Infinity}).bestCombo,0);assert.equal(mergePresentationStats(null,end({playId:'x'.repeat(3000)})).next.previousResult,null)});
test('play_ids_over_128_are_rejected',()=>{const ended=end({playId:'x'.repeat(129)});assert.equal(mergePresentationStats(null,ended).next.previousResult,null);assert.equal(sanitizeStats({version:1,bestCombo:1,firstClearAt:null,previousResult:ended}).previousResult,null)});
