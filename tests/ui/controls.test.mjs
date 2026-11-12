// 指操作の割り当て（受入試験 PLAY-02〜05 の判定部分）およびタップ・ドラッグ・2本指・取消し時の操作音判定。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPointerRouter } from '../../src/ui/pointer-router.js';
import { pointFromHs } from '../../src/rules/v1/index.js';

const GEO = { palette: { cx: 150, cy: 150, r: 120 }, bar: { x: 320, y: 30, w: 52, h: 240 } };

function setup({ locked = false } = {}) {
  const changes = [];
  const metas = [];
  const downs = [];
  const ups = [];
  let lockedTaps = 0;
  const router = createPointerRouter({
    onChange: (v, meta) => {
      changes.push(v);
      metas.push(meta);
    },
    onLockedTap: () => (lockedTaps += 1),
    onPartDown: (part) => downs.push(part),
    onPartUp: (part, changed) => ups.push({ part, changed }),
  });
  router.setGeometry(GEO);
  router.setBarLocked(locked);
  return {
    router,
    changes,
    metas,
    downs,
    ups,
    get lockedTaps() {
      return lockedTaps;
    },
  };
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

test('押し始め（down）とドラッグ移動（move）の phase を区別し、取消・強制解放では onPartUp を呼ばない', () => {
  const { router, metas, downs, ups } = setup();
  // パレット押し始め：phase === 'down'
  router.down(1, ...at(9000, 5000));
  assert.deepEqual(downs, ['palette']);
  assert.equal(metas.at(-1)?.part, 'palette');
  assert.equal(metas.at(-1)?.phase, 'down');

  // ドラッグ移動：phase === 'move'
  router.move(1, ...at(12000, 6000));
  assert.equal(metas.at(-1)?.part, 'palette');
  assert.equal(metas.at(-1)?.phase, 'move');

  // 通常の指離し：changed === true で onPartUp が呼ばれる
  router.up(1);
  assert.deepEqual(ups, [{ part: 'palette', changed: true }]);

  // 同じ色を再タップして動かさず離した場合は changed === false
  router.down(2, ...at(12000, 6000));
  router.up(2);
  assert.deepEqual(ups.at(-1), { part: 'palette', changed: false });

  // pointercancel や releaseAll では onPartUp（確定音）を呼ばない
  const upCountBeforeCancel = ups.length;
  router.down(3, ...at(18000, 7000));
  router.cancel(3);
  router.down(4, 346, 150);
  router.releaseAll();
  assert.equal(ups.length, upCountBeforeCancel, 'cancel / releaseAll では確定音を鳴らさない');
});

test('静止ガイドの同値再描画でも、小刻みなドラッグの操作音を累積する', async () => {
  const { parseHTML } = await import('linkedom');
  const { createControls } = await import('../../src/ui/controls.js');
  const { document, window } = parseHTML('<html><body></body></html>');
  const previous = { document: globalThis.document, Node: globalThis.Node };
  Object.assign(globalThis, { document, Node: window.Node });
  let controls;
  try {
    const steps = [];
    controls = createControls({
      // 静止ガイドの setDraft → renderGuide と同じく、表示へ現在色を返す。
      onChange: (color) => controls.setValues(color),
      onColorStep: (color, part) => steps.push({ color, part }),
    });
    controls.router.setGeometry(GEO);
    controls.setValues({ h: 0, s: 7000, v: 10000 });
    controls.router.down(1, ...at(0, 7000));
    for (let hue = 200; hue <= 3600; hue += 200) controls.router.move(1, ...at(hue, 7000));
    assert.deepEqual(steps.map(({ color, part }) => [color.h, part]), [[1800, 'palette'], [3600, 'palette']]);

    controls.setLocked(false);
    controls.router.down(2, 346, 30);
    // 明度も1%ずつ動かし、12%ごとに鳴る。パレットの指は継続中。
    for (let i = 1; i <= 24; i += 1) controls.router.move(2, 346, 30 + i * 2.4);
    assert.deepEqual(steps.filter(({ part }) => part === 'bar').map(({ color }) => color.v), [8800, 7600]);

    // 外部から本当に別の色へ変更した場合には、新しい色を基準にする。
    controls.setValues({ h: 6000, s: 7000, v: 7600 });
    const before = steps.length;
    controls.router.move(1, ...at(6200, 7000));
    assert.equal(steps.length, before, '外部変更直後の小移動だけでは鳴らない');
    controls.router.move(1, ...at(7800, 7000));
    assert.equal(steps.length, before + 1, '外部変更後も18度で鳴る');
  } finally {
    controls?.destroy();
    for (const key of ['document', 'Node']) {
      if (previous[key] === undefined) delete globalThis[key];
      else globalThis[key] = previous[key];
    }
  }
});
