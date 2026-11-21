export class StaleTimeAttackWriter extends Error {}

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
    const prior = this.tables.kv.get('timeAttackLocalBest')?.elapsedCs ?? null;
    const newBest = record.result.reason === 'cleared' && (prior === null || record.result.elapsedCs < prior);
    const bestElapsedCs = newBest ? record.result.elapsedCs : prior;
    this.tables.records.set(record.id, structuredClone({ ...record, bestElapsedCs, newBest }));
    if (outbox) this.tables.outbox.set(outbox.id, structuredClone(outbox));
    if (newBest) this.tables.kv.set('timeAttackLocalBest', { id: 'timeAttackLocalBest', elapsedCs: bestElapsedCs });
    this.tables.runs.delete('time-attack');
    return { bestElapsedCs, newBest };
  }
}
