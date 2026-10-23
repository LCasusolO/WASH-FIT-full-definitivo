const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),crypto=require('node:crypto');
const Core=require('../js/core'),Model=require('../js/platform-model'),Storage=require('../js/storage');
const {indexedDB}=require('fake-indexeddb');
const catalog=vm.runInNewContext(fs.readFileSync('js/data/indicators.js','utf8')+';INDICATORS_DATA');
function setup(){
  const evaluationId=crypto.randomUUID(),facilityId=crypto.randomUUID(),userId=crypto.randomUUID(),teamId=crypto.randomUUID();
  const database=[{id:crypto.randomUUID(),facility_id:facilityId,evaluation_id:evaluationId,kind:'general',record_key:'general',version:1,data:{...Core.defaults(),facilityName:'Ficticio',countryCode:'PER'}}];
  let editable=true,planEditable=true;
  let current=Core.normalizeDataset(Model.dataset(database,catalog,Core.defaults()),catalog),conflicts=[],lost=false,writes=0;
  const operations=new Map(),navigator={onLine:true};
  const platform={ready:Promise.resolve({enabled:true}),enabled:true,requireSession:async()=>({user:{id:userId}}),session:async()=>({user:{id:userId}}),hydratePhotos:async rows=>rows,uploadPhotos:async data=>data,
    client:{channel:()=>({on(){return this;},subscribe(){return this;}}),auth:{onAuthStateChange:()=>({data:{subscription:{}}})}},
    rows:async table=>{if(!navigator.onLine)throw Error('offline');return table==='evaluations'?[{id:evaluationId,facility_id:facilityId,team_id:teamId,status:'editing'}]:table==='records'?Core.clone(database):table==='participants'?(editable?[{user_id:userId,active:true,role:'evaluator'}]:[]):table==='facilities'?[{id:facilityId,country_id:'country'}]:table==='assignments'?[{facility_id:facilityId,team_id:teamId}]:table==='team_members'?(planEditable?[{team_id:teamId,user_id:userId,role:'coordinator'}]:[]):[];},
    command:async(op,data,operation)=>{
      if(operations.has(operation))return Core.clone(operations.get(operation));
      if(!navigator.onLine)throw Error('offline');if(op!=='save_record')return {};
      const row=database.find(r=>r.id===data.id);
      if(row&&row.version!==data.version)throw Object.assign(Error('VERSION_CONFLICT'),{code:'40001'});
      const result={...Core.clone(data),id:row?.id||crypto.randomUUID(),version:(row?.version||0)+1};
      if(row)database[database.indexOf(row)]=result;else database.push(result);operations.set(operation,result);writes++;
      if(lost){lost=false;throw Error('La respuesta se perdió después del commit');}return Core.clone(result);
    }
  };
  const root={WashPlatform:platform,WashPlatformModel:Model,WashCore:Core};
  const context=vm.createContext({window:root,location:{search:'?evaluation='+evaluationId,replace(){}},URLSearchParams,WashCore:Core,WashStorage:Storage,INDICATORS_DATA:catalog,indexedDB,navigator,crypto,setInterval(){},setTimeout(){},clearTimeout(){},addEventListener(){}});
  vm.runInContext(fs.readFileSync('js/platform-editor.js','utf8'),context);
  const hooks={get:()=>Core.clone(current),apply:async data=>{current=Core.clone(data);},readonly(){},status(){},conflicts:data=>{conflicts=data;},position(){}};
  return {setPlanEditable(value){planEditable=value;},setEditable(value){editable=value;},cloud:root.WashCloud,hooks,navigator,database,store:Storage.createStore(indexedDB,'user:'+userId+':evaluation:'+evaluationId),get current(){return current;},get conflicts(){return conflicts;},get writes(){return writes;},loseResponse(){lost=true;}};
}
test('sincronización reintenta un commit cuya respuesta se perdió sin duplicar el cambio',async()=>{
  const app=setup();await app.cloud.connect(app.hooks);app.current.indicators[0].score=1;app.loseResponse();
  assert.equal(await app.cloud.save(),false);assert.equal(app.writes,1);
  assert.equal(await app.cloud.save(),true);assert.equal(app.writes,1);
  assert.equal(app.database.filter(r=>r.kind==='indicator').length,1);
});
test('indicador concurrente se sincroniza automáticamente sin conflicto y converge al último guardado',async()=>{
 const app=setup();await app.cloud.connect(app.hooks);app.current.indicators[0].score=1;await app.cloud.save();
 app.current.indicators[0].score=2;const row=app.database.find(r=>r.kind==='indicator');row.data.score=0;row.version++;
 await app.cloud.refresh();assert.equal(app.conflicts.length,0);assert.equal(app.current.indicators[0].score,2);assert.equal(await app.cloud.save(),true);assert.equal(app.database.find(r=>r.kind==='indicator').data.score,2);
 const latest=app.database.find(r=>r.kind==='indicator');latest.data.score=1;latest.version++;const writes=app.writes;await app.cloud.refresh();assert.equal(app.current.indicators[0].score,1);assert.equal(app.writes,writes);assert.equal(app.conflicts.length,0);
});

test('un cambio sin conexión queda pendiente y se sincroniza al recuperar el servidor',async()=>{
  const app=setup();await app.cloud.connect(app.hooks);app.navigator.onLine=false;app.current.generalInfo.summary='Trabajo pendiente';
  assert.equal(await app.cloud.save(),false);assert.equal(app.writes,0);
  app.navigator.onLine=true;await app.cloud.refresh();assert.equal(app.current.generalInfo.summary,'Trabajo pendiente');
  assert.equal(await app.cloud.save(),true);assert.equal(app.database.find(r=>r.record_key==='summary').data.summary,'Trabajo pendiente');
});

test('la caché offline conserva solo lectura y no concede permisos por ausencia del campo',async()=>{
 for(const cachedPermission of [true,undefined]){
  const app=setup();await app.cloud.connect(app.hooks);const cache=await app.store.read('sync');
  if(cachedPermission===undefined)delete cache.readOnly;else cache.readOnly=cachedPermission;
  await app.store.write('sync',cache);app.navigator.onLine=false;let readonly;
  app.hooks.readonly=value=>readonly=value;
  // Los detalles del establecimiento no están disponibles sin red en este adaptador.
  await assert.rejects(app.cloud.connect(app.hooks),/offline/);assert.equal(readonly,true);
 }
});

test('la consulta de administrador usa la nube y conserva aparte los cambios antiguos sin peticiones obsoletas',async()=>{
 const app=setup();await app.cloud.connect(app.hooks);app.navigator.onLine=false;app.current.generalInfo.latitude=-12;app.current.generalInfo.longitude=-77;await app.cloud.save();
 const cached=await app.store.read('sync');cached.pending={kind:'general',record_key:'location',data:{latitude:-12,longitude:-77}};cached.currentOperation=crypto.randomUUID();await app.store.write('sync',cached);
 app.navigator.onLine=true;app.setEditable(false);app.setPlanEditable(false);await app.cloud.connect(app.hooks);
 assert.equal(app.conflicts.length,0);assert.equal(app.current.generalInfo.latitude,null);assert.equal(app.writes,0);assert.equal((await app.store.read('sync')).pending,null);
 assert.equal((await app.store.read('readonlyDrafts'))['general:location'].record.data.latitude,-12);
 await app.cloud.connect(app.hooks);assert.equal(app.conflicts.length,0);assert.equal(await app.cloud.save(),true);assert.equal(app.writes,0);
});

function addPlan(app){const general=app.database[0];const row={id:crypto.randomUUID(),facility_id:general.facility_id,evaluation_id:general.evaluation_id,kind:'action',record_key:'editor:A_1a',version:1,data:{indicator_id:'A_1a',action:'Acción de la nube',resources:'Recursos',responsible:'Equipo',targetDate:'2026-12-31',cost:16516,trackingStatus:'En Progreso'}};app.database.push(row);return row;}

test('un plan creado después de la caché no se convierte en un conflicto vacío al reabrir para consulta o edición',async()=>{
 for(const writable of [false,true]){
  const app=setup();app.setEditable(writable);app.setPlanEditable(writable);await app.cloud.connect(app.hooks);addPlan(app);
  await app.cloud.connect(app.hooks);assert.equal(app.conflicts.length,0);assert.match(app.current.indicators[0].action,/Acción de la nube/);assert.equal(app.current.indicators[0].cost,16516);assert.equal(app.writes,0);
 }
});

test('se eliminan conflictos falsos de planes vacíos ya guardados por versiones anteriores',async()=>{
 const app=setup();await app.cloud.connect(app.hooks);const row=addPlan(app);await app.cloud.refresh();const cached=await app.store.read('sync');
 const empty={kind:'action',record_key:row.record_key,data:{indicator_id:'A_1a',action:'',resources:'',responsible:'',responsibleId:'',targetDate:'',cost:null,trackingStatus:'No Iniciado'}};
 cached.conflicts=[{key:'action:'+row.record_key,local:empty,remote:{kind:row.kind,record_key:row.record_key,data:row.data}}];
 Object.assign(cached.local.indicators[0],empty.data);cached.pending=empty;cached.currentOperation=crypto.randomUUID();await app.store.write('sync',cached);
 await app.cloud.connect(app.hooks);assert.equal(app.conflicts.length,0);assert.match(app.current.indicators[0].action,/Acción de la nube/);assert.equal(app.current.indicators[0].cost,16516);assert.equal((await app.store.read('sync')).pending,null);assert.equal(app.writes,0);
});

test('al perder permiso sobre el plan se actualiza desde la nube sin publicar un borrador local',async()=>{
 const app=setup();addPlan(app);await app.cloud.connect(app.hooks);app.current.indicators[0].action='Borrador previo';app.setEditable(false);app.setPlanEditable(false);
 await app.cloud.refresh();assert.equal(app.conflicts.length,0);assert.match(app.current.indicators[0].action,/Acción de la nube/);assert.equal((await app.store.read('readonlyDrafts'))['action:editor:A_1a'].record.data.action,'Borrador previo');assert.equal(app.writes,0);
 app.database.find(r=>r.kind==='action').data.cost=300;await app.cloud.refresh();assert.equal(app.current.indicators[0].cost,300);assert.equal(app.conflicts.length,0);
});

test('se conservan conflictos reales de un plan editable y los cambios locales de un plan aún autorizado',async()=>{
 const app=setup();addPlan(app);await app.cloud.connect(app.hooks);app.current.indicators[0].action='Cambio real local';app.database.find(r=>r.kind==='action').data.cost=300;
 await app.cloud.refresh();assert.equal(app.conflicts.length,1);assert.equal(app.conflicts[0].local.kind,'action');assert.equal(app.writes,0);
 const live=setup();addPlan(live);await live.cloud.connect(live.hooks);live.current.indicators[0].action='Plan vigente';live.setEditable(false);await live.cloud.refresh();assert.equal(live.conflicts.length,0);assert.equal(live.current.indicators[0].action,'Plan vigente');assert.equal(await live.cloud.save(),true);assert.equal(live.database.find(r=>r.kind==='action').data.action,'Plan vigente');
});

test('limpiar un conflicto vacío antiguo no descarta una edición real realizada después',async()=>{
 const app=setup();await app.cloud.connect(app.hooks);const row=addPlan(app);await app.cloud.refresh();const cache=await app.store.read('sync');
 cache.conflicts=[{key:'action:'+row.record_key,local:{kind:'action',record_key:row.record_key,data:{indicator_id:'A_1a',cost:null,action:'',trackingStatus:'No Iniciado'}},remote:{kind:row.kind,record_key:row.record_key,data:row.data}}];cache.local.indicators[0].action='Acción nueva aún no enviada';await app.store.write('sync',cache);
 await app.cloud.connect(app.hooks);assert.match(app.current.indicators[0].action,/Acción nueva aún no enviada/);assert.equal(app.conflicts.length,1);assert.equal(app.writes,0);
});
