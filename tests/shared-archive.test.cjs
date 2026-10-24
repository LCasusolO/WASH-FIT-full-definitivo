const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createRuntime}=require('./support/managed-runtime.cjs'),{fill}=require('./support/complete-fixture.cjs');
const {createHandler}=require('../api/drive-archive');
test('dos cuentas, cierre, reintentos y subidas simultáneas comparten una pareja por establecimiento',async t=>{
 const r=await createRuntime();t.after(()=>r.close());
 const first=await r.insert('first-export@example.invalid','Fixture-first-123',undefined,true);
 await r.queued(async()=>{await r.db.exec('reset role');await r.db.query("update wash_accounts set status='active',must_change_password=false where user_id=$1",[first.id]);});
 await r.service('set_role',r.owner.id,{user_id:first.id,scope:'country',country_id:r.country.id,role:'admin'});
 const token=(await r.signIn({email:first.email,password:'Fixture-first-123'})).data.session.access_token;
 const cmd=async(who,op,data,operation=crypto.randomUUID())=>(await r.queryAs(who,'select wash_command($1,$2,$3) as data',[op,JSON.stringify(data),operation])).rows[0].data;
 const f=await cmd(token,'facility',{country_id:r.country.id,name:'Hospital QA'}),team=await cmd(token,'team',{country_id:r.country.id,name:'Equipo QA'});
 await r.service('set_role',r.owner.id,{user_id:first.id,scope:'team',team_id:team.id,role:'coordinator'});await cmd(token,'assign',{facility_id:f.id,team_id:team.id});
 const e=await cmd(token,'evaluation',{facility_id:f.id,team_id:team.id,kind:'initial'});
 const second=await r.insert('second-export@example.invalid','Fixture-second-123',undefined,true);
 await r.queued(async()=>{await r.db.exec('reset role');await r.db.query("update wash_accounts set status='active',must_change_password=false where user_id=$1",[second.id]);});
 await r.service('set_role',r.owner.id,{user_id:second.id,scope:'team',team_id:team.id,role:'evaluator'});
 const token2=(await r.signIn({email:second.email,password:'Fixture-second-123'})).data.session.access_token;
 const makeJob=(who,evaluation=e)=>cmd(who,'export',{facility_id:f.id,evaluation_id:evaluation.id});
 const job1=await makeJob(token),job2=await makeJob(token2);
 const env={WASH_MULTIUSER:'true',WASH_APP_ORIGIN:'https://fixture.invalid',SUPABASE_URL:'https://supabase.invalid',SUPABASE_PUBLISHABLE_KEY:'public',GOOGLE_CLIENT_ID:'fixture',GOOGLE_CLIENT_SECRET:'fixture',GOOGLE_REFRESH_TOKEN:'fixture',GOOGLE_DRIVE_FOLDER_ID:'fixture-folder'};
 const stored=new Map(),sessions=new Map();let creates=0,patches=0;
 const request=async(url,opts={})=>{
  const who=(opts.headers?.Authorization||'').replace(/^Bearer /,'');
  if(url.includes('/auth/'))return Response.json(r.tokens.get(who).user);
  if(url.includes('wash_account_status'))return Response.json((await r.queryAs(who,'select wash_account_status() as data')).rows[0].data);
  if(url.includes('/rpc/wash_command')){const b=JSON.parse(opts.body);return Response.json(await cmd(who,b.p_command,b.p_data,b.p_operation));}
  if(url.includes('/rest/v1/wash_exports')){const id=new URL(url).searchParams.get('id').slice(3);return Response.json((await r.queryAs(who,'select * from wash_exports where id=$1',[id])).rows);}
  if(url.includes('oauth2'))return Response.json({access_token:'google',expires_in:3600});
  if(url.startsWith('https://www.googleapis.com/drive/v3/files?')){
   const q=new URL(url).searchParams.get('q');assert.ok(q.includes('washFitFacility'));assert.ok(!q.includes('washFitExport'));
   const name=q.match(/name = '([^']+)'/)?.[1],evaluation=q.match(/key='washFitEvaluation' and value='([^']+)'/)?.[1];
   return Response.json({files:[...stored.values()].filter(x=>!x.trashed&&q.includes("value='"+x.appProperties.washFitFacility+"'")&&q.includes("mimeType = '"+x.mimeType+"'")&&(x.name===name||(evaluation&&x.appProperties.washFitEvaluation===evaluation))).map(x=>({id:x.id}))});
  }
  if(url.includes('/upload/drive/')){
   const data=JSON.parse(opts.body);let id;
   if(opts.method==='POST'){id='created-file-'+(++creates);stored.set(id,{id,...data});}
   else{id=new URL(url).pathname.split('/').pop();patches++;assert.ok(stored.has(id));stored.set(id,{...stored.get(id),...data});}
   const session='https://www.googleapis.com/upload/session-'+crypto.randomUUID();sessions.set(session,{id,bytes:opts.headers['X-Upload-Content-Length']});return new Response('',{headers:{location:session}});
  }
  if(sessions.has(url)){const s=sessions.get(url);stored.get(s.id).size=s.bytes;stored.get(s.id).content=opts.body?.toString();return Response.json({id:s.id});}
  const id=new URL(url).pathname.split('/').pop(),file=stored.get(id);assert.ok(file,url);
  if(opts.method==='PATCH'){Object.assign(file,JSON.parse(opts.body));return Response.json(file);}
  return Response.json(file);
 };
 const handler=createHandler({env,request});
 async function call(who,body){const res={setHeader(){},status(code){this.code=code;return this;},json(data){this.data=data;}};await handler({method:'POST',headers:{origin:env.WASH_APP_ORIGIN,authorization:'Bearer '+who},body},res);return res;}
 const start=(who,job)=>call(who,{action:'start',exportId:job.id,facility:'Hospital QA',countryCode:'PER',jsonBytes:4,pdfBytes:4});
 async function finish(who,s){assert.equal(s.code,200,JSON.stringify(s.data));const ids=[];for(const kind of ['json','pdf']){const u=await call(who,{action:'upload',receipt:s.data.receipt,kind,offset:0,data:Buffer.from('test').toString('base64')});assert.equal(u.code,200,JSON.stringify(u.data));ids.push(u.data.id);}const v=await call(who,{action:'verify',receipt:s.data.receipt,ids});assert.equal(v.code,200,JSON.stringify(v.data));return v.data.files.map(x=>x.id);}
 const initial=await start(token,job1);const busy=await start(token2,job2);assert.equal(busy.code,409);assert.equal(busy.data.code,'ARCHIVE_BUSY');assert.equal(creates,2);
 await assert.rejects(cmd(token2,'archive_renew',{export_id:job1.id},crypto.randomUUID()),/FORBIDDEN/);
 await assert.rejects(r.queryAs(token,'select * from wash_private.archive_leases'),/permission denied/);
 const ids=await finish(token,initial);assert.deepEqual(await finish(token2,await start(token2,job2)),ids);assert.equal(creates,2);assert.equal(patches,2);
 // Copias antiguas de otras exportaciones de la misma app, y un archivo ajeno.
 for(const file of [...stored.values()])stored.set('duplicate-'+file.id,{...structuredClone(file),id:'duplicate-'+file.id,appProperties:{...file.appProperties,washFitExport:'old-job'}});
 stored.set('foreign-file',{id:'foreign-file',mimeType:'application/pdf',name:'PER-Hospital_QA.pdf',appProperties:{washFitFacility:'other-facility'},parents:['fixture-folder']});
 await r.queued(()=>fill(r.db,e.id));await cmd(token,'complete_evaluation',{evaluation_id:e.id,version:e.version});
 const finalJob=await makeJob(token);assert.deepEqual(await finish(token,await start(token,finalJob)),ids);
 assert.equal([...stored.values()].filter(x=>!x.trashed&&x.appProperties.washFitFacility===f.id).length,2);assert.equal(stored.get('foreign-file').trashed,undefined);assert.equal(creates,2);
 const reeval=await cmd(token,'evaluation',{facility_id:f.id,team_id:team.id,kind:'reassessment',previous_id:e.id});
 const reevalIds=await finish(token,await start(token,await makeJob(token,reeval)));assert.notDeepEqual(reevalIds,ids);assert.equal(creates,4);assert.ok(reevalIds.every(id=>stored.get(id).name.includes('_Reevaluación001.')));
 assert.deepEqual(await finish(token2,await start(token2,await makeJob(token2,reeval))),reevalIds);assert.equal(creates,4);assert.ok(ids.every(id=>!stored.get(id).name.includes('Reevaluación')));
 const legacy=await start(token,finalJob);const body=JSON.parse(Buffer.from(legacy.data.receipt.split('.')[0],'base64url').toString());delete body.archiveVersion;const payload=Buffer.from(JSON.stringify(body)).toString('base64url'),signature=crypto.createHmac('sha256',env.GOOGLE_CLIENT_SECRET).update(payload).digest('base64url');assert.equal((await call(token,{action:'status',receipt:payload+'.'+signature,kind:'json'})).data.code,'ARCHIVE_SESSION_EXPIRED');
 const expired=await start(token,finalJob);await r.queued(async()=>{await r.db.exec('reset role');await r.db.exec("update wash_private.archive_leases set expires_at=now()-interval '1 second'");});
 const stale=await call(token,{action:'status',receipt:expired.data.receipt,kind:'json'});assert.equal(stale.data.code,'ARCHIVE_SESSION_EXPIRED');
 assert.deepEqual(await finish(token2,await start(token2,await makeJob(token2))),ids);assert.equal(creates,4);
});
