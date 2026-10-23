const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const M=require('../js/platform-model'),Core=require('../js/core'),{createRuntime}=require('./support/managed-runtime.cjs');
test('campos originales sobreviven guardado y recarga, separados de puntuación y con conflictos de plan',()=>{
 const data={generalInfo:{facilityName:'Centro'},indicators:[{id:'A_1a',score:0,action:'Reparar',responsible:'Equipo',trackingStatus:'En Progreso',history:[{recordedAt:'2026-10-23T10:00:00Z',indicatorChange:'mejorado',responsible:'Equipo',monitoringComments:'Avance'}]}]};
 const rows=M.editorRecords(data,[],{teamId:'team'});assert.equal(rows.find(r=>r.kind==='indicator').data.history,undefined);assert.equal(rows.find(r=>r.kind==='indicator').data.action,undefined);
 const loaded=M.dataset(rows,[{id:'A_1a'}],{},rows.filter(r=>r.kind==='action'));assert.equal(loaded.indicators[0].action,'Reparar');assert.equal(loaded.indicators[0].history[0].monitoringComments,'Avance');assert.equal(loaded.indicators[0].score,0);
 const readOnly=M.editorRecords(loaded,rows,{});assert.equal(M.dataset(readOnly,[{id:'A_1a'}],{},readOnly.filter(r=>r.kind==='action')).indicators[0].history.length,1,'el propietario sin equipo puede consultar historial');
 const draftOnly=M.editorRecords({generalInfo:{},indicators:[{id:'A_2',correctiveMeasures:'Anotación previa',history:[]}]},[],{teamId:'team'});assert.equal(draftOnly.find(r=>r.kind==='monitor').data.editor_fields.correctiveMeasures,'Anotación previa');
 const malicious=structuredClone(rows);malicious.find(r=>r.kind==='monitor').data.editor_fields.score=2;assert.equal(M.dataset(malicious,[{id:'A_1a'}],{},malicious.filter(r=>r.kind==='action')).indicators[0].score,0);
 const mine=structuredClone(rows),theirs=structuredClone(rows);mine.find(r=>r.kind==='action').data.action='Cambio A';theirs.find(r=>r.kind==='action').data.action='Cambio B';assert.equal(M.merge(rows,mine,theirs).conflicts[0].key,'action:editor:A_1a');
});
test('plan y revisión posteriores a validar: datos reales de SQL, snapshot intacto y exportación idempotente con monitoreo',async t=>{
 const r=await createRuntime();t.after(()=>r.close());const admin=await r.insert('admin-original@example.invalid','Fixture-admin-123',undefined,true);
 await r.queued(async()=>{await r.db.exec('reset role');await r.db.query("update wash_accounts set status='active',must_change_password=false where user_id=$1",[admin.id]);});
 await r.service('set_role',r.owner.id,{user_id:admin.id,scope:'country',country_id:r.country.id,role:'admin'});
 const session=(await r.signIn({email:admin.email,password:'Fixture-admin-123'})).data.session.access_token;
 async function command(op,data,id=crypto.randomUUID()){return(await r.queryAs(session,'select wash_command($1,$2,$3) as data',[op,JSON.stringify(data),id])).rows[0].data;}
 const f=await command('facility',{country_id:r.country.id,name:'Centro'}),team=await command('team',{country_id:r.country.id,name:'Equipo'});await command('assign',{facility_id:f.id,team_id:team.id});await r.service('set_role',r.owner.id,{user_id:admin.id,scope:'team',team_id:team.id,role:'coordinator'});
 const ev=await command('evaluation',{facility_id:f.id,team_id:team.id,name:'Inicial',kind:'initial'});
 await command('save_record',{facility_id:f.id,evaluation_id:ev.id,kind:'general',record_key:'identification',data:{facilityName:'Centro'}});await command('save_record',{facility_id:f.id,evaluation_id:ev.id,kind:'indicator',record_key:'A_1a',data:{score:0}});
 await r.queued(()=>require('./support/complete-fixture.cjs').fill(r.db,ev.id));
 const review=await command('evaluation_status',{evaluation_id:ev.id,status:'review',version:ev.version});await command('evaluation_status',{evaluation_id:ev.id,status:'validated',version:review.version});
 const before=(await r.queryAs(session,"select data from wash_snapshots where evaluation_id=$1 and purpose='validation'",[ev.id])).rows[0].data;
 const original={generalInfo:{facilityName:'Centro'},indicators:[{id:'A_1a',score:0,action:'Reparar suministro',responsible:'Equipo',trackingStatus:'En Progreso',history:[{recordedAt:'2026-10-23T10:00:00Z',indicatorChange:'mejorado',responsible:'Equipo',correctiveMeasures:'Nueva medida',monitoringComments:'Avance observado'}]}]};
 const baseline=(await r.queryAs(session,'select * from wash_records where facility_id=$1',[f.id])).rows;
 for(const row of M.editorRecords(original,baseline,{teamId:team.id}).filter(r=>['action','monitor'].includes(r.kind))){const previous=baseline.find(r=>r.kind===row.kind&&r.record_key===row.record_key);await command('save_record',{...row,...(previous?{id:previous.id,version:previous.version}:{}),facility_id:f.id,evaluation_id:ev.id});}
 await assert.rejects(command('save_record',{facility_id:f.id,evaluation_id:ev.id,kind:'indicator',record_key:'A_2',data:{score:2}}),/FORBIDDEN/);
 const stored=(await r.queryAs(session,'select * from wash_records where facility_id=$1',[f.id])).rows,loaded=M.dataset(stored,[{id:'A_1a'}],{},stored.filter(x=>x.kind==='action'));
 assert.equal(loaded.indicators[0].score,0);assert.equal(loaded.indicators[0].action,'Reparar suministro');assert.equal(loaded.indicators[0].history.length,1);
 const after=(await r.queryAs(session,"select data from wash_snapshots where evaluation_id=$1 and purpose='validation'",[ev.id])).rows[0].data;assert.deepEqual(after,before);
 const op=crypto.randomUUID(),job=await command('export',{facility_id:f.id,evaluation_id:ev.id},op);const cut=(await r.queryAs(session,'select data from wash_snapshots where id=$1',[job.snapshot_id])).rows[0].data;assert.equal(cut.monitoring.length,1);assert.equal(cut.records.find(x=>x.kind==='indicator').data.score,0);
 const monitor=stored.find(x=>x.kind==='monitor');await command('save_record',{...monitor,data:{...monitor.data,findings:'Cambio posterior'}});await command('export',{facility_id:f.id,evaluation_id:ev.id},op);assert.deepEqual((await r.queryAs(session,'select data from wash_snapshots where id=$1',[job.snapshot_id])).rows[0].data,cut);
});

test('guardar revisión usa el indicador actual aunque la sincronización haya reemplazado su objeto',()=>{
 const vm=require('node:vm'),fs=require('node:fs');let app;
 const context=vm.createContext({Vue:{ref:value=>({value}),computed:getter=>({get value(){return getter()}}),onMounted(){},nextTick(){},watch(){},createApp:o=>({mount(){app=o.setup()}})},window:{innerWidth:1200,scrollTo(){}},document:{getElementById(){return{close(){}}}},navigator:{onLine:true},WashStorage:{createStore:()=>({})},setTimeout(){},clearTimeout(){},Date,Intl});
 for(const f of ['js/core.js','js/data/indicators.js','js/app.js'])vm.runInContext(fs.readFileSync(f,'utf8'),context);
 const previous={id:'A_1a',score:0,responsible:'Equipo',history:[]},current={...previous,history:[]};app.reviewIndicator.value=previous;app.reviewDraft.value=Core.createReviewDraft(previous,[]);app.reviewDraft.value.newMonitoringComments='Nuevo avance';app.indicators.value=[current];app.saveNewReview();assert.equal(previous.history.length,0);assert.equal(current.history.length,1);assert.equal(current.history[0].monitoringComments,'• Nuevo avance');
});
