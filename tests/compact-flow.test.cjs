const test=require("node:test"),assert=require("node:assert/strict"),vm=require("node:vm"),fs=require("node:fs");
function harness(){
 const html=fs.readFileSync("index.html","utf8");
 const js=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
 assert.ok(js,"inline script exists");
 const ids=[...html.matchAll(/id="([^"]+)"/g)].map(m=>m[1]);
 assert.equal(new Set(ids).size,ids.length,"no duplicate IDs");
 const el=Object.fromEntries(ids.map(id=>[id,{
  value:"",textContent:"",style:{},listeners:{},
  setAttribute(){},addEventListener(k,fn){this.listeners[k]=fn},
  classList:{values:new Set(["hide"]),contains(k){return this.values.has(k)},toggle(k,b){if(b===undefined)b=!this.values.has(k);b?this.values.add(k):this.values.delete(k)}}
 }]));
 el.confirm.showModal=()=>{el.confirm.open=true};el.confirm.close=()=>{el.confirm.open=false};
 let now=new Date(2026,10,12,6,45).getTime();
 const sounds={chirps:0,melody:0,notes:0,volume:0};
 class FakeDate extends Date{constructor(...a){super(...(a.length?a:[now]))}static now(){return now}}
 class Audio{
  constructor(){this.state="running";this.currentTime=0;this.destination={}}
  resume(){return Promise.resolve()}
  createGain(){let out={gain:{setValueAtTime(v){if(out.master)sounds.volume=v},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(to){if(to&&!to.connect)out.master=true}};return out}
  createOscillator(){return {frequency:{f:0,setValueAtTime(v){this.f=v},linearRampToValueAtTime(){}},connect(){},start(){sounds.notes++;if(this.frequency.f>1100)sounds.chirps++;if(this.frequency.f<500)sounds.melody++},stop(){},onended:null}}
 }
 const intervals=[];
 const document={hidden:false,getElementById(k){assert.ok(el[k],"missing "+k);return el[k]},addEventListener(){}};
 const window={AudioContext:Audio,addEventListener(){}};
 vm.runInNewContext(js,{window,document,Date:FakeDate,
  setInterval(fn,ms){const x={fn,ms,active:true};intervals.push(x);return x},
  clearInterval(x){if(x)x.active=false},console},{timeout:1800});
 return {
  el,sounds,get now(){return now},
  advance(ms){now+=ms;for(const x of intervals.filter(x=>x.active&&x.ms===250))x.fn()},
  visible(name){return !el[name].classList.contains("hide")},
  async settle(){await Promise.resolve();await Promise.resolve()}
 };
}
test("main menu: live time and two always-clickable scenario buttons",()=>{
 const a=harness();assert.equal(a.el.clockNow.textContent,"06:45");
 assert.equal(a.el.homeMorning.disabled,undefined);
 assert.equal(a.el.homeSimple.disabled,undefined);
 assert.equal(a.el.homeMorning.classList.contains("active"),false);
});
test("current time and past time cannot arm; no false success",async()=>{
 const a=harness();a.el.homeMorning.onclick();
 a.el.timeMorning.value="06:45";await a.el.startMorning.onclick();
 assert.match(a.el.morningError.textContent,/позже/);
 assert.equal(a.visible("morning"),true);
 assert.equal(a.el.homeMorning.classList.contains("active"),false);
});
test("Start returns home, confirms, and retains independently armed modes",async()=>{
 const a=harness();a.el.homeMorning.onclick();a.el.timeMorning.value="07:00";
 await a.el.startMorning.onclick();assert.equal(a.visible("home"),true);
 assert.match(a.el.homeToast.textContent,/установлен/);
 assert.ok(a.el.homeMorning.classList.contains("active"));
 a.el.homeSimple.onclick();a.el.timeSimple.value="07:05";
 await a.el.startSimple.onclick();
 assert.ok(a.el.homeMorning.classList.contains("active"));
 assert.ok(a.el.homeSimple.classList.contains("active"));
});
test("morning: birds start T-3, melody T-1, not only at T",async()=>{
 const a=harness();a.el.homeMorning.onclick();a.el.timeMorning.value="07:00";
 await a.el.startMorning.onclick();
 a.advance(11*60_000);assert.equal(a.sounds.chirps,0);
 a.advance(61_000);assert.ok(a.sounds.chirps>0,"birds at T-3");
 assert.equal(a.sounds.melody,0,"no music at T-3");
 a.advance(61_000);assert.equal(a.sounds.melody,0,"still no music at T-2");
 a.advance(61_000);assert.ok(a.sounds.melody>0,"music at T-1");
 assert.ok(a.sounds.volume>0,"sounds are audible after Start returns home");
});
test("morning countdown reflects actual chosen wake time, not fixed 15 min",async()=>{
 const a=harness();a.el.homeMorning.onclick();a.el.timeMorning.value="06:49";
 a.el.timeMorning.listeners.input();
 assert.equal(a.el.birdsText.textContent,"−3 мин");
 await a.el.startMorning.onclick();
 a.el.homeMorning.onclick(); // confirmation, not settings: don't rely on reopening running setup
 assert.match(a.el.homeMorningTime.textContent,/06:49/);
 assert.ok(!a.el.homeMorningTime.textContent.includes("15 мин"));
});
test("sound test has ringtone selection, volume, and a Back without snooze",async()=>{
 const a=harness();a.el.homeSimple.onclick();await a.el.soundCheck.onclick();
 assert.equal(a.visible("sound"),true);
 a.el.soundChoice.listeners.change({target:{value:"bright"}});
 a.el.volume.listeners.input({target:{value:"30"}});
 assert.equal(a.el.volumeLabel.textContent,"30%");
 a.el.playSound.onclick();await a.settle();
 assert.ok(a.sounds.notes>0);
 a.el.soundBack.onclick();assert.equal(a.visible("simple"),true);
});
test("morning mute disables preparatory sounds, and back/cancel behave differently",async()=>{
 const a=harness();a.el.homeMorning.onclick();a.el.timeMorning.value="07:00";
 await a.el.startMorning.onclick();
 a.el.homeMorning.onclick();a.el.confirmNo.onclick();assert.ok(a.el.homeMorning.classList.contains("active"));
 // The active menu button intentionally asks for cancellation, so this test uses manual preview on a fresh app.
 const b=harness();b.el.homeMorning.onclick();
 await b.el.soundToggle.onclick();assert.equal(b.el.soundToggle.textContent,"Выключены");
 b.el.scrub.listeners.input({target:{value:"800"}});
 const n=b.sounds.notes;b.advance(2_000);assert.equal(b.sounds.notes,n);
 b.el.backMorning.onclick();assert.equal(b.visible("home"),true);
 b.el.homeMorning.onclick();b.el.timeMorning.value="07:00";await b.el.startMorning.onclick();
 b.el.homeMorning.onclick();b.el.confirmYes.onclick();
 assert.equal(b.el.homeMorning.classList.contains("active"),false);
});
test("Snooze returns to same mode with updated future time",async()=>{
 const a=harness();a.el.homeMorning.onclick();a.el.timeMorning.value="07:00";
 await a.el.startMorning.onclick();a.advance(15*60_000);await a.settle();
 assert.equal(a.visible("ring"),true);
 a.el.snooze.onclick();
 assert.equal(a.visible("morning"),true);
 assert.equal(a.el.timeMorning.value,"07:05");
});
