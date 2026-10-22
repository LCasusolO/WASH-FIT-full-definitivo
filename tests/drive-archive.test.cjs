const test = require('node:test');
const assert = require('node:assert/strict');
const {createHandler} = require('../api/drive-archive.js');
const Archive = require('../js/drive-archive.js');
const Pdf = require('../js/pdf-report.js');
const Core = require('../js/core.js');
const env = {GOOGLE_CLIENT_ID: 'test-client', GOOGLE_CLIENT_SECRET: 'server-only-test-secret', GOOGLE_REFRESH_TOKEN: 'server-only-test-refresh'};
const folder = '1SjIXFiCnnQwTZTTvCqLY6xJYb9sGxb6z';
async function run(handler, body, origin = 'https://wash-fit-full.vercel.app') {
  const result = {headers: {}, setHeader(k,v) {this.headers[k]=v;}, status(code) {this.code=code;return this;}, json(data) {this.data=data;}};
  await handler({method: 'POST', headers: {origin}, body}, result);
  return result;
}
test('missing owner configuration and foreign origins fail before contacting Google', async () => {
  const request = async () => {throw Error('Must not contact Google');};
  assert.equal((await run(createHandler({env: {}, request}), {})).code, 503);
  assert.equal((await run(createHandler({env, request}), {}, 'https://foreign.example')).code, 403);
});

test('repository health checks authorization and folder access without creating files', async () => {
  let writable=true;const calls=[];
  const handler=createHandler({env,request:async(url,options)=>{
    calls.push({url,method:options.method||'GET'});
    if(url.includes('oauth2'))return Response.json({access_token:'private-owner-token',expires_in:3600});
    return Response.json({id:folder,mimeType:'application/vnd.google-apps.folder',capabilities:{canAddChildren:writable}});
  }});
  const healthy=await run(handler,{action:'health'});assert.equal(healthy.code,200);assert.deepEqual(healthy.data,{ready:true});
  assert.equal(calls.filter(x=>x.url.includes('googleapis.com/drive')).length,1);
  assert.equal(calls.find(x=>x.url.includes('googleapis.com/drive')).method,'GET');
  writable=false;assert.equal((await run(handler,{action:'health'})).code,502);
});

test('expired Google authorization returns an actionable error without exposing credentials', async () => {
  let requests=0;
  const handler=createHandler({env,request:async()=>{requests++;return Response.json({error:'invalid_grant'},{status:400});}});
  const result=await run(handler,{action:'health'});
  assert.equal(result.code,502);assert.equal(result.data.code,'GOOGLE_AUTH_REQUIRED');assert.match(result.data.error,/renovar/);
  assert.equal(requests,1);assert.ok(!JSON.stringify(result.data).includes(env.GOOGLE_REFRESH_TOKEN));
});
test('central repository hides owner credentials and verifies both file sizes, batch and folder', async () => {
  const metadata = [];
  let wrongFolder = false;
  const handler = createHandler({env, request: async (url, options) => {
    if (url.includes('oauth2')) return Response.json({access_token:'private-owner-token', expires_in:3600});
    assert.equal(options.headers.Authorization, 'Bearer private-owner-token');
    if (url.startsWith('https://www.googleapis.com/drive/v3/files?')) return Response.json({files:[]});
    if (url.includes('/upload/')) { metadata.push(JSON.parse(options.body)); return new Response('', {headers:{location:'https://www.googleapis.com/upload/session'+metadata.length}}); }
    const index = url.includes('/file-json?') ? 0 : 1;
    return Response.json({...metadata[index], id: index ? 'file-pdf' : 'file-json', size: index ? '20' : '10', parents:[wrongFolder ? 'other-folder' : folder]});
  }});
  const started = await run(handler,{action:'start',facility:'Hospital',jsonBytes:10,pdfBytes:20});
  assert.equal(started.code,200);
  assert.ok(!JSON.stringify(started.data).includes('private-owner-token'));
  assert.ok(!JSON.stringify(started.data).includes(env.GOOGLE_REFRESH_TOKEN));
  assert.equal(metadata[0].appProperties.washFitBatch,metadata[1].appProperties.washFitBatch);
  const body={action:'verify',receipt:started.data.receipt,ids:['file-json','file-pdf']};
  assert.equal((await run(handler,body)).data.saved,true);
  wrongFolder=true;
  assert.equal((await run(handler,body)).code,502);
  assert.equal((await run(handler,{...body,receipt:body.receipt+'tampered'})).code,400);
});
test('interrupted PDF resumes without uploading a second JSON or creating another pair', async () => {
  const job={dataset:{generalInfo:{facilityName:'Hospital'}},json:new Blob(['json']),pdf:new Blob(['pdf'])};
  let starts=0,jsonPuts=0,pdfPuts=0,interrupted=true;
  const request=async (url,options) => {
    assert.equal(url,'/api/drive-archive');
    const body=JSON.parse(options.body);
    if (body.action==='start') {starts++;return Response.json({receipt:'receipt'});}
    if (body.action==='verify') return Response.json({saved:true});
    if (body.action==='status') return Response.json({offset:0});
    if (body.kind==='json') {jsonPuts++;return Response.json({id:'file-json'});}
    pdfPuts++;
    if (interrupted) {interrupted=false;throw Error('Disconnected');}
    return Response.json({id:'file-pdf'});
  };
  await assert.rejects(Archive.save(job,()=>{},request),/Disconnected/);
  assert.equal(job.ids[0],'file-json');
  assert.equal((await Archive.save(job,()=>{},request)).saved,true);
  assert.equal(starts,1);assert.equal(jsonPuts,1);assert.equal(pdfPuts,2);
});
test('server proxies signed upload chunks and recovers a confirmed file after a lost browser response', async () => {
  let uploaded;
  const handler=createHandler({env,request:async(url,options)=>{
    if(url.includes('oauth2'))return Response.json({access_token:'owner-token',expires_in:3600});
    if(url.startsWith('https://www.googleapis.com/drive/v3/files?'))return Response.json({files:[]});
    if(options.method==='POST')return new Response('',{headers:{location:'https://www.googleapis.com/upload/session'}});
    assert.equal(options.headers.Authorization,'Bearer owner-token');
    if(options.headers['Content-Range'].includes('*/'))return uploaded ? Response.json({id:'file-json'}) : new Response('',{status:308});
    assert.equal(options.headers['Content-Range'],'bytes 0-3/4');
    uploaded=options.body.toString();return Response.json({id:'file-json'});
  }});
  const started=await run(handler,{action:'start',facility:'Hospital',jsonBytes:4,pdfBytes:3});
  const common={receipt:started.data.receipt,kind:'json'};
  assert.equal((await run(handler,{...common,action:'status'})).data.offset,0);
  assert.equal((await run(handler,{...common,action:'upload',offset:0,data:Buffer.from('json').toString('base64')})).data.id,'file-json');
  assert.equal(uploaded,'json');
  assert.equal((await run(handler,{...common,action:'status'})).data.id,'file-json');
  assert.equal((await run(handler,{...common,action:'upload',offset:1,data:Buffer.from('json').toString('base64')})).code,400);
});
test('PDF retains six separated steps, excludes hidden indicators and preserves sum scoring',()=>{
  const dataset={savedAt:new Date().toISOString(),generalInfo:Core.defaults(),indicators:[{code:'A_1a',title:'Visible',module:'Agua',moduleId:'water',score:1,severity:3,likelihood:4,history:[]},{code:'HIDDEN',title:'Hidden',score:2}]};
  const doc=Pdf.definition(dataset,['A_1a'],[{id:'water',name:'Agua'}]);
  assert.equal(doc.content.filter(x=>x.style==='heading').length,6);
  assert.equal(doc.content.filter(x=>x.pageBreak==='before').length,5);
  assert.ok(!JSON.stringify(doc).includes('HIDDEN'));
  assert.ok(JSON.stringify(doc).includes('7 - Bajo'));
});

test('repeated exports replace the existing JSON and PDF IDs in the target folder', async () => {
  const stored=new Map(), sessions=new Map();let creates=0,updates=0;
  const handler=createHandler({env,request:async(url,options)=>{
    if(url.includes('oauth2'))return Response.json({access_token:'owner',expires_in:3600});
    if(url.startsWith('https://www.googleapis.com/drive/v3/files?')){
      const q=new URL(url).searchParams.get('q');assert.ok(q.includes("'"+folder+"' in parents"));assert.ok(q.includes('trashed = false'));
      return Response.json({files:[...stored.values()].filter(f=>q.includes("name = '"+f.name+"'")&&q.includes("mimeType = '"+f.mimeType+"'")).map(f=>({id:f.id}))});
    }
    if(url.includes('/upload/drive/')){
      const metadata=JSON.parse(options.body);let id;
      if(options.method==='POST'){id=metadata.name.endsWith('.json')?'file-json':'file-pdf';creates++;stored.set(id,{id,...metadata});}
      else{assert.equal(options.method,'PATCH');id=new URL(url).pathname.split('/').pop();assert.ok(stored.has(id));assert.equal(metadata.parents,undefined);updates++;stored.set(id,{...stored.get(id),...metadata});}
      const session='https://www.googleapis.com/upload/session-'+id;sessions.set(session,{id,bytes:options.headers['X-Upload-Content-Length']});return new Response('',{headers:{location:session}});
    }
    if(sessions.has(url)){const session=sessions.get(url);stored.get(session.id).size=session.bytes;stored.get(session.id).content=options.body.toString();return Response.json({id:session.id});}
    const id=new URL(url).pathname.split('/').pop();return Response.json(stored.get(id));
  }});
  for(const value of ['first','replacement']){
    const start=await run(handler,{action:'start',facility:'Hospital dos de mayo',countryCode:'PER',jsonBytes:value.length,pdfBytes:value.length});assert.equal(start.code,200);
    const ids=[];for(const kind of ['json','pdf']){const uploaded=await run(handler,{action:'upload',receipt:start.data.receipt,kind,offset:0,data:Buffer.from(value).toString('base64')});assert.equal(uploaded.code,200);ids.push(uploaded.data.id);}
    const verified=await run(handler,{action:'verify',receipt:start.data.receipt,ids});assert.equal(verified.data.saved,true);assert.deepEqual(verified.data.files.map(f=>f.id),['file-json','file-pdf']);
  }
  assert.equal(creates,2);assert.equal(updates,2);assert.equal(stored.size,2);assert.ok([...stored.values()].every(file=>file.content==='replacement'));
});

test('failed lookup does not create duplicate files',async()=>{
  let uploads=0;const handler=createHandler({env,request:async(url)=>{
    if(url.includes('oauth2'))return Response.json({access_token:'owner',expires_in:3600});
    if(url.includes('/upload/'))uploads++;
    return Response.json({error:'lookup failed'},{status:503});
  }});
  assert.equal((await run(handler,{action:'start',facility:'Hospital',jsonBytes:4,pdfBytes:4})).code,502);assert.equal(uploads,0);
});

test('archive progress contains no Drive or per-file saving messages',async()=>{
  const progress=[];const job={dataset:{generalInfo:{facilityName:'Hospital'}},json:new Blob(['json']),pdf:new Blob(['pdf'])};
  await Archive.save(job,text=>progress.push(text),async(url,options)=>{const body=JSON.parse(options.body);if(body.action==='start')return Response.json({receipt:'test'});if(body.action==='status')return Response.json({offset:0});if(body.action==='verify')return Response.json({saved:true});return Response.json({id:'file-'+body.kind});});
  assert.ok(progress.length>0);assert.ok(progress.every(text=>!/Drive|Guardando JSON|Guardando PDF/i.test(text)));
});
