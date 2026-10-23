// Supabase Auth ficticio + PostgreSQL real embebido. Nunca conecta con producción.
const {PGlite}=require('@electric-sql/pglite'),fs=require('node:fs'),crypto=require('node:crypto'),path=require('node:path');
async function createRuntime(){
 const db=new PGlite();let queue=Promise.resolve();const passwords=new Map(),tokens=new Map(),people=new Map();
 const queued=fn=>{const work=queue.then(fn);queue=work.catch(()=>{});return work;};
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_app_meta_data jsonb not null default '{}');
 create table auth.sessions(id uuid primary key,user_id uuid references auth.users,created_at timestamptz default now());
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('session_id',current_setting('request.jwt.claim.session_id',true))$$;
 grant usage on schema auth to authenticated;grant execute on function auth.uid(),auth.jwt() to authenticated;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;`);
 for(const file of fs.readdirSync(path.join(__dirname,'../../supabase/migrations')).sort())await db.exec(fs.readFileSync(path.join(__dirname,'../../supabase/migrations',file),'utf8'));
 async function insert(email,password,metadata={wash_managed:true},confirmed=false){return queued(async()=>{
  await db.exec('reset role');const id=crypto.randomUUID();await db.transaction(async tx=>{
   // Mismo orden que GoTrue Admin: INSERT sin metadatos propios; UPDATE antes del COMMIT.
   await tx.query('insert into auth.users values($1,$2,$3,$4)',[id,email,confirmed?new Date().toISOString():null,JSON.stringify({provider:'email'})]);
   await tx.query('update auth.users set raw_app_meta_data=$1 where id=$2',[JSON.stringify(metadata),id]);
  });
  passwords.set(id,password);people.set(id,{id,email});return {id,email};
 });}
 async function user(id){return queued(async()=>{await db.exec('reset role');const r=(await db.query('select * from auth.users where id=$1',[id])).rows[0];return r?{id:r.id,email:r.email,email_confirmed_at:r.email_confirmed_at,aud:'authenticated',role:'authenticated',app_metadata:r.raw_app_meta_data,user_metadata:{},created_at:'2026-10-22T00:00:00Z'}:null;});}
 async function signIn({email,password}){
  const person=[...people.values()].find(p=>p.email===email);if(!person||passwords.get(person.id)!==password)return {data:{},error:{message:'Invalid credentials',code:'invalid_credentials'}};
  const u=await user(person.id);if(!u.email_confirmed_at)return {data:{},error:{code:'email_not_confirmed'}};
  const sid=crypto.randomUUID();await queued(async()=>{await db.exec('reset role');await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[sid,u.id]);});
  const jwt=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:u.id,session_id:sid,email:u.email,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated',aud:'authenticated'})).toString('base64url')+'.'+crypto.randomBytes(32).toString('base64url');
  const s={access_token:jwt,refresh_token:crypto.randomUUID(),token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user:u};tokens.set(jwt,{...s,sid});return{data:{session:s,user:u},error:null};
 }
 async function queryAs(token,sql,params=[]){return queued(async()=>{const s=tokens.get(token);if(!s)throw Error('AUTH_REQUIRED');await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[s.user.id]);await db.query("select set_config('request.jwt.claim.session_id',$1,false)",[s.sid]);await db.exec('set role authenticated');return db.query(sql,params);});}
 async function service(action,actor,data={}){return queued(async()=>{await db.exec('reset role');await db.exec('set role service_role');return (await db.query('select wash_account_service($1,$2,$3) as data',[action,actor,JSON.stringify(data)])).rows[0].data;});}
 const createClient=(url,key,opts={})=>{
  const token=(opts.global?.headers?.Authorization||'').replace(/^Bearer /,'');
  return {rpc:async(name,args)=>{try{if(key==='service')return{data:await service(args.p_action,args.p_actor,args.p_data),error:null};if(name==='wash_account_status')return{data:(await queryAs(token,'select wash_account_status() as data')).rows[0].data,error:null};throw Error('INVALID_RPC');}catch(e){return {data:null,error:{message:e.message}};}},auth:{
   signInWithPassword:signIn,getUser:async access=>({data:{user:tokens.has(access)?await user(tokens.get(access).user.id):null},error:tokens.has(access)?null:Error('Invalid token')}),
   resetPasswordForEmail:async()=>({data:{},error:null}),resend:async()=>({data:{},error:null}),
   admin:{createUser:async data=>{try{return{data:{user:await insert(data.email,data.password,data.app_metadata,data.email_confirm)},error:null};}catch(e){return{data:{},error:e};}},updateUserById:async(id,data)=>{if(!people.has(id))return{error:Error('Not found')};passwords.set(id,data.password);return{data:{user:await user(id)},error:null};}}
  }};
 };
 const request=async(url,opts)=>{const s=tokens.get((opts.headers.Authorization||'').replace(/^Bearer /,''));if(!s)return Response.json({error:'invalid'},{status:401});const {password}=JSON.parse(opts.body);if(password===passwords.get(s.user.id))return Response.json({code:'same_password'},{status:422});passwords.set(s.user.id,password);return Response.json(await user(s.user.id));};
 const {createHandler}=await import('../../supabase/functions/wash-accounts/handler.mjs');const handler=createHandler({createClient,url:'https://fixture.invalid',serviceKey:'service',anonKey:'public',request});
 const owner=await insert('owner@example.invalid','Fixture-password-123',undefined,true);
 await queued(async()=>{await db.exec('reset role');await db.query("update wash_accounts set username='propietario',full_name='Propietario QA',status='active',must_change_password=false where user_id=$1",[owner.id]);await db.query('insert into wash_owners values($1)',[owner.id]);});
 const country=await queued(async()=>{await db.exec('reset role');return(await db.query("insert into wash_countries(code,name) values('PER','Perú · QA') returning *")).rows[0];});
 async function call(body,token){const response=await handler(new Request('https://fixture.invalid/accounts',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)}));return {status:response.status,body:await response.json()};}
 return{db,handler,call,owner,country,tokens,people,passwords,signIn,user,queryAs,service,insert,queued,confirm:async id=>queued(async()=>{await db.exec('reset role');await db.query('update auth.users set email_confirmed_at=now() where id=$1',[id]);}),close:()=>db.close()};
}
module.exports={createRuntime};
