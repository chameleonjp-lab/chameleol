// 終了結果の再計算と判定。開始記録に固定した出題番号と当時の判定規則で、初期状態から終了まで計算し直す。
// 端末が送った名義・棟数・版・状態は採用せず、開始記録と再計算した値を使う。
// 再計算できても、人が操作したことの証明にはならない（自動操作を完全には排除できない）。
import { RULES_V1, createGame, replayHistory, summarize } from './rules/v1/index.js';

export const SUPPORTED_RULES: Record<string, typeof RULES_V1> = { [RULES_V1.rulesVersion]: RULES_V1 };

// 既知の違い（版ごとに、原因が分かっていて再計算で解消できるもの）。v1 には登録なし。
export const KNOWN_DISCREPANCIES: Record<string, Array<{ id: string; matches: (claimed: any, computed: any) => boolean }>> = {
  [RULES_V1.rulesVersion]: [],
};

export interface JobInput {
  playId: string;
  launchId: string;
  seed: number | string;
  rulesVersion: string;
  generatorVersion: string;
  acceptedAt: string;
  receivedAt: string;
  body: any;
}

export interface Verdict {
  status: 'official' | 'pending_review' | 'rejected';
  values: Record<string, unknown>;
  verdict: { reason: string; notes: string[]; computed?: unknown; claimed?: unknown };
}

const REAL_TIME_TOLERANCE_MS = 5000;

/** キーの順番に左右されない比較（データベースの jsonb はキーを並べ替えて保存する）。 */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v as Record<string, unknown>).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  return JSON.stringify(v ?? null);
}
export const sameJson = (a: unknown, b: unknown) => canonical(a) === canonical(b);

const reject = (reason: string, notes: string[] = []): Verdict => ({ status: 'rejected', values: {}, verdict: { reason, notes } });

export function verifyResult(input: JobInput): Verdict {
  const body = input.body;
  const seed = Number(input.seed);
  if (!body || typeof body !== 'object' || body.format !== 'kamereoru-result-v1') return reject('body_format');
  // 開始記録と食い違う本文（別の番号・別の出題・別の版）は、その開始の結果として成立しない
  if (body.playId !== input.playId || body.launchId !== input.launchId) return reject('start_mismatch', ['ids']);
  if (body.seed !== seed || body.rulesVersion !== input.rulesVersion || body.generatorVersion !== input.generatorVersion) {
    return reject('start_mismatch', ['versions_or_seed']);
  }
  const rules = SUPPORTED_RULES[input.rulesVersion];
  if (!rules) {
    // この検証処理では再現できない版：処分せず確認待ちとして保護する
    return { status: 'pending_review', values: {}, verdict: { reason: 'unsupported_rules_version', notes: [] } };
  }
  const game = createGame({ seed, rules });
  const replay = replayHistory(game, body.history);
  if ('error' in replay && replay.error) return reject('history_invalid', [String(replay.error)]);
  const state = replay.state;
  if (state.violations.length) {
    return reject('impossible_input', state.violations.slice(0, 5).map((v: any) => v.code));
  }
  const computed = summarize(state, rules);
  const claimed = body.claimed ?? {};
  // 明確に成立しない申告（51棟・100%超など）
  if (!(Number.isInteger(claimed.buildings) && claimed.buildings >= 0 && claimed.buildings <= rules.buildingCount)) {
    return reject('impossible_claim', ['buildings']);
  }
  if (claimed.rankAverage != null && !(Number.isInteger(claimed.rankAverage) && claimed.rankAverage >= 0 && claimed.rankAverage <= 10000)) {
    return reject('impossible_claim', ['rankAverage']);
  }
  // ゲーム内の経過時間が、開始受付から受信までの実時間を超えることはない
  const elapsed = Date.parse(input.receivedAt) - Date.parse(input.acceptedAt);
  if (Number.isFinite(elapsed) && computed.endT != null && computed.endT > elapsed + REAL_TIME_TOLERANCE_MS) {
    return reject('faster_than_real_time', [`endT=${computed.endT}`, `elapsed=${elapsed}`]);
  }
  const values = {
    buildings: computed.buildings,
    rankAverage: computed.rankAverage,
    meanNum: computed.meanNum,
    meanDen: computed.meanDen,
    score: computed.score.total,
    maxCombo: computed.maxCombo,
    endReason: computed.endReason,
    endT: computed.endT,
  };
  const rankMatches =
    claimed.buildings === computed.buildings &&
    (claimed.rankAverage ?? null) === computed.rankAverage &&
    claimed.endReason === computed.endReason &&
    claimed.endT === computed.endT;
  const notes: string[] = [];
  if (!sameJson(claimed.score, computed.score)) notes.push('aux_score');
  if (claimed.maxCombo !== computed.maxCombo) notes.push('aux_combo');
  if (!sameJson(claimed.perBuilding, computed.perBuilding)) notes.push('aux_per_building');
  if (rankMatches) {
    // 順位用の値が正しい。補助の違いは内部に記録するだけで、本人へ警告しない
    return { status: 'official', values, verdict: { reason: notes.length ? 'verified_aux_mismatch' : 'verified', notes } };
  }
  const known = (KNOWN_DISCREPANCIES[input.rulesVersion] ?? []).find((k) => k.matches(claimed, computed));
  if (known) {
    return { status: 'official', values, verdict: { reason: `recomputed_known:${known.id}`, notes } };
  }
  return {
    status: 'pending_review',
    values,
    verdict: {
      reason: 'rank_mismatch',
      notes,
      claimed: { buildings: claimed.buildings, rankAverage: claimed.rankAverage, endReason: claimed.endReason, endT: claimed.endT },
      computed: { buildings: computed.buildings, rankAverage: computed.rankAverage, endReason: computed.endReason, endT: computed.endT },
    },
  };
}
