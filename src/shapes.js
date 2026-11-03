export const PARTICLE_FONT = 'ParticleSans';
export async function loadParticleFont() {
  const face = new FontFace(PARTICLE_FONT, `url("${new URL('fonts/NotoSansCJKsc-Bold.woff2', document.baseURI).href}")`, { weight: '700', style: 'normal', display: 'block' });
  await face.load();
  document.fonts.add(face);
  await document.fonts.load(`700 96px "${PARTICLE_FONT}"`, '小猫 I LOVE U 123');
  if (!document.fonts.check(`700 96px "${PARTICLE_FONT}"`, '小猫')) throw new Error('CHINESE_FONT');
}
export function random(seed) {
  let a = seed >>> 0;
  return () => { a += 0x6D2B79F5; let t = Math.imul(a ^ a >>> 15, 1 | a); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function heartPoint(t, scale = 1) {
  return [16 * Math.sin(t) ** 3 / 17 * scale, (13 * Math.cos(t) - 5 * Math.cos(2*t) - 2 * Math.cos(3*t) - Math.cos(4*t)) / 17 * scale];
}
export function heartTargets(count, seed = 31, scale = 3.1) {
  const rng = random(seed), a = new Float32Array(count * 3);
  const outline=Array.from({length:161},(_,i)=>heartPoint(i/160*Math.PI*2,1));
  const lengths=[0];let perimeter=0;
  for(let i=1;i<outline.length;i++){perimeter+=Math.hypot(outline[i][0]-outline[i-1][0],outline[i][1]-outline[i-1][1]);lengths.push(perimeter);}
  const inside=(x,y)=>{let yes=false;for(let i=0,j=outline.length-1;i<outline.length;j=i++){const A=outline[i],B=outline[j];if((A[1]>y)!==(B[1]>y)&&x<(B[0]-A[0])*(y-A[1])/(B[1]-A[1])+A[0])yes=!yes;}return yes;};
  for (let i = 0; i < count; i++) {
    const shell=rng()<.28;let x,y;
    if(shell){
      const d=rng()*perimeter;let k=1;while(lengths[k]<d)k++;
      const f=(d-lengths[k-1])/(lengths[k]-lengths[k-1]);
      x=outline[k-1][0]+(outline[k][0]-outline[k-1][0])*f;
      y=outline[k-1][1]+(outline[k][1]-outline[k-1][1])*f;
      const r=.97+rng()*.04;x*=r;y*=r;
    }else{do{x=(rng()-.5)*1.9;y=-1+rng()*1.78;}while(!inside(x,y));}
    a[i*3]=x*scale;a[i*3+1]=y*scale+.18;
    // A softly inflated lens, with a crisp rim: its silhouette reads from the
    // front while the two luminous faces become visible as the hand turns it.
    let distance=1;
    if(!shell)for(const p of outline)distance=Math.min(distance,Math.hypot(x-p[0],y-p[1]));
    const relief=shell?.025:Math.sqrt(Math.min(1,distance*2.1))*.27*scale;
    const face=rng()<.68?1:-1;
    a[i*3+2]=face*relief+(rng()-.5)*.055+Math.sin(x*2.4)*.035;
  }
  return a;
}
/** Centerline of a folded silk ribbon; shared with the fine filament geometry. */
export function ribbonPoint(arm, strand, u) {
  const angle=u*Math.PI*2*1.34+arm*Math.PI*2/3;
  const width=(strand-10)*.031;
  const radius=1.68+u*3.83+width*Math.cos(angle*1.5+arm);
  return [
    Math.cos(angle)*radius,
    Math.sin(angle)*radius*.49+Math.sin(angle*2+.5)*.22,
    Math.sin(angle)*radius*.30+Math.sin(angle*2+arm)*.32+width*Math.sin(angle*1.5+arm)*1.8,
  ];
}
export function scatterTargets(count) {
  const rng = random(219), a = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const family=rng(),u=rng(),theta=u*Math.PI*2;
    let x,y,z;
    if(family<.69){
      // Three interleaved satin spirals. The individual filaments stay fine;
      // together they describe a broad, folded sheet around an empty core.
      const arm=Math.floor(rng()*3),strand=Math.floor(rng()*21);
      [x,y,z]=ribbonPoint(arm,strand,u);
      x+=(rng()-.5)*.022;y+=(rng()-.5)*.018;z+=(rng()-.5)*.018;
    }else if(family<.90){
      // A second orbital plane passes through the first. Thin parallel rails
      // expose the depth without filling the aperture with a cloud of noise.
      const rail=Math.floor(rng()*6),radius=3.74+rail*.103+(rng()-.5)*.018;
      const angle=theta+.38;
      x=Math.cos(angle)*radius*1.17;
      y=Math.sin(angle)*radius*.70+Math.cos(angle)*.21;
      z=-Math.sin(angle)*radius*.43+Math.cos(angle*2)*.13;
    }else if(family<.975){
      // Quiet outer echoes leave air between the sculpture and its horizon.
      const radius=5.55+(rng()-.5)*.31;
      x=Math.cos(theta)*radius;
      y=Math.sin(theta)*radius*.46-Math.cos(theta)*.28;
      z=Math.sin(theta+.8)*1.42-.72+(rng()-.5)*.065;
    }else{
      const radius=3.3+rng()*2.65;
      x=Math.cos(theta)*radius;
      y=Math.sin(theta)*radius*.53;
      z=(rng()-.5)*4.2;
    }
    a[i*3]=x;a[i*3+1]=y;a[i*3+2]=z;
  }
  return a;
}
function wrapText(ctx, text, maxWidth) {
  const out = []; let line = '';
  const tokens = text.trim().replace(/\s+/gu, ' ').match(/[A-Za-z0-9]+(?:['’\-][A-Za-z0-9]+)*|\s+|[^\s]/gu) || [];
  for (const token of tokens) {
    if (!line && !token.trim()) continue;
    if (ctx.measureText(line + token).width <= maxWidth) { line += token; continue; }
    if (line.trim()) out.push(line.trim());
    line = '';
    if (ctx.measureText(token).width <= maxWidth) { line = token.trimStart(); continue; }
    // Only exceptionally long unspaced words need a character-level fallback.
    for (const char of Array.from(token)) {
      if (line && ctx.measureText(line + char).width > maxWidth) { out.push(line); line = ''; }
      line += char;
    }
  }
  if (line.trim()) out.push(line.trim());
  return out;
}
/** Rasterization is offscreen only: every visible letter is rendered by the particle mesh. */
export function textTargets(text, count, { maxWidth = 9.4, maxHeight = 4.4, seed = 41 } = {}) {
  const canvas = document.createElement('canvas'); canvas.width = 1800; canvas.height = 1000;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  let size = 300; let lines;
  do {
    ctx.font = `700 ${size}px "${PARTICLE_FONT}"`;
    lines = wrapText(ctx, text || '小猫', 1640);
    if (lines.length * size * 1.22 < 900) break;
    size -= 12;
  } while (size > 80);
  lines.forEach((line, i) => ctx.fillText(line, 900, 500 + (i - (lines.length - 1) / 2) * size * 1.22));
  const { data } = ctx.getImageData(0,0,1800,1000);
  const samples = [], contours=[];
  let minX = 1800, maxX = 0, minY = 1000, maxY = 0;
  for (let y = 18; y < 980; y += 3) for (let x = 18; x < 1780; x += 3) {
    if (data[(y*1800+x)*4+3] > 140) {
      const p=[x,y];samples.push(p);
      const alpha=(px,py)=>data[(py*1800+px)*4+3];
      if(alpha(x-5,y)<140||alpha(x+5,y)<140||alpha(x,y-5)<140||alpha(x,y+5)<140)contours.push(p);
      minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
    }
  }
  if (samples.length < 10) throw new Error('TEXT_EMPTY');
  const w = maxX-minX, h=maxY-minY;
  // The two default Chinese characters receive a deliberately generous, readable size.
  const scale = Math.min(maxWidth / Math.max(w,1), maxHeight / Math.max(h,1));
  const rng = random(seed), a = new Float32Array(count*3);
  for (let j=samples.length-1; j>0; j--) { const k=Math.floor(rng()*(j+1)); [samples[j],samples[k]]=[samples[k],samples[j]]; }
  for (let j=contours.length-1; j>0; j--) { const k=Math.floor(rng()*(j+1)); [contours[j],contours[k]]=[contours[k],contours[j]]; }
  let fillIndex=0,edgeIndex=0;
  for (let i=0;i<count;i++) {
    // Most grains cover the letter face evenly; a small contour allowance
    // keeps fine strokes intact at the lower particle-quality setting.
    const edge=i%11<2&&contours.length;
    const p=edge?contours[edgeIndex++%contours.length]:samples[fillIndex++%samples.length];
    const px=(p[0]-(minX+maxX)/2)/Math.max(w/2,1),py=(p[1]-(minY+maxY)/2)/Math.max(h/2,1);
    a[i*3]=(p[0]-(minX+maxX)/2+(rng()-.5)*2.05)*scale;
    a[i*3+1]=-(p[1]-(minY+maxY)/2+(rng()-.5)*2.05)*scale;
    const depth = edge ? (rng()-.5)*.40 : (rng()<.73 ? .18 : -.16)+(rng()-.5)*.065;
    a[i*3+2]=.09*(1-px*px)-.035*py*py+depth;
  }
  return a;
}
export function loveTargets(text, count, opts = {}) {
  if (!/^I\s*[♥❤♡💗💖💓💘💝💞]\uFE0F?\s*U$/iu.test(text.trim())) return textTargets(text,count,{maxHeight:3.4,...opts});
  const left = Math.floor(count*.19), right=Math.floor(count*.25), mid=count-left-right;
  const a=new Float32Array(count*3);
  const l=textTargets('I',left,{maxWidth:1.05,maxHeight:3.25});
  const h=heartTargets(mid,71,1.75);
  const r=textTargets('U',right,{maxWidth:2.08,maxHeight:3.25});
  for(let i=0;i<left;i++){a.set([l[i*3]-3.2,l[i*3+1],l[i*3+2]],i*3);}
  for(let i=0;i<mid;i++){a.set([h[i*3]-.3,h[i*3+1]+.1,h[i*3+2]],(left+i)*3);}
  for(let i=0;i<right;i++){a.set([r[i*3]+3.15,r[i*3+1],r[i*3+2]],(left+mid+i)*3);}
  return a;
}
export function surpriseTargets(name,count,opts={}) {
  const {message='I ♥ U',maxWidth=6.4}=opts;
  const loveCount=Math.floor(count*.43), nameCount=Math.floor(count*.47);
  const coreCount=loveCount+nameCount, a=new Float32Array(count*3);
  // Both rows remain real particle volumes, with a deliberate gap between them.
  // Fit the default geometric heart as well as arbitrary edited message text.
  const placeRow=(points,offset,y,maxHeight)=>{
    let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
    for(let i=0;i<points.length;i+=3){
      minX=Math.min(minX,points[i]);maxX=Math.max(maxX,points[i]);
      minY=Math.min(minY,points[i+1]);maxY=Math.max(maxY,points[i+1]);
    }
    const scale=Math.min(maxWidth/Math.max(maxX-minX,.001),maxHeight/Math.max(maxY-minY,.001));
    for(let i=0;i<points.length;i+=3){
      a[offset+i]=(points[i]-(minX+maxX)/2)*scale;
      a[offset+i+1]=(points[i+1]-(minY+maxY)/2)*scale+y;
      a[offset+i+2]=points[i+2]*Math.min(1,scale);
    }
  };
  if(loveCount)placeRow(loveTargets(message,loveCount,{maxWidth:6.4,maxHeight:2.6}),0,1.25,1.95);
  if(nameCount)placeRow(textTargets(name,nameCount,{maxWidth:6.4,maxHeight:2.15,seed:99}),loveCount*3,-1.32,2.15);
  const rng=random(35);
  const satellites=[
    {x:-4.45,y:1.45,z:.85,size:.58,tilt:.28,weight:.30},
    {x:4.40,y:-1.40,z:1.1,size:.60,tilt:-.35,weight:.30},
    {x:3.70,y:2.60,z:-1.3,size:.32,tilt:.38,weight:.15},
    {x:-3.65,y:-2.60,z:-.8,size:.30,tilt:-.15,weight:.15},
    {x:5.05,y:1.36,z:-1.5,size:.24,tilt:.30,weight:.10},
  ];
  for(let i=coreCount;i<count;i++) {
    const t=rng()*Math.PI*2;
    if(i%19===0){
      // A few distant grains suggest the orbit linking the heart satellites.
      a.set([Math.cos(t)*5.28,Math.sin(t)*2.64,Math.sin(t+.8)*1.7-1.1],i*3);
      continue;
    }
    let ticket=rng(),c=satellites[satellites.length-1];
    for(const satellite of satellites){ticket-=satellite.weight;if(ticket<=0){c=satellite;break;}}
    const p=heartPoint(t,c.size),fill=rng()<.33?Math.sqrt(rng()):1;
    p[0]*=fill;p[1]*=fill;
    const depth=(1-fill)*c.size*.40+(rng()-.5)*.035;
    a.set([c.x+p[0]*Math.cos(c.tilt)+depth*Math.sin(c.tilt),c.y+p[1],c.z-p[0]*Math.sin(c.tilt)+depth],i*3);
  }
  return a;
}
