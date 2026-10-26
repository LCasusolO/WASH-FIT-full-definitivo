const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createRuntime}=require('./support/managed-runtime.cjs');
test('cuatro integrantes conservan campos distintos y prevalece el último guardado del mismo campo',async t=>{
 const r=await createRuntime();t.after(()=>r.close());const members=[];
 for(let n=0;n<4;n++)members.push(await r.insert(`four-${n}@example.invalid`,'Fixture-password-123',undefined,true));
 let f,team,e,id;
 await r.queued(async()=>{await r.db.exec('reset role');
  f=(await r.db.query("insert into wash_facilities(country_id,name) values($1,'Cuatro integrantes') returning id",[r.country.id])).rows[0].id;
  team=(await r.db.query("insert into wash_teams(country_id,name) values($1,'Equipo único del establecimiento') returning id",[r.country.id])).rows[0].id;
  e=(await r.db.query("insert into wash_evaluations(facility_id,team_id,name,kind,created_by) values($1,$2,'Evaluación inicial','initial',$3) returning id",[f,team,r.owner.id])).rows[0].id;
  await r.db.query('insert into wash_assignments values($1,$2)',[team,f]);
  for(let n=0;n<4;n++){const role=n===0?'coordinator':'evaluator';await r.db.query("update wash_accounts set status='active',must_change_password=false where user_id=$1",[members[n].id]);await r.db.query('insert into wash_team_members values($1,$2,$3,$4)',[team,members[n].id,'Integrante '+n,role]);await r.db.query('insert into wash_participants values($1,$2,$3,$4,true)',[e,members[n].id,'Integrante '+n,role]);}
  id=(await r.db.query("insert into wash_records(facility_id,evaluation_id,kind,record_key,data,updated_by) values($1,$2,'indicator','A_1a','{}',$3) returning id",[f,e,r.owner.id])).rows[0].id;
 });
 const tokens=[];for(const member of members)tokens.push((await r.signIn({email:member.email,password:'Fixture-password-123'})).data.session.access_token);
 const patch=(n,field,value,operation=crypto.randomUUID())=>r.queryAs(tokens[n],"select wash_command_fields('save_record',$1::jsonb,$2::uuid) result",[JSON.stringify({id,version:1,data:{},field_changes:[{path:[field],value}]}),operation]);
 // El runtime serializa transacciones de Postgres embebido: verifica semántica
 // de versiones obsoletas, no pretende medir capacidad de 400 dispositivos.
 await Promise.all([patch(0,'notes','Nota'),patch(1,'problemDesc','Problema'),patch(2,'associatedRisks','Riesgo'),patch(3,'severity',8)]);
 let row=(await r.queryAs(tokens[0],'select data,version from wash_records where id=$1',[id])).rows[0];
 assert.equal(row.data.notes,'Nota');assert.equal(row.data.problemDesc,'Problema');assert.equal(row.data.associatedRisks,'Riesgo');assert.equal(row.data.severity,8);
 const replay=crypto.randomUUID();await patch(0,'notes','Anterior',replay);await patch(3,'notes','Último guardado');
 const version=(await r.queryAs(tokens[0],'select version from wash_records where id=$1',[id])).rows[0].version;
 await patch(0,'notes','Anterior',replay);
 row=(await r.queryAs(tokens[0],'select data,version from wash_records where id=$1',[id])).rows[0];assert.equal(row.data.notes,'Último guardado');assert.equal(row.version,version);assert.equal(row.data.problemDesc,'Problema');
});
