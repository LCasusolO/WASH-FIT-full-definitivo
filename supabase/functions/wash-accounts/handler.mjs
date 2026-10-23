// Módulo compatible con Deno y Node para probar el mismo código que se publica.
export function createHandler({createClient,url,serviceKey,anonKey,request=fetch}){
 const client=()=>createClient(url,anonKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 const rpc=async(action,actor,data={})=>{const r=await admin.rpc('wash_account_service',{p_action:action,p_actor:actor,p_data:data});if(r.error)throw Error(r.error.message);return r.data;};
 const temporaryPassword=()=>{const b=crypto.getRandomValues(new Uint8Array(24)),alphabet='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';return 'Wf!7'+Array.from(b,x=>alphabet[x%alphabet.length]).join('');};
 const hash=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),x=>x.toString(16).padStart(2,'0')).join('');
 const messages={ACCOUNT_DELETED:'Esta cuenta fue eliminada. El propietario debe restaurarla antes de asignarle permisos.',ACCOUNT_NOT_DELETED:'La cuenta no está eliminada.',CANNOT_DELETE_SELF:'No puede eliminar su propia cuenta.',ACCOUNT_NOT_FOUND:'La cuenta ya no existe.',OPERATION_REUSED:'El formulario cambió después de iniciar el alta. Actualice la página y vuelva a completarlo.',LAST_ACTIVE_RESPONSIBLE:'Asigne otro administrador o coordinador activo antes de suspender esta cuenta.',FORBIDDEN:'No tiene permiso para administrar esta cuenta o ámbito.',ACCOUNT_SETUP_REQUIRED:'Complete el cambio de contraseña antes de continuar.',USERNAME_TAKEN:'Ese nombre de usuario ya está en uso o pendiente de creación.',INVALID_ACCOUNT:'Revise nombre, usuario y correo.',LAST_COUNTRY_ADMIN:'Debe quedar al menos un administrador nacional.',LAST_COORDINATOR:'Debe quedar al menos un coordinador responsable.',LAST_EVALUATION_COORDINATOR:'Asigne primero otro coordinador a las evaluaciones abiertas.',CANNOT_LOCK_SELF:'No puede suspender ni restablecer su propia cuenta desde administración.',OWNER_PROTECTED:'La cuenta propietaria está protegida.',SHARED_ACCOUNT_OWNER_REQUIRED:'Esta cuenta tiene accesos compartidos. El propietario debe restablecer su contraseña.',RATE_LIMITED:'Demasiados intentos. Espere 15 minutos.',REGISTRATION_CLOSED:'Las cuentas solo las crea el propietario o un administrador autorizado.'};
 return async req=>{
  const origin=req.headers.get('origin');const allowed='https://washfit-full.vercel.app';
  const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin',...(origin===allowed?{'Access-Control-Allow-Origin':allowed,'Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS'}:{})};
  const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
  if(origin&&origin!==allowed)return reply({error:'Origen no permitido.'},403);
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(req.method!=='POST')return reply({error:'Método no permitido.'},405);
  try{
   const raw=await req.text();if(raw.length>16000)return reply({error:'Solicitud demasiado grande.'},413);
   let body;try{body=JSON.parse(raw);}catch{return reply({error:'Solicitud inválida.'},400);}
   const action=body.action;
   if(['login','recover','send_confirmation'].includes(action)){
    const login=String(body.login||'').trim().toLowerCase();if(!login||login.length>254)return reply({error:'Indique su usuario o correo.'},400);
    await rpc('limit',null,{key:await hash('account:'+login)});
    await rpc('limit',null,{key:await hash('ip:'+(req.headers.get('x-forwarded-for')||'unknown').split(',')[0])});
    const account=await rpc('lookup',null,{login});
    if(action==='recover'){
     if(account?.status==='active'){const r=await client().auth.resetPasswordForEmail(account.email,{redirectTo:allowed+'/plataforma.html'});if(r.error)return reply({error:'No se pudo enviar el correo. Inténtelo más tarde.'},503);}
     return reply({message:'Si la cuenta existe y está activa, recibirá un correo para recuperar su acceso.'});
    }
    if(!account||account.status!=='active')return reply({error:'Usuario o contraseña incorrectos, o cuenta no disponible.'},401);
    if(typeof body.password!=='string'||body.password.length>256)return reply({error:'Indique su contraseña.'},400);
    const auth=client();const signed=await auth.auth.signInWithPassword({email:account.email,password:body.password});
    if(signed.error){
     if(signed.error.code==='email_not_confirmed'){
      if(action==='send_confirmation'){const sent=await auth.auth.resend({type:'signup',email:account.email,options:{emailRedirectTo:allowed+'/plataforma.html'}});if(sent.error)return reply({error:'No se pudo enviar la confirmación. Inténtelo más tarde.'},503);return reply({message:'Revise su correo para confirmar la cuenta y después ingrese con la contraseña temporal.'});}
      return reply({error:'Debe confirmar su correo antes de ingresar. Pulse Enviar confirmación.',code:'EMAIL_CONFIRMATION_REQUIRED'},403);
     }
     return reply({error:'Usuario o contraseña incorrectos, o cuenta no disponible.'},401);
    }
    if(action==='send_confirmation')return reply({message:'El correo ya está confirmado. Puede ingresar.'});
    return reply({session:signed.data.session});
   }
   const token=(req.headers.get('authorization')||'').replace(/^Bearer /,'');if(!token)return reply({error:'Inicie sesión.'},401);
   const checked=await admin.auth.getUser(token);const user=checked.data?.user;if(checked.error||!user?.id||!user.email_confirmed_at)return reply({error:'La sesión venció o falta confirmar el correo.'},401);
   const asUser=createClient(url,anonKey,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:'Bearer '+token}}});
   const status=await asUser.rpc('wash_account_status');if(status.error||!status.data||status.data.status!=='active'||!status.data.session_valid)return reply({error:'La cuenta está suspendida o debe volver a ingresar.'},403);
   if(action==='complete_password'){
    const password=body.new_password;
    if(typeof password!=='string'||password.length<12||password.length>128)return reply({error:'Use entre 12 y 128 caracteres para la nueva contraseña.'},400);
    const updated=await request(url+'/auth/v1/user',{method:'PUT',headers:{apikey:anonKey,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({password})});
    if(!updated.ok){const error=await updated.json();return reply({error:error.code==='same_password'?'La nueva contraseña debe ser diferente de la temporal o anterior.':'No se pudo cambiar la contraseña. Si perdió la sesión, vuelva a ingresar o utilice Recuperar contraseña.'},400);}
    await rpc('rotate_begin',user.id);
    const signed=await client().auth.signInWithPassword({email:user.email,password});if(signed.error||signed.data.user?.id!==user.id)return reply({error:'La contraseña se cambió. Vuelva a ingresar para terminar la activación.'},409);
    await rpc('rotate_complete',user.id);return reply({session:signed.data.session,message:'Contraseña actualizada. Su cuenta está lista.'});
   }
   if(!status.data.ready||!status.data.can_manage)return reply({error:'No tiene permiso para administrar usuarios.'},403);
   if(action==='list'||action==='audit')return reply({[action==='list'?'users':'events']:await rpc(action,user.id)});
   if(action==='create'){
    const data={request_id:body.request_id,username:String(body.username||'').trim().toLowerCase(),name:String(body.name||'').trim(),email:String(body.email||'').trim().toLowerCase(),scope:body.scope,role:body.role,country_id:body.country_id||null,team_id:body.team_id||null};
    if(!['country','team'].includes(data.scope)||!(data.scope==='country'?['admin','reader']:['coordinator','evaluator','reader']).includes(data.role)||!/^[a-f0-9-]{36}$/i.test(data.request_id||'')||!/^([a-z0-9][a-z0-9._-]{2,59})$/.test(data.username)||!data.name||data.name.length>300||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))return reply({error:'Revise nombre, usuario, correo y ámbito.'},400);
    const reserved=await rpc('reserve',user.id,data);if(reserved.complete)return reply({message:'La operación ya fue completada. La contraseña se mostró una sola vez. Puede generar otra temporal desde Usuarios y permisos.'});
    let target=reserved.existing_id,password=null,created=false;
    if(!target){
     password=temporaryPassword();const result=await admin.auth.admin.createUser({email:data.email,password,email_confirm:false,app_metadata:{wash_managed:true,account_operation:data.request_id}});
     if(result.error){
      const prior=await rpc('lookup',null,{login:data.email});
      if(!prior||prior.account_operation!==data.request_id){await rpc('cancel_reservation',user.id,{request_id:data.request_id});throw Error('No se pudo crear la cuenta. Revise los datos y reintente el mismo formulario.');}
      target=prior.id;password=null;
     }else target=result.data.user.id;
     created=true;
    }
    const provisioned=await rpc('provision',user.id,{request_id:data.request_id,user_id:target});
    return reply({username:provisioned.username,temporary_password:password,reused:!created,needs_reset:created&&!password,message:!created?'Se asignaron los permisos a la cuenta existente. Se conservó su contraseña.':'Cuenta creada. Entregue estas credenciales al usuario. Debe confirmar su correo y cambiar la contraseña temporal.'});
   }
   if(action==='reset_password'){
    await rpc('reset_begin',user.id,{user_id:body.user_id});const password=temporaryPassword();
    const result=await admin.auth.admin.updateUserById(body.user_id,{password});if(result.error)return reply({error:'La cuenta quedó protegida y requiere restablecimiento. Reintente para generar una contraseña temporal.'},503);
    return reply({temporary_password:password,message:'Contraseña temporal generada. Las sesiones anteriores ya no tienen acceso.'});
   }
   if(['set_role','suspend','reactivate','rename','delete','restore'].includes(action)){
    const data={user_id:body.user_id,scope:body.scope,role:body.role,country_id:body.country_id||null,team_id:body.team_id||null,username:body.username,name:body.name};
    await rpc(action,user.id,data);return reply({message:action==='delete'?'Cuenta eliminada: acceso bloqueado y permisos retirados. El historial se conserva. Puede restaurarla desde Cuentas eliminadas.':action==='restore'?'Cuenta restaurada sin permisos. Genere otra contraseña temporal y asigne los accesos necesarios.':'Cambio guardado. Los permisos se vuelven a comprobar en cada operación.'});
   }
   return reply({error:'Operación no permitida.'},400);
  }catch(error){const message=String(error?.message||'');return reply({error:messages[message]||(message.includes('unique')?'Ese usuario ya está en uso.':'No se pudo completar la operación. Revise los datos y reintente.'),code:Object.hasOwn(messages,message)?message:undefined},message==='RATE_LIMITED'?429:message==='FORBIDDEN'?403:400);}
 };
}
