const test=require('node:test'),assert=require('node:assert/strict');
const {authorize,exportAccess}=require('../server/platform.cjs');
const Chrome=require('../api/chrome-report');
const Drive=require('../api/drive-archive');
const {reportHtml}=require('../api/platform-report');
const {gzipSync}=require('node:zlib');
const env={WASH_MULTIUSER:'true',SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture',WASH_APP_ORIGIN:'https://wash.example',GOOGLE_CLIENT_ID:'fixture',GOOGLE_CLIENT_SECRET:'fixture',GOOGLE_REFRESH_TOKEN:'fixture'};
function response(){return {headers:{},setHeader(k,v){this.headers[k]=v;},status(s){this.code=s;return this;},json(data){this.data=data;return this;},end(data){this.data=data;}};}
test('API exige sesión verificada y no confía en user_id del navegador',async()=>{
  await assert.rejects(authorize({headers:{}},env,()=>{throw Error('No debe consultar');}),e=>e.status===401);
  await assert.rejects(authorize({headers:{authorization:'Bearer fixture'}},env,async()=>Response.json({id:'x',email_confirmed_at:null})),e=>e.status===401);
  const access=await authorize({headers:{authorization:'Bearer fixture'}},env,async()=>Response.json({id:'alice',email_confirmed_at:'2026-10-22'}));assert.equal(access.user.id,'alice');
  await assert.rejects(exportAccess({...access,read:async()=>[]},'00000000-0000-4000-8000-000000000001'),e=>e.status===403);
});
test('PDF exige una exportación propia antes de renderizar en modo multiusuario',async()=>{
  const body={htmlGzip:gzipSync('<!doctype html><div class="report-content">Test</div>').toString('base64'),exportId:'00000000-0000-4000-8000-000000000001'};
  let renders=0;const request=async url=>Response.json(url.includes('/auth/')?{id:'alice',email_confirmed_at:'2026-10-22'}:[]);
  const handler=Chrome.createHandler({env,request,renderPdf:async()=>{renders++;return Buffer.from('%PDF');}});
  const r=response();await handler({method:'POST',headers:{origin:env.WASH_APP_ORIGIN,authorization:'Bearer fixture'},body},r);
  assert.equal(r.code,403);assert.equal(renders,0);
});
test('Drive bloquea exportaciones ajenas antes de llamar a Google',async()=>{
  const calls=[];const request=async url=>{calls.push(url);if(url.includes('googleapis'))throw Error('No debe llamar a Google');return Response.json(url.includes('/auth/')?{id:'alice',email_confirmed_at:'2026-10-22'}:[]);};
  const r=response();await Drive.createHandler({env,request})({method:'POST',headers:{origin:env.WASH_APP_ORIGIN,authorization:'Bearer fixture'},body:{action:'start',exportId:'00000000-0000-4000-8000-000000000001',facility:'A',jsonBytes:10,pdfBytes:10}},r);
  assert.equal(r.code,403);assert.ok(calls.every(url=>!url.includes('googleapis')));
});
test('reporte de monitoreo escapa HTML y muestra registros sin recalcular puntuaciones',()=>{
  const html=reportHtml({payload:{plan:[],records:[{kind:'monitor',status:'validated',data:{title:'<script>bad</script>',findings:'Mejoró',items:[{indicator_id:'A_1a',change:'Mejoró'}]}}]},dataset:null,facility:{name:'Centro'},country:{name:'Perú'},job:{id:'fixture',created_at:'2026-10-22'}});
  assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));assert.ok(html.includes('Monitoreo'));assert.ok(!html.includes('Medición de indicadores'));
});
