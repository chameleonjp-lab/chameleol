// 描画用の色。比較面（壁・体）は判定と同じ8ビット値をそのまま使い、照明・霧・色調整を一切かけない。
// ここにあるのは比較面以外（空・遠景・道路・照明）の色だけ。
import { hsvToRgb8 } from '../rules/v1/index.js';

export function rgbFloat(hsv) {
  const [r, g, b] = hsvToRgb8(hsv.h, hsv.s, hsv.v);
  return [r / 255, g / 255, b / 255];
}

// 時間帯ごとの空・霧・光・遠景・道路（比較面には使わない）
export const SKY = Object.freeze({
  day: {
    top: 0x5fb0ff, bottom: 0xdcefff, fog: 0xcfe6f7, far: 0x9fb8cc, far2: 0xb9cddc,
    road: 0x5d636e, sidewalk: 0xc9c4bb, curb: 0x9b968d,
    hemiSky: 0xe8f4ff, hemiGround: 0x9a8f80, hemi: 0.95, sun: 0xfff2d8, sunI: 0.9, lamps: 0, windows: 0,
  },
  evening: {
    top: 0xf08a5d, bottom: 0xffd9a8, fog: 0xf3c9a2, far: 0xb88d7c, far2: 0xd0a891,
    road: 0x585560, sidewalk: 0xbfb2a6, curb: 0x938479,
    hemiSky: 0xffe0c4, hemiGround: 0x8a7468, hemi: 0.85, sun: 0xffc48a, sunI: 0.75, lamps: 0.3, windows: 0.25,
  },
  dusk: {
    top: 0x3f4f9c, bottom: 0xe48aa6, fog: 0x8f7aa6, far: 0x5f5f8a, far2: 0x7a6f99,
    road: 0x44475a, sidewalk: 0x8f8a99, curb: 0x6d6879,
    hemiSky: 0xb8b4f0, hemiGround: 0x5a5068, hemi: 0.7, sun: 0xd9a0c8, sunI: 0.45, lamps: 0.7, windows: 0.6,
  },
  night: {
    top: 0x070b24, bottom: 0x24305e, fog: 0x1a2245, far: 0x222a4a, far2: 0x2c3558,
    road: 0x2a2d3a, sidewalk: 0x4b4d5a, curb: 0x3a3c48,
    hemiSky: 0x7c8cd6, hemiGround: 0x2a2838, hemi: 0.55, sun: 0x9fb4ff, sunI: 0.25, lamps: 1, windows: 1,
  },
});

export const POLICE = Object.freeze({ uniform: 0x2f4a8a, cap: 0x22356b, fur: 0xe8d7b9, mask: 0x6b4f3a, light: 0xfff3b0, badge: 0xf2c94c });
