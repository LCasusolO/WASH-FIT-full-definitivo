const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createRuntime}=require('./support/managed-runtime.cjs');
test('permisos planos equivalen a los anteriores para país, equipo, participantes y revocaciones',async t=>{
 const r=await createRuntime();t.after(()=>r.close());
 const actors=[r.owner];for(let i=0;i<5;i++)actors.push(await r.insert(`flat${i}@example.invalid`,'Fixture-password-123',undefined,true));
 const result=await r.queued(async()=>{await r.db.exec('reset role');
  const c=(await r.db.query("insert into wash_countries(code,name) values('ZZZ','Otro') returning id")).rows[0].id;
  const fs=[],es=[];for(const country of [r.country.id,r.country.id,c]){
   const f=(await r.db.query("insert into wash_facilities(country_id,name) values($1,'F') returning id",[country])).rows[0].id;
   const team=(await r.db.query("insert into wash_teams(country_id,name) values($1,'T') returning id",[country])).rows[0].id;
   const e=(await r.db.query("insert into wash_evaluations(facility_id,team_id,name,kind,created_by) values($1,$2,'E','initial',$3) returning id",[f,team,r.owner.id])).rows[0].id;
   fs.push(f);es.push(e);await r.db.query('insert into wash_assignments values($1,$2)',[team,f]);
   if(fs.length===1){await r.db.query("insert into wash_team_members values($1,$2,'Miembro','evaluator')",[team,actors[3].id]);await r.db.query("insert into wash_participants values($1,$2,'Participante','evaluator',true)",[e,actors[4].id]);}
  }
  await r.db.query("insert into wash_country_members(country_id,user_id,role) values($1,$2,'admin'),($1,$3,'admin')",[r.country.id,actors[1].id,actors[2].id]);
  return {fs,es};
 });
 const compare=async()=>r.queued(async()=>{await r.db.exec('reset role');for(const a of actors){await r.db.query("select set_config('request.jwt.claim.sub',$1,false)",[a.id]);for(const [type,ids]of [['facility',result.fs],['evaluation',result.es]])for(const id of [...ids,crypto.randomUUID(),null]){const x=(await r.db.query(`select wash_private.read_${type}_flat($1) as flat,wash_private.read_${type}_before_flat($1) as old,wash_private.read_${type}($1) as trial`,[id])).rows[0];assert.equal(x.flat,x.old,`${type} ${a.email} ${id}`);assert.equal(x.trial,x.old);}}});
 await compare();await r.queued(async()=>{await r.db.exec('reset role');await r.db.exec('delete from wash_team_members;update wash_participants set active=false;delete from wash_country_members');});await compare();
});
