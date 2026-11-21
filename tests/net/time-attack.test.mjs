import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, sha256Hex } from '../../src/net/api.js';
import { requireTimeAttack, reserveTimeAttack } from '../../src/net/time-attack-start.js';
import { createTimeAttackOutbox, createTimeAttackUpload, splitTimeAttackHistory } from '../../src/net/time-attack-outbox.js';
import { MODE_ID, RULES_VERSION, COURSE_VERSION, generateTimeAttackCourse } from '../../src/rules/time-attack/v1/index.js';
import { TimeAttackMemoryStore } from '../../src/storage/time-attack-memory-store.js';

test('chunks preserve UTF-8 text and enforce the byte and chunk limits', () => {
  const history = { text: '色🦎'.repeat(60000) };
  const parts = splitTimeAttackHistory(history);
  assert.equal(parts.chunks.join(''), JSON.stringify(history));
  assert.equal(parts.length, new TextEncoder().encode(JSON.stringify(history)).length);
  assert.ok(parts.chunks.length > 1);
  assert.ok(parts.chunks.every(part => new TextEncoder().encode(part).length <= 128 * 1024));
  assert.equal(splitTimeAttackHistory({ text: '🦎'.repeat(2100000) }), null);
});

test('ranked reservation retry reuses all identifiers and rejects the normal-mode response', async () => {
  const attempt = { request: { requestId: 'request', rulesVersion: RULES_VERSION } };
  const requests = [];
  const api = {
    async post(path, body) {
      assert.equal(path, 'time-attack-start');
      requests.push(body);
      if (requests.length === 1) throw new ApiError('offline', { retryable: true });
      return { modeId: MODE_ID, playId: '93c5ced1-a6bf-486a-a460-13f7ccbde738', seed: 23,
        family: generateTimeAttackCourse(23).family,
        rulesVersion: RULES_VERSION, generatorVersion: COURSE_VERSION,
        acceptedAt: new Date().toISOString(), expiresAt: null };
    },
  };
  const res = await reserveTimeAttack(api, attempt, new AbortController().signal, { delays: [0] });
  assert.equal(res.course.seed, 23);
  assert.deepEqual(requests, [attempt.request, attempt.request]);
  assert.throws(() => requireTimeAttack({ ok: true, modeId: 'main' }), /unexpected_mode/);
});

test('outbox keeps its original destination, records the launch first and preserves the completed record', async () => {
  const store = new TimeAttackMemoryStore();
  const launch = { id: 'launch', destination: 'original', body: {
    modeId: MODE_ID, launchId: 'launch', playId: 'play', secret: 'private', ranked: true },
  };
  const history = { format: 'fixture', events: [{ text: '色' }] };
  const upload = await createTimeAttackUpload(history, launch);
  await store.put('launches', launch);
  await store.put('outbox', upload);
  await store.put('records', { id: 'launch', destination: 'original', playId: 'play', secret: 'private', status: 'uploading' });
  const calls = [];
  const fake = {
    destination: 'wrong', configured: true,
    async post(path, data) {
      calls.push(path);
      if (path === 'time-attack-chunk') {
        const transmitted = JSON.stringify({ ...history, playId: 'play', launchId: 'launch' });
        assert.equal(data.sha256, await sha256Hex(transmitted));
        assert.equal(data.data, transmitted);
      }
      if (path === 'time-attack-complete') assert.equal(data.resultId, upload.resultId);
      return { ...data, modeId: MODE_ID, counted: true, status: 'official' };
    },
  };
  await createTimeAttackOutbox(fake, { stores: () => [store] }).flush();
  assert.deepEqual(calls, []);
  fake.destination = 'original';
  const outbox = createTimeAttackOutbox(fake, { stores: () => [store] });
  await outbox.flush();
  assert.deepEqual(calls, ['time-attack-launch', 'time-attack-chunk', 'time-attack-complete']);
  assert.equal((await store.get('records', 'launch')).status, 'official');
  await outbox.flush();
  assert.equal(calls.length, 3);
});

test('retry repairs a missing launch or a missing chunk instead of looping on complete', async () => {
  const store = new TimeAttackMemoryStore();
  const launch = { id: 'launch', destination: 'ta', body: {
    launchId: 'launch', playId: 'play', secret: 'private', ranked: true, modeId: MODE_ID,
  }, sent: true };
  const upload = await createTimeAttackUpload({ events: [] }, launch);
  await store.put('launches', launch);
  await store.put('outbox', { ...upload, nextChunk: upload.chunks.length });
  await store.put('records', { id: 'launch', destination: 'ta', status: 'uploading' });
  const requests = [];
  const reasons = ['launch_required', 'missing_chunks'];
  const api = {
    destination: 'ta', configured: true,
    async post(path, data) {
      requests.push(path);
      if (path === 'time-attack-complete' && reasons.length) throw new ApiError(reasons.shift(), { retryable: true });
      return { ...data, modeId: MODE_ID, counted: true, status: 'official' };
    },
  };
  const sender = createTimeAttackOutbox(api, { stores: () => [store] });
  await sender.flush(true);
  assert.equal((await store.get('launches', launch.id)).sent, false);
  await sender.flush(true);
  assert.equal((await store.get('outbox', upload.id)).nextChunk, 0);
  await sender.flush(true);
  assert.deepEqual(requests, ['time-attack-complete', 'time-attack-launch', 'time-attack-complete',
    'time-attack-chunk', 'time-attack-complete']);
  assert.equal((await store.get('records', launch.id)).status, 'official');
});
