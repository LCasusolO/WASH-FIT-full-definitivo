const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../js/core.js');
const {createHandler} = require('../api/drive-archive.js');
test('country and establishment determine matching names, including accents and legacy locations', () => {
  assert.equal(Core.fileBaseName({countryCode:'PER',facilityName:'Hospital dos de mayo'}),'PER-Hospital_dos_mayo');
  assert.equal(Core.fileBaseName({countryCode:'COL',facilityName:'Clínica internacional'}),'COL-Clinica_internacional');
  assert.equal(Core.fileBaseName({district:'Lima, Perú',facilityName:'Hospital dos de mayo'}),'PER-Hospital_dos_mayo');
  assert.equal(Core.fileBaseName({countryCode:'COL',district:'Perú',facilityName:'Clínica internacional'}),'COL-Clinica_internacional');
  assert.equal(Core.fileBaseName({facilityName:'../../'}),'SIN-Sin_nombre');
});
test('risk ordering keeps unfinished scores last in both directions and filters without changing data', () => {
  const list=[{code:'a',moduleId:'water',severity:10,likelihood:7},{code:'b',moduleId:'water',severity:null,likelihood:7},{code:'c',moduleId:'hygiene',severity:2,likelihood:3},{code:'d',moduleId:'water',severity:5,likelihood:5}];
  assert.deepEqual(Core.filterRisks(list,'','','desc').map(x=>x.code),['a','d','c','b']);
  assert.deepEqual(Core.filterRisks(list,'','','asc').map(x=>x.code),['c','d','a','b']);
  assert.deepEqual(Core.filterRisks(list,'water','high','desc').map(x=>x.code),['a']);
  assert.deepEqual(Core.filterRisks(list,'water','pending','none').map(x=>x.code),['b']);
  assert.deepEqual(list.map(x=>x.code),['a','b','c','d']);
});
test('Drive stores the exact pair name and returns confirmed links and server timestamp', async () => {
  const files=[];const handler=createHandler({env:{GOOGLE_CLIENT_ID:'id',GOOGLE_CLIENT_SECRET:'secret',GOOGLE_REFRESH_TOKEN:'token'},now:()=>1700000000000,request:async(url,options)=>{
    if(url.includes('oauth2'))return Response.json({access_token:'token',expires_in:3600});
    if(url.startsWith('https://www.googleapis.com/drive/v3/files?'))return Response.json({files:[]});
    if(url.includes('/upload/')){files.push(JSON.parse(options.body));return new Response('',{headers:{location:'https://www.googleapis.com/upload/session'+files.length}})}
    const i=url.includes('json-id')?0:1;return Response.json({...files[i],id:i?'pdf-id':'json-id',size:i?'20':'10'});
  }});
  const call=async body=>{const res={setHeader(){},status(code){this.code=code;return this},json(data){this.data=data;return this}};await handler({method:'POST',headers:{origin:'https://wash-fit-full.vercel.app'},body},res);return res};
  const start=await call({action:'start',facility:'Hospital dos de mayo',countryCode:'PER',jsonBytes:10,pdfBytes:20});
  assert.deepEqual(files.map(x=>x.name),['PER-Hospital_dos_mayo.json','PER-Hospital_dos_mayo.pdf']);
  const result=await call({action:'verify',receipt:start.data.receipt,ids:['json-id','pdf-id']});
  assert.equal(result.data.savedAt,'2023-11-14T22:13:20.000Z');
  assert.equal(result.data.files[1].url,'https://drive.google.com/file/d/pdf-id/view');
});
