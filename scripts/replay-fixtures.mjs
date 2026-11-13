// Fixed legacy fixtures and versioned bonus fixtures share one replay contract.
import { readdirSync, readFileSync } from 'node:fs';
export function loadReplayFixtures() {
  const dir = new URL('../tests/replay/fixtures/', import.meta.url);
  const fixtures = readdirSync(dir).filter((f) => f.endsWith('.json')).sort()
    .map((f) => JSON.parse(readFileSync(new URL(f, dir), 'utf8')));
  for (const version of [1, 2]) {
    const f = JSON.parse(readFileSync(new URL(`../tests/compat/fixtures/pre-bonus-v${version}.json`, import.meta.url), 'utf8'));
    fixtures.push({ name: `pre-bonus-v${version}`, rulesVersion: f.rules.rulesVersion,
      seed: f.snapshots[0].meta.seed, history: f.history, expected: f.summary });
  }
  return fixtures;
}
