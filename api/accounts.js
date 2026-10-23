function createHandler({env=process.env,request=fetch}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'Método no permitido.'});
  if(env.WASH_MULTIUSER!=='true'||!env.SUPABASE_URL||!env.SUPABASE_PUBLISHABLE_KEY)return res.status(503).json({error:'La administración de cuentas no está configurada.'});
  const origins=[env.WASH_APP_ORIGIN];
  if(env.VERCEL_ENV==='preview')for(const host of [env.VERCEL_URL,env.VERCEL_BRANCH_URL])if(/^[a-z0-9.-]+\.vercel\.app$/.test(host||''))origins.push('https://'+host);
  if(!origins.filter(Boolean).includes(req.headers.origin))return res.status(403).json({error:'Origen no permitido.'});
  let body=req.body;
  try{if(typeof body==='string')body=JSON.parse(body);if(!body||JSON.stringify(body).length>16000)throw Error();}catch{return res.status(400).json({error:'Solicitud inválida.'});}
  try{
   const response=await request(env.SUPABASE_URL+'/functions/v1/wash-accounts',{method:'POST',headers:{'Content-Type':'application/json',apikey:env.SUPABASE_PUBLISHABLE_KEY,...(req.headers.authorization?{Authorization:req.headers.authorization}:{}),'x-forwarded-for':req.headers['x-real-ip']||req.headers['x-forwarded-for']||'unknown'},body:JSON.stringify(body),signal:AbortSignal.timeout(25000)});
   return res.status(response.status).json(await response.json());
  }catch{return res.status(503).json({error:'El servicio de cuentas no está disponible. Inténtelo más tarde.'});}
 };
}
module.exports=createHandler();module.exports.createHandler=createHandler;
