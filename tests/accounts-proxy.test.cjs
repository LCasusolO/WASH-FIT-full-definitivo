const test=require('node:test'),assert=require('node:assert/strict');
const {createHandler}=require('../api/accounts');
const env={WASH_MULTIUSER:'true',SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',WASH_APP_ORIGIN:'https://washfit-full.vercel.app'};
const res=()=>({setHeader(){},status(n){this.code=n;return this},json(v){this.body=v;return this}});
test('proxy de cuentas limita método, origen y tamaño sin exponer credenciales administrativas',async()=>{
 let calls=0;const handler=createHandler({env,request:async(url,opts)=>{calls++;assert.equal(url,env.SUPABASE_URL+'/functions/v1/wash-accounts');assert.equal(opts.headers.apikey,env.SUPABASE_PUBLISHABLE_KEY);return Response.json({users:[]});}});
 const method=res();await handler({method:'GET',headers:{}},method);assert.equal(method.code,405);
 const origin=res();await handler({method:'POST',headers:{origin:'https://otro.example'},body:{}},origin);assert.equal(origin.code,403);
 const size=res();await handler({method:'POST',headers:{origin:env.WASH_APP_ORIGIN},body:{value:'a'.repeat(16001)}},size);assert.equal(size.code,400);assert.equal(calls,0);
 const ok=res();await handler({method:'POST',headers:{origin:env.WASH_APP_ORIGIN,authorization:'Bearer user-token'},body:{action:'list'}},ok);assert.equal(ok.code,200);assert.equal(calls,1);
});
