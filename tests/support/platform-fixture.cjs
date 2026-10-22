// Servidor aislado para QA de interfaz. No usa cuentas, secretos ni servicios reales.
// node tests/support/platform-fixture.cjs (solo 127.0.0.1; datos efímeros)
const {PGlite}=require('@electric-sql/pglite');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Core=require('../../js/core');
const db=new PGlite();let queue=Promise.resolve();
const users={coordinator:{id:'00000000-0000-4000-8000-000000000001',email:'coordinator@example.invalid'},editor:{id:'00000000-0000-4000-8000-000000000002',email:'editor@example.invalid'}};
const ids={country:'00000000-0000-4000-8000-000000000010',facility:'00000000-0000-4000-8000-000000000020',team:'00000000-0000-4000-8000-000000000030',evaluation:'00000000-0000-4000-8000-000000000040'};
function token(user){return Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:user.id,email:user.email,exp:Math.floor(Date.now()/1000)+3600,aud:'authenticated',role:'authenticated'})).toString('base64url')+'.fixture';}
function session(user){return {access_token:token(user),refresh_token:'fixture-'+user.id,token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user:{...user,aud:'authenticated',role:'authenticated',email_confirmed_at:'2026-10-22T00:00:00Z',created_at:'2026-10-22T00:00:00Z',app_metadata:{provider:'email',providers:['email']},user_metadata:{}}};}
function as(user,fn){const pending=queue.then(async()=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user.id]);await db.exec('set role authenticated');return fn();});queue=pending.catch(()=>{});return pending;}
async function handle(req,res){
 const url=new URL(req.url,'http://127.0.0.1:'+req.socket.localPort),origin=url.origin;
 res.status=code=>{res.statusCode=code;return res;};res.json=value=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));};
 const buffers=[];for await(const chunk of req)buffers.push(chunk);const raw=Buffer.concat(buffers).toString();let body;try{body=raw?JSON.parse(raw):{};}catch{return res.status(400).json({error:'JSON inválido'});}req.body=body;
 res.setHeader('Cache-Control','no-store');
 const auth=req.headers.authorization||'';let user;
 try{const sub=JSON.parse(Buffer.from(auth.split('.')[1],'base64url')).sub;user=Object.values(users).find(u=>u.id===sub);}catch{}
 if(url.pathname==='/api/platform-config')return res.json({enabled:true,url:origin,key:'sb_publishable_fixture'});
 if(url.pathname==='/auth/v1/token'){
   const person=Object.values(users).find(u=>u.email===body.email||body.refresh_token==='fixture-'+u.id);
   if(!person||body.password&&body.password!=='Fixture-password-123')return res.status(400).json({error:'invalid_grant',msg:'Credenciales de prueba incorrectas'});
   return res.json(session(person));
 }
 if(url.pathname==='/auth/v1/user'){if(!user)return res.status(401).json({error:'unauthorized'});return res.json(session(user).user);}
 if(url.pathname==='/auth/v1/logout')return res.json({});
 if(url.pathname==='/rest/v1/rpc/wash_command'){
   if(!user)return res.status(401).json({message:'AUTH_REQUIRED'});
   try{const r=await as(user,()=>db.query('select wash_command($1,$2::jsonb,$3) as data',[body.p_command,JSON.stringify(body.p_data),body.p_operation]));return res.json(r.rows[0].data);}catch(e){return res.status(e.code==='40001'?409:400).json({code:e.code,message:e.message,details:e.detail});}
 }
 if(url.pathname.startsWith('/rest/v1/')){
   if(!user)return res.status(401).json({message:'AUTH_REQUIRED'});const table=url.pathname.split('/').at(-1);if(!/^wash_[a-z_]+$/.test(table))return res.status(400).json({});
   const params=[],where=[];for(const [k,v]of url.searchParams){if(['select','order','offset','limit'].includes(k))continue;if(!/^[a-z_]+$/.test(k)||!v.startsWith('eq.'))return res.status(400).json({});params.push(v.slice(3));where.push('"'+k+'"=$'+params.length);}
   const order=(url.searchParams.get('order')||'').split(',').filter(Boolean).map(k=>{const [field,dir]=k.split('.');if(!/^[a-z_]+$/.test(field))throw Error('Invalid order');return '"'+field+'" '+(dir==='desc'?'desc':'asc');});
   const sql='select * from public."'+table+'"'+(where.length?' where '+where.join(' and '):'')+(order.length?' order by '+order.join(','):'')+' limit '+Math.min(1000,Number(url.searchParams.get('limit')||1000))+' offset '+Number(url.searchParams.get('offset')||0);
   try{return res.json((await as(user,()=>db.query(sql,params))).rows);}catch(e){return res.status(400).json({code:e.code,message:e.message});}
 }
 if(url.pathname==='/api/platform-report')return require('../../api/platform-report').createHandler({env:{WASH_MULTIUSER:'true',SUPABASE_URL:origin,SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture'}})(req,res);
 if(url.pathname==='/api/chrome-report')return require('../../api/chrome-report').createHandler({env:{WASH_MULTIUSER:'true',SUPABASE_URL:origin,SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture',WASH_APP_ORIGIN:origin,WASH_CHROME_EXECUTABLE:'C:/Program Files/Google/Chrome/Application/chrome.exe'}})(req,res);
 if(url.pathname==='/api/drive-archive')return res.status(503).json({error:'Drive no se conecta en el entorno de QA.'});
 const root=path.resolve(__dirname,'../../dist');const file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));
 if(!file.startsWith(root+path.sep))return res.status(403).end();
 const types={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.png':'image/png'};
 fs.readFile(file,(error,data)=>{if(error)return res.status(404).end();res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.end(data);});
}
(async()=>{
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;`);
 for(const file of fs.readdirSync(path.join(__dirname,'../../supabase/migrations')).sort())await db.exec(fs.readFileSync(path.join(__dirname,'../../supabase/migrations',file),'utf8'));
 for(const user of Object.values(users))await db.query('insert into auth.users values($1,$2,now())',[user.id,user.email]);
 await db.query('insert into wash_countries values($1,$2,$3)',[ids.country,'PER','Perú · QA']);
 await db.query('insert into wash_facilities(id,country_id,name) values($1,$2,$3)',[ids.facility,ids.country,'Establecimiento ficticio QA']);
 await db.query('insert into wash_teams(id,country_id,name) values($1,$2,$3)',[ids.team,ids.country,'Equipo QA']);
 for(const [key,user]of Object.entries(users))await db.query('insert into wash_team_members values($1,$2,$3,$4)',[ids.team,user.id,key,key==='coordinator'?'coordinator':'evaluator']);
 await db.query('insert into wash_assignments values($1,$2)',[ids.team,ids.facility]);
 await as(users.coordinator,()=>db.query('select wash_command($1,$2,$3)',['evaluation',JSON.stringify({id:ids.evaluation,facility_id:ids.facility,team_id:ids.team,name:'Evaluación inicial QA',kind:'initial'}),crypto.randomUUID()]));
 await as(users.coordinator,()=>db.query('select wash_command($1,$2,$3)',['save_record',JSON.stringify({evaluation_id:ids.evaluation,kind:'general',record_key:'general',data:{...Core.defaults(),facilityName:'Establecimiento ficticio QA',countryCode:'PER'}}),crypto.randomUUID()]));
 for(const port of [59439,59440])http.createServer((req,res)=>handle(req,res).catch(e=>{res.statusCode=500;res.end(JSON.stringify({error:e.message}));})).listen(port,'127.0.0.1',()=>process.stdout.write('QA http://127.0.0.1:'+port+'/plataforma.html\n'));
})();
