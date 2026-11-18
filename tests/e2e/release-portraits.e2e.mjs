import test from 'node:test';
import assert from 'node:assert/strict';
import { launch, openHome } from './helpers.mjs';

test('a real No.28 clear uses colored surfaces on the model and prepares the same result without WebGL', async () => {
  const env=await launch({height:700});
  try {
    await openHome(env.page,env.url);
    const colors=await env.page.evaluate(async()=>{
      const {createPosedHero}=await import('/src/presentation/result-portrait.js');
      const palette=status=>{
        const rig=createPosedHero({status,hsv:null,outlineBuilding:50});
        const colors=new Set();
        rig.group.traverse(mesh=>{const value=mesh.material?.uniforms?.uColor?.value;if(value)colors.add(value.getHexString());});
        rig.dispose();return colors.size;
      };
      return [palette('unknown'),palette('rainbow')];
    });
    assert.ok(colors[1]>=7 && colors[1]>colors[0],JSON.stringify(colors));
    const png=await env.page.evaluate(async()=>{
      const app=globalThis.__kamereoru;
      const get=HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext=function(kind,...args){return kind.includes('webgl')?null:get.call(this,kind,...args);};
      try{
        await app.debugPresentation({effectId:75});
        const controller=app.resultCardController;
        const end=Date.now()+7000;
        while(controller.snapshot().state==='pending' && Date.now()<end)await new Promise(r=>setTimeout(r,50));
        const state=controller.snapshot();
        if(!state.prepared)return {state:state.state};
        const bitmap=await createImageBitmap(state.prepared.file), size=[bitmap.width,bitmap.height];bitmap.close();
        return {state:state.state,size,hero:state.model.hero.status};
      }finally{HTMLCanvasElement.prototype.getContext=get;}
    });
    assert.deepEqual(png,{state:'ready',size:[1200,630],hero:'rainbow'});
  } finally {await env.close();}
});

test('simple wall portraits match the rendered rig and the simple ending displays the same rainbow asset',async()=>{
  const env=await launch();
  try{
    await openHome(env.page,env.url);
    const proof=await env.page.evaluate(async()=>{
      const {createFallbackPortrait,clearPortraitUrl}=await import('/src/presentation/result-fallback-portrait.js');
      const {createResultRenderer,destroyResultRenderer,createResultPortrait}=await import('/src/presentation/result-portrait.js');
      const {createDomStage}=await import('/src/scene/stage.js');
      const renderer=createResultRenderer(), differences=[];
      try {
        for(const [building,hue] of [[1,0],[25,21000],[50,31000]]){
          const hero={status:'wall',hsv:{h:hue,s:8000,v:8500},outlineBuilding:building};
          const simple=await createFallbackPortrait({hero});
          const real=await createResultPortrait({hero,rendererLease:{renderer}});
          const {width,height}=simple.image;
          const pixels=image=>{
            const c=document.createElement('canvas');c.width=width;c.height=height;
            const ctx=c.getContext('2d');ctx.drawImage(image,0,0,width,height);
            return ctx.getImageData(0,0,width,height).data;
          };
          const a=pixels(simple.image), b=pixels(real.image);
          let error=0, samples=0;
          for(let i=0;i<a.length;i+=4)if(a[i+3]>240 && b[i+3]>240) {
            for(let k=0;k<3;k++)error+=Math.abs(a[i+k]-b[i+k]);
            samples+=3;
          }
          differences.push({samples,mean:error/samples});
          simple.dispose();real.dispose();
        }
      }finally{destroyResultRenderer(renderer);}
      const container=document.createElement('div');document.body.append(container);
      const stage=createDomStage(container,{course:{targets:[]}}), abort=new AbortController();
      const ending=stage.playEnding('cleared',{signal:abort.signal});
      const styled=getComputedStyle(container.querySelector('.dom-hero')).backgroundImage.includes(clearPortraitUrl);
      abort.abort();await ending;stage.dispose();container.remove();
      return {differences,styled};
    });
    assert.ok(proof.styled);
    for(const {samples,mean} of proof.differences){assert.ok(samples>5000);assert.ok(mean<4,'Average color difference: '+mean);}
  }finally{await env.close();}
});
