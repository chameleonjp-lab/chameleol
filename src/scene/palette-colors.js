// 描画用の色。比較面（壁・体）は判定と同じ8ビット値をそのまま使い、照明・色調整を一切かけない。
import { hsvToRgb8 } from '../rules/v1/index.js';

export function rgbFloat(hsv) {
  const [r, g, b] = hsvToRgb8(hsv.h, hsv.s, hsv.v);
  return [r / 255, g / 255, b / 255];
}

// 時間帯ごとの空・遠景（比較面には使わない）
export const SKY = Object.freeze({
  day: { top: 0x8fd3ff, bottom: 0xdff4ff, far: 0xa9c4d8, road: 0x8a8f99, ground: 0x6f747c },
  evening: { top: 0xf6a96b, bottom: 0xffe0b0, far: 0xc79a86, road: 0x7d7a80, ground: 0x66626a },
  dusk: { top: 0x5a5fa8, bottom: 0xe79bb0, far: 0x6d6a91, road: 0x5e5e6e, ground: 0x4c4c5a },
  night: { top: 0x0f1633, bottom: 0x2b3466, far: 0x2a3150, road: 0x3a3d4d, ground: 0x2c2f3b },
});

// 時間帯ごとの光・街の色（比較面には使わない）。glow は街灯・窓の灯り、stars は星の見え方（0〜1）。
// walk=歩道、curb=縁石、glass=窓ガラス（消灯時）、hemiSky/hemiGround/dir=照明の色。
export const TOD = Object.freeze({
  day: { hemiSky: 0xffffff, hemiGround: 0xa89f94, dir: 0xfff2d8, glass: 0x8cc0e6, walk: 0xcfcfd0, curb: 0xe6e5e1, hemi: 0.72, dirI: 0.55, glow: 0, stars: 0 },
  evening: { hemiSky: 0xffe6c8, hemiGround: 0x9a7f70, dir: 0xffb878, glass: 0xd9b48c, walk: 0xc6ae9c, curb: 0xdcc4ac, hemi: 0.66, dirI: 0.6, glow: 0.15, stars: 0 },
  dusk: { hemiSky: 0xb9a4d8, hemiGround: 0x6c5a78, dir: 0xff9a8a, glass: 0x7088b8, walk: 0x9a93a8, curb: 0xa89ead, hemi: 0.58, dirI: 0.4, glow: 0.7, stars: 0.25 },
  night: { hemiSky: 0x7d8fd2, hemiGround: 0x303456, dir: 0x9fb0ff, glass: 0x25304a, walk: 0x6a7290, curb: 0x7a839c, hemi: 0.55, dirI: 0.3, glow: 1, stars: 1 },
});

export const POLICE = Object.freeze({ uniform: 0x1f2f5c, cap: 0x17244a, fur: 0xe8d7b9, mask: 0x6b4f3a, light: 0xfff3b0, badge: 0xf2c94c });
