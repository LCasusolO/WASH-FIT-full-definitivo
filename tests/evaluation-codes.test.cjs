const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createRuntime}=require('./support/managed-runtime.cjs');
test('nombres automáticos y códigos por establecimiento, sin saltos por reintento ni truncamiento después de 999',async t=>{
 const r=await createRuntime();t.after(()=>r.close());const actor=await r.insert('codes-admin@example.invalid','Fixture-codes-123',undefined,true);
 await r.queued(async()=>{await r.db.exec('reset role');await r.db.query("update wash_accounts set status='active',must_change_password=false where user_id=$1",[actor.id]);});
 await r.service('set_role',r.owner.id,{user_id:actor.id,scope:'country',country_id:r.country.id,role:'admin'});
 const token=(await r.signIn({email:actor.email,password:'Fixture-codes-123'})).data.session.access_token;
 const command=async(op,data,id=crypto.randomUUID())=>(await r.queryAs(token,'select wash_command($1,$2,$3) as data',[op,JSON.stringify(data),id])).rows[0].data;
 const facility=await command('facility',{country_id:r.country.id,name:'Centro códigos'}),team=await command('team',{country_id:r.country.id,name:'Equipo códigos'});
 await command('assign',{facility_id:facility.id,team_id:team.id});await r.service('set_role',r.owner.id,{user_id:actor.id,scope:'team',team_id:team.id,role:'coordinator'});
 async function validate(ev){
  await command('save_record',{facility_id:ev.facility_id,evaluation_id:ev.id,kind:'general',record_key:'identification',data:{facilityName:'Centro códigos'}});
  await command('save_record',{facility_id:ev.facility_id,evaluation_id:ev.id,kind:'indicator',record_key:'A_1a',data:{score:2}});
  const review=await command('evaluation_status',{evaluation_id:ev.id,status:'review',version:ev.version});return command('evaluation_status',{evaluation_id:ev.id,status:'validated',version:review.version});
 }
 const base={facility_id:facility.id,team_id:team.id};const first=await command('evaluation',{...base,kind:'initial',name:'Nombre manual ignorado'});assert.equal(first.name,'Evaluación inicial');await validate(first);
 const operation=crypto.randomUUID(),payload={...base,kind:'reassessment',previous_id:first.id};const one=await command('evaluation',payload,operation);assert.equal(one.name,'Reeval-001');
 assert.deepEqual(await command('evaluation',payload,operation),one);await assert.rejects(command('evaluation',{...payload,previous_id:crypto.randomUUID()},operation),/OPERATION_REUSED/);
 await assert.rejects(command('evaluation',payload),/ACTIVE_EVALUATION_EXISTS/);await validate(one);
 const two=await command('evaluation',{...payload,previous_id:one.id,name:'Código manual ignorado'});assert.equal(two.name,'Reeval-002');await validate(two);
 const secondFacility=await command('facility',{country_id:r.country.id,name:'Otro centro'});await command('assign',{facility_id:secondFacility.id,team_id:team.id});
 const initial=await command('evaluation',{facility_id:secondFacility.id,team_id:team.id,kind:'initial'});assert.equal(initial.name,'Evaluación inicial');await validate(initial);
 const independent=await command('evaluation',{facility_id:secondFacility.id,team_id:team.id,kind:'reassessment',previous_id:initial.id});assert.equal(independent.name,'Reeval-001');await validate(independent);
 await r.queued(async()=>{await r.db.exec('reset role');await r.db.query("insert into wash_evaluations(facility_id,team_id,name,kind,previous_id,created_by,status) values($1,$2,'Reeval-999','reassessment',$3,$4,'validated')",[secondFacility.id,team.id,initial.id,actor.id]);});
 const large=await command('evaluation',{facility_id:secondFacility.id,team_id:team.id,kind:'reassessment',previous_id:initial.id});assert.equal(large.name,'Reeval-1000');
});
