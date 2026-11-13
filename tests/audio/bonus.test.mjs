import test from 'node:test';
import assert from 'node:assert/strict';
import {choosePassCue} from '../../src/presentation/bonus-audio.js';
import {SOUND_EVENTS} from '../../src/audio/mixer.js';
const batch={awards:[{kind:'precision',tier:10},{kind:'steady'}]};
test('one_pass_one_reward_cue',()=>{assert.deepEqual(choosePassCue({batch,cues:[{name:'combo'},{name:'tierUp'}]}),{name:'bonusMulti',opts:{}});assert.equal(choosePassCue({batch:{awards:[{kind:'precision',tier:10}]}}).opts.tier,10);});
test('critical_cue_suppresses_bonus_without_replay',()=>{for(const name of ['guideClear','unlock','warning','whistle','detected','clear'])assert.equal(choosePassCue({batch,cues:[{name}]}).name,name);assert.equal(choosePassCue({}),null);});
test('all_success_ending_one_fanfare',()=>{assert.equal(choosePassCue({batch,cues:[{name:'bonusAllSuccess'},{name:'clear'}]}).name,'bonusAllSuccess');});
test('six_bonus_sounds_use_existing_sfx_bus',()=>{for(const name of ['bonusPrecision','bonusSteady','bonusMilestone','bonusQuick','bonusAllSuccess','bonusMulti'])assert.equal(SOUND_EVENTS[name]?.bus,'sfx');});
