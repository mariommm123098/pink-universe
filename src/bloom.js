import * as THREE from 'three';
import { fieldGLSL } from './interaction.js';

/** Eighteen individually unfurling glass petals, batched into one surface. */
export function createBloom(uniforms) {
  const positions = [], uv = [], petals = [], indices = [];
  const columns = 18, rows = 48, count = 18;
  for (let petal = 0; petal < count; petal++) {
    const base = positions.length / 3;
    for (let y = 0; y <= rows; y++) for (let x = 0; x <= columns; x++) {
      positions.push(0, 0, 0); uv.push(x / columns, y / rows); petals.push(petal);
    }
    for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
      const i = base + y * (columns + 1) + x;
      indices.push(i, i + 1, i + columns + 1, i + 1, i + columns + 2, i + columns + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setAttribute('aPetal', new THREE.Float32BufferAttribute(petals, 1));
  geometry.setIndex(indices);
  const material = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      attribute float aPetal;
      uniform float uTime,uSurprise,uBloomAge,uName,uMemory,uScatter,uPresence;
      uniform vec2 uPointer;
      ${fieldGLSL}
      varying vec2 vUv;
      varying vec3 vView,vWorld;
      varying float vOpen,vLayer,vPetal;
      const float PI=3.14159265359;
      void main(){
        vUv=uv; vLayer=step(9.,aPetal); vPetal=aPetal;
        float id=mod(aPetal,9.);
        float unfold=smoothstep(.45+id*.065+vLayer*.6,2.85+id*.065+vLayer*.6,uBloomAge);
        float open=uSurprise*unfold;
        // Preserve a faint, slowly breathing memory on the next open palm.
        float memory=uMemory*uScatter*.15;
        vOpen=max(open,memory);
        float t=uv.y, across=uv.x*2.-1.;
        float angle=id*6.2831853/9.+vLayer*.36-.22+sin(uTime*.085)*.035;
        float lengthwise=sin(t*PI*.5);
        float root=3.04+vLayer*.36;
        float radius=root+lengthwise*(2.9-vLayer*.36)*(.52+vOpen*.48);
        // Curved, offset tips form a spiral flower, rather than a flat radial badge.
        float taper=pow(max(0.,sin(t*PI)),.72);
        float width=taper*(1.18+vLayer*.16)*(.4+vOpen*.6);
        float bend=.34*sin(t*PI)+t*t*.45*(1.-vLayer*.4);
        float a=angle+bend+across*width/max(radius,.1);
        vec3 p=vec3(cos(a)*radius,sin(a)*radius*.79,-2.1-vLayer*.62);
        p.z+=sin(t*PI)*(.45+vOpen*.9)+across*across*taper*.65;
        p.z+=sin(t*PI*1.5+id*.7+uTime*.19)*.12*taper;
        p.z+=(1.-vOpen)*lengthwise*1.25;
        float wave=fieldWave(p.xy,uTime);
        p.z+=wave*.23+sin(a*3.+uTime*.35)*.055;
        p.xy+=uPointer*(.09+lengthwise*.12);
        vWorld=p;
        vec4 mv=modelViewMatrix*vec4(p,1.);vView=-mv.xyz;
        gl_Position=projectionMatrix*mv;
      }
    `,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform float uTime,uPresence;
      ${fieldGLSL}
      varying vec2 vUv;
      varying vec3 vView,vWorld;
      varying float vOpen,vLayer,vPetal;
      void main(){
        vec3 n=normalize(cross(dFdx(vView),dFdy(vView)));
        vec3 eye=normalize(vView);
        float fresnel=pow(1.-abs(dot(n,eye)),2.1);
        float x=abs(vUv.x*2.-1.);
        float edge=pow(x,26.);
        float tip=pow(vUv.y,18.);
        float veins=pow(.5+.5*cos(vUv.x*66.+sin(vUv.y*5.+vPetal)*2.4),28.);
        float ridge=exp(-pow((vUv.x-.5)*32.,2.));
        float interference=.5+.5*sin(fresnel*10.+vUv.y*4.-uTime*.11+vLayer*.7);
        vec3 rose=mix(vec3(.65,.035,.24),vec3(1.,.36,.59),interference);
        rose=mix(rose,vec3(1.,.82,.70),fresnel*.62+edge*.40);
        float opal=pow(max(0.,dot(n,normalize(vec3(-.6,.8,.8)))),12.);
        rose=mix(rose,vec3(.63,.79,1.),opal*.20);
        float sweep=pow(.5+.5*sin(vUv.y*4.-uTime*.24+vPetal*.73),14.);
        float wave=abs(fieldWave(vWorld.xy,uTime));
        float alpha=.022+fresnel*.24+edge*.23+tip*.10+veins*(.018+fresnel*.15)+ridge*.012;
        alpha*=.9+sweep*.9+opal*.7+wave*2.8;
        // Clear the entire text field; the flower is a dimensional surround.
        float aperture=smoothstep(.91,1.14,length(vWorld.xy/vec2(4.45,2.85)));
        alpha*=aperture*smoothstep(0.,.14,vUv.y)*vOpen*uPresence;
        gl_FragColor=vec4(rose,alpha);
      }
    `,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  return mesh;
}
