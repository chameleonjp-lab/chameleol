// The two aligned renders keep the original No.28 outline, eye, tongue and jewel.
// Interpolate only the pixels affected by wall color, including their shading.
import { hsvToRgb8, isValidHsv } from '../rules/v1/color.js';
import { outlineForBuilding } from '../scene/chameleon-outline.js';

export const clearPortraitUrl = new URL('./assets/portraits/clear.png', import.meta.url).href;

export async function createFallbackPortrait({hero, signal}) {
  const clear = hero.status === 'rainbow';
  if (!clear && (hero.status !== 'wall' || !isValidHsv(hero.hsv))) throw Error('Missing portrait color');
  signal?.throwIfAborted();
  const image = new Image();
  image.src = clear ? clearPortraitUrl : new URL('./assets/portraits/' + outlineForBuilding(hero.outlineBuilding).from + '.png', import.meta.url).href;
  await image.decode();
  signal?.throwIfAborted();
  if (clear) return {image, dispose(){image.removeAttribute('src');}};

  const canvas = document.createElement('canvas');
  const w = image.naturalWidth / 2, h = image.naturalHeight;
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d',{willReadFrequently:true});
  ctx.drawImage(image,0,0,w,h,0,0,w,h);
  const dark = ctx.getImageData(0,0,w,h);
  ctx.clearRect(0,0,w,h);
  ctx.drawImage(image,w,0,w,h,0,0,w,h);
  const light = ctx.getImageData(0,0,w,h).data;
  const {h:hue,s,v} = hero.hsv;
  const rgb = hsvToRgb8(hue,s,v).map(channel=>channel/255);
  for(let i=0;i<dark.data.length;i+=4) {
    for(let c=0;c<3;c++) dark.data[i+c] += (light[i+c]-dark.data[i+c])*rgb[c];
  }
  ctx.putImageData(dark,0,0);
  return {image:canvas,dispose(){canvas.width=0;canvas.height=0;}};
}
