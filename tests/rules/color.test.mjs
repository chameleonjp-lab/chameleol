// 色の換算・色差・一致度の照合例。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  RULES_V1,
  ciede2000,
  hsvToRgb8,
  rgb8ToLab,
  deltaEToMatchUnits,
  classifyMatch,
  hsFromPoint,
  pointFromHs,
  vFromBar,
  barFromV,
  divRoundHalfUp,
  hsvToHex,
} from '../../src/rules/v1/index.js';
import { atan2Deg, cbrt, cosDeg, exp, pow24, sinDeg, root5 } from '../../src/rules/v1/detmath.js';

const sharma = readFileSync(new URL('./fixtures/ciede2000_sharma.tsv', import.meta.url), 'utf8')
  .split('\n')
  .filter((line) => line && !line.startsWith('#'))
  .map((line) => line.split('\t').map(Number));

test('CIEDE2000：Sharmaらの試験34組と小数4桁で一致する', () => {
  assert.equal(sharma.length, 34);
  for (const [pair, L1, a1, b1, L2, a2, b2, expected] of sharma) {
    const got = ciede2000([L1, a1, b1], [L2, a2, b2]);
    assert.ok(Math.abs(got - expected) < 0.00005 + 1e-12, `pair ${pair}: ${got} vs ${expected}`);
    // 対称性
    const back = ciede2000([L2, a2, b2], [L1, a1, b1]);
    assert.ok(Math.abs(back - got) < 1e-9, `pair ${pair} symmetry`);
  }
});

test('決定的な数学関数は、組み込み関数と十分な精度で一致する', () => {
  for (let i = 0; i <= 2000; i += 1) {
    const x = i / 2000;
    if (x > 0) {
      assert.ok(Math.abs(cbrt(x) - Math.cbrt(x)) < 1e-15, `cbrt ${x}`);
      assert.ok(Math.abs(pow24(x) - x ** 2.4) < 1e-15, `pow24 ${x}`);
      assert.ok(Math.abs(root5(x) - x ** 0.2) < 1e-15, `root5 ${x}`);
    }
    const deg = i * 0.37 - 300;
    assert.ok(Math.abs(sinDeg(deg) - Math.sin((deg * Math.PI) / 180)) < 1e-14, `sin ${deg}`);
    assert.ok(Math.abs(cosDeg(deg) - Math.cos((deg * Math.PI) / 180)) < 1e-14, `cos ${deg}`);
    const z = -i / 40;
    assert.ok(Math.abs(exp(z) - Math.exp(z)) <= Math.exp(z) * 1e-14, `exp ${z}`);
    const ang = (i / 2000) * 2 * Math.PI;
    const y = Math.sin(ang) * 3;
    const xx = Math.cos(ang) * 3;
    let ref = (Math.atan2(y, xx) * 180) / Math.PI;
    if (ref < 0) ref += 360;
    const got = atan2Deg(y, xx);
    const diff = Math.min(Math.abs(got - ref), 360 - Math.abs(got - ref));
    assert.ok(diff < 1e-11, `atan2 ${ang}: ${got} vs ${ref}`);
  }
  assert.equal(atan2Deg(0, 0), 0);
  assert.equal(atan2Deg(0, 1), 0);
  assert.equal(atan2Deg(1, 0), 90);
  assert.equal(atan2Deg(0, -1), 180);
});

test('HSV→8ビットsRGBは整数だけで計算し、代表色が期待どおり', () => {
  assert.deepEqual(hsvToRgb8(0, 10000, 10000), [255, 0, 0]);
  assert.deepEqual(hsvToRgb8(12000, 10000, 10000), [0, 255, 0]);
  assert.deepEqual(hsvToRgb8(24000, 10000, 10000), [0, 0, 255]);
  assert.deepEqual(hsvToRgb8(0, 0, 10000), [255, 255, 255]);
  assert.deepEqual(hsvToRgb8(5000, 3000, 0), [0, 0, 0]);
  assert.deepEqual(hsvToRgb8(6000, 10000, 5000), [128, 128, 0]); // 127.5は切り上げ
  // 浮動小数の参照計算と全域で±1以内
  for (let h = 0; h < 36000; h += 997) {
    for (let s = 0; s <= 10000; s += 1111) {
      for (let v = 0; v <= 10000; v += 1429) {
        const H = h / 6000;
        const C = (v / 10000) * (s / 10000);
        const X = C * (1 - Math.abs((H % 2) - 1));
        const m = v / 10000 - C;
        const sec = Math.floor(H);
        const rgb = [
          [C, X, 0],
          [X, C, 0],
          [0, C, X],
          [0, X, C],
          [X, 0, C],
          [C, 0, X],
        ][sec].map((c) => (c + m) * 255);
        const got = hsvToRgb8(h, s, v);
        got.forEach((c, i) => assert.ok(Math.abs(c - rgb[i]) <= 0.5 + 1e-9, `${h},${s},${v}`));
      }
    }
  }
  assert.equal(hsvToHex(RULES_V1.initialColor), '#72ff4e');
  // 提供資料の緑そのものも、整数の操作値で再現できる
  assert.equal(hsvToHex({ h: 10765, s: 6939, v: 7686 }), '#58c43c');
});

test('白は L=100・a=0・b=0、黒は L=0', () => {
  const [L, a, b] = rgb8ToLab([255, 255, 255]);
  assert.ok(Math.abs(L - 100) < 1e-4 && Math.abs(a) < 1e-3 && Math.abs(b) < 1e-3, `${L},${a},${b}`);
  assert.deepEqual(rgb8ToLab([0, 0, 0]).map((x) => Math.abs(x) < 1e-12), [true, true, true]);
});

test('一致度：完全一致100%、色差が増えると非増加、色差6で85%・14で55%', () => {
  const units = RULES_V1.match.unitsPerPercent;
  assert.equal(deltaEToMatchUnits(0), 100 * units);
  assert.equal(deltaEToMatchUnits(6), 85 * units);
  assert.equal(deltaEToMatchUnits(14), 55 * units);
  assert.equal(deltaEToMatchUnits(40), 0);
  assert.equal(deltaEToMatchUnits(99), 0);
  let prev = Infinity;
  for (let d = 0; d <= 50; d += 0.01) {
    const u = deltaEToMatchUnits(d);
    assert.ok(u <= prev, `non-increasing at ${d}`);
    prev = u;
  }
  assert.equal(classifyMatch(deltaEToMatchUnits(5.999)), 'success');
  assert.equal(classifyMatch(deltaEToMatchUnits(6)), 'success');
  assert.equal(classifyMatch(deltaEToMatchUnits(6.001)), 'slight');
  assert.equal(classifyMatch(deltaEToMatchUnits(14)), 'slight');
  assert.equal(classifyMatch(deltaEToMatchUnits(14.001)), 'danger');
  // 平均85%の連続成功は、評価区間中ずっと色差6以下なら必ず達成できる
  assert.ok(deltaEToMatchUnits(6) >= RULES_V1.score.comboMinUnits);
});

test('同じ8ビット色に見える体色と壁は、色差0・一致度100%', () => {
  const a = { h: 21000, s: 6000, v: 8000 };
  const b = { h: 21001, s: 6000, v: 8000 };
  assert.equal(hsvToHex(a), hsvToHex(b));
  const la = rgb8ToLab(hsvToRgb8(a.h, a.s, a.v));
  const lb = rgb8ToLab(hsvToRgb8(b.h, b.s, b.v));
  assert.equal(ciede2000(la, lb), 0);
});

test('円とバーの座標：操作値→位置→操作値の往復が一致する', () => {
  const R = 160;
  for (let h = 0; h < 36000; h += 37) {
    for (const s of [500, 2500, 5000, 7777, 10000]) {
      const p = pointFromHs(h, s, R);
      const back = hsFromPoint(p.dx, p.dy, R);
      assert.equal(back.s, s, `s ${h},${s}`);
      if (s > 0) assert.equal(back.h, h, `h ${h},${s}`);
    }
  }
  // 円外は外周（鮮やかさ100%）へ制限し、方向は保つ
  const far = hsFromPoint(0, -10 * R, R);
  assert.deepEqual(far, { h: 0, s: 10000 });
  const right = hsFromPoint(3 * R, 0, R);
  assert.deepEqual(right, { h: 9000, s: 10000 });
  for (let v = 0; v <= 10000; v += 1) {
    assert.equal(vFromBar(barFromV(v, 300), 300), v);
  }
  assert.equal(vFromBar(-50, 300), 10000);
  assert.equal(vFromBar(400, 300), 0);
});

test('四捨五入の整数除算', () => {
  assert.equal(divRoundHalfUp(5, 2), 3);
  assert.equal(divRoundHalfUp(4, 2), 2);
  assert.equal(divRoundHalfUp(7, 3), 2);
  assert.equal(divRoundHalfUp(15017, 2), 7509);
});

test('色差の照合値（版の固定）：決まった色の組の色差が変わっていない', () => {
  // 実装を変えたら、この指紋が変わる。変えるときは rulesVersion を上げる。
  const hash = createHash('sha256');
  for (let i = 0; i < 400; i += 1) {
    const a = { h: (i * 7919) % 36000, s: (i * 104729) % 10001, v: (i * 1299709) % 10001 };
    const b = { h: (i * 15485863) % 36000, s: (i * 32452843) % 10001, v: (i * 49979687) % 10001 };
    const la = rgb8ToLab(hsvToRgb8(a.h, a.s, a.v));
    const lb = rgb8ToLab(hsvToRgb8(b.h, b.s, b.v));
    const dE = ciede2000(la, lb);
    hash.update(`${dE.toString()}|${deltaEToMatchUnits(dE)}\n`);
  }
  const digest = hash.digest('hex');
  const golden = readFileSync(new URL('./fixtures/deltae-golden.txt', import.meta.url), 'utf8').trim();
  assert.equal(digest, golden);
});
