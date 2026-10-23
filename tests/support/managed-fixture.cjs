// QA local de cuentas: Auth ficticio, SQL/RLS y handler publicados reales.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {createRuntime}=require('./managed-runtime.cjs');
(async()=>{
 const r=await createRuntime();const port=59441,origin='http://127.0.0.1:'+port;
 await r.queued(async()=>{await r.db.exec('reset role');await r.db.query("insert into wash_facilities(country_id,name) values($1,'Establecimiento ficticio QA')",[r.country.id]);await r.db.query("insert into wash_teams(country_id,name) values($1,'Equipo ficticio QA')",[r.country.id]);});
 let qaEvaluation;
 if(process.env.WASH_QA_EVALUATION==='1')await r.queued(async()=>{
  await r.db.exec('reset role');const f=(await r.db.query('select id from wash_facilities limit 1')).rows[0].id,t=(await r.db.query('select id from wash_teams limit 1')).rows[0].id;
  await r.db.query("insert into wash_team_members values($1,$2,'Propietario QA','coordinator')",[t,r.owner.id]);await r.db.query('insert into wash_assignments values($1,$2)',[t,f]);
  qaEvaluation=(await r.db.query("insert into wash_evaluations(facility_id,team_id,name,kind,created_by) values($1,$2,'Evaluación ficticia QA','initial',$3) returning id",[f,t,r.owner.id])).rows[0].id;
  await r.db.query("insert into wash_participants values($1,$2,'Propietario QA','coordinator',true)",[qaEvaluation,r.owner.id]);
  if(process.env.WASH_QA_VALIDATED==='1'){
   await r.db.query("insert into wash_records(facility_id,evaluation_id,kind,record_key,data,updated_by) values($1,$2,'general','identification',$3,$4)",[f,qaEvaluation,JSON.stringify({facilityName:'Establecimiento ficticio QA',countryCode:'PER'}),r.owner.id]);
   await r.db.query("insert into wash_records(facility_id,evaluation_id,kind,record_key,data,updated_by) values($1,$2,'indicator','A_1a',$3,$4)",[f,qaEvaluation,JSON.stringify({score:0,problemDesc:'Falta reparar el abastecimiento',severity:5,likelihood:5}),r.owner.id]);
   await r.db.query("update wash_evaluations set status='validated' where id=$1",[qaEvaluation]);
  }

 });
 if(process.env.WASH_QA_ROLES==='1'){
  const team=await r.queued(async()=>{await r.db.exec('reset role');return(await r.db.query('select id from wash_teams limit 1')).rows[0].id;});
  for(const role of ['admin','coordinator','evaluator']){
   const person=await r.insert(role+'@example.invalid','Fixture-role-123',undefined,true);
   await r.queued(async()=>{await r.db.exec('reset role');await r.db.query("update wash_accounts set username=$2,full_name=$2,status='active',must_change_password=false where user_id=$1",[person.id,role+'-qa']);});
   await r.service('set_role',r.owner.id,{user_id:person.id,scope:role==='admin'?'country':'team',country_id:r.country.id,team_id:team,role});
  }
 }
 if(process.env.WASH_QA_TRANSFER==='1'){
  const team=await r.queued(async()=>{await r.db.exec('reset role');return(await r.db.query("insert into wash_teams(country_id,name) values($1,'Equipo destino QA') returning id",[r.country.id])).rows[0].id;});
  const person=await r.insert('destination@example.invalid','Fixture-role-123',undefined,true);
  await r.queued(async()=>{await r.db.exec('reset role');await r.db.query("update wash_accounts set username='destination-qa',full_name='Coordinadora destino QA',status='active',must_change_password=false where user_id=$1",[person.id]);});
  await r.service('set_role',r.owner.id,{user_id:person.id,scope:'team',country_id:r.country.id,team_id:team,role:'coordinator'});
 }
 if(process.env.WASH_QA_UNCONFIRMED==='1'){
  const person=await r.insert('unconfirmed@example.invalid','Fixture-role-123',undefined,false);
  await r.queued(async()=>{await r.db.exec('reset role');await r.db.query("update wash_accounts set username='unconfirmed-qa',status='active',must_change_password=false where user_id=$1",[person.id]);});
 }
 const accounts=require('../../api/accounts').createHandler({env:{WASH_MULTIUSER:'true',WASH_APP_ORIGIN:origin,SUPABASE_URL:origin,SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture'},request:(url,opts)=>r.handler(new Request(url,opts))});
 async function handle(req,res){
  const url=new URL(req.url,origin);res.setHeader('Cache-Control','no-store');res.status=n=>{res.statusCode=n;return res;};res.json=x=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(x));};
  let raw='';for await(const part of req){raw+=part;if(raw.length>20000)return res.status(413).end();}req.body=raw?JSON.parse(raw):{};
  const token=(req.headers.authorization||'').replace(/^Bearer /,'');
  if(url.pathname==='/api/platform-config')return res.json({enabled:true,url:origin,key:'sb_publishable_fixture'});
  if(url.pathname==='/api/accounts')return accounts(req,res);
  if(url.pathname==='/auth/v1/user'){const s=r.tokens.get(token);if(!s)return res.status(401).json({error:'No session'});return res.json(await r.user(s.user.id));}
  if(url.pathname==='/auth/v1/logout'){r.tokens.delete(token);return res.json({});}
  if(url.pathname==='/__qa/confirm'){let id=url.searchParams.get('user');if(!id)id=await r.queued(async()=>{await r.db.exec('reset role');return(await r.db.query('select user_id from wash_accounts where username=$1',[url.searchParams.get('username')])).rows[0]?.user_id;});await r.confirm(id);return res.json({confirmed:true});}
  if(url.pathname==='/rest/v1/rpc/wash_account_status')return res.json((await r.queryAs(token,'select wash_account_status() as data')).rows[0].data);
  if(url.pathname==='/rest/v1/rpc/wash_command')return res.json((await r.queryAs(token,'select wash_command($1,$2,$3) as data',[req.body.p_command,JSON.stringify(req.body.p_data),req.body.p_operation])).rows[0].data);
  if(url.pathname.startsWith('/rest/v1/')){
   const table=url.pathname.split('/').at(-1);if(!/^wash_[a-z_]+$/.test(table))return res.status(400).json({});
   const params=[],where=[];for(const [k,v]of url.searchParams){if(['select','order','offset','limit'].includes(k))continue;if(!/^[a-z_]+$/.test(k)||!v.startsWith('eq.'))return res.status(400).json({});params.push(v.slice(3));where.push('"'+k+'"=$'+params.length);}
   return res.json((await r.queryAs(token,'select * from public."'+table+'"'+(where.length?' where '+where.join(' and '):'')+' limit '+Math.min(1000,Number(url.searchParams.get('limit')||1000))+' offset '+Number(url.searchParams.get('offset')||0),params)).rows);
  }
  const root=path.resolve(__dirname,'../../dist'),file=path.resolve(root,'.'+(url.pathname==='/'?'/plataforma.html':decodeURIComponent(url.pathname)));if(!file.startsWith(root+path.sep))return res.status(403).end();
  const types={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css'};try{const data=fs.readFileSync(file);res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.end(data);}catch{return res.status(404).end();}
 }
 http.createServer((req,res)=>handle(req,res).catch(e=>res.status(400).json({message:e.message}))).listen(port,'127.0.0.1',()=>process.stdout.write('QA cuentas '+origin+'/plataforma.html\n'+(qaEvaluation?origin+'/index.html?evaluation='+qaEvaluation+'\n':'' )));
})();
