// Deno（本番の Edge Function と同じ実行環境）で、サーバーの検証処理と色差の照合値が同じになることを確かめる。
// scripts/cross-engine-check.mjs から呼ばれる。結果は1行1件の JSON。
import { verifyResult } from '../supabase/functions/_shared/kamereoru/replay.ts';
import { createGame, replayHistory, hsvToRgb8, rgb8ToLab, ciede2000, deltaEToMatchUnits, RULES_V1, rulesForVersion } from '../supabase/functions/_shared/kamereoru/rules/v1/index.js';

const root = new URL('../', import.meta.url);
const golden = (await Deno.readTextFile(new URL('tests/rules/fixtures/deltae-golden.txt', root))).trim();
let text = '';
for (let i = 0; i < 400; i += 1) {
  const a = { h: (i * 7919) % 36000, s: (i * 104729) % 10001, v: (i * 1299709) % 10001 };
  const b = { h: (i * 15485863) % 36000, s: (i * 32452843) % 10001, v: (i * 49979687) % 10001 };
  const dE = ciede2000(rgb8ToLab(hsvToRgb8(a.h, a.s, a.v)), rgb8ToLab(hsvToRgb8(b.h, b.s, b.v)));
  text += `${dE.toString()}|${deltaEToMatchUnits(dE)}\n`;
}
const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map((x) => x.toString(16).padStart(2, '0')).join('');
console.log(JSON.stringify({ engine: `Deno ${Deno.version.deno}`, check: 'deltaE golden', ok: digest === golden }));

const { loadReplayFixtures } = await import('./replay-fixtures.mjs');
for (const f of loadReplayFixtures()) {
  const r = replayHistory(createGame({ seed: f.seed, rules: rulesForVersion(f.rulesVersion) }), f.history);
  const same = JSON.stringify(r.summary) === JSON.stringify(f.expected);
  if (!['kamereoru-rules-v1', 'kamereoru-rules-v3'].includes(f.rulesVersion)) {
    console.log(JSON.stringify({ engine: `Deno ${Deno.version.deno}`, check: `standalone replay ${f.name}`, ok: same }));
    continue;
  }
  const v = verifyResult({
    playId: 'p', launchId: 'l', seed: String(f.seed), rulesVersion: f.rulesVersion, generatorVersion: RULES_V1.generatorVersion,
    acceptedAt: '2026-01-01T00:00:00Z', receivedAt: '2026-01-02T00:00:00Z',
    body: { format: 'kamereoru-result-v1', playId: 'p', launchId: 'l', rulesVersion: f.rulesVersion, generatorVersion: RULES_V1.generatorVersion, seed: f.seed, history: f.history, claimed: f.expected },
  });
  console.log(JSON.stringify({ engine: `Deno ${Deno.version.deno}`, check: `replay ${f.name}`, ok: same && v.status === 'official' }));
}
