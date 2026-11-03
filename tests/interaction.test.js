import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InteractionField } from '../src/interaction.js';

function driver(field) {
  let time=0;
  return (seconds, values={}) => {
    const releases=[];
    for(let i=0;i<Math.ceil(seconds*60);i++){
      time+=1/60;
      const wave=field.update({dt:1/60,time,speed:0,x:.2,y:-.3,active:true,...values});
      if(wave)releases.push({...wave});
    }
    return releases;
  };
}

test('holding gathers light; movement releases it once with a bounded lifetime',()=>{
  const field=new InteractionField(),advance=driver(field);
  assert.equal(advance(3.5).length,0);
  assert.ok(field.charge>.9);
  const waves=advance(.3,{speed:1.8});
  assert.equal(waves.length,1);
  assert.ok(waves[0].strength>.9);
  assert.equal(waves[0].x,.2*4.6);
  assert.equal(advance(3,{speed:1.8}).length,0,'continuous motion cannot emit a repeated release');
  assert.ok(field.charge<.01);
});

test('tracking loss and a distant reacquired hand do not synthesize a release',()=>{
  const field=new InteractionField(),advance=driver(field);
  advance(4);
  assert.ok(field.charge>.9);
  assert.equal(advance(.2,{active:false,speed:4}).length,0);
  assert.equal(advance(.45,{x:-1,y:1,speed:5}).length,0);
  assert.equal(field.serial,0);
  advance(4);
  assert.equal(advance(.1,{speed:2}).length,1,'a fresh intentional dwell still works');
});

test('brief pauses, malformed input and absence never accumulate a charged field',()=>{
  for(const values of [{active:false},{x:NaN},{y:Infinity}]){
    const field=new InteractionField(),advance=driver(field);
    advance(8,values);assert.equal(field.serial,0);assert.equal(field.charge,0);
  }
  const field=new InteractionField(),advance=driver(field);
  for(let i=0;i<40;i++){advance(.15);advance(.3,{speed:.5});}
  assert.ok(field.charge<.01);
});

test('the ripple pool stays bounded through repeated interaction',()=>{
  const field=new InteractionField(),advance=driver(field);
  const waves=field.waves.slice();
  for(let i=0;i<12;i++){advance(3.5);advance(.15,{speed:1.4});}
  assert.equal(field.serial,12);
  assert.equal(field.waves.length,4);
  assert.ok(field.waves.every((w,i)=>w===waves[i]&&Object.values(w).every(Number.isFinite)));
});
