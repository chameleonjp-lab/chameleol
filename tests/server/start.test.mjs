// 開始受付とプレイ回数（受入試験 NET-TEST-01〜03、SCOPE-05 の一部、R2）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { SKIP, freshServer, rankedStart, count } from './helpers.mjs';
import { randomSecret } from '../../src/storage/store.js';
import { uuid } from '../../src/net/api.js';

const launches = (srv) => count(srv, 'select count(*) as n from private.kamereoru_launches');

test('NET-TEST-01: 同じ要求番号の再送には同じ受付番号・出題番号・版・名義を返す。別の秘密では拒否', { skip: SKIP }, async () => {
  const srv = await freshServer('start1');
  try {
    const req = { requestId: uuid(), secret: randomSecret(), launchId: uuid(), name: 'ことり', gameVersion: '0.1.0' };
    const a = await srv.call('start', req);
    const b = await srv.call('start', req);
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    for (const k of ['playId', 'seed', 'rulesVersion', 'generatorVersion', 'name', 'acceptedAt']) assert.deepEqual(b.body[k], a.body[k], k);
    assert.equal(a.body.created, true);
    assert.equal(b.body.created, false);
    assert.equal(await count(srv, 'select count(*) as n from private.kamereoru_starts'), 1);
    // 番号を知っているだけ（別の秘密）では受付内容を得られない
    const other = await srv.call('start', { ...req, secret: randomSecret() });
    assert.equal(other.status, 403);
    assert.equal(other.body.error, 'forbidden');
    assert.equal(other.body.playId, undefined);
    // 同じ要求番号で中身を変えると拒否
    const changed = await srv.call('start', { ...req, name: 'べつのなまえ' });
    assert.equal(changed.status, 409);
  } finally {
    await srv.close();
  }
});

test('名前はサーバーでも同じ規則で整理し、整理前の名前・空白だけ・21文字を受け付けない', { skip: SKIP }, async () => {
  const srv = await freshServer('start2');
  try {
    const base = { secret: randomSecret(), launchId: uuid(), gameVersion: '0.1.0' };
    const r1 = await srv.call('start', { ...base, requestId: uuid(), name: 'ＡＢＣ' });
    assert.equal(r1.status, 422);
    assert.equal(r1.body.error, 'name_not_normalized');
    assert.equal(r1.body.detail, 'ABC');
    assert.equal((await srv.call('start', { ...base, requestId: uuid(), name: '   ' })).status, 422);
    assert.equal((await srv.call('start', { ...base, requestId: uuid(), name: 'x'.repeat(21) })).status, 422);
    assert.equal((await srv.call('start', { ...base, requestId: uuid(), name: 'a\nb' })).status, 422);
    assert.equal((await srv.call('start', { ...base, requestId: uuid(), name: 'x'.repeat(20) })).status, 200);
    assert.equal((await srv.call('start', { ...base, requestId: uuid(), launchId: uuid(), name: '👨‍👩‍👧‍👦'.repeat(20) })).status, 200);
  } finally {
    await srv.close();
  }
});

test('R2: 準備だけで中止＝0回', { skip: SKIP }, async () => {
  const srv = await freshServer('start3');
  try {
    const s = await rankedStart(srv, 'まえ', { launch: false });
    const ab = await srv.call('abandon', { requestId: s.requestId, secret: s.secret });
    assert.equal(ab.body.status, 'abandoned');
    assert.equal(await launches(srv), 0);
    // 中止した開始には結果を付けられない
    const c = await srv.call('chunk', { playId: s.playId, resultId: uuid(), secret: s.secret, index: 0, total: 1, length: 2, sha256: 'a'.repeat(64), data: '{}' });
    assert.equal(c.status, 409);
    assert.equal(c.body.error, 'start_abandoned');
  } finally {
    await srv.close();
  }
});

test('R2/NET-TEST-03: 受付応答が消えて対象外で開始→旧応答が到着しても1回・順位なし。旧予約を後から取り付けられない', { skip: SKIP }, async () => {
  const srv = await freshServer('start4');
  try {
    // サーバーは受け付けたが、応答が端末に届かなかった
    const s = await rankedStart(srv, 'おそい', { launch: false });
    // 端末は同じスタート操作（同じ launchId）で対象外として本編を始めた
    const u = await srv.call('launch', { launchId: s.launchId, ranked: false, gameVersion: '0.1.0' });
    assert.equal(u.body.counted, true);
    // 古い応答の予約を、そのスタート操作の名前ありプレイとして数えようとしても拒否
    const late = await srv.call('launch', { launchId: s.launchId, ranked: true, playId: s.playId, secret: s.secret, gameVersion: '0.1.0' });
    assert.equal(late.status, 409);
    // 端末は元の要求を中止として伝える
    await srv.call('abandon', { requestId: s.requestId, secret: s.secret });
    assert.equal(await launches(srv), 1);
    assert.equal(await count(srv, "select count(*) as n from private.kamereoru_launches where ranked"), 0);
    assert.equal(await count(srv, 'select count(*) as n from private.kamereoru_results'), 0);
  } finally {
    await srv.close();
  }
});

test('R2/NET-04: 匿名で開始→終了→再起動→通信復旧（同じ通知を再送）＝1回', { skip: SKIP }, async () => {
  const srv = await freshServer('start5');
  try {
    const launchId = uuid();
    const a = await srv.call('launch', { launchId, ranked: false, gameVersion: '0.1.0' });
    srv.restart();
    const b = await srv.call('launch', { launchId, ranked: false, gameVersion: '0.1.0' });
    assert.equal(a.body.counted, true);
    assert.equal(b.body.counted, false);
    assert.equal(await launches(srv), 1);
    // 名前ありの開始通知も再送で増えない
    const s = await rankedStart(srv, 'ふたり');
    await srv.call('launch', { launchId: s.launchId, ranked: true, playId: s.playId, secret: s.secret, gameVersion: '0.1.0' });
    assert.equal(await launches(srv), 2);
    // 名前ありの開始通知は送信元の秘密が必要
    const forged = await srv.call('launch', { launchId: uuid(), ranked: true, playId: s.playId, secret: randomSecret(), gameVersion: '0.1.0' });
    assert.equal(forged.status, 403);
  } finally {
    await srv.close();
  }
});

test('切り戻し用：新しいランキング対象の開始だけを止められる（既存の照会・再送は止めない）', { skip: SKIP }, async () => {
  const srv = await freshServer('start6');
  try {
    const s = await rankedStart(srv, 'まえから');
    await srv.sql('select private.kamereoru_set_accepting(false)');
    const r = await srv.call('start', { requestId: uuid(), secret: randomSecret(), launchId: uuid(), name: 'あたらしい', gameVersion: '0.1.0' });
    assert.equal(r.status, 503);
    assert.equal(r.body.error, 'ranked_starts_paused');
    assert.equal(r.body.retryable, false);
    // 受付済みの開始の再送は同じ内容を返す
    const again = await srv.call('start', { requestId: s.requestId, secret: s.secret, launchId: s.launchId, name: s.name, gameVersion: '0.1.0' });
    assert.equal(again.status, 200);
    assert.equal(again.body.playId, s.playId);
    const st = await srv.call('status', { items: [{ playId: s.playId, secret: s.secret }] });
    assert.equal(st.status, 200);
  } finally {
    await srv.close();
  }
});

test('SEC-TEST-02: 開始の頻度を接続元ごとに制限し、同じ要求の再送や別の接続元・同名の他人は妨げない', { skip: SKIP }, async () => {
  const srv = await freshServer('start7', { limits: { startPer10m: 3 } });
  try {
    const mk = () => ({ requestId: uuid(), secret: randomSecret(), launchId: uuid(), name: 'おなじ', gameVersion: '0.1.0' });
    const first = mk();
    for (const req of [first, mk(), mk()]) assert.equal((await srv.call('start', req, { ip: '1.1.1.1' })).status, 200);
    const limited = await srv.call('start', mk(), { ip: '1.1.1.1' });
    assert.equal(limited.status, 429);
    assert.equal(limited.body.retryable, true);
    // 同じ要求の再送は数えない
    assert.equal((await srv.call('start', first, { ip: '1.1.1.1' })).status, 200);
    // 同じ名前でも別の接続元は受け付ける（名前で他人を締め出さない）
    assert.equal((await srv.call('start', mk(), { ip: '2.2.2.2' })).status, 200);
  } finally {
    await srv.close();
  }
});
