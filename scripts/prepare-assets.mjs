import { cp, mkdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
const root=fileURLToPath(new URL('../',import.meta.url));
await mkdir(root+'public/mediapipe/wasm',{recursive:true});
await cp(root+'node_modules/@mediapipe/tasks-vision/wasm',root+'public/mediapipe/wasm',{recursive:true});
for(const file of ['public/models/hand_landmarker.task','public/fonts/NotoSansCJKsc-Bold.woff2']){
  try{const s=await stat(root+file);if(s.size<1000)throw Error();}
  catch{throw new Error(`Missing bundled asset: ${file}. Restore the public directory from the complete project.`);}
}
await build({ configFile: false, publicDir: false, logLevel: 'warn', build: { target: 'es2022', lib: { entry: root+'src/tracking.worker.js', formats: ['iife'], name: 'HandTracking', fileName: () => 'hand-tracking.worker.js' }, outDir: root+'public', emptyOutDir: false, minify: true, sourcemap: false } });
console.log('Local hand model, classic inference worker, WASM runtime and Chinese fonts are ready.');
