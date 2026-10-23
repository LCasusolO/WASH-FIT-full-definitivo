const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createRuntime}=require('./support/managed-runtime.cjs'),{fill,catalog}=require('./support/complete-fixture.cjs'),Core=require('../js/core');
test('comprobación real de cinco pasos, cierre autorizado e indicadores concurrentes sin pérdidas entre indicadores',async t=>{
 const r=await createRuntime();t.after(()=>r.close());
 const person=await r.insert('completion-admin@example.invalid','Fixture-completion-123',undefined,true);
 await r.queued(async()=>{await r.db.exec('reset role');await r.db.query("update wash_accounts set status='active',must_change_password=false where user_id=$1",[person.id]);});
 await r.service('set_role',r.owner.id,{user_id:person.id,scope:'country',country_id:r.country.id,role:'admin'});
 const token=(await r.signIn({email:person.email,password:'Fixture-completion-123'})).data.session.access_token;
 const command=async(op,data,id=crypto.randomUUID(),who=token)=>(await r.queryAs(who,'select wash_command($1,$2,$3) as data',[op,JSON.stringify(data),id])).rows[0].data;
 const f=await command('facility',{country_id:r.country.id,name:'Centro comprobación'}),team=await command('team',{country_id:r.country.id,name:'Equipo comprobación'});
 await command('assign',{facility_id:f.id,team_id:team.id});await r.service('set_role',r.owner.id,{user_id:person.id,scope:'team',team_id:team.id,role:'coordinator'});
 const ev=await command('evaluation',{facility_id:f.id,team_id:team.id,kind:'initial'});
 const checks=async()=>(await r.queryAs(token,'select wash_evaluation_checks($1) as data',[ev.id])).rows[0].data;
 let p=await checks();assert.equal(p.complete,false);assert.equal(p.steps.length,5);assert.ok(p.issues.some(i=>i.field==='latitude'));assert.ok(p.issues.some(i=>i.step===2&&i.view==='assessment'&&i.module==='water'&&i.indicator==='A_1a'));
 assert.ok(p.issues.some(i=>i.field==='populationServed'&&i.step===1&&i.view==='general'));
 await assert.rejects(command('evaluation_status',{evaluation_id:ev.id,version:1,status:'validated'}),/EVALUATION_INCOMPLETE/);
 await assert.rejects(command('complete_evaluation',{evaluation_id:ev.id,version:1}),/EVALUATION_INCOMPLETE/);
 const other=await r.insert('completion-evaluator@example.invalid','Fixture-evaluator-123',undefined,true);await r.queued(async()=>{await r.db.exec('reset role');await r.db.query("update wash_accounts set status='active',must_change_password=false where user_id=$1",[other.id]);});await r.service('set_role',r.owner.id,{user_id:other.id,scope:'team',team_id:team.id,role:'evaluator'});
 const second=(await r.signIn({email:other.email,password:'Fixture-evaluator-123'})).data.session.access_token;
 const input={facility_id:f.id,evaluation_id:ev.id,kind:'indicator',record_key:'A_1a',data:{score:0}};
 const first=await command('save_record',input),op=crypto.randomUUID();const changed=await command('save_record',{id:first.id,version:1,data:{score:1}},op,second);
 const last=await command('save_record',{id:first.id,version:1,data:{score:2}});assert.equal(last.version,3);assert.equal(last.data.score,2);
 assert.equal((await command('save_record',{id:first.id,version:1,data:{score:1}},op,second)).data.score,1,'reintento devuelve el resultado original');
 assert.equal((await r.queryAs(token,'select data from wash_records where id=$1',[first.id])).rows[0].data.score,2,'reintento no restaura un dato anterior');
 const a2=await command('save_record',{...input,record_key:'A_2',data:{score:1}});await command('save_record',{...input,record_key:'A_2',data:{score:0}},crypto.randomUUID(),second);
 assert.equal((await r.queryAs(token,"select count(*)::int as n from wash_records where evaluation_id=$1 and kind='indicator' and record_key='A_2'",[ev.id])).rows[0].n,1);
 assert.equal((await r.queryAs(token,'select data from wash_records where id=$1',[first.id])).rows[0].data.score,2);
 for(const notes of ['', '   ', ' • ', 'No aplica', '123', '...']){await command('save_record',{id:first.id,version:1,data:{score:null,notes}});const progress=await checks();assert.equal(!progress.issues.some(i=>i.step===2&&i.indicator==='A_1a'),Core.assessmentComplete({score:null,notes}),notes);}
 p=await checks();for(const step of [3,4,5])assert.ok(p.issues.some(i=>i.step===step),String(step));
 await assert.rejects(command('complete_evaluation',{evaluation_id:ev.id,version:1},crypto.randomUUID(),second),/FORBIDDEN/);
 await r.queued(()=>fill(r.db,ev.id));p=await checks();assert.equal(p.complete,true,JSON.stringify(p.issues));assert.equal(p.percent,100);
 const general=(await r.queryAs(token,"select * from wash_records where evaluation_id=$1 and record_key='identification'",[ev.id])).rows[0];
 for(const value of [null,'',-1,1.5,'100',0,15000]){await command('save_record',{id:general.id,version:general.version++,data:{...general.data,populationServed:value}});const progress=await checks();const issue=progress.issues.find(i=>i.field==='populationServed');assert.equal(Boolean(issue),![0,15000].includes(value),String(value));if(issue)await assert.rejects(command('complete_evaluation',{evaluation_id:ev.id,version:1}),/EVALUATION_INCOMPLETE/);}
 general.data.populationServed=15000;
 for(const level of ['Primer Nivel','Segundo Nivel']){
  await command('save_record',{id:general.id,version:general.version,data:{...general.data,level}});general.version++;
  const progress=await checks();const rows=(await r.queryAs(token,"select * from wash_records where evaluation_id=$1 and kind='indicator'",[ev.id])).rows;const indicators=catalog.map(i=>({...i,...rows.find(r=>r.record_key===i.id)?.data}));
  assert.equal(progress.steps[1].total-1,indicators.filter(i=>Core.visibleIndicator(i,{...general.data,level},indicators)).length,'SQL y catálogo usan la misma aplicabilidad');
 }
 await r.queued(async()=>{await r.db.exec('reset role');await r.db.query("update wash_records set data=data||'{\"score\":0}'::jsonb where evaluation_id=$1 and kind='indicator'",[ev.id]);await fill(r.db,ev.id);await r.db.query("update wash_records set data=data-'cost' where evaluation_id=$1 and kind='action' and data->>'indicator_id'='A_2'",[ev.id]);});
 p=await checks();assert.equal(p.complete,false);assert.equal(p.percent,99,'no muestra 100% mientras existan pendientes');await r.queued(()=>fill(r.db,ev.id));
 const operation=crypto.randomUUID(),payload={evaluation_id:ev.id,version:1};const completed=await command('complete_evaluation',payload,operation);assert.equal(completed.status,'validated');assert.deepEqual(await command('complete_evaluation',payload,operation),completed);
 assert.equal((await r.queryAs(token,"select count(*)::int as n from wash_snapshots where evaluation_id=$1 and purpose='validation'",[ev.id])).rows[0].n,1);
 await assert.rejects(command('save_record',{id:first.id,version:1,data:{score:0}},crypto.randomUUID(),second),/FORBIDDEN/);
});
