const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),crypto=require('node:crypto');
const Core=require('../js/core'),Model=require('../js/platform-model'),Storage=require('../js/storage');
const {indexedDB}=require('fake-indexeddb');
const catalog=vm.runInNewContext(fs.readFileSync('js/data/indicators.js','utf8')+';INDICATORS_DATA');
function setup(){
  const evaluationId=crypto.randomUUID(),facilityId=crypto.randomUUID(),userId=crypto.randomUUID();
  const database=[{id:crypto.randomUUID(),facility_id:facilityId,evaluation_id:evaluationId,kind:'general',record_key:'general',version:1,data:{...Core.defaults(),facilityName:'Ficticio',countryCode:'PER'}}];
  let current=Core.normalizeDataset(Model.dataset(database,catalog,Core.defaults()),catalog),conflicts=[],lost=false,writes=0;
  const operations=new Map(),navigator={onLine:true};
  const platform={ready:Promise.resolve({enabled:true}),enabled:true,requireSession:async()=>({user:{id:userId}}),session:async()=>({user:{id:userId}}),hydratePhotos:async rows=>rows,uploadPhotos:async data=>data,
    client:{channel:()=>({on(){return this;},subscribe(){return this;}}),auth:{onAuthStateChange:()=>({data:{subscription:{}}})}},
    rows:async table=>{if(!navigator.onLine)throw Error('offline');return table==='evaluations'?[{id:evaluationId,facility_id:facilityId,status:'editing'}]:table==='records'?Core.clone(database):table==='participants'?[{user_id:userId,active:true,role:'evaluator'}]:table==='facilities'?[{id:facilityId,country_id:'country'}]:[];},
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
  return {cloud:root.WashCloud,hooks,navigator,database,get current(){return current;},get conflicts(){return conflicts;},get writes(){return writes;},loseResponse(){lost=true;}};
}
test('sincronización reintenta un commit cuya respuesta se perdió sin duplicar el cambio',async()=>{
  const app=setup();await app.cloud.connect(app.hooks);app.current.indicators[0].score=1;app.loseResponse();
  assert.equal(await app.cloud.save(),false);assert.equal(app.writes,1);
  assert.equal(await app.cloud.save(),true);assert.equal(app.writes,1);
  assert.equal(app.database.filter(r=>r.kind==='indicator').length,1);
});
test('sincronización conserva conflictos tras refrescar y permite resolverlos explícitamente',async()=>{
  const app=setup();await app.cloud.connect(app.hooks);app.current.indicators[0].score=1;await app.cloud.save();
  app.current.indicators[0].score=2;const row=app.database.find(r=>r.kind==='indicator');row.data.score=0;row.version++;
  await app.cloud.refresh();assert.equal(app.conflicts.length,1);await app.cloud.refresh();assert.equal(app.conflicts.length,1);
  assert.equal(await app.cloud.save(),false);assert.equal(app.current.indicators[0].score,2);
  await app.cloud.resolve(app.conflicts[0].key,'remote');assert.equal(app.current.indicators[0].score,0);assert.equal(app.conflicts.length,0);
});
test('un cambio sin conexión queda pendiente y se sincroniza al recuperar el servidor',async()=>{
  const app=setup();await app.cloud.connect(app.hooks);app.navigator.onLine=false;app.current.generalInfo.summary='Trabajo pendiente';
  assert.equal(await app.cloud.save(),false);assert.equal(app.writes,0);
  app.navigator.onLine=true;await app.cloud.refresh();assert.equal(app.current.generalInfo.summary,'Trabajo pendiente');
  assert.equal(await app.cloud.save(),true);assert.equal(app.database.find(r=>r.record_key==='summary').data.summary,'Trabajo pendiente');
});
