const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),crypto=require('node:crypto');
const Core=require('../js/core'),Model=require('../js/platform-model'),Storage=require('../js/storage');
const {indexedDB}=require('fake-indexeddb');
const catalog=vm.runInNewContext(fs.readFileSync('js/data/indicators.js','utf8')+';INDICATORS_DATA');
function setup(evaluationStatus='editing',random=Math.random){
  const evaluationId=crypto.randomUUID(),facilityId=crypto.randomUUID(),userId=crypto.randomUUID(),teamId=crypto.randomUUID();
  const database=[{id:crypto.randomUUID(),facility_id:facilityId,evaluation_id:evaluationId,kind:'general',record_key:'general',version:1,data:{...Core.defaults(),facilityName:'Ficticio',countryCode:'PER'}}];
  let editable=true,planEditable=true;
  let current=Core.normalizeDataset(Model.dataset(database,catalog,Core.defaults()),catalog),conflicts=[],lost=false,writes=0;
  const operations=new Map(),navigator={onLine:true};let listeners={},root,reads=0,now=Date.parse('2026-10-23T20:00:00Z'),syncInfo=null,failReads=false,pulse,callbacks={},subscription,requestedVersions=[],queuedSync;
  class ClockDate extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
  const platform={ready:Promise.resolve({enabled:true}),enabled:true,requireSession:async()=>({user:{id:userId}}),session:async()=>({user:{id:userId}}),hydratePhotos:async rows=>rows,uploadPhotos:async data=>data,
    client:{channel:()=>({on(type,filter,fn){callbacks[filter.table]=fn;return this;},subscribe(fn){subscription=fn;return this;}}),auth:{onAuthStateChange:()=>({data:{subscription:{}}})}},
    rows:async table=>{reads++;if(failReads)throw Error('Servidor no disponible');if(!navigator.onLine)throw Error('offline');return table==='evaluations'?[{id:evaluationId,facility_id:facilityId,team_id:teamId,status:evaluationStatus}]:table==='records'?Core.clone(database):table==='participants'?(editable?[{user_id:userId,active:true,role:'evaluator'}]:[]):table==='facilities'?[{id:facilityId,country_id:'country'}]:table==='assignments'?[{facility_id:facilityId,team_id:teamId}]:table==='team_members'?(planEditable?[{team_id:teamId,user_id:userId,role:'coordinator'}]:[]):[];},
    command:async(op,data,operation)=>{
      if(operations.has(operation))return Core.clone(operations.get(operation));
      if(!navigator.onLine)throw Error('offline');if(op!=='save_record')return {};
      const row=database.find(r=>r.id===data.id||!data.id&&r.kind===data.kind&&r.record_key===data.record_key);
      if(row&&!data.field_changes&&row.version!==data.version)throw Object.assign(Error('VERSION_CONFLICT'),{code:'40001'});
      const result={...Core.clone(data),data:data.field_changes?Model.applyFields(row?.data||data.data,data.field_changes):Core.clone(data.data),id:row?.id||crypto.randomUUID(),version:(row?.version||0)+1};
      if(row)database[database.indexOf(row)]=result;else database.push(result);operations.set(operation,result);writes++;
      if(lost){lost=false;throw Error('La respuesta se perdió después del commit');}return Core.clone(result);
    }
  };
  platform.editorSync=async(id,known)=>{reads++;requestedVersions.push(Core.clone(known));if(failReads)throw Error('Servidor no disponible');if(!navigator.onLine)throw Error('offline');return {evaluation:{id:evaluationId,facility_id:facilityId,team_id:teamId,status:evaluationStatus},facility:{id:facilityId,country_id:'country'},country:{code:'PER'},participants:editable?[{user_id:userId,active:true,role:'evaluator'}]:[],members:planEditable?[{team_id:teamId,user_id:userId,role:'coordinator'}]:[],assignments:[{facility_id:facilityId,team_id:teamId}],rows:Core.clone(database.filter(r=>known[r.id]!==r.version)),removed:Object.keys(known).filter(id=>!database.some(r=>r.id===id))};};
  function boot(){
    listeners={};root={WashPlatform:platform,WashPlatformModel:Model,WashCore:Core};
    const context=vm.createContext({Math:Object.assign(Object.create(Math),{random}),window:root,location:{search:'?evaluation='+evaluationId,replace(){}},URLSearchParams,WashCore:Core,WashStorage:Storage,INDICATORS_DATA:catalog,indexedDB,navigator,Date:ClockDate,crypto,setInterval(fn){pulse=fn;},setTimeout(fn){queuedSync=fn;return 1;},clearTimeout(){queuedSync=null;},addEventListener(name,fn){(listeners[name]||=[]).push(fn);}});
    vm.runInContext(fs.readFileSync('js/platform-editor.js','utf8'),context);
  }
  boot();
  const hooks={sync:value=>{syncInfo=value;},get:()=>Core.clone(current),apply:async data=>{current=Core.clone(data);},readonly(){},status(){},conflicts:data=>{conflicts=data;},position(){}};
  return {platform,teamId,requestedVersions,flushSync:()=>queuedSync?.(),pulse:()=>pulse(),ready:()=>subscription?.('SUBSCRIBED'),notify:(table,payload)=>callbacks[table]?.(payload),advance(ms=60000){now+=ms;},failReads(value){failReads=value;},get syncInfo(){return syncInfo;},get reads(){return reads;},async dispatch(name,event){await Promise.all((listeners[name]||[]).map(fn=>fn(event)));},reopen(){current=Core.normalizeDataset(Model.dataset([],catalog,Core.defaults()),catalog);conflicts=[];boot();},setPlanEditable(value){planEditable=value;},setEditable(value){editable=value;},get cloud(){return root.WashCloud;},hooks,navigator,database,store:Storage.createStore(indexedDB,'user:'+userId+':evaluation:'+evaluationId),get current(){return current;},get conflicts(){return conflicts;},get writes(){return writes;},loseResponse(){lost=true;}};
}
test('clientes conectados juntos reparten las comprobaciones sin retrasar una edición local',async()=>{
 const early=setup('editing',()=>0),late=setup('editing',()=>1);
 await early.cloud.connect(early.hooks);await late.cloud.connect(late.hooks);early.ready();late.ready();
 const beforeEarly=early.reads,beforeLate=late.reads;
 early.advance(31000);late.advance(31000);await early.pulse();await late.pulse();
 assert.ok(early.reads>beforeEarly);assert.equal(late.reads,beforeLate);
 late.current.indicators[0].notes='No esperar al sondeo para guardar';assert.equal(await late.cloud.save(),true);
 assert.equal(late.database.find(r=>r.kind==='indicator').data.notes,'No esperar al sondeo para guardar');
 const afterWrite=late.reads;late.advance(36000);await late.pulse();assert.ok(late.reads>afterWrite);
});

test('revisión antigua continúa editable online y offline; una validada permanece bloqueada',async()=>{
 const app=setup('review');await app.cloud.connect(app.hooks);app.current.indicators[0].score=1;assert.equal(await app.cloud.save(),true);app.navigator.onLine=false;app.current.indicators[0].notes='Corregir un pendiente de revisión';await app.cloud.persistLocal();app.reopen();await app.cloud.connect(app.hooks);assert.equal(app.current.indicators[0].notes,'Corregir un pendiente de revisión');app.navigator.onLine=true;await app.dispatch('online');assert.equal(app.database.find(r=>r.kind==='indicator').data.notes,'Corregir un pendiente de revisión');
 const validated=setup('validated');await validated.cloud.connect(validated.hooks);validated.current.indicators[0].score=1;assert.equal(await validated.cloud.save(),false);assert.equal(validated.writes,0);
});

test('sincronización reintenta un commit cuya respuesta se perdió sin duplicar el cambio',async()=>{
  const app=setup();await app.cloud.connect(app.hooks);app.current.indicators[0].score=1;app.loseResponse();
  assert.equal(await app.cloud.save(),false);assert.equal(app.writes,1);
  assert.equal(await app.cloud.save(),false);app.advance();assert.equal(await app.cloud.save(),true);assert.equal(app.writes,1);
  assert.equal(app.database.filter(r=>r.kind==='indicator').length,1);
});

test('la espera de reintento conserva ediciones nuevas y evita repetir peticiones por cada cambio',async()=>{
 const app=setup();await app.cloud.connect(app.hooks);app.current.indicators[0].score=1;app.loseResponse();await app.cloud.save();const reads=app.reads;app.current.indicators[0].notes='Edición mientras espera';assert.equal(await app.cloud.save(),false);assert.equal(app.reads,reads);assert.equal((await app.store.read('sync')).local.indicators[0].notes,'Edición mientras espera');app.advance();assert.equal(await app.cloud.save(),true);const row=app.database.find(r=>r.kind==='indicator');assert.equal(row.data.score,1);assert.equal(row.data.notes,'Edición mientras espera');
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
  await app.cloud.connect(app.hooks);assert.equal(readonly,true);
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
 {const remote=app.database.find(r=>r.kind==='action');remote.data.cost=300;remote.version++;}await app.cloud.refresh();assert.equal(app.current.indicators[0].cost,300);assert.equal(app.conflicts.length,0);
});

test('un plan editable se sincroniza automáticamente y conserva la edición autorizada tras el cierre',async()=>{
 const app=setup();addPlan(app);await app.cloud.connect(app.hooks);app.current.indicators[0].action='Cambio real local';{const remote=app.database.find(r=>r.kind==='action');remote.data.cost=300;remote.version++;}
 await app.cloud.refresh();assert.equal(app.conflicts.length,0);assert.match(app.current.indicators[0].action,/Cambio real local/);assert.equal(await app.cloud.save(),true);assert.match(app.database.find(r=>r.kind==='action').data.action,/Cambio real local/);
 const live=setup();addPlan(live);await live.cloud.connect(live.hooks);live.current.indicators[0].action='Plan vigente';live.setEditable(false);await live.cloud.refresh();assert.equal(live.conflicts.length,0);assert.equal(live.current.indicators[0].action,'Plan vigente');assert.equal(await live.cloud.save(),true);assert.equal(live.database.find(r=>r.kind==='action').data.action,'Plan vigente');
});

test('limpiar un conflicto vacío antiguo no descarta una edición real realizada después',async()=>{
 const app=setup();await app.cloud.connect(app.hooks);const row=addPlan(app);await app.cloud.refresh();const cache=await app.store.read('sync');
 cache.conflicts=[{key:'action:'+row.record_key,local:{kind:'action',record_key:row.record_key,data:{indicator_id:'A_1a',cost:null,action:'',trackingStatus:'No Iniciado'}},remote:{kind:row.kind,record_key:row.record_key,data:row.data}}];cache.local.indicators[0].action='Acción nueva aún no enviada';await app.store.write('sync',cache);
 await app.cloud.connect(app.hooks);assert.match(app.current.indicators[0].action,/Acción nueva aún no enviada/);assert.equal(app.conflicts.length,0);assert.equal(app.writes,0);
});

test('datos generales y monitoreo concurrentes se sincronizan sin aviso y adoptan después el último guardado remoto',async()=>{
 const app=setup();const g=app.database[0];const row={id:crypto.randomUUID(),facility_id:g.facility_id,kind:'monitor',record_key:'editor:'+app.teamId+':A_1a:initial',version:1,status:'draft',data:{team_id:app.teamId,editor_indicator_id:'A_1a',editor_fields:{nextReviewDate:'2026-12-31'}}};app.database.push(row);await app.cloud.connect(app.hooks);
 app.current.generalInfo.summary='Resumen local';app.current.indicators[0].nextReviewDate='2027-01-01';app.database[0].data.summary='Resumen remoto';row.data.editor_fields.nextReviewDate='2028-01-01';row.version++;
 await app.cloud.refresh();assert.equal(app.conflicts.length,0);assert.equal(app.current.generalInfo.summary,'Resumen local');assert.equal(app.current.indicators[0].nextReviewDate,'2027-01-01');assert.equal(await app.cloud.save(),true);
 const saved=app.database.find(r=>r.kind==='monitor');assert.equal(saved.data.editor_fields.nextReviewDate,'2027-01-01');saved.data.editor_fields.nextReviewDate='2029-01-01';saved.version++;await app.cloud.refresh();assert.equal(app.current.indicators[0].nextReviewDate,'2029-01-01');assert.equal(app.conflicts.length,0);
});

test('un commit con respuesta perdida no vuelve a escribir encima de un guardado remoto posterior al refrescar',async()=>{
 const app=setup();await app.cloud.connect(app.hooks);app.current.generalInfo.summary='Commit A';app.loseResponse();assert.equal(await app.cloud.save(),false);
 const row=app.database.find(r=>r.record_key==='summary');row.data.summary='Commit B posterior';row.version++;const writes=app.writes;
 await app.cloud.refresh();assert.equal(app.current.generalInfo.summary,'Commit B posterior');assert.equal(app.writes,writes);assert.equal((await app.store.read('sync')).pending,null);assert.equal(app.conflicts.length,0);
});

test('resolver un reintento conserva la edición nueva realizada mientras faltaba la confirmación',async()=>{
 const app=setup();await app.cloud.connect(app.hooks);app.current.generalInfo.summary='Commit A';app.loseResponse();await app.cloud.save();app.current.generalInfo.summary='Edición C aún no enviada';app.database.find(r=>r.record_key==='summary').data.summary='Commit B posterior';
 await app.cloud.refresh();assert.equal(app.current.generalInfo.summary,'Edición C aún no enviada');assert.equal(await app.cloud.save(),true);assert.equal(app.database.find(r=>r.record_key==='summary').data.summary,'Edición C aún no enviada');assert.equal(app.conflicts.length,0);
});

test('reconexión combina campos del mismo indicador, plan y monitoreo sin reenviar campos ajenos',async()=>{
 const app=setup();addPlan(app);await app.cloud.connect(app.hooks);app.current.indicators[0].score=0;await app.cloud.save();
 app.navigator.onLine=false;app.current.indicators[0].notes='Nota offline';app.current.indicators[0].action='Acción offline';await app.cloud.save();
 const indicator=app.database.find(r=>r.kind==='indicator'),action=app.database.find(r=>r.kind==='action');indicator.data.score=2;indicator.version++;action.data.cost=999;action.version++;
 app.navigator.onLine=true;await app.cloud.refresh();assert.equal(app.current.indicators[0].score,2);assert.equal(app.current.indicators[0].cost,999);assert.equal(app.current.indicators[0].notes,'Nota offline');
 // Otra carrera después del refresco y antes del guardado tampoco pierde campos.
 indicator.data.score=1;indicator.version++;action.data.cost=1000;action.version++;
 assert.equal(await app.cloud.save(),true);assert.equal(app.database.find(r=>r.kind==='indicator').data.score,1);assert.equal(app.database.find(r=>r.kind==='action').data.cost,1000);await app.cloud.refresh();assert.equal(app.current.indicators[0].cost,1000);
});

test('reabrir con envío pendiente confirma antes de combinar campos remotos y conserva nuevas ediciones',async()=>{
 const app=setup();addPlan(app);await app.cloud.connect(app.hooks);app.current.indicators[0].action='Acción A';app.loseResponse();await app.cloud.save();
 let row=app.database.find(r=>r.kind==='action');row.data.cost=800;row.version++;await app.cloud.connect(app.hooks);assert.equal(app.current.indicators[0].cost,800);assert.match(app.current.indicators[0].action,/Acción A/);
 row=app.database.find(r=>r.kind==='action');row.data.cost=900;row.version++;const writes=app.writes;await app.cloud.save();assert.equal(app.writes,writes,'ningún campo recibido se vuelve a publicar como una edición propia');await app.cloud.refresh();assert.equal(app.current.indicators[0].cost,900);
});

test('objetos anidados se combinan por campo y no contaminan prototipos',()=>{
 const before={editor_fields:{monitoringComments:'Antes',nextReviewDate:'2026-12-31'},cost:12},mine={editor_fields:{monitoringComments:'',nextReviewDate:'2026-12-31'},cost:0},remote={editor_fields:{monitoringComments:'Antes',nextReviewDate:'2027-01-01'},cost:12};
 const merged=Model.merge([{kind:'monitor',record_key:'m',data:before}],[{kind:'monitor',record_key:'m',data:mine}],[{kind:'monitor',record_key:'m',data:remote}],{fieldMergeKinds:['monitor']});
 assert.deepEqual(merged.records[0].data,{editor_fields:{monitoringComments:'',nextReviewDate:'2027-01-01'},cost:0});assert.equal(merged.conflicts.length,0);
 assert.throws(()=>Model.applyFields({},[{path:['__proto__','polluted'],value:true}]),/INVALID_FIELD_PATH/);assert.equal({}.polluted,undefined);
});

test('primer plan y monitoreo simultáneos no publican valores vacíos como cambios propios',async()=>{
 for(const legacyCache of [false,true]){
  const app=setup();await app.cloud.connect(app.hooks);
  if(legacyCache){const cached=await app.store.read('sync');cached.base=cached.base.filter(r=>!['action','monitor'].includes(r.kind));await app.store.write('sync',cached);await app.cloud.connect(app.hooks);}
  assert.equal(await app.cloud.save(),true);assert.equal(app.writes,0,'las bases vacías no crean registros sin edición');
  app.navigator.onLine=false;app.current.indicators[0].action='Mi acción';app.current.indicators[0].correctiveMeasures='Mi medida';await app.cloud.save();
  const general=app.database[0];app.database.push({id:crypto.randomUUID(),facility_id:general.facility_id,evaluation_id:general.evaluation_id,kind:'action',record_key:'editor:A_1a',version:1,data:{indicator_id:'A_1a',action:'',resources:'Recursos del otro usuario',cost:80}});
  app.database.push({id:crypto.randomUUID(),facility_id:general.facility_id,evaluation_id:general.evaluation_id,kind:'monitor',record_key:'editor:'+app.teamId+':A_1a:initial',status:'draft',version:1,data:{team_id:app.teamId,editor_indicator_id:'A_1a',editor_fields:{monitoringComments:'Comentario del otro usuario',nextReviewDate:'2027-01-01'}}});
  app.navigator.onLine=true;assert.equal(await app.cloud.save(),true,'carrera sin refresco previo');await app.cloud.refresh();
  assert.match(app.current.indicators[0].action,/Mi acción/);assert.match(app.current.indicators[0].resources,/Recursos del otro usuario/);assert.equal(app.current.indicators[0].cost,80);assert.match(app.current.indicators[0].correctiveMeasures,/Mi medida/);assert.match(app.current.indicators[0].monitoringComments,/Comentario del otro usuario/);assert.equal(app.current.indicators[0].nextReviewDate,'2027-01-01');assert.equal(app.database.filter(r=>r.kind==='monitor').length,1);
 }
});

test('un envío pendiente legado se convierte a campos y no borra el costo remoto al reabrir',async()=>{
 const app=setup();addPlan(app);await app.cloud.connect(app.hooks);const cached=await app.store.read('sync'),record=cached.base.find(r=>r.kind==='action'&&r.record_key==='editor:A_1a'),stored=app.database.find(r=>r.kind==='action');
 cached.local.indicators[0].action='Acción pendiente de la versión anterior';cached.pendingLocal={...record,data:{...record.data,action:'Acción pendiente de la versión anterior'}};cached.pending={id:stored.id,version:stored.version,facility_id:stored.facility_id,evaluation_id:stored.evaluation_id,kind:record.kind,record_key:record.record_key,data:cached.pendingLocal.data};cached.currentOperation=crypto.randomUUID();await app.store.write('sync',cached);
 stored.data.cost=1200;stored.version++;await app.cloud.connect(app.hooks);assert.match(app.current.indicators[0].action,/Acción pendiente de la versión anterior/);assert.equal(app.current.indicators[0].cost,1200);assert.equal(app.database.find(r=>r.kind==='action').data.cost,1200);assert.equal((await app.store.read('sync')).pending,null);
});

test('cerrar, reabrir sin red, editar y reconectar conserva campos de los demás automáticamente',async()=>{
 const app=setup();addPlan(app);await app.cloud.connect(app.hooks);app.current.indicators[0].score=0;await app.cloud.save();
 app.navigator.onLine=false;app.current.indicators[0].notes='Nota antes de cerrar';app.current.indicators[0].action='Plan antes de cerrar';app.current.indicators[0].correctiveMeasures='Medida antes de cerrar';await app.cloud.persistLocal();await app.cloud.position('step5','A');
 const reads=app.reads;app.reopen();await app.cloud.connect(app.hooks);assert.equal(app.reads,reads,'reabrir sin conexión no consulta ninguna tabla');assert.equal(app.cloud.active,true);assert.equal(app.current.indicators[0].notes,'Nota antes de cerrar');assert.match(app.current.indicators[0].action,/Plan antes de cerrar/);assert.match(app.current.indicators[0].correctiveMeasures,/Medida antes de cerrar/);
 app.current.indicators[0].notes='Nota después de reabrir';await app.cloud.persistLocal();
 const indicator=app.database.find(r=>r.kind==='indicator'),action=app.database.find(r=>r.kind==='action'),general=app.database[0];indicator.data.score=2;indicator.version++;action.data.cost=4500;action.data.action='Otra acción guardada mientras estaba sin red';action.version++;
 app.database.push({id:crypto.randomUUID(),facility_id:general.facility_id,evaluation_id:general.evaluation_id,kind:'monitor',record_key:'editor:'+app.teamId+':A_1a:initial',version:1,status:'draft',data:{team_id:app.teamId,editor_indicator_id:'A_1a',editor_fields:{monitoringComments:'Comentario del otro evaluador',nextReviewDate:'2027-04-01'}}});
 app.navigator.onLine=true;await app.dispatch('online');assert.equal(app.current.indicators[0].score,2);assert.equal(app.current.indicators[0].cost,4500);assert.equal(app.database.find(r=>r.kind==='indicator').data.notes,'Nota después de reabrir');assert.match(app.database.find(r=>r.kind==='action').data.action,/Plan antes de cerrar/);const monitor=app.database.find(r=>r.kind==='monitor');assert.match(monitor.data.editor_fields.correctiveMeasures,/Medida antes de cerrar/);assert.match(monitor.data.editor_fields.monitoringComments,/Comentario del otro evaluador/);assert.equal(monitor.data.editor_fields.nextReviewDate,'2027-04-01');
 const writes=app.writes;await app.dispatch('online');assert.equal(app.writes,writes,'reconectar otra vez no vuelve a guardar');
});

test('reapertura offline sin caché falla sin habilitar edición y conserva permisos restrictivos al reconectar',async()=>{
 const missing=setup();missing.navigator.onLine=false;await assert.rejects(missing.cloud.connect(missing.hooks),/OFFLINE/);assert.equal(missing.cloud.active,false);
 const app=setup();addPlan(app);await app.cloud.connect(app.hooks);app.navigator.onLine=false;app.current.indicators[0].action='Borrador sin conexión';await app.cloud.persistLocal();app.reopen();await app.cloud.connect(app.hooks);
 app.setEditable(false);app.setPlanEditable(false);app.navigator.onLine=true;const writes=app.writes;await app.dispatch('online');assert.equal(app.writes,writes);assert.match(app.current.indicators[0].action,/Acción de la nube/);assert.match((await app.store.read('readonlyDrafts'))['action:editor:A_1a'].record.data.action,/Borrador sin conexión/);
});


test('última sincronización se conserva offline y solo avanza tras completar comunicación con el servidor',async()=>{
 const app=setup();await app.cloud.connect(app.hooks);const initial=app.syncInfo.lastSyncedAt;assert.equal(initial,'2026-10-23T20:00:00.000Z');assert.equal(app.syncInfo.state,'synced');app.advance();await app.cloud.save();assert.equal(app.syncInfo.lastSyncedAt,initial,'guardar sin cambios no finge un contacto nuevo');
 app.navigator.onLine=false;app.current.indicators[0].score=1;await app.cloud.persistLocal();assert.equal(app.syncInfo.state,'offline');assert.equal(app.syncInfo.lastSyncedAt,initial);app.reopen();await app.cloud.connect(app.hooks);assert.equal(app.syncInfo.state,'offline');assert.equal(app.syncInfo.lastSyncedAt,initial);
 app.navigator.onLine=true;app.failReads(true);await app.dispatch('online');assert.equal(app.syncInfo.state,'error');assert.equal(app.syncInfo.lastSyncedAt,initial);app.failReads(false);await app.dispatch('online');assert.equal(app.syncInfo.state,'synced');assert.notEqual(app.syncInfo.lastSyncedAt,initial);assert.equal((await app.store.read('sync')).lastSyncedAt,app.syncInfo.lastSyncedAt);
});

test('un guardado sin confirmar no adelanta la hora de sincronización',async()=>{
 const app=setup();await app.cloud.connect(app.hooks);const initial=app.syncInfo.lastSyncedAt;app.advance();app.current.indicators[0].score=1;app.loseResponse();assert.equal(await app.cloud.save(),false);assert.equal(app.syncInfo.lastSyncedAt,initial);assert.equal(app.syncInfo.state,'error');await app.cloud.refresh();assert.equal(app.syncInfo.state,'synced');assert.notEqual(app.syncInfo.lastSyncedAt,initial);
});


test('la fecha transitoria del snapshot no impide salir después de guardar localmente',async()=>{
 const app=setup();const original=app.hooks.get;app.hooks.get=()=>({...original(),savedAt:new Date().toISOString()});await app.cloud.connect(app.hooks);app.advance();let prevented=0;await app.dispatch('beforeunload',{preventDefault(){prevented++;}});assert.equal(prevented,0);app.current.indicators[0].notes='Pendiente de conservar';await app.dispatch('beforeunload',{preventDefault(){prevented++;}});assert.equal(prevented,1);await app.cloud.persistLocal();await app.dispatch('beforeunload',{preventDefault(){prevented++;}});assert.equal(prevented,1);
});


test('delta no repite registros conocidos, recupera eventos perdidos y retira filas eliminadas',async()=>{
 const app=setup();await app.cloud.connect(app.hooks);app.current.indicators[0].notes='Primera';await app.cloud.save();await app.cloud.refresh();const before=app.reads;await app.cloud.refresh();assert.equal(app.reads,before+1);assert.ok(Object.keys(app.requestedVersions.at(-1)).length>=2);
 const row=app.database.find(r=>r.kind==='indicator');row.data.notes='Notificación perdida';row.version++;await app.cloud.refresh();assert.equal(app.current.indicators[0].notes,'Notificación perdida');
 app.database.splice(app.database.indexOf(row),1);await app.cloud.refresh();assert.equal(app.current.indicators[0].notes,'');
});

test('tiempo real saludable evita lecturas periódicas redundantes; el respaldo recupera cambios sin evento',async()=>{
 const app=setup();await app.cloud.connect(app.hooks);app.ready();const before=app.reads;await app.pulse();assert.equal(app.reads,before);app.database[0].data.facilityName='Cambio sin evento';app.database[0].version++;app.advance();await app.pulse();assert.equal(app.current.generalInfo.facilityName,'Cambio sin evento');assert.equal(app.reads,before+1);
});


test('un evento autorizado aplica la fila sin pedirla otra vez y conserva campos locales distintos',async()=>{
 const app=setup();await app.cloud.connect(app.hooks);app.current.indicators[0].notes='Nota inicial';await app.cloud.save();await app.cloud.refresh();
 const row=app.database.find(r=>r.kind==='indicator');app.current.indicators[0].notes='Mi nota pendiente';row.data.problemDesc='Problema de otro evaluador';row.version++;const before=app.reads;app.notify('wash_records',{new:Core.clone(row)});await app.flushSync();assert.equal(app.reads,before);assert.equal(app.current.indicators[0].notes,'Mi nota pendiente');assert.equal(app.current.indicators[0].problemDesc,'Problema de otro evaluador');await app.cloud.save();assert.equal(app.database.find(r=>r.kind==='indicator').data.problemDesc,'Problema de otro evaluador');
 const latest=app.database.find(r=>r.kind==='indicator');app.notify('wash_records',{new:{...Core.clone(latest),version:1,data:{notes:'Evento atrasado'}}});await app.flushSync();assert.equal(app.current.indicators[0].notes,'Mi nota pendiente');
});


test('un evento recibido mientras se hidrata la vista no pierde su aplicación posterior',async()=>{
 const app=setup();await app.cloud.connect(app.hooks);let entered,release;const waiting=new Promise(r=>entered=r),gate=new Promise(r=>release=r);app.platform.hydratePhotos=async rows=>{entered();await gate;return rows;};
 const general=app.database[0];general.version++;general.data.facilityName='Versión A';const work=app.cloud.refresh();await waiting;general.version++;general.data.facilityName='Versión B';app.notify('wash_records',{new:Core.clone(general)});release();await work;const reads=app.reads;await app.flushSync();assert.equal(app.current.generalInfo.facilityName,'Versión B');assert.equal(app.reads,reads);
});
