// Readback classification for street.checkComparisonSurfaces; does not change any renderer/shader.
// TOON_FRAG is affine in the source byte colour: out(c)=a*c+b, with b>=0 and a+b<=1.
// A green128 marker alone can round to its original byte while a 255 source rounds to254.
// If black and white both retain their exact endpoint bytes, every integer byte between them
// also retains its byte. rgbFloat supplies precisely these byte/255 source values.
export function isByteFlatBody(black,white,index){
  return black[index]===0&&black[index+1]===0&&black[index+2]===0&&
    white[index]===255&&white[index+1]===255&&white[index+2]===255;
}

export function measureComparisonPixels({normal,mask,bodyBlack,bodyWhite,width:cw,height:ch,bodyTarget,wallTargets,slotIndices,wallMarkStep}){
  const key = (i) => mask[i] * 65536 + mask[i + 1] * 256 + mask[i + 2];
  const res = { wallPixels: 0, wallMismatches: 0, bodyPixels: 0, bodyMismatches: 0, maxDev: 0, perSlot: slotIndices.map(index=>({index,pixels:0,mismatches:0})) };
  for (let y = 2; y < ch - 2; y += 1) {
    for (let x = 2; x < cw - 2; x += 1) {
      const i = (y * cw + x) * 4;
      let kind = 0;
      let tgt = null;
      let slotNo = -1;
      if (mask[i + 1] === 0 && mask[i + 2] === 0 && mask[i] > 0 && mask[i] % wallMarkStep === 0 && mask[i] / wallMarkStep <= slotIndices.length) {
        kind = 1;
        slotNo = mask[i] / wallMarkStep - 1;
        tgt = wallTargets[slotNo];
      } else if (bodyTarget && mask[i] === 0 && mask[i + 1] === 128 && mask[i + 2] === 0 && isByteFlatBody(bodyBlack,bodyWhite,i)) {
        kind = 2;
        tgt = bodyTarget;
      }
      if (!kind) continue;
      const k = key(i);
      let same = true;
      for (let dy = -2; dy <= 2 && same; dy += 1) for (let dx = -2; dx <= 2; dx += 1) if (key(((y + dy) * cw + x + dx) * 4) !== k) { same = false; break; }
      if (!same) continue;
      const dev = Math.max(Math.abs(normal[i] - tgt[0]), Math.abs(normal[i + 1] - tgt[1]), Math.abs(normal[i + 2] - tgt[2]));
      if (kind === 1) {
        res.wallPixels += 1;
        res.perSlot[slotNo].pixels += 1;
        if (dev > 0) {
          res.wallMismatches += 1;
          res.perSlot[slotNo].mismatches += 1;
        }
      } else {
        res.bodyPixels += 1;
        if (dev > 0) {
          res.bodyMismatches += 1;
          res.bodyBad = res.bodyBad ?? { x, y: ch - 1 - y, got: [normal[i], normal[i + 1], normal[i + 2]], want: tgt, maskPx: [mask[i], mask[i + 1], mask[i + 2]], blackPx: [...bodyBlack.slice(i,i+3)], whitePx: [...bodyWhite.slice(i,i+3)], right: [normal[i + 4], normal[i + 5], normal[i + 6]], left: [normal[i - 4], normal[i - 3], normal[i - 2]] };
        }
      }
      if (dev > res.maxDev) res.maxDev = dev;
    }
  }
  return res;
}
