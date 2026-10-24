// Carga aislada: Auth ficticio, PostgreSQL embebido real y RPC reales. Nunca usa producción.
const {createRuntime}=require('../tests/support/managed-runtime.cjs');
const http=require('node:http'),crypto=require('node:crypto'),fs=require('node:fs'),assert=require('node:assert/strict');
const facilities=Number(process.env.LOAD_FACILITIES||100),evaluators=Number(process.env.LOAD_EVALUATORS||50),rounds=Number(process.env.LOAD_ROUNDS||10);
const percentile=(a,p)=>[...a].sort((x,y)=>x-y)[Math.min(a.length-1,Math.floor(a.length*p))]||0;
async function main(){
 assert.ok(Number.isSafeInteger(facilities)&&facilities>0&&facilities<=1000);assert.ok(Number.isSafeInteger(evaluators)&&evaluators>0&&evaluators<=200);assert.ok(Number.isSafeInteger(rounds)&&rounds>0&&rounds<=100);
 const r=await createRuntime();let server;
 try{
  const admin=await r.insert('load-admin@example.invalid','Load-fixture-123',undefined,true);
  const people=[];for(let i=0;i<evaluators;i++)people.push(await r.insert(`load-${i}@example.invalid`,'Load-fixture-123',undefined,true));
  await r.queued(async()=>{await r.db.exec('reset role');await r.db.exec("update wash_accounts set status='active',must_change_password=false");});
  await r.service('set_role',r.owner.id,{user_id:admin.id,scope:'country',country_id:r.country.id,role:'admin'});
  const teamCount=Math.min(10,evaluators,facilities),teams=[],evals=[];
  await r.queued(async()=>{
   await r.db.exec('reset role');
   for(let n=0;n<teamCount;n++){const team=(await r.db.query('insert into wash_teams(country_id,name) values($1,$2) returning id',[r.country.id,'Equipo '+n])).rows[0].id;teams.push(team);await r.db.query("insert into wash_team_members values($1,$2,'Coordinador carga','coordinator')",[team,admin.id]);}
   for(let n=0;n<people.length;n++)await r.db.query("insert into wash_team_members values($1,$2,$3,'evaluator')",[teams[n%teamCount],people[n].id,'Evaluador '+n]);
   for(let n=0;n<facilities;n++){
    const team=teams[n%teamCount],f=(await r.db.query('insert into wash_facilities(country_id,name) values($1,$2) returning id',[r.country.id,'Hospital de carga '+n])).rows[0].id;
    await r.db.query('insert into wash_assignments values($1,$2)',[team,f]);const e=(await r.db.query("insert into wash_evaluations(facility_id,team_id,name,kind,created_by) values($1,$2,'Evaluación inicial','initial',$3) returning id",[f,team,admin.id])).rows[0].id;
    await r.db.query('insert into wash_participants select $1,user_id,name,role,true from wash_team_members where team_id=$2',[e,team]);
    await r.db.query("insert into wash_records(facility_id,evaluation_id,kind,record_key,data,updated_by) values($1,$2,'general','general',$3,$4)",[f,e,JSON.stringify({facilityName:'Hospital de carga '+n,countryCode:'PER',level:'Primer Nivel',sanitationSystem:'alcantarillado'}),admin.id]);
    await r.db.query("insert into wash_records(facility_id,evaluation_id,kind,record_key,data,updated_by) select $1,$2,'indicator',key,'{\"score\":1,\"problemDesc\":\"Hallazgo de carga\",\"notes\":\"Base\"}'::jsonb,$3 from wash_private.catalog_keys",[f,e,admin.id]);
    let action,monitor;if(process.env.LOAD_WITH_PLAN==='1'){action=(await r.db.query("insert into wash_records(facility_id,evaluation_id,kind,record_key,data,updated_by) values($1,$2,'action','editor:A_1a',$3,$4) returning id",[f,e,JSON.stringify({indicator_id:'A_1a',action:'Acción base',resources:'Recursos base',responsible:'Coordinador',targetDate:'2027-01-01',cost:0,trackingStatus:'No Iniciado',change_reason:'Prueba de carga del plan'}),admin.id])).rows[0].id;monitor=(await r.db.query("insert into wash_records(facility_id,evaluation_id,kind,record_key,data,updated_by) values($1,$2,'monitor',$3,$4,$5) returning id",[f,e,'editor:'+team+':A_1a:initial',JSON.stringify({team_id:team,editor_indicator_id:'A_1a',editor_fields:{nextReviewDate:'2027-01-01'}}),admin.id])).rows[0].id;}
    const record=(await r.db.query("select id from wash_records where evaluation_id=$1 and kind='indicator' and record_key='A_1a'",[e])).rows[0].id;evals.push({id:e,facility:f,team,record,action,monitor});
   }
   await r.db.exec('analyze');
  });
  const token=(await r.signIn({email:admin.email,password:'Load-fixture-123'})).data.session.access_token;
  const tokens=[];for(const p of people)tokens.push((await r.signIn({email:p.email,password:'Load-fixture-123'})).data.session.access_token);
  async function measure(sql,params=[]){const t=performance.now(),res=await r.queryAs(token,sql,params);return{ms:performance.now()-t,bytes:Buffer.byteLength(JSON.stringify(res.rows)),rows:res.rows.length};}
  const records=await measure('select * from wash_records'),full=await measure('select wash_evaluation_checks(null) as data');
  const selected=await measure("select * from wash_records where facility_id=$1 and kind in ('action','monitor')",[evals[0].facility]);
  const progressName=process.env.LOAD_PROGRESS_RPC||'wash_evaluation_progress';assert.ok(['wash_evaluation_checks','wash_evaluation_progress'].includes(progressName));
  const summary=await measure(`select ${progressName}${progressName==='wash_evaluation_progress'?'()':'(null)'} as data`);
  const samples=[],failures=[],accepted=[],retrySamples=[],readSamples=[];let writes=0;
  server=http.createServer(async(req,res)=>{
   try{let raw='';for await(const c of req)raw+=c;const b=JSON.parse(raw),who=req.headers.authorization?.slice(7);const result=b.progress?(await r.queryAs(who,'select wash_evaluation_progress() as data')).rows[0].data:(await r.queryAs(who,'select wash_command($1,$2,$3) as data',[b.command,JSON.stringify(b.data),b.operation])).rows[0].data;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));}
   catch(e){res.statusCode=400;res.end(JSON.stringify({error:e.message}));}
  });server.keepAliveTimeout=65000;server.headersTimeout=66000;await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url='http://127.0.0.1:'+server.address().port;
  async function send(who,body,retry=false){const start=performance.now(),response=await fetch(url,{method:'POST',headers:{authorization:'Bearer '+who,'Content-Type':'application/json'},body:JSON.stringify(body)}),data=await response.json();(body.progress?readSamples:retry?retrySamples:samples).push(performance.now()-start);if(!response.ok){failures.push(data.error);return;}if(!retry&&!body.progress)writes++;return data;}
  const start=performance.now();
  const workers=await Promise.allSettled(tokens.map(async(who,n)=>{
   const allowed=evals.filter(e=>e.team===teams[n%teamCount]);
   for(let k=0;k<rounds;k++){
    if(process.env.LOAD_READ_EVERY&&k%Number(process.env.LOAD_READ_EVERY)===0)await send(who,{progress:true});
    const target=allowed[k%allowed.length],kind=process.env.LOAD_WITH_PLAN==='1'?k%3:0,field=(kind===0?['notes','problemDesc','associatedRisks']:kind===1?['action','resources','responsible']:['monitoringComments','correctiveMeasures','nextReviewDate'])[n%3],path=kind===2?['editor_fields',field]:[field],id=kind===0?target.record:kind===1?target.action:target.monitor,value=field==='nextReviewDate'?'2027-01-'+String(k%28+1).padStart(2,'0'):`Campo ${field}; evaluador ${n}; ronda ${k}`,body={command:'save_record',operation:crypto.randomUUID(),data:{id,version:1,data:{},field_changes:[{path,value}]}};
    const result=await send(who,body);if(result)accepted.push({id,path,value,version:result.version});
    if(k===0){const replay=await send(who,body,true);if(result)assert.equal(replay?.version,result.version,'reintento idempotente');}
   }
  }));for(const work of workers)if(work.status==='rejected')failures.push(work.reason.message);
  const seconds=(performance.now()-start)/1000,expected=new Map();for(const a of accepted){const key=a.id+':'+a.path.join('.');if(!expected.has(key)||a.version>expected.get(key).version)expected.set(key,a);}
  await r.queued(async()=>{await r.db.exec('reset role');for(const a of expected.values()){const row=(await r.db.query('select data from wash_records where id=$1',[a.id])).rows[0];assert.equal(a.path.reduce((value,key)=>value?.[key],row.data),a.value,'último guardado del campo');}});
  assert.equal(failures.length,0,JSON.stringify(failures.slice(0,4)));assert.equal(writes,evaluators*rounds);
  const report={environment:'isolated PGlite PostgreSQL, HTTP loopback, fake Auth; one SQL engine serializes sessions, not a production capacity estimate',facilities,evaluators,rounds,withPlan:process.env.LOAD_WITH_PLAN==='1',records,fullProgress:full,scopedRecords:selected,progress:summary,uniqueWrites:writes,retries:retrySamples.length,failed:failures.length,verifiedFields:expected.size,listReads:readSamples.length,readLatencyMs:{p50:percentile(readSamples,.5),p95:percentile(readSamples,.95)},seconds,requestsPerSecond:(samples.length+retrySamples.length+readSamples.length)/seconds,latencyMs:{p50:percentile(samples,.5),p95:percentile(samples,.95),max:Math.max(...samples)},rssBytes:process.memoryUsage().rss};
  fs.writeFileSync(process.env.LOAD_REPORT||'work/load-results.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{if(server)await new Promise(resolve=>server.close(resolve));await r.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
