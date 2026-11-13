import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore } from '../../src/storage/memory-store.js';
import { refreshRecords } from '../../src/net/outbox.js';
import { applyVerifiedScore, validateVerifiedScore } from '../../src/net/verified-score.js';
import { MESSAGES } from '../../src/i18n/messages/index.js';

const VERSION = 'kamereoru-rules-v3';
const kinds = ['precision5', 'precision10', 'steady', 'milestone', 'quick', 'allSuccess'];
const totals = () => Object.fromEntries(kinds.map((kind) => [kind, { count: 0, points: 0 }]));

function fixture({ zero = false } = {}) {
  const bonus = { format: 'kamereoru-bonus-v1', points: zero ? 0 : 20, totals: totals(), awards: [] };
  if (!zero) {
    for (const [kind, tier, points] of [['precision', 10, 10], ['steady', null, 5], ['quick', null, 5]]) {
      bonus.awards.push({ id: `${VERSION}:1:${kind}`, building: 1, kind, tier, points, earnedAtT: 5000 });
      bonus.totals[kind === 'precision' ? 'precision10' : kind] = { count: 1, points };
    }
  }
  const verifiedScore = {
    rulesVersion: VERSION,
    score: { pass: zero ? 0 : 20, accuracy: zero ? 0 : 80, combo: 0, clear: 0, bonus: bonus.points, total: zero ? 0 : 120 },
    bonus, perBuilding: zero ? [] : [[300000000000, 3000, 120]], maxCombo: zero ? 0 : 1,
  };
  const summary = { ...structuredClone(verifiedScore), buildings: zero ? 0 : 1, rankAverage: zero ? null : 10000, endReason: 'quit', endT: zero ? 0 : 5000 };
  if (!zero) {
    summary.score.bonus = 15;
    summary.score.total = 115;
    summary.bonus.points = 15;
    summary.bonus.totals.quick = { count: 0, points: 0 };
    summary.bonus.awards.pop();
    summary.perBuilding[0][2] = 115;
    summary.maxCombo = 0;
  }
  const record = { playId: 'private-play', secret: 'private-secret', summary, status: zero ? 'no_rank' : 'official', corrections: [], unseenChange: false };
  const response = { playId: record.playId, status: record.status, verifiedScore, corrections: [], reviewRequests: 0 };
  return { record, response, verifiedScore, summary };
}

async function refresh(record, response) {
  const store = new MemoryStore();
  await store.put('records', record);
  const calls = [];
  const api = { configured: true, async post(path, body) { calls.push({ path, body }); return { items: [response] }; } };
  const updated = await refreshRecords({ api, store });
  return { store, calls, updated, saved: await store.getOne('records', record.playId) };
}

test('verified_aux_correction_replaces_not_adds and keeps immutable result/body/hash', async () => {
  const { record, response, verifiedScore } = fixture();
  const store = new MemoryStore();
  const result = { playId: record.playId, summary: record.summary, body: JSON.stringify(record.summary), bodySha: 'immutable-fingerprint' };
  await store.put('records', record);
  await store.put('results', result);
  await store.put('outbox', result);
  const before = structuredClone({ record, result });
  const api = { configured: true, post: async () => ({ items: [response] }) };
  await refreshRecords({ api, store });
  const saved = await store.getOne('records', record.playId);
  assert.deepEqual(saved.verifiedScore, verifiedScore);
  const shown = applyVerifiedScore(saved.summary, saved.verifiedScore);
  assert.equal(shown.score.total, 120);
  assert.equal(shown.score.bonus, 20);
  assert.equal(shown.perBuilding[0][2], 120);
  assert.equal(shown.maxCombo, 1);
  assert.deepEqual(applyVerifiedScore(shown, saved.verifiedScore), shown, 'reopening never adds again');
  assert.deepEqual(saved.summary, before.record.summary);
  assert.deepEqual(await store.getOne('results', record.playId), before.result);
  assert.deepEqual(await store.getOne('outbox', record.playId), before.result);
  shown.bonus.awards[0].points = 999;
  shown.perBuilding[0][2] = 999;
  assert.equal(saved.verifiedScore.bonus.awards[0].points, 10, 'detached view');
  assert.equal(saved.verifiedScore.perBuilding[0][2], 120);
});

test('same status correction is returned for display update without warning', async () => {
  const { record, response } = fixture();
  const { saved, updated, calls } = await refresh(record, response);
  assert.equal(updated.length, 1);
  assert.deepEqual(updated[0].verifiedScore, response.verifiedScore);
  assert.equal(saved.status, 'official');
  assert.equal(saved.unseenChange, false);
  assert.deepEqual(calls, [{ path: 'status', body: { items: [{ playId: record.playId, secret: record.secret }] } }]);
  const again = await refresh(saved, { playId: record.playId, status: 'official', corrections: [], reviewRequests: 0 });
  assert.deepEqual(again.saved.verifiedScore, saved.verifiedScore, 'older server omission keeps saved correction');
});

test('no_rank zero buildings is valid', async () => {
  const { record, response } = fixture({ zero: true });
  const { saved } = await refresh(record, response);
  assert.deepEqual(saved.verifiedScore, response.verifiedScore);
  assert.equal(applyVerifiedScore(saved.summary, saved.verifiedScore).score.total, 0);
});

test('maximum clear accepts all 156 awards and keeps B5 outside per-building points', async () => {
  const { record, response } = fixture();
  const verified = response.verifiedScore;
  verified.bonus = { format: 'kamereoru-bonus-v1', points: 1200, totals: totals(), awards: [] };
  verified.perBuilding = [];
  for (let building = 1; building <= 50; building += 1) {
    const awards = [['precision', 10, 10], ['steady', null, 5], ['quick', null, 5]];
    if (building % 10 === 0) awards.push(['milestone', null, 20]);
    const combo = building >= 10 ? 20 : building >= 5 ? 10 : building >= 3 ? 5 : 0;
    verified.perBuilding.push([300000000000, 3000, 100 + combo + 20 + (building % 10 === 0 ? 20 : 0)]);
    if (building === 50) awards.push(['allSuccess', null, 100]);
    for (const [kind, tier, points] of awards) {
      verified.bonus.awards.push({ id: `${VERSION}:${building}:${kind}`, building, kind, tier, points, earnedAtT: building * 5000 });
      const total = verified.bonus.totals[kind === 'precision' ? 'precision10' : kind];
      total.count += 1;
      total.points += points;
    }
  }
  verified.score = { pass: 1000, accuracy: 4000, combo: 880, clear: 200, bonus: 1200, total: 7280 };
  verified.maxCombo = 50;
  record.summary = { ...structuredClone(verified), buildings: 50, endReason: 'cleared', endT: 250000, rankAverage: 10000 };
  const { saved } = await refresh(record, response);
  assert.deepEqual(saved.verifiedScore, verified);
  assert.equal(saved.verifiedScore.bonus.awards.length, 156);
  const shown = applyVerifiedScore(saved.summary, saved.verifiedScore);
  assert.equal(shown.perBuilding.reduce((sum, row) => sum + row[2], 0) + shown.score.clear + shown.bonus.totals.allSuccess.points, 7280);
});

test('verified scores require matching private play, known ranked version, and final status', async () => {
  for (const status of ['verifying', 'pending_review', 'under_review', 'rejected']) {
    const { record, response } = fixture();
    response.status = status;
    assert.equal((await refresh(record, response)).saved.verifiedScore, undefined, status);
  }
  for (const version of ['kamereoru-rules-v1', 'kamereoru-rules-v2', 'kamereoru-rules-v4', 'unknown']) {
    const { record, response } = fixture();
    response.verifiedScore.rulesVersion = version;
    assert.equal((await refresh(record, response)).saved.verifiedScore, undefined, version);
  }
  const { record, response } = fixture();
  response.playId = 'another-play';
  assert.equal((await refresh(record, response)).saved.verifiedScore, undefined);
  response.playId = record.playId;
  record.summary.rulesVersion = 'kamereoru-rules-v1';
  assert.equal((await refresh(record, response)).saved.verifiedScore, undefined);
});

test('malformed verified details are ignored atomically and previous correction survives', async () => {
  const mutations = [
    (v) => { v.score.total += 1; },
    (v) => { v.score.bonus += 1; },
    (v) => { v.score.pass = -20; },
    (v) => { v.score.accuracy = 80.5; },
    (v) => { v.score.combo = Number.MAX_SAFE_INTEGER + 1; },
    (v) => { v.bonus.points += 1; },
    (v) => { v.bonus.format = 'unknown'; },
    (v) => { v.bonus.totals.precision10.count += 1; },
    (v) => { v.bonus.totals.quick.points = 10; },
    (v) => { v.bonus.awards.push(structuredClone(v.bonus.awards[0])); },
    (v) => { v.bonus.awards[0].kind = 'other'; },
    (v) => { v.bonus.awards[0].tier = 5; },
    (v) => { v.bonus.awards[0].id = 'wrong'; },
    (v) => { v.bonus.awards[0].building = 2; },
    (v) => { v.bonus.awards[0].earnedAtT += 1; },
    (v) => { v.bonus.awards[1].tier = 5; },
    (v) => { v.perBuilding[0][2] += 1; },
    (v) => { v.perBuilding[0][0] = -1; },
    (v) => { v.perBuilding[0][1] = 3001; },
    (v) => { v.perBuilding.push([...v.perBuilding[0]]); },
    (v) => { v.perBuilding[0].push(0); },
    (v) => { v.maxCombo = 2; },
    (v) => { v.bonus.awards = null; },
    (v) => { v.bonus.totals = null; },
    (v) => { v.score = null; },
    (v) => { v.perBuilding = null; },
  ];
  for (const mutate of mutations) {
    const { record, response, verifiedScore } = fixture();
    record.verifiedScore = structuredClone(verifiedScore);
    mutate(response.verifiedScore);
    const { saved } = await refresh(record, response);
    assert.deepEqual(saved.verifiedScore, record.verifiedScore, mutate.toString());
    assert.deepEqual(applyVerifiedScore(record.summary, response.verifiedScore), record.summary, mutate.toString());
    assert.equal(saved.unseenChange, false);
  }
});

test('validator returns a detached value only with matching private status context', () => {
  const { record, response, verifiedScore } = fixture();
  const context = { playId: record.playId, responsePlayId: response.playId, rulesVersion: record.summary.rulesVersion, summary: record.summary, status: response.status };
  const validated = validateVerifiedScore(verifiedScore, context);
  assert.deepEqual(validated, verifiedScore);
  validated.score.total = 0;
  assert.equal(verifiedScore.score.total, 120);
  assert.equal(validateVerifiedScore(verifiedScore, { ...context, responsePlayId: 'other' }), null);
});

test('all 15 locales include bonus names, conditions, result explanations and short labels', () => {
  const simple = ['card.title', 'precision', 'precisionHigh', 'steady', 'milestone', 'quick', 'allSuccess', 'total', 'countPoints', 'precisionBreakdown', 'notEarned', 'legacy', 'basePoints', 'passTotal', 'finalBuilding', 'allSuccessDetail'];
  const keys = [...simple, ...['precision', 'steady', 'milestone', 'quick', 'allSuccess'].map((key) => `help.${key}`), ...['precision', 'precisionHigh', 'steady', 'milestone', 'quick', 'allSuccess'].map((key) => `short.${key}`)];
  for (const [language, messages] of Object.entries(MESSAGES)) {
    for (const key of keys) assert.equal(typeof messages[`bonus.${key}`], 'string', `${language}: bonus.${key}`);
  }
});
