// カメレオる 判定規則 v1 の設定値。
// ここにある数値は仕様第19章の「試作値」です。正式値はiPhone実機の確認後に決め、
// 変更するときは rulesVersion を上げ、照合例（tests/rules）も同時に更新します。
// 端末とサーバー（Supabase Edge Function）は、このファイルを同じ内容で読み込みます。

const deepFreeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return value;
};

export const RULES_V1 = deepFreeze({
  rulesVersion: 'kamereoru-rules-v1',
  generatorVersion: 'kamereoru-course-v1',
  decorationVersion: 'kamereoru-deco-v1',
  historyFormat: 'kamereoru-history-v1',

  // ---- 時間（すべてゲーム内のミリ秒、整数） ----
  buildingCount: 50,
  buildingMs: 5000,
  // 各棟の入口からの評価区間 [evalStartMs, evalEndMs)。それ以外は猶予。
  evalStartMs: 1500,
  evalEndMs: 4500,
  // 20棟目から明るさを使う。19→20の猶予開始（19棟目の評価終了）でバーを操作可能にする。
  brightnessUnlockBuilding: 20,
  // これより長いフレーム間隔は「長い処理停止」とみなし、時間を進めず自動停止する（端末側で使用）。
  longStallMs: 1000,
  // 再開前のカウントダウン（端末側で使用）。
  resumeCountdownMs: 3000,

  // ---- 色の値域（操作値はこの整数で表示・採点・記録する） ----
  hueSteps: 36000, // 0.01度単位。0〜35,999
  satMax: 10000, // 0.01%単位
  valMax: 10000,
  // 提供資料の緑（原画照合前の仮値。P3で原画と照合して確定する）。
  initialColor: { h: 11000, s: 7000, v: 10000 },

  // ---- 色差から一致度への換算（ゲーム独自の規則） ----
  match: {
    // 一致度の単位：1%の100万分の1。100% = 100,000,000。
    unitsPerPercent: 1000000,
    // 色差（CIEDE2000）→一致度[%] の折れ線。完全一致100%、色差が増えると非増加。
    // 色差6で85%（擬態成功の境目）、色差14で55%（危険の境目）。
    knots: [
      [0, 100],
      [6, 85],
      [14, 55],
      [40, 0],
    ],
    // 瞬間状態の判定は、換算後の整数一致度で行う（警戒と得点が同じ換算を使う）。
    successMinUnits: 85000000, // これ以上は擬態成功（色差6以下に対応）
    slightMinUnits: 55000000, // これ以上は「少し目立つ」（色差14以下に対応）。未満は危険
  },

  // ---- 警戒（0〜100を1/1000単位の整数で持つ） ----
  alert: {
    unitsPerPoint: 1000,
    maxUnits: 100000,
    // 1ミリ秒あたりの増減（単位）。毎秒の点数と同じ数になる：成功−35／少し目立つ＋12／危険＋45
    ratePerMs: { success: -35, slight: 12, danger: 45 },
    // 警察の登場段階（表示用）。登場と退場に幅を持たせる。
    stages: [
      { enterAt: 30000, exitBelow: 25000 },
      { enterAt: 70000, exitBelow: 65000 },
    ],
  },

  // ---- 得点（総得点は順位に使わない） ----
  score: {
    pass: 20,
    accuracyMax: 80,
    // 通過後の連続成功数 → その棟の追加点（大きい順に判定）
    comboTiers: [
      [10, 20],
      [5, 10],
      [3, 5],
    ],
    clearBonus: 200,
    // 連続成功は丸め前の建物平均がこの値以上（85%）
    comboMinUnits: 85000000,
  },

  // ---- 順位用の値 ----
  // 全体平均を0.01%単位の整数へ四捨五入する（100.00% = 10000）。
  rankUnitsPerPercent: 100,
});

// 出題の難易度帯（試作値）。帯ごとに、生成前に許容する色・操作移動量・明暗の条件を置く。
// paletteMove は円の半径を1としたときのマーカー移動距離、barMove は明るさの差（0〜10,000）。
// deltaE は直前の棟の目標色との色差（CIEDE2000）。
export const COURSE_V1 = deepFreeze({
  maxAttempts: 64,
  firstMinDeltaEFromInitial: 15,
  similarDeltaE: 10, // これ未満の連続を「似た色の連続」として集計
  bands: [
    {
      id: 'B1',
      from: 1,
      to: 19,
      sat: [4000, 10000],
      val: [10000, 10000],
      deltaE: [15, 70],
      paletteMove: [0.25, 1.3],
      barMove: [0, 0],
      alternate: false,
    },
    {
      id: 'B2',
      from: 20,
      to: 22,
      sat: [4000, 10000],
      val: [6500, 9000],
      deltaE: [12, 70],
      paletteMove: [0, 0.9],
      barMove: [1000, 3500],
      alternate: false,
    },
    {
      id: 'B3',
      from: 23,
      to: 29,
      sat: [3000, 10000],
      val: [4000, 10000],
      deltaE: [12, 80],
      paletteMove: [0.2, 1.4],
      barMove: [0, 5000],
      alternate: false,
    },
    {
      id: 'B4',
      from: 30,
      to: 39,
      sat: [3000, 10000],
      val: [3000, 10000],
      deltaE: [15, 90],
      paletteMove: [0.2, 1.6],
      barMove: [1500, 6000],
      alternate: false,
    },
    {
      id: 'B5',
      from: 40,
      to: 50,
      sat: [3000, 10000],
      val: [2500, 10000],
      // 明→暗→明→暗の交互。bright/dark の範囲を交互に使う。
      bright: [8000, 10000],
      dark: [2500, 4500],
      deltaE: [18, 100],
      paletteMove: [0, 1.6],
      barMove: [3500, 7500],
      alternate: true,
    },
  ],
});
