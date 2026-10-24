const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {createRuntime}=require('./support/managed-runtime.cjs'),{fill}=require('./support/complete-fixture.cjs');
test('cálculo optimizado conserva todos los pendientes y progreso compacto respeta permisos',async t=>{
 const r=await createRuntime();t.after(()=>r.close());const token=(await r.signIn({email:r.owner.email,password:'Fixture-password-123'})).data.session.access_token;
 let ev;await r.queued(async()=>{await r.db.exec('reset role');const f=(await r.db.query("insert into wash_facilities(country_id,name) values($1,'Carga QA') returning id",[r.country.id])).rows[0].id,team=(await r.db.query("insert into wash_teams(country_id,name) values($1,'Carga QA') returning id",[r.country.id])).rows[0].id;ev=(await r.db.query("insert into wash_evaluations(facility_id,team_id,name,kind,created_by) values($1,$2,'Evaluación inicial','initial',$3) returning id",[f,team,r.owner.id])).rows[0].id;await r.db.query("insert into wash_participants values($1,$2,'Coordinador','coordinator',true)",[ev,r.owner.id]);
  const original=fs.readFileSync('supabase/migrations/20261023183721_required_population.sql','utf8').replaceAll('wash_private.evaluation_checks(','wash_private.evaluation_checks_reference(');await r.db.exec(original);
 });
 async function compare(){const result=(await r.queryAs(token,'select wash_evaluation_checks($1) as full,wash_private.evaluation_checks_reference($1) as reference,wash_evaluation_progress() as compact',[ev])).rows[0];assert.deepEqual(result.full,result.reference);const summary=result.compact[ev];assert.deepEqual(summary.steps,result.full.steps);assert.equal(summary.percent,result.full.percent);assert.equal(summary.issueCount,result.full.issues.length);assert.deepEqual(summary.issues,[]);assert.equal(summary.detailsLoaded,false);}
 await compare();await r.queued(()=>fill(r.db,ev));await compare();await r.queued(async()=>{await r.db.exec('reset role');await r.db.query("update wash_records set data=data||'{\"score\":0}'::jsonb where evaluation_id=$1 and kind='indicator' and record_key='A_1a'",[ev]);});await compare();
 // Tipos de establecimiento, ramales de saneamiento, no aplicabilidad,
 // valores límite y campos anidados deben conservar la comprobación completa.
 for(const changes of [
  {level:'Segundo Nivel',sanitationSystem:'insitu',populationServed:0},
  {level:'terciario',sanitationSystem:'alcantarillado',populationServed:1.5},
  {level:'Primer Nivel',sanitationSystem:'',populationServed:'42'},
  {level:'',sanitationSystem:'insitu',populationServed:-1},
  {level:'Tercer Nivel',sanitationSystem:'insitu',populationServed:9007199254740991}
 ]){await r.queued(async()=>{await r.db.exec('reset role');await r.db.query("update wash_records set data=data||$2::jsonb where evaluation_id=$1 and kind='general'",[ev,JSON.stringify(changes)]);});await compare();}
 await r.queued(async()=>{await r.db.exec('reset role');await r.db.query("update wash_records set data=jsonb_build_object('notes',case when record_key='S_11' then 'Justificación libre' else '•  ' end) where evaluation_id=$1 and kind='indicator'",[ev]);});await compare();
 await r.queued(async()=>{await r.db.exec('reset role');await r.db.query("update wash_records set data=data||'{\"score\":2}'::jsonb where evaluation_id=$1 and kind='indicator'",[ev]);});await compare();
 await r.queued(async()=>{await r.db.exec('reset role');await r.db.query("insert into wash_records(facility_id,evaluation_id,kind,record_key,data,updated_by) select facility_id,id,'general','override','{\"level\":\"Primer Nivel\",\"populationServed\":42}',created_by from wash_evaluations where id=$1",[ev]);});await compare();
 const other=await r.insert('load-no-access@example.invalid','Fixture-role-123',undefined,true);const otherToken=(await r.signIn({email:other.email,password:'Fixture-role-123'})).data.session.access_token;assert.deepEqual((await r.queryAs(otherToken,'select wash_evaluation_progress() as data')).rows[0].data,{});
 assert.deepEqual((await r.queryAs(otherToken,'select wash_private.batch_progress(array[$1]::uuid[]) as data',[ev])).rows[0].data,{});
 await r.queued(async()=>{await r.db.exec('reset role');await r.db.exec('set role anon');await assert.rejects(r.db.query('select wash_evaluation_progress()'),/permission denied/);});
});
