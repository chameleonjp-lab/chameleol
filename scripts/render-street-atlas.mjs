// Original vector artwork; deterministic authoring-time SVG rasterization only.
import {writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const cells={};const shapes=[];
const add=(name,body)=>{const i=shapes.length,x=i%8*128,y=Math.floor(i/8)*128;cells[name]={x,y,width:128,height:128,index:i};shapes.push(`<g transform="translate(${x} ${y})" stroke="#24394b" stroke-width="3" stroke-linejoin="round">${body}</g>`);};
const rect=(x,y,w,h,c)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="${c}"/>`;
const circle=(x,y,r,c)=>`<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/>`;
const eye=(x,y)=>circle(x,y,6,'white')+circle(x+2,y,2,'#24394b');
for(let i=0;i<5;i++){
  const pattern=i===0?Array.from({length:5},(_,j)=>`<path d="M4 ${j*25+15}H124 M${j*25+15} 4V124" fill="none" stroke="#f5e5cf"/>`).join(''):
  i===1?Array.from({length:6},(_,j)=>`<path d="M0 ${j*24}H128 M${j%2?16:32} ${j*24}V${j*24+24} M${j%2?80:96} ${j*24}V${j*24+24}" fill="none" stroke="#f5e5cf"/>`).join(''):
  i===2?Array.from({length:8},(_,j)=>`<path d="M${j*24-50} 0L${j*24+78} 128M${j*24-50} 128L${j*24+78} 0" stroke="#f5e5cf"/>`).join(''):
  i===3?Array.from({length:16},(_,j)=>`<rect x="${j%4*32+4}" y="${Math.floor(j/4)*32+4}" width="22" height="22" fill="none" stroke="#e2e4df"/>`).join(''):
  Array.from({length:6},(_,j)=>`<path d="M${j*24} 0V128" stroke="#c7d1dd" stroke-width="4"/><path d="M0 ${j*24}H128" stroke="#556c8e"/>`).join('');
  add(`pavement${i}`,rect(4,4,120,120,['#cbb9a4','#d8c4a0','#ce9e81','#a8b5c4','#8293ac'][i])+pattern);
}
for(let i=0;i<3;i++)add(`interior${i}`,rect(4,4,120,120,'#27384c')+rect(12,14,104,25,['#ffd278','#c89aba','#97cbb6'][i])+rect(12,50,104,6,'#bf9468')+rect(12,94,104,6,'#bf9468')+Array.from({length:4},(_,j)=>rect(18+j*25,65,16,27,['#edb458','#e5e6e8','#85bda3'][i])).join(''));
for(let i=0;i<2;i++)add(`alley${i}`,rect(0,0,128,128,'#202c40')+`<path d="M0 0L47 40V105L0 128 M128 0L81 40V105L128 128" fill="${i?'#5c6577':'#7b727c'}"/><path d="M47 105H81L128 128H0Z" fill="#9196a4"/>`+rect(52,62,23,43,'#111d30'));
add('sign',rect(6,25,116,68,'#f7cc69')+`<path d="M20 59H108M30 75H98" stroke="#b25c4f" stroke-width="8"/>`);
add('plant',rect(40,75,48,43,'#b56850')+circle(45,58,23,'#5b9975')+circle(77,43,27,'#76b38a'));
add('laundry',`<path d="M0 20H128"/> <path d="M30 22L10 45L25 58L40 47V104H88V47L103 58L118 45L98 22Z" fill="#d8e6df"/>`);
add('awning',`<path d="M5 36H123L114 84H14Z" fill="#e78b70"/><path d="M30 36L34 84M64 36V84M98 36L94 84" stroke="#fff2cf" stroke-width="15"/>`);
add('fan',rect(10,10,108,108,'#abb7bd')+circle(64,64,40,'#e6d6bf')+`<path d="M64 64Q15 15 63 25Q100 20 64 64Q120 85 99 100Q70 120 64 64Q10 110 22 75Q22 40 64 64" fill="#637b8c"/>`);
add('leaf',`<path d="M10 110Q5 5 115 15Q120 100 10 110Z" fill="#ce9e4f"/><path d="M10 110L100 30"/>`);
add('smoke',circle(45,78,28,'#d8dce1')+circle(78,62,32,'#d8dce1')+circle(52,33,25,'#d8dce1'));
add('steam',`<path d="M28 115Q5 85 35 60Q65 35 40 5M80 115Q55 85 85 60Q115 35 90 5" fill="none" stroke="#dfedf1" stroke-width="12"/>`);
add('vending',rect(20,4,88,120,'#bd6464')+rect(30,16,66,57,'#9ccbd1')+rect(36,84,45,24,'#263d4d')+circle(93,83,5,'#ffe79a'));
add('can',rect(43,18,42,94,'#e1ba63')+rect(43,42,42,40,'#e86768'));
for(let i=0;i<3;i++)add(`poster${i}`,rect(10,4,108,120,'#eed8aa')+circle(64,54,27,['#8fbf80','#b5a4ce','#ddba76'][i])+eye(53,48)+eye(75,48)+`<path d="M40 100H88M40 112H88" stroke-width="6"/>`);
add('chameleon',`<path d="M20 86Q5 30 57 28Q110 20 108 67Q108 100 80 93Q55 85 79 70Q95 62 92 78" fill="#83bd87"/>`+eye(40,42)+eye(62,40));
for(let i=0;i<5;i++)add(`manhole${i}`,circle(64,64,57,['#8f9883','#9ca28e','#9f9787','#8b9baf','#a0a8bb'][i])+circle(64,66,30,'#bad1b6')+eye(52,59)+eye(76,59)+`<path d="M47 82Q64 94 81 82" fill="none"/>`);
add('windows',rect(0,0,128,128,'#283c5a')+Array.from({length:12},(_,j)=>rect(10+j%4*30,8+Math.floor(j/4)*43,15,26,j%3?'#f5c973':'#6680a0')).join(''));
add('resident',rect(25,70,78,55,'#de8b76')+circle(64,48,32,'#e8bb93')+eye(52,43)+eye(76,43));
add('cat',`<path d="M26 90V32L47 50Q65 40 82 50L105 32V90Q64 120 26 90Z" fill="#d1aa7a"/>`+eye(48,68)+eye(84,68));
add('bird',`<path d="M6 82Q30 12 64 66Q97 12 122 82Q84 55 64 92Q42 55 6 82Z" fill="#f8e7c9"/>`);
add('bicycle',circle(29,94,24,'#b9d4d5')+circle(103,94,24,'#b9d4d5')+`<path d="M29 94L54 54L76 94H29L67 69L103 94L89 45" fill="none" stroke="#e49263" stroke-width="7"/>`+circle(63,22,13,'#e6ba91')+`<path d="M62 36L51 61L76 75" fill="none" stroke="#6ba3aa" stroke-width="14"/>`);
for(const name of ['bus','policeCar'])add(name,rect(3,name==='bus'?28:52,122,name==='bus'?65:40,name==='bus'?'#e9bf67':'#f0eee1')+rect(15,35,95,27,'#83a9b9')+circle(28,99,15,'#293d4d')+circle(101,99,15,'#293d4d')+(name==='policeCar'?rect(53,42,25,9,'#d26f75'):''));
add('ufo',circle(64,46,30,'#9fd1cb')+`<ellipse cx="64" cy="70" rx="60" ry="21" fill="#a6a2c8"/>`+circle(34,74,6,'#ffe2a1')+circle(64,78,6,'#ffe2a1')+circle(94,74,6,'#ffe2a1'));
add('rainbow',`<path d="M8 120A56 90 0 0 1 120 120" fill="none" stroke="#e7a47f" stroke-width="10"/><path d="M20 120A44 74 0 0 1 108 120" fill="none" stroke="#e6ce86" stroke-width="8"/><path d="M30 120A34 60 0 0 1 98 120" fill="none" stroke="#98c8ae" stroke-width="8"/><path d="M2 120A62 104 0 0 1 126 120" fill="none" stroke="#a4a9cf" stroke-width="4"/>`);
add('flag',`<path d="M30 120V8L110 18L83 47L30 45" fill="#eecb69" stroke-width="5"/>`);
for(let i=1;i<=5;i++)add(`remaining${i}`,rect(12,14,104,100,'#f3d39b')+Array.from({length:i},(_,j)=>circle(28+j*18,64,6,'#527c8c')).join(''));
add('chimney',rect(42,30,44,94,'#9c7966')+rect(32,20,64,20,'#c3a18c'));
add('windowsWave',rect(0,0,128,128,'#283c5a')+Array.from({length:12},(_,j)=>rect(10+j%4*30,8+Math.floor(j/4)*43,15,26,j%3===1?'#6680a0':'#f5c973')).join(''));
add('chameleonWink',`<path d="M20 86Q5 30 57 28Q110 20 108 67Q108 100 80 93Q55 85 79 70Q95 62 92 78" fill="#83bd87"/>`+eye(40,42)+`<path d="M56 40H68" stroke-width="5"/>`);
for(let i=0;i<5;i++)add(`manholeWink${i}`,circle(64,64,57,['#8f9883','#9ca28e','#9f9787','#8b9baf','#a0a8bb'][i])+circle(64,66,30,'#bad1b6')+`<path d="M46 59H58M70 59H82M47 82Q64 94 81 82" fill="none" stroke-width="5"/>`);
add('landmark0',`<path d="M6 115V58H35V35H93V58H122V115Z" fill="#cfb28d"/>`+circle(64,57,19,'#f5e3b4')+`<path d="M64 44V58L75 65" fill="none"/>`);
add('landmark1',`<path d="M10 120V65Q64 0 118 65V120H92V70Q64 37 36 70V120Z" fill="#bca987"/>`);
add('landmark2',`<path d="M20 120V56L64 8L108 56V120Z" fill="#b9988e"/>`+circle(64,55,19,'#f2dcae')+`<path d="M64 43V55H76" fill="none"/>`);
add('landmark3',`<path d="M12 120V30L45 10V120M45 120V55L85 35V120M85 120V20L117 6V120" fill="#9aa9bc"/>`);
add('landmark4',`<path d="M38 120V36H55V6H74V36H91V120Z" fill="#899eb9"/><path d="M48 55H81M48 72H81M48 89H81" stroke="#f8cf8b" stroke-width="5"/>`);
add('awningFlip',`<path d="M5 36H123L114 72L99 84H14Z" fill="#e78b70"/><path d="M30 36L34 84M64 36V84M98 36L94 84" stroke="#fff2cf" stroke-width="15"/>`);
add('vendingLit',rect(20,4,88,120,'#bd6464')+rect(30,16,66,57,'#9ccbd1')+rect(36,84,45,24,'#263d4d')+circle(93,83,5,'#fff9d0'));
add('pipe',`<path d="M18 118V70Q18 44 44 44H88V12" fill="none" stroke="#9caeb9" stroke-width="18"/><path d="M74 12H102M4 118H32" stroke="#d1dce1" stroke-width="8"/>`);
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${shapes.join('')}</svg>`;
writeFileSync('/tmp/chameleol-street-atlas.svg',svg);try { execFileSync('python',['-c',`import ctypes as c
r=c.CDLL('librsvg-2.so.2'); a=c.CDLL('libcairo.so.2')
r.rsvg_handle_new_from_file.argtypes=[c.c_char_p,c.c_void_p];r.rsvg_handle_new_from_file.restype=c.c_void_p
h=r.rsvg_handle_new_from_file(b'/tmp/chameleol-street-atlas.svg',None)
a.cairo_image_surface_create.argtypes=[c.c_int,c.c_int,c.c_int];a.cairo_image_surface_create.restype=c.c_void_p
s=a.cairo_image_surface_create(0,1024,1024)
a.cairo_create.argtypes=[c.c_void_p];a.cairo_create.restype=c.c_void_p
ctx=a.cairo_create(s)
r.rsvg_handle_render_cairo.argtypes=[c.c_void_p,c.c_void_p];r.rsvg_handle_render_cairo(h,ctx)
a.cairo_surface_write_to_png.argtypes=[c.c_void_p,c.c_char_p];a.cairo_surface_write_to_png(s,b'/tmp/chameleol-atlas.png')
from PIL import Image
Image.open('/tmp/chameleol-atlas.png').save('src/presentation/assets/atlas.webp',quality=88)
`]); } catch(error) { if(error.status !== 0) throw error; }
writeFileSync('src/presentation/assets/atlas.json',JSON.stringify({version:1,width:1024,height:1024,columns:8,rows:8,source:'Original vector artwork, scripts/render-street-atlas.mjs',street:cells},null,2)+'\n');
