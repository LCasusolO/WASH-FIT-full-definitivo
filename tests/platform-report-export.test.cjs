const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),Core=require('../js/core');
const {reportHtml}=require('../api/platform-report');
test('PDF multiusuario reutiliza los seis pasos, tablas y radar originales con datos escapados',async()=>{
 const generalInfo={...Core.defaults(),facilityName:'Hospital <script>no</script>',countryCode:'PER',summary:'Resumen QA'};
 const indicators=[{id:'A_1a',moduleId:'water',module:'Agua',title:'Agua segura',score:0,assessmentStatus:'assessed',severity:5,likelihood:5,action:'Reparación QA',monitoringComments:'Seguimiento QA',history:[]}];
 const html=await reportHtml({payload:{evaluation:{name:'Evaluación inicial'},participants:[{user_id:'qa',name:'Coordinador QA',role:'coordinator',active:true}],monitoring:[]},dataset:{generalInfo,indicators},facility:{name:'Hospital dos de mayo'},country:{name:'Perú',code:'PER'},job:{created_at:'2026-10-23'}});
 for(let n=1;n<=6;n++)assert.ok(html.includes('data-report-step="'+n+'"'));
 for(const text of ['report-assessment','report-radar','Reparación QA','Seguimiento QA','Coordinador QA','PER-Hospital_dos_mayo','break-before: page'])assert.ok(html.includes(text),text);
 assert.ok(!html.includes('<script>no'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('Puntuación / estado'));
});
test('descarga PDF y JSON con el mismo nombre anterior y genera PDF mediante WashChrome',async()=>{
 const downloads=[],generated=[],archive=[];const store={write:async()=>{}};
 const session={access_token:'fixture',user:{id:'owner'}};
 const client={auth:{getSession:async()=>({data:{session}})},rpc:async()=>({data:{id:'job-uuid'}})};
 const root={WashCore:Core,WashSupabase:{createClient:()=>client},WashStorage:{createStore:()=>store},WashChrome:{generate:async(...args)=>{generated.push(args);return new Blob(['%PDF-fixture'],{type:'application/pdf'});}},WashArchive:{save:async job=>{archive.push(job);return{files:[]};}}};
 const context=vm.createContext({window:root,fetch:async url=>url==='/api/platform-config'?Response.json({enabled:true,url:'fixture',key:'public'}):Response.json({html:'<!doctype html><div class="report-content">Original</div>',dataset:{facility:{name:'Hospital dos de mayo'},country:{code:'PER'}}}),localStorage:{setItem(){}},navigator:{},crypto:require('node:crypto'),Blob,URL:{createObjectURL:()=>'',revokeObjectURL(){}},indexedDB:{},setTimeout(){},document:{body:{appendChild(){}},createElement:()=>({click(){downloads.push(this.download)},remove(){}})}});
 vm.runInContext(fs.readFileSync('js/platform-client.js','utf8'),context);await root.WashPlatform.ready;await root.WashPlatform.exportFiles('e','f');
 assert.deepEqual(downloads,['PER-Hospital_dos_mayo.json','PER-Hospital_dos_mayo.pdf']);assert.equal(generated.length,1);assert.equal(generated[0][1],'PER-Hospital_dos_mayo');assert.equal(generated[0][2],'job-uuid');assert.equal(archive[0].dataset.generalInfo.facilityName,'Hospital dos de mayo');
});


test('Drive conserva el nombre acordado y busca versiones por exportación, sin sobrescribir otra',async()=>{
 const {createHandler}=require('../api/drive-archive');const metadata=[],queries=[];const id='00000000-0000-4000-8000-000000000001';
 const env={WASH_MULTIUSER:'true',WASH_APP_ORIGIN:'https://fixture.invalid',SUPABASE_URL:'https://supabase.invalid',SUPABASE_PUBLISHABLE_KEY:'public',GOOGLE_CLIENT_ID:'fixture',GOOGLE_CLIENT_SECRET:'fixture',GOOGLE_REFRESH_TOKEN:'fixture'};
 const request=async(url,opts)=>{
  if(url.includes('/auth/'))return Response.json({id:'owner',email_confirmed_at:'2026-10-23'});
  if(url.includes('wash_account_status'))return Response.json({ready:true});
  if(url.includes('wash_exports'))return Response.json([{id,created_by:'owner',facility_id:'f'}]);
  if(url.includes('oauth2'))return Response.json({access_token:'fixture',expires_in:3600});
  if(url.startsWith('https://www.googleapis.com/drive/v3/files?')){queries.push(new URL(url).searchParams.get('q'));return Response.json({files:[]});}
  if(url.includes('/upload/')){metadata.push(JSON.parse(opts.body));return new Response('',{headers:{location:'https://www.googleapis.com/upload/session'}});}
  throw Error(url);
 };
 const res={setHeader(){},status(code){this.code=code;return this},json(data){this.data=data}};
 await createHandler({env,request})({method:'POST',headers:{origin:env.WASH_APP_ORIGIN,authorization:'Bearer fixture'},body:{action:'start',exportId:id,facility:'Hospital dos de mayo',countryCode:'PER',jsonBytes:10,pdfBytes:20}},res);
 assert.equal(res.code,200,JSON.stringify(res.data));assert.deepEqual(metadata.map(x=>x.name),['PER-Hospital_dos_mayo.json','PER-Hospital_dos_mayo.pdf']);assert.ok(queries.every(q=>q.includes('washFitExport')&&q.includes(id)));assert.ok(metadata.every(m=>m.appProperties.washFitExport===id));
});
