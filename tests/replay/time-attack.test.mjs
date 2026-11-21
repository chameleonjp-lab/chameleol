import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { InvalidTimeAttackHistoryError, replayTimeAttack } from '../../src/rules/time-attack/v1/index.js';

const directory = new URL('./time-attack-fixtures/', import.meta.url);
for (const filename of readdirSync(directory).sort()) {
  const { name, history, expected } = JSON.parse(readFileSync(new URL(filename, directory), 'utf8'));
  test(`time attack fixed replay: ${name}`, () => {
    if (expected === null) {
      assert.throws(() => replayTimeAttack(history), InvalidTimeAttackHistoryError);
    } else {
      assert.deepEqual(replayTimeAttack(history), expected);
    }
  });
}
