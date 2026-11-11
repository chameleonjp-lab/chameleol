import { mergePresentationStats } from '../presentation/stats.js';
import { GUIDE_PROGRESS_KEY, normalizeGuideProgress, mergeGuideProgress, claimGroup, updateGroup } from '../guidance/progress.js';
// IndexedDB を使えない時の代わり（メモリだけ）。再読込で消えるため、ランキング対象のプレイは始めない。
import { RUN_SLOT, StaleWriterError } from './store.js';

export class MemoryStore {
  constructor() {
    this.memory = true;
    this.data = new Map();
    this.kv = new Map();
  }

  bucket(name) {
    if (!this.data.has(name)) this.data.set(name, new Map());
    return this.data.get(name);
  }

  keyOf(name, value) {
    if (name === 'runs') return value.slot;
    return value.playId ?? value.launchId ?? value.requestId ?? value.id ?? value.slot;
  }

  async get(key) {
    return this.kv.get(key);
  }

  async set(key, value) {
    this.kv.set(key, structuredClone(value));
  }

  async getAll(name) {
    return [...this.bucket(name).values()].map((v) => structuredClone(v));
  }

  async getOne(name, key) {
    const v = this.bucket(name).get(key);
    return v === undefined ? undefined : structuredClone(v);
  }

  async put(name, value, key) {
    this.bucket(name).set(key ?? this.keyOf(name, value), structuredClone(value));
  }

  async delete(name, key) {
    this.bucket(name).delete(key);
  }

  async loadRun() {
    return (await this.getOne('runs', RUN_SLOT)) ?? null;
  }

  async beginRun(tabId, snapshot) {
    const current = this.bucket('runs').get(RUN_SLOT);
    if (current?.status === 'active') throw Object.assign(new Error('active_run_exists'), { code: 'active_run_exists' });
    const generation = (current?.generation ?? 0) + 1;
    await this.put('runs', { slot: RUN_SLOT, status: 'active', playId: snapshot.meta.playId, owner: tabId, generation, snapshot });
    return generation;
  }

  async claimRun(tabId, expectedPlayId) {
    const current = this.bucket('runs').get(RUN_SLOT);
    if (!current || current.status !== 'active' || (expectedPlayId !== undefined && current.playId !== expectedPlayId)) return null;
    const generation = current.generation + 1;
    await this.put('runs', { ...current, owner: tabId, generation });
    return { generation, snapshot: current.snapshot, playId: current.playId };
  }

  async saveRun(tabId, generation, snapshot) {
    const current = this.bucket('runs').get(RUN_SLOT);
    if (!current || current.status !== 'active' || current.owner !== tabId || current.generation !== generation || current.playId !== snapshot.meta.playId) {
      throw new StaleWriterError();
    }
    await this.put('runs', { ...current, snapshot });
  }

  async guideTransaction(tabId, generation, options, mutate) {
    const current = this.bucket('runs').get(RUN_SLOT);
    if (!current || current.status !== 'active' || current.owner !== tabId || current.generation !== generation || current.playId !== options.playId) throw new StaleWriterError();
    const p = mergeGuideProgress(normalizeGuideProgress(this.kv.get(GUIDE_PROGRESS_KEY), options.legacyFlags, options.legacyRun), options.fallbackProgress);
    const result = mutate(p); this.kv.set(GUIDE_PROGRESS_KEY, structuredClone(result.progress ?? result)); return result;
  }
  initializeGuideProgress(tabId, generation, options) { return this.guideTransaction(tabId, generation, options, p => p); }
  claimGuideGroup(tabId, generation, options) { return this.guideTransaction(tabId, generation, options, p => claimGroup(p, options.group, options.playId)); }
  updateGuideProgress(tabId, generation, options) { return this.guideTransaction(tabId, generation, options, p => updateGroup(p, options)); }

  async endRun(tabId, generation, result, { localBest = null, presentation = null } = {}) {
    const current = this.bucket('runs').get(RUN_SLOT);
    if (!current || current.status !== 'active' || current.owner !== tabId || current.generation !== generation || current.playId !== result.playId) {
      throw new StaleWriterError();
    }
    const stats = presentation ? mergePresentationStats(this.kv.get('presentation.stats.v1'), presentation) : null;
    if (stats) this.kv.set('presentation.stats.v1', structuredClone(stats.next));
    this.put(result.ranked ? 'outbox' : 'localResults', { ...result, createdAt: Date.now() });
    if (localBest) this.set('localBest', localBest);
    this.put('runs', { slot: RUN_SLOT, status: 'ended', playId: current.playId, owner: tabId, generation: generation + 1 });
    return stats ? { previous: stats.previous, firstClearNow: stats.firstClearNow } : undefined;
  }

  async quarantineRun(reason, expectedPlayId) {
    const current = this.bucket('runs').get(RUN_SLOT);
    if (!current || current.status !== 'active' || (expectedPlayId !== undefined && current.playId !== expectedPlayId)) return false;
    await this.put('quarantine', { id: Date.now(), kind: 'run', reason, record: current });
    await this.put('runs', { slot: RUN_SLOT, status: 'quarantined', playId: current.playId, generation: (current.generation ?? 0) + 1 });
    return true;
  }

  async addPractice(entry) {
    const all = (await this.getAll('practice')).sort((a, b) => a.completedAt - b.completedAt);
    const keep = [...all, entry].sort((a, b) => a.completedAt - b.completedAt).slice(-2);
    this.bucket('practice').clear();
    for (const e of keep) await this.put('practice', e);
  }

  async listPractice() {
    return (await this.getAll('practice')).sort((a, b) => b.completedAt - a.completedAt);
  }

  async clearPractice() {
    this.bucket('practice').clear();
  }

  async cleanupSafe() {
    this.bucket('cache').clear();
    return 0;
  }

  async probeWrite() {
    throw Object.assign(new Error('memory_only'), { code: 'memory_only' });
  }
}
