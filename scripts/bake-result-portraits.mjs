// Rebuild the lightweight No.28 portraits from the playable rig with Playwright Chromium.
import { mkdir, writeFile } from 'node:fs/promises';
import { launch, openHome } from '../tests/e2e/helpers.mjs';
import { OUTLINE_STAGES } from '../src/scene/chameleon-outline.js';

const dir = new URL('../src/presentation/assets/portraits/', import.meta.url);
await mkdir(dir, {recursive:true});
const env = await launch();
try {
  await openHome(env.page,env.url);
  for (const building of [...OUTLINE_STAGES.map(stage => stage.from), 'clear']) {
    const png = await env.page.evaluate(async building => {
      const { createResultPortrait, createResultRenderer, destroyResultRenderer } = await import('/src/presentation/result-portrait.js');
      const renderer = createResultRenderer();
      const clear = building === 'clear';
      const frames = [];
      try {
        for (const v of clear ? [null] : [0, 10000]) {
          frames.push(await createResultPortrait({
            hero:{status:clear?'rainbow':'wall',hsv:clear?null:{h:0,s:0,v},outlineBuilding:clear?50:building},
            rendererLease:{renderer},
          }));
        }
        const first=frames[0].image, scale=Math.min(1,240/first.width,300/first.height);
        const w=Math.round(first.width*scale), h=Math.round(first.height*scale);
        const canvas=document.createElement('canvas');
        canvas.width=w*frames.length;canvas.height=h;
        const ctx=canvas.getContext('2d');
        for (const [i,{image}] of frames.entries()) {
          if(image.width!==first.width || image.height!==first.height)throw Error('Portrait bounds differ');
          ctx.drawImage(image,i*w,0,w,h);
        }
        return canvas.toDataURL('image/png').split(',')[1];
      } finally {
        for(const frame of frames)frame.dispose();
        destroyResultRenderer(renderer);
      }
    }, building);
    await writeFile(new URL(building+'.png',dir),Buffer.from(png,'base64'));
  }
  const strip=await env.page.evaluate(async()=>{
    const THREE=await import('three');
    const {createPosedHero,createResultRenderer,destroyResultRenderer}=await import('/src/presentation/result-portrait.js');
    const rig=createPosedHero({status:'rainbow',outlineBuilding:50});
    const renderer=createResultRenderer();
    try {
      const scene=new THREE.Scene(), camera=new THREE.PerspectiveCamera(32,2/3,0.1,100);
      camera.position.set(5,3.2,8);camera.lookAt(0,1.45,0);scene.add(rig.group);
      renderer.setSize(480,720,false);
      const canvas=document.createElement('canvas');canvas.width=480;canvas.height=360;
      const ctx=canvas.getContext('2d');
      renderer.render(scene,camera);ctx.drawImage(renderer.domElement,0,0,240,360);
      rig.head.rotation.y=-0.5;
      for(const eye of rig.actorParts.eyes)eye.rotation.y-=0.8;
      renderer.render(scene,camera);ctx.drawImage(renderer.domElement,240,0,240,360);
      return canvas.toDataURL('image/png').split(',')[1];
    } finally {rig.dispose();destroyResultRenderer(renderer);}
  });
  await writeFile(new URL('clear-scene.png',dir),Buffer.from(strip,'base64'));
} finally { await env.close(); }
