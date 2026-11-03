import * as THREE from 'three';
import { createBloom } from './bloom.js';
import { fieldGLSL } from './interaction.js';

const TAU = Math.PI * 2;
const approach = (from, to, dt, speed = 2.4) => from + (to - from) * (1 - Math.exp(-dt * speed));

const common = /* glsl */`
precision highp float;
uniform float uTime;
uniform float uPresence;
uniform float uScatter;
uniform float uLove;
uniform float uName;
uniform float uSurprise;
uniform float uMemory;
uniform float uAge;
uniform float uImpulse;
uniform float uCountdown,uCount,uBloomAge;
${fieldGLSL}
uniform vec2 uPointer;
const float PI = 3.14159265359;
const float TAU = 6.28318530718;
mat2 turn(float a) { return mat2(cos(a), -sin(a), sin(a), cos(a)); }
`;

/**
 * A hollow, slowly folding rose lens. The middle of the lens is genuinely empty:
 * all surface geometry lives outside the typography, rather than relying on a
 * dark disc laid over it. Batched surfaces, no textures or full-screen postprocessing.
 */
export class SpatialStage {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'rose-observatory';
    this.group.renderOrder = -4;
    scene.add(this.group);
    this.mode = null;
    this.shockAt = -100;
    this.lastTransition = -100;
    this.disposables = [];
    this.uniforms = {
      uTime: { value: 0 },
      uPresence: { value: .25 },
      uScatter: { value: 1 },
      uLove: { value: 0 },
      uName: { value: 0 },
      uSurprise: { value: 0 },
      uMemory: { value: 0 },
      uAge: { value: 100 },
      uImpulse: { value: .5 },
      uPointer: { value: new THREE.Vector2() },
      uCountdown: { value: 0 }, uCount: { value: 0 }, uBloomAge: { value: -100 },
      uCharge: { value: 0 }, uHandPresence: { value: 0 },
      uWaves: { value: Array.from({length:4},()=>new THREE.Vector4(0,0,-100,0)) },
    };
    this.makeMembrane();
    this.makeOrbits();
    this.makeCaustics();
    this.makeDust();
    this.makeShockwaves();
    this.makeCorona();
    this.bloom = this.add(createBloom(this.uniforms));
    this.disposables.push(this.bloom.material);
    this.makeHandLight();
  }

  material(vertexShader, fragmentShader, options = {}) {
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: common + vertexShader,
      fragmentShader: common + fragmentShader,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      ...options,
    });
    this.disposables.push(material);
    return material;
  }

  add(object) {
    object.frustumCulled = false;
    this.group.add(object);
    this.disposables.push(object.geometry);
    return object;
  }

  makeMembrane() {
    const geometry = new THREE.PlaneGeometry(1, 1, 192, 16);
    const material = this.material(/* glsl */`
      varying vec2 vUv;
      varying vec3 vPosition;
      varying vec3 vView;
      void main() {
        vUv = uv;
        float a = uv.x * TAU;
        float v = uv.y * 2. - 1.;
        float memory = uMemory * uScatter;
        float roseAmount = clamp(uSurprise + memory * .32, 0., 1.);
        float bloom = uLove * .7 + uName * .67 + uSurprise * 1.35 + memory * .38;
        float breath = sin(uTime * .36) * .025;
        float phase = uTime * .038;
        float radius = 4.88 + sin(a * 3. - uTime * .08) * .11;
        vec3 p = vec3(cos(a) * radius, sin(a) * radius * (.705 + breath), -2.25);
        // The lens learns a heart, then opens into two raised silk arches.
        float h = PI * .5 - a;
        float hx = sin(h);
        vec2 heart = vec2(hx * hx * hx * 6.24,
          (13. * cos(h) - 5. * cos(h * 2.) - 2. * cos(h * 3.) - cos(h * 4.)) * .312 + .96);
        float beat = exp(-pow(sin(uTime * 1.65), 2.) * 45.) * .012;
        p.xy = mix(p.xy, heart * (1. + beat), uLove);
        vec2 arch = vec2(cos(a) * 5.18, sin(a) * 3.31 + max(0., sin(a)) * .47 + .18);
        p.xy = mix(p.xy, arch, uName);
        // Five broad lobes are structural, rather than an outline pasted behind it.
        float roseR = 5.12 + cos(a * 5. + phase) * .64 + cos(a * 10. + phase * 2.) * .10;
        vec2 rose = vec2(cos(a) * roseR, sin(a) * roseR * .748);
        p.xy = mix(p.xy, rose, roseAmount);
        float width = .19 + uLove * .47 + uName * .66 + uSurprise * 1.02 + memory * .34 + uScatter * .08;
        float fold = a * 2. + uTime * .045 + sin(a * 3.) * bloom * .52;
        fold = mix(fold, a * 2.5 + sin(a * 5. + phase) * .64 + phase, roseAmount);
        width *= 1. + uSurprise * (.22 + .22 * cos(a * 5. + phase));
        p.xy += vec2(cos(a), sin(a) * .76) * v * width * cos(fold);
        p.z += sin(a * 2. + uTime * .09) * (.61 + uName * .32) + v * width * sin(fold) * 1.9;
        p.z += fieldWave(p.xy,uTime)*.15;
        p.z += v * v * bloom * .48 + roseAmount * sin(a * 5. + phase) * .72;
        p.xy = turn(sin(uTime * .055) * .035 * (1. - uLove) + uPointer.x * .018) * p.xy;
        p.x += uPointer.x * .10;
        p.y += uPointer.y * .08;
        vPosition = p;
        vec4 mv = modelViewMatrix * vec4(p, 1.);
        vView = -mv.xyz;
        gl_Position = projectionMatrix * mv;
      }
    `, /* glsl */`
      varying vec2 vUv;
      varying vec3 vPosition;
      varying vec3 vView;
      void main() {
        vec3 n = normalize(cross(dFdx(vView), dFdy(vView)));
        float fresnel = pow(1. - abs(dot(n, normalize(vView))), 2.2);
        float edge = pow(abs(vUv.y * 2. - 1.), 15.);
        float silk = pow(.5 + .5 * sin(vUv.y * 83. + sin(vUv.x * TAU * 3.) * 2.), 15.) * .13;
        float glint = pow(max(0., sin(vUv.x * TAU * 2. - uTime * .21)), 22.);
        float comb = .6 + .4 * sin(vUv.x * TAU * 57. + vUv.y * 4. + uTime * .17);
        vec3 rose = mix(vec3(.74, .055, .25), vec3(1., .44, .66), fresnel * .72 + edge * .45);
        rose = mix(rose, vec3(1., .86, .76), glint * fresnel * .48);
        float alpha = (.009 + fresnel * .13 + edge * .17 + silk * fresnel * 1.3) * (.73 + glint * .8);
        float a = vUv.x * TAU;
        float raisedArches = mix(.12, 1., smoothstep(-.6, .25, sin(a)))
          * (.15 + .85 * smoothstep(.05, .35, abs(cos(a))));
        alpha *= mix(1., raisedArches, uName);
        // Keep the typography's entire projected silhouette free of membrane.
        float aperture = smoothstep(.94, 1.13, length(vPosition.xy / vec2(4.45, 2.45)));
        alpha *= aperture * pow(1. - uSurprise * .97,2.);
        alpha *= (.70 + uLove * .44 + uName * .40 + uSurprise * 1.16 + uMemory * uScatter * .22) * uPresence;
        gl_FragColor = vec4(rose, alpha * (.91 + comb * .09));
      }
    `);
    this.membrane = this.add(new THREE.Mesh(geometry, material));
  }

  makeOrbits() {
    const positions = [], along = [], bands = [];
    const paths = 8, segments = 256;
    for (let band = 0; band < paths; band++) {
      for (let i = 0; i < segments; i++) {
        for (let end = 0; end < 2; end++) {
          positions.push(0, 0, 0);
          along.push((i + end) / segments);
          bands.push(band / (paths - 1));
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('aAlong', new THREE.Float32BufferAttribute(along, 1));
    geometry.setAttribute('aBand', new THREE.Float32BufferAttribute(bands, 1));
    const material = this.material(/* glsl */`
      attribute float aAlong;
      attribute float aBand;
      varying float vAlong;
      varying float vBand;
      varying float vDepth;
      void main() {
        vAlong = aAlong;
        vBand = aBand;
        float a = aAlong * TAU;
        float r = mix(4.66 + aBand * .99, 2.65 + aBand * .46, uCountdown);
        float tilt = (aBand - .5) * .26 + sin(uTime * .08 + aBand * 8.) * .025;
        float lift = sin(a * 2. + aBand * 7. + uTime * .09) * (.12 + uSurprise * .12);
        vec3 p = vec3(cos(a) * (r + lift), sin(a) * r * (.63 + aBand * .11), -2.1);
        float h = PI * .5 - a;
        float hx = sin(h);
        float heartScale = .97 + aBand * .075;
        vec2 heart = vec2(hx * hx * hx * 6.24,
          (13. * cos(h) - 5. * cos(h * 2.) - 2. * cos(h * 3.) - cos(h * 4.)) * .312 + .96) * heartScale;
        p.xy = mix(p.xy, heart, uLove * .86);
        p.y += uName * (.2 + max(0., sin(a)) * .38);
        float roseR = r + cos(a * 5. + uTime * .038 + aBand * .11) * .45;
        vec2 rose = vec2(cos(a) * roseR, sin(a) * roseR * .748);
        p.xy = mix(p.xy, rose, clamp(uSurprise * .91 + uMemory * uScatter * .25, 0., 1.));
        p.xy = turn(tilt * (1. - uLove * .8)) * p.xy;
        p.z += sin(a + aBand * TAU) * (.45 + aBand * .55);
        p.z += uPointer.x * cos(a) * .25 + uPointer.y * sin(a) * .2;
        p.y=mix(p.y,p.y*1.46,uCountdown);
        p.xy += uPointer * (.07 + aBand * .03);
        vec4 mv = modelViewMatrix * vec4(p, 1.);
        vDepth = .65 + .35 * sin(a + aBand * TAU);
        gl_Position = projectionMatrix * mv;
      }
    `, /* glsl */`
      varying float vAlong;
      varying float vBand;
      varying float vDepth;
      void main() {
        float a = vAlong * TAU;
        float head = pow(.5 + .5 * cos(a - uTime * (.18 + vBand * .06) - vBand * 19.), 90.);
        float engraving = smoothstep(.3, .7, sin(a * (32. + floor(vBand * 6.) * 2.) + vBand * 3.));
        float segmentation = mix(1., engraving * .7 + .3, step(.55, vBand));
        float filled=1.-smoothstep(uCount/3.-.012,uCount/3.+.012,vAlong);
        float alpha = (.027 + head * .36) * segmentation * vDepth;
        alpha+=uCountdown*(.17*filled+head*.38)*(.35+vBand*.65);
        float upperArches = mix(.22, 1., smoothstep(-.55, .15, sin(a)));
        alpha *= mix(1., upperArches, uName);
        alpha *= uPresence * (.94 + uLove * .48 + uName * .5 + uSurprise * 1.25 + uMemory * uScatter * .28);
        vec3 color = mix(vec3(.91, .21, .46), vec3(1., .77, .72), head * .72);
        gl_FragColor = vec4(color, alpha);
      }
    `);
    this.orbits = this.add(new THREE.LineSegments(geometry, material));
    this.orbitFullCount = positions.length / 3;
  }

  makeCaustics() {
    const geometry = new THREE.PlaneGeometry(14, 11, 1, 1);
    const material = this.material(/* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec3 p = vec3(position.x, -3.72, position.y - 1.9);
        p.y += sin(position.x * .65 + uTime * .23) * .035;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.);
      }
    `, /* glsl */`
      varying vec2 vUv;
      void main() {
        vec2 p = (vUv - .5) * vec2(2., 2.2);
        p.x += uPointer.x * .025;
        float a = atan(p.y, p.x);
        float r = length(p);
        float wobble = sin(a * 4. + uTime * .21) * .018 + sin(a * 7. - uTime * .09) * .009;
        float lens = r + wobble;
        float rings = pow(.5 + .5 * cos(lens * 81. - uTime * .27), 70.);
        rings *= exp(-pow((r - .48) * 4.2, 2.));
        float wide = exp(-pow((r - .43) * 17., 2.)) * .027;
        float fragments = .34 + .66 * pow(.5 + .5 * sin(a * 3. - uTime * .11 + r * 8.), 4.);
        float inner = exp(-r * r * 15.) * .011;
        float alpha = ((rings * .058 + wide) * fragments + inner) * uPresence;
        alpha *= 1.8 * (.7 + uLove * .35 + uName * .19 + uSurprise * .8 + uMemory * uScatter * .18);
        alpha *= 1. - smoothstep(.78, 1., r);
        gl_FragColor = vec4(vec3(.96, .21, .42), alpha);
      }
    `);
    this.caustics = this.add(new THREE.Mesh(geometry, material));
  }

  makeDust() {
    const positions = new Float32Array(620 * 3);
    const seeds = new Float32Array(620 * 3);
    let state = 1742;
    const rand = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };
    for (let i = 0; i < 620 * 3; i++) seeds[i] = rand();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3));
    const material = this.material(/* glsl */`
      attribute vec3 aSeed;
      varying float vAlpha;
      varying float vWarm;
      void main() {
        float a = aSeed.x * TAU + uTime * (.015 + aSeed.z * .018) * (aSeed.y > .5 ? 1. : -1.);
        float r = 4.3 + aSeed.y * 1.45;
        r += sin(a * 3. + uTime * .11 + aSeed.z * 15.) * (.08 + uSurprise * .12);
        vec3 p = vec3(cos(a) * r, sin(a) * r * .72, -2.5 + sin(a * 2. + aSeed.z * 10.) * 1.15);
        p.xy += uPointer * (.10 + aSeed.y * .09);
        vec4 mv = modelViewMatrix * vec4(p, 1.);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (1. + aSeed.z * 1.8) * 13. / max(5., -mv.z);
        float scintillation = pow(.5 + .5 * sin(uTime * .6 + aSeed.y * 90.), 9.);
        vAlpha = (.06 + scintillation * .28) * uPresence * (.65 + uSurprise * 1.2);
        vWarm = aSeed.z;
      }
    `, /* glsl */`
      varying float vAlpha;
      varying float vWarm;
      void main() {
        vec2 p = gl_PointCoord - .5;
        float r = length(p) * 2.;
        if (r > 1.) discard;
        vec3 color = mix(vec3(1., .24, .49), vec3(1., .78, .71), vWarm * vWarm);
        gl_FragColor = vec4(color, exp(-r * r * 9.) * vAlpha);
      }
    `);
    this.dust = this.add(new THREE.Points(geometry, material));
  }

  makeShockwaves() {
    const positions = [], uvs = [], indices = [], waves = [];
    const segments = 192;
    for (let wave = 0; wave < 3; wave++) {
      const base = positions.length / 3;
      for (let i = 0; i <= segments; i++) {
        for (let edge = 0; edge < 2; edge++) {
          positions.push(0, 0, 0);
          uvs.push(i / segments, edge);
          waves.push(wave);
        }
      }
      for (let i = 0; i < segments; i++) {
        const j = base + i * 2;
        indices.push(j, j + 1, j + 2, j + 1, j + 3, j + 2);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('aWave', new THREE.Float32BufferAttribute(waves, 1));
    geometry.setIndex(indices);
    const material = this.material(/* glsl */`
      attribute float aWave;
      varying vec2 vUv;
      varying float vLife;
      void main() {
        vUv = uv;
        float age = uAge - .34 - aWave * .19;
        float life = clamp(age / 2.5, 0., 1.);
        float a = uv.x * TAU;
        float radius = 1.55 + pow(life, .65) * 5.6;
        radius += (uv.y - .5) * (.045 + life * .17);
        vec3 p = vec3(cos(a) * radius, sin(a) * radius * .72, -1.45 - life * .7);
        p.z += sin(a * 2. + uTime * .1) * .25;
        p.xy += uPointer * .13;
        vLife = step(0., age) * pow(1. - life, 2.) * (1. - aWave * .24);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.);
      }
    `, /* glsl */`
      varying vec2 vUv;
      varying float vLife;
      void main() {
        float edge = pow(max(0., 1. - abs(vUv.y * 2. - 1.)), 2.);
        float bright = .5 + .5 * sin(vUv.x * TAU * 3. - uTime * .25);
        float alpha = edge * vLife * bright * .19 * uImpulse * uPresence;
        gl_FragColor = vec4(1., .46, .65, alpha);
      }
    `);
    this.shockwaves = this.add(new THREE.Mesh(geometry, material));
  }

  makeCorona() {
    const geometry = new THREE.PlaneGeometry(13.6, 10.9, 1, 1);
    const material = this.material(/* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec3 p = position;
        p.z = -4.6;
        p.xy += uPointer * .12;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.);
      }
    `, /* glsl */`
      varying vec2 vUv;
      void main() {
        vec2 p = (vUv - .5) * 2.;
        p.y *= 1.13;
        float a = atan(p.y, p.x);
        float r = length(p);
        float phase = uTime * .038;
        float petals = .116 * cos(a * 5. + phase) + .020 * cos(a * 10. + phase * 2.);
        float ringRadius = .845 + petals;
        float d = r - ringRadius;
        float line = exp(-abs(d) * 170.) * .38;
        float bloom = exp(-pow(d * 13., 2.)) * .051;
        float fine = pow(.5 + .5 * cos(a * 91. + r * 29. - uTime * .22), 27.);
        float rays = fine * exp(-pow((r - .87) * 8., 2.)) * .052;
        float second = exp(-abs(r - (.905 + petals * .79)) * 190.) * .078;
        float sunward = pow(.5 + .5 * cos(a - uTime * .085 - .7), 6.);
        float memory = uMemory * uScatter;
        float alpha = (1.-uSurprise*.70)*(line * (.4 + sunward * 1.35) + bloom + rays + second) * (uSurprise + memory * .13) * uPresence;
        alpha *= smoothstep(.61, .73, r) * (1. - smoothstep(1.015, 1.12, r));
        vec3 color = mix(vec3(1., .13, .39), vec3(1., .75, .64), sunward * .7);
        gl_FragColor = vec4(color, alpha);
      }
    `);
    this.corona = this.add(new THREE.Mesh(geometry, material));
  }

  makeHandLight() {
    const material = this.material(`
      varying vec2 vPoint;
      void main(){vPoint=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position.xy,-.8,1.);}
    `, `
      varying vec2 vPoint;
      void main(){
        float alpha=0.;
        for(int i=0;i<4;i++){
          float age=uTime-uWaves[i].z;
          float r=length(vPoint-uWaves[i].xy);
          float d=r-age*3.8;
          float life=step(0.,age)*(1.-smoothstep(1.,3.2,age));
          alpha+=(exp(-d*d*320.)*.19+exp(-d*d*12.)*.018)*uWaves[i].w*life;
        }
        vec2 p=vPoint-uPointer*vec2(4.6,2.8);
        float r=length(p),a=atan(p.y,p.x);
        float radius=.16+uCharge*.32;
        float halo=exp(-pow((r-radius)*100.,2.));
        float arcs=pow(.5+.5*cos(a*3.-uTime*1.5),6.);
        alpha+=uCharge*uHandPresence*(halo*(.12+arcs*.38)+exp(-r*r*18.)*.035);
        gl_FragColor=vec4(1.,.60,.73,alpha*uPresence);
      }
    `);
    this.handLight=this.add(new THREE.Mesh(new THREE.PlaneGeometry(16,11),material));
  }

  update({ time = 0, dt = 1 / 60, pointer, scatter = 0, intro = 0, mode = 'scatter', fit = 1, transitionAt, memory = 0, field, countdown = 0 } = {}) {
    dt = Math.min(Math.max(dt, 0), .1);
    const u = this.uniforms;
    if (mode !== this.mode) {
      if (this.mode !== null && mode !== 'welcome') {
        this.shockAt = time;
        u.uImpulse.value = mode === 'surprise' ? 1.6 : mode === 'love' ? 1.1 : mode === 'name' ? .85 : .55;
      }
      this.mode = mode;
    }
    // A repeated aggregation of the same digit can have a fresh transition too.
    if (Number.isFinite(transitionAt) && transitionAt !== this.lastTransition) {
      if (this.lastTransition > -50 && mode !== 'welcome' && mode !== 'scatter') this.shockAt = time;
      this.lastTransition = transitionAt;
    }
    u.uTime.value = time;
    if(mode === 'surprise' && this.previousBloomMode !== mode && u.uSurprise.value < .05) this.bloomAt = time;
    this.previousBloomMode = mode;
    u.uBloomAge.value = time - (this.bloomAt ?? time);
    u.uCountdown.value=approach(u.uCountdown.value,['one','two','three'].includes(mode)?1:0,dt,3.5);
    u.uCount.value=approach(u.uCount.value,countdown,dt,3.2);
    if(field){
      u.uCharge.value=field.charge;u.uHandPresence.value=field.presence;
      field.waves.forEach((w,i)=>u.uWaves.value[i].set(w.x,w.y,w.at,w.strength));
    }
    u.uAge.value = time - this.shockAt;
    u.uPresence.value = .30 + (1 - intro) * .70;
    u.uScatter.value = scatter;
    u.uMemory.value = approach(u.uMemory.value, Math.min(1, Math.max(0, memory)), dt, 1.25);
    u.uLove.value = approach(u.uLove.value, mode === 'love' ? 1 : 0, dt, 1.6);
    u.uName.value = approach(u.uName.value, mode === 'name' ? 1 : 0, dt, 1.6);
    u.uSurprise.value = approach(u.uSurprise.value, mode === 'surprise' ? 1 : 0, dt, 1.15);
    if (pointer) u.uPointer.value.set(pointer.x || 0, pointer.y || 0);
    // The unfolded petals have more volume; reserve a margin at every phase.
    this.group.scale.setScalar(Math.max(.05, fit / (1 + u.uLove.value*.04 + u.uSurprise.value*.08)));
    this.group.rotation.y = u.uPointer.value.x * .025;
    this.group.rotation.x = -u.uPointer.value.y * .018;
    this.bloom.visible = u.uSurprise.value + u.uMemory.value * scatter > .002;
    this.handLight.visible = u.uCharge.value > .001 || u.uWaves.value.some(w => time-w.z < 3.3);
    this.corona.visible = u.uSurprise.value + u.uMemory.value * scatter > .002;
    this.shockwaves.visible = u.uAge.value < 3.3;
  }

  setQuality(quality) {
    const low = quality === 'low';
    this.dust.geometry.setDrawRange(0, low ? 310 : 620);
    this.orbits.geometry.setDrawRange(0, low ? this.orbitFullCount * .75 : this.orbitFullCount);
  }

  dispose() {
    this.scene.remove(this.group);
    for (const resource of this.disposables) resource.dispose();
    this.disposables.length = 0;
  }
}
