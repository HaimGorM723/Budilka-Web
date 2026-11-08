const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");

function makeApp() {
  const html=fs.readFileSync("index.html","utf8");
  const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script,"app script must exist");
  const ids=[...html.matchAll(/id="([^"]+)"/g)].map(m=>m[1]);
  const el=Object.fromEntries(ids.map(id=>[id,{
    value:"",textContent:"",disabled:false,style:{},listeners:{},
    setAttribute(k,v){this[k]=v},
    addEventListener(k,fn){this.listeners[k]=fn},
    classList:{
      values:new Set(["hide"]),
      contains(n){return this.values.has(n)},
      toggle(n,flag){(flag===undefined?!this.values.has(n):flag)?this.values.add(n):this.values.delete(n)}
    }
  }]));
  let now = new Date(2026,10,8,6,56,0).getTime();
  class TestDate extends Date{
    constructor(...args){super(...(args.length?args:[now]))}
    static now(){return now}
  }
  const sounds={master:0,notes:0,stopped:0};
  class AudioContext {
    constructor(){this.state="running";this.currentTime=0;this.destination={}}
    resume(){return Promise.resolve()}
    createGain(){
      const gain={
        setValueAtTime(v){if(this.isMaster)sounds.master=v},
        linearRampToValueAtTime(){},
        exponentialRampToValueAtTime(){}
      };
      const item={gain,connect(dest){if(dest && !dest.connect) gain.isMaster=true}};
      return item;
    }
    createOscillator(){
      return {
        frequency:{setValueAtTime(){},linearRampToValueAtTime(){}},
        connect(){},start(){sounds.notes++},stop(){sounds.stopped++},onended:null
      }
    }
  }
  const intervals=[];
  const document={
    hidden:false,
    getElementById(id){assert.ok(el[id], "Missing #"+id);return el[id]},
    querySelectorAll(){return [{set onclick(fn){this.handler=fn}}]},
    addEventListener(){}
  };
  const context={
    document,window:{AudioContext,addEventListener(){}},Date:TestDate,
    console,
    setInterval(fn,ms){const j={fn,ms,on:true};intervals.push(j);return j},
    clearInterval(job){if(job)job.on=false}
  };
  vm.runInNewContext(script,context,{timeout:1500});
  const run=()=>intervals.filter(x=>x.on).forEach(x=>x.fn());
  return {
    el,sounds,
    visible(name){return !el[name].classList.contains("hide")},
    advance(ms){now+=ms;run()},
    select(t){el.wake.value=t;el.wake.listeners.input()},
    now(){return now}
  };
}
test("time must be in the future before either mode is enabled",()=>{
  const a=makeApp();
  assert.equal(a.el.chooseSimple.disabled,true);
  assert.equal(a.el.chooseMorning.disabled,true);
  a.select("06:55");
  assert.equal(a.el.chooseMorning.disabled,true);
  a.select("07:00");
  assert.equal(a.el.chooseMorning.disabled,false);
  assert.equal(a.el.chooseSimple.disabled,false);
});
test("simple timer rings then snooze updates time and rings again",async()=>{
  const a=makeApp();
  a.select("07:00");
  await a.el.chooseSimple.onclick();
  assert.equal(a.visible("simple"),true);
  assert.match(a.el.simpleStatus.textContent,/4 мин/);
  a.advance(4*60_000);
  assert.equal(a.visible("ring"),true);
  assert.ok(a.sounds.notes>0);
  a.el.snooze.onclick();
  assert.equal(a.visible("simple"),true);
  assert.equal(a.el.simpleWake.textContent,"07:05");
  assert.match(a.el.simpleStatus.textContent,/5 мин/);
  a.advance(5*60_000+500);
  assert.equal(a.visible("ring"),true);
  a.el.awake.onclick();
  assert.equal(a.visible("home"),true);
});
test("morning default audio and mute are strict, back cancels the alarm",async()=>{
  const a=makeApp();
  a.select("07:15");
  await a.el.chooseMorning.onclick();
  assert.equal(a.visible("morning"),true);
  assert.equal(a.el.audioButton.textContent,"Включены");
  a.el.audioButton.onclick();
  assert.equal(a.el.audioButton.textContent,"Выключены");
  assert.equal(a.sounds.master,0);
  await a.el.audioButton.onclick();
  assert.equal(a.el.audioButton.textContent,"Включены");
  assert.equal(a.sounds.master,.5);
  a.el.morningCancel.onclick();
  assert.equal(a.visible("home"),true);
  assert.equal(a.sounds.master,0);
  a.advance(20*60_000);
  assert.equal(a.visible("ring"),false);
});
test("back arrow cancels; selecting second mode replaces previous mode",async()=>{
  const a=makeApp();
  a.select("07:15");
  await a.el.chooseMorning.onclick();
  a.el.morningCancel.onclick();
  assert.equal(a.visible("home"),true);
  a.select("07:00");
  await a.el.chooseSimple.onclick();
  assert.equal(a.visible("simple"),true);
  a.advance(4*60_000);
  assert.equal(a.visible("ring"),true);
});
test("manual preview moves stages; cannot silently arm alarm",async()=>{
  const a=makeApp();
  await a.el.openTester.onclick();
  assert.equal(a.visible("morning"),true);
  a.el.slider.listeners.input({target:{value:"600"}});
  assert.equal(a.el.birdsStatus.textContent,"Активно");
  assert.equal(a.el.musicStatus.textContent,"−1 мин");
  a.el.slider.listeners.input({target:{value:"840"}});
  assert.equal(a.el.musicStatus.textContent,"Активно");
  a.advance(20*60_000);
  assert.equal(a.visible("ring"),false);
});
