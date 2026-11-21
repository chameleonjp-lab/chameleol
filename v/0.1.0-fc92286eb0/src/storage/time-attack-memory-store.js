import { TIME_ATTACK_BUILDING_COUNT, timeAttackBuildingCount } from '../rules/time-attack/v1/index.js';

export class StaleTimeAttackWriter extends Error {}

export function timeAttackBestKey(result) {
  return timeAttackBuildingCount(result.rulesVersion) === TIME_ATTACK_BUILDING_COUNT
    ? 'timeAttackLocalBest20' : 'timeAttackLocalBest';
}

export class TimeAttackMemoryStore {
  constructor() {
    this.tables = Object.fromEntries(
      ['starts', 'launches', 'outbox', 'records', 'runs', 'kv'].map(name => [name, new Map()]),
    );
  }

  async get(name, id) { return structuredClone(this.tables[name].get(id)); }
  async getAll(name) { return Array.from(this.tables[name].values(), item => structuredClone(item)); }
  async put(name, item) { this.tables[name].set(item.id, structuredClone(item)); }
  async remove(name, id) { this.tables[name].delete(id); }

  async begin(launch, attempt, signal) {
    if (signal.aborted) throw signal.reason;
    const run = this.tables.runs.get('time-attack');
    if (run && run.ownerEpoch > attempt.ownerEpoch) throw new StaleTimeAttackWriter();
    this.tables.runs.set('time-attack', { id: 'time-attack', ...attempt, launchId: launch.id });
    this.tables.launches.set(launch.id, structuredClone(launch));
    this.tables.starts.delete(attempt.attemptId);
  }

  async finish(attempt, record, outbox) {
    const run = this.tables.runs.get('time-attack');
    if (run?.attemptId !== attempt.attemptId || run.ownerEpoch !== attempt.ownerEpoch) throw new StaleTimeAttackWriter();
    const bestKey = timeAttackBestKey(record.result);
    const prior = this.tables.kv.get(bestKey)?.elapsedCs ?? null;
    const newBest = record.result.reason === 'cleared' && (prior === null || record.result.elapsedCs < prior);
    const bestElapsedCs = newBest ? record.result.elapsedCs : prior;
    this.tables.records.set(record.id, structuredClone({ ...record, bestElapsedCs, newBest }));
    if (outbox) this.tables.outbox.set(outbox.id, structuredClone(outbox));
    if (newBest) this.tables.kv.set(bestKey, { id: bestKey, elapsedCs: bestElapsedCs });
    this.tables.runs.delete('time-attack');
    return { bestElapsedCs, newBest };
  }
}
