const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),{createClient}=require('@supabase/supabase-js');
test('reproduce el reintento oculto del generador y comprueba el límite de la app sin duplicar lecturas',async()=>{
 let oldCalls=0,newCalls=0;
 const old=createClient('https://fixture.invalid','public-fixture',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async()=>{oldCalls++;throw Object.assign(Error('Injected timeout'),{name:'TimeoutError'});}}});
 const a=await old.from('fixture').select('*');assert.ok(a.error);assert.equal(oldCalls,4,'el timeout externo ocasiona tres reintentos GET con el SDK fijado');
 const current=createClient('https://fixture.invalid','public-fixture',{auth:{persistSession:false,autoRefreshToken:false},db:{timeout:5,retry:false},global:{fetch:async(u,o)=>{newCalls++;return new Promise((resolve,reject)=>o.signal.addEventListener('abort',()=>reject(o.signal.reason),{once:true}));}}});
 const b=await current.from('fixture').select('*');assert.ok(b.error);assert.equal(newCalls,1);await old.removeAllChannels();await current.removeAllChannels();
});

async function progressClient(rpc){
 const root={WashSupabase:{createClient:()=>({auth:{getSession:async()=>({data:{session:{user:{id:'qa'}}}}),onAuthStateChange(){}},rpc})}};
 const context=vm.createContext({window:root,navigator:{onLine:true},localStorage:{setItem(){}},addEventListener(){},fetch:async()=>Response.json({enabled:true,url:'fixture',key:'public'})});vm.runInContext(fs.readFileSync('js/platform-client.js','utf8'),context);await root.WashPlatform.ready;return root.WashPlatform;
}
test('progreso de 21 establecimientos limita cada cálculo a dos, en serie, y conserva borrados',async()=>{
 const ids=Array.from({length:21},(_,n)=>'f'+n),known=Object.fromEntries([...ids,'revocado'].map(id=>[id,'old']));let active=0,max=0,calls=0;
 const p=await progressClient(async(name,args)=>{assert.equal(name,'wash_progress_sync');calls++;max=Math.max(max,++active);const scope=Array.from(args.p_facilities);assert.ok(scope.length<=2);assert.deepEqual(Object.keys(args.p_known),scope);await new Promise(r=>setImmediate(r));active--;return{data:{revisions:Object.fromEntries(scope.filter(id=>id!=='revocado').map(id=>[id,'new'])),changed:scope,progress:Object.fromEntries(scope.filter(id=>id!=='revocado').map(id=>[id,{percent:50}]))}};});
 const r=await p.progressSync(known,[...ids,'revocado','f0']);assert.equal(calls,11);assert.equal(max,1);assert.equal(Object.keys(r.revisions).length,21);assert.equal(r.changed.length,22);assert.ok(r.changed.includes('revocado'));assert.equal(r.progress.f20.percent,50);assert.equal(known.f0,'old');await p.progressSync({},[]);assert.equal(calls,11);
});
test('si falla un lote de progreso no devuelve un resumen parcial ni modifica las huellas anteriores',async()=>{
 let calls=0;const known={f0:'old'},p=await progressClient(async()=>++calls===1?{data:{revisions:{f0:'new'},changed:['f0'],progress:{f0:{percent:50}}}}:{error:{message:'timeout'}});
 await assert.rejects(p.progressSync(known,Array.from({length:11},(_,n)=>'f'+n)),/timeout/);assert.deepEqual(known,{f0:'old'});assert.equal(calls,2);
});
test('solo el parche de un registro usa la ruta directa; mantiene el UUID de reintento',async()=>{
 const requests=[],p=await progressClient(async(name,args)=>{requests.push({name,args});return{data:{version:2}};});
 await p.command('save_record',{id:'record',field_changes:[{path:['notes'],value:'Nueva nota'}]},'same-operation');await p.command('save_record',{id:'record',data:{notes:'Legado'}},'legacy-operation');await p.command('evaluation_status',{status:'validated'},'finish-operation');
 assert.deepEqual(requests.map(r=>r.name),['wash_command_fields','wash_command','wash_command']);assert.equal(requests[0].args.p_operation,'same-operation');assert.equal(requests[0].args.p_command,'save_record');assert.equal(requests[0].args.p_data.field_changes[0].value,'Nueva nota');
});
test('cliente limita el presupuesto de red y agrupa establecimientos respetando paginación',async()=>{
 let options;const filters=[],ranges=[],data=Array.from({length:600},(_,n)=>({id:n}));const q={select(){return this},in(key,ids){filters.push({key,ids});return this},order(){return this},async range(a,b){ranges.push([a,b]);return{data:data.slice(a,b+1),error:null}}};
 const root={WashSupabase:{createClient:(u,k,c)=>{options=c;return{auth:{getSession:async()=>({data:{session:{user:{id:'qa'}}}}),onAuthStateChange(){}},from:()=>q}}}};
 const context=vm.createContext({window:root,navigator:{onLine:true},crypto:require('node:crypto'),localStorage:{setItem(){}},addEventListener(){},fetch:async()=>Response.json({enabled:true,url:'fixture',key:'public'})});vm.runInContext(fs.readFileSync('js/platform-client.js','utf8'),context);await root.WashPlatform.ready;
 assert.equal(options.db.timeout,undefined);assert.equal(typeof options.global.fetch,"function");assert.equal(options.db.retry,false);const result=await root.WashPlatform.evaluationsFor(['fa','fb','fa']);assert.equal(result.length,600);assert.deepEqual(JSON.parse(JSON.stringify(filters)),[{key:'facility_id',ids:['fa','fb']}]);assert.deepEqual(ranges,[[0,499],[500,999]]);
});

test('la espera del token no consume el plazo de red y se conserva la cancelación del llamador',async()=>{
 const pause=ms=>new Promise(r=>setTimeout(r,ms));let options,calls=0,mode='fast';
 const fakeFetch=async(input,o={})=>{
  if(input==='/api/platform-config')return Response.json({enabled:true,url:'https://fixture.invalid',key:'public'});
  calls++;if(mode==='fast'){await pause(1);if(o.signal.aborted)throw o.signal.reason;return Response.json({ok:true});}
  if(o.signal.aborted)throw o.signal.reason;
  return new Promise((resolve,reject)=>o.signal.addEventListener('abort',()=>reject(o.signal.reason),{once:true}));
 };
 const root={WashSupabase:{createClient:(u,k,c)=>{options=c;return{auth:{onAuthStateChange(){}}};}}};
 const shortSignal={timeout:ms=>{assert.equal(ms,20000);return AbortSignal.timeout(5);},any:s=>AbortSignal.any(s)};
 const context=vm.createContext({window:root,navigator:{onLine:true},localStorage:{setItem(){}},addEventListener(){},fetch:fakeFetch,URL,AbortSignal:shortSignal});
 vm.runInContext(fs.readFileSync('js/platform-client.js','utf8'),context);await root.WashPlatform.ready;
 const common={auth:{persistSession:false,autoRefreshToken:false},accessToken:async()=>{await pause(25);return 'fixture-token';}};
 const old=createClient('https://fixture.invalid','public',{...common,db:{timeout:5,retry:false},global:{fetch:fakeFetch}});
 assert.ok((await old.rpc('fixture')).error,'el plazo del SDK vence mientras obtiene el token');
 const fresh=createClient('https://fixture.invalid','public',{...common,db:options.db,global:options.global});
 assert.equal((await fresh.rpc('fixture')).data.ok,true,'la petición rápida dispone de su plazo después del token');
 mode='wait';let before=calls;const timed=await fresh.rpc('fixture');assert.ok(timed.error);assert.equal(calls-before,1,'un vencimiento no se reintenta implícitamente');
 const controller=new AbortController();controller.abort(Error('Caller cancelled'));before=calls;const cancelled=await fresh.from('fixture').select('*').abortSignal(controller.signal);assert.match(cancelled.error.message,/Caller cancelled/);assert.equal(calls-before,1);
 await old.removeAllChannels();await fresh.removeAllChannels();
});

test('el índice offline reutiliza el almacén del usuario y mantiene separadas las cuentas',async()=>{
 const db={},stored={},scopes=[];let user='a';
 const root={WashStorage:{createStore:(factory,scope)=>{assert.equal(factory,db);scopes.push(scope);return{read:async key=>stored[scope]?.[key],update:async(key,change)=>{stored[scope]||={};stored[scope][key]=change(stored[scope][key]||{});}};}},WashSupabase:{createClient:()=>({auth:{onAuthStateChange(){},getSession:async()=>({data:{session:{user:{id:user}}}})}})}};
 const context=vm.createContext({window:root,indexedDB:db,navigator:{onLine:true},localStorage:{setItem(){}},addEventListener(){},fetch:async()=>Response.json({enabled:true,url:'https://fixture.invalid',key:'public'})});vm.runInContext(fs.readFileSync('js/platform-client.js','utf8'),context);await root.WashPlatform.ready;
 for(let n=0;n<100;n++)await root.WashPlatform.rememberOfflineEvaluation('a',{id:'e'+n,savedAt:String(n)});
 assert.equal((await root.WashPlatform.offlineEvaluations()).length,100);assert.deepEqual(scopes,['user:a']);
 await root.WashPlatform.rememberOfflineEvaluation('b',{id:'other',savedAt:'1'});user='b';assert.equal((await root.WashPlatform.offlineEvaluations()).length,1);assert.deepEqual(scopes,['user:a','user:b']);
});
