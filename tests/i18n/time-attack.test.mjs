import test from 'node:test';
import assert from 'node:assert/strict';
import {TA_TITLES,titleFromId} from '../../src/i18n/time-attack-titles.js';
import {TITLE_NAMES_JA,titleForTime} from '../../src/rules/time-attack/v1/index.js';
import {timeAttackText,timeAttackTitle} from '../../src/i18n/time-attack.js';

const LANGS=['ja','en','es','pt-BR','zh-Hans','fr','de','ko','ru','it','zh-Hant','id','tr','vi','th'];
test('all 15 languages have complete 58 unique titles, correct IDs and readable UI labels',()=>{
 assert.deepEqual(Object.keys(TA_TITLES).sort(),LANGS.slice().sort());
 assert.deepEqual(TA_TITLES.ja,TITLE_NAMES_JA);
 for(const language of LANGS){
  assert.equal(TA_TITLES[language].length,58,language);
  assert.equal(new Set(TA_TITLES[language]).size,58,language);
  for(let i=0;i<58;i++){
   const id='ta.title.'+String(i+1).padStart(2,'0');
   assert.equal(titleFromId(id,language),TA_TITLES[language][i],language+id);
   const cs=i===0?3500:i===57?60000:3500+i*1000;
   assert.equal(titleForTime(cs),id,language);
   assert.equal(timeAttackTitle(cs/100===0?0:cs,language),TA_TITLES[language][i]);
  }
  for(const key of ['mode','start','time','family','red','green','blue','verifying','shareMode','shareRecord']){
   const value=timeAttackText(key,language);
   assert.ok(value&&value!==key,language+':'+key);
  }
 }
 assert.equal(titleFromId('ta.title.59','ja'),null);
});
