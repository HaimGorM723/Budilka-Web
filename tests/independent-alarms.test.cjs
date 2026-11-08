const test=require("node:test");
const assert=require("node:assert/strict");
const vm=require("node:vm");
const fs=require("node:fs");
function app(){
 const html=fs.readFileSync("index.html","utf8"),script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
 assert.ok(script);
 const names=[...html.matchAll(/id="([^"]+)"/g)].map(m=>m[1]);
 assert.equal(new Set(names).size,names.length);
 let now=new Date(2026,10,8,6,50).getTime(),gain=0,sounds=0,stops=0;
 const els=Object.fromEntries(names.map(id=>[id,{value:"",textContent:"",disabled:false,style:{},attrs:{},listeners:{},
  addEventListener(k,f){this.listeners[k]=f},setAttribute(k,v){this.attrs[k]=v},
  classList:{values:new Set(["hide"]),toggle(k,v){(v===undefined?!this.values.has(k):v)?this.values.add(k):this.values.delete(k)},contains(k){return this.values.has(k)}}
 }]));
 els.confirm.showModal=()=>els.confirm.open=true;
 els.confirm.close=()=>els.confirm.open=false;
 class DateMock extends Date{constructor(...a){super(...(a.length?a:[now]))}static now(){return now}}
 class AudioContext{
  constructor(){this.state="running";this.currentTime=0;this.destination={}}
  resume(){return Promise.resolve()}
  createGain(){const out={gain:{
   setValueAtTime(v){if(out.isMaster)gain=v},
   linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},
   connect(target){if(target && !target.connect)out.isMaster=true}
  };return out}
  createOscillator(){return {frequency:{setValueAtTime(){}},connect(){},start(){sounds++},stop(){stops++},onended:null}}
 }
 const ticks=[],doc={getElementById(id){assert.ok(els[id],"Missing "+id);return els[id]},hidden:false,addEventListener(){}};
 const win={AudioContext,addEventListener(){}};
 vm.runInNewContext(script,{document:doc,window:win,Date:DateMock,
   setInterval(fn,ms){const h={fn,ms,alive:true};ticks.push(h);return h},
   clearInterval(h){if(h)h.alive=false},console}, {timeout:1200});
 return {els,get gain(){return gain},get sounds(){return sounds},get stops(){return stops},
  visible(id){return !els[id].classList.contains("hide")},
  advance(ms){now+=ms;for(const t of ticks.filter(x=>x.alive&&x.ms===300))t.fn()},
  async flush(){await Promise.resolve();await Promise.resolve()}
 };
}
test("independent scenarios: each can be armed, back preserves and highlights it",async()=>{
 const a=app();
 a.els.chooseMorning.onclick();assert.ok(a.visible("morning"));
 a.els.timeMorning.value="07:00";await a.els.startMorning.onclick();
 assert.match(a.els.statusMorning.textContent,/07:00/);
 a.els.backMorning.onclick();assert.ok(a.visible("home"));
 assert.ok(a.els.chooseMorning.classList.contains("chosen"));
 a.els.chooseSimple.onclick();
 a.els.timeSimple.value="07:05";await a.els.startSimple.onclick();
 a.els.backSimple.onclick();
 assert.ok(a.els.chooseSimple.classList.contains("chosen"));
 assert.ok(a.els.chooseMorning.classList.contains("chosen"));
});
test("reselect active mode: No keeps, Yes cancels only that mode",async()=>{
 const a=app();
 a.els.chooseMorning.onclick();a.els.timeMorning.value="07:00";await a.els.startMorning.onclick();a.els.backMorning.onclick();
 a.els.chooseSimple.onclick();a.els.timeSimple.value="07:05";await a.els.startSimple.onclick();a.els.backSimple.onclick();
 a.els.chooseMorning.onclick();assert.equal(a.els.confirm.open,true);
 a.els.confirmNo.onclick();assert.ok(a.els.chooseMorning.classList.contains("chosen"));
 a.els.chooseMorning.onclick();a.els.confirmYes.onclick();
 assert.equal(a.els.chooseMorning.classList.contains("chosen"),false);
 assert.equal(a.els.chooseSimple.classList.contains("chosen"),true);
});
test("cancel active scenario and back have different meanings",async()=>{
 const a=app();
 a.els.chooseSimple.onclick();a.els.timeSimple.value="07:00";await a.els.startSimple.onclick();
 a.els.backSimple.onclick();assert.ok(a.els.chooseSimple.classList.contains("chosen"));
 a.els.chooseSimple.onclick();a.els.confirmYes.onclick();
 assert.equal(a.els.chooseSimple.classList.contains("chosen"),false);
});
test("morning: birds at T-3, music at T-1, no sound while muted",async()=>{
 const a=app();
 a.els.chooseMorning.onclick();a.els.timeMorning.value="07:05";await a.els.startMorning.onclick();
 assert.equal(a.els.audioButton.textContent,"Включены");
 a.advance(12*60_000);let prior=a.sounds;a.advance(2_000);
 assert.ok(a.sounds>prior,"birds present before T-3");
 const first=a.sounds;
 await a.els.audioButton.onclick();assert.equal(a.els.audioButton.textContent,"Выключены");
 a.advance(61_000);assert.equal(a.sounds,first,"muted timeline remains silent");
 await a.els.audioButton.onclick();assert.equal(a.els.audioButton.textContent,"Включены");
 a.advance(60_000);assert.ok(a.sounds>first,"birds and music return");
});
test("morning snooze: returns to morning and birds sound during 5 minutes",async()=>{
 const a=app();
 a.els.chooseMorning.onclick();a.els.timeMorning.value="07:00";await a.els.startMorning.onclick();
 a.advance(10*60_000);await a.flush();
 assert.ok(a.visible("ring"));
 a.els.snooze.onclick();await a.flush();
 assert.ok(a.visible("morning"));
 assert.match(a.els.statusMorning.textContent,/07:05/);
 let n=a.sounds;a.advance(2_100);
 assert.ok(a.sounds>n,"birds start during Snooze");
});
test("user can choose time only in the relevant scenario",()=>{
 const a=app();
 assert.equal(a.els.clockNow.textContent,"06:50");
 assert.ok(a.els.timeMorning);
 assert.ok(a.els.timeSimple);
 assert.equal(a.els.wake,undefined);
});

test("menu: both scenario buttons are always enabled and dark until START",async()=>{
 const a=app();
 assert.equal(a.els.chooseMorning.disabled,false);
 assert.equal(a.els.chooseSimple.disabled,false);
 assert.equal(a.els.chooseMorning.classList.contains("chosen"),false);
 assert.equal(a.els.chooseSimple.classList.contains("chosen"),false);
 a.els.chooseMorning.onclick();
 assert.ok(a.visible("morning"));
 assert.equal(a.els.chooseMorning.classList.contains("chosen"),false);
 a.els.timeMorning.value="07:00";
 await a.els.startMorning.onclick();
 assert.equal(a.els.chooseMorning.classList.contains("chosen"),true);
 a.els.backMorning.onclick();
 assert.equal(a.els.chooseMorning.classList.contains("chosen"),true);
});
test("invalid or past wake time never arms the alarm",async()=>{
 const a=app();
 a.els.chooseSimple.onclick();
 a.els.timeSimple.value="06:45";
 await a.els.startSimple.onclick();
 assert.equal(a.els.chooseSimple.classList.contains("chosen"),false);
 assert.match(a.els.errorSimple.textContent,/позже/);
 a.els.timeSimple.value="07:00";
 await a.els.startSimple.onclick();
 assert.equal(a.els.chooseSimple.classList.contains("chosen"),true);
});
test("snoozed morning keeps two independently scheduled alarms",async()=>{
 const a=app();
 a.els.chooseMorning.onclick();
 a.els.timeMorning.value="07:00";await a.els.startMorning.onclick();
 a.els.backMorning.onclick();
 a.els.chooseSimple.onclick();a.els.timeSimple.value="07:08";await a.els.startSimple.onclick();
 a.els.backSimple.onclick();
 a.advance(10*60_000);await a.flush();
 assert.ok(a.visible("ring"));
 a.els.snooze.onclick();await a.flush();
 assert.ok(a.els.chooseMorning.classList.contains("chosen"));
 assert.ok(a.els.chooseSimple.classList.contains("chosen"));
 let n=a.sounds;
 a.advance(2_000);
 assert.ok(a.sounds>n,"Birds sound after snooze");
});
