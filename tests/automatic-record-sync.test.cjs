const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createRuntime}=require('./support/managed-runtime.cjs');
test('coordinador y evaluador guardan datos generales, plan y monitoreo: último commit, reintentos y permisos',async t=>{
 const r=await createRuntime();t.after(()=>r.close());
 const owner=(await r.signIn({email:r.owner.email,password:'Fixture-password-123'})).data.session.access_token;
 const user=await r.insert('sync-coordinator@example.invalid','Fixture-sync-123',undefined,true),other=await r.insert('sync-evaluator@example.invalid','Fixture-sync-123',undefined,true);
 await r.queued(async()=>{await r.db.exec('reset role');await r.db.query("update wash_accounts set status='active',must_change_password=false where user_id=any($1::uuid[])",[[user.id,other.id]]);});
 await r.service('set_role',r.owner.id,{user_id:user.id,scope:'country',country_id:r.country.id,role:'admin'});
 const coordinator=(await r.signIn({email:user.email,password:'Fixture-sync-123'})).data.session.access_token;
 const command=async(op,data,who=coordinator,id=crypto.randomUUID())=>(await r.queryAs(who,'select wash_command($1,$2,$3) as data',[op,JSON.stringify(data),id])).rows[0].data;
 const facility=await command('facility',{country_id:r.country.id,name:'Centro sincronización'}),team=await command('team',{country_id:r.country.id,name:'Equipo sincronización'});await command('assign',{facility_id:facility.id,team_id:team.id});
 for(const [person,role]of [[user,'coordinator'],[other,'evaluator']])await r.service('set_role',r.owner.id,{user_id:person.id,scope:'team',team_id:team.id,role});
 const evaluator=(await r.signIn({email:other.email,password:'Fixture-sync-123'})).data.session.access_token,ev=await command('evaluation',{facility_id:facility.id,team_id:team.id,kind:'initial'});
 let monitor;
 for(const kind of ['general','action','monitor']){
  const record_key=kind==='general'?'summary':kind==='action'?'editor:A_1a':'editor:'+team.id+':A_1a:initial';
  const data=kind==='general'?{summary:'Primero'}:kind==='action'?{indicator_id:'A_1a',action:'Primero',change_reason:'Trabajo del equipo'}:{team_id:team.id,editor_indicator_id:'A_1a',title:'Primero',editor_fields:{nextReviewDate:'2026-12-31'}};
  const request={facility_id:facility.id,evaluation_id:ev.id,kind,record_key,data},first=await command('save_record',request),operation=crypto.randomUUID();
  const secondData={...data,...(kind==='general'?{summary:'Segundo'}:kind==='action'?{action:'Segundo'}:{title:'Segundo',editor_fields:{nextReviewDate:'2027-01-01'}})};
  const second=await command('save_record',{...request,data:secondData},evaluator,operation);assert.equal(second.id,first.id,'dos primeras creaciones conservan una sola identidad');assert.equal(second.version,2);
  const lastData={...secondData,...(kind==='general'?{summary:'Último'}:kind==='action'?{action:'Último'}:{title:'Último',editor_fields:{nextReviewDate:'2027-02-01'}})};
  const last=await command('save_record',{id:first.id,version:1,data:lastData});assert.equal(last.version,3);assert.deepEqual(last.data,lastData);
  assert.equal((await command('save_record',{...request,data:secondData},evaluator,operation)).version,2);
  assert.deepEqual((await r.queryAs(coordinator,'select data from wash_records where id=$1',[last.id])).rows[0].data,lastData,'un reintento no revierte el último guardado');
  await assert.rejects(command('save_record',{...request,data:lastData},evaluator,operation),/OPERATION_REUSED/);
  await assert.rejects(command('save_record',{id:last.id,version:1,data:lastData},owner),/FORBIDDEN/);
  assert.equal((await r.queryAs(coordinator,'select count(*)::int as n from wash_records where facility_id=$1 and kind=$2 and record_key=$3',[facility.id,kind,record_key])).rows[0].n,1);
  const otherKey=kind==='general'?'population':record_key+':otro';const independent=await command('save_record',{...request,record_key:otherKey,data:kind==='general'?{populationServed:200}:data});
  await command('save_record',{id:last.id,version:1,data:lastData},evaluator);assert.deepEqual((await r.queryAs(coordinator,'select data from wash_records where id=$1',[independent.id])).rows[0].data,independent.data);
  if(kind==='monitor')monitor=(await r.queryAs(coordinator,'select * from wash_records where id=$1',[last.id])).rows[0];
 }
 const review=await command('monitor_status',{id:monitor.id,version:monitor.version,status:'review'},evaluator);const validated=await command('monitor_status',{id:monitor.id,version:review.version,status:'validated'});
 await assert.rejects(command('save_record',{id:monitor.id,version:1,data:monitor.data},evaluator),/RECORD_LOCKED/);
 assert.equal((await r.queryAs(coordinator,'select version from wash_records where id=$1',[monitor.id])).rows[0].version,validated.version);
 assert.equal((await r.queryAs(coordinator,"select count(*)::int as n from wash_snapshots where record_id=$1 and purpose='monitor_validation'",[monitor.id])).rows[0].n,1);
});
