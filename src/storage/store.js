// 端末保存（IndexedDB）。複数の値を1つの取引（トランザクション）で一緒に書き、途中で落ちても片方だけ残らないようにする。
//
// 本編の欄（runs/main）は「書込担当のタブ」と「世代」で守る：
//   - 新しく始める・別のタブが引き継ぐ時に世代を1つ進める。
//   - 保存と終了は、担当タブ・世代・状態が一致する時だけ通す。古いタブの遅れた保存は拒否する。
//   - 終了は「結果を送信待ち（またはローカル結果）へ入れる」と「欄を終了済みにする」を同じ取引で行う。
//
// 未送信の結果・進行中の保存・照会情報・音量・言語・解放状態・端末内ベストは自動整理で消さない。

export const DB_NAME = 'kamereoru';
export const DB_VERSION = 1;
const STORES = ['kv', 'runs', 'outbox', 'records', 'launches', 'starts', 'localResults', 'practice', 'quarantine', 'cache'];
export const RUN_SLOT = 'main';

export class StaleWriterError extends Error {
  constructor(message = 'stale_writer') {
    super(message);
    this.name = 'StaleWriterError';
    this.code = 'stale_writer';
  }
}

function req(r) {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('transaction_error'));
    tx.onabort = () => reject(tx.error ?? tx.__abortReason ?? new Error('transaction_aborted'));
  });
}

export function randomId(bytes = 16) {
  const a = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(a);
  return [...a].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** URLにも使える推測困難な秘密（32バイト）。 */
export function randomSecret() {
  const a = new Uint8Array(32);
  globalThis.crypto.getRandomValues(a);
  let s = '';
  for (const x of a) s += String.fromCharCode(x);
  return btoa(s).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export async function openStore({ indexedDB = globalThis.indexedDB, name = DB_NAME, failWrites = null } = {}) {
  if (!indexedDB) throw new Error('indexeddb_unavailable');
  const open = indexedDB.open(name, DB_VERSION);
  open.onupgradeneeded = () => {
    const db = open.result;
    for (const s of STORES) {
      if (db.objectStoreNames.contains(s)) continue;
      if (s === 'kv') db.createObjectStore(s);
      else if (s === 'runs') db.createObjectStore(s, { keyPath: 'slot' });
      else if (s === 'quarantine') db.createObjectStore(s, { keyPath: 'id', autoIncrement: true });
      else if (s === 'practice') db.createObjectStore(s, { keyPath: 'id' });
      else if (s === 'launches') db.createObjectStore(s, { keyPath: 'launchId' });
      else if (s === 'starts') db.createObjectStore(s, { keyPath: 'requestId' });
      else if (s === 'cache') db.createObjectStore(s);
      else db.createObjectStore(s, { keyPath: 'playId' });
    }
  };
  const db = await req(open);
  return new Store(db, { failWrites });
}

export class Store {
  constructor(db, { failWrites = null } = {}) {
    this.db = db;
    // 試験用：書込失敗を起こす関数（(storeNames) => Error | null）
    this.failWrites = failWrites;
  }

  close() {
    this.db.close();
  }

  tx(names, mode = 'readonly') {
    const tx = this.db.transaction(names, mode);
    if (mode === 'readwrite' && this.failWrites) {
      const err = this.failWrites(names);
      if (err) {
        tx.__abortReason = err;
        queueMicrotask(() => {
          try {
            tx.abort();
          } catch {
            /* already finished */
          }
        });
      }
    }
    return tx;
  }

  // ---- 単純な値（設定・解放・初回案内・端末内ベストなど） ----
  async get(key) {
    const tx = this.tx(['kv']);
    return req(tx.objectStore('kv').get(key));
  }

  async set(key, value) {
    const tx = this.tx(['kv'], 'readwrite');
    tx.objectStore('kv').put(value, key);
    await done(tx);
  }

  async getAll(storeName) {
    const tx = this.tx([storeName]);
    return req(tx.objectStore(storeName).getAll());
  }

  async put(storeName, value, key) {
    const tx = this.tx([storeName], 'readwrite');
    if (key === undefined) tx.objectStore(storeName).put(value);
    else tx.objectStore(storeName).put(value, key);
    await done(tx);
  }

  async getOne(storeName, key) {
    const tx = this.tx([storeName]);
    return req(tx.objectStore(storeName).get(key));
  }

  async delete(storeName, key) {
    const tx = this.tx([storeName], 'readwrite');
    tx.objectStore(storeName).delete(key);
    await done(tx);
  }

  // ---- 本編の欄 ----
  async loadRun() {
    const tx = this.tx(['runs']);
    return (await req(tx.objectStore('runs').get(RUN_SLOT))) ?? null;
  }

  /**
   * 新しいプレイを始める。進行中の欄があれば拒否する（先に endRun / settleRun で保全する）。
   * 戻り値：このタブの世代。
   */
  async beginRun(tabId, snapshot) {
    const tx = this.tx(['runs'], 'readwrite');
    const runs = tx.objectStore('runs');
    let generation = 0;
    const current = await req(runs.get(RUN_SLOT));
    if (current && current.status === 'active') {
      tx.abort();
      await done(tx).catch(() => {});
      throw Object.assign(new Error('active_run_exists'), { code: 'active_run_exists' });
    }
    generation = (current?.generation ?? 0) + 1;
    runs.put({ slot: RUN_SLOT, status: 'active', playId: snapshot.meta.playId, owner: tabId, generation, snapshot, updatedAt: Date.now() });
    await done(tx);
    return generation;
  }

  /** 別のタブ（または再読込後のこのタブ）が進行中のプレイを引き継ぐ。世代を進め、古い担当の書込を止める。 */
  async claimRun(tabId, expectedPlayId) {
    const tx = this.tx(['runs'], 'readwrite');
    const runs = tx.objectStore('runs');
    const current = await req(runs.get(RUN_SLOT));
    if (!current || current.status !== 'active' || (expectedPlayId !== undefined && current.playId !== expectedPlayId)) {
      tx.abort();
      await done(tx).catch(() => {});
      return null;
    }
    const generation = current.generation + 1;
    runs.put({ ...current, owner: tabId, generation, updatedAt: Date.now() });
    await done(tx);
    return { generation, snapshot: current.snapshot, playId: current.playId };
  }

  /** 途中保存。担当タブ・世代・状態・プレイ番号が一致する時だけ書く。 */
  async saveRun(tabId, generation, snapshot) {
    const tx = this.tx(['runs'], 'readwrite');
    const runs = tx.objectStore('runs');
    const current = await req(runs.get(RUN_SLOT));
    if (
      !current ||
      current.status !== 'active' ||
      current.owner !== tabId ||
      current.generation !== generation ||
      current.playId !== snapshot.meta.playId
    ) {
      tx.abort();
      await done(tx).catch(() => {});
      throw new StaleWriterError();
    }
    runs.put({ ...current, snapshot, updatedAt: Date.now() });
    await done(tx);
  }

  /**
   * 終了：結果の退避と、進行中の欄を終了済みにすることを1つの取引で行う。
   * result.ranked なら送信待ち（outbox）、そうでなければローカル結果へ。端末内ベストも同じ取引で更新する。
   */
  async endRun(tabId, generation, result, { localBest = null } = {}) {
    const names = ['runs', 'outbox', 'localResults', 'kv', 'launches'];
    const tx = this.tx(names, 'readwrite');
    const runs = tx.objectStore('runs');
    const current = await req(runs.get(RUN_SLOT));
    if (
      !current ||
      current.status !== 'active' ||
      current.owner !== tabId ||
      current.generation !== generation ||
      current.playId !== result.playId
    ) {
      tx.abort();
      await done(tx).catch(() => {});
      throw new StaleWriterError();
    }
    if (result.ranked) tx.objectStore('outbox').put({ ...result, state: 'pending', attempts: 0, createdAt: Date.now() });
    else tx.objectStore('localResults').put({ ...result, createdAt: Date.now() });
    if (localBest) tx.objectStore('kv').put(localBest, 'localBest');
    runs.put({ slot: RUN_SLOT, status: 'ended', playId: current.playId, owner: tabId, generation: generation + 1, endedAt: Date.now() });
    await done(tx);
  }

  /** 読めない・対応しない版の保存を、消さずに隔離する。欄は空ける。 */
  async quarantineRun(reason, expectedPlayId) {
    const tx = this.tx(['runs', 'quarantine'], 'readwrite');
    const runs = tx.objectStore('runs');
    const current = await req(runs.get(RUN_SLOT));
    if (!current || current.status !== 'active' || (expectedPlayId !== undefined && current.playId !== expectedPlayId)) {
      tx.abort();
      await done(tx).catch(() => {});
      return false;
    }
    tx.objectStore('quarantine').put({ kind: 'run', reason, record: current, at: Date.now() });
    runs.put({ slot: RUN_SLOT, status: 'quarantined', playId: current.playId, generation: (current.generation ?? 0) + 1, at: Date.now() });
    await done(tx);
    return true;
  }

  // ---- 練習履歴（3問を処理した回だけ、種類を合わせて直近2回） ----
  async addPractice(entry) {
    const tx = this.tx(['practice'], 'readwrite');
    const ps = tx.objectStore('practice');
    const all = (await req(ps.getAll())).sort((a, b) => a.completedAt - b.completedAt);
    ps.put(entry);
    const keep = [...all, entry].sort((a, b) => a.completedAt - b.completedAt).slice(-2);
    for (const old of all) if (!keep.some((k) => k.id === old.id)) ps.delete(old.id);
    await done(tx);
  }

  async listPractice() {
    return (await this.getAll('practice')).sort((a, b) => b.completedAt - a.completedAt);
  }

  /** 本人の確認を経てから呼ぶ。 */
  async clearPractice() {
    const tx = this.tx(['practice'], 'readwrite');
    tx.objectStore('practice').clear();
    await done(tx);
  }

  // ---- 容量 ----
  /** 再取得できるものだけを消す（順位の一時保存など）。重要な情報は消さない。 */
  async cleanupSafe() {
    const tx = this.tx(['cache', 'records'], 'readwrite');
    tx.objectStore('cache').clear();
    const records = tx.objectStore('records');
    const all = await req(records.getAll());
    let freed = 0;
    for (const r of all) {
      // 受信確認済みの詳細履歴の端末コピーだけを外す（照会情報・状態は残す）
      if (r.historyCopy && r.serverAccepted) {
        records.put({ ...r, historyCopy: null });
        freed += 1;
      }
    }
    await done(tx);
    return freed;
  }

  /** 新しいランキング対象プレイの前に、保存できるかを試し書きで確かめる。 */
  async probeWrite(bytes = 512 * 1024) {
    const payload = 'x'.repeat(bytes);
    const tx = this.tx(['cache'], 'readwrite');
    tx.objectStore('cache').put(payload, '__probe__');
    await done(tx);
    const tx2 = this.tx(['cache'], 'readwrite');
    tx2.objectStore('cache').delete('__probe__');
    await done(tx2);
    return true;
  }
}

/** タブごとの識別子（ページを読み込むたびに新しくなる）。 */
export const TAB_ID = randomId(8);
