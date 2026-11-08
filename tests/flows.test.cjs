/* Browser logic smoke tests. No external dependencies. Run: node --test tests/flows.test.cjs */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function harness(start) {
  const html = fs.readFileSync('index.html','utf8');
  const js = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(js, 'Inline application script exists');
  const ids = [...html.matchAll(/id="([^"]+)"/g)].map(m=>m[1]);
  const makeEl = id => ({
    id, value: id==='wake' ? '07:00' : '0', textContent:'', style:{},
    classList: {items:new Set(['hide']),
      contains(name){return this.items.has(name)},
      toggle(name,force){(force===undefined?!this.items.has(name):force)?this.items.add(name):this.items.delete(name)}
    },
    addEventListener(event,listener){this.listeners[event]=listener}, listeners:{},
  });
  const el = Object.fromEntries(ids.map(id=>[id,makeEl(id)]));
  let now = start;
  const jobs = [];
  const RealDate=Date;
  class FakeDate extends RealDate {
    constructor(...args) {super(...(args.length?args:[now]))}
    static now(){return now}
  }
  const settings=new Map();
  const storage={getItem:k=>settings.get(k)||null,setItem:(k,v)=>settings.set(k,v)};
  const document={
    getElementById: id=>{assert.ok(el[id], 'Known ID '+id); return el[id]},
    querySelectorAll:()=>[],addEventListener(){},hidden:false,
  };
  class Audio {
    constructor(){this.state='running';this.currentTime=0;this.destination={}}
    async resume(){}
    createGain(){return {gain:{value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}}}
    createOscillator(){return {type:'sine',frequency:{value:0},connect(){},start(){},stop(){}}}
  }
  const setInterval=(fn,delay)=>{const job={fn,delay,active:true};jobs.push(job);return job};
  const clearInterval=job=>{if(job)job.active=false};
  const window={AudioContext:Audio,addEventListener(){}};
  vm.runInNewContext(js,{
    document,window,localStorage:storage,Date:FakeDate,
    AudioContext:Audio,setInterval,clearInterval,setTimeout:fn=>fn(),
    console
  },{timeout:1000});
  return {
    el,
    screen:name=>!el[name].classList.contains('hide'),
    advance(ms){now+=ms;jobs.filter(job=>job.active).forEach(job=>job.fn())},
    setTime(iso){now=new RealDate(iso).getTime()},
  };
}
test('simple: scheduled ringing, +5 minutes, second ringing, dismiss',async()=>{
  const h=harness(new Date(2026,10,8,6,56).getTime());
  h.el.wake.value='07:00';
  await h.el.chooseSimple.onclick();
  assert.equal(h.screen('simple'),true);
  assert.match(h.el.simpleStatus.textContent,/4 мин/);
  h.advance(4*60_000);
  assert.equal(h.screen('ring'),true);
  h.el.snooze.onclick();
  assert.equal(h.screen('home'),true);
  assert.match(h.el.selection.textContent,/07:05/);
  assert.equal(h.el.wake.value,'07:05');
  h.advance(5*60_000+200);
  assert.equal(h.screen('ring'),true);
  h.el.awake.onclick();
  assert.equal(h.screen('home'),true);
  assert.equal(h.el.homeCancel.classList.contains('hide'),true);
});
test('morning: visual timeline follows chosen time and rings',async()=>{
 const h=harness(new Date(2026,10,8,6,50).getTime());
 h.el.wake.value='07:05';
 await h.el.chooseMorning.onclick();
 assert.equal(h.screen('morning'),true);
 assert.match(h.el.morningHint.textContent,/07:05/);
 assert.equal(h.el.birdsStatus.textContent,'−5 мин');
 h.advance(10*60_000);
 assert.equal(h.el.birdsStatus.textContent,'Активно');
 h.advance(4*60_000);
 assert.equal(h.el.musicStatus.textContent,'Активно');
 h.advance(60_000+200);
 assert.equal(h.screen('ring'),true);
 assert.match(h.el.ringNote.textContent,/Рождение утра/);
});
test('cancel: a scheduled ring never opens ringing screen',async()=>{
 const h=harness(new Date(2026,10,8,6,50).getTime());
 h.el.wake.value='07:00';
 await h.el.chooseSimple.onclick();
 h.el.simpleCancel.onclick();
 h.advance(11*60_000);
 assert.equal(h.screen('ring'),false);
 assert.match(h.el.simpleStatus.textContent,/отменён/);
});
test('manual scrub does not reschedule a real alarm',async()=>{
 const h=harness(new Date(2026,10,8,6,50).getTime());
 h.el.wake.value='07:00';
 await h.el.chooseMorning.onclick();
 h.el.slider.value='899';
 h.el.slider.listeners.input({target:h.el.slider});
 assert.equal(h.el.remaining.textContent,'До звонка: 1 мин');
 h.advance(10*60_000);
 assert.equal(h.screen('ring'),true);
});
