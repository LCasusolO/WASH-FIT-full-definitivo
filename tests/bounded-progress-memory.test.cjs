const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {createRuntime}=require('./support/managed-runtime.cjs');

test('avance de 100 establecimientos conserva resultados y permisos con lotes acotados en servidor',async t=>{
 const r=await createRuntime();t.after(()=>r.close());
 const token=(await r.signIn({email:r.owner.email,password:'Fixture-password-123'})).data.session.access_token;
 let evaluations;
 await r.queued(async()=>{
  await r.db.exec('reset role');
  const reference=fs.readFileSync('supabase/migrations/20261024021612_inline_progress_numbers.sql','utf8').replaceAll('wash_private.batch_progress(','wash_private.progress_reference(');
  await r.db.exec(reference);
  const rows=(await r.db.query(`with facilities as (insert into wash_facilities(country_id,name) select $1,'Memoria '||n from generate_series(1,100) n returning id,name),teams as(insert into wash_teams(country_id,name) select $1,name from facilities returning id,name) insert into wash_evaluations(facility_id,team_id,name,kind,created_by) select f.id,t.id,'Evaluación inicial','initial',$2 from facilities f join teams t using(name) returning id,facility_id`,[r.country.id,r.owner.id])).rows;
  evaluations=rows.map(x=>x.id);
  await r.db.query(`insert into wash_records(facility_id,evaluation_id,kind,record_key,data,updated_by) select facility_id,id,'general','general',jsonb_build_object('facilityName','QA','level',case when row_number() over(order by id)%2=0 then 'Primer Nivel' else 'Segundo Nivel' end,'populationServed',0),$2 from wash_evaluations where id=any($1::uuid[])`,[evaluations,r.owner.id]);
  await r.db.query(`insert into wash_records(facility_id,evaluation_id,kind,record_key,data,updated_by) select e.facility_id,e.id,'indicator',k.key,jsonb_build_object('score',2,'notes','Texto'),$2 from wash_evaluations e cross join wash_private.catalog_keys k where e.id=any($1::uuid[])`,[evaluations,r.owner.id]);
 });
 const data=(await r.queryAs(token,'select wash_private.batch_progress($1::uuid[]) actual,wash_private.progress_reference($1::uuid[]) reference',[evaluations])).rows[0];
 assert.equal(Object.keys(data.actual).length,100);assert.deepEqual(data.actual,data.reference);
 for(const ids of [null,[],[evaluations[0],evaluations[0],null],[evaluations[1],evaluations[2],evaluations[3]]]){
  const x=(await r.queryAs(token,'select wash_private.batch_progress($1::uuid[]) actual,wash_private.progress_reference($1::uuid[]) reference',[ids])).rows[0];assert.deepEqual(x.actual,x.reference);
 }
 const stranger=await r.insert('bounded-no-access@example.invalid','Fixture-password-123',undefined,true),other=(await r.signIn({email:stranger.email,password:'Fixture-password-123'})).data.session.access_token;
 assert.deepEqual((await r.queryAs(other,'select wash_private.batch_progress($1::uuid[]) actual',[evaluations])).rows[0].actual,{});
 await assert.rejects(r.queryAs(token,'select wash_private.progress_chunk($1::uuid[])',[evaluations]),/permission denied/);
 // Instrumentación local: comprueba el límite real por invocación, sin inferirlo
 // a partir del texto de la implementación ni confundir esto con una carga remota.
 await r.queued(async()=>{await r.db.exec('reset role');await r.db.exec(`create or replace function wash_private.progress_chunk(requested uuid[]) returns jsonb language plpgsql stable security definer set search_path='' as $$begin if cardinality(requested)>10 then raise exception 'UNBOUNDED_CHUNK';end if;return wash_private.progress_reference(requested);end $$;`);});
 assert.deepEqual((await r.queryAs(token,'select wash_private.batch_progress($1::uuid[]) actual',[evaluations])).rows[0].actual,data.actual);
});
