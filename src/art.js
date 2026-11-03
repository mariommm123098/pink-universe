import * as THREE from 'three';
import { heartTargets, scatterTargets, textTargets, surpriseTargets, random } from './shapes.js';
import { motionForScene, sampleTransitionBuffer, transitionGLSL } from './motion.js';
import { SpatialStage } from './spatial-stage.js';
import { InteractionField, fieldGLSL } from './interaction.js';
import { createFlowRibbons, orbitalGLSL } from './flow-ribbons.js';

const TAU = Math.PI * 2;
const clamp = THREE.MathUtils.clamp;
const sceneIndex = { welcome: 0, scatter: 0, three: 1, two: 2, one: 3, love: 4, name: 5, surprise: 6 };
const vertex = `
attribute vec3 aFrom; attribute vec3 aTarget; attribute vec3 aSeed; attribute float aSize;
uniform float uTime,uTransition,uDuration,uStagger,uArc,uScatter,uHeart,uPixelRatio,uIntensity,uPresence,uRise,uScene,uFit,uMemory,uCurl,uDensity;
uniform vec2 uPointer,uVelocity;
varying vec3 vColor; varying float vAlpha,vSpark,vBlur,vCompact;
${transitionGLSL}
${fieldGLSL}
${orbitalGLSL}
void main(){
  float age=uTime-uTransition;
  vec3 p=transitionPosition(aFrom,aTarget,aSeed,age,uDuration,uStagger,uArc,uRise,uCurl);
  // A living satin volume; individual grains never lose the edges of a letter.
  float drift=.012+uScatter*.075;
  p+=vec3(sin(uTime*.47+aSeed.x*36.+p.y),cos(uTime*.38+aSeed.y*30.+p.x),sin(uTime*.32+aSeed.z*34.))*drift;
  p=orbitalFlow(p,uTime,uScatter,uPointer,uMemory);
  vec2 delta=p.xy-uPointer*vec2(4.6,2.8);
  float influence=exp(-dot(delta,delta)*.32);
  p.xy+=uVelocity*influence*(.055+uScatter*.16);
  p.z+=influence*length(uVelocity)*.15*uScatter;
  float touchWave=fieldWave(p.xy,uTime);
  p.z+=touchWave*(.07+uScatter*.36);
  p.xy+=normalize(delta+.0001)*touchWave*(.018+uScatter*.10);
  p.xy-=delta*influence*uCharge*(.006+uScatter*.11);
  float beat=exp(-pow(sin(uTime*1.65),2.)*48.)*.035+exp(-pow(sin(uTime*1.65-.34),2.)*68.)*.018;
  float central=1.-smoothstep(1.6,2.4,abs(p.x));
  p*=1.+uHeart*beat*central;
  p.xy+=uPointer*(.28+uScatter*.48);
  p.z+=sin(p.x*.65+uTime*.5)*uPointer.x*.13;
  float sweep=exp(-pow((p.x-mod(max(age-.5,0.)*2.4,13.)+6.)*.9,2.));
  vec4 mv=modelViewMatrix*vec4(p,1.);
  gl_Position=projectionMatrix*mv;
  float twinkle=.82+.18*sin(uTime*(.9+aSeed.x)+aSeed.z*40.);
  vBlur=smoothstep(1.5,4.2,abs(p.z));
  vCompact=1.-smoothstep(.45,.9,uFit);
  gl_PointSize=clamp(aSize*uPixelRatio*uFit*(12.8/-mv.z)*(1.+vBlur*.8)*sqrt(uDensity),1.55*uPixelRatio,20.);
  float stream=.5+.5*sin(atan(p.y/.61,p.x)*3.-uTime*.65+p.z*.7);
  vColor=mix(vec3(1.,.12,.38),vec3(1.,.67,.79),aSeed.y*.65+stream*.35);
  vColor=mix(vColor,vec3(1.,.90,.82),smoothstep(.84,.99,aSeed.z)*.75);
  vColor*=.88+.12*smoothstep(-.25,.22,p.z);
  float glint=sweep*(step(4.5,uScene))*.35+abs(touchWave)*.65+influence*uCharge*.28;
  vColor+=vec3(.14,.22,.20)*glint;
  float presence=smoothstep(aSeed.z-.045,aSeed.z+.045,uPresence);
  vAlpha=(.52+aSeed.x*.42)*twinkle*uIntensity*uDensity*presence*(1.-vBlur*.48)*(1.+uScatter*pow(stream,8.)*.5);
  vSpark=step(.975,aSeed.y)*(.6+.4*sin(uTime*1.7+aSeed.x*70.));
}`;
const fragment = `
precision highp float; varying vec3 vColor; varying float vAlpha,vSpark,vBlur,vCompact;
void main(){
  vec2 uv=gl_PointCoord-.5; float r=length(uv)*2.; if(r>1.)discard;
  float core=exp(-r*r*mix(25.,9.,max(vBlur,vCompact*.85)));
  float halo=exp(-r*r*4.8)*.17;
  float star=exp(-abs(uv.x)*95.)*exp(-abs(uv.y)*9.)+exp(-abs(uv.y)*95.)*exp(-abs(uv.x)*9.);
  gl_FragColor=vec4(vColor,(core+halo+star*vSpark*.27)*vAlpha);
}`;

export class ParticleArt {
  constructor(canvas, onQuality) {
    this.canvas=canvas; this.onQuality=onQuality;
    this.count=(navigator.hardwareConcurrency||4)<=4?12500:18000;
    this.quality='auto'; this.activeCount=this.count;
    this.renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:false,powerPreference:'high-performance'});
    this.renderer.setClearColor(0x000000,0); this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.scene=new THREE.Scene(); this.camera=new THREE.PerspectiveCamera(43,1,.1,80); this.camera.position.z=12.8;
    this.group=new THREE.Group(); this.scene.add(this.group);
    this.time=0; this.last=performance.now(); this.pointer=new THREE.Vector2(); this.currentPointer=new THREE.Vector2();
    this.velocity=new THREE.Vector2(); this.previousPointer=new THREE.Vector2();
    this.field=new InteractionField();this.inputActive=false;this.lastInputAt=-100;this.inputMode='none';this.countdown=0;this.targetCache=new Map();
    this.mode='welcome'; this.intro=1; this.introTarget=1; this.scatter=1; this.scatterTarget=1;
    this.heart=0; this.heartTarget=0; this.transitionAt=-10; this.surpriseAt=-100; this.sceneValue=0;this.memory=0;this.memoryTarget=0;
    this.motion=motionForScene('scatter'); this.from=scatterTargets(this.count); this.target=this.from.slice();
    const rng=random(61),seed=new Float32Array(this.count*3),size=new Float32Array(this.count);
    for(let i=0;i<this.count;i++) { seed.set([rng(),rng(),rng()],i*3); size[i]=rng()<.035?5+rng()*3:2.3+rng()*2.5; }
    this.seeds=seed;
    this.geometry=new THREE.BufferGeometry();
    this.geometry.setAttribute('position',new THREE.BufferAttribute(this.from,3));
    this.geometry.setAttribute('aFrom',new THREE.BufferAttribute(this.from,3));
    this.geometry.setAttribute('aTarget',new THREE.BufferAttribute(this.target,3));
    this.geometry.setAttribute('aSeed',new THREE.BufferAttribute(seed,3));
    this.geometry.setAttribute('aSize',new THREE.BufferAttribute(size,1));
    this.geometry.getAttribute('aFrom').setUsage(THREE.DynamicDrawUsage);
    this.geometry.getAttribute('aTarget').setUsage(THREE.DynamicDrawUsage);
    // One reusable index buffer: its low-quality prefix samples the entire shape.
    const indices=new Uint16Array(this.count),used=new Uint8Array(this.count),lowCount=Math.min(8500,this.count);
    for(let i=0;i<lowCount;i++){const j=Math.floor(i*this.count/lowCount);indices[i]=j;used[j]=1;}
    let next=lowCount;for(let i=0;i<this.count;i++)if(!used[i])indices[next++]=i;
    this.geometry.setIndex(new THREE.BufferAttribute(indices,1));
    this.material=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:fragment,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{
      uTime:{value:0},uTransition:{value:-10},uDuration:{value:this.motion.duration},uStagger:{value:this.motion.stagger},uArc:{value:this.motion.arc},
      uScatter:{value:1},uHeart:{value:0},uPixelRatio:{value:1},uIntensity:{value:1.7},uPresence:{value:.33},uRise:{value:this.motion.rise},
      uPointer:{value:this.currentPointer},uVelocity:{value:this.velocity},uScene:{value:0},uFit:{value:1},uMemory:{value:0},uDensity:{value:1},uCurl:{value:this.motion.curl||0},
      uLoveWeave:{value:0},uCharge:{value:0},uHandPresence:{value:0},uWaves:{value:Array.from({length:4},()=>new THREE.Vector4(0,0,-100,0))}
    }});
    this.points=new THREE.Points(this.geometry,this.material); this.points.frustumCulled=false; this.group.add(this.points);
    this.ribbons=createFlowRibbons(this.material.uniforms);this.group.add(this.ribbons);
    this.stage=new SpatialStage(this.scene);
    this.makeStars(); this.makeBubbles(); this.makeFireworks(); this.makeWake();
    this.frames=0; this.frameSum=0; this.glow=1.85; this.reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.resize(); window.addEventListener('resize',this.resize); this.animate();
  }
  makeStars() {
    const rng=random(90),positions=[],colors=[];
    for(let i=0;i<900;i++) { positions.push((rng()-.5)*36,(rng()-.5)*23,-3-rng()*16); colors.push(1,.34+rng()*.4,.58+rng()*.3); }
    const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3)); g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    this.starMaterial=new THREE.PointsMaterial({size:.014,vertexColors:true,transparent:true,opacity:.42,blending:THREE.AdditiveBlending,depthWrite:false});
    this.stars=new THREE.Points(g,this.starMaterial); this.scene.add(this.stars);
  }
  makeBubbles() {
    const g=new THREE.PlaneGeometry(1,1);
    const m=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{uTime:{value:0},uOpacity:{value:.7}},
      vertexShader:`varying vec2 vUv;varying float vDepth,vPhase;void main(){vUv=uv;vPhase=instanceMatrix[3].x*1.3+instanceMatrix[3].y;vec4 p=modelViewMatrix*instanceMatrix*vec4(position,1.);vDepth=clamp(13./-p.z,.45,1.2);gl_Position=projectionMatrix*p;}`,
      fragmentShader:`precision highp float;varying vec2 vUv;varying float vDepth,vPhase;uniform float uTime,uOpacity;
      void main(){
        vec2 p=(vUv-.5)*2.;float r=length(p);if(r>1.)discard;
        float z=sqrt(max(0.,1.-r*r));vec3 n=vec3(p,z);
        float angle=atan(p.y,p.x);
        float rim=exp(-pow((r-.958)*62.,2.));
        float fresnel=pow(1.-z,3.5);
        float film=.5+.5*sin(z*18.+angle*2.+uTime*.20+vPhase);
        vec3 rose=mix(vec3(1.,.29,.53),vec3(.65,.58,1.),film*.62);
        float arc=pow(max(0.,dot(normalize(p+.0001),normalize(vec2(-.6,.8)))),10.);
        float reflection=pow(max(0.,dot(n,normalize(vec3(-.40,.62,.66)))),120.);
        float under=pow(max(0.,dot(n,normalize(vec3(.55,-.79,.18)))),38.);
        rose=mix(rose,vec3(1.,.91,.86),arc*.8+reflection*.2);
        float a=rim*(.12+arc*.60)+fresnel*.027+reflection*.63+under*.16;
        a+=exp(-pow((r-.87)*48.,2.))*arc*.052;
        gl_FragColor=vec4(rose,a*vDepth*uOpacity);
      }`

    });
    this.bubbles=new THREE.InstancedMesh(g,m,40); this.bubbles.frustumCulled=false; this.scene.add(this.bubbles);
    this.bubbleData=[]; const rng=random(43);
    for(let i=0;i<40;i++) this.bubbleData.push({x:(rng()-.5)*17,y:(rng()-.5)*12,z:(rng()-.5)*6-1,size:.18+rng()**2*1.22,speed:.045+rng()*.10,phase:rng()*TAU,vx:0,vy:0});
    this.dummy=new THREE.Object3D();
  }
  makeFireworks() {
    const count=2400,seed=new Float32Array(count*3),rng=random(885);
    for(let i=0;i<count;i++) seed.set([rng(),rng(),rng()],i*3);
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(count*3),3));g.setAttribute('aSeed',new THREE.BufferAttribute(seed,3));
    const m=new THREE.ShaderMaterial({transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,uniforms:{uTime:{value:0},uStart:{value:-100},uPixelRatio:{value:1},uFit:{value:1},uOpacity:{value:0}},
      vertexShader:`attribute vec3 aSeed;uniform float uTime,uStart,uPixelRatio,uFit,uOpacity;varying float vAlpha;varying vec3 vColor;
      void main(){float index=floor(aSeed.x*7.);float age=uTime-uStart-2.5-index*.48;float cycle=mod(max(age,0.),11.);float a=aSeed.y*6.2831853;float z=aSeed.z*2.-1.;float h=sqrt(1.-z*z);float life=clamp(cycle,0.,4.8);float travel=(1.-exp(-life*.7))*3.2;vec3 origin=vec3(sin(index*4.5)*4.3,cos(index*1.6)*2.9,-1.8);vec3 direction=vec3(cos(a)*h,sin(a)*h,z);
      if(mod(index,3.)<.5){direction=vec3((sin(a)*sin(a)*sin(a)),(13.*cos(a)-5.*cos(2.*a)-2.*cos(3.*a)-cos(4.*a))/17.,z*.25);}
      vec3 p=origin+direction*travel*(.5+aSeed.z*.5);p.y-=life*life*.075;p.xy+=vec2(sin(life+a),cos(life+a))*.08*life;vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=(1.6+aSeed.z*3.6)*uPixelRatio*uFit*12.8/-mv.z;vAlpha=uOpacity*mix(.22,1.,smoothstep(.6,1.35,length(p.xy/vec2(4.2,2.8))))*step(0.,age)*smoothstep(0.,.12,cycle)*pow(max(0.,1.-cycle/4.8),1.8);vColor=mix(vec3(1.,.18,.46),vec3(1.,.85,.74),aSeed.z*.8);}`,
      fragmentShader:`precision highp float;varying float vAlpha;varying vec3 vColor;void main(){float r=length(gl_PointCoord-.5)*2.;if(r>1.)discard;gl_FragColor=vec4(vColor,(exp(-r*r*16.)+exp(-r*r*4.)*.15)*vAlpha);}`});
    this.fireworks=new THREE.Points(g,m);this.fireworks.frustumCulled=false;this.fireworks.visible=false;this.scene.add(this.fireworks);
  }
  makeWake() {
    this.trail=Array.from({length:14},()=>new THREE.Vector3(0,0,-100)); this.trailClock=0;
    const count=1000,rng=random(721),seeds=new Float32Array(count*3);
    for(let i=0;i<count;i++) seeds.set([rng(),rng(),rng()],i*3);
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(count*3),3));g.setAttribute('aSeed',new THREE.BufferAttribute(seeds,3));
    const m=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{uTime:{value:0},uTrail:{value:this.trail},uPixelRatio:{value:1},uFit:{value:1},uPresence:{value:0},uCharge:{value:0},uPointer:{value:this.currentPointer}},
      vertexShader:`attribute vec3 aSeed;uniform vec3 uTrail[14];uniform float uTime,uPixelRatio,uFit,uPresence,uCharge;uniform vec2 uPointer;varying float vAlpha;
      void main(){
      if(aSeed.x>.72){
        float a=aSeed.y*6.2831853+uTime*(.8+aSeed.z*.8);
        float r=(.14+aSeed.z*.35)*(.4+uCharge*.6);
        vec3 p=vec3(uPointer*vec2(4.6,2.8)+vec2(cos(a),sin(a))*r,.8+sin(a*2.)*r*.4);
        vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;
        gl_PointSize=(1.4+aSeed.z*2.8)*uPixelRatio*uFit*12.8/-mv.z;
        vAlpha=uCharge*uPresence*(.25+aSeed.z*.4);return;
      }
      float f=aSeed.x/.72*12.99;int i=int(f);vec3 a=uTrail[i];vec3 b=uTrail[i+1];vec2 point=mix(a.xy,b.xy,fract(f));float age=uTime-mix(a.z,b.z,fract(f));vAlpha=0.;if(age<0.||age>2.5){gl_Position=vec4(2.,2.,2.,1.);gl_PointSize=1.;return;}float spread=.018+age*.11;float angle=aSeed.y*6.2831853+age*3.;vec3 p=vec3(point+vec2(cos(angle),sin(angle))*spread*(.3+aSeed.z),.7+sin(angle)*spread);vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp((1.5+aSeed.z*3.2)*uPixelRatio*uFit*12.8/max(.5,-mv.z),.75,16.);vAlpha=exp(-age*2.8)*uPresence*.65;}`,
      fragmentShader:`precision highp float;varying float vAlpha;void main(){float r=length(gl_PointCoord-.5)*2.;if(r>1.)discard;gl_FragColor=vec4(1.,.48,.7,exp(-r*r*8.)*vAlpha);}`});
    this.wake=new THREE.Points(g,m);this.wake.frustumCulled=false;this.group.add(this.wake);
  }
  setPointer(x,y) {
    if(Number.isFinite(x)&&Number.isFinite(y)) {
      this.pointer.set(clamp(x,-1,1),clamp(y,-1,1));
      this.inputActive=true;this.lastInputAt=performance.now();
    }
  }
  setInputMode(mode) { this.inputMode=mode;this.inputActive=false; }
  releaseInput() { this.inputActive=false; }
  setCountdown(step) { this.countdown=clamp(step,0,3); }
  resize=()=>{
    const w=window.innerWidth,h=window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,this.quality==='low'?1.2:1.75)); this.renderer.setSize(w,h);
    this.camera.aspect=w/h;this.camera.updateProjectionMatrix();
    this.ratio=this.renderer.getPixelRatio();
    for(const m of [this.material,this.fireworks.material,this.wake.material]) m.uniforms.uPixelRatio.value=this.ratio;
  };
  currentBase() { return sampleTransitionBuffer(this.from,this.target,this.seeds,this.time-this.transitionAt,this.motion); }
  setScene(mode,{name='小猫',message='I ♥ U'}={}) {
    // Gesture latches keep their established sequence; every romance cue now
    // reveals the same two-row composition with the existing finale animation.
    if(['love','name','surprise'].includes(mode))mode='surprise';
    this.from=this.currentBase();
    // A single world-space composition scales as a whole, including after resize.
    const key=JSON.stringify([mode,name,message]);
    if(this.targetCache.has(key)) this.target=this.targetCache.get(key);
    else if(mode==='scatter') this.target=scatterTargets(this.count);
    else if(['one','two','three'].includes(mode)) this.target=textTargets({one:'1',two:'2',three:'3'}[mode],this.count,{maxWidth:4,maxHeight:4.0});
    else if(mode==='surprise') this.target=surpriseTargets(name,this.count,{message,maxWidth:6.4});
    else this.target=heartTargets(this.count);
    if(!this.targetCache.has(key)) {
      if(this.targetCache.size>=12)this.targetCache.delete(this.targetCache.keys().next().value);
      this.targetCache.set(key,this.target);
    }
    this.geometry.getAttribute('aFrom').array.set(this.from);this.geometry.getAttribute('aFrom').needsUpdate=true;
    this.geometry.getAttribute('aTarget').array.set(this.target);this.geometry.getAttribute('aTarget').needsUpdate=true;
    this.motion=motionForScene(mode);this.transitionAt=this.time;
    const u=this.material.uniforms;
    u.uTransition.value=this.time;u.uDuration.value=this.motion.duration;u.uStagger.value=this.motion.stagger;u.uArc.value=this.motion.arc;u.uRise.value=this.motion.rise;u.uCurl.value=this.motion.curl||0;
    this.loveWeaveTarget=mode==='love'&&/^I\s*[♥❤♡]\s*U$/iu.test(message.trim())?1:0;
    this.scatterTarget=mode==='scatter'?1:0;this.heartTarget=['love','surprise'].includes(mode)?1:0;this.mode=mode;
    this.fireworkTarget=mode==='surprise'?1:0;
    if(mode==='surprise'){this.surpriseAt=this.time;this.memoryTarget=1;if((this.fireworkFade||0)<.08)this.fireworks.material.uniforms.uStart.value=this.time;}
  }
  enter() { this.introTarget=0; }
  setQuality(q) {
    this.material.uniforms.uDensity.value=q==='low'?1.25:1;
    this.quality=q;this.activeCount=q==='low'?Math.min(8500,this.count):this.count;
    this.frames=0;this.frameSum=0;
    this.geometry.setDrawRange(0,this.activeCount);this.fireworks.geometry.setDrawRange(0,q==='low'?1100:2400);
    this.stars.geometry.setDrawRange(0,q==='low'?500:900);this.bubbles.count=q==='low'?22:40;this.wake.geometry.setDrawRange(0,q==='low'?500:1000);
    this.ribbons.geometry.setDrawRange(0,q==='low'?8640:15840);
    this.stage.setQuality(q);this.resize();this.onQuality?.(this.activeCount);
  }
  animate=()=>{
    this.raf=requestAnimationFrame(this.animate);
    const now=performance.now(),rawDt=(now-this.last)/1000,dt=Math.min(rawDt,.05);this.last=now;
    if(document.hidden)return;
    this.time+=dt*(this.reducedMotion?.55:1);const t=this.time,lerp=1-Math.exp(-dt*7);
    this.intro+=(this.introTarget-this.intro)*(1-Math.exp(-dt*3.5));this.scatter+=(this.scatterTarget-this.scatter)*lerp;this.heart+=(this.heartTarget-this.heart)*lerp;
    this.previousPointer.copy(this.currentPointer);this.currentPointer.lerp(this.pointer,1-Math.exp(-dt*11));
    const vx=clamp((this.currentPointer.x-this.previousPointer.x)/Math.max(dt,.001),-5,5),vy=clamp((this.currentPointer.y-this.previousPointer.y)/Math.max(dt,.001),-5,5);
    this.velocity.x+=(vx-this.velocity.x)*(1-Math.exp(-dt*6));this.velocity.y+=(vy-this.velocity.y)*(1-Math.exp(-dt*6));
    const active=this.inputActive&&(this.inputMode!=='camera'||performance.now()-this.lastInputAt<400);
    this.field.update({dt,time:t,speed:this.velocity.length(),x:this.currentPointer.x,y:this.currentPointer.y,active});
    const visibleH=2*Math.tan(THREE.MathUtils.degToRad(43)/2)*12.8;
    const fit=Math.min(1,visibleH*this.camera.aspect/13.6,visibleH/10.0);
    this.group.scale.setScalar(fit);this.group.rotation.y=this.currentPointer.x*(.095+this.scatter*.07);this.group.rotation.x=-this.currentPointer.y*.07;
    const u=this.material.uniforms;
    u.uLoveWeave.value+=( (this.loveWeaveTarget||0)-u.uLoveWeave.value)*lerp;
    this.ribbons.visible=this.scatter+u.uLoveWeave.value>.002;
    u.uTime.value=t;u.uScatter.value=this.scatter;u.uHeart.value=this.heart;u.uIntensity.value=this.glow*(1-this.intro*.30);
    u.uPresence.value=.33+(1-this.intro)*.72;u.uFit.value=fit;
    u.uCharge.value=this.field.charge;u.uHandPresence.value=this.field.presence;
    this.field.waves.forEach((w,i)=>u.uWaves.value[i].set(w.x,w.y,w.at,w.strength));
    this.sceneValue+=((sceneIndex[this.mode]||0)-this.sceneValue)*lerp;u.uScene.value=this.sceneValue;
    this.memory+=(this.memoryTarget-this.memory)*(1-Math.exp(-dt*.7));u.uMemory.value=this.memory;
    this.stage.update({time:t,dt,pointer:this.currentPointer,scatter:this.scatter,intro:this.intro,mode:this.mode,fit,transitionAt:this.transitionAt,memory:this.memory,field:this.field,countdown:this.countdown});
    this.starMaterial.opacity=(.35+Math.sin(t*.22)*.04)*(1-this.intro*.45);this.stars.rotation.z=t*.0018;this.stars.position.x=this.currentPointer.x*-.10;
    for(let i=0;i<this.bubbles.count;i++) {
      const b=this.bubbleData[i],boost=this.mode==='surprise'?1.8:1;
      const dx=b.x-this.currentPointer.x*4.6,dy=b.y-this.currentPointer.y*2.8,force=Math.exp(-(dx*dx+dy*dy)*.6)*(1-this.intro);
      let ripple=0;
      for(const w of this.field.waves){
        const age=t-w.at,dist=Math.hypot(b.x-w.x,b.y-w.y);
        if(age>0&&age<3.2)ripple+=Math.exp(-((dist-age*3.8)**2)*5)*w.strength*(1-age/3.2);
      }
      const distance=Math.max(.2,Math.hypot(dx,dy));
      b.vx+=(this.velocity.x*.13*force+dx/distance*ripple*.75-dx*force*this.field.charge*.10-b.vx*1.7)*dt;b.vy+=(this.velocity.y*.13*force+dy/distance*ripple*.75-dy*force*this.field.charge*.10-b.vy*1.7)*dt;
      b.x=clamp(b.x+b.vx*dt,-9,9);b.y+=dt*(b.speed*boost+b.vy);if(b.y>7.1)b.y=-7.1;
      const d=this.dummy;const clearance=(1-this.scatter)*Math.exp(-b.y*b.y*.32)*Math.exp(-b.x*b.x*.055);
      d.position.set((b.x+Math.sign(b.x||1)*clearance*.65+Math.sin(t*.23+b.phase)*.22+this.currentPointer.x*.12)*fit,(b.y+this.currentPointer.y*.08)*fit,b.z*fit);
      const emergence=clamp((.24+(1-this.intro)*.9-i/this.bubbles.count)/.14,0,1);
      const size=b.size*(1+Math.sin(t*.4+b.phase)*.04+ripple*.055)*emergence*fit;d.scale.set(size,size*(1+force*lengthSafe(this.velocity)*.018),1);d.updateMatrix();this.bubbles.setMatrixAt(i,d.matrix);
    }
    this.bubbles.instanceMatrix.needsUpdate=true;this.bubbles.material.uniforms.uTime.value=t;this.bubbles.material.uniforms.uOpacity.value=(this.mode==='surprise'?1.0:.79)*(1-this.intro*.3);
    this.fireworkFade=(this.fireworkFade||0)+((this.fireworkTarget||0)-(this.fireworkFade||0))*(1-Math.exp(-dt*4));
    this.fireworks.visible=this.fireworkFade>.002;
    this.fireworks.material.uniforms.uOpacity.value=this.fireworkFade;
    this.fireworks.material.uniforms.uTime.value=t;this.fireworks.material.uniforms.uFit.value=fit;this.fireworks.scale.setScalar(fit);
    this.trailClock+=dt;
    if(this.trailClock>.035) {
      this.trailClock=0;
      for(let i=this.trail.length-1;i>0;i--)this.trail[i].copy(this.trail[i-1]);
      if(active&&this.velocity.length()>.065) this.trail[0].set(this.currentPointer.x*4.6,this.currentPointer.y*2.8,t);
    }
    this.wake.material.uniforms.uCharge.value=this.field.charge;
    this.wake.material.uniforms.uTime.value=t;this.wake.material.uniforms.uFit.value=fit;this.wake.material.uniforms.uPresence.value=1-this.intro;
    this.renderer.render(this.scene,this.camera);
    if(this.quality==='auto'&&t>6&&rawDt<.5) {
      this.frames++;this.frameSum+=rawDt;
      if(this.frames>=120) { if(this.frames/this.frameSum<36)this.setQuality('low');this.frames=0;this.frameSum=0; }
    }
  };
  dispose() {
    cancelAnimationFrame(this.raf);window.removeEventListener('resize',this.resize);this.stage.dispose();
    this.scene.traverse(object=>{object.geometry?.dispose();if(object.material){for(const m of Array.isArray(object.material)?object.material:[object.material])m.dispose();}});
    this.renderer.dispose();
  }
}
function lengthSafe(v){return Math.min(4,v.length());}
