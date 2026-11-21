// 地区の空と街並みの影を手続きで描く共通部品。
// 結果アトラスの作成スクリプトと、結果カードの写真枠の両方が同じ値を使う（画像は読み込まない）。
export const DISTRICT_STARTS = Object.freeze([1, 20, 23, 30, 40]);
export const DISTRICT_SKIES = Object.freeze([
  ['#fae7bc', '#9b6546'],
  ['#cce8ec', '#648486'],
  ['#e8dbd2', '#8d6179'],
  ['#dcabd1', '#564e76'],
  ['#233c60', '#17263e'],
]);

/** 棟番号（1〜50）から地区の番号（0〜4）。範囲外は0か4へ寄せる。 */
export function districtIndexForBuilding(building) {
  const b = Number.isFinite(building) ? building : 1;
  let index = 0;
  for (let i = 1; i < DISTRICT_STARTS.length; i += 1) if (b >= DISTRICT_STARTS[i]) index = i;
  return index;
}

/**
 * 640×400 の基準の座標で描き、rect へ縦横比を保って覆うように拡縮する（はみ出しは切る）。
 * rect が 640×400 ならアトラスの区画と同じ画素になる。
 */
export function drawDistrictSky(ctx, index, rect) {
  const [x, y, w, h] = rect;
  const i = Math.max(0, Math.min(DISTRICT_SKIES.length - 1, Math.trunc(index)));
  const s = Math.max(w / 640, h / 400);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.translate(x + (w - 640 * s) / 2, y + (h - 400 * s) / 2);
  ctx.scale(s, s);
  const g = ctx.createLinearGradient(0, 0, 0, 400);
  g.addColorStop(0, DISTRICT_SKIES[i][0]);
  g.addColorStop(1, DISTRICT_SKIES[i][1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 640, 400);
  for (let b = 0; b < 10; b += 1) {
    const height = 60 + ((b * 47 + i * 31) % 140);
    ctx.fillStyle = i === 4 ? '#1d2c48' : '#63585e';
    ctx.fillRect(b * 70, 330 - height, 60, height);
    ctx.fillStyle = i === 4 ? '#ebc777' : '#e9d6b3';
    for (let k = 0; k < 3; k += 1) ctx.fillRect(b * 70 + 12, 345 - height + k * 24, 9, 12);
  }
  ctx.fillStyle = '#51444e';
  ctx.fillRect(0, 330, 640, 70);
  ctx.restore();
}
