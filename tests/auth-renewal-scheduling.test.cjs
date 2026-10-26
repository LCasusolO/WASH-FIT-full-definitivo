const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
async function fixture(random=.5){
 let clock=1800000000000,next=0,callback,calls=0,fail=false;const timers=new Map(),events={},navigator={onLine:true};
 const user={id:'fixture-user'},session=()=>({user,expires_at:(clock+3600000)/1000});
 const auth={onAuthStateChange:cb=>{callback=cb;},stopAutoRefresh(){},startAutoRefresh(){},refreshSession:async()=>{calls++;if(fail)return{error:Error('429')};const s=session();callback('TOKEN_REFRESHED',s);return{data:{session:s}};}};
 const root={WashSupabase:{createClient:()=>({auth})}},math=Object.create(Math);math.random=()=>random;
 const context=vm.createContext({window:root,navigator,Math:math,Date:class extends Date{static now(){return clock;}},localStorage:{setItem(){},removeItem(){}},fetch:async()=>Response.json({enabled:true,url:'https://fixture.invalid',key:'public'}),addEventListener:(name,fn)=>events[name]=fn,setTimeout:(fn,ms)=>{timers.set(++next,{fn,ms});return next;},clearTimeout:id=>timers.delete(id)});
 vm.runInContext(fs.readFileSync('js/platform-client.js','utf8'),context);await root.WashPlatform.ready;
 return{timers,events,navigator,session,emit:(event,s)=>callback(event,s),calls:()=>calls,fail:v=>fail=v,run:async()=>{const [id,t]=[...timers][0];timers.delete(id);clock+=t.ms;await t.fn();},now:()=>clock};
}
test('renovación anticipada se reparte, respeta el estado offline y se cancela al salir',async()=>{
 const f=await fixture();f.emit('SIGNED_IN',f.session());assert.equal(f.timers.size,1);assert.equal([...f.timers.values()][0].ms,3330000);
 await f.run();assert.equal(f.calls(),1);assert.equal(f.timers.size,1,'el evento de renovación programa una sola espera nueva');
 f.navigator.onLine=false;f.events.offline();assert.equal(f.timers.size,0);f.navigator.onLine=true;f.events.online();assert.equal(f.timers.size,1);f.emit('SIGNED_OUT',null);assert.equal(f.timers.size,0);
});
test('sesiones con el mismo vencimiento no se renuevan todas en el mismo instante',async()=>{
 const waits=[];for(const random of [0,.25,.5,.75,.999]){const f=await fixture(random);f.emit('TOKEN_REFRESHED',{user:{id:'fixture-user'},expires_at:(f.now()+370000)/1000});waits.push([...f.timers.values()][0].ms);}
 assert.deepEqual(waits,[0,62500,125000,187500,249750]);
});
test('un fallo temporal de Auth aplica espera; salir cancela el reintento',async()=>{
 const f=await fixture();f.emit('SIGNED_IN',f.session());f.fail(true);await f.run();assert.equal(f.calls(),1);assert.equal(f.timers.size,1);assert.equal([...f.timers.values()][0].ms,120000);
 await f.run();assert.equal(f.calls(),2);assert.equal([...f.timers.values()][0].ms,240000);f.emit('SIGNED_OUT',null);assert.equal(f.timers.size,0);
});
