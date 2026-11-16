// Authoring only: render the existing No.28 model once; no runtime capture path.
// 使い方: node scripts/render-result-atlas.mjs [--comic]   （--comic は detected.webp も作り直す）
import {createRequire} from 'node:module';import {writeFile} from 'node:fs/promises';import {startServer} from './serve.mjs';
const {chromium}=createRequire(import.meta.url)('playwright');
// 区画の配置（1920×1520＝11,673,600B）。空5枚・視線1枚・立ち姿4枚。変えたら result-atlas-bounds.js も同じ値で出る。
const LAYOUT={width:1920,height:1520,
 backgrounds:[[1,0,0],[20,640,0],[23,1280,0],[30,0,400],[40,640,400]].map(([id,x,y])=>({id,rect:[x,y,640,400]})),
 portraits:['clear','detected','quit','proud'].map((id,i)=>({id,rect:[i*480,800,480,720]})),
 reaction:{id:'glance',rect:[1280,400,240,360]}};
const server=await startServer({rootDir:process.cwd(),listenPort:0});
// e2e と同じ方式：PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH があればそれを、無ければ Playwright 同梱を使う。
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader']});
try{const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/`);const output=await page.evaluate(async(LAYOUT)=>{
 const THREE=await import('/vendor/three.module.min.js');const {createChameleon}=await import('/src/scene/chameleon28.js');const {drawDistrictSky}=await import('/src/presentation/result-sky.js');
 const atlas=document.createElement('canvas');atlas.width=LAYOUT.width;atlas.height=LAYOUT.height;const ctx=atlas.getContext('2d');
 LAYOUT.backgrounds.forEach((b,i)=>drawDistrictSky(ctx,i,b.rect));
 const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});renderer.setSize(480,720);renderer.setClearColor(0,0);const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(32,480/720,.1,100);camera.position.set(5,3.2,8);camera.lookAt(0,1.45,0);
 let comicURL=null;const hero=createChameleon();scene.add(hero.group);const poses=LAYOUT.portraits.map(p=>p.id);for(let i=0;i<4;i++){hero.animate([.7,1.8,0,2.6][i],{walking:false,nervous:i===1?1:0});hero.group.rotation.y=[-.35,.2,-.6,.4][i];hero.head.rotation.z=[.12,-.25,-.12,.2][i];hero.jewel.visible=i===0||i===3;renderer.render(scene,camera);const [px,py]=LAYOUT.portraits[i].rect;ctx.drawImage(renderer.domElement,px,py);if(i===1)comicURL=renderer.domElement.toDataURL('image/webp',.88);}
 hero.animate(0,{walking:false});hero.group.rotation.y=-.35;hero.head.rotation.y=-.5;hero.actorParts.eyes.forEach(eye=>eye.rotation.y-=.8);renderer.render(scene,camera);const [gx,gy,gw,gh]=LAYOUT.reaction.rect;ctx.drawImage(renderer.domElement,gx,gy,gw,gh);
 const paintedBounds=Object.fromEntries(LAYOUT.portraits.map(({id,rect:[px,py]})=>{const pixels=ctx.getImageData(px,py,480,720).data;let minX=480,maxX=0,minY=720,maxY=0;for(let y=0;y<720;y++)for(let x=0;x<480;x++){if(pixels[(y*480+x)*4+3]>20){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y)}}return [id,{minX,minY,maxX,maxY,width:480,height:720}]}));
 hero.dispose();renderer.dispose();return {url:atlas.toDataURL('image/webp',.88),comicURL,meta:{width:LAYOUT.width,height:LAYOUT.height,backgrounds:LAYOUT.backgrounds,portraits:LAYOUT.portraits,source:'src/scene/chameleon28.js createChameleon(CHAMELEON28)',paintedBounds,reaction:LAYOUT.reaction,authoringOnly:true}};
 },LAYOUT);
 if(process.argv.includes('--comic'))await writeFile('src/presentation/assets/detected.webp',Buffer.from(output.comicURL.split(',')[1],'base64'));
 await writeFile('src/presentation/assets/result-atlas.webp',Buffer.from(output.url.split(',')[1],'base64'));await writeFile('src/presentation/assets/result-atlas.json',JSON.stringify(output.meta,null,2)+'\n');
 const layout={width:output.meta.width,height:output.meta.height,backgrounds:output.meta.backgrounds,portraits:output.meta.portraits,reaction:output.meta.reaction};
 await writeFile('src/presentation/assets/result-atlas-bounds.js','// Generated authoring-time layout and alpha bounds; no runtime image reads.\nexport const RESULT_ATLAS='+JSON.stringify(layout)+';\nexport const PORTRAIT_BOUNDS='+JSON.stringify(output.meta.paintedBounds)+';\n');}finally{await browser.close();server.close()}
