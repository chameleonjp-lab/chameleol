import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { openStore } from '../../src/storage/store.js';
import { ApiError, uuid } from '../../src/net/api.js';
import { createStartRequest, sendStartRequest, validateStartResponse } from '../../src/net/start.js';

const V1 = 'kamereoru-rules-v1';
const V3 = 'kamereoru-rules-v3';
const V4 = 'kamereoru-rules-v4';
const fresh = () => openStore({ indexedDB: new IDBFactory(), name: uuid() });
const response = (body, rulesVersion) => ({
  ok: true, requestId: body.requestId, playId: uuid(), seed: 123,
  rulesVersion, generatorVersion: 'kamereoru-course-v1',
  gameVersion: body.gameVersion, name: body.name,
});

test('new start persists supported versions before transmission', async () => {
  const store = await fresh();
  try {
    const record = await createStartRequest(store, { name: 'ねこ', launchId: uuid(), gameVersion: 't' });
    assert.deepEqual(record.supportedRulesVersions, [V3, V1]);
    assert.deepEqual((await store.getOne('starts', record.requestId)).supportedRulesVersions, [V3, V1]);
  } finally { store.close(); }
});

for (const [client, server, wanted] of [['old', 'old', V1], ['old', 'new', V1], ['new', 'old', V1], ['new', 'new', V3]]) {
  test(`${client} client accepts ${server} server selection ${wanted}`, async () => {
    const store = await fresh();
    try {
      const record = await createStartRequest(store, { name: 'ねこ', launchId: uuid(), gameVersion: 't' });
      if (client === 'old') {
        delete record.supportedRulesVersions;
        await store.put('starts', record);
      }
      const api = { async post(path, body) {
        assert.equal(path, 'start');
        const supported = body.supportedRulesVersions ?? [V1];
        return response(body, server === 'new' && supported.includes(V3) ? V3 : V1);
      } };
      const accepted = await sendStartRequest(api, store, await store.getOne('starts', record.requestId), { delays: [] });
      assert.equal(accepted.ok, true);
      assert.equal(accepted.data.rulesVersion, wanted);
      assert.equal((await store.getOne('starts', record.requestId)).response.rulesVersion, wanted);
    } finally { store.close(); }
  });
}

test('retry sends the saved capability list and validates against that list', async () => {
  const store = await fresh();
  try {
    const record = await createStartRequest(store, { name: 'ねこ', launchId: uuid(), gameVersion: 't' });
    record.supportedRulesVersions = [V1];
    await store.put('starts', record);
    const sent = [];
    const api = { async post(path, body) {
      sent.push(structuredClone(body));
      if (sent.length === 1) throw new ApiError('timeout', { retryable: true });
      return response(body, V3);
    } };
    const result = await sendStartRequest(api, store, await store.getOne('starts', record.requestId), { delays: [0] });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'invalid_start_response');
    assert.deepEqual(sent.map((body) => body.supportedRulesVersions), [[V1], [V1]]);
    assert.equal(sent[0].requestId, sent[1].requestId);
    assert.deepEqual((await store.getOne('starts', record.requestId)).supportedRulesVersions, [V1]);
  } finally { store.close(); }
});

test('response validation rejects standalone, unknown, and unadvertised rules', () => {
  const expected = { requestId: uuid(), name: 'ねこ', gameVersion: 't', supportedRulesVersions: [V3, V1] };
  assert.deepEqual(validateStartResponse(response(expected, V3), expected), []);
  for (const version of [V4, 'unknown', 'kamereoru-rules-v2']) {
    assert.ok(validateStartResponse(response(expected, version), expected).includes('rulesVersion'));
  }
  assert.ok(validateStartResponse(response(expected, V4), { ...expected, supportedRulesVersions: [V4] }).includes('rulesVersion'));
  assert.ok(validateStartResponse(response(expected, V3), { ...expected, supportedRulesVersions: [V1] }).includes('rulesVersion'));
  assert.ok(validateStartResponse(response(expected, V3), { ...expected, supportedRulesVersions: undefined }).includes('rulesVersion'));
  for (const supportedRulesVersions of [null, [], [V3, V3], [V3, V1, V4], [V3, 'unknown'], 'kamereoru-rules-v3']) {
    assert.ok(validateStartResponse(response(expected, V3), { ...expected, supportedRulesVersions }).includes('rulesVersion'));
  }
});

test('response validation checks request identity, game version, generator and seed', () => {
  const expected = { requestId: uuid(), name: 'ねこ', gameVersion: 't', supportedRulesVersions: [V3, V1] };
  const valid = response(expected, V3);
  for (const [key, value] of [['requestId', uuid()], ['name', 'いぬ'], ['gameVersion', 'another'], ['generatorVersion', 'another'], ['seed', -1], ['seed', 0x100000000], ['seed', 1.5], ['playId', 'invalid']]) {
    assert.ok(validateStartResponse({ ...valid, [key]: value }, expected).includes(key), key);
  }
});
