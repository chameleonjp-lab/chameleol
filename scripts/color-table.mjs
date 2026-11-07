// 色差→一致度の換算表と、代表的な色の組の検算表を docs/tuning/color-conversion.md へ書く。
// 使い方: npm run report:color
import { writeFileSync } from 'node:fs';
import { RULES_V1, deltaEToMatchUnits, classifyMatch, deltaEHsv, hsvToHex, matchUnits } from '../src/rules/v1/index.js';

const U = RULES_V1.match.unitsPerPercent;
const pct = (units) => (units / U).toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
const STATE = { success: '擬態成功（警戒−35/秒）', slight: '少し目立つ（＋12/秒）', danger: '危険（＋45/秒）' };

let md = `# 色差から一致度への換算（試作値）

\`npm run report:color\` で生成。判定規則 \`${RULES_V1.rulesVersion}\`。採点は画面に出す8ビットのsRGBで行い、
sRGB→CIELAB（D65）→CIEDE2000で色差を求め、下の折れ線で一致度へ換算する。一致度は1%の100万分の1単位の整数。
瞬間状態（警戒の増減）は換算後の整数一致度で決め、得点と警戒が別々の換算を使わないようにしている。

## 折れ線の節点

| 色差 | 一致度 |
| --- | --- |
${RULES_V1.match.knots.map(([d, p]) => `| ${d} | ${p}% |`).join('\n')}

擬態成功は一致度85%以上（色差6以下に対応）。評価区間の3秒間ずっと色差6以下なら建物平均は必ず85%以上になり、
連続成功の条件（丸め前85%以上）と矛盾しない。一致度は色差の増加に対して減ることはあっても増えない。

## 換算表

| 色差 | 一致度 | 瞬間状態 |
| --- | --- | --- |
`;
for (const d of [0, 1, 2, 3, 4, 5, 5.999, 6, 6.001, 8, 10, 12, 14, 14.001, 20, 30, 40, 60]) {
  const u = deltaEToMatchUnits(d);
  md += `| ${d} | ${pct(u)}% | ${STATE[classifyMatch(u)]} |\n`;
}

const base = { h: 21000, s: 7000, v: 9000 };
const samples = [
  ['同じ色', base],
  ['色合い+1°', { ...base, h: base.h + 100 }],
  ['色合い+3°', { ...base, h: base.h + 300 }],
  ['色合い+6°', { ...base, h: base.h + 600 }],
  ['鮮やかさ−5%', { ...base, s: base.s - 500 }],
  ['鮮やかさ−15%', { ...base, s: base.s - 1500 }],
  ['明るさ−3%', { ...base, v: base.v - 300 }],
  ['明るさ−10%', { ...base, v: base.v - 1000 }],
  ['明るさ−25%', { ...base, v: base.v - 2500 }],
];
md += `
## 検算表（基準色 ${hsvToHex(base)}：色合い210°・鮮やかさ70%・明るさ90%）

| 体色 | 色 | 色差 | 一致度 | 瞬間状態 |
| --- | --- | --- | --- | --- |
`;
for (const [label, c] of samples) {
  const dE = deltaEHsv(base, c);
  const u = matchUnits(c, base);
  md += `| ${label} | ${hsvToHex(c)} | ${dE.toFixed(3)} | ${pct(u)}% | ${STATE[classifyMatch(u)]} |\n`;
}
md += `
## 実機で確かめること

- 色差6（85%）と14（55%）の境目が、iPhoneの画面で「同じに見える／少し違う／明らかに違う」の感覚と合うか。
- 暗い色・白に近い色で、合わせられるのに失敗と判定される組がないか。
- 換算式・係数・精度を変えるときは \`rulesVersion\` を上げ、\`tests/rules/fixtures/deltae-golden.txt\` を作り直す。
`;
writeFileSync(new URL('../docs/tuning/color-conversion.md', import.meta.url), md);
console.log(md);
