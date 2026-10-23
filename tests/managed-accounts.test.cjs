const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');
test('cuentas administradas: autoridad, sesiones, altas y cambios de permisos',async t=>{
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_app_meta_data jsonb not null default '{}');
 create table auth.sessions(id uuid primary key,user_id uuid references auth.users,created_at timestamptz not null default now());
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('session_id',coalesce(nullif(current_setting('request.jwt.claim.session_id',true),''),current_setting('request.jwt.claim.sub',true)))$$;
 grant usage on schema auth to authenticated;grant execute on function auth.uid(),auth.jwt() to authenticated;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert on storage.objects to authenticated;`);
 for(const file of fs.readdirSync('supabase/migrations').sort())await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
 const users={};
 async function account(name,ready=true){await db.exec('reset role');const id=crypto.randomUUID();users[name]=id;await db.query(`insert into auth.users values($1,$2,now(),'{"wash_managed":true}')`,[id,name+'@example.invalid']);await db.query("update wash_accounts set username=$2,full_name=$2,status='active',must_change_password=$3 where user_id=$1",[id,name,!ready]);await db.query('insert into auth.sessions(id,user_id) values($1,$1)',[id]);return id;}
 async function as(name,sql,params=[]){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[users[name]||'']);await db.query("select set_config('request.jwt.claim.session_id','',false)");await db.exec('set role authenticated');return db.query(sql,params);}
 async function command(name,op,data){return (await as(name,'select wash_command($1,$2,$3) as result',[op,JSON.stringify(data),crypto.randomUUID()])).rows[0].result;}
 async function service(action,name,data={}){await db.exec('reset role');await db.exec('set role service_role');return(await db.query('select wash_account_service($1,$2,$3) as result',[action,users[name]||null,JSON.stringify(data)])).rows[0].result;}
 const owner=await account('owner');await db.query('insert into wash_owners values($1)',[owner]);
 await account('admin');await account('foreign');await account('editor');await account('coordinator');await account('second');await account('outsider');
 const country=await command('owner','country',{code:'PER',name:'Perú'}),other=await command('owner','country',{code:'BOL',name:'Bolivia'});
 await service('set_role','owner',{user_id:users.admin,scope:'country',country_id:country.id,role:'admin'});
 await service('set_role','owner',{user_id:users.foreign,scope:'country',country_id:other.id,role:'admin'});
 const facility=await command('admin','facility',{country_id:country.id,name:'Centro'}),team=await command('admin','team',{country_id:country.id,name:'Equipo'});
 const foreignTeam=await command('foreign','team',{country_id:other.id,name:'Otro'});
 await command('admin','assign',{team_id:team.id,facility_id:facility.id});
 await service('set_role','admin',{user_id:users.coordinator,scope:'team',team_id:team.id,role:'coordinator'});
 await service('set_role','admin',{user_id:users.editor,scope:'team',team_id:team.id,role:'evaluator'});
 const evaluation=await command('coordinator','evaluation',{facility_id:facility.id,team_id:team.id,name:'Inicial',kind:'initial'});
 await t.test('solo el propietario puede nombrar administradores y el administrador no cruza países',async()=>{
  await assert.rejects(service('set_role','admin',{user_id:users.outsider,scope:'country',country_id:country.id,role:'admin'}),/FORBIDDEN/);
  await assert.rejects(service('set_role','admin',{user_id:users.outsider,scope:'team',team_id:foreignTeam.id,role:'evaluator'}),/FORBIDDEN/);
  await assert.rejects(as('editor','select wash_account_service($1,$2,$3)',['list',owner,'{}']),/permission denied/);
  await assert.rejects(command('outsider','country',{code:'XXX',name:'No permitido'}),/FORBIDDEN/);
  await assert.rejects(command('owner','invite',{}),/USE_ACCOUNT_MANAGEMENT/);
 });
 await t.test('directorio limitado al ámbito del administrador y credenciales compartidas protegidas',async()=>{
  const list=await service('list','admin');assert.ok(list.some(u=>u.user_id===users.editor));assert.ok(!list.some(u=>u.user_id===users.foreign));
  await assert.rejects(service('reset_begin','admin',{user_id:owner}),/FORBIDDEN/);
  await service('set_role','owner',{user_id:users.editor,scope:'team',team_id:foreignTeam.id,role:'reader'});
  await assert.rejects(service('reset_begin','admin',{user_id:users.editor}),/SHARED_ACCOUNT_OWNER_REQUIRED/);
  await service('set_role','owner',{user_id:users.editor,scope:'team',team_id:foreignTeam.id,role:'remove'});
 });
 await t.test('cambios de rol actualizan evaluaciones abiertas y protegen al último coordinador',async()=>{
  await service('set_role','admin',{user_id:users.editor,scope:'team',team_id:team.id,role:'reader'});
  const p=(await as('coordinator','select * from wash_participants where user_id=$1',[users.editor])).rows[0];assert.equal(p.role,'reader');
  await assert.rejects(command('editor','save_record',{evaluation_id:evaluation.id,kind:'indicator',record_key:'A_1a',data:{score:1}}),/FORBIDDEN/);
  await assert.rejects(service('set_role','admin',{user_id:users.coordinator,scope:'team',team_id:team.id,role:'remove'}),/LAST_COORDINATOR/);
  await assert.rejects(service('set_role','owner',{user_id:users.admin,scope:'country',country_id:country.id,role:'remove'}),/LAST_COUNTRY_ADMIN/);
 });
 await t.test('suspensión y cambio obligatorio bloquean sesiones existentes, REST y escritura',async()=>{
  await service('suspend','owner',{user_id:users.editor});assert.equal((await as('editor','select * from wash_evaluations')).rows.length,0);
  await assert.rejects(command('editor','export',{evaluation_id:evaluation.id}),/ACCOUNT_SETUP_REQUIRED/);
  await service('reactivate','owner',{user_id:users.editor});assert.equal((await as('editor','select wash_account_status() as status')).rows[0].status.session_valid,false);
  await db.exec('reset role');await db.query("update auth.sessions set created_at=clock_timestamp()+interval '1 second' where user_id=$1",[users.editor]);
  assert.equal((await as('editor','select wash_account_status() as status')).rows[0].status.ready,true);
  await service('reset_begin','admin',{user_id:users.editor});assert.equal((await as('editor','select wash_account_status() as status')).rows[0].status.ready,false);
  await assert.rejects(as('editor',"update wash_accounts set must_change_password=false"),/permission denied/);
  await assert.rejects(service('suspend','owner',{user_id:owner}),/CANNOT_LOCK_SELF/);
 });
 await t.test('alta reservada e idempotente, cuenta pendiente sin acceso y registro público cerrado',async()=>{
  const request={request_id:crypto.randomUUID(),scope:'team',team_id:team.id,country_id:country.id,role:'evaluator',username:'nuevo-peru',name:'Nuevo',email:'nuevo@example.invalid'};
  const reserved=await service('reserve','admin',request);assert.equal(reserved.complete,false);
  await db.exec('reset role');const id=crypto.randomUUID();await db.query('insert into auth.users values($1,$2,null,$3)',[id,request.email,JSON.stringify({wash_managed:true,account_operation:request.request_id})]);
  await service('provision','admin',{request_id:request.request_id,user_id:id});assert.equal((await service('reserve','admin',request)).complete,true);
  await assert.rejects(service('reserve','admin',{...request,role:'reader'}),/OPERATION_REUSED/);
  await db.exec('reset role');const profile=(await db.query('select * from wash_accounts where user_id=$1',[id])).rows[0];assert.equal(profile.username,'nuevo-peru');assert.equal(profile.must_change_password,true);
  await assert.rejects(db.query('insert into auth.users(id,email) values($1,$2)',[crypto.randomUUID(),'public@example.invalid']),/REGISTRATION_CLOSED/);
 });
 await t.test('solo el propietario renombra usuarios sin cambiar su identidad ni asignaciones',async()=>{
  await assert.rejects(service('rename','admin',{user_id:users.editor,username:'nuevo-editor',name:'Editor'}),/FORBIDDEN/);
  await service('rename','owner',{user_id:users.editor,username:'nuevo-editor',name:'Editor actualizado'});
  const found=await service('lookup',null,{login:'nuevo-editor'});assert.equal(found.id,users.editor);
  const members=(await as('owner','select user_id from wash_team_members where team_id=$1',[team.id])).rows;assert.ok(members.some(m=>m.user_id===users.editor));
 });
 await t.test('degradar coordinador revoca la reapertura de mediciones validadas y conserva el snapshot histórico',async()=>{
  await command('coordinator','save_record',{evaluation_id:evaluation.id,kind:'general',record_key:'general',data:{facilityName:'Centro'}});
  const review=await command('coordinator','evaluation_status',{evaluation_id:evaluation.id,version:1,status:'review'});
  const validated=await command('coordinator','evaluation_status',{evaluation_id:evaluation.id,version:review.version,status:'validated'});
  await service('set_role','admin',{user_id:users.second,scope:'team',team_id:team.id,role:'coordinator'});
  await service('set_role','admin',{user_id:users.coordinator,scope:'team',team_id:team.id,role:'reader'});
  await assert.rejects(command('coordinator','evaluation_status',{evaluation_id:evaluation.id,version:validated.version,status:'editing',reason:'Intento tras degradación'}),/FORBIDDEN/);
  const snapshot=(await as('owner',"select data from wash_snapshots where evaluation_id=$1 and purpose='validation'",[evaluation.id])).rows[0].data;
  assert.equal(snapshot.participants.find(p=>p.user_id===users.coordinator).role,'coordinator');
 });

});
