// 指操作の割り当て（受入試験 PLAY-02〜05 の判定部分）。実機での確認は docs/acceptance/results.md に別に記録する。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPointerRouter } from '../../src/ui/pointer-router.js';
import { pointFromHs } from '../../src/rules/v1/index.js';

const GEO = { palette: { cx: 150, cy: 150, r: 120 }, bar: { x: 320, y: 30, w: 52, h: 240 } };

function setup({ locked = false } = {}) {
  const changes = [];
  let lockedTaps = 0;
  const router = createPointerRouter({ onChange: (v) => changes.push(v), onLockedTap: () => (lockedTaps += 1) });
  router.setGeometry(GEO);
  router.setBarLocked(locked);
  return { router, changes, get lockedTaps() {
    return lockedTaps;
  } };
}

const at = (h, s) => {
  const p = pointFromHs(h, s, GEO.palette.r);
  return [GEO.palette.cx + p.dx, GEO.palette.cy + p.dy];
};

test('PLAY-02: タップはその位置を直接選び、ドラッグは即時反映、指を離すと値を保持', () => {
  const { router, changes } = setup();
  assert.equal(router.down(1, ...at(9000, 5000)), 'palette');
  assert.deepEqual(changes.at(-1), { h: 9000, s: 5000, v: 10000 });
  router.move(1, ...at(9100, 5200));
  assert.deepEqual(changes.at(-1), { h: 9100, s: 5200, v: 10000 });
  router.up(1);
  router.move(1, ...at(20000, 9000)); // 離した後の移動は無視
  assert.deepEqual(router.values, { h: 9100, s: 5200, v: 10000 });
  // 別の位置を再タップすると、その位置を直接選ぶ（補正や吸着なし）
  router.down(2, ...at(30000, 8000));
  assert.deepEqual(router.values, { h: 30000, s: 8000, v: 10000 });
});

test('PLAY-03: 2本指で同時に操作し、片方を離してももう一方は続く。3本目は先の指を奪わない', () => {
  const { router } = setup();
  assert.equal(router.down(1, ...at(1000, 3000)), 'palette');
  assert.equal(router.down(2, 346, 150), 'bar');
  router.move(2, 346, 90);
  router.move(1, ...at(2000, 4000));
  assert.deepEqual(router.values, { h: 2000, s: 4000, v: 7500 });
  router.up(2);
  router.move(1, ...at(2500, 4500));
  assert.deepEqual(router.values, { h: 2500, s: 4500, v: 7500 });
  // 同じパレットへ3本目：割り当てられない
  assert.equal(router.down(3, ...at(30000, 9000)), null);
  router.move(3, ...at(30000, 9000));
  assert.deepEqual(router.values, { h: 2500, s: 4500, v: 7500 });
  // 先の指は引き続き操作できる
  router.move(1, ...at(2600, 4600));
  assert.equal(router.values.h, 2600);
});

test('PLAY-04: 円外は外周、遠く外れたら保持、戻ると再開。バー外は端、遠くは保持。他方の部品に入っても対象を変えない', () => {
  const { router } = setup();
  router.down(1, ...at(0, 5000));
  router.move(1, 150, 150 - 160); // 真上で円の外（半径の1.33倍）
  assert.deepEqual(router.values, { h: 0, s: 10000, v: 10000 });
  router.move(1, 150, 150 - 300); // 半径の2.5倍：保持
  assert.deepEqual(router.values, { h: 0, s: 10000, v: 10000 });
  router.move(1, ...at(9000, 5000)); // 戻ると再開
  assert.deepEqual(router.values, { h: 9000, s: 5000, v: 10000 });
  // 指がバーの上へ入っても、パレットの指のまま（色合いが変わる）
  router.move(1, 346, 150);
  assert.equal(router.values.v, 10000);
  router.up(1);

  router.down(2, 346, 100);
  router.move(2, 346, 10); // 上端の外：明るさ100%
  assert.equal(router.values.v, 10000);
  router.move(2, 346, 300); // 下端の外：0%
  assert.equal(router.values.v, 0);
  router.move(2, 346, 800); // 遠く外れた：保持
  assert.equal(router.values.v, 0);
  router.move(2, 346, 150); // 戻ると再開
  assert.equal(router.values.v, 5000);
});

test('PLAY-05: 中断・画面離脱では指の割り当てだけを解放し、値は残す', () => {
  const { router } = setup();
  router.down(1, ...at(12000, 7000));
  router.down(2, 346, 200);
  const before = router.values;
  router.releaseAll();
  router.move(1, ...at(100, 100));
  router.move(2, 346, 40);
  assert.deepEqual(router.values, before);
  assert.deepEqual(router.activeParts(), []);
  router.setEnabled(false);
  assert.equal(router.down(5, ...at(1, 1)), null);
});

test('INPUT-07: 明るさ0%から戻しても色合い・鮮やかさは保持される', () => {
  const { router } = setup();
  router.down(1, ...at(25000, 6600));
  router.up(1);
  router.down(2, 346, 400 - 130); // 下端付近
  router.move(2, 346, 300);
  assert.equal(router.values.v, 0);
  router.move(2, 346, 30);
  assert.deepEqual(router.values, { h: 25000, s: 6600, v: 10000 });
});

test('20棟より前はバーがロック。押すとヒントだけ出し、値は変えない。解放後は位置を変えずに使える', () => {
  const s = setup({ locked: true });
  assert.equal(s.router.down(1, 346, 200), 'bar-locked');
  assert.equal(s.lockedTaps, 1);
  assert.equal(s.router.values.v, 10000);
  s.router.setBarLocked(false);
  assert.deepEqual(s.router.geometry, GEO);
  assert.equal(s.router.down(2, 346, 150), 'bar');
  assert.equal(s.router.values.v, 5000);
});

test('円の中心をタップしても、直前の色合いは消えない', () => {
  const { router } = setup();
  router.down(1, ...at(18000, 5000));
  router.move(1, 150, 150);
  assert.deepEqual(router.values, { h: 18000, s: 0, v: 10000 });
});
