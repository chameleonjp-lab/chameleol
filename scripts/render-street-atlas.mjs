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
add('residentFace',rect(12,99,104,29,'#de8b76')+circle(64,58,53,'#e8bb93')+eye(44,46)+eye(84,46)+`<path d="M47 83Q64 95 81 83" fill="none"/>`);
// ---- Extended cells 61..79 (rows 7..9 of the 8x12 grid). Existing cells above are untouched.
// Each picture is drawn at the natural aspect of the plane it is used on, then stretched to fill the
// 128px cell, so outlines keep an even weight after the sprite is mapped back to its plane.
// New cells are clipped to their own 128px square so overflow cannot bleed into a neighbour.
const addClip=(name,body)=>{const i=shapes.length;add(name,`<clipPath id="clip${i}"><rect width="128" height="128"/></clipPath><g clip-path="url(#clip${i})">${body}</g>`);};
const fit=(nw,nh,body)=>`<g transform="scale(${(128/nw).toFixed(4)} ${(128/nh).toFixed(4)})">${body}</g>`;
const ink='#24394b';
const wavy=(x,y0,y1,amp,phase,period=9,step=6)=>{const pts=[];for(let y=y0;y<=y1;y+=step)pts.push([x+amp*Math.sin((y+phase)/period),y]);return pts;};
const ptsStr=p=>p.map(q=>`${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(' L');
// 61/62: crossing post (natural 96x128). Pole with four black/yellow bands, X sign, two lamps.
const postBody=(lit)=>{
  const bands=[0,1,2,3].map(j=>rect(40,60+j*14,16,14,j%2?'#eecb69':'#293d4d')).join('');
  const lens=(x,on)=>circle(x,64,11,'#3a3f4d')+(on?circle(x,64,14,'#ffb39e')+circle(x,64,11,'#3a3f4d'):'')+circle(x,64,7,on?'#ff6b5e':'#7a4a4a')+(on?circle(x-2,62,2.2,'#fff1ea'):'');
  return rect(32,120,32,8,'#3a3f4d')+rect(40,40,16,82,'#e9e3d6')+bands+
    rect(8,50,80,7,'#3a3f4d')+lens(18,lit)+lens(78,false)+
    `<g transform="translate(48 24)"><rect x="-38" y="-6" width="76" height="12" rx="3" fill="#f5e5cf" transform="rotate(32)"/><rect x="-38" y="-6" width="76" height="12" rx="3" fill="#f5e5cf" transform="rotate(-32)"/><circle r="5" fill="#d26f75"/></g>`;
};
addClip('crossingPost',fit(96,128,postBody(false)));
addClip('crossingPostLit',fit(96,128,postBody(true)));
// 63: crossing arm (natural 128x16). Pivot at the cell centre; the bar runs to the right edge.
addClip('crossingArm',fit(128,16,`<rect x="64" y="2.5" width="62" height="11" rx="3" fill="#f5e5cf" stroke-width="2"/>${[76,95,114].map(x=>`<rect x="${x}" y="2.5" width="9" height="11" fill="#d26f75" stroke-width="2"/>`).join('')}<circle cx="64" cy="8" r="6.5" fill="#9caeb9" stroke-width="2.4"/><circle cx="64" cy="8" r="2" fill="#24394b" stroke="none"/>`));
// 64: tram (natural 128x40). The front (with the eye) faces left; it drives right to left.
addClip('tram',fit(128,44,`<g transform="translate(0 5)"><rect x="3" y="7" width="122" height="25" rx="9" fill="#9fd1cb"/><path d="M8 10Q8 4 18 4H110Q120 4 120 10Z" fill="#e7ecef"/><rect x="4" y="27" width="120" height="5" fill="#5b8fa0" stroke="none"/>${[34,56,78,100].map(x=>rect(x,12,16,12,'#83a9b9')).join('')}${eye(18,18)}<path d="M64 4V0M52 0H76" stroke-width="2.4" fill="none"/>${circle(26,35,5,'#293d4d')+circle(102,35,5,'#293d4d')}<path d="M12 28H120" stroke="#f0eee1" stroke-width="1.6" fill="none"/></g>`));
// 65/66: delivery drone (natural 128x100). B draws the rotors as blurred discs.
const droneBody=(blur)=>{
  const rotor=(x,y)=>blur?`<ellipse cx="${x}" cy="${y}" rx="19" ry="2.6" fill="#c7d1dd" stroke="none" opacity=".75"/><path d="M${x-19} ${y}H${x+19}" stroke="#7d8fa3" stroke-width="2" fill="none"/>`:`<ellipse cx="${x}" cy="${y}" rx="17" ry="5.5" fill="#c7d1dd"/>`;
  return `<path d="M52 46L16 30M76 46L112 30M56 52L34 20M72 52L94 20" fill="none" stroke-width="4"/>`+
    [[16,28],[112,28],[34,16],[94,16]].map(([x,y])=>circle(x,y+3,3.4,'#9caeb9')+rotor(x,y)).join('')+
    `<ellipse cx="64" cy="52" rx="30" ry="19" fill="#f0eee1"/><path d="M36 56Q64 70 92 56L90 62Q64 76 38 62Z" fill="#e78b70"/>`+circle(64,50,9,'white')+circle(66,50,3.4,'#24394b')+
    `<path d="M64 71V80" stroke-width="4" fill="none"/><path d="M64 80Q52 81 54 88Q56 94 64 90" fill="none" stroke-width="4"/>`;
};
addClip('droneA',fit(128,100,droneBody(false)));
addClip('droneB',fit(128,100,droneBody(true)));
// 67: midpoint flag (natural 96x128).
addClip('midFlag',fit(96,128,`<path d="M14 122L22 106H44L52 122Z" fill="#9caeb9"/><rect x="28" y="6" width="6" height="108" rx="2" fill="#9caeb9"/><circle cx="31" cy="6" r="5" fill="#eecb69"/><path d="M34 12L90 22L84 56L34 62Z" fill="#f5e5cf"/><path d="M34 12L90 22L34 62Z" fill="#83bd87" stroke="none"/><path d="M34 12L90 22L84 56L34 62Z" fill="none"/><circle cx="58" cy="37" r="12" fill="#fff"/>${circle(61,37,5,'#24394b')}${circle(63,35,1.6,'#fff')}`));
// 68/69: gutter water (natural 40x128); 70: drain with a swirl, drawn flat (natural 128x128).
const waterBody=(phase)=>{
  const left=wavy(11,22,126,3,phase),right=wavy(31,22,126,3,phase+5).reverse();
  return `<path d="M${ptsStr(left)} L${ptsStr(right)}Z" fill="#9fd1cb" stroke-width="2.4"/>`+
    `<path d="M${ptsStr(wavy(18,26,122,2,phase+2))}" fill="none" stroke="#dfedf1" stroke-width="3" stroke-linecap="round"/><path d="M${ptsStr(wavy(25,40,116,2,phase+7))}" fill="none" stroke="#dfedf1" stroke-width="2.4" stroke-linecap="round"/>`+
    `<path d="M0 14H20Q31 14 31 24" fill="none" stroke="${ink}" stroke-width="18"/><path d="M0 14H20Q31 14 31 24" fill="none" stroke="#9caeb9" stroke-width="12"/>`;
};
addClip('gutterWaterA',fit(40,128,waterBody(0)));
addClip('gutterWaterB',fit(40,128,waterBody(28)));
addClip('gutterSwirl',circle(64,64,58,'#556c8e')+circle(64,64,50,'#3d4f6e')+Array.from({length:5},(_,j)=>`<path d="M${14+j*25} 24V104" stroke="#6b82a6" stroke-width="3" fill="none"/>`).join('')+
  `<path d="M64 64Q64 50 78 50Q94 50 94 66Q94 86 70 88Q40 90 36 62Q32 32 66 28Q100 24 106 58" fill="none" stroke="#dfedf1" stroke-width="7" stroke-linecap="round"/>`+circle(30,98,7,'#9fd1cb')+circle(100,100,6,'#9fd1cb')+circle(104,34,5,'#9fd1cb'));
// 71..73: kerb painting robot (natural 116x128). Yellow is the paint.
const robot=({head=0,foot=false,arm='paint',eyes='open'}={})=>{
  const wheel=(x,c)=>circle(x,112,9,c)+circle(x,112,3,'#9caeb9');
  const eyesSvg=eyes==='open'?circle(51,33,4.8,'#9fd1cb')+circle(69,33,4.8,'#9fd1cb'):`<path d="M45 33Q51 40 57 33M63 33Q69 40 75 33" fill="none" stroke="#9fd1cb" stroke-width="3.4" stroke-linecap="round"/>`;
  const limb=(d)=>`<path d="${d}" fill="none" stroke-width="9"/><path d="${d}" fill="none" stroke="#f0eee1" stroke-width="4"/>`;
  const rollerArm=arm==='paint'?limb('M82 66L100 76')+rect(98,66,12,26,'#eecb69'):arm==='foot'?limb('M82 66Q104 80 66 104')+rect(54,98,16,12,'#eecb69'):limb('M82 66L94 90')+rect(88,88,12,10,'#eecb69');
  return `<path d="M44 94L48 106M72 94L74 106" fill="none" stroke-width="6"/>`+wheel(48,foot?'#eecb69':'#293d4d')+wheel(74,'#293d4d')+
    limb('M34 66L22 86')+rect(30,48,56,50,'#f0eee1')+rect(38,70,40,12,'#c7d1dd')+circle(72,60,4,'#e78b70')+
    `<g transform="rotate(${head} 58 48)"><path d="M58 18V10" fill="none"/>${circle(58,8,3.4,'#eecb69')}${rect(36,18,44,30,'#f0eee1')}${rect(41,23,34,19,'#283c5a')}${eyesSvg}</g>`+rollerArm;
};
addClip('robotPaint',fit(116,128,robot({})));
addClip('robotFoot',fit(116,128,robot({foot:true,arm:'foot',head:6})));
addClip('robotLook',fit(116,128,robot({foot:true,arm:'rest',head:20,eyes:'down'})));
// 74: paint stripe (natural 128x26, laid on the kerb). The far end is slightly worn.
addClip('paintStripe',fit(128,26,`<path d="M3 5H110L122 8L116 13L124 17L108 21H3Z" fill="#eecb69" stroke-width="2.4"/><path d="M10 10H92M10 16H70" stroke="#f7e3a0" stroke-width="2.4" fill="none"/>`));
// 75/76: delivery bird (natural 128x104). 77: parcel. 78: rope (natural 16x128).
const bird=(up)=>{
  const wing=up?`<path d="M52 44Q40 10 66 8Q70 26 70 44Z" fill="#f4dcb4"/><path d="M58 38Q56 22 62 14" fill="none" stroke-width="2"/>`:`<path d="M54 56Q36 86 58 92Q70 76 70 58Z" fill="#f4dcb4"/><path d="M58 64Q52 78 58 86" fill="none" stroke-width="2"/>`;
  return `<path d="M26 54L8 46L10 62Z" fill="#e8caa0"/>`+circle(60,54,27,'#f8e7c9')+`<path d="M44 60Q60 80 80 62" fill="#fff5e0" stroke="none"/>`+
    `<path d="M84 48L108 55L84 62Z" fill="#e49263"/>`+eye(76,46)+wing+
    `<path d="M56 79V94M68 79V94" fill="none" stroke="#e49263" stroke-width="4"/>`+`<ellipse cx="62" cy="98" rx="16" ry="5" fill="none" stroke="#f5e5cf" stroke-width="5"/><ellipse cx="62" cy="98" rx="16" ry="5" fill="none" stroke="#24394b" stroke-width="1.4"/>`+
    (up?'':`<path d="M92 30Q96 24 100 30Q100 36 96 36Q92 36 92 30Z" fill="#9fe6ff" stroke-width="2"/>`);
};
// 2026-11-18（レビューC-1）：画面では鳥が約20pxに縮み、太さ3の線が見えなくなるため、
// 同じ形を濃い色で太く描いた縁取りを下に敷く。色・形・区画の位置は変えない。
// 線だけの部品（足・輪・持ち手）と汗のしずくは縁取りに含めない（持ち手の輪とひものつながりを保つ）。
const silhouette=(body,width)=>`<g fill="${ink}" stroke="${ink}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round">${
  body.replace(/<(path|ellipse)[^>]* fill="none"[^>]*\/>/g,'').replace(/<path[^>]*#9fe6ff[^>]*\/>/g,'')
    .replace(/ fill="(?!none)[^"]*"/g,'').replace(/ stroke="[^"]*"/g,'').replace(/ stroke-width="[^"]*"/g,'')}</g>`;
const outlined=(body,width)=>silhouette(body,width)+body;
addClip('birdCarryA',fit(128,104,outlined(bird(true),13)));
addClip('birdCarryB',fit(128,104,outlined(bird(false),13)));
const parcelBody=rect(20,38,88,74,'#c3a18c')+`<path d="M20 52H108" stroke="#a98771" stroke-width="3" fill="none"/>`+rect(56,38,16,74,'#f5e5cf')+rect(20,66,88,14,'#f5e5cf')+`<path d="M64 38Q50 18 64 14Q78 18 64 38" fill="none" stroke-width="5"/><g transform="rotate(10 94 54)">${rect(82,42,24,18,'#eecb69')}</g><circle cx="86" cy="46" r="2" fill="#24394b" stroke="none"/>`;
addClip('parcel',outlined(parcelBody,16));
addClip('rope',fit(16,128,`<path d="M8 0V128" fill="none" stroke="${ink}" stroke-width="10"/><path d="M8 0V128" fill="none" stroke="#8b6e5a" stroke-width="4.4"/>${Array.from({length:12},(_,j)=>`<path d="M5 ${j*11+2}L11 ${j*11+8}" stroke="#d1b093" stroke-width="1.6" fill="none"/>`).join('')}`));
// 79: footprint (mitten shape, no outline; mirrored for the other foot).
{const i=shapes.length,x=i%8*128,y=Math.floor(i/8)*128;cells.footprint={x,y,width:128,height:128,index:i};shapes.push(`<g transform="translate(${x} ${y})" stroke="none"><path d="M62 44C46 44 40 60 42 80C44 102 50 116 62 116C76 116 86 102 86 80C86 60 78 44 62 44Z" fill="#6e6a66"/><circle cx="52" cy="38" r="12" fill="#6e6a66"/><circle cx="74" cy="34" r="12" fill="#6e6a66"/><path d="M55 40Q63 52 71 38" fill="#6e6a66"/></g>`);}
const ROWS=12,HEIGHT=ROWS*128;
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="${HEIGHT}" viewBox="0 0 1024 ${HEIGHT}">${shapes.join('')}</svg>`;
writeFileSync('/tmp/chameleol-street-atlas.svg',svg);try { execFileSync('python',['-c',`import ctypes as c
r=c.CDLL('librsvg-2.so.2'); a=c.CDLL('libcairo.so.2')
r.rsvg_handle_new_from_file.argtypes=[c.c_char_p,c.c_void_p];r.rsvg_handle_new_from_file.restype=c.c_void_p
h=r.rsvg_handle_new_from_file(b'/tmp/chameleol-street-atlas.svg',None)
a.cairo_image_surface_create.argtypes=[c.c_int,c.c_int,c.c_int];a.cairo_image_surface_create.restype=c.c_void_p
s=a.cairo_image_surface_create(0,1024,${HEIGHT})
a.cairo_create.argtypes=[c.c_void_p];a.cairo_create.restype=c.c_void_p
ctx=a.cairo_create(s)
r.rsvg_handle_render_cairo.argtypes=[c.c_void_p,c.c_void_p];r.rsvg_handle_render_cairo(h,ctx)
a.cairo_surface_write_to_png.argtypes=[c.c_void_p,c.c_char_p];a.cairo_surface_write_to_png(s,b'/tmp/chameleol-atlas.png')
from PIL import Image
# Cells 0..60 shipped as a lossy WebP; a fresh lossy encode of a taller sheet would shift their pixels.
# Keep those 61 cells' pixels exactly (decoded from the frozen v1 sheet) and store the sheet losslessly.
sheet=Image.open('/tmp/chameleol-atlas.png').convert('RGBA')
base=Image.open('scripts/street-atlas-v1-base.webp').convert('RGBA')
sheet.paste(base.crop((0,0,1024,896)),(0,0))
sheet.paste(base.crop((0,896,640,1024)),(0,896))
sheet.save('src/presentation/assets/atlas.webp',lossless=True,exact=True,quality=100,method=6)
`]); } catch(error) { if(error.status !== 0) throw error; }
writeFileSync('src/presentation/assets/atlas.json',JSON.stringify({version:2,width:1024,height:HEIGHT,columns:8,rows:ROWS,source:'Original vector artwork, scripts/render-street-atlas.mjs',street:cells},null,2)+'\n');
