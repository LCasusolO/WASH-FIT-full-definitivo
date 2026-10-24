const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const Storage=require('../js/storage'),{indexedDB}=require('fake-indexeddb');

test('lecturas limitadas respetan el máximo y el orden al paginar historiales',async()=>{
 const ranges=[],orders=[],all=Array.from({length:900},(_,id)=>({id}));const query={select(){return this;},eq(){return this;},order(key,options){orders.push({key,...options});return this;},async range(start,end){ranges.push([start,end]);return{data:all.slice(start,end+1),error:null};}};
 const root={WashSupabase:{createClient:()=>({from:()=>query,auth:{getSession:async()=>({data:{session:{user:{id:'qa'},access_token:'fixture'}}}),onAuthStateChange(){}}})}};
 const context=vm.createContext({window:root,navigator:{},localStorage:{setItem(){}},crypto:{randomUUID:()=>''},addEventListener(){},fetch:async()=>Response.json({enabled:true,url:'fixture',key:'public'})});vm.runInContext(fs.readFileSync('js/platform-client.js','utf8'),context);await root.WashPlatform.ready;const rows=await root.WashPlatform.rows('events',{},'*',{limit:750,ascending:false});assert.equal(rows.length,750);assert.deepEqual(ranges,[[0,499],[500,749]]);assert.equal(orders[0].ascending,false);
});
function environment(){
 const values=new Map(),navigator={onLine:true},authEvents=[],events={};let calls=0,user={id:'offline-user-'+Math.random()},options;
 const storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 function open(){
  const client={auth:{getSession:async()=>{calls++;if(!navigator.onLine)throw Error('La renovación requiere red');return{data:{session:{user,access_token:'online-only-token'}}};},onAuthStateChange:fn=>{authEvents.push(fn);return{data:{subscription:{}}};},stopAutoRefresh(){},startAutoRefresh(){} }};
  const root={WashStorage:Storage,WashSupabase:{createClient:(url,key,cfg)=>{options=cfg;return client;}}};
  const context=vm.createContext({window:root,navigator,indexedDB,localStorage:storage,crypto:{randomUUID:()=>''},addEventListener:(name,fn)=>events[name]=fn,fetch:async()=>{if(!navigator.onLine)throw Error('offline');return{ok:true,json:async()=>({enabled:true,url:'https://fixture.invalid',key:'public-fixture'})};}});
  vm.runInContext(fs.readFileSync('js/platform-client.js','utf8'),context);return root.WashPlatform;
 }
 return {open,navigator,values,authEvents,setUser(value){user=value;},get options(){return options;},get calls(){return calls;}};
}

test('sesión offline no renueva tokens ni convierte la identidad local en autorización de servidor',async()=>{
 const env=environment(),online=env.open();const session=await online.session();await online.rememberOfflineEvaluation(session.user.id,{id:'evaluation-one',name:'Evaluación inicial',facilityName:'Centro uno'});
 env.navigator.onLine=false;const reopened=env.open();await reopened.ready;const count=env.calls,local=await reopened.session();assert.equal(local.user.id,session.user.id);assert.equal(local.offline,true);assert.equal(local.access_token,undefined);assert.equal(env.calls,count);assert.equal(env.options.auth.autoRefreshToken,false);assert.equal((await reopened.offlineEvaluations())[0].id,'evaluation-one');await assert.rejects(reopened.requireSession(),/Sin conexión/);assert.equal(env.calls,count);
 env.navigator.onLine=true;assert.equal((await reopened.requireSession()).access_token,'online-only-token');assert.equal(env.calls,count+1);
 env.authEvents.at(-1)('SIGNED_OUT',null);env.navigator.onLine=false;assert.equal(await reopened.session(),null);assert.equal((await reopened.offlineEvaluations()).length,0);
});

test('directorio offline es por cuenta y los guardados simultáneos no pierden evaluaciones',async()=>{
 const env=environment(),p=env.open(),s=await p.session();await Promise.all([p.rememberOfflineEvaluation(s.user.id,{id:'a',name:'A'}),p.rememberOfflineEvaluation(s.user.id,{id:'b',name:'B'})]);assert.deepEqual(Array.from(await p.offlineEvaluations(),e=>e.id).sort(),['a','b']);
 env.setUser({id:'other-offline-user'});await p.session();env.navigator.onLine=false;assert.equal((await p.offlineEvaluations()).length,0);
});
