// 固定した出題番号0〜999で出題を作り、帯ごとの難しさの分布を集計して docs/tuning/course-stats.md へ書く。
// 使い方: npm run report:course
import { writeFileSync } from 'node:fs';
import { COURSE_V1, RULES_V1, makeCourse, deltaEHsv, paletteDistance, bandOf } from '../src/rules/v1/index.js';

const SEEDS = 1000;
const stats = new Map(COURSE_V1.bands.map((b) => [b.id, { dE: [], move: [], bar: [], similar: 0, fallback: 0, alternations: [] }]));

for (let seed = 0; seed < SEEDS; seed += 1) {
  const course = makeCourse(seed);
  let prev = RULES_V1.initialColor;
  const perBandDirs = new Map();
  course.targets.forEach((t, i) => {
    const index = i + 1;
    const band = bandOf(index);
    const s = stats.get(band.id);
    const dE = deltaEHsv(prev, t);
    if (index > 1) {
      s.dE.push(dE);
      s.move.push(paletteDistance(prev, t));
      s.bar.push(Math.abs(t.v - prev.v));
      if (dE < COURSE_V1.similarDeltaE) s.similar += 1;
      if (t.v !== prev.v) {
        const dirs = perBandDirs.get(band.id) ?? [];
        dirs.push(Math.sign(t.v - prev.v));
        perBandDirs.set(band.id, dirs);
      }
    }
    if (course.meta[i].fallback) s.fallback += 1;
    prev = t;
  });
  for (const [id, dirs] of perBandDirs) {
    let changes = 0;
    for (let i = 1; i < dirs.length; i += 1) if (dirs[i] !== dirs[i - 1]) changes += 1;
    stats.get(id).alternations.push(changes);
  }
}

const q = (arr, p) => {
  if (!arr.length) return 0;
  const sorted = arr.slice().sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
};
const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
const f1 = (x) => x.toFixed(1);
const f2 = (x) => x.toFixed(2);

let md = `# 出題の分布（試作値の確認用）

\`npm run report:course\` で生成。固定した出題番号0〜${SEEDS - 1}（合計${SEEDS * 50}棟）を、生成規則 \`${RULES_V1.generatorVersion}\` で作って集計した。
数値は実機調整の材料であり、体感の難易度を保証するものではない。色差はCIEDE2000、操作距離は円の半径を1とした値、明るさの差は0〜10,000。

## 帯ごとの条件（config.js の COURSE_V1）

| 帯 | 棟 | 鮮やかさ | 明るさ | 直前との色差 | 円の移動 | バーの移動 | 明暗の交互 |
| --- | --- | --- | --- | --- | --- | --- | --- |
`;
for (const b of COURSE_V1.bands) {
  const val = b.alternate ? `明${b.bright.join('〜')}／暗${b.dark.join('〜')}` : b.val.join('〜');
  md += `| ${b.id} | ${b.from}〜${b.to} | ${b.sat.join('〜')} | ${val} | ${b.deltaE.join('〜')} | ${b.paletteMove.join('〜')} | ${b.barMove.join('〜')} | ${b.alternate ? 'あり' : 'なし'} |\n`;
}
md += `
1棟目は初期の緑から色差${COURSE_V1.firstMinDeltaEFromInitial}以上離す（自動で擬態成功にしない）。候補は1棟につき最大${COURSE_V1.maxAttempts}回まで試し、すべて外れた時は条件を満たす代替色を決まった順番で選ぶ。

## 集計結果

| 帯 | 色差 中央値（10%〜90%） | 円の移動 平均 | バーの移動 平均 | 明暗の向きが変わる回数 平均 | 似た色の連続（色差${COURSE_V1.similarDeltaE}未満） | 代替色 |
| --- | --- | --- | --- | --- | --- | --- |
`;
for (const b of COURSE_V1.bands) {
  const s = stats.get(b.id);
  md += `| ${b.id} | ${f1(q(s.dE, 0.5))}（${f1(q(s.dE, 0.1))}〜${f1(q(s.dE, 0.9))}） | ${f2(avg(s.move))} | ${Math.round(avg(s.bar))} | ${f1(avg(s.alternations))} | ${s.similar} | ${s.fallback} |\n`;
}
md += `
## 実機調整で見ること

- 色差の大きさと、実際に合わせにくい色（暗い色、白に近い色など）の関係。HSVの明るさの差だけで難しさを決めない。
- 20〜22棟で、バーの使い方を覚えられる小さな明暗変化になっているか。
- 40〜50棟の明暗交互が、速度・猶予・警戒を変えずに十分な難しさを作れているか。
`;
writeFileSync(new URL('../docs/tuning/course-stats.md', import.meta.url), md);
console.log(md);
