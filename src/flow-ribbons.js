import * as THREE from 'three';
import { ribbonPoint } from './shapes.js';
import { fieldGLSL } from './interaction.js';

// Shared deformation keeps the silk's woven structure aligned with its grains.
export const orbitalGLSL = /* glsl */`
vec3 orbitalFlow(vec3 p,float time,float scatter,vec2 pointer,float memory){
  float orbit=time*.085*scatter;
  vec2 q=vec2(p.x,p.y/.61);
  q=mat2(cos(orbit),-sin(orbit),sin(orbit),cos(orbit))*q;
  p.xy=vec2(q.x,q.y*.61);
  float turn=(sin(time*.095)*.32+pointer.x*.16)*scatter;
  p.xz=mat2(cos(turn),-sin(turn),sin(turn),cos(turn))*p.xz;
  p.z+=sin(length(p.xy)*2.1-time*1.9+p.z*.7)*.22*scatter;
  p.xy*=1.+sin(atan(p.y/.61,p.x)*3.-time*.27)*.035*scatter;
  float a=atan(p.y*1.7,p.x);
  p.xy*=1.+sin(a*5.+time*.13)*memory*scatter*.045;
  p.z+=sin(a*3.-time*.17)*memory*scatter*.24;
  return p;
}
`;

export function createFlowRibbons(uniforms) {
  const positions=[],coordinates=[];
  const segments=240;
  // Interleave arms first so reduced draw ranges still retain the whole sculpture.
  for(let strand=0;strand<21;strand+=2)for(let arm=0;arm<3;arm++)for(let i=0;i<segments;i++)for(let end=0;end<2;end++) {
    const t=(i+end)/segments;
    positions.push(...ribbonPoint(arm,strand,t));
    coordinates.push(t,strand/20,arm/3);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('aCoord',new THREE.Float32BufferAttribute(coordinates,3));
  const material=new THREE.ShaderMaterial({uniforms,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    vertexShader:/* glsl */`
      attribute vec3 aCoord;
      uniform float uTime,uScatter,uMemory,uPresence,uLoveWeave;
      uniform vec2 uPointer,uVelocity;
      ${fieldGLSL}
      ${orbitalGLSL}
      varying vec3 vCoord; varying float vLight;
      void main(){
        vCoord=aCoord;
        vec3 p=orbitalFlow(position,uTime,uScatter,uPointer,uMemory);
        vec2 d=p.xy-uPointer*vec2(4.6,2.8);
        float influence=exp(-dot(d,d)*.32);
        p.xy+=uVelocity*influence*.215-d*influence*uCharge*.116;
        p.z+=influence*length(uVelocity)*.15;
        float wave=fieldWave(p.xy,uTime);
        p.z+=wave*.43;p.xy+=normalize(d+.0001)*wave*.118;
        p.xy+=uPointer*.76;
        float a=aCoord.x*6.2831853;
        float r=.30+aCoord.y*.70;
        vec3 heart=vec3((sin(a)*sin(a)*sin(a))*1.647*r-.3,
          (13.*cos(a)-5.*cos(2.*a)-2.*cos(3.*a)-cos(4.*a))/17.*1.75*r+.28,
          sin(r*3.14159)*.38*(aCoord.z<.5?1.:-1.));
        float beat=exp(-pow(sin(uTime*1.65),2.)*48.)*.035+exp(-pow(sin(uTime*1.65-.34),2.)*68.)*.018;
        heart*=1.+beat;
        heart.xy+=uPointer*.28;
        p=mix(p,heart,uLoveWeave);
        vLight=abs(wave)+influence*uCharge*.4;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);
      }
    `,
    fragmentShader:/* glsl */`
      precision highp float;
      uniform float uTime,uScatter,uPresence,uLoveWeave;
      varying vec3 vCoord; varying float vLight;
      void main(){
        float travel=pow(.5+.5*cos(vCoord.x*9.-uTime*.7+vCoord.z*6.28),22.);
        float edge=pow(abs(vCoord.y*2.-1.),3.);
        float ends=smoothstep(0.,.07,vCoord.x)*(1.-smoothstep(.90,1.,vCoord.x));
        float alpha=(.018+edge*.03+travel*.21+vLight*.12)*ends*max(uScatter,uLoveWeave*.48)*uPresence;
        vec3 color=mix(vec3(.94,.14,.40),vec3(1.,.75,.72),travel*.85+edge*.10);
        gl_FragColor=vec4(color,alpha);
      }
    `,
  });
  const ribbons=new THREE.LineSegments(geometry,material);
  ribbons.frustumCulled=false;
  return ribbons;
}
