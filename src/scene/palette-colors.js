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

export const POLICE = Object.freeze({ uniform: 0x1f2f5c, cap: 0x17244a, fur: 0xe8d7b9, mask: 0x6b4f3a, light: 0xfff3b0, badge: 0xf2c94c });
