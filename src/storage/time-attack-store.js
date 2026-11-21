import { StaleTimeAttackWriter, timeAttackBestKey } from './time-attack-memory-store.js';

export const TIME_ATTACK_DB = 'kamereoru-time-attack';
const STORES = ['starts', 'launches', 'outbox', 'records', 'runs', 'kv'];

const waitFor = request => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

function transact(db, names, work, signal) {
  if (signal?.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(names, 'readwrite');
    const stores = Object.fromEntries(names.map(name => [name, tx.objectStore(name)]));
    let result, error;
    const abort = () => { try { tx.abort(); } catch { /* The transaction already completed. */ } };
    signal?.addEventListener('abort', abort, { once: true });
    tx.oncomplete = () => {
      signal?.removeEventListener('abort', abort);
      resolve(result);
    };
    tx.onabort = () => {
      signal?.removeEventListener('abort', abort);
      reject(error ?? signal?.reason ?? tx.error ?? new Error('time_attack_storage_aborted'));
    };
    const fail = err => { error = err; abort(); };
    try { work(stores, value => { result = value; }, fail); } catch (err) { fail(err); }
  });
}

export async function openTimeAttackStore(indexedDB = globalThis.indexedDB) {
  const req = indexedDB.open(TIME_ATTACK_DB, 1);
  req.onupgradeneeded = () => {
    for (const name of STORES) req.result.createObjectStore(name, { keyPath: 'id' });
  };
  const db = await waitFor(req);
  db.onversionchange = () => db.close();
  return {
    close: () => db.close(),
    get: (name, id) => waitFor(db.transaction(name).objectStore(name).get(id)),
    getAll: name => waitFor(db.transaction(name).objectStore(name).getAll()),
    put: (name, item) => transact(db, [name], stores => stores[name].put(item)),
    remove: (name, id) => transact(db, [name], stores => stores[name].delete(id)),

    begin(launch, attempt, signal) {
      return transact(db, ['starts', 'launches', 'runs'], (stores, _done, fail) => {
        const owner = stores.runs.get('time-attack');
        owner.onsuccess = () => {
          if (owner.result?.ownerEpoch > attempt.ownerEpoch) return fail(new StaleTimeAttackWriter());
          stores.runs.put({ id: 'time-attack', ...attempt, launchId: launch.id });
          stores.launches.put(launch);
          stores.starts.delete(attempt.attemptId);
        };
      }, signal);
    },

    finish(attempt, record, outbox) {
      return transact(db, ['runs', 'records', 'outbox', 'kv'], (stores, done, fail) => {
        const owner = stores.runs.get('time-attack');
        const bestKey = timeAttackBestKey(record.result);
        const best = stores.kv.get(bestKey);
        best.onsuccess = () => {
          const run = owner.result;
          if (run?.attemptId !== attempt.attemptId || run.ownerEpoch !== attempt.ownerEpoch) {
            return fail(new StaleTimeAttackWriter());
          }
          const prior = best.result?.elapsedCs ?? null;
          const newBest = record.result.reason === 'cleared' && (prior === null || record.result.elapsedCs < prior);
          const bestElapsedCs = newBest ? record.result.elapsedCs : prior;
          stores.records.put({ ...record, bestElapsedCs, newBest });
          if (outbox) stores.outbox.put(outbox);
          if (newBest) stores.kv.put({ id: bestKey, elapsedCs: bestElapsedCs });
          stores.runs.delete('time-attack');
          done({ bestElapsedCs, newBest });
        };
      });
    },
  };
}
