import {
  MODE_ID, RULES_VERSION, COURSE_VERSION,
  generateTimeAttackCourse,
} from '../rules/time-attack/v1/index.js';
import { randomSecret } from '../storage/store.js';
import { ApiError, uuid, UUID_RE } from './api.js';

export function requireTimeAttack(data) {
  if (data?.modeId !== MODE_ID) throw new ApiError('unexpected_mode');
  return data;
}

export function createTimeAttackAttempt({ destination, name, gameVersion }) {
  const requestId = uuid();
  return {
    id: requestId, attemptId: requestId, destination,
    request: { requestId, launchId: uuid(), secret: randomSecret(), name,
      supportedRulesVersions: [RULES_VERSION], rulesVersion: RULES_VERSION, gameVersion },
  };
}

function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    const cancel = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', cancel); resolve(); }, ms);
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) cancel();
  });
}

export async function reserveTimeAttack(api, attempt, signal, { delays = [700, 1600] } = {}) {
  for (let index = 0; ; index++) {
    signal.throwIfAborted();
    try {
      const response = requireTimeAttack(await api.post('time-attack-start', attempt.request, { signal }));
      if (!UUID_RE.test(response.playId ?? '') || response.rulesVersion !== RULES_VERSION ||
          response.generatorVersion !== COURSE_VERSION ||
          !Number.isInteger(response.seed) || response.seed < 0 || response.seed > 0xffffffff ||
          !Number.isFinite(Date.parse(response.acceptedAt)) || response.expiresAt !== null) {
        throw new ApiError('invalid_time_attack_start');
      }
      signal.throwIfAborted();
      const course = generateTimeAttackCourse(response.seed);
      if (course.family !== response.family) throw new ApiError('time_attack_family_mismatch');
      return { playId: response.playId, course };
    } catch (error) {
      signal.throwIfAborted();
      if (!error.retryable || index >= delays.length) throw error;
      await wait(Math.max(delays[index], error.retryAfterMs ?? 0), signal);
    }
  }
}
