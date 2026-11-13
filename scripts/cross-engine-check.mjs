// 別の JavaScript エンジンでも、判定規則が同じ結果になることを確かめる。
// - QuickJS（V8 とは別の実装。Math.sin などの組み込み関数の実装も違う）で、照合例の再計算と色差の照合値を比べる
// - Deno（本番の Edge Function と同じ実行環境）があれば、サーバーの検証処理（replay.ts）でも比べる
// 使い方: node scripts/cross-engine-check.mjs   （DENO_BIN で deno の場所を指定できる）
import { build } from 'esbuild';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { getQuickJS } from 'quickjs-emscripten';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const { loadReplayFixtures } = await import('./replay-fixtures.mjs');
const fixtures = loadReplayFixtures();
const golden = readFileSync(join(ROOT, 'tests', 'rules', 'fixtures', 'deltae-golden.txt'), 'utf8').trim();

const bundle = await build({
  entryPoints: [join(ROOT, 'src', 'rules', 'v1', 'index.js')],
  bundle: true,
  format: 'iife',
  globalName: 'KR',
  write: false,
  target: 'es2020',
});
const code = bundle.outputFiles[0].text;

// 色差の照合値（tests/rules/color.test.mjs と同じ400組）
const GOLDEN_SRC = `
(function () {
  var out = [];
  for (var i = 0; i < 400; i += 1) {
    var a = { h: (i * 7919) % 36000, s: (i * 104729) % 10001, v: (i * 1299709) % 10001 };
    var b = { h: (i * 15485863) % 36000, s: (i * 32452843) % 10001, v: (i * 49979687) % 10001 };
    var la = KR.rgb8ToLab(KR.hsvToRgb8(a.h, a.s, a.v));
    var lb = KR.rgb8ToLab(KR.hsvToRgb8(b.h, b.s, b.v));
    var dE = KR.ciede2000(la, lb);
    out.push(dE.toString() + '|' + KR.deltaEToMatchUnits(dE) + '\\n');
  }
  return out.join('');
})()`;

const results = [];
const QuickJS = await getQuickJS();
const vm = QuickJS.newContext();
try {
  const loaded = vm.evalCode(code);
  if (loaded.error) throw new Error(`QuickJS load failed: ${JSON.stringify(vm.dump(loaded.error))}`);
  loaded.value.dispose();
  const g = vm.evalCode(GOLDEN_SRC);
  if (g.error) throw new Error(JSON.stringify(vm.dump(g.error)));
  const digest = createHash('sha256').update(vm.dump(g.value)).digest('hex');
  g.value.dispose();
  results.push({ engine: 'QuickJS', check: 'deltaE golden', ok: digest === golden, detail: digest });
  for (const f of fixtures) {
    const src = `JSON.stringify(KR.replayHistory(KR.createGame({ seed: ${f.seed}, rules: KR.rulesForVersion(${JSON.stringify(f.rulesVersion)}) }), ${JSON.stringify(f.history)}).summary)`;
    const r = vm.evalCode(src);
    if (r.error) throw new Error(JSON.stringify(vm.dump(r.error)));
    const got = JSON.parse(vm.dump(r.value));
    r.value.dispose();
    results.push({ engine: 'QuickJS', check: `replay ${f.name}`, ok: JSON.stringify(got) === JSON.stringify(f.expected) });
  }
  for (const seed of [0, 1, 123456789, 4294967295]) {
    const r = vm.evalCode(`JSON.stringify(KR.makeCourse(${seed}).targets)`);
    const got = vm.dump(r.value);
    r.value.dispose();
    const { makeCourse } = await import('../src/rules/v1/index.js');
    results.push({ engine: 'QuickJS', check: `course ${seed}`, ok: got === JSON.stringify(makeCourse(seed).targets) });
  }
} finally {
  vm.dispose();
}

const deno = process.env.DENO_BIN || (spawnSync('deno', ['--version']).status === 0 ? 'deno' : null);
if (deno && existsSync(deno.includes('/') ? deno : '/') ) {
  const r = spawnSync(deno, ['run', '--allow-read', join(ROOT, 'scripts', 'deno-replay-check.ts')], { encoding: 'utf8', cwd: ROOT });
  if (r.status !== 0) {
    results.push({ engine: 'Deno', check: 'run', ok: false, detail: (r.stderr || r.stdout).slice(0, 2000) });
  } else {
    for (const line of r.stdout.trim().split('\n')) results.push(JSON.parse(line));
  }
} else {
  results.push({ engine: 'Deno', check: 'skipped (deno not found)', ok: true, skipped: true });
}

for (const r of results) console.log(`${r.ok ? 'ok' : 'NOT OK'}\t${r.engine}\t${r.check}${r.detail && !r.ok ? `\t${r.detail}` : ''}`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
